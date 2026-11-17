-- SCADA Fase 1: alarmes e auditoria persistentes (aprovado em 2026-11-17).
--
-- Antes, NENHUMA linha entrava em alarm_history/audit_logs:
--   * `id` das duas tabelas era uuid NOT NULL sem default (todo insert sem id falhava);
--   * audit_logs.ip_address era NOT NULL (o servidor não tem IP confiável do operador);
--   * audit_logs não tem policy de INSERT para clientes (correto: a gravação agora é
--     feita pelo servidor, com service role, depois de autorizar o projeto).
-- Também:
--   * alarm_history ganha `occurrence_id` (ocorrência estável) para que reconhecer ou
--     normalizar ATUALIZE a mesma linha em vez de criar outra;
--   * audit_logs ganha unicidade (tenant_id, previous_hash): duas gravações simultâneas
--     não conseguem bifurcar a cadeia de hash (a segunda refaz o encadeamento).
-- As duas tabelas estavam vazias (verificado em 2026-11-17). Idempotente.

ALTER TABLE public.alarm_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.audit_logs ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.audit_logs ALTER COLUMN ip_address DROP NOT NULL;

ALTER TABLE public.alarm_history ADD COLUMN IF NOT EXISTS occurrence_id text;
ALTER TABLE public.alarm_history ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.alarm_history ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.alarm_history
    ADD CONSTRAINT alarm_history_occurrence_len CHECK (
      occurrence_id IS NULL OR length(occurrence_id) BETWEEN 1 AND 200
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS alarm_history_project_occurrence_uidx
  ON public.alarm_history (project_id, occurrence_id);

CREATE INDEX IF NOT EXISTS alarm_history_project_triggered_idx
  ON public.alarm_history (project_id, triggered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_tenant_previous_hash_uidx
  ON public.audit_logs (tenant_id, previous_hash);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_resource_created_idx
  ON public.audit_logs (tenant_id, resource_id, created_at DESC);
