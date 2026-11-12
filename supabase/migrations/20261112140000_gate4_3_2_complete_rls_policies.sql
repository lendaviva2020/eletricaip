-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 4.3.2 COMPLETE RLS POLICY HARDENING
-- Covers all 50 tables flagged by Supabase Security Advisor (`rls_enabled_no_policy`)
-- plus `industrial_dependency_edges` (replacing GUC setting with tenant_memberships).
-- Idempotent & safe for PostgreSQL 15/17 execution.
-- =============================================================================

-- 0. Harden Gate 3.8 diagnostic tables (replace app.current_organization_id GUC with tenant_memberships)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'industrial_dependency_edges') THEN
    DROP POLICY IF EXISTS "tenant_isolation_dependency_edges" ON public.industrial_dependency_edges;
    CREATE POLICY "tenant_isolation_dependency_edges"
      ON public.industrial_dependency_edges FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id::text = industrial_dependency_edges.organization_id
            AND tm.user_id = auth.uid()
        ) OR public.is_platform_admin()
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id::text = industrial_dependency_edges.organization_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')
        ) OR public.is_platform_admin()
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'industrial_diagnostic_records') THEN
    DROP POLICY IF EXISTS "tenant_isolation_diagnostic_records" ON public.industrial_diagnostic_records;
    CREATE POLICY "tenant_isolation_diagnostic_records"
      ON public.industrial_diagnostic_records FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id::text = industrial_diagnostic_records.organization_id
            AND tm.user_id = auth.uid()
        ) OR public.is_platform_admin()
      );
    DROP POLICY IF EXISTS "tenant_insert_diagnostic_records" ON public.industrial_diagnostic_records;
    CREATE POLICY "tenant_insert_diagnostic_records"
      ON public.industrial_diagnostic_records FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id::text = industrial_diagnostic_records.organization_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')
        ) OR public.is_platform_admin()
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'industrial_incident_rejected_hypotheses') THEN
    DROP POLICY IF EXISTS "tenant_isolation_rejected_hypotheses" ON public.industrial_incident_rejected_hypotheses;
    CREATE POLICY "tenant_isolation_rejected_hypotheses"
      ON public.industrial_incident_rejected_hypotheses FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id::text = industrial_incident_rejected_hypotheses.organization_id
            AND tm.user_id = auth.uid()
        ) OR public.is_platform_admin()
      );
    DROP POLICY IF EXISTS "tenant_insert_rejected_hypotheses" ON public.industrial_incident_rejected_hypotheses;
    CREATE POLICY "tenant_insert_rejected_hypotheses"
      ON public.industrial_incident_rejected_hypotheses FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id::text = industrial_incident_rejected_hypotheses.organization_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')
        ) OR public.is_platform_admin()
      );
  END IF;
END $$;

-- 1. User-owned tables (`user_id = auth.uid()`)
DROP POLICY IF EXISTS "Users manage own ai_conversations" ON public.ai_conversations;
CREATE POLICY "Users manage own ai_conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Users manage messages in own conversations" ON public.ai_messages;
CREATE POLICY "Users manage messages in own conversations"
  ON public.ai_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    ) OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Authenticated users read comments and manage own" ON public.comments;
CREATE POLICY "Authenticated users read comments and manage own"
  ON public.comments FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users write own comments" ON public.comments;
CREATE POLICY "Users write own comments"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users modify own comments" ON public.comments;
CREATE POLICY "Users modify own comments"
  ON public.comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());
DROP POLICY IF EXISTS "Users delete own comments" ON public.comments;
CREATE POLICY "Users delete own comments"
  ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Users view own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users view own subscriptions"
  ON public.user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Users view own subscription_audit_log" ON public.subscription_audit_log;
CREATE POLICY "Users view own subscription_audit_log"
  ON public.subscription_audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Users manage own voltai_feedback_votes" ON public.voltai_feedback_votes;
CREATE POLICY "Users manage own voltai_feedback_votes"
  ON public.voltai_feedback_votes FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Users view own voltai_learning_logs" ON public.voltai_learning_logs;
CREATE POLICY "Users view own voltai_learning_logs"
  ON public.voltai_learning_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- 2. Tenant-scoped tables (`tenant_id`)
DO $$
DECLARE
  t text;
  tenant_rw_tables text[] := ARRAY[
    'clients',
    'files',
    'project_folders',
    'knowledge_documents',
    'ai_electrical_config'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_rw_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid())
        OR public.is_platform_admin()
      )',
      'rls_select_' || t, t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_manage_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member''))
        OR public.is_platform_admin()
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member''))
        OR public.is_platform_admin()
      )',
      'rls_manage_' || t, t, t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "rls_select_tenant_settings" ON public.tenant_settings;
