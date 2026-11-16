-- usage_records: colunas NOT NULL sem DEFAULT impediam consume_ai_credits de
-- criar a linha do mês ("null value in column simulations_run"). Padrão 0.
-- Idempotente.
ALTER TABLE public.usage_records ALTER COLUMN simulations_run SET DEFAULT 0;
ALTER TABLE public.usage_records ALTER COLUMN storage_used_mb SET DEFAULT 0;
ALTER TABLE public.usage_records ALTER COLUMN ai_tokens_used SET DEFAULT 0;
