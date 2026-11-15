-- ============================================================================
-- Migration: 20261115120000_fix_p0_tenant_isolation.sql
-- Auditoria forense — P0-DB-005 (isolamento multi-tenant quebrado)
--
-- Problema reproduzido em Supabase local (docs/audit/08 §5):
--   1. prevent_profile_privilege_escalation() foi redefinida como SECURITY
--      DEFINER (20261015210000). Dentro dela current_user = dono (postgres), então
--      o teste `current_user IN ('authenticated','anon')` nunca era verdadeiro
--      e o trigger não bloqueava a troca de tenant_id.
--   2. O trigger cobria só UPDATE; a policy de INSERT em profiles não
--      restringia tenant_id.
--   3. get_user_tenant_id() devolvia profiles.tenant_id sem confirmar membership.
--
-- Correção:
--   a) Helper SECURITY DEFINER is_tenant_member(user, tenant) para consultas de
--      membership independentes da RLS.
--   b) Trigger SECURITY INVOKER, BEFORE INSERT OR UPDATE, decidindo pela role
--      efetiva da requisição (current_user em INVOKER = authenticated/anon).
--   c) get_user_tenant_id() só devolve tenant com membership confirmada.
--   d) Policy de INSERT em profiles exige tenant_id nulo ou com membership.
-- Idempotente.
-- ============================================================================

-- a) Helper de membership ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_user_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL
     AND p_tenant_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.tenant_memberships tm
       WHERE tm.user_id = p_user_id
         AND tm.tenant_id = p_tenant_id
     );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated, service_role;

-- b) Trigger de proteção de profiles (SECURITY INVOKER) ------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Em SECURITY INVOKER, current_user é a role efetiva da requisição.
  -- Funções SECURITY DEFINER (owner postgres), service_role e migrations
  -- continuam autorizadas a alterar tenant_id/role.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'member';
      IF NEW.tenant_id IS NOT NULL
         AND NOT public.is_tenant_member(NEW.id, NEW.tenant_id) THEN
        NEW.tenant_id := NULL;
      END IF;
    ELSE
      IF NEW.id IS DISTINCT FROM OLD.id THEN
        NEW.id := OLD.id;
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        NEW.role := OLD.role;
      END IF;
      IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
         AND (NEW.tenant_id IS NULL OR NOT public.is_tenant_member(OLD.id, NEW.tenant_id)) THEN
        NEW.tenant_id := OLD.tenant_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- c) get_user_tenant_id() exige membership --------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
BEGIN
  SELECT p.tenant_id INTO tid
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = p.id AND tm.tenant_id = p.tenant_id
    );
  IF tid IS NOT NULL THEN
    RETURN tid;
  END IF;

  SELECT tm.tenant_id INTO tid
  FROM public.tenant_memberships tm
  WHERE tm.user_id = auth.uid()
  ORDER BY tm.created_at ASC NULLS LAST
  LIMIT 1;
  RETURN tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated;

-- d) Policy de INSERT em profiles ------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (tenant_id IS NULL OR public.is_tenant_member(auth.uid(), tenant_id))
  );

NOTIFY pgrst, 'reload schema';
