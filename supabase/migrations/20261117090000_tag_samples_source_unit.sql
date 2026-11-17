-- Histórico com origem e unidade (Fase 0/1 do SCADA, aprovado em 2026-11-17).
--
-- Antes, tag_samples guardava só valor e qualidade: amostra SIMULADA ficava
-- indistinguível de leitura REAL. Agora toda amostra diz de onde veio
-- (simulação, IoT, Edge OPC UA/Modbus/MQTT, importação) e em que unidade está.
-- A tabela está vazia (verificado em 2026-11-17); default 'UNKNOWN' só protege
-- escritores antigos que ainda não informam a origem.
-- Idempotente.

ALTER TABLE public.tag_samples
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS equipment_id text,
  ADD COLUMN IF NOT EXISTS sequence_number bigint,
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.tag_samples
    ADD CONSTRAINT tag_samples_source_check CHECK (
      source IN ('SIMULATION', 'INTERNAL_RUNTIME', 'OPC_UA', 'MODBUS_TCP', 'MQTT', 'IOT', 'IMPORTED', 'UNKNOWN')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tag_samples
    ADD CONSTRAINT tag_samples_unit_len CHECK (unit IS NULL OR length(unit) <= 16);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS tag_samples_project_tag_time_idx
  ON public.tag_samples (project_id, tag_name, sampled_at DESC);
