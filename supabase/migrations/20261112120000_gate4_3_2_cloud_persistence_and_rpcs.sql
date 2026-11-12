-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 4.3.2 CLOUD PERSISTENCE, ATOMIC RPCs & BILLING INTEGRITY
-- Corrective & hardening migration (local repository artifact; NOT applied to remote prod).
-- =============================================================================

-- 1. Core webhook & billing DDL hardening (unique constraints + defaults + REVOKE client writes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stripe_webhook_events') THEN
    ALTER TABLE public.stripe_webhook_events ALTER COLUMN processed_at SET DEFAULT now();
    DELETE FROM public.stripe_webhook_events a USING public.stripe_webhook_events b
      WHERE a.ctid < b.ctid AND a.event_id = b.event_id;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_webhook_events_event_id
      ON public.stripe_webhook_events (event_id);
    REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
    GRANT ALL ON public.stripe_webhook_events TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mp_webhook_processed') THEN
    ALTER TABLE public.mp_webhook_processed ALTER COLUMN processed_at SET DEFAULT now();
    DELETE FROM public.mp_webhook_processed a USING public.mp_webhook_processed b
      WHERE a.ctid < b.ctid AND a.payment_id = b.payment_id;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_webhook_processed_payment_id
      ON public.mp_webhook_processed (payment_id);
    REVOKE ALL ON public.mp_webhook_processed FROM anon, authenticated;
    GRANT ALL ON public.mp_webhook_processed TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_stripe_invoice_id
      ON public.invoices (stripe_invoice_id)
      WHERE stripe_invoice_id IS NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_subscription_id
      ON public.subscriptions (stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL;
  END IF;
END $$;

-- Track last observed Mercado Pago status per external payment ID to block out-of-order regressions
CREATE TABLE IF NOT EXISTS public.mp_payment_state_machine (
  external_payment_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_status text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'brl',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_payment_state_machine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mp_payment_state_machine FROM anon, authenticated;
GRANT ALL ON public.mp_payment_state_machine TO service_role;

-- 2. Allow nullable tenant_id on fleet operational tables strictly for non-tenant system/lab seeding
--    while keeping authenticated RLS fail-closed (`tenant_id IS NOT NULL AND EXISTS (...)`).
DO $$
DECLARE
  fleet_tbl text;
  fleet_tables text[] := ARRAY[
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
  FOREACH fleet_tbl IN ARRAY fleet_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = fleet_tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id DROP NOT NULL', fleet_tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || fleet_tbl, fleet_tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
          (%I.tenant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid()
          )) OR public.is_platform_admin()
        )',
        'rls_select_' || fleet_tbl, fleet_tbl, fleet_tbl, fleet_tbl
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_manage_' || fleet_tbl, fleet_tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
          (%I.tenant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.tenant_id = %I.tenant_id
              AND tm.user_id = auth.uid()
              AND tm.role IN (''owner'', ''admin'', ''engineer'')
          )) OR public.is_platform_admin()
        ) WITH CHECK (
          (%I.tenant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.tenant_id = %I.tenant_id
              AND tm.user_id = auth.uid()
              AND tm.role IN (''owner'', ''admin'', ''engineer'')
          )) OR public.is_platform_admin()
        )',
        'rls_manage_' || fleet_tbl, fleet_tbl, fleet_tbl, fleet_tbl, fleet_tbl, fleet_tbl
      );
    END IF;
  END LOOP;
END $$;

-- 3. Additional Cloud persistence tables for telemetry snapshots, provisioning station lock, and OTA release PKI keys
CREATE TABLE IF NOT EXISTS public.fleet_latest_telemetry (
  gateway_id text NOT NULL,
  tag_name text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  sample_json jsonb NOT NULL,
  source_timestamp bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway_id, tag_name)
);
ALTER TABLE public.fleet_latest_telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_select_fleet_latest_telemetry" ON public.fleet_latest_telemetry;
CREATE POLICY "rls_select_fleet_latest_telemetry"
  ON public.fleet_latest_telemetry FOR SELECT TO authenticated
  USING (
    (tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = fleet_latest_telemetry.tenant_id AND tm.user_id = auth.uid()
    )) OR public.is_platform_admin()
  );

