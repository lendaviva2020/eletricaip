-- Migration: Core Tables DDL & Multi-tenant Foundation
-- Consolidação do schema canônico para as 55 tabelas do ElétricAi
-- Totalmente replay-safe (IF NOT EXISTS / DO $$ blocos de constraints e índices)

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alarm_category') THEN
    CREATE TYPE public.alarm_category AS ENUM ('process', 'equipment', 'safety', 'communication');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alarm_severity') THEN
    CREATE TYPE public.alarm_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alarm_state') THEN
    CREATE TYPE public.alarm_state AS ENUM ('active', 'acknowledged', 'cleared', 'suppressed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_level') THEN
    CREATE TYPE public.alert_level AS ENUM ('critical', 'warning', 'info');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'iot_command_state') THEN
    CREATE TYPE public.iot_command_state AS ENUM ('PENDING', 'DELIVERED', 'ACKED', 'EXECUTED', 'FAILED', 'TIMED_OUT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sensor_kind') THEN
    CREATE TYPE public.sensor_kind AS ENUM ('temperature', 'pressure', 'current', 'vibration', 'flow');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'simulation_tag_data_type') THEN
    CREATE TYPE public.simulation_tag_data_type AS ENUM ('BOOL', 'INT', 'REAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE public.subscription_plan AS ENUM ('FREE', 'PRO', 'INDUSTRIAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'expired', 'trialing');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_category') THEN
    CREATE TYPE public.template_category AS ENUM ('conveyor', 'pumping', 'exhaust', 'panel', 'hvac', 'tank_farm', 'custom');
  END IF;
END $$;

-- 3. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. TABELAS (CREATE TABLE IF NOT EXISTS)

-- Table: tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  created_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  plan text NOT NULL,
  settings jsonb DEFAULT '{}'::jsonb,
  slug text NOT NULL,
  status text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;

