-- Remove o desvio de privilégio por e-mail fixo do bootstrap de tenant.
--
-- A versão aplicada de bootstrap_personal_tenant_if_missing() promovia um
-- e-mail específico a plano premium, papel admin e platform_admins a cada
-- login. Identidade hardcoded é escalonamento de privilégio (ver RISK-002).
-- Esta migration recria a função SEM o desvio. Admins existentes em
-- public.platform_admins NÃO são removidos (acesso legítimo preservado);
-- novos admins devem ser concedidos por procedimento auditado.

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
    'free',
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
      role = 'owner',
      updated_at = now()
  WHERE id = v_user_id;

  -- 10. Retornar exatamente o UUID do tenant ativo
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO service_role;

NOTIFY pgrst, 'reload schema';
