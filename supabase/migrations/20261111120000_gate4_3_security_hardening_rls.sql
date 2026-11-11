-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 4.3 SECURITY HARDENING & RLS CORRECTION
-- Corrective migration (local repository artifact; NOT applied to remote prod).
-- Fixes:
--   P0-08: Enable RLS on observability_slo_definitions + policies on observability_alert_policies
--   Gate 3.7: Replace broken `auth.jwt() ->> 'tenant_id'::uuid` & JWT claim trust with membership queries
--   Gate 3.8: Replace connection-scoped GUC `app.current_organization_id` with authenticated membership RLS
--             and pin `SET search_path = public` on SECURITY DEFINER trigger function
--   Gate 3.6: Restrict `for all` policies so `viewer` cannot mutate industrial_* canonical tables,
--             and make `industrial_historian_samples` & `industrial_alarm_transitions` append-only for users
--   Core DDL: Drop permissive `Members can view tenant api keys/invites` & viewer write policies
-- =============================================================================

-- 1. P0-08: observability_slo_definitions & observability_alert_policies
ALTER TABLE IF EXISTS public.observability_slo_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read SLO definitions" ON public.observability_slo_definitions;
CREATE POLICY "Authenticated users read SLO definitions"
  ON public.observability_slo_definitions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Platform admins manage SLO definitions" ON public.observability_slo_definitions;
CREATE POLICY "Platform admins manage SLO definitions"
  ON public.observability_slo_definitions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE IF EXISTS public.observability_alert_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read observability alert policies" ON public.observability_alert_policies;
CREATE POLICY "Tenant members read observability alert policies"
  ON public.observability_alert_policies
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_alert_policies.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Tenant admins manage observability alert policies" ON public.observability_alert_policies;
CREATE POLICY "Tenant admins manage observability alert policies"
  ON public.observability_alert_policies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_alert_policies.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_alert_policies.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    OR public.is_platform_admin()
  );

-- 2. Gate 3.7: Corrigir policies quebradas com `'tenant_id'::uuid` e trust de JWT role
DROP POLICY IF EXISTS "Users can view health snapshots of own tenant" ON public.observability_health_snapshots;
CREATE POLICY "Users can view health snapshots of own tenant"
  ON public.observability_health_snapshots
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_health_snapshots.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Users can view incidents of own tenant" ON public.observability_incidents;
CREATE POLICY "Users can view incidents of own tenant"
  ON public.observability_incidents
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_incidents.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Engineers and Admins can update incidents of own tenant" ON public.observability_incidents;
CREATE POLICY "Engineers and Admins can update incidents of own tenant"
  ON public.observability_incidents
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_incidents.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_incidents.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Users can view incident transitions of own tenant" ON public.observability_incident_transitions;
CREATE POLICY "Users can view incident transitions of own tenant"
  ON public.observability_incident_transitions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_incident_transitions.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Users can view SLO measurements of own tenant" ON public.observability_slo_measurements;
CREATE POLICY "Users can view SLO measurements of own tenant"
  ON public.observability_slo_measurements
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_slo_measurements.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Users can view pipeline checkpoints of own tenant" ON public.observability_pipeline_checkpoints;
CREATE POLICY "Users can view pipeline checkpoints of own tenant"
  ON public.observability_pipeline_checkpoints
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = observability_pipeline_checkpoints.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

-- 3. Gate 3.8: Corrigir GUC `app.current_organization_id` e SEARCH_PATH da função SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.prevent_immutable_diagnostic_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_DIAGNOSTIC_STORE_VIOLATION: Operacao % proibida na tabela %.', TG_OP, TG_TABLE_NAME;
END;
$$;

DROP POLICY IF EXISTS "tenant_isolation_diagnostic_records" ON public.industrial_diagnostic_records;
CREATE POLICY "tenant_isolation_diagnostic_records"
  ON public.industrial_diagnostic_records
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = industrial_diagnostic_records.organization_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_insert_diagnostic_records" ON public.industrial_diagnostic_records;
CREATE POLICY "tenant_insert_diagnostic_records"
  ON public.industrial_diagnostic_records
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = industrial_diagnostic_records.organization_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_isolation_rejected_hypotheses" ON public.industrial_incident_rejected_hypotheses;
CREATE POLICY "tenant_isolation_rejected_hypotheses"
  ON public.industrial_incident_rejected_hypotheses
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = industrial_incident_rejected_hypotheses.organization_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_insert_rejected_hypotheses" ON public.industrial_incident_rejected_hypotheses;
CREATE POLICY "tenant_insert_rejected_hypotheses"
  ON public.industrial_incident_rejected_hypotheses
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = industrial_incident_rejected_hypotheses.organization_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    )
    OR public.is_platform_admin()
  );

