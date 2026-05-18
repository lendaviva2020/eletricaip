
CREATE OR REPLACE FUNCTION public.change_tenant_plan(p_plan text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_old_plan text;
  v_old_enum public.subscription_plan;
  v_new_enum public.subscription_plan;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_plan NOT IN ('free','basic','pro','premium') THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id AND user_id = auth.uid() AND role IN ('admin','owner')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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
  VALUES (auth.uid(), 'manual_change', v_old_enum, v_new_enum, 'admin_dashboard');

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'plan', p_plan);
END; $$;
