-- Baseline RLS consolidation
-- Gerado a partir de pg_tables + pg_policies do banco real (schema public).
-- Objetivo: reprodutibilidade. Rodar esta migration contra o banco atual e um
-- NO-OP total (ENABLE RLS e idempotente; cada policy e recriada identica via
-- DROP POLICY IF EXISTS + CREATE POLICY copiado literalmente de pg_policies).
-- NAO altere a logica das policies aqui; este arquivo apenas documenta o estado
-- existente (65 tabelas com RLS, 168 policies, md5 d7d93fae16040874315883b6fb5f6100).

-- =====================================================================
-- 1) ENABLE ROW LEVEL SECURITY
-- =====================================================================
-- NOTA (2026-10-14): arquivo transformado para replay-safe.
-- Cada statement so executa se a tabela (e helpers referenciados)
-- existirem. Blocos com EXCEPTION WHEN undefined_table/column/function
-- apenas registram NOTICE e seguem (atomico por bloco: DROP sem CREATE
-- com sucesso e revertido junto). Nenhuma logica de policy foi alterada.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_credit_costs') THEN
    ALTER TABLE public.ai_credit_costs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_messages') THEN
    ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_rate_limit_configs') THEN
    ALTER TABLE public.ai_rate_limit_configs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_status_events') THEN
    ALTER TABLE public.ai_status_events ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_usage_events') THEN
    ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_configs') THEN
    ALTER TABLE public.alarm_configs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_history') THEN
    ALTER TABLE public.alarm_history ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_events') THEN
    ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_categories') THEN
    ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_posts') THEN
    ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'calculations') THEN
    ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_component_categories') THEN
    ALTER TABLE public.catalog_component_categories ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components') THEN
    ALTER TABLE public.catalog_components ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_manufacturers') THEN
    ALTER TABLE public.catalog_manufacturers ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients') THEN
    ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diagrams') THEN
    ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'electrical_components') THEN
    ALTER TABLE public.electrical_components ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feature_flags') THEN
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_versions') THEN
    ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files') THEN
    ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'function_block_instances') THEN
    ALTER TABLE public.function_block_instances ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites') THEN
    ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_alerts') THEN
    ALTER TABLE public.iot_alerts ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_command_log') THEN
    ALTER TABLE public.iot_command_log ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_devices') THEN
    ALTER TABLE public.iot_devices ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_readings') THEN
    ALTER TABLE public.iot_readings ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_chunks') THEN
    ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents') THEN
    ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mp_webhook_processed') THEN
    ALTER TABLE public.mp_webhook_processed ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'normative_chunks') THEN
    ALTER TABLE public.normative_chunks ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'normative_documents') THEN
    ALTER TABLE public.normative_documents ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plan_limits') THEN
    ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plant_telemetry') THEN
    ALTER TABLE public.plant_telemetry ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_bom_items') THEN
    ALTER TABLE public.project_bom_items ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_folders') THEN
    ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions') THEN
    ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'runtime_logs') THEN
    ALTER TABLE public.runtime_logs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulation_tags') THEN
    ALTER TABLE public.simulation_tags ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulations') THEN
    ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stripe_webhook_events') THEN
    ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_audit_log') THEN
    ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_templates') THEN
    ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples') THEN
    ALTER TABLE public.tag_samples ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples_2026_04') THEN
    ALTER TABLE public.tag_samples_2026_04 ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples_2026_05') THEN
    ALTER TABLE public.tag_samples_2026_05 ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_settings') THEN
    ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trend_configs') THEN
    ALTER TABLE public.trend_configs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usage_records') THEN
    ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_function_block_templates') THEN
    ALTER TABLE public.user_function_block_templates ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_subscriptions') THEN
    ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_feedback_votes') THEN
    ALTER TABLE public.voltai_feedback_votes ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_learning_logs') THEN
    ALTER TABLE public.voltai_learning_logs ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_training_scenarios') THEN
    ALTER TABLE public.voltai_training_scenarios ENABLE ROW LEVEL SECURITY;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;


