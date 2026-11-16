-- check_ai_quota() não tratava plano ilimitado (max = -1): `v_used < -1` é
-- sempre falso, então reportaria "cota esgotada" para o premium. A variante
-- _for_user já tratava; esta passa a ter o mesmo comportamento.
CREATE OR REPLACE FUNCTION public.check_ai_quota()
RETURNS TABLE(allowed boolean, used integer, max_tokens integer, plan text, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_max := COALESCE(v_max, 10);

  SELECT COALESCE(ur.ai_tokens_used, 0) INTO v_used
  FROM public.usage_records ur
  WHERE ur.tenant_id = v_tenant_id AND ur.period = v_period;
  v_used := COALESCE(v_used, 0);

  RETURN QUERY SELECT (v_max < 0 OR v_used < v_max), v_used, v_max, v_plan, v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_quota() TO authenticated, service_role;
