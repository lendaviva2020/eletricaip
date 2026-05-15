
INSERT INTO public.plan_limits (plan, max_projects, max_users, max_storage_mb, max_ai_tokens_month, features) VALUES
  ('free',    3,     1,  100,   10,        '["basic_diagrams","pdf_export","community_support"]'::jsonb),
  ('basic',   10,    3,  1000,  100,       '["standard_ai","pdf_export","email_support"]'::jsonb),
  ('pro',     -1,    10, 10000, 250,       '["advanced_ai","digital_twin","realtime","opcua","modbus","priority_support"]'::jsonb),
  ('premium', -1,    -1, -1,    -1,        '["all_features","dedicated_capacity","sla","custom_integrations"]'::jsonb)
ON CONFLICT (plan) DO UPDATE SET
  max_projects = EXCLUDED.max_projects,
  max_users = EXCLUDED.max_users,
  max_storage_mb = EXCLUDED.max_storage_mb,
  max_ai_tokens_month = EXCLUDED.max_ai_tokens_month,
  features = EXCLUDED.features;

CREATE TABLE IF NOT EXISTS public.ai_credit_costs (
  operation text PRIMARY KEY,
  credits integer NOT NULL CHECK (credits > 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_credit_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_credit_costs read for authenticated" ON public.ai_credit_costs;
CREATE POLICY "ai_credit_costs read for authenticated"
  ON public.ai_credit_costs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ai_credit_costs admin write" ON public.ai_credit_costs;
CREATE POLICY "ai_credit_costs admin write"
  ON public.ai_credit_costs FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

INSERT INTO public.ai_credit_costs (operation, credits, description) VALUES
  ('generate_single_line',  1,  'Geração de diagrama unifilar'),
  ('generate_panel',        5,  'Geração de painel elétrico completo'),
  ('generate_digital_twin', 10, 'Geração de digital twin'),
  ('analyze_safety',        3,  'Análise de segurança / NR-10 / NR-12'),
  ('suggest_optimization',  2,  'Sugestões de otimização')
ON CONFLICT (operation) DO UPDATE SET
  credits = EXCLUDED.credits,
  description = EXCLUDED.description,
  updated_at = now();

DROP TRIGGER IF EXISTS trg_ai_credit_costs_updated ON public.ai_credit_costs;
CREATE TRIGGER trg_ai_credit_costs_updated
  BEFORE UPDATE ON public.ai_credit_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.get_ai_credits_remaining()
RETURNS TABLE(plan text, max_credits integer, used integer, remaining integer, unlimited boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_plan text; v_max integer; v_used integer;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;
  SELECT t.plan INTO v_plan FROM public.tenants t WHERE t.id = v_tenant;
  v_plan := COALESCE(v_plan, 'free');
  SELECT pl.max_ai_tokens_month INTO v_max FROM public.plan_limits pl WHERE pl.plan = v_plan;
  v_max := COALESCE(v_max, 10);
  SELECT COALESCE(ur.ai_tokens_used, 0) INTO v_used FROM public.usage_records ur
    WHERE ur.tenant_id = v_tenant AND ur.period = v_period;
  v_used := COALESCE(v_used, 0);
  IF v_max < 0 THEN
    RETURN QUERY SELECT v_plan, -1, v_used, -1, true;
  ELSE
    RETURN QUERY SELECT v_plan, v_max, v_used, GREATEST(0, v_max - v_used), false;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.consume_ai_credits(p_operation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_plan text; v_max integer; v_cost integer; v_used integer;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT credits INTO v_cost FROM public.ai_credit_costs WHERE operation = p_operation;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'unknown_operation: %', p_operation; END IF;
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;
  SELECT t.plan INTO v_plan FROM public.tenants t WHERE t.id = v_tenant;
  v_plan := COALESCE(v_plan, 'free');
  SELECT pl.max_ai_tokens_month INTO v_max FROM public.plan_limits pl WHERE pl.plan = v_plan;
  v_max := COALESCE(v_max, 10);
  INSERT INTO public.usage_records (tenant_id, period, ai_tokens_used)
    VALUES (v_tenant, v_period, 0)
    ON CONFLICT (tenant_id, period) DO NOTHING;
  IF v_max < 0 THEN
    UPDATE public.usage_records
      SET ai_tokens_used = ai_tokens_used + v_cost, updated_at = now()
      WHERE tenant_id = v_tenant AND period = v_period
      RETURNING ai_tokens_used INTO v_used;
    RETURN jsonb_build_object('ok', true, 'unlimited', true, 'cost', v_cost, 'used', v_used, 'plan', v_plan);
  END IF;
  SELECT ai_tokens_used INTO v_used FROM public.usage_records
    WHERE tenant_id = v_tenant AND period = v_period FOR UPDATE;
  IF v_used + v_cost > v_max THEN
    RAISE EXCEPTION 'insufficient_credits: needed %, available %', v_cost, GREATEST(0, v_max - v_used);
  END IF;
  UPDATE public.usage_records
    SET ai_tokens_used = ai_tokens_used + v_cost, updated_at = now()
    WHERE tenant_id = v_tenant AND period = v_period
    RETURNING ai_tokens_used INTO v_used;
  RETURN jsonb_build_object('ok', true, 'unlimited', false, 'cost', v_cost, 'used', v_used, 'remaining', v_max - v_used, 'plan', v_plan);
END; $$;