-- =====================================================================
-- 2) POLICIES (copia literal de pg_policies)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can create conversations" ON public.ai_conversations;
    EXECUTE $policy$
      CREATE POLICY "Users can create conversations" ON public.ai_conversations AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can delete own conversations" ON public.ai_conversations;
    EXECUTE $policy$
      CREATE POLICY "Users can delete own conversations" ON public.ai_conversations AS PERMISSIVE FOR DELETE TO public
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can update own conversations" ON public.ai_conversations;
    EXECUTE $policy$
      CREATE POLICY "Users can update own conversations" ON public.ai_conversations AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((user_id = auth.uid()))
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can view own conversations" ON public.ai_conversations;
    EXECUTE $policy$
      CREATE POLICY "Users can view own conversations" ON public.ai_conversations AS PERMISSIVE FOR SELECT TO public
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_credit_costs')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "ai_credit_costs admin write" ON public.ai_credit_costs;
    EXECUTE $policy$
      CREATE POLICY "ai_credit_costs admin write" ON public.ai_credit_costs AS PERMISSIVE FOR ALL TO authenticated
        USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_credit_costs') THEN
    DROP POLICY IF EXISTS "ai_credit_costs read for authenticated" ON public.ai_credit_costs;
    EXECUTE $policy$
      CREATE POLICY "ai_credit_costs read for authenticated" ON public.ai_credit_costs AS PERMISSIVE FOR SELECT TO authenticated
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_messages')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can insert messages in own conversations" ON public.ai_messages;
    EXECUTE $policy$
      CREATE POLICY "Users can insert messages in own conversations" ON public.ai_messages AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM ai_conversations
        WHERE ((ai_conversations.id = ai_messages.conversation_id) AND (ai_conversations.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_messages')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.ai_messages;
    EXECUTE $policy$
      CREATE POLICY "Users can view messages in own conversations" ON public.ai_messages AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM ai_conversations
        WHERE ((ai_conversations.id = ai_messages.conversation_id) AND (ai_conversations.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_rate_limit_configs')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "platform admins can delete rate limit configs" ON public.ai_rate_limit_configs;
    EXECUTE $policy$
      CREATE POLICY "platform admins can delete rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR DELETE TO authenticated
        USING (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_rate_limit_configs')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "platform admins can insert rate limit configs" ON public.ai_rate_limit_configs;
    EXECUTE $policy$
      CREATE POLICY "platform admins can insert rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_rate_limit_configs')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "platform admins can read rate limit configs" ON public.ai_rate_limit_configs;
    EXECUTE $policy$
      CREATE POLICY "platform admins can read rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR SELECT TO authenticated
        USING (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_rate_limit_configs')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "platform admins can update rate limit configs" ON public.ai_rate_limit_configs;
    EXECUTE $policy$
      CREATE POLICY "platform admins can update rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR UPDATE TO authenticated
        USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_status_events')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "members can read tenant ai events" ON public.ai_status_events;
    EXECUTE $policy$
      CREATE POLICY "members can read tenant ai events" ON public.ai_status_events AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = ai_status_events.tenant_id) AND (tm.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_status_events')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "users insert own tenant ai events" ON public.ai_status_events;
    EXECUTE $policy$
      CREATE POLICY "users insert own tenant ai events" ON public.ai_status_events AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = ai_status_events.tenant_id) AND (tm.user_id = auth.uid()))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_usage_events')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "tenant members read own ai usage events" ON public.ai_usage_events;
    EXECUTE $policy$
      CREATE POLICY "tenant members read own ai usage events" ON public.ai_usage_events AS PERMISSIVE FOR SELECT TO authenticated
        USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can delete alarm configs in accessible projects" ON public.alarm_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can delete alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can manage alarm configs in accessible projects" ON public.alarm_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can manage alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can read alarm configs in accessible projects" ON public.alarm_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can read alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can update alarm configs in accessible projects" ON public.alarm_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can update alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR UPDATE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_history')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can insert alarm history in accessible projects" ON public.alarm_history;
    EXECUTE $policy$
      CREATE POLICY "Users can insert alarm history in accessible projects" ON public.alarm_history AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_history')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can read alarm history in accessible projects" ON public.alarm_history;
    EXECUTE $policy$
      CREATE POLICY "Users can read alarm history in accessible projects" ON public.alarm_history AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alarm_history')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can update alarm history in accessible projects" ON public.alarm_history;
    EXECUTE $policy$
      CREATE POLICY "Users can update alarm history in accessible projects" ON public.alarm_history AS PERMISSIVE FOR UPDATE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can view API keys in their tenant" ON public.api_keys;
    EXECUTE $policy$
      CREATE POLICY "Admins can view API keys in their tenant" ON public.api_keys AS PERMISSIVE FOR SELECT TO authenticated
        USING (((get_user_tenant_id() = tenant_id) AND (get_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Users can create their own API keys" ON public.api_keys;
    EXECUTE $policy$
      CREATE POLICY "Users can create their own API keys" ON public.api_keys AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (((user_id = auth.uid()) AND (tenant_id = get_user_tenant_id())));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;
    EXECUTE $policy$
      CREATE POLICY "Users can delete their own API keys" ON public.api_keys AS PERMISSIVE FOR DELETE TO authenticated
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;
    EXECUTE $policy$
      CREATE POLICY "Users can update their own API keys" ON public.api_keys AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((user_id = auth.uid()))
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
    EXECUTE $policy$
      CREATE POLICY "Users can view their own API keys" ON public.api_keys AS PERMISSIVE FOR SELECT TO authenticated
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
    EXECUTE $policy$
      CREATE POLICY "Admins can view audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_events')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can view billing events" ON public.billing_events;
    EXECUTE $policy$
      CREATE POLICY "Admins can view billing events" ON public.billing_events AS PERMISSIVE FOR SELECT TO public
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_categories') THEN
    DROP POLICY IF EXISTS "Anyone can read blog categories" ON public.blog_categories;
    EXECUTE $policy$
      CREATE POLICY "Anyone can read blog categories" ON public.blog_categories AS PERMISSIVE FOR SELECT TO public
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_categories')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "Platform admins can manage blog categories" ON public.blog_categories;
    EXECUTE $policy$
      CREATE POLICY "Platform admins can manage blog categories" ON public.blog_categories AS PERMISSIVE FOR ALL TO authenticated
        USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_posts') THEN
    DROP POLICY IF EXISTS "Anyone can read published blog posts" ON public.blog_posts;
    EXECUTE $policy$
      CREATE POLICY "Anyone can read published blog posts" ON public.blog_posts AS PERMISSIVE FOR SELECT TO public
        USING ((status = 'published'::text));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_posts')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "Platform admins can manage blog posts" ON public.blog_posts;
    EXECUTE $policy$
      CREATE POLICY "Platform admins can manage blog posts" ON public.blog_posts AS PERMISSIVE FOR ALL TO authenticated
        USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'calculations')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can manage calculations" ON public.calculations;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can manage calculations" ON public.calculations AS PERMISSIVE FOR ALL TO authenticated
        USING (((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = calculations.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
        WITH CHECK (((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = calculations.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'calculations')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view calculations" ON public.calculations;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view calculations" ON public.calculations AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = calculations.project_id) AND (projects.tenant_id = get_user_tenant_id())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_component_categories')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_categories_delete_admin ON public.catalog_component_categories;
    EXECUTE $policy$
      CREATE POLICY catalog_categories_delete_admin ON public.catalog_component_categories AS PERMISSIVE FOR DELETE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_component_categories')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_categories_insert_admin ON public.catalog_component_categories;
    EXECUTE $policy$
      CREATE POLICY catalog_categories_insert_admin ON public.catalog_component_categories AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_component_categories') THEN
    DROP POLICY IF EXISTS catalog_categories_select_auth ON public.catalog_component_categories;
    EXECUTE $policy$
      CREATE POLICY catalog_categories_select_auth ON public.catalog_component_categories AS PERMISSIVE FOR SELECT TO authenticated
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_component_categories')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_categories_update_admin ON public.catalog_component_categories;
    EXECUTE $policy$
      CREATE POLICY catalog_categories_update_admin ON public.catalog_component_categories AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_components_delete_admin ON public.catalog_components;
    EXECUTE $policy$
      CREATE POLICY catalog_components_delete_admin ON public.catalog_components AS PERMISSIVE FOR DELETE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_components_insert_admin ON public.catalog_components;
    EXECUTE $policy$
      CREATE POLICY catalog_components_insert_admin ON public.catalog_components AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components') THEN
    DROP POLICY IF EXISTS catalog_components_select_auth ON public.catalog_components;
    EXECUTE $policy$
      CREATE POLICY catalog_components_select_auth ON public.catalog_components AS PERMISSIVE FOR SELECT TO authenticated
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_components_update_admin ON public.catalog_components;
    EXECUTE $policy$
      CREATE POLICY catalog_components_update_admin ON public.catalog_components AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_manufacturers')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_manufacturers_delete_admin ON public.catalog_manufacturers;
    EXECUTE $policy$
      CREATE POLICY catalog_manufacturers_delete_admin ON public.catalog_manufacturers AS PERMISSIVE FOR DELETE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_manufacturers')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_manufacturers_insert_admin ON public.catalog_manufacturers;
    EXECUTE $policy$
      CREATE POLICY catalog_manufacturers_insert_admin ON public.catalog_manufacturers AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_manufacturers') THEN
    DROP POLICY IF EXISTS catalog_manufacturers_select_auth ON public.catalog_manufacturers;
    EXECUTE $policy$
      CREATE POLICY catalog_manufacturers_select_auth ON public.catalog_manufacturers AS PERMISSIVE FOR SELECT TO authenticated
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_manufacturers')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS catalog_manufacturers_update_admin ON public.catalog_manufacturers;
    EXECUTE $policy$
      CREATE POLICY catalog_manufacturers_update_admin ON public.catalog_manufacturers AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ can delete clients" ON public.clients;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can delete clients" ON public.clients AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ can insert clients" ON public.clients;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can insert clients" ON public.clients AS PERMISSIVE FOR INSERT TO public
        WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ can update clients" ON public.clients;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can update clients" ON public.clients AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant members can view clients" ON public.clients;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
    EXECUTE $policy$
      CREATE POLICY "Users can delete own comments" ON public.comments AS PERMISSIVE FOR DELETE TO authenticated
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    DROP POLICY IF EXISTS "Users can insert their own comments" ON public.comments;
    EXECUTE $policy$
      CREATE POLICY "Users can insert their own comments" ON public.comments AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
    EXECUTE $policy$
      CREATE POLICY "Users can update own comments" ON public.comments AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((user_id = auth.uid()))
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    DROP POLICY IF EXISTS "Users can view their own comments" ON public.comments;
    EXECUTE $policy$
      CREATE POLICY "Users can view their own comments" ON public.comments AS PERMISSIVE FOR SELECT TO authenticated
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diagrams')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can manage diagrams" ON public.diagrams;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can manage diagrams" ON public.diagrams AS PERMISSIVE FOR ALL TO authenticated
        USING (((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = diagrams.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
        WITH CHECK (((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = diagrams.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diagrams')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view diagrams" ON public.diagrams;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view diagrams" ON public.diagrams AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = diagrams.project_id) AND (projects.tenant_id = get_user_tenant_id())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'electrical_components') THEN
    DROP POLICY IF EXISTS "Anyone can read components" ON public.electrical_components;
    EXECUTE $policy$
      CREATE POLICY "Anyone can read components" ON public.electrical_components AS PERMISSIVE FOR SELECT TO public
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feature_flags')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "Platform admins can manage feature flags" ON public.feature_flags;
    EXECUTE $policy$
      CREATE POLICY "Platform admins can manage feature flags" ON public.feature_flags AS PERMISSIVE FOR ALL TO authenticated
        USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feature_flags')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin') THEN
    DROP POLICY IF EXISTS "Platform admins can view feature flags" ON public.feature_flags;
    EXECUTE $policy$
      CREATE POLICY "Platform admins can view feature flags" ON public.feature_flags AS PERMISSIVE FOR SELECT TO authenticated
        USING (is_platform_admin());
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant admins can delete file versions" ON public.file_versions;
    EXECUTE $policy$
      CREATE POLICY "Tenant admins can delete file versions" ON public.file_versions AS PERMISSIVE FOR DELETE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM (files f
           JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
        WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant admins can update file versions" ON public.file_versions;
    EXECUTE $policy$
      CREATE POLICY "Tenant admins can update file versions" ON public.file_versions AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM (files f
           JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
        WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM (files f
           JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
        WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant members can insert file versions" ON public.file_versions;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can insert file versions" ON public.file_versions AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
         FROM (files f
           JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
        WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view file versions" ON public.file_versions;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view file versions" ON public.file_versions AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM files
        WHERE ((files.id = file_versions.file_id) AND (files.tenant_id = get_user_tenant_id())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can manage files" ON public.files;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can manage files" ON public.files AS PERMISSIVE FOR ALL TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view files" ON public.files;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view files" ON public.files AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'function_block_instances')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can delete function blocks in accessible projects" ON public.function_block_instances;
    EXECUTE $policy$
      CREATE POLICY "Users can delete function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'function_block_instances')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can insert function blocks in accessible projects" ON public.function_block_instances;
    EXECUTE $policy$
      CREATE POLICY "Users can insert function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'function_block_instances')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can manage function blocks in accessible projects" ON public.function_block_instances;
    EXECUTE $policy$
      CREATE POLICY "Users can manage function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'function_block_instances')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can update function blocks in accessible projects" ON public.function_block_instances;
    EXECUTE $policy$
      CREATE POLICY "Users can update function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR UPDATE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can delete invites" ON public.invites;
    EXECUTE $policy$
      CREATE POLICY "Admins can delete invites" ON public.invites AS PERMISSIVE FOR DELETE TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can insert invites" ON public.invites;
    EXECUTE $policy$
      CREATE POLICY "Admins can insert invites" ON public.invites AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can list invite metadata" ON public.invites;
    EXECUTE $policy$
      CREATE POLICY "Admins can list invite metadata" ON public.invites AS PERMISSIVE FOR SELECT TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can update invites" ON public.invites;
    EXECUTE $policy$
      CREATE POLICY "Admins can update invites" ON public.invites AS PERMISSIVE FOR UPDATE TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)))
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can view invoices" ON public.invoices;
    EXECUTE $policy$
      CREATE POLICY "Admins can view invoices" ON public.invoices AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "tenant admins read invoices" ON public.invoices;
    EXECUTE $policy$
      CREATE POLICY "tenant admins read invoices" ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = invoices.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_alerts')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_devices')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant members can delete alerts for their devices" ON public.iot_alerts;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can delete alerts for their devices" ON public.iot_alerts AS PERMISSIVE FOR DELETE TO public
        USING ((device_id IN ( SELECT d.id
         FROM iot_devices d
        WHERE (d.tenant_id IN ( SELECT tm.tenant_id
                 FROM tenant_memberships tm
                WHERE (tm.user_id = auth.uid()))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_alerts')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_devices')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can view alerts of their tenant devices" ON public.iot_alerts;
    EXECUTE $policy$
      CREATE POLICY "Users can view alerts of their tenant devices" ON public.iot_alerts AS PERMISSIVE FOR SELECT TO public
        USING ((device_id IN ( SELECT iot_devices.id
         FROM iot_devices
        WHERE (iot_devices.tenant_id IN ( SELECT tenant_memberships.tenant_id
                 FROM tenant_memberships
                WHERE (tenant_memberships.user_id = auth.uid()))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_command_log')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ can insert command log" ON public.iot_command_log;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can insert command log" ON public.iot_command_log AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
         FROM tenant_memberships tm
        WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_command_log')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ can update command log" ON public.iot_command_log;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can update command log" ON public.iot_command_log AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((tenant_id IN ( SELECT tm.tenant_id
         FROM tenant_memberships tm
        WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
        WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
         FROM tenant_memberships tm
        WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_command_log')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can view command log of their tenant" ON public.iot_command_log;
    EXECUTE $policy$
      CREATE POLICY "Users can view command log of their tenant" ON public.iot_command_log AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id IN ( SELECT tenant_memberships.tenant_id
         FROM tenant_memberships
        WHERE (tenant_memberships.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_devices')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can view devices of their tenant" ON public.iot_devices;
    EXECUTE $policy$
      CREATE POLICY "Users can view devices of their tenant" ON public.iot_devices AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id IN ( SELECT tenant_memberships.tenant_id
         FROM tenant_memberships
        WHERE (tenant_memberships.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_readings') THEN
    DROP POLICY IF EXISTS "Block client deletes on iot_readings" ON public.iot_readings;
    EXECUTE $policy$
      CREATE POLICY "Block client deletes on iot_readings" ON public.iot_readings AS RESTRICTIVE FOR DELETE TO anon, authenticated
        USING (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_readings') THEN
    DROP POLICY IF EXISTS "Block client inserts on iot_readings" ON public.iot_readings;
    EXECUTE $policy$
      CREATE POLICY "Block client inserts on iot_readings" ON public.iot_readings AS RESTRICTIVE FOR INSERT TO anon, authenticated
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_readings') THEN
    DROP POLICY IF EXISTS "Block client updates on iot_readings" ON public.iot_readings;
    EXECUTE $policy$
      CREATE POLICY "Block client updates on iot_readings" ON public.iot_readings AS RESTRICTIVE FOR UPDATE TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_readings')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'iot_devices')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can view readings of their tenant devices" ON public.iot_readings;
    EXECUTE $policy$
      CREATE POLICY "Users can view readings of their tenant devices" ON public.iot_readings AS PERMISSIVE FOR SELECT TO public
        USING ((device_id IN ( SELECT iot_devices.id
         FROM iot_devices
        WHERE (iot_devices.tenant_id IN ( SELECT tenant_memberships.tenant_id
                 FROM tenant_memberships
                WHERE (tenant_memberships.user_id = auth.uid()))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_chunks')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks;
    EXECUTE $policy$
      CREATE POLICY "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks AS PERMISSIVE FOR ALL TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM knowledge_documents kd
        WHERE ((kd.id = knowledge_chunks.document_id) AND (kd.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM knowledge_documents kd
        WHERE ((kd.id = knowledge_chunks.document_id) AND (kd.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_chunks')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view knowledge chunks" ON public.knowledge_chunks;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view knowledge chunks" ON public.knowledge_chunks AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM knowledge_documents kd
        WHERE ((kd.id = knowledge_chunks.document_id) AND (kd.tenant_id = get_user_tenant_id())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers plus can manage knowledge documents" ON public.knowledge_documents;
    EXECUTE $policy$
      CREATE POLICY "Engineers plus can manage knowledge documents" ON public.knowledge_documents AS PERMISSIVE FOR ALL TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view knowledge documents" ON public.knowledge_documents;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view knowledge documents" ON public.knowledge_documents AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mp_webhook_processed') THEN
    DROP POLICY IF EXISTS "No client access mp_webhook_processed" ON public.mp_webhook_processed;
    EXECUTE $policy$
      CREATE POLICY "No client access mp_webhook_processed" ON public.mp_webhook_processed AS PERMISSIVE FOR ALL TO public
        USING (false)
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'normative_chunks') THEN
    DROP POLICY IF EXISTS "Authenticated users can read normative chunks" ON public.normative_chunks;
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read normative chunks" ON public.normative_chunks AS PERMISSIVE FOR SELECT TO authenticated
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'normative_chunks') THEN
    DROP POLICY IF EXISTS "Service role can manage normative chunks" ON public.normative_chunks;
    EXECUTE $policy$
      CREATE POLICY "Service role can manage normative chunks" ON public.normative_chunks AS PERMISSIVE FOR ALL TO service_role
        USING (true)
        WITH CHECK (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'normative_documents') THEN
    DROP POLICY IF EXISTS "Authenticated users can read normative documents" ON public.normative_documents;
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read normative documents" ON public.normative_documents AS PERMISSIVE FOR SELECT TO authenticated
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'normative_documents') THEN
    DROP POLICY IF EXISTS "Service role can manage normative documents" ON public.normative_documents;
    EXECUTE $policy$
      CREATE POLICY "Service role can manage normative documents" ON public.normative_documents AS PERMISSIVE FOR ALL TO service_role
        USING (true)
        WITH CHECK (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Users can insert notifications for themselves" ON public.notifications;
    EXECUTE $policy$
      CREATE POLICY "Users can insert notifications for themselves" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (((user_id = auth.uid()) AND (tenant_id = get_user_tenant_id())));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
    EXECUTE $policy$
      CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((user_id = auth.uid()))
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
    EXECUTE $policy$
      CREATE POLICY "Users can view their own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plan_limits') THEN
    DROP POLICY IF EXISTS "Anyone can read plan limits" ON public.plan_limits;
    EXECUTE $policy$
      CREATE POLICY "Anyone can read plan limits" ON public.plan_limits AS PERMISSIVE FOR SELECT TO public
        USING (true);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plant_telemetry') THEN
    DROP POLICY IF EXISTS plant_telemetry_no_client_access ON public.plant_telemetry;
    EXECUTE $policy$
      CREATE POLICY plant_telemetry_no_client_access ON public.plant_telemetry AS PERMISSIVE FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Only superadmins can modify platform_admins" ON public.platform_admins;
    EXECUTE $policy$
      CREATE POLICY "Only superadmins can modify platform_admins" ON public.platform_admins AS PERMISSIVE FOR ALL TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE ((pa.user_id = auth.uid()) AND (pa.role = 'superadmin'::text)))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE ((pa.user_id = auth.uid()) AND (pa.role = 'superadmin'::text)))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Platform admins can view platform_admins" ON public.platform_admins;
    EXECUTE $policy$
      CREATE POLICY "Platform admins can view platform_admins" ON public.platform_admins AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
    EXECUTE $policy$
      CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
    EXECUTE $policy$
      CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((id = auth.uid()))
        WITH CHECK ((id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
    EXECUTE $policy$
      CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
        USING ((id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_bom_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ delete BOM" ON public.project_bom_items;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ delete BOM" ON public.project_bom_items AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM (projects p
           JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
        WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_bom_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ insert BOM" ON public.project_bom_items;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ insert BOM" ON public.project_bom_items AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM (projects p
           JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
        WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_bom_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ update BOM" ON public.project_bom_items;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ update BOM" ON public.project_bom_items AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM (projects p
           JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
        WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM (projects p
           JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
        WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_bom_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant members view BOM" ON public.project_bom_items;
    EXECUTE $policy$
      CREATE POLICY "Tenant members view BOM" ON public.project_bom_items AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM (projects p
           JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
        WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_folders')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can manage folders" ON public.project_folders;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can manage folders" ON public.project_folders AS PERMISSIVE FOR ALL TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_folders')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view folders" ON public.project_folders;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view folders" ON public.project_folders AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can delete versions" ON public.project_versions;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can delete versions" ON public.project_versions AS PERMISSIVE FOR DELETE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = project_versions.project_id) AND (p.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can insert versions" ON public.project_versions;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can insert versions" ON public.project_versions AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = project_versions.project_id) AND (p.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view versions" ON public.project_versions;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view versions" ON public.project_versions AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects
        WHERE ((projects.id = project_versions.project_id) AND (projects.tenant_id = get_user_tenant_id())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
    EXECUTE $policy$
      CREATE POLICY "Admins can delete projects" ON public.projects AS PERMISSIVE FOR DELETE TO public
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can create projects" ON public.projects;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can create projects" ON public.projects AS PERMISSIVE FOR INSERT TO public
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Engineers+ can update projects" ON public.projects;
    EXECUTE $policy$
      CREATE POLICY "Engineers+ can update projects" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view projects" ON public.projects;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view projects" ON public.projects AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'runtime_logs') THEN
    DROP POLICY IF EXISTS "Users insert own runtime_logs" ON public.runtime_logs;
    EXECUTE $policy$
      CREATE POLICY "Users insert own runtime_logs" ON public.runtime_logs AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'runtime_logs') THEN
    DROP POLICY IF EXISTS "Users view own runtime_logs" ON public.runtime_logs;
    EXECUTE $policy$
      CREATE POLICY "Users view own runtime_logs" ON public.runtime_logs AS PERMISSIVE FOR SELECT TO public
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulation_tags')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can delete simulation tags in accessible projects" ON public.simulation_tags;
    EXECUTE $policy$
      CREATE POLICY "Users can delete simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulation_tags')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can insert simulation tags in accessible projects" ON public.simulation_tags;
    EXECUTE $policy$
      CREATE POLICY "Users can insert simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulation_tags')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can read simulation tags in accessible projects" ON public.simulation_tags;
    EXECUTE $policy$
      CREATE POLICY "Users can read simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulation_tags')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can update simulation tags in accessible projects" ON public.simulation_tags;
    EXECUTE $policy$
      CREATE POLICY "Users can update simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR UPDATE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulations')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can create simulations in their projects" ON public.simulations;
    EXECUTE $policy$
      CREATE POLICY "Users can create simulations in their projects" ON public.simulations AS PERMISSIVE FOR INSERT TO public
        WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid()))))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulations')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can delete simulations in their projects" ON public.simulations;
    EXECUTE $policy$
      CREATE POLICY "Users can delete simulations in their projects" ON public.simulations AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulations')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can update simulations in their projects" ON public.simulations;
    EXECUTE $policy$
      CREATE POLICY "Users can update simulations in their projects" ON public.simulations AS PERMISSIVE FOR UPDATE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulations')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can view simulations in their projects" ON public.simulations;
    EXECUTE $policy$
      CREATE POLICY "Users can view simulations in their projects" ON public.simulations AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stripe_webhook_events') THEN
    DROP POLICY IF EXISTS "No client access stripe_webhook_events" ON public.stripe_webhook_events;
    EXECUTE $policy$
      CREATE POLICY "No client access stripe_webhook_events" ON public.stripe_webhook_events AS PERMISSIVE FOR ALL TO public
        USING (false)
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_audit_log') THEN
    DROP POLICY IF EXISTS subscription_audit_log_select_own ON public.subscription_audit_log;
    EXECUTE $policy$
      CREATE POLICY subscription_audit_log_select_own ON public.subscription_audit_log AS PERMISSIVE FOR SELECT TO authenticated
        USING ((auth.uid() = user_id));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can view subscription" ON public.subscriptions;
    EXECUTE $policy$
      CREATE POLICY "Admins can view subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "tenant admins read subscriptions" ON public.subscriptions;
    EXECUTE $policy$
      CREATE POLICY "tenant admins read subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = subscriptions.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_templates') THEN
    DROP POLICY IF EXISTS "Authenticated users can read builtin templates" ON public.system_templates;
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read builtin templates" ON public.system_templates AS PERMISSIVE FOR SELECT TO authenticated
        USING (((is_builtin = true) OR (created_by = auth.uid())));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_templates') THEN
    DROP POLICY IF EXISTS "Users can delete own templates" ON public.system_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can delete own templates" ON public.system_templates AS PERMISSIVE FOR DELETE TO authenticated
        USING (((created_by = auth.uid()) AND (is_builtin = false)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_templates')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Users can insert templates in their tenant" ON public.system_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can insert templates in their tenant" ON public.system_templates AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (((created_by = auth.uid()) AND (tenant_id = get_user_tenant_id())));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_templates') THEN
    DROP POLICY IF EXISTS "Users can update own templates" ON public.system_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can update own templates" ON public.system_templates AS PERMISSIVE FOR UPDATE TO authenticated
        USING (((created_by = auth.uid()) AND (is_builtin = false)))
        WITH CHECK (((created_by = auth.uid()) AND (is_builtin = false)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can insert tag samples in accessible projects" ON public.tag_samples;
    EXECUTE $policy$
      CREATE POLICY "Users can insert tag samples in accessible projects" ON public.tag_samples AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = tag_samples.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can read tag samples in accessible projects" ON public.tag_samples;
    EXECUTE $policy$
      CREATE POLICY "Users can read tag samples in accessible projects" ON public.tag_samples AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = tag_samples.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples_2026_04') THEN
    DROP POLICY IF EXISTS _no_client_writes ON public.tag_samples_2026_04;
    EXECUTE $policy$
      CREATE POLICY _no_client_writes ON public.tag_samples_2026_04 AS RESTRICTIVE FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples_2026_04')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS tag_samples_2026_04_select_members ON public.tag_samples_2026_04;
    EXECUTE $policy$
      CREATE POLICY tag_samples_2026_04_select_members ON public.tag_samples_2026_04 AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM projects pr
        WHERE ((pr.id = tag_samples_2026_04.project_id) AND ((pr.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = pr.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples_2026_05') THEN
    DROP POLICY IF EXISTS _no_client_writes ON public.tag_samples_2026_05;
    EXECUTE $policy$
      CREATE POLICY _no_client_writes ON public.tag_samples_2026_05 AS RESTRICTIVE FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tag_samples_2026_05')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS tag_samples_2026_05_select_members ON public.tag_samples_2026_05;
    EXECUTE $policy$
      CREATE POLICY tag_samples_2026_05_select_members ON public.tag_samples_2026_05 AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM projects pr
        WHERE ((pr.id = tag_samples_2026_05.project_id) AND ((pr.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = pr.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;
    EXECUTE $policy$
      CREATE POLICY "Admins can manage memberships" ON public.tenant_memberships AS PERMISSIVE FOR ALL TO authenticated
        USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)))
        WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Members can view own tenant memberships" ON public.tenant_memberships;
    EXECUTE $policy$
      CREATE POLICY "Members can view own tenant memberships" ON public.tenant_memberships AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_settings')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "admins can delete tenant settings" ON public.tenant_settings;
    EXECUTE $policy$
      CREATE POLICY "admins can delete tenant settings" ON public.tenant_settings AS PERMISSIVE FOR DELETE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_settings')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "admins can insert tenant settings" ON public.tenant_settings;
    EXECUTE $policy$
      CREATE POLICY "admins can insert tenant settings" ON public.tenant_settings AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_settings')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "admins can update tenant settings" ON public.tenant_settings;
    EXECUTE $policy$
      CREATE POLICY "admins can update tenant settings" ON public.tenant_settings AS PERMISSIVE FOR UPDATE TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_settings')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "members can read tenant settings" ON public.tenant_settings;
    EXECUTE $policy$
      CREATE POLICY "members can read tenant settings" ON public.tenant_settings AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM tenant_memberships tm
        WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_role')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can update tenant" ON public.tenants;
    EXECUTE $policy$
      CREATE POLICY "Admins can update tenant" ON public.tenants AS PERMISSIVE FOR UPDATE TO authenticated
        USING (((id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)))
        WITH CHECK (((id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
    EXECUTE $policy$
      CREATE POLICY "Users can view own tenant" ON public.tenants AS PERMISSIVE FOR SELECT TO public
        USING ((id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trend_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can delete trend configs in accessible projects" ON public.trend_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can delete trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR DELETE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trend_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can insert trend configs in accessible projects" ON public.trend_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can insert trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trend_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can manage trend configs in accessible projects" ON public.trend_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can manage trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trend_configs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can update trend configs in accessible projects" ON public.trend_configs;
    EXECUTE $policy$
      CREATE POLICY "Users can update trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR UPDATE TO public
        USING ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM projects p
        WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
                 FROM tenant_memberships tm
                WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usage_records')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Tenant members can view usage" ON public.usage_records;
    EXECUTE $policy$
      CREATE POLICY "Tenant members can view usage" ON public.usage_records AS PERMISSIVE FOR SELECT TO public
        USING ((tenant_id = get_user_tenant_id()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_function_block_templates')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can create FB templates in their tenant" ON public.user_function_block_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can create FB templates in their tenant" ON public.user_function_block_templates AS PERMISSIVE FOR INSERT TO public
        WITH CHECK (((tenant_id IN ( SELECT tm.tenant_id
         FROM tenant_memberships tm
        WHERE (tm.user_id = auth.uid()))) AND (created_by = auth.uid())));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_function_block_templates') THEN
    DROP POLICY IF EXISTS "Users can delete own FB templates" ON public.user_function_block_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can delete own FB templates" ON public.user_function_block_templates AS PERMISSIVE FOR DELETE TO public
        USING ((created_by = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_function_block_templates')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Users can read public or own tenant FB templates" ON public.user_function_block_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can read public or own tenant FB templates" ON public.user_function_block_templates AS PERMISSIVE FOR SELECT TO public
        USING (((is_public = true) OR (tenant_id IN ( SELECT tm.tenant_id
         FROM tenant_memberships tm
        WHERE (tm.user_id = auth.uid())))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_function_block_templates') THEN
    DROP POLICY IF EXISTS "Users can update own FB templates" ON public.user_function_block_templates;
    EXECUTE $policy$
      CREATE POLICY "Users can update own FB templates" ON public.user_function_block_templates AS PERMISSIVE FOR UPDATE TO public
        USING ((created_by = auth.uid()))
        WITH CHECK ((created_by = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_subscriptions') THEN
    DROP POLICY IF EXISTS user_subscriptions_select_own ON public.user_subscriptions;
    EXECUTE $policy$
      CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions AS PERMISSIVE FOR SELECT TO authenticated
        USING ((auth.uid() = user_id));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_feedback_votes')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Admins can view all feedback" ON public.voltai_feedback_votes;
    EXECUTE $policy$
      CREATE POLICY "Admins can view all feedback" ON public.voltai_feedback_votes AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM platform_admins
        WHERE (platform_admins.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_feedback_votes') THEN
    DROP POLICY IF EXISTS "Users can insert own feedback" ON public.voltai_feedback_votes;
    EXECUTE $policy$
      CREATE POLICY "Users can insert own feedback" ON public.voltai_feedback_votes AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_feedback_votes') THEN
    DROP POLICY IF EXISTS "Users can view own feedback" ON public.voltai_feedback_votes;
    EXECUTE $policy$
      CREATE POLICY "Users can view own feedback" ON public.voltai_feedback_votes AS PERMISSIVE FOR SELECT TO public
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_learning_logs')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Admins can view all learning logs" ON public.voltai_learning_logs;
    EXECUTE $policy$
      CREATE POLICY "Admins can view all learning logs" ON public.voltai_learning_logs AS PERMISSIVE FOR SELECT TO public
        USING ((EXISTS ( SELECT 1
         FROM platform_admins
        WHERE (platform_admins.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_learning_logs') THEN
    DROP POLICY IF EXISTS "Users can insert own learning logs" ON public.voltai_learning_logs;
    EXECUTE $policy$
      CREATE POLICY "Users can insert own learning logs" ON public.voltai_learning_logs AS PERMISSIVE FOR INSERT TO public
        WITH CHECK ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_learning_logs') THEN
    DROP POLICY IF EXISTS "Users can view own learning logs" ON public.voltai_learning_logs;
    EXECUTE $policy$
      CREATE POLICY "Users can view own learning logs" ON public.voltai_learning_logs AS PERMISSIVE FOR SELECT TO public
        USING ((user_id = auth.uid()));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_training_scenarios')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Admins can manage training scenarios" ON public.voltai_training_scenarios;
    EXECUTE $policy$
      CREATE POLICY "Admins can manage training scenarios" ON public.voltai_training_scenarios AS PERMISSIVE FOR ALL TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins
        WHERE (platform_admins.user_id = auth.uid()))))
        WITH CHECK ((EXISTS ( SELECT 1
         FROM platform_admins
        WHERE (platform_admins.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_training_scenarios')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Platform admins can read training scenarios" ON public.voltai_training_scenarios;
    EXECUTE $policy$
      CREATE POLICY "Platform admins can read training scenarios" ON public.voltai_training_scenarios AS PERMISSIVE FOR SELECT TO authenticated
        USING ((EXISTS ( SELECT 1
         FROM platform_admins pa
        WHERE (pa.user_id = auth.uid()))));
    $policy$;
  END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
    RAISE NOTICE 'baseline skip (objeto ausente): %', SQLERRM;
END $$;
