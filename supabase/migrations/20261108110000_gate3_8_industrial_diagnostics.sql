-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 3.8 & 3.8.1: INDUSTRIAL DIAGNOSTICS & CAUSAL CORRELATION
-- Incremental Schema: Dependency Graph, Deterministic Diagnostics, Rejected Hypotheses
-- + Database-Level Append-Only Immutability Triggers (Blocking UPDATE and DELETE)
-- Standards: IEC 62443, ISA-95, Multi-Tenant RLS Enforcement
-- Safety Invariant: isPhysicalControlAllowed = false (Immutable)
-- =============================================================================

-- 1. Estender tabela existente industrial_incidents (Gate 3.7) sem criar segundo ciclo de vida
ALTER TABLE IF EXISTS public.industrial_incidents
  ADD COLUMN IF NOT EXISTS detected_at BIGINT,
  ADD COLUMN IF NOT EXISTS recovered_at BIGINT,
  ADD COLUMN IF NOT EXISTS investigation_stage TEXT DEFAULT 'INCIDENT_DETECTED',
  ADD COLUMN IF NOT EXISTS probable_cause JSONB,
  ADD COLUMN IF NOT EXISTS confirmed_cause JSONB,
  ADD COLUMN IF NOT EXISTS affected_components JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operational_scope TEXT,
  ADD COLUMN IF NOT EXISTS recommended_runbooks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS investigation_plan TEXT,
  ADD COLUMN IF NOT EXISTS investigation_result TEXT,
  ADD COLUMN IF NOT EXISTS recovery_validation JSONB;

-- 2. Tabela do Grafo de Dependências Industriais (Fase 2)
CREATE TABLE IF NOT EXISTS public.industrial_dependency_edges (
  edge_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  from_component_id TEXT NOT NULL,
  to_component_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (
    relation_type IN (
      'ARCHITECTURAL_DEPENDENCY',
      'DATA_ACQUISITION_PATH',
      'PHYSICAL_FEEDER_TOPOLOGY',
      'STORAGE_PIPELINE',
      'VISUALIZATION_BINDING'
    )
  ),
  validation_state TEXT NOT NULL CHECK (
    validation_state IN ('VALIDATED_CANONICAL', 'CONFIGURED_UNVERIFIED', 'UNKNOWN')
  ),
  evidence_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dep_edges_org_plant
  ON public.industrial_dependency_edges (organization_id, plant_id);

ALTER TABLE public.industrial_dependency_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_dependency_edges"
  ON public.industrial_dependency_edges
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true));

-- 3. Tabela de Diagnósticos Determinísticos Baseados em Regras (Fase 3)
CREATE TABLE IF NOT EXISTS public.industrial_diagnostic_records (
  diagnostic_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  incident_id TEXT,
  organization_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  primary_component TEXT NOT NULL,
  affected_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  hypothesis TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  confidence_method TEXT NOT NULL,
  diagnostic_status TEXT NOT NULL CHECK (
    diagnostic_status IN (
      'OBSERVED',
      'SUSPECTED',
      'CONFIRMED_BY_EVIDENCE',
      'INCONCLUSIVE',
      'REJECTED',
      'RESOLVED'
    )
  ),
  recommended_runbook_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diag_records_org_plant
  ON public.industrial_diagnostic_records (organization_id, plant_id, created_at DESC);

ALTER TABLE public.industrial_diagnostic_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_diagnostic_records" ON public.industrial_diagnostic_records;
CREATE POLICY "tenant_isolation_diagnostic_records"
  ON public.industrial_diagnostic_records
  FOR SELECT
  USING (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_insert_diagnostic_records" ON public.industrial_diagnostic_records;
CREATE POLICY "tenant_insert_diagnostic_records"
  ON public.industrial_diagnostic_records
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- 4. Tabela de Hipóteses Rejeitadas com Auditoria Imutável (Fase 7)
CREATE TABLE IF NOT EXISTS public.industrial_incident_rejected_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  diagnostic_id TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  rejected_by TEXT NOT NULL,
  rejected_at BIGINT NOT NULL,
  reason TEXT NOT NULL
);

ALTER TABLE public.industrial_incident_rejected_hypotheses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_rejected_hypotheses" ON public.industrial_incident_rejected_hypotheses;
CREATE POLICY "tenant_isolation_rejected_hypotheses"
  ON public.industrial_incident_rejected_hypotheses
  FOR SELECT
  USING (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_insert_rejected_hypotheses" ON public.industrial_incident_rejected_hypotheses;
CREATE POLICY "tenant_insert_rejected_hypotheses"
  ON public.industrial_incident_rejected_hypotheses
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- 5. Gate 3.8.1: Triggers PostgreSQL Append-Only (Bloqueio Estrito de UPDATE, DELETE e TRUNCATE)
CREATE OR REPLACE FUNCTION public.prevent_immutable_diagnostic_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_DIAGNOSTIC_STORE_VIOLATION: Operacao % proibida na tabela %.', TG_OP, TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_diagnostic_records ON public.industrial_diagnostic_records;
CREATE TRIGGER trg_immutable_diagnostic_records
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.industrial_diagnostic_records
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_immutable_diagnostic_mutation();

DROP TRIGGER IF EXISTS trg_immutable_rejected_hypotheses ON public.industrial_incident_rejected_hypotheses;
CREATE TRIGGER trg_immutable_rejected_hypotheses
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.industrial_incident_rejected_hypotheses
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_immutable_diagnostic_mutation();