-- 4. Core DDL hardening: restringir leitura de api_keys/invites e escrita de viewer
DROP POLICY IF EXISTS "Members can view tenant api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can view tenant api keys" ON public.api_keys;
CREATE POLICY "Admins can view tenant api keys"
  ON public.api_keys
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Members can view tenant invites" ON public.invites;
DROP POLICY IF EXISTS "Admins can view tenant invites" ON public.invites;
CREATE POLICY "Admins can view tenant invites"
  ON public.invites
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Members can create tenant projects" ON public.projects;
CREATE POLICY "Engineers+ can create tenant projects"
  ON public.projects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
    AND (created_by = auth.uid() OR created_by IS NULL)
  );

DROP POLICY IF EXISTS "Members can update tenant projects" ON public.projects;
CREATE POLICY "Engineers+ can update tenant projects"
  ON public.projects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  );

DROP POLICY IF EXISTS "Members can manage diagrams of tenant projects" ON public.diagrams;
CREATE POLICY "Engineers+ can manage diagrams of tenant projects"
  ON public.diagrams
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = diagrams.project_id
        AND p.tenant_id = public.get_user_tenant_id()
    )
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = diagrams.project_id
        AND p.tenant_id = public.get_user_tenant_id()
    )
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  );

DROP POLICY IF EXISTS "Members can manage tenant iot devices" ON public.iot_devices;
CREATE POLICY "Engineers+ can manage tenant iot devices"
  ON public.iot_devices
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  );

DROP POLICY IF EXISTS "Members can insert tenant tag samples" ON public.tag_samples;
CREATE POLICY "Engineers+ can insert tenant tag samples"
  ON public.tag_samples
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tag_samples.project_id
        AND p.tenant_id = public.get_user_tenant_id()
    )
    AND public.get_user_role() IN ('owner', 'admin', 'engineer', 'operator', 'member')
  );

-- 5. Gate 3.6: Impedir escrita por viewer nas tabelas canônicas industriais
DO $$
DECLARE
  tbl text;
  canonical_tables text[] := ARRAY[
    'industrial_plants',
    'industrial_sectors',
    'industrial_equipments',
    'industrial_equipment_revisions',
    'industrial_tags',
    'industrial_tag_revisions',
    'industrial_tag_bindings',
    'industrial_gateways',
    'industrial_gateway_tag_sources',
    'industrial_alarm_definitions',
    'industrial_alarm_occurrences'
  ];
BEGIN
  FOREACH tbl IN ARRAY canonical_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_' || tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid())
        OR public.is_platform_admin()
      )',
      'tenant_select_' || tbl, tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member''))
        OR public.is_platform_admin()
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member''))
        OR public.is_platform_admin()
      )',
      'tenant_write_' || tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- Append-only enforcement on historical telemetry & alarm state transitions
DROP POLICY IF EXISTS "tenant_isolation_industrial_historian_samples" ON public.industrial_historian_samples;
CREATE POLICY "tenant_select_industrial_historian_samples"
  ON public.industrial_historian_samples FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = industrial_historian_samples.tenant_id AND tm.user_id = auth.uid())
    OR public.is_platform_admin()
  );
CREATE POLICY "tenant_insert_industrial_historian_samples"
  ON public.industrial_historian_samples FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = industrial_historian_samples.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_isolation_industrial_alarm_transitions" ON public.industrial_alarm_transitions;
CREATE POLICY "tenant_select_industrial_alarm_transitions"
  ON public.industrial_alarm_transitions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = industrial_alarm_transitions.tenant_id AND tm.user_id = auth.uid())
    OR public.is_platform_admin()
  );
CREATE POLICY "tenant_insert_industrial_alarm_transitions"
  ON public.industrial_alarm_transitions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = industrial_alarm_transitions.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member'))
    OR public.is_platform_admin()
  );
