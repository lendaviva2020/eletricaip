-- Idempotente: cada bloco pula se as tabelas/colunas/funções ainda não existirem
-- (DDL central e helpers get_user_* vivem fora do repo).
DO $$
DECLARE
  helpers_exist boolean :=
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'get_user_role');
BEGIN
  -- invites
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites')
     AND helpers_exist
     AND (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'invites'
            AND column_name IN ('id','tenant_id','email','role','expires_at','accepted_at',
                                'created_at','invited_name','invited_sector','token')) = 10 THEN
    DROP POLICY IF EXISTS "Admins can manage invites" ON public.invites;
    EXECUTE $pol$
      CREATE POLICY "Admins can insert invites" ON public.invites
        FOR INSERT TO authenticated
        WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "Admins can update invites" ON public.invites
        FOR UPDATE TO authenticated
        USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin')
        WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "Admins can delete invites" ON public.invites
        FOR DELETE TO authenticated
        USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "Admins can list invite metadata" ON public.invites
        FOR SELECT TO authenticated
        USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
    $pol$;
    EXECUTE 'REVOKE SELECT (token) ON public.invites FROM authenticated';
    EXECUTE 'REVOKE SELECT (token) ON public.invites FROM anon';
    EXECUTE 'GRANT SELECT (id, tenant_id, email, role, expires_at, accepted_at, created_at, invited_name, invited_sector) ON public.invites TO authenticated';
  END IF;

  -- tenants (colunas Stripe + colunas públicas)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tenants'
            AND column_name IN ('stripe_customer_id', 'stripe_subscription_id')) = 2
     AND (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tenants'
            AND column_name IN ('id','name','slug','plan','settings','created_at','updated_at',
                                'subscription_status','status','deleted_at')) = 10 THEN
    EXECUTE 'REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants FROM authenticated';
    EXECUTE 'REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants FROM anon';
    EXECUTE 'GRANT SELECT (id, name, slug, plan, settings, created_at, updated_at, subscription_status, status, deleted_at) ON public.tenants TO authenticated';
  END IF;

  -- blog_categories
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_categories')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "Admins can manage blog categories" ON public.blog_categories;
    EXECUTE $pol$
      CREATE POLICY "Platform admins can manage blog categories" ON public.blog_categories
        FOR ALL TO authenticated
        USING (public.is_platform_admin())
        WITH CHECK (public.is_platform_admin());
    $pol$;
  END IF;

  -- tenant_settings (tabela criada em 20260608023607; corpo usa tenant_memberships)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_settings')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "members can update tenant settings" ON public.tenant_settings;
    DROP POLICY IF EXISTS "members can upsert tenant settings" ON public.tenant_settings;
    EXECUTE $pol$
      CREATE POLICY "admins can update tenant settings" ON public.tenant_settings
        FOR UPDATE TO authenticated
        USING (EXISTS (SELECT 1 FROM public.tenant_memberships tm
                       WHERE tm.tenant_id = tenant_settings.tenant_id
                         AND tm.user_id = auth.uid()
                         AND tm.role = ANY (ARRAY['owner','admin'])))
        WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships tm
                            WHERE tm.tenant_id = tenant_settings.tenant_id
                              AND tm.user_id = auth.uid()
                              AND tm.role = ANY (ARRAY['owner','admin'])));
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "admins can insert tenant settings" ON public.tenant_settings
        FOR INSERT TO authenticated
        WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships tm
                            WHERE tm.tenant_id = tenant_settings.tenant_id
                              AND tm.user_id = auth.uid()
                              AND tm.role = ANY (ARRAY['owner','admin'])));
    $pol$;
  END IF;

  -- iot_readings: bloqueio RESTRICTIVE de escrita direta por clientes
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_readings') THEN
    DROP POLICY IF EXISTS "Block client writes on iot_readings" ON public.iot_readings;
    EXECUTE $pol$
      CREATE POLICY "Block client writes on iot_readings" ON public.iot_readings
        AS RESTRICTIVE FOR ALL TO authenticated, anon
        USING (false) WITH CHECK (false);
    $pol$;
  END IF;
END $$;
