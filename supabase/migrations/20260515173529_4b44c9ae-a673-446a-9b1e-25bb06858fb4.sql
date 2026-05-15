
-- 1) Lock change_tenant_plan to platform admins
CREATE OR REPLACE FUNCTION public.change_tenant_plan(p_plan text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_old_plan text;
  v_old_enum public.subscription_plan;
  v_new_enum public.subscription_plan;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_plan NOT IN ('free','basic','pro','premium') THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;

  SELECT plan INTO v_old_plan FROM public.tenants WHERE id = v_tenant_id;
  v_old_enum := (CASE lower(coalesce(v_old_plan,'free'))
                   WHEN 'pro' THEN 'PRO'
                   WHEN 'premium' THEN 'INDUSTRIAL'
                   WHEN 'basic' THEN 'PRO'
                   ELSE 'FREE'
                 END)::public.subscription_plan;
  v_new_enum := (CASE p_plan
                   WHEN 'pro' THEN 'PRO'
                   WHEN 'premium' THEN 'INDUSTRIAL'
                   WHEN 'basic' THEN 'PRO'
                   ELSE 'FREE'
                 END)::public.subscription_plan;

  UPDATE public.tenants SET plan = p_plan, updated_at = now() WHERE id = v_tenant_id;

  INSERT INTO public.subscription_audit_log (user_id, action, old_plan_type, new_plan_type, reason)
  VALUES (auth.uid(), 'manual_change', v_old_enum, v_new_enum, 'platform_admin_override');

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'plan', p_plan);
END $$;

REVOKE ALL ON FUNCTION public.change_tenant_plan(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.change_tenant_plan(text) TO authenticated;

-- 2) Tighten api_keys INSERT to caller's tenant
DROP POLICY IF EXISTS "Users can create their own API keys" ON public.api_keys;
CREATE POLICY "Users can create their own API keys"
  ON public.api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.get_user_tenant_id()
  );

-- 3) Fix search_path on touch_project_bom_items
CREATE OR REPLACE FUNCTION public.touch_project_bom_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 4) Revoke anon execute on generate_bom_from_canvas (already SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.generate_bom_from_canvas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_bom_from_canvas(uuid) TO authenticated;
