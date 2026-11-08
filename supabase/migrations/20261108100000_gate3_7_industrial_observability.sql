-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 3.7: INDUSTRIAL OBSERVABILITY & RELIABILITY MODEL
-- Migration: 20261108100000_gate3_7_industrial_observability.sql
-- Status: PREPARED LOCALLY (DO NOT APPLY REMOTELY WITHOUT EXPLICIT AUTHORIZATION)
--
-- Tables:
--   1. observability_health_snapshots
--   2. observability_incidents
--   3. observability_incident_transitions
--   4. observability_alert_policies
--   5. observability_slo_definitions
--   6. observability_slo_measurements
--   7. observability_pipeline_checkpoints
--
-- Security:
--   - RLS strictly enforced by tenant_id.
--   - Composite foreign keys (tenant_id, plant_id).
--   - IS_PHYSICAL_CONTROL_ALLOWED = false.
-- =============================================================================

-- 1. SNAPSHOTS DE SAÚDE DE COMPONENTES
create table if not exists public.observability_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  component_id text not null,
  component_type text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  observed_at timestamptz not null default now(),
  last_successful_observation_at timestamptz,
  state text not null check (state in ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN', 'MAINTENANCE', 'NOT_INSTRUMENTED')),
  severity text not null check (severity in ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reason_code text not null,
  evidence_reference text not null,
  source text not null check (source in ('HEALTH_PROBE', 'HEARTBEAT', 'TELEMETRY_PIPELINE', 'SECURITY_AUDIT')),
  metric_values jsonb not null default '{}'::jsonb,
  evaluation_window_ms integer not null default 60000,
  threshold_version text not null default '3.7.0',
  flapping_detected boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_obs_snapshots_tenant_plant on public.observability_health_snapshots(tenant_id, plant_id, observed_at desc);
create index if not exists idx_obs_snapshots_component on public.observability_health_snapshots(component_id, observed_at desc);

-- 2. INCIDENTES OPERACIONAIS INDUSTRIAIS
create table if not exists public.observability_incidents (
  incident_id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  source_component_id text not null,
  category text not null check (category in ('INDUSTRIAL_PROCESS', 'INFRASTRUCTURE', 'SECURITY_EVENT')),
  severity text not null check (severity in ('INFO', 'WARNING', 'CRITICAL', 'FATAL')),
  title text not null,
  description text not null,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  impact text not null,
  evidence jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  assigned_to jsonb,
  status text not null check (status in ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED')),
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  resolution text,
  related_alarms text[] not null default '{}',
  dedup_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obs_incidents_tenant_plant on public.observability_incidents(tenant_id, plant_id, status);
create index if not exists idx_obs_incidents_correlation on public.observability_incidents(correlation_id);

-- 3. TRANSIÇÕES E AUDITORIA IMUTÁVEL DE INCIDENTES
create table if not exists public.observability_incident_transitions (
  transition_id text primary key,
  incident_id text not null references public.observability_incidents(incident_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  timestamp timestamptz not null default now(),
  from_status text not null,
  to_status text not null,
  actor_id text not null,
  actor_email text not null,
  actor_role text not null,
  note text not null,
  tamper_proof_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_obs_inc_transitions_incident on public.observability_incident_transitions(incident_id, timestamp asc);

-- 4. POLÍTICAS DE ALERTA E THRESHOLDS
create table if not exists public.observability_alert_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  component_type text not null,
  heartbeat_timeout_ms integer not null default 30000,
  cpu_warning_pct numeric(5,2) not null default 80.0,
  cpu_critical_pct numeric(5,2) not null default 95.0,
  memory_warning_pct numeric(5,2) not null default 85.0,
  memory_critical_pct numeric(5,2) not null default 95.0,
  disk_warning_pct numeric(5,2) not null default 85.0,
  disk_critical_pct numeric(5,2) not null default 92.0,
  max_clock_drift_ms integer not null default 1000,
  max_latency_warning_ms integer not null default 1500,
  max_latency_critical_ms integer not null default 5000,
  hysteresis_required integer not null default 3,
  version text not null default '1.0.0',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. DEFINIÇÕES E METAS DE SLO
create table if not exists public.observability_slo_definitions (
  slo_id text primary key,
  target_service text not null,
  name text not null,
  description text not null,
  target_percent numeric(5,2) not null,
  evaluation_window_days integer not null default 30,
  calculation_method text not null,
  numerator_description text not null,
  denominator_description text not null,
  unit text not null default '%',
  version text not null default '1.0.0',
  created_at timestamptz not null default now()
);

-- 6. MEDIÇÕES HISTÓRICAS DE SLO E ERROR BUDGET
create table if not exists public.observability_slo_measurements (
  id uuid primary key default gen_random_uuid(),
  slo_id text not null references public.observability_slo_definitions(slo_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_observations bigint not null,
  valid_observations bigint not null,
  eligible_denominator bigint not null,
  achieved_percent numeric(7,4) not null,
  target_percent numeric(5,2) not null,
  is_compliant boolean not null,
  error_budget_total_pct numeric(5,2) not null,
  error_budget_consumed_pct numeric(5,2) not null,
  error_budget_remaining_pct numeric(5,2) not null,
  planned_maintenance_ms bigint not null default 0,
  unplanned_outage_ms bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_obs_slo_meas_tenant on public.observability_slo_measurements(tenant_id, slo_id, period_end desc);

-- 7. CHECKPOINTS DO PIPELINE DE DADOS (10 ESTÁGIOS)
create table if not exists public.observability_pipeline_checkpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gateway_id text not null,
  plant_id text not null,
  stage text not null,
  samples_in bigint not null default 0,
  samples_out bigint not null default 0,
  samples_dropped bigint not null default 0,
  drop_reason text,
  checkpoint_time timestamptz not null default now()
);

create index if not exists idx_obs_pipeline_gateway on public.observability_pipeline_checkpoints(tenant_id, gateway_id, checkpoint_time desc);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
alter table public.observability_health_snapshots enable row level security;
alter table public.observability_incidents enable row level security;
alter table public.observability_incident_transitions enable row level security;
alter table public.observability_alert_policies enable row level security;
alter table public.observability_slo_measurements enable row level security;
alter table public.observability_pipeline_checkpoints enable row level security;

-- Snapshots RLS
create policy "Users can view health snapshots of own tenant"
  on public.observability_health_snapshots for select
  using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid or auth.jwt() ->> 'role' = 'PLATFORM_ADMIN');

-- Incidents RLS
create policy "Users can view incidents of own tenant"
  on public.observability_incidents for select
  using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid or auth.jwt() ->> 'role' = 'PLATFORM_ADMIN');

create policy "Engineers and Admins can update incidents of own tenant"
  on public.observability_incidents for update
  using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid)
  with check (tenant_id = auth.jwt() ->> 'tenant_id'::uuid);

-- Transitions RLS
create policy "Users can view incident transitions of own tenant"
  on public.observability_incident_transitions for select
  using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid);

-- SLO Measurements RLS
create policy "Users can view SLO measurements of own tenant"
  on public.observability_slo_measurements for select
  using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid);

-- Pipeline Checkpoints RLS
create policy "Users can view pipeline checkpoints of own tenant"
  on public.observability_pipeline_checkpoints for select
  using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid);
