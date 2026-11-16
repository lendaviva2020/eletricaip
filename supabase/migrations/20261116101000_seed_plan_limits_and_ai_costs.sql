-- Auditoria 2026-11-16 — limites de plano e custos de IA ausentes no banco.
--
-- 1. plan_limits estava VAZIA. Efeito: createProject caía no fallback de 3
--    projetos, as RPCs de crédito no fallback de 10 créditos e o IoT ficava
--    desligado — TODO plano pago funcionava como o grátis. Valores espelham
--    src/lib/plans.ts (fonte do que é anunciado na landing e no checkout);
--    -1 = ilimitado (as RPCs já tratam v_max < 0).
-- 2. ai_credit_costs não tinha "ai_fix_diagnostics" nem
--    "ai_electrical_generator": consume_ai_credits_for_user lançava
--    unknown_operation e esses recursos de IA nunca funcionavam.

CREATE UNIQUE INDEX IF NOT EXISTS plan_limits_plan_key ON public.plan_limits (plan);

INSERT INTO public.plan_limits (plan, max_projects, max_ai_tokens_month, max_storage_mb, max_users, features)
VALUES
  ('free',    3,  10,  100,   1, '["pdf_export"]'::jsonb),
  ('basic',   10, 100, 1024,  3, '["pdf_export","excel_export"]'::jsonb),
  ('pro',     -1, 250, 10240, 10, '["pdf_export","excel_export","realtime","scada"]'::jsonb),
  ('premium', -1, -1,  -1,    -1, '["pdf_export","excel_export","realtime","scada","all_features"]'::jsonb)
ON CONFLICT (plan) DO UPDATE
  SET max_projects = EXCLUDED.max_projects,
      max_ai_tokens_month = EXCLUDED.max_ai_tokens_month,
      max_storage_mb = EXCLUDED.max_storage_mb,
      max_users = EXCLUDED.max_users,
      features = EXCLUDED.features;

INSERT INTO public.ai_credit_costs (operation, credits, description)
VALUES
  ('ai_fix_diagnostics', 2, 'Correção assistida por IA de diagnósticos do diagrama'),
  ('ai_electrical_generator', 5, 'Geração de projeto elétrico (Edge Function)')
ON CONFLICT (operation) DO NOTHING;
