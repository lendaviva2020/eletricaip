-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 4.3.1 ENTERPRISE PERSISTENCE, APPEND-ONLY AUDIT & WEBHOOK LEDGER
-- Corrective & structural migration (local repository artifact; NOT applied to remote prod).
-- Note: Local Docker/PostgreSQL daemon verification status must be tracked honestly
--       (BLOCKED_BY_ENVIRONMENT when Docker Engine / psql is stopped).
-- =============================================================================

-- 1. Fleet Registry & Operational Gateways
CREATE TABLE IF NOT EXISTS public.fleet_registered_gateways (
  gateway_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  plant_id text NOT NULL,
  station_id text NOT NULL,
  payload_json jsonb NOT NULL,
  auth_token_digest text,
  last_batch_sequence bigint NOT NULL DEFAULT 0,
  authorized_endpoints text[] NOT NULL DEFAULT ARRAY[]::text[],
  record_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_gateways (
  gateway_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  plant_id text NOT NULL,
  payload_json jsonb NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gateway_certificates (
  gateway_id text PRIMARY KEY REFERENCES public.fleet_registered_gateways(gateway_id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cert_json jsonb NOT NULL,
  pop_public_key text,
  record_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gateway_certificate_challenges (
  challenge_key text PRIMARY KEY,
  gateway_id text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.remote_configs (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_id text NOT NULL,
  config_version integer NOT NULL,
  is_lkgc boolean NOT NULL DEFAULT false,
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, config_version)
);

CREATE TABLE IF NOT EXISTS public.provisioning_tokens (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  plant_id text NOT NULL,
  station_id text NOT NULL,
  payload_json jsonb NOT NULL,
  is_consumed boolean NOT NULL DEFAULT false,
  is_revoked boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  record_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.ota_campaigns (
  campaign_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  plant_id text NOT NULL,
  payload_json jsonb NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ota_applied_packages (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_id text NOT NULL,
  package_id text NOT NULL,
  target_version text NOT NULL,
  manifest_hash text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, package_id, target_version)
);

CREATE TABLE IF NOT EXISTS public.edge_ingested_dedup (
  dedup_key text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_id text NOT NULL,
  plant_id text NOT NULL,
  tag_name text NOT NULL,
  source_timestamp bigint NOT NULL,
  sample_json jsonb NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Append-Only Tamper-Evident Fleet Audit Chain
CREATE TABLE IF NOT EXISTS public.fleet_audit_chain (
  seq bigserial PRIMARY KEY,
  id text NOT NULL UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  organization_id text NOT NULL,
  plant_id text NOT NULL,
  gateway_id text NOT NULL,
  event_timestamp bigint NOT NULL,
  schema_version text NOT NULL DEFAULT '4.3.1',
  event_type text NOT NULL,
  severity text NOT NULL,
  result text NOT NULL,
  previous_hash text NOT NULL,
  tamper_proof_hash text NOT NULL UNIQUE,
  event_json jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION public.prevent_fleet_audit_chain_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_CHAIN_IMMUTABLE: Operacao % proibida na cadeia append-only fleet_audit_chain.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_audit_chain_immutable ON public.fleet_audit_chain;
CREATE TRIGGER trg_fleet_audit_chain_immutable
  BEFORE UPDATE OR DELETE ON public.fleet_audit_chain
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_fleet_audit_chain_mutation();

-- 3. Transactional Webhook Idempotency State Machine Ledger
CREATE TABLE IF NOT EXISTS public.webhook_processing_ledger (
  provider text NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
  event_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'RETRYABLE')),
  payload_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  locked_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- 4. Enable Row Level Security (RLS) Across All Gate 4.3.1 Tables
DO $$
DECLARE
  tenant_tbl text;
  tenant_tables text[] := ARRAY[
    'fleet_registered_gateways',
    'fleet_gateways',
    'gateway_certificates',
    'remote_configs',
    'provisioning_tokens',
    'ota_campaigns',
    'ota_applied_packages',
    'edge_ingested_dedup'
  ];
BEGIN
  FOREACH tenant_tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || tenant_tbl, tenant_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid()
        ) OR public.is_platform_admin()
      )',
      'rls_select_' || tenant_tbl, tenant_tbl, tenant_tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_manage_' || tenant_tbl, tenant_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = %I.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role IN (''owner'', ''admin'', ''engineer'')
        ) OR public.is_platform_admin()
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = %I.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role IN (''owner'', ''admin'', ''engineer'')
        ) OR public.is_platform_admin()
      )',
      'rls_manage_' || tenant_tbl, tenant_tbl, tenant_tbl, tenant_tbl
    );
  END LOOP;
END $$;

-- Audit chain RLS: SELECT for auditors/admins of tenant; INSERT for authenticated tenant ops/platform; NEVER UPDATE/DELETE.
ALTER TABLE public.fleet_audit_chain ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_select_fleet_audit_chain" ON public.fleet_audit_chain;
CREATE POLICY "rls_select_fleet_audit_chain"
  ON public.fleet_audit_chain
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = fleet_audit_chain.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'auditor', 'plant_admin')
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_insert_fleet_audit_chain" ON public.fleet_audit_chain;
CREATE POLICY "rls_insert_fleet_audit_chain"
  ON public.fleet_audit_chain
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = fleet_audit_chain.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'edge_operator')
    )
    OR public.is_platform_admin()
  );

-- Service-role internal tables: deny direct client access via RLS enabled with zero client policies
ALTER TABLE public.gateway_certificate_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_processing_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mp_webhook_processed ENABLE ROW LEVEL SECURITY;

-- Ensure anon never has direct SELECT privilege on internal SLO definitions
REVOKE ALL ON public.observability_slo_definitions FROM anon;
REVOKE ALL ON public.webhook_processing_ledger FROM anon, authenticated;
REVOKE ALL ON public.gateway_certificate_challenges FROM anon, authenticated;