CREATE POLICY "rls_select_tenant_settings"
  ON public.tenant_settings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid())
    OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS "rls_manage_tenant_settings" ON public.tenant_settings;
CREATE POLICY "rls_manage_tenant_settings"
  ON public.tenant_settings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
    OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_audit_logs" ON public.audit_logs;
CREATE POLICY "rls_select_audit_logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = audit_logs.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'auditor'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_billing_events" ON public.billing_events;
CREATE POLICY "rls_select_billing_events"
  ON public.billing_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = billing_events.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_ai_status_events" ON public.ai_status_events;
CREATE POLICY "rls_select_ai_status_events"
  ON public.ai_status_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "rls_select_ai_usage_events" ON public.ai_usage_events;
CREATE POLICY "rls_select_ai_usage_events"
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "rls_select_iot_command_log" ON public.iot_command_log;
CREATE POLICY "rls_select_iot_command_log"
  ON public.iot_command_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = iot_command_log.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer'))
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_file_versions" ON public.file_versions;
CREATE POLICY "rls_select_file_versions"
  ON public.file_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.files f
      JOIN public.tenant_memberships tm ON tm.tenant_id = f.tenant_id
      WHERE f.id = file_versions.file_id AND tm.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS "rls_insert_file_versions" ON public.file_versions;
CREATE POLICY "rls_insert_file_versions"
  ON public.file_versions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.files f
      JOIN public.tenant_memberships tm ON tm.tenant_id = f.tenant_id
      WHERE f.id = file_versions.file_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    ) OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_knowledge_chunks" ON public.knowledge_chunks;
CREATE POLICY "rls_select_knowledge_chunks"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents kd
      JOIN public.tenant_memberships tm ON tm.tenant_id = kd.tenant_id
      WHERE kd.id = knowledge_chunks.document_id AND tm.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_user_fb_templates" ON public.user_function_block_templates;
CREATE POLICY "rls_select_user_fb_templates"
  ON public.user_function_block_templates FOR SELECT TO authenticated
  USING (
    is_public = true
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = user_function_block_templates.tenant_id AND tm.user_id = auth.uid())
    OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS "rls_manage_user_fb_templates" ON public.user_function_block_templates;
CREATE POLICY "rls_manage_user_fb_templates"
  ON public.user_function_block_templates FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = user_function_block_templates.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'member'))
    OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = user_function_block_templates.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'member'))
    OR public.is_platform_admin()
  );

-- 3. Project-scoped tables (`project_id` -> `public.projects.tenant_id`)
DO $$
DECLARE
  pt text;
  proj_tables text[] := ARRAY[
    'alarm_configs',
    'alarm_history',
    'calculations',
    'electrical_simulation_results',
    'function_block_instances',
    'project_bom_items',
    'simulation_tags',
    'simulations',
    'trend_configs',
    'twin_hotspots',
    'unifilar_ladder_mapping'
  ];
BEGIN
  FOREACH pt IN ARRAY proj_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || pt, pt);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = %I.project_id AND tm.user_id = auth.uid()
        ) OR public.is_platform_admin()
      )',
      'rls_select_' || pt, pt, pt
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_manage_' || pt, pt);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = %I.project_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member'')
        ) OR public.is_platform_admin()
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = %I.project_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member'')
        ) OR public.is_platform_admin()
      )',
      'rls_manage_' || pt, pt, pt, pt
    );
  END LOOP;
END $$;

-- Tag sample partitions
DO $$
DECLARE
  part_tbl text;
  part_tables text[] := ARRAY['tag_samples_2026_04', 'tag_samples_2026_05'];
BEGIN
  FOREACH part_tbl IN ARRAY part_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = part_tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || part_tbl, part_tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
          EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
            WHERE p.id = %I.project_id AND tm.user_id = auth.uid()
          ) OR public.is_platform_admin()
        )',
        'rls_select_' || part_tbl, part_tbl, part_tbl
      );
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_insert_' || part_tbl, part_tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
            WHERE p.id = %I.project_id AND tm.user_id = auth.uid() AND tm.role IN (''owner'', ''admin'', ''engineer'', ''operator'', ''member'')
          ) OR public.is_platform_admin()
        )',
        'rls_insert_' || part_tbl, part_tbl, part_tbl
      );
    END IF;
  END LOOP;
END $$;

-- Test scenarios & runs
DROP POLICY IF EXISTS "rls_select_test_scenarios" ON public.test_scenarios;
CREATE POLICY "rls_select_test_scenarios"
  ON public.test_scenarios FOR SELECT TO authenticated
  USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = test_scenarios.project_id AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS "rls_manage_test_scenarios" ON public.test_scenarios;