CREATE TABLE IF NOT EXISTS public.provisioning_station_bindings (
  station_key text PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_id text NOT NULL,
  bound_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provisioning_station_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provisioning_station_bindings FROM anon, authenticated;
GRANT ALL ON public.provisioning_station_bindings TO service_role;

CREATE TABLE IF NOT EXISTS public.ota_signing_keys (
  key_id text PRIMARY KEY,
  public_key_pem text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  revoked_reason text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ota_signing_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ota_signing_keys FROM anon, authenticated;
GRANT SELECT ON public.ota_signing_keys TO authenticated;
GRANT ALL ON public.ota_signing_keys TO service_role;

-- Enforce structural uniqueness on previous_hash so concurrent audit forks are impossible at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_audit_chain_previous_hash
  ON public.fleet_audit_chain (previous_hash);

-- =============================================================================
-- 4. ATOMIC SERVER-SIDE POSTGRESQL RPCs (CONCURRENCY & MULTI-INSTANCE SAFE)
-- =============================================================================

-- Helper: resolve uuid safely without failing on lab string org ids
CREATE OR REPLACE FUNCTION public.try_parse_tenant_uuid(p_org_id text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN p_org_id::uuid;
  END IF;
  RETURN NULL;
END;
$$;

-- 4A. Atomic serialized append on fleet_audit_chain (zero race forks under concurrency)
CREATE OR REPLACE FUNCTION public.append_fleet_audit_event_atomic(
  p_id text,
  p_organization_id text,
  p_plant_id text,
  p_gateway_id text,
  p_event_timestamp bigint,
  p_schema_version text,
  p_event_type text,
  p_severity text,
  p_result text,
  p_previous_hash text,
  p_tamper_proof_hash text,
  p_event_json jsonb
)
RETURNS TABLE(seq bigint, accepted boolean, current_tip_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_hash text;
  v_seq bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.fleet_audit_chain'));

  SELECT fac.tamper_proof_hash
  INTO v_latest_hash
  FROM public.fleet_audit_chain fac
  ORDER BY fac.seq DESC
  LIMIT 1;

  IF v_latest_hash IS NULL THEN
    v_latest_hash := 'GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000';
  END IF;

  IF p_previous_hash <> v_latest_hash THEN
    RETURN QUERY SELECT NULL::bigint, false, v_latest_hash;
    RETURN;
  END IF;

  INSERT INTO public.fleet_audit_chain (
    id, tenant_id, organization_id, plant_id, gateway_id,
    event_timestamp, schema_version, event_type, severity, result,
    previous_hash, tamper_proof_hash, event_json
  ) VALUES (
    p_id, public.try_parse_tenant_uuid(p_organization_id), p_organization_id, p_plant_id, p_gateway_id,
    p_event_timestamp, p_schema_version, p_event_type, p_severity, p_result,
    p_previous_hash, p_tamper_proof_hash, p_event_json
  )
  RETURNING public.fleet_audit_chain.seq INTO v_seq;

  RETURN QUERY SELECT v_seq, true, p_tamper_proof_hash;
END;
$$;

-- 4B. Atomic single-use provisioning token claim
CREATE OR REPLACE FUNCTION public.claim_provisioning_token_atomic(
  p_token_hash text,
  p_consumed_at timestamptz,
  p_station_key text,
  p_gateway_id text,
  p_organization_id text,
  p_plant_id text,
  p_station_id text,
  p_auth_token_digest text,
  p_gateway_payload jsonb,
  p_updated_token_payload jsonb
)
RETURNS TABLE(claimed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
  v_existing_gw text;
  v_tenant_uuid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('provisioning:' || p_token_hash));
  v_tenant_uuid := public.try_parse_tenant_uuid(p_organization_id);

  SELECT psb.gateway_id INTO v_existing_gw
  FROM public.provisioning_station_bindings psb
  WHERE psb.station_key = p_station_key;

  IF v_existing_gw IS NOT NULL THEN
    RETURN QUERY SELECT false, 'STATION_ALREADY_PROVISIONED';
    RETURN;
  END IF;

  UPDATE public.provisioning_tokens
  SET is_consumed = true,
      consumed_at = p_consumed_at,
      payload_json = p_updated_token_payload,
      record_version = record_version + 1
  WHERE token_hash = p_token_hash
    AND is_consumed = false
    AND is_revoked = false
    AND expires_at > p_consumed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN QUERY SELECT false, 'TOKEN_UNAVAILABLE_EXPIRED_REVOKED_OR_CONSUMED';
    RETURN;
  END IF;

  INSERT INTO public.provisioning_station_bindings (station_key, tenant_id, gateway_id)
  VALUES (p_station_key, v_tenant_uuid, p_gateway_id);

  INSERT INTO public.fleet_registered_gateways (
    gateway_id, tenant_id, organization_id, plant_id, station_id,
    payload_json, auth_token_digest, last_batch_sequence, record_version, updated_at
  ) VALUES (
    p_gateway_id, v_tenant_uuid, p_organization_id, p_plant_id, p_station_id,
    p_gateway_payload, p_auth_token_digest, 0, 1, now()
  )
  ON CONFLICT (gateway_id) DO UPDATE SET
    payload_json = EXCLUDED.payload_json,
    auth_token_digest = EXCLUDED.auth_token_digest,
    record_version = public.fleet_registered_gateways.record_version + 1,
    updated_at = now();

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- 4C. Atomic telemetry batch sequence + deduplication ingest
CREATE OR REPLACE FUNCTION public.record_ingested_batch_atomic(
  p_gateway_id text,
  p_organization_id text,
  p_plant_id text,
  p_expected_min_sequence bigint,
  p_new_sequence bigint,
  p_samples jsonb,
  p_dedup_keys text[]
)
RETURNS TABLE(committed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gw record;
  v_sample jsonb;
  v_key text;
  v_idx integer := 1;
  v_tenant_uuid uuid;
BEGIN
  v_tenant_uuid := public.try_parse_tenant_uuid(p_organization_id);

  SELECT gateway_id, last_batch_sequence, payload_json
  INTO v_gw
  FROM public.fleet_registered_gateways
  WHERE gateway_id = p_gateway_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'GATEWAY_NOT_REGISTERED';
    RETURN;
  END IF;

  IF COALESCE((v_gw.payload_json ->> 'isRevoked')::boolean, false) THEN
    RETURN QUERY SELECT false, 'GATEWAY_REVOKED';
    RETURN;
  END IF;

  IF p_new_sequence < v_gw.last_batch_sequence OR p_expected_min_sequence < 0 THEN
    RETURN QUERY SELECT false, 'SEQUENCE_REGRESSION';
    RETURN;
  END IF;

  FOR v_sample IN SELECT * FROM jsonb_array_elements(COALESCE(p_samples, '[]'::jsonb)) LOOP
    v_key := p_dedup_keys[v_idx];
    IF v_key IS NOT NULL THEN
      INSERT INTO public.edge_ingested_dedup (
        dedup_key, tenant_id, gateway_id, plant_id, tag_name, source_timestamp, sample_json
      ) VALUES (
        v_key, v_tenant_uuid, p_gateway_id, p_plant_id,
        COALESCE(v_sample ->> 'tagName', ''),
        COALESCE((v_sample ->> 'sourceTimestamp')::bigint, 0),
        v_sample
      ) ON CONFLICT (dedup_key) DO NOTHING;

      INSERT INTO public.fleet_latest_telemetry (
        gateway_id, tag_name, tenant_id, organization_id, sample_json, source_timestamp, updated_at
      ) VALUES (
        p_gateway_id,
        COALESCE(v_sample ->> 'tagName', ''),
        v_tenant_uuid,
        p_organization_id,
        v_sample,
        COALESCE((v_sample ->> 'sourceTimestamp')::bigint, 0),
        now()
      )
      ON CONFLICT (gateway_id, tag_name) DO UPDATE SET
        sample_json = EXCLUDED.sample_json,
        source_timestamp = EXCLUDED.source_timestamp,
        updated_at = now()
      WHERE EXCLUDED.source_timestamp >= public.fleet_latest_telemetry.source_timestamp;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE public.fleet_registered_gateways
  SET last_batch_sequence = GREATEST(last_batch_sequence, p_new_sequence),
      updated_at = now()
  WHERE gateway_id = p_gateway_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- 4D. Atomic monotonic Remote Config append
CREATE OR REPLACE FUNCTION public.append_remote_config_monotonic_atomic(
  p_gateway_id text,
  p_organization_id text,
  p_config_version integer,
  p_payload jsonb,
  p_set_lkgc boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_ver integer;
  v_tenant_uuid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('remote_config:' || p_gateway_id));
  v_tenant_uuid := public.try_parse_tenant_uuid(p_organization_id);

  SELECT COALESCE(MAX(config_version), 0) INTO v_max_ver
  FROM public.remote_configs
  WHERE gateway_id = p_gateway_id;

  IF p_config_version <= v_max_ver THEN
    RETURN false;
  END IF;

  IF p_set_lkgc THEN
    UPDATE public.remote_configs SET is_lkgc = false WHERE gateway_id = p_gateway_id AND is_lkgc = true;
  END IF;

  INSERT INTO public.remote_configs (
    id, tenant_id, gateway_id, config_version, is_lkgc, payload_json
  ) VALUES (
    p_gateway_id || ':' || p_config_version::text,
    v_tenant_uuid,
    p_gateway_id,
    p_config_version,
    p_set_lkgc,
    p_payload
  );

  RETURN true;
END;
$$;

-- 4E. Atomic Webhook Ledger State Machine RPCs
CREATE OR REPLACE FUNCTION public.begin_webhook_event_atomic(
  p_provider text,
  p_event_id text,
  p_payload_hash text,
  p_lease_ms bigint DEFAULT 30000
)
RETURNS TABLE(
  lease_status text,
  provider text,
  event_id text,
  state text,
  payload_hash text,
  attempts integer,
  locked_until timestamptz,
  last_error text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.webhook_processing_ledger%ROWTYPE;
  v_now timestamptz := now();
  v_lock_until timestamptz := v_now + (p_lease_ms || ' milliseconds')::interval;
BEGIN
  SELECT * INTO v_existing
  FROM public.webhook_processing_ledger w
  WHERE w.provider = p_provider AND w.event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.webhook_processing_ledger (
      provider, event_id, state, payload_hash, attempts, locked_until, updated_at
    ) VALUES (
      p_provider, p_event_id, 'PROCESSING', p_payload_hash, 1, v_lock_until, v_now
    )
    RETURNING * INTO v_existing;

    RETURN QUERY SELECT
      'ACQUIRED'::text,
      v_existing.provider, v_existing.event_id, v_existing.state, v_existing.payload_hash,
      v_existing.attempts, v_existing.locked_until, v_existing.last_error, v_existing.updated_at;
    RETURN;
  END IF;

  IF v_existing.state = 'PROCESSED' THEN
    RETURN QUERY SELECT
      'ALREADY_PROCESSED'::text,
      v_existing.provider, v_existing.event_id, v_existing.state, v_existing.payload_hash,
      v_existing.attempts, v_existing.locked_until, v_existing.last_error, v_existing.updated_at;
    RETURN;
  END IF;

  IF v_existing.state = 'PROCESSING' AND v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
    RETURN QUERY SELECT
      'IN_FLIGHT'::text,
      v_existing.provider, v_existing.event_id, v_existing.state, v_existing.payload_hash,
      v_existing.attempts, v_existing.locked_until, v_existing.last_error, v_existing.updated_at;
    RETURN;
  END IF;

  UPDATE public.webhook_processing_ledger w
  SET state = 'PROCESSING',
      payload_hash = p_payload_hash,
      attempts = v_existing.attempts + 1,
      locked_until = v_lock_until,
      updated_at = v_now
  WHERE w.provider = p_provider AND w.event_id = p_event_id
  RETURNING * INTO v_existing;

  RETURN QUERY SELECT
    'ACQUIRED'::text,
    v_existing.provider, v_existing.event_id, v_existing.state, v_existing.payload_hash,
    v_existing.attempts, v_existing.locked_until, v_existing.last_error, v_existing.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_webhook_event_atomic(
  p_provider text,
  p_event_id text,
  p_state text,
  p_last_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.webhook_processing_ledger
  SET state = p_state,
      locked_until = NULL,
      last_error = p_last_error,
      updated_at = now()
  WHERE provider = p_provider AND event_id = p_event_id;
END;
$$;

-- 4F. Atomic Mercado Pago payment transition RPC (blocks invalid backwards transitions)
CREATE OR REPLACE FUNCTION public.apply_mp_payment_transition_atomic(
  p_external_payment_id text,
  p_tenant_id uuid,
  p_next_status text,
  p_plan text,
  p_amount_cents bigint,
  p_currency text
)
RETURNS TABLE(applied boolean, previous_status text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text;
BEGIN
  SELECT m.current_status INTO v_prev
  FROM public.mp_payment_state_machine m
  WHERE m.external_payment_id = p_external_payment_id
  FOR UPDATE;

  IF v_prev IS NOT NULL THEN
    IF v_prev = p_next_status THEN
      RETURN QUERY SELECT true, v_prev, 'IDEMPOTENT_SAME_STATE';
      RETURN;
    END IF;

    -- Valid forward transitions only
    IF NOT (
      (v_prev IN ('pending', 'in_process', 'in_mediation', 'authorized') AND p_next_status IN ('approved', 'rejected', 'cancelled'))
      OR (v_prev = 'approved' AND p_next_status IN ('refunded', 'charged_back', 'cancelled'))
    ) THEN
      RETURN QUERY SELECT false, v_prev, 'INVALID_PAYMENT_STATE_TRANSITION';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.mp_payment_state_machine (
    external_payment_id, tenant_id, current_status, plan, amount_cents, currency, updated_at
  ) VALUES (
    p_external_payment_id, p_tenant_id, p_next_status, COALESCE(NULLIF(p_plan, ''), 'pro'), p_amount_cents, lower(COALESCE(p_currency, 'brl')), now()
  )
  ON CONFLICT (external_payment_id) DO UPDATE SET
    current_status = EXCLUDED.current_status,
    plan = EXCLUDED.plan,
    amount_cents = EXCLUDED.amount_cents,
    currency = EXCLUDED.currency,
    updated_at = now();

  INSERT INTO public.invoices (
    tenant_id, stripe_invoice_id, amount, currency, status
  ) VALUES (
    p_tenant_id,
    'mp_' || p_external_payment_id,
    p_amount_cents,
    lower(COALESCE(p_currency, 'brl')),
    CASE WHEN p_next_status = 'approved' THEN 'paid' ELSE p_next_status END
  )
  ON CONFLICT (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status;

  IF p_next_status = 'approved' THEN
    UPDATE public.tenants
    SET plan = COALESCE(NULLIF(p_plan, ''), 'pro'),
        subscription_status = 'active',
        updated_at = now()
    WHERE id = p_tenant_id;
  ELSIF p_next_status IN ('cancelled', 'rejected', 'refunded', 'charged_back') THEN
    UPDATE public.tenants
    SET plan = CASE WHEN p_next_status IN ('refunded', 'charged_back') THEN 'free' ELSE plan END,
        subscription_status = p_next_status,
        updated_at = now()
    WHERE id = p_tenant_id;
  END IF;

  RETURN QUERY SELECT true, v_prev, NULL::text;
END;
$$;

-- Restrict atomic service-role RPC execution strictly to service_role
REVOKE ALL ON FUNCTION public.append_fleet_audit_event_atomic(text, text, text, text, bigint, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_fleet_audit_event_atomic(text, text, text, text, bigint, text, text, text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.claim_provisioning_token_atomic(text, timestamptz, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_provisioning_token_atomic(text, timestamptz, text, text, text, text, text, text, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.record_ingested_batch_atomic(text, text, text, bigint, bigint, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ingested_batch_atomic(text, text, text, bigint, bigint, jsonb, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.append_remote_config_monotonic_atomic(text, text, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_remote_config_monotonic_atomic(text, text, integer, jsonb, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.begin_webhook_event_atomic(text, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_webhook_event_atomic(text, text, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.complete_webhook_event_atomic(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webhook_event_atomic(text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_mp_payment_transition_atomic(text, uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mp_payment_transition_atomic(text, uuid, text, text, bigint, text) TO service_role;
