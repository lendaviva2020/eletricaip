-- Move remaining SECURITY DEFINER access behind service-role-only wrappers.
-- This closes Supabase linter findings for authenticated/anon execute on public RPCs.

CREATE OR REPLACE FUNCTION public.check_ai_quota_for_user(p_user_id uuid)
RETURNS TABLE(allowed boolean, used integer, max_tokens integer, plan text, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan text;
  v_max integer;
  v_used integer;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  SELECT p.tenant_id INTO v_tenant_id FROM public.profiles p WHERE p.id = p_user_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no_tenant';
  END IF;

  SELECT t.plan INTO v_plan FROM public.tenants t WHERE t.id = v_tenant_id;
  v_plan := COALESCE(v_plan, 'free');

  SELECT pl.max_ai_tokens_month INTO v_max FROM public.plan_limits pl WHERE pl.plan = v_plan;
  v_max := COALESCE(v_max, 10000);

  SELECT COALESCE(ur.ai_tokens_used, 0) INTO v_used
  FROM public.usage_records ur
  WHERE ur.tenant_id = v_tenant_id AND ur.period = v_period;
  v_used := COALESCE(v_used, 0);

  RETURN QUERY SELECT (v_max < 0 OR v_used < v_max), v_used, v_max, v_plan, v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_tokens_for_user(p_user_id uuid, p_tokens integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  IF p_tokens IS NULL OR p_tokens < 0 THEN RAISE EXCEPTION 'invalid_token_count'; END IF;

  SELECT p.tenant_id INTO v_tenant_id FROM public.profiles p WHERE p.id = p_user_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;

  INSERT INTO public.usage_records (tenant_id, period, ai_tokens_used)
  VALUES (v_tenant_id, v_period, p_tokens)
  ON CONFLICT (tenant_id, period) DO UPDATE
    SET ai_tokens_used = public.usage_records.ai_tokens_used + p_tokens,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_credits_remaining_for_user(p_user_id uuid)
RETURNS TABLE(plan text, max_credits integer, used integer, remaining integer, unlimited boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_plan text;
  v_max integer;
  v_used integer;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = p_user_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;

  SELECT t.plan INTO v_plan FROM public.tenants t WHERE t.id = v_tenant;
  v_plan := COALESCE(v_plan, 'free');

  SELECT pl.max_ai_tokens_month INTO v_max FROM public.plan_limits pl WHERE pl.plan = v_plan;
  v_max := COALESCE(v_max, 10);

  SELECT COALESCE(ur.ai_tokens_used, 0) INTO v_used
  FROM public.usage_records ur
  WHERE ur.tenant_id = v_tenant AND ur.period = v_period;
  v_used := COALESCE(v_used, 0);

  IF v_max < 0 THEN
    RETURN QUERY SELECT v_plan, -1, v_used, -1, true;
  ELSE
    RETURN QUERY SELECT v_plan, v_max, v_used, GREATEST(0, v_max - v_used), false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_credits_for_user(p_user_id uuid, p_operation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_plan text;
  v_max integer;
  v_cost integer;
  v_used integer;
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
    RETURN jsonb_build_object('ok', true, 'unlimited', true, 'cost', v_cost, 'used', v_used, 'plan', v_plan);
  END IF;

  SELECT ai_tokens_used INTO v_used
  FROM public.usage_records
  WHERE tenant_id = v_tenant AND period = v_period
  FOR UPDATE;

  IF v_used + v_cost > v_max THEN
    RAISE EXCEPTION 'insufficient_credits: needed %, available %', v_cost, GREATEST(0, v_max - v_used);
  END IF;

  UPDATE public.usage_records
    SET ai_tokens_used = ai_tokens_used + v_cost, updated_at = now()
    WHERE tenant_id = v_tenant AND period = v_period
    RETURNING ai_tokens_used INTO v_used;

  RETURN jsonb_build_object('ok', true, 'unlimited', false, 'cost', v_cost, 'used', v_used, 'remaining', v_max - v_used, 'plan', v_plan);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_bom_from_canvas_for_user(p_user_id uuid, p_project_id uuid)
RETURNS TABLE(items_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_role text;
  v_tenant uuid;
  v_canvas jsonb;
  v_node jsonb;
  v_part text;
  v_desc text;
  v_qty numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  SELECT p.tenant_id INTO v_tenant FROM public.projects p WHERE p.id = p_project_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  SELECT tm.role INTO v_role FROM public.tenant_memberships tm
  WHERE tm.tenant_id = v_tenant AND tm.user_id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','engineer') THEN
    RAISE EXCEPTION 'insufficient_permissions';
  END IF;

  DELETE FROM public.project_bom_items
  WHERE project_id = p_project_id AND source = 'canvas';

  FOR v_canvas IN
    SELECT canvas_data FROM public.diagrams WHERE project_id = p_project_id
  LOOP
    FOR v_node IN
      SELECT jsonb_array_elements(COALESCE(v_canvas->'nodes', '[]'::jsonb))
    LOOP
      v_part := COALESCE(v_node->'data'->>'partNumber', v_node->'data'->>'model', v_node->>'type');
      v_desc := COALESCE(v_node->'data'->>'label', v_node->'data'->>'description', v_node->>'type');
      v_qty := COALESCE((v_node->'data'->>'quantity')::numeric, 1);
      IF v_part IS NULL THEN CONTINUE; END IF;

      IF EXISTS (
        SELECT 1 FROM public.project_bom_items
        WHERE project_id = p_project_id AND source = 'canvas' AND part_number = v_part
      ) THEN
        UPDATE public.project_bom_items
        SET quantity = quantity + v_qty
        WHERE project_id = p_project_id AND source = 'canvas' AND part_number = v_part;
      ELSE
        INSERT INTO public.project_bom_items
          (project_id, part_number, description, quantity, source, created_by)
        VALUES (p_project_id, v_part, v_desc, v_qty, 'canvas', p_user_id);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_tenant_plan(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ai_quota() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_ai_credits(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_bom_from_canvas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_credits_remaining() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_tokens(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_normative_chunks(extensions.vector, double precision, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_has_feature(text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_ai_quota_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota_for_user(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ai_tokens_for_user(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_tokens_for_user(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_ai_credits_remaining_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_credits_remaining_for_user(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_ai_credits_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits_for_user(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_bom_from_canvas_for_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_bom_from_canvas_for_user(uuid, uuid) TO service_role;
