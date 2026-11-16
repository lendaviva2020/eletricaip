-- Painel mensal do dono da plataforma (/settings/platform-metrics).
--
-- Agrega no banco (uma ida, sem trafegar linhas de clientes para o app):
-- empresas, usuários, projetos, itens de BOM (quantidade e valor de lista) e
-- créditos de IA por mês UTC, mais a distribuição atual por plano.
--
-- Segurança: SECURITY DEFINER com search_path fixo e EXECUTE só para
-- service_role. O servidor (platform-metrics.functions.ts) confere
-- is_platform_admin() do usuário ANTES de chamar com a service role.
-- Nada de nomes, e-mails ou ids de clientes sai daqui — só contagens.

CREATE OR REPLACE FUNCTION public.platform_monthly_metrics(p_months integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_months integer := LEAST(GREATEST(COALESCE(p_months, 6), 1), 24);
  v_start timestamptz := date_trunc('month', timezone('utc', now())) - make_interval(months => v_months - 1);
  v_series jsonb;
  v_plans jsonb;
  v_totals jsonb;
BEGIN
  WITH months AS (
    SELECT generate_series(v_start, date_trunc('month', timezone('utc', now())), interval '1 month') AS m
  ),
  t AS (SELECT date_trunc('month', timezone('utc', created_at)) m, count(*) n FROM tenants WHERE created_at >= v_start GROUP BY 1),
  u AS (SELECT date_trunc('month', timezone('utc', created_at)) m, count(*) n FROM profiles WHERE created_at >= v_start GROUP BY 1),
  p AS (SELECT date_trunc('month', timezone('utc', created_at)) m, count(*) n FROM projects WHERE created_at >= v_start GROUP BY 1),
  b AS (
    SELECT date_trunc('month', timezone('utc', created_at)) m,
           count(*) n,
           COALESCE(sum(quantity), 0) qty,
           COALESCE(sum(quantity * COALESCE(unit_price_brl, 0)), 0) value_brl,
           count(*) FILTER (WHERE unit_price_brl IS NULL) unpriced
    FROM project_bom_items WHERE created_at >= v_start GROUP BY 1
  ),
  a AS (
    SELECT date_trunc('month', timezone('utc', created_at)) m, count(*) n, COALESCE(sum(credits), 0) credits
    FROM ai_usage_events WHERE created_at >= v_start GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
           'month', to_char(months.m, 'YYYY-MM'),
           'newTenants', COALESCE(t.n, 0),
           'newUsers', COALESCE(u.n, 0),
           'newProjects', COALESCE(p.n, 0),
           'bomItems', COALESCE(b.n, 0),
           'bomQuantity', COALESCE(b.qty, 0),
           'bomValueBrl', round(COALESCE(b.value_brl, 0)::numeric, 2),
           'bomUnpricedItems', COALESCE(b.unpriced, 0),
           'aiCalls', COALESCE(a.n, 0),
           'aiCredits', COALESCE(a.credits, 0)
         ) ORDER BY months.m)
  INTO v_series
  FROM months
  LEFT JOIN t ON t.m = months.m
  LEFT JOIN u ON u.m = months.m
  LEFT JOIN p ON p.m = months.m
  LEFT JOIN b ON b.m = months.m
  LEFT JOIN a ON a.m = months.m;

  SELECT COALESCE(jsonb_object_agg(plan, n), '{}'::jsonb)
  INTO v_plans
  FROM (
    SELECT lower(COALESCE(plan, 'free')) plan, count(*) n
    FROM tenants
    WHERE deleted_at IS NULL AND COALESCE(status, 'active') = 'active'
    GROUP BY 1
  ) s;

  SELECT jsonb_build_object(
    'tenants', (SELECT count(*) FROM tenants WHERE deleted_at IS NULL),
    'users', (SELECT count(*) FROM profiles),
    'projects', (SELECT count(*) FROM projects),
    'bomItems', (SELECT count(*) FROM project_bom_items),
    'catalogComponents', (SELECT count(*) FROM catalog_components),
    'iotDevices', (SELECT count(*) FROM iot_devices)
  ) INTO v_totals;

  RETURN jsonb_build_object(
    'generatedAt', timezone('utc', now()),
    'months', COALESCE(v_series, '[]'::jsonb),
    'tenantsByPlan', v_plans,
    'totals', v_totals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_monthly_metrics(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_monthly_metrics(integer) TO service_role;
