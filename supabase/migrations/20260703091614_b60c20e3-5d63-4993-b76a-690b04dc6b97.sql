
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  operation text NOT NULL,
  credits integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_created
  ON public.ai_usage_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_op_created
  ON public.ai_usage_events (tenant_id, operation, created_at DESC);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members read own ai usage events" ON public.ai_usage_events;
CREATE POLICY "tenant members read own ai usage events"
  ON public.ai_usage_events FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_platform_admin());

-- Update consume_ai_credits to log per-operation event
CREATE OR REPLACE FUNCTION public.consume_ai_credits(p_operation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    INSERT INTO public.ai_usage_events (tenant_id, user_id, operation, credits)
      VALUES (v_tenant, auth.uid(), p_operation, v_cost);
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
  INSERT INTO public.ai_usage_events (tenant_id, user_id, operation, credits)
    VALUES (v_tenant, auth.uid(), p_operation, v_cost);
  RETURN jsonb_build_object('ok', true, 'unlimited', false, 'cost', v_cost, 'used', v_used, 'remaining', v_max - v_used, 'plan', v_plan);
END; $function$;

CREATE OR REPLACE FUNCTION public.consume_ai_credits_for_user(p_user_id uuid, p_operation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_plan text; v_max integer; v_cost integer; v_used integer;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  SELECT credits INTO v_cost FROM public.ai_credit_costs WHERE operation = p_operation;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'unknown_operation: %', p_operation; END IF;
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = p_user_id;
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
    INSERT INTO public.ai_usage_events (tenant_id, user_id, operation, credits)
      VALUES (v_tenant, p_user_id, p_operation, v_cost);
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
  INSERT INTO public.ai_usage_events (tenant_id, user_id, operation, credits)
    VALUES (v_tenant, p_user_id, p_operation, v_cost);
  RETURN jsonb_build_object('ok', true, 'unlimited', false, 'cost', v_cost, 'used', v_used, 'remaining', v_max - v_used, 'plan', v_plan);
END; $function$;
