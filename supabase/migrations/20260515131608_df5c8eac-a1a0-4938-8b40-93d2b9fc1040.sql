-- =====================================================================
-- Hardening de segurança (RLS, privilégios e proteção de escalação)
-- Migration idempotente: pode ser reaplicada sem erro.
-- =====================================================================

-- 1. Impede escalação de role/tenant em profiles ----------------------
-- SECURITY INVOKER (padrão): a função só compara NEW e OLD, não precisa
-- de privilégios elevados. A proteção vale apenas para as roles de
-- cliente (authenticated/anon); service_role, postgres e migrations
-- continuam podendo alterar esses campos.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := OLD.role;
    NEW.tenant_id := OLD.tenant_id;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;
    CREATE TRIGGER profiles_prevent_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
  END IF;
END $$;

-- 2. Remove auto-atualização do usuário em user_subscriptions ---------
DO $$
BEGIN
  IF to_regclass('public.user_subscriptions') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_subscriptions_update_own ON public.user_subscriptions;
  END IF;
END $$;

-- 3. comments: SELECT somente do autor --------------------------------
-- ATENÇÃO: se outros usuários precisarem ver comentários (por projeto
-- ou tenant), esta policy precisa ser ampliada.
DO $$
BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
    DROP POLICY IF EXISTS "Users can view their own comments" ON public.comments;
    CREATE POLICY "Users can view their own comments"
    ON public.comments
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- 4. plant_telemetry: nega todo acesso de cliente ---------------------
-- service_role ignora RLS, então o backend continua funcionando.
DO $$
BEGIN
  IF to_regclass('public.plant_telemetry') IS NOT NULL THEN
    ALTER TABLE public.plant_telemetry ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "plant_telemetry_no_client_access" ON public.plant_telemetry;
    CREATE POLICY "plant_telemetry_no_client_access"
    ON public.plant_telemetry
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;

-- 5. tag_samples: RLS nas partições -----------------------------------
-- Função reutilizável: aplica RLS + policy em UMA partição.
-- Chame-a dentro de create_monthly_tag_samples_partition(date) para que
-- partições futuras já nasçam protegidas.
CREATE OR REPLACE FUNCTION public.apply_tag_samples_partition_rls(partition_table regclass)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  partition_name text;
  policy_name text;
BEGIN
  SELECT c.relname INTO partition_name
  FROM pg_class c
  WHERE c.oid = partition_table;

  policy_name := partition_name || '_select_members';

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', partition_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_name, partition_table);
  EXECUTE format(
    $p$
      CREATE POLICY %1$I ON %2$s
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1
        FROM public.projects pr
        WHERE pr.id = %2$s.project_id
          AND (
            pr.created_by = (SELECT auth.uid())
            OR EXISTS (
              SELECT 1
              FROM public.tenant_memberships tm
              WHERE tm.tenant_id = pr.tenant_id
                AND tm.user_id = (SELECT auth.uid())
            )
          )
      ))
    $p$,
    policy_name,
    partition_table
  );
END;
$$;

DO $$
DECLARE
  partition_oid oid;
BEGIN
  IF to_regclass('public.tag_samples') IS NOT NULL THEN
    FOR partition_oid IN
      SELECT i.inhrelid
      FROM pg_inherits i
      WHERE i.inhparent = 'public.tag_samples'::regclass
    LOOP
      PERFORM public.apply_tag_samples_partition_rls(partition_oid::regclass);
    END LOOP;
  END IF;
END $$;

-- 6. Revoga EXECUTE de funções internas -------------------------------
-- Ignora funções inexistentes (ambientes com migrations divergentes).
DO $$
DECLARE
  function_signature text;
  function_signatures constant text[] := ARRAY[
    'public.prevent_profile_privilege_escalation()',
    'public.apply_tag_samples_partition_rls(regclass)',
    'public.handle_new_user()',
    'public.update_updated_at()',
    'public.update_platform_admins_updated_at()',
    'public.update_user_subscriptions_updated_at()',
    'public.touch_simulation_tag_updated_at()',
    'public.create_monthly_tag_samples_partition(date)'
  ];
BEGIN
  FOREACH function_signature IN ARRAY function_signatures LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated, anon',
        function_signature
      );
    ELSE
      RAISE NOTICE 'Função % não existe; REVOKE ignorado.', function_signature;
    END IF;
  END LOOP;
END $$;