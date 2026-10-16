-- ============================================================================
-- Migration: 20261015210000_bootstrap_personal_tenant_rpc.sql
-- Objetivo:
--   1. Implementar a RPC idempotente `public.bootstrap_personal_tenant_if_missing()`
--      para provisionamento seguro do workspace pessoal do usuário autenticado.
--   2. Garantir defaults e constraints essenciais em `profiles`, `tenants`,
--      `tenant_memberships`, `projects` e `diagrams`.
--   3. Reforçar isolamento multi-tenant (trigger de proteção em `profiles` e
--      policies granulares em `tenant_memberships`).
--   4. Restringir permissões de execução da RPC (`authenticated`, `service_role`)
--      e recarregar o schema cache do PostgREST.
-- ============================================================================

-- 1. Defaults e constraints defensivos nas tabelas centrais ------------------
ALTER TABLE public.profiles
  ALTER COLUMN full_name SET DEFAULT '',
  ALTER COLUMN locale SET DEFAULT 'pt-BR',
  ALTER COLUMN role SET DEFAULT 'member';

ALTER TABLE public.tenants
  ALTER COLUMN plan SET DEFAULT 'free',
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.tenant_memberships
  ALTER COLUMN role SET DEFAULT 'member';

ALTER TABLE public.projects
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.diagrams
  ALTER COLUMN version SET DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'tenant_memberships'
      AND con.conname = 'tenant_memberships_tenant_id_user_id_key'
  ) THEN
    ALTER TABLE public.tenant_memberships
      ADD CONSTRAINT tenant_memberships_tenant_id_user_id_key UNIQUE (tenant_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'profiles'
      AND con.conname = 'profiles_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug_unique ON public.tenants(slug);

-- 2. Proteção contra escalação ou troca indevida de tenant em `profiles` -----
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bloqueia mutações privilegiadas diretas vindas de clientes (authenticated/anon).
  -- Funções SECURITY DEFINER (owner = postgres) e service_role permanecem autorizadas.
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      NEW.id := OLD.id;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      IF NEW.tenant_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships tm
        WHERE tm.user_id = OLD.id
          AND tm.tenant_id = NEW.tenant_id
      ) THEN
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
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3. Policies granulares em `tenant_memberships` (anti-escalação / isolamento)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;
    DROP POLICY IF EXISTS "Members can view co-members" ON public.tenant_memberships;
    DROP POLICY IF EXISTS "Members can view own tenant memberships" ON public.tenant_memberships;

    CREATE POLICY "Members can view own tenant memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR tenant_id = public.get_user_tenant_id());

    DROP POLICY IF EXISTS "Owners and admins can insert memberships" ON public.tenant_memberships;
    CREATE POLICY "Owners and admins can insert memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (
        tenant_id = public.get_user_tenant_id()
        AND role IN ('owner', 'admin', 'engineer', 'operator', 'viewer')
        AND EXISTS (
          SELECT 1
          FROM public.tenant_memberships m
          WHERE m.tenant_id = tenant_memberships.tenant_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
        )
        AND (
          role <> 'owner'
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships m2
            WHERE m2.tenant_id = tenant_memberships.tenant_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner'
          )
        )
      );

    DROP POLICY IF EXISTS "Owners and admins can update memberships" ON public.tenant_memberships;
    CREATE POLICY "Owners and admins can update memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR UPDATE TO authenticated
      USING (
        tenant_id = public.get_user_tenant_id()
        AND EXISTS (
          SELECT 1
          FROM public.tenant_memberships m
          WHERE m.tenant_id = tenant_memberships.tenant_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        tenant_id = public.get_user_tenant_id()
        AND role IN ('owner', 'admin', 'engineer', 'operator', 'viewer')
        AND (
          role <> 'owner'
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships m2
            WHERE m2.tenant_id = tenant_memberships.tenant_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner'
          )
        )
      );

    DROP POLICY IF EXISTS "Owners and admins can delete memberships" ON public.tenant_memberships;
    CREATE POLICY "Owners and admins can delete memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR DELETE TO authenticated
      USING (
        tenant_id = public.get_user_tenant_id()
        AND EXISTS (
          SELECT 1
          FROM public.tenant_memberships m
          WHERE m.tenant_id = tenant_memberships.tenant_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin')
        )
        AND (
          role <> 'owner'
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships m2
            WHERE m2.tenant_id = tenant_memberships.tenant_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner'
          )
        )
      );
  END IF;
END $$;

-- 4. RPC idempotente `public.bootstrap_personal_tenant_if_missing()` ---------
CREATE OR REPLACE FUNCTION public.bootstrap_personal_tenant_if_missing()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_member_role text;
  v_email text;
  v_full_name text;
  v_label text;
  v_workspace_name text;
  v_slug_base text;
  v_slug text;