-- Table: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  full_name text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  locale text NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb,
  role text NOT NULL,
  tenant_id uuid,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- Table: tenant_memberships
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  invited_by uuid,
  role text NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON public.tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON public.tenant_memberships(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_memberships TO authenticated;

-- Table: project_folders
CREATE TABLE IF NOT EXISTS public.project_folders (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  parent_id uuid,
  tenant_id uuid NOT NULL
);
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_project_folders_tenant_id ON public.project_folders(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_folders TO authenticated;

-- Table: projects
CREATE TABLE IF NOT EXISTS public.projects (
  client_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  description text,
  folder_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  name text NOT NULL,
  status text NOT NULL,
  tenant_id uuid NOT NULL,
  twin_model_path text,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS twin_model_path text;
DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON public.projects(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;

-- Table: diagrams
CREATE TABLE IF NOT EXISTS public.diagrams (
  canvas_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  project_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  version integer NOT NULL
);
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_diagrams_updated_at ON public.diagrams;
CREATE TRIGGER trg_diagrams_updated_at BEFORE UPDATE ON public.diagrams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_diagrams_project_id ON public.diagrams(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagrams TO authenticated;

-- Table: plan_limits
CREATE TABLE IF NOT EXISTS public.plan_limits (
  features jsonb DEFAULT '{}'::jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  max_ai_tokens_month integer NOT NULL,
  max_projects integer NOT NULL,
  max_storage_mb integer NOT NULL,
  max_users integer NOT NULL,
  plan text NOT NULL
);
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_limits TO authenticated;

-- Table: ai_conversations
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid,
  title text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_ai_conversations_updated_at ON public.ai_conversations;
CREATE TRIGGER trg_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_ai_conversations_project_id ON public.ai_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;

-- Table: ai_messages
CREATE TABLE IF NOT EXISTS public.ai_messages (
  content text NOT NULL,
  conversation_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  role text NOT NULL,
  tokens_used integer,
  tool_calls jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;

-- Table: alarm_configs
CREATE TABLE IF NOT EXISTS public.alarm_configs (
  area text NOT NULL,
  auto_clear boolean DEFAULT false NOT NULL,
  category public.alarm_category NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  deadband double precision,
  delay_ms double precision NOT NULL,
  description text NOT NULL,
  equipment_type text NOT NULL,
  high_high_limit double precision,
  high_limit double precision,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  location text NOT NULL,
  low_limit double precision,
  low_low_limit double precision,
  notify_on_ack boolean DEFAULT false NOT NULL,
  notify_on_clear boolean DEFAULT false NOT NULL,
  notify_on_trigger boolean DEFAULT false NOT NULL,
  project_id uuid NOT NULL,
  require_acknowledgment boolean DEFAULT false NOT NULL,
  severity public.alarm_severity NOT NULL,
  suppressible boolean DEFAULT false NOT NULL,
  tag_name text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.alarm_configs ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_alarm_configs_updated_at ON public.alarm_configs;
CREATE TRIGGER trg_alarm_configs_updated_at BEFORE UPDATE ON public.alarm_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_alarm_configs_project_id ON public.alarm_configs(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alarm_configs TO authenticated;

-- Table: alarm_history
CREATE TABLE IF NOT EXISTS public.alarm_history (
  acknowledged_at timestamptz,
  acknowledged_by text,
  alarm_config_id uuid,
  area text NOT NULL,
  category public.alarm_category NOT NULL,
  cleared_at timestamptz,
  cleared_by text,
  description text NOT NULL,
  equipment_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  location text NOT NULL,
  message text,
  operator_note text,
  project_id uuid NOT NULL,
  setpoint double precision,
  severity public.alarm_severity NOT NULL,
  state public.alarm_state NOT NULL,
  tag_name text NOT NULL,
  triggered_at timestamptz NOT NULL,
  value double precision
);
ALTER TABLE public.alarm_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_alarm_history_project_id ON public.alarm_history(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alarm_history TO authenticated;

-- Table: api_keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  key_hash text NOT NULL,
  last_used_at timestamptz,
  name text NOT NULL,
  prefix text NOT NULL,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  tenant_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER trg_api_keys_updated_at BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON public.api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  action text NOT NULL,
  chain_hash text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  ip_address inet NOT NULL,
  previous_hash text,
  resource_id text,
  resource_type text NOT NULL,
  tenant_id uuid,
  user_agent text,
  user_id uuid
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;

-- Table: billing_events
CREATE TABLE IF NOT EXISTS public.billing_events (
  amount double precision,
  created_at timestamptz DEFAULT now() NOT NULL,
  currency text,
  event_type text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  stripe_event_id text,
  stripe_invoice_id text,
  tenant_id uuid NOT NULL
);
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_billing_events_tenant_id ON public.billing_events(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_events TO authenticated;

-- Table: blog_categories
CREATE TABLE IF NOT EXISTS public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name jsonb DEFAULT '{}'::jsonb NOT NULL,
  slug text NOT NULL
);
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_categories TO authenticated;

-- Table: blog_posts
CREATE TABLE IF NOT EXISTS public.blog_posts (
  author_id uuid,
  category_id uuid,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  cover_image text,
  created_at timestamptz DEFAULT now() NOT NULL,
  excerpt text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  published_at timestamptz,
  seo_metadata jsonb DEFAULT '{}'::jsonb,
  slug text NOT NULL,
  status text NOT NULL,
  title jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;

-- Table: calculations
CREATE TABLE IF NOT EXISTS public.calculations (
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  inputs jsonb DEFAULT '{}'::jsonb NOT NULL,
  project_id uuid NOT NULL,
  results jsonb DEFAULT '{}'::jsonb NOT NULL,
  type text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_calculations_updated_at ON public.calculations;
CREATE TRIGGER trg_calculations_updated_at BEFORE UPDATE ON public.calculations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_calculations_project_id ON public.calculations(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculations TO authenticated;

-- Table: catalog_component_categories
CREATE TABLE IF NOT EXISTS public.catalog_component_categories (
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  parent_id uuid
);
ALTER TABLE public.catalog_component_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_component_categories TO authenticated;

-- Table: catalog_components
CREATE TABLE IF NOT EXISTS public.catalog_components (
  category_id uuid NOT NULL,
  certifications text[] DEFAULT '{}'::text[],
  commercial_name text,
  created_at timestamptz DEFAULT now() NOT NULL,
  datasheet_url text,
  description text,
  discontinued boolean DEFAULT false NOT NULL,
  embedding text,
  etim_class text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  image_urls text[] DEFAULT '{}'::text[],
  keywords text[] DEFAULT '{}'::text[] NOT NULL,
  list_price_brl double precision,
  manufacturer_id uuid NOT NULL,
  part_number text NOT NULL,
  rated_current_a double precision,
  rated_voltage_v double precision,
  specs jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.catalog_components ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_catalog_components_updated_at ON public.catalog_components;
CREATE TRIGGER trg_catalog_components_updated_at BEFORE UPDATE ON public.catalog_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_components TO authenticated;

-- Table: catalog_manufacturers
CREATE TABLE IF NOT EXISTS public.catalog_manufacturers (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  logo_url text,
  name text NOT NULL,
  website text
);
ALTER TABLE public.catalog_manufacturers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_manufacturers TO authenticated;

-- Table: comments
CREATE TABLE IF NOT EXISTS public.comments (
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  parent_id uuid,
  resource_id text NOT NULL,
  resource_type text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_comments_updated_at ON public.comments;
CREATE TRIGGER trg_comments_updated_at BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;

-- Table: electrical_components
CREATE TABLE IF NOT EXISTS public.electrical_components (
  category text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  datasheet_url text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  manufacturer text NOT NULL,
  model text NOT NULL,
  specifications jsonb DEFAULT '{}'::jsonb NOT NULL,
  symbol_svg text
);
ALTER TABLE public.electrical_components ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.electrical_components TO authenticated;

-- Table: feature_flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  enabled boolean DEFAULT false NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  tenant_ids text[] DEFAULT '{}'::text[],
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;

-- Table: file_versions
CREATE TABLE IF NOT EXISTS public.file_versions (
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  file_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  storage_path text NOT NULL,
  version_number double precision NOT NULL
);
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_versions TO authenticated;

-- Table: files
CREATE TABLE IF NOT EXISTS public.files (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  mime_type text,
  name text NOT NULL,
  project_id uuid NOT NULL,
  size_bytes double precision,
  storage_path text NOT NULL,
  tenant_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  uploaded_by text NOT NULL,
  version integer NOT NULL
);
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_files_updated_at ON public.files;
CREATE TRIGGER trg_files_updated_at BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_files_tenant_id ON public.files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON public.files(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;

-- Table: function_block_instances
CREATE TABLE IF NOT EXISTS public.function_block_instances (
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  instance_name text NOT NULL,
  pin_bindings jsonb DEFAULT '{}'::jsonb NOT NULL,
  project_id uuid NOT NULL,
  template_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.function_block_instances ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_function_block_instances_updated_at ON public.function_block_instances;
CREATE TRIGGER trg_function_block_instances_updated_at BEFORE UPDATE ON public.function_block_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_function_block_instances_project_id ON public.function_block_instances(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.function_block_instances TO authenticated;

-- Table: invites
CREATE TABLE IF NOT EXISTS public.invites (
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  invited_name text,
  invited_sector text,
  role text NOT NULL,
  tenant_id uuid NOT NULL,
  token text NOT NULL
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invites_tenant_id ON public.invites(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;

-- Table: invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  amount double precision NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  currency text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  pdf_url text,
  status text NOT NULL,
  stripe_invoice_id text,
  tenant_id uuid NOT NULL
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON public.invoices(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;

-- Table: iot_alerts
CREATE TABLE IF NOT EXISTS public.iot_alerts (
  created_at timestamptz DEFAULT now(),
  device_id text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  is_resolved boolean DEFAULT false,
  level public.alert_level NOT NULL,
  message text NOT NULL,
  timestamp timestamptz NOT NULL,
  value double precision
);
ALTER TABLE public.iot_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_alerts TO authenticated;

-- Table: iot_command_log
CREATE TABLE IF NOT EXISTS public.iot_command_log (
  acked_at timestamptz,
  command text NOT NULL,
  command_id text NOT NULL,
  delivered_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz,
  fail_safe_on_timeout boolean DEFAULT false NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  requested_at timestamptz NOT NULL,
  requested_by text,
  result_message text,
  state public.iot_command_state NOT NULL,
  target_device text NOT NULL,
  tenant_id uuid NOT NULL,
  watchdog_timeout_ms double precision NOT NULL
);
ALTER TABLE public.iot_command_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_iot_command_log_tenant_id ON public.iot_command_log(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_command_log TO authenticated;

-- Table: iot_devices
CREATE TABLE IF NOT EXISTS public.iot_devices (
  created_at timestamptz DEFAULT now(),
  device_external_id text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  kind public.sensor_kind,
  metadata jsonb DEFAULT '{}'::jsonb,
  name text NOT NULL,
  tenant_id uuid
);
ALTER TABLE public.iot_devices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_iot_devices_tenant_id ON public.iot_devices(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_devices TO authenticated;

-- Table: iot_readings
CREATE TABLE IF NOT EXISTS public.iot_readings (
  created_at timestamptz DEFAULT now(),
  device_id text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  ingested_at timestamptz NOT NULL,
  message_id text,
  quality text NOT NULL,
  seq double precision,
  timestamp timestamptz NOT NULL,
  ttl_ms double precision NOT NULL,
  value double precision NOT NULL
);
ALTER TABLE public.iot_readings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_readings TO authenticated;

-- Table: knowledge_chunks
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  chunk_text text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  document_id uuid NOT NULL,
  embedding text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;

-- Table: knowledge_documents
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  source_id text,
  source_type text NOT NULL,
  tenant_id uuid
);
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_id ON public.knowledge_documents(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;

-- Table: mp_webhook_processed
CREATE TABLE IF NOT EXISTS public.mp_webhook_processed (
  payment_id text NOT NULL,
  processed_at timestamptz NOT NULL
);
ALTER TABLE public.mp_webhook_processed ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mp_webhook_processed TO authenticated;

-- Table: normative_chunks
CREATE TABLE IF NOT EXISTS public.normative_chunks (
  category text NOT NULL,
  chunk_text text NOT NULL,
  chunk_vector text,
  created_at timestamptz DEFAULT now() NOT NULL,
  document_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.normative_chunks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.normative_chunks TO authenticated;

-- Table: normative_documents
CREATE TABLE IF NOT EXISTS public.normative_documents (
  code text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  section text,
  source_type text NOT NULL,
  title text NOT NULL,
  version text
);
ALTER TABLE public.normative_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.normative_documents TO authenticated;

-- Table: plant_telemetry
CREATE TABLE IF NOT EXISTS public.plant_telemetry (
  last_updated text,
  tag_id text NOT NULL,
  value double precision
);
ALTER TABLE public.plant_telemetry ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_telemetry TO authenticated;

-- Table: project_versions
CREATE TABLE IF NOT EXISTS public.project_versions (
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  version_number double precision NOT NULL
);
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON public.project_versions(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;

-- Table: simulation_tags
CREATE TABLE IF NOT EXISTS public.simulation_tags (
  created_at timestamptz DEFAULT now() NOT NULL,
  current_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  data_type public.simulation_tag_data_type NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  initial_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_updated text NOT NULL,
  project_id uuid NOT NULL,
  quality text NOT NULL,
  tag_name text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.simulation_tags ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_simulation_tags_updated_at ON public.simulation_tags;
CREATE TRIGGER trg_simulation_tags_updated_at BEFORE UPDATE ON public.simulation_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_simulation_tags_project_id ON public.simulation_tags(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_tags TO authenticated;

-- Table: simulations
CREATE TABLE IF NOT EXISTS public.simulations (
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  description text,
  error_message text,
  execution_time_ms double precision,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
  project_id uuid NOT NULL,
  results jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text NOT NULL,
  type text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_simulations_updated_at ON public.simulations;
CREATE TRIGGER trg_simulations_updated_at BEFORE UPDATE ON public.simulations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_simulations_project_id ON public.simulations(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulations TO authenticated;

-- Table: stripe_webhook_events
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text NOT NULL,
  event_type text,
  processed_at timestamptz NOT NULL
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_webhook_events TO authenticated;

-- Table: subscription_audit_log
CREATE TABLE IF NOT EXISTS public.subscription_audit_log (
  action text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  new_plan_type public.subscription_plan,
  new_status public.subscription_status,
  old_plan_type public.subscription_plan,
  old_status public.subscription_status,
  reason text,
  user_id uuid NOT NULL
);
ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_subscription_audit_log_user_id ON public.subscription_audit_log(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_audit_log TO authenticated;

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  created_at timestamptz DEFAULT now() NOT NULL,
  current_period_end text,
  current_period_start text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  plan text NOT NULL,
  status text NOT NULL,
  stripe_subscription_id text,
  tenant_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

-- Table: system_templates
CREATE TABLE IF NOT EXISTS public.system_templates (
  category public.template_category NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid,
  description text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  is_builtin boolean DEFAULT false NOT NULL,
  name text NOT NULL,
  template_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  tenant_id uuid,
  thumbnail_url text,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_system_templates_updated_at ON public.system_templates;
CREATE TRIGGER trg_system_templates_updated_at BEFORE UPDATE ON public.system_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_system_templates_tenant_id ON public.system_templates(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_templates TO authenticated;

-- Table: tag_samples
CREATE TABLE IF NOT EXISTS public.tag_samples (
  id bigint PRIMARY KEY NOT NULL,
  project_id uuid NOT NULL,
  quality text NOT NULL,
  sampled_at timestamptz NOT NULL,
  tag_name text NOT NULL,
  value double precision NOT NULL
);
ALTER TABLE public.tag_samples ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tag_samples_project_id ON public.tag_samples(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_samples TO authenticated;

-- Table: tag_samples_2026_04
CREATE TABLE IF NOT EXISTS public.tag_samples_2026_04 (
  id bigint PRIMARY KEY NOT NULL,
  project_id uuid NOT NULL,
  quality text NOT NULL,
  sampled_at timestamptz NOT NULL,
  tag_name text NOT NULL,
  value double precision NOT NULL
);
ALTER TABLE public.tag_samples_2026_04 ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tag_samples_2026_04_project_id ON public.tag_samples_2026_04(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_samples_2026_04 TO authenticated;

-- Table: tag_samples_2026_05
CREATE TABLE IF NOT EXISTS public.tag_samples_2026_05 (
  id bigint PRIMARY KEY NOT NULL,
  project_id uuid NOT NULL,
  quality text NOT NULL,
  sampled_at timestamptz NOT NULL,
  tag_name text NOT NULL,
  value double precision NOT NULL
);
ALTER TABLE public.tag_samples_2026_05 ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tag_samples_2026_05_project_id ON public.tag_samples_2026_05(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_samples_2026_05 TO authenticated;

-- Table: trend_configs
CREATE TABLE IF NOT EXISTS public.trend_configs (
  chart_type text NOT NULL,
  color_map jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  period_seconds double precision NOT NULL,
  project_id uuid NOT NULL,
  sample_rate_ms double precision NOT NULL,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.trend_configs ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_trend_configs_updated_at ON public.trend_configs;
CREATE TRIGGER trg_trend_configs_updated_at BEFORE UPDATE ON public.trend_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_trend_configs_project_id ON public.trend_configs(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trend_configs TO authenticated;

-- Table: usage_records
CREATE TABLE IF NOT EXISTS public.usage_records (
  ai_tokens_used double precision NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  period text NOT NULL,
  simulations_run double precision NOT NULL,
  storage_used_mb double precision NOT NULL,
  tenant_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_usage_records_updated_at ON public.usage_records;
CREATE TRIGGER trg_usage_records_updated_at BEFORE UPDATE ON public.usage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_id ON public.usage_records(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_records TO authenticated;

-- Table: user_function_block_templates
CREATE TABLE IF NOT EXISTS public.user_function_block_templates (
  category text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  description text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  name text NOT NULL,
  pins jsonb DEFAULT '{}'::jsonb NOT NULL,
  structured_text text NOT NULL,
  tenant_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  version integer NOT NULL
);
ALTER TABLE public.user_function_block_templates ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_user_function_block_templates_updated_at ON public.user_function_block_templates;
CREATE TRIGGER trg_user_function_block_templates_updated_at BEFORE UPDATE ON public.user_function_block_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_user_function_block_templates_tenant_id ON public.user_function_block_templates(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_function_block_templates TO authenticated;

-- Table: user_subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  created_at timestamptz DEFAULT now() NOT NULL,
  current_period_end text NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  plan_type public.subscription_plan NOT NULL,
  status public.subscription_status NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_end text,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_subscriptions TO authenticated;

-- Table: voltai_feedback_votes
CREATE TABLE IF NOT EXISTS public.voltai_feedback_votes (
  corrected_components jsonb DEFAULT '{}'::jsonb,
  correction_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  learning_log_id uuid NOT NULL,
  user_id uuid NOT NULL,
  vote_type text NOT NULL
);
ALTER TABLE public.voltai_feedback_votes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_voltai_feedback_votes_user_id ON public.voltai_feedback_votes(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voltai_feedback_votes TO authenticated;

-- Table: voltai_learning_logs
CREATE TABLE IF NOT EXISTS public.voltai_learning_logs (
  corrections_applied text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now() NOT NULL,
  generation_id text NOT NULL,
  generation_time_ms double precision,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  is_synthetic boolean DEFAULT false NOT NULL,
  is_training_eligible boolean DEFAULT false NOT NULL,
  overall_quality_score double precision,
  project_data jsonb DEFAULT '{}'::jsonb,
  prompt text NOT NULL,
  prompt_complexity_score double precision,
  quality_completeness_score double precision,
  quality_compliance_score double precision,
  quality_layout_score double precision,
  quality_optimization_score double precision,
  repair_attempts double precision NOT NULL,
  system_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  tokens_used integer,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid NOT NULL,
  validation_issues jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.voltai_learning_logs ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_voltai_learning_logs_updated_at ON public.voltai_learning_logs;
CREATE TRIGGER trg_voltai_learning_logs_updated_at BEFORE UPDATE ON public.voltai_learning_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_voltai_learning_logs_user_id ON public.voltai_learning_logs(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voltai_learning_logs TO authenticated;

-- Table: voltai_training_scenarios
CREATE TABLE IF NOT EXISTS public.voltai_training_scenarios (
  category text NOT NULL,
  complexity_level double precision NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expected_components text[] DEFAULT '{}'::text[],
  expected_wires text[] DEFAULT '{}'::text[],
  generation_count double precision NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  prompt_template text NOT NULL,
  success_rate double precision,
  validation_rules jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.voltai_training_scenarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voltai_training_scenarios TO authenticated;

-- 5. RELACIONAMENTOS (FOREIGN KEYS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_memberships_tenant_id_fkey') THEN
    ALTER TABLE public.tenant_memberships
      ADD CONSTRAINT tenant_memberships_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_tenant_id_fkey') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagrams_project_id_fkey') THEN
    ALTER TABLE public.diagrams
      ADD CONSTRAINT diagrams_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_versions_project_id_fkey') THEN
    ALTER TABLE public.project_versions
      ADD CONSTRAINT project_versions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_folders_tenant_id_fkey') THEN
    ALTER TABLE public.project_folders
      ADD CONSTRAINT project_folders_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invites_tenant_id_fkey') THEN
    ALTER TABLE public.invites
      ADD CONSTRAINT invites_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_tenant_id_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenant_id_fkey') THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iot_devices_tenant_id_fkey') THEN
    ALTER TABLE public.iot_devices
      ADD CONSTRAINT iot_devices_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tag_samples_project_id_fkey') THEN
    ALTER TABLE public.tag_samples
      ADD CONSTRAINT tag_samples_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_records_tenant_id_fkey') THEN
    ALTER TABLE public.usage_records
      ADD CONSTRAINT usage_records_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6. HELPER FUNCTIONS PARA AUTORIZAÇÃO E POLICIES
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
BEGIN
  SELECT tenant_id INTO tid FROM public.profiles WHERE id = auth.uid();
  IF tid IS NOT NULL THEN
    RETURN tid;
  END IF;
  SELECT tenant_id INTO tid FROM public.tenant_memberships WHERE user_id = auth.uid() LIMIT 1;
  RETURN tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
BEGIN
  SELECT role INTO r FROM public.tenant_memberships
  WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
  LIMIT 1;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- 7. POLICIES CANÔNICAS DE ISOLAMENTO POR TENANT

-- tenants
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view own tenant" ON public.tenants;
  CREATE POLICY "Members can view own tenant" ON public.tenants
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Admins can update own tenant" ON public.tenants;
  CREATE POLICY "Admins can update own tenant" ON public.tenants
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
    WITH CHECK (id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));
END $$;

-- profiles
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own profile or same tenant profiles" ON public.profiles;
  CREATE POLICY "Users can view own profile or same tenant profiles" ON public.profiles
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (id = auth.uid() OR tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  CREATE POLICY "Users can update own profile" ON public.profiles
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

  DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
  CREATE POLICY "Users can insert own profile" ON public.profiles
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());
END $$;

-- tenant_memberships
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view co-members" ON public.tenant_memberships;
  CREATE POLICY "Members can view co-members" ON public.tenant_memberships
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;
  CREATE POLICY "Admins can manage memberships" ON public.tenant_memberships
    AS PERMISSIVE FOR ALL TO authenticated
    USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
    WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));
END $$;

-- projects
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view tenant projects" ON public.projects;
  CREATE POLICY "Members can view tenant projects" ON public.projects
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Members can create tenant projects" ON public.projects;
  CREATE POLICY "Members can create tenant projects" ON public.projects
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_user_tenant_id() AND (created_by = auth.uid() OR created_by IS NULL));

  DROP POLICY IF EXISTS "Members can update tenant projects" ON public.projects;
  CREATE POLICY "Members can update tenant projects" ON public.projects
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (tenant_id = public.get_user_tenant_id())
    WITH CHECK (tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Admins and owners can delete tenant projects" ON public.projects;
  CREATE POLICY "Admins and owners can delete tenant projects" ON public.projects
    AS PERMISSIVE FOR DELETE TO authenticated
    USING (tenant_id = public.get_user_tenant_id() AND (created_by = auth.uid() OR public.get_user_role() IN ('owner', 'admin')));
END $$;

-- diagrams
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view diagrams of tenant projects" ON public.diagrams;
  CREATE POLICY "Members can view diagrams of tenant projects" ON public.diagrams
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = diagrams.project_id AND p.tenant_id = public.get_user_tenant_id()
    ));

  DROP POLICY IF EXISTS "Members can manage diagrams of tenant projects" ON public.diagrams;
  CREATE POLICY "Members can manage diagrams of tenant projects" ON public.diagrams
    AS PERMISSIVE FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = diagrams.project_id AND p.tenant_id = public.get_user_tenant_id()
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = diagrams.project_id AND p.tenant_id = public.get_user_tenant_id()
    ));
END $$;

-- plan_limits
DO $$ BEGIN
  DROP POLICY IF EXISTS "Plan limits are readable by authenticated users" ON public.plan_limits;
  CREATE POLICY "Plan limits are readable by authenticated users" ON public.plan_limits
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
END $$;

-- project_versions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view versions of tenant projects" ON public.project_versions;
  CREATE POLICY "Members can view versions of tenant projects" ON public.project_versions
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_versions.project_id AND p.tenant_id = public.get_user_tenant_id()
    ));

  DROP POLICY IF EXISTS "Members can create versions of tenant projects" ON public.project_versions;
  CREATE POLICY "Members can create versions of tenant projects" ON public.project_versions
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_versions.project_id AND p.tenant_id = public.get_user_tenant_id()
    ));
END $$;

-- api_keys
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view tenant api keys" ON public.api_keys;
  CREATE POLICY "Members can view tenant api keys" ON public.api_keys
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Admins can manage tenant api keys" ON public.api_keys;
  CREATE POLICY "Admins can manage tenant api keys" ON public.api_keys
    AS PERMISSIVE FOR ALL TO authenticated
    USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
    WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));
END $$;

-- iot_devices
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view tenant iot devices" ON public.iot_devices;
  CREATE POLICY "Members can view tenant iot devices" ON public.iot_devices
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Members can manage tenant iot devices" ON public.iot_devices;
  CREATE POLICY "Members can manage tenant iot devices" ON public.iot_devices
    AS PERMISSIVE FOR ALL TO authenticated
    USING (tenant_id = public.get_user_tenant_id())
    WITH CHECK (tenant_id = public.get_user_tenant_id());
END $$;

-- tag_samples
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view tenant tag samples" ON public.tag_samples;
  CREATE POLICY "Members can view tenant tag samples" ON public.tag_samples
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tag_samples.project_id AND p.tenant_id = public.get_user_tenant_id()
    ));

  DROP POLICY IF EXISTS "Members can insert tenant tag samples" ON public.tag_samples;
  CREATE POLICY "Members can insert tenant tag samples" ON public.tag_samples
    AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tag_samples.project_id AND p.tenant_id = public.get_user_tenant_id()
    ));
END $$;

-- invites
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view tenant invites" ON public.invites;
  CREATE POLICY "Members can view tenant invites" ON public.invites
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id());

  DROP POLICY IF EXISTS "Admins can manage tenant invites" ON public.invites;
  CREATE POLICY "Admins can manage tenant invites" ON public.invites
    AS PERMISSIVE FOR ALL TO authenticated
    USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
    WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));
END $$;

-- usage_records
DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view tenant usage records" ON public.usage_records;
  CREATE POLICY "Members can view tenant usage records" ON public.usage_records
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (tenant_id = public.get_user_tenant_id());
END $$;

-- catalog_components & system_templates (leitura pública autenticada)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read catalog" ON public.catalog_components;
  CREATE POLICY "Authenticated users can read catalog" ON public.catalog_components
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

  DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.system_templates;
  CREATE POLICY "Authenticated users can read templates" ON public.system_templates
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
END $$;

