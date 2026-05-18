
-- Seed paid plans
INSERT INTO public.plan_limits (plan, max_projects, max_users, max_storage_mb, max_ai_tokens_month, features)
VALUES
  ('pro', 25, 5, 5000, 200000, '["all_diagrams","ai_assistant","rag","versioning","export_pdf","export_dwg","priority_support"]'),
  ('premium', 9999, 50, 50000, 9999999, '["all_diagrams","ai_unlimited","rag","versioning","export_all","sla","white_label","custom_integrations"]')
ON CONFLICT (plan) DO UPDATE SET
  max_projects = EXCLUDED.max_projects,
  max_users = EXCLUDED.max_users,
  max_storage_mb = EXCLUDED.max_storage_mb,
  max_ai_tokens_month = EXCLUDED.max_ai_tokens_month,
  features = EXCLUDED.features;

-- RLS: tenant admins can SELECT their subscriptions/invoices
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant admins read subscriptions" ON public.subscriptions;
CREATE POLICY "tenant admins read subscriptions"
ON public.subscriptions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.tenant_id = subscriptions.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('admin','owner')
));

DROP POLICY IF EXISTS "tenant admins read invoices" ON public.invoices;
CREATE POLICY "tenant admins read invoices"
ON public.invoices FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.tenant_id = invoices.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('admin','owner')
));

-- Manual plan change (admin override / dev). Real changes go through webhooks.
CREATE OR REPLACE FUNCTION public.change_tenant_plan(p_plan text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_old_plan text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_plan NOT IN ('free','pro','premium') THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id AND user_id = auth.uid() AND role IN ('admin','owner')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT plan INTO v_old_plan FROM public.tenants WHERE id = v_tenant_id;
  UPDATE public.tenants SET plan = p_plan, updated_at = now() WHERE id = v_tenant_id;

  INSERT INTO public.subscription_audit_log (user_id, action, old_plan_type, new_plan_type, reason)
  VALUES (auth.uid(), 'manual_change', v_old_plan::plan_type, p_plan::plan_type, 'admin_dashboard');

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'plan', p_plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_tenant_plan(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_tenant_plan(text) TO authenticated;