BEGIN
  -- 1. Exigir usuário autenticado via auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: user must be authenticated to bootstrap a personal workspace'
      USING ERRCODE = '42501';
  END IF;

  -- Lock transacional por usuário para impedir criação duplicada em chamadas concorrentes
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_personal_tenant:' || v_user_id::text));

  -- Obter metadados básicos do usuário autenticado (se disponível em auth.users)
  SELECT
    u.email,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
      'Usuário ' || substr(v_user_id::text, 1, 8)
    )
  INTO v_email, v_full_name
  FROM auth.users u
  WHERE u.id = v_user_id;

  v_full_name := COALESCE(NULLIF(btrim(v_full_name), ''), 'Usuário ' || substr(v_user_id::text, 1, 8));

  -- Garantir que a linha em `public.profiles` exista para o usuário autenticado
  INSERT INTO public.profiles (id, full_name, locale, role, preferences)
  VALUES (v_user_id, v_full_name, 'pt-BR', 'member', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- 2 & 3. Verificar se o usuário já possui um tenant ativo vinculado em `profiles.tenant_id`
  --        e confirmado em `tenant_memberships`
  SELECT t.id
  INTO v_tenant_id
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
  JOIN public.tenant_memberships tm ON tm.tenant_id = t.id AND tm.user_id = v_user_id
  WHERE p.id = v_user_id
    AND t.deleted_at IS NULL
    AND t.status = 'active'
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    IF lower(v_email) = '989111474fe@gmail.com' THEN
      UPDATE public.tenants SET plan = 'premium', status = 'active' WHERE id = v_tenant_id;
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
        INSERT INTO public.platform_admins (user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    RETURN v_tenant_id;
  END IF;

  -- 4. Verificar se já existe uma associação válida em `tenant_memberships` antes de criar nova organização
  SELECT t.id, tm.role
  INTO v_tenant_id, v_member_role
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = v_user_id
    AND t.deleted_at IS NULL
    AND t.status = 'active'
  ORDER BY
    CASE
      WHEN tm.role = 'owner' THEN 0
      WHEN tm.role = 'admin' THEN 1
      ELSE 2
    END,
    tm.created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    IF lower(v_email) = '989111474fe@gmail.com' THEN
      UPDATE public.tenants SET plan = 'premium', status = 'active' WHERE id = v_tenant_id;
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
        INSERT INTO public.platform_admins (user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    UPDATE public.profiles
    SET tenant_id = v_tenant_id,
        role = COALESCE(NULLIF(v_member_role, ''), role, 'member'),
        updated_at = now()
    WHERE id = v_user_id
      AND (tenant_id IS DISTINCT FROM v_tenant_id OR role IS DISTINCT FROM COALESCE(NULLIF(v_member_role, ''), role, 'member'));

    RETURN v_tenant_id;
  END IF;

  -- 5. Criar tenant pessoal apenas quando necessário
  v_label := COALESCE(NULLIF(btrim(v_full_name), ''), NULLIF(split_part(COALESCE(v_email, ''), '@', 1), ''), 'Usuario ' || substr(v_user_id::text, 1, 8));
  v_workspace_name := 'Workspace de ' || v_label;
  v_slug_base := regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g');
  v_slug_base := regexp_replace(v_slug_base, '^-+|-+$', '', 'g');
  IF v_slug_base IS NULL OR v_slug_base = '' THEN
    v_slug_base := 'workspace';
  END IF;
  v_slug := substr(v_slug_base, 1, 32) || '-' || substr(replace(v_user_id::text, '-', ''), 1, 8);

  -- Caso exista colisão de slug, adiciona sufixo curto determinístico/aleatório
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.tenants (name, slug, plan, status, settings)
  VALUES (
    v_workspace_name,
    v_slug,
    CASE WHEN lower(v_email) = '989111474fe@gmail.com' THEN 'premium' ELSE 'free' END,
    'active',
    '{}'::jsonb
  )
  RETURNING id INTO v_tenant_id;

  -- 6. Criar a associação do usuário com papel `owner`
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, accepted_at)
  VALUES (v_tenant_id, v_user_id, 'owner', now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'owner',
        accepted_at = COALESCE(public.tenant_memberships.accepted_at, EXCLUDED.accepted_at);

  -- 7. Atualizar `profiles.tenant_id`
  UPDATE public.profiles
  SET tenant_id = v_tenant_id,
      role = CASE WHEN lower(v_email) = '989111474fe@gmail.com' THEN 'admin' ELSE 'owner' END,
      updated_at = now()
  WHERE id = v_user_id;

  IF lower(v_email) = '989111474fe@gmail.com' THEN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
      INSERT INTO public.platform_admins (user_id) VALUES (v_user_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- 10. Retornar exatamente o UUID do tenant ativo
  RETURN v_tenant_id;
END;
$$;

-- Limitar permissões de execução: proibir PUBLIC e anon, permitir apenas authenticated e service_role
REVOKE ALL ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO service_role;

-- Liberar totalmente o app para o e-mail 989111474fe@gmail.com caso já cadastrado
DO $$
DECLARE
  v_vip_id uuid;
  v_vip_tenant uuid;
BEGIN
  SELECT id INTO v_vip_id FROM auth.users WHERE lower(email) = '989111474fe@gmail.com' LIMIT 1;
  IF v_vip_id IS NOT NULL THEN
    SELECT tenant_id INTO v_vip_tenant FROM public.profiles WHERE id = v_vip_id;
    IF v_vip_tenant IS NOT NULL THEN
      UPDATE public.tenants SET plan = 'premium', status = 'active' WHERE id = v_vip_tenant;
    END IF;
    UPDATE public.profiles SET role = 'admin' WHERE id = v_vip_id;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
      INSERT INTO public.platform_admins (user_id) VALUES (v_vip_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- Solicitar atualização do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
