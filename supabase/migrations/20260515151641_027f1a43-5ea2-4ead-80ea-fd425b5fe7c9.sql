
-- Revoke EXECUTE on SECURITY DEFINER functions from anon role.
-- Authenticated users keep access where the function checks auth.uid() internally.

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_normative_chunks(extensions.vector, double precision, integer, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_normative_chunks(extensions.vector, double precision, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_catalog_components(text, extensions.vector, double precision, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_catalog_components(text, extensions.vector, double precision, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_monthly_tag_samples_partition(date) FROM anon, public;
-- only platform admins / cron should call this; not granted to authenticated.

REVOKE EXECUTE ON FUNCTION public.batch_update_simulation_tags(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.batch_update_simulation_tags(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.batch_insert_alarm_history(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.batch_insert_alarm_history(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.batch_insert_tag_samples(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.batch_insert_tag_samples(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated;

-- Server-side AI quota helper: returns remaining tokens for the caller's tenant
-- in the current YYYY-MM period. Caller MUST be authenticated.
CREATE OR REPLACE FUNCTION public.check_ai_quota()
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.tenant_id INTO v_tenant_id FROM public.profiles p WHERE p.id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant';
  END IF;

  SELECT t.plan INTO v_plan FROM public.tenants t WHERE t.id = v_tenant_id;
  v_plan := COALESCE(v_plan, 'free');

  SELECT pl.max_ai_tokens_month INTO v_max FROM public.plan_limits pl WHERE pl.plan = v_plan;
  v_max := COALESCE(v_max, 10000);

  SELECT COALESCE(ur.ai_tokens_used, 0) INTO v_used
  FROM public.usage_records ur
  WHERE ur.tenant_id = v_tenant_id AND ur.period = v_period;
  v_used := COALESCE(v_used, 0);

  RETURN QUERY SELECT (v_used < v_max), v_used, v_max, v_plan, v_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_ai_quota() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_ai_quota() TO authenticated;

-- Server-side AI usage increment helper. Increments without requiring p_project_id
-- (used by the edge function before/after a DeepSeek call).
CREATE OR REPLACE FUNCTION public.increment_ai_tokens(p_tokens integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_tokens IS NULL OR p_tokens < 0 THEN RAISE EXCEPTION 'invalid token count'; END IF;

  SELECT p.tenant_id INTO v_tenant_id FROM public.profiles p WHERE p.id = auth.uid();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'No tenant'; END IF;

  INSERT INTO public.usage_records (tenant_id, period, ai_tokens_used)
  VALUES (v_tenant_id, v_period, p_tokens)
  ON CONFLICT (tenant_id, period) DO UPDATE
    SET ai_tokens_used = public.usage_records.ai_tokens_used + p_tokens,
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_ai_tokens(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.increment_ai_tokens(integer) TO authenticated;
