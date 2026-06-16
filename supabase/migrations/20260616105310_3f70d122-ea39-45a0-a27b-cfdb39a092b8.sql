
DROP POLICY IF EXISTS "Admins can manage invites" ON public.invites;
CREATE POLICY "Admins can insert invites" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
CREATE POLICY "Admins can update invites" ON public.invites
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin')
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
CREATE POLICY "Admins can delete invites" ON public.invites
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
CREATE POLICY "Admins can list invite metadata" ON public.invites
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin');
REVOKE SELECT (token) ON public.invites FROM authenticated;
REVOKE SELECT (token) ON public.invites FROM anon;
GRANT SELECT (id, tenant_id, email, role, expires_at, accepted_at, created_at, invited_name, invited_sector)
  ON public.invites TO authenticated;

REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants FROM anon;
GRANT SELECT (id, name, slug, plan, settings, created_at, updated_at, subscription_status, status, deleted_at)
  ON public.tenants TO authenticated;

DROP POLICY IF EXISTS "Admins can manage blog categories" ON public.blog_categories;
CREATE POLICY "Platform admins can manage blog categories" ON public.blog_categories
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "members can update tenant settings" ON public.tenant_settings;
DROP POLICY IF EXISTS "members can upsert tenant settings" ON public.tenant_settings;
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
CREATE POLICY "admins can insert tenant settings" ON public.tenant_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships tm
                      WHERE tm.tenant_id = tenant_settings.tenant_id
                        AND tm.user_id = auth.uid()
                        AND tm.role = ANY (ARRAY['owner','admin'])));

CREATE POLICY "Block client writes on iot_readings" ON public.iot_readings
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);