CREATE POLICY "rls_manage_test_scenarios"
  ON public.test_scenarios FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = test_scenarios.project_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    ) OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = test_scenarios.project_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    ) OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_test_scenario_runs" ON public.test_scenario_runs;
CREATE POLICY "rls_select_test_scenario_runs"
  ON public.test_scenario_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.test_scenarios ts
      JOIN public.projects p ON p.id = ts.project_id
      JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
      WHERE ts.id = test_scenario_runs.scenario_id AND tm.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS "rls_insert_test_scenario_runs" ON public.test_scenario_runs;
CREATE POLICY "rls_insert_test_scenario_runs"
  ON public.test_scenario_runs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.test_scenarios ts
      JOIN public.projects p ON p.id = ts.project_id
      JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
      WHERE ts.id = test_scenario_runs.scenario_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'engineer', 'operator', 'member')
    ) OR public.is_platform_admin()
  );

-- 4. IoT Device-scoped tables (`device_id` TEXT -> `public.iot_devices` UUID id / TEXT device_external_id)
DROP POLICY IF EXISTS "rls_select_iot_readings" ON public.iot_readings;
CREATE POLICY "rls_select_iot_readings"
  ON public.iot_readings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.iot_devices d
      JOIN public.tenant_memberships tm ON tm.tenant_id = d.tenant_id
      WHERE (d.id::text = iot_readings.device_id OR d.device_external_id = iot_readings.device_id)
        AND tm.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_select_iot_alerts" ON public.iot_alerts;
CREATE POLICY "rls_select_iot_alerts"
  ON public.iot_alerts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.iot_devices d
      JOIN public.tenant_memberships tm ON tm.tenant_id = d.tenant_id
      WHERE (d.id::text = iot_alerts.device_id OR d.device_external_id = iot_alerts.device_id)
        AND tm.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS "rls_update_iot_alerts" ON public.iot_alerts;
CREATE POLICY "rls_update_iot_alerts"
  ON public.iot_alerts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.iot_devices d
      JOIN public.tenant_memberships tm ON tm.tenant_id = d.tenant_id
      WHERE (d.id::text = iot_alerts.device_id OR d.device_external_id = iot_alerts.device_id)
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer', 'operator')
    ) OR public.is_platform_admin()
  );

-- 5. Read-only shared catalog / normative / public blog tables
DO $$
DECLARE
  rt text;
  auth_readonly_tables text[] := ARRAY[
    'catalog_component_categories',
    'catalog_manufacturers',
    'electrical_components',
    'normative_chunks',
    'normative_documents',
    'plant_telemetry',
    'voltai_training_scenarios',
    'feature_flags'
  ];
BEGIN
  FOREACH rt IN ARRAY auth_readonly_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_auth_read_' || rt, rt);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)',
      'rls_auth_read_' || rt, rt
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_admin_manage_' || rt, rt);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',
      'rls_admin_manage_' || rt, rt
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Public read blog_categories" ON public.blog_categories;
CREATE POLICY "Public read blog_categories"
  ON public.blog_categories FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS "Admin manage blog_categories" ON public.blog_categories;
CREATE POLICY "Admin manage blog_categories"
  ON public.blog_categories FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Public read published blog_posts" ON public.blog_posts;
CREATE POLICY "Public read published blog_posts"
  ON public.blog_posts FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.is_platform_admin());
DROP POLICY IF EXISTS "Admin manage blog_posts" ON public.blog_posts;
CREATE POLICY "Admin manage blog_posts"
  ON public.blog_posts FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 6. Explicit Fail-Closed Client Deny Policies on Internal / Service-Role-Only Tables
DROP POLICY IF EXISTS "deny_client_access_mp_webhook_processed" ON public.mp_webhook_processed;
CREATE POLICY "deny_client_access_mp_webhook_processed"
  ON public.mp_webhook_processed FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "deny_client_access_stripe_webhook_events"
  ON public.stripe_webhook_events FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DO $$
DECLARE
  internal_tbl text;
  internal_tables text[] := ARRAY[
    'gateway_certificate_challenges',
    'webhook_processing_ledger',
    'mp_payment_state_machine',
    'provisioning_station_bindings',
    'ota_signing_keys'
  ];
BEGIN
  FOREACH internal_tbl IN ARRAY internal_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = internal_tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'deny_client_access_' || internal_tbl, internal_tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        'deny_client_access_' || internal_tbl, internal_tbl
      );
    END IF;
  END LOOP;
END $$;
