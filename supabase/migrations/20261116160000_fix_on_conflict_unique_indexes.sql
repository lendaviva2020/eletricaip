-- Correção crítica (2026-11-16): ON CONFLICT sem índice único correspondente.
--
-- O Postgres exige um índice único NÃO parcial com exatamente as colunas do
-- ON CONFLICT. Sem ele, o comando inteiro falha. Efeitos encontrados:
--   * usage_records (tenant_id, period): consume_ai_credits falhava em TODA
--     chamada → "Não foi possível debitar créditos de IA" → IA inoperante.
--   * invoices (stripe_invoice_id) e subscriptions (stripe_subscription_id):
--     só havia índice PARCIAL (WHERE ... IS NOT NULL), que o upsert do
--     PostgREST não usa → webhooks Stripe/Mercado Pago falhavam ao registrar.
--   * alarm_configs (project_id, tag_name): sem índice → salvar alarmes do
--     SCADA falhava.
-- Verificado antes: nenhuma duplicata nessas chaves (tabelas sem conflito).
-- Índice único completo continua aceitando vários NULL (NULLs são distintos).
-- Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_records_tenant_period
  ON public.usage_records (tenant_id, period);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_stripe_invoice_id_full
  ON public.invoices (stripe_invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_subscription_id_full
  ON public.subscriptions (stripe_subscription_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alarm_configs_project_tag
  ON public.alarm_configs (project_id, tag_name);
