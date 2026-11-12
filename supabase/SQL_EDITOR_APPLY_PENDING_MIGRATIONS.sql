-- =============================================================================
-- ELETRICAI INDUSTRIAL OS â€” CONSOLIDATED PENDING SUPABASE MIGRATIONS
-- Project: rvaaxvdimggztjxoktvy (PostgreSQL 17)
-- Includes migrations 20261108090000 through 20261112140000 (idempotent bundle).
-- Execute directly in Supabase Dashboard -> SQL Editor -> Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261108090000_gate3_6_canonical_industrial_model.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 3.6 CANONICAL INDUSTRIAL DATA MODEL
-- Migration: 20261108090000_gate3_6_canonical_industrial_model.sql
-- Status: PREPARED LOCALLY (DO NOT APPLY REMOTELY WITHOUT EXPLICIT AUTHORIZATION)
--
-- Objetivo:
--   Consolidar a hierarquia canÃƒÂ´nica ponta a ponta:
--   Organization (tenants) Ã¢â€ â€™ Plant Ã¢â€ â€™ Sector Ã¢â€ â€™ Equipment Ã¢â€ â€™ IndustrialTag Ã¢â€ â€™
--   CanonicalGateway Ã¢â€ â€™ GatewayTagSource Ã¢â€ â€™ HistorianSample / AlarmDefinition / AlarmOccurrence
--
-- SeguranÃƒÂ§a:
--   - RLS estrito por tenant_id em todas as tabelas.
--   - Chaves estrangeiras compostas (tenant_id, plant_id) impedindo associaÃƒÂ§ÃƒÂ£o
--     cruzada entre plantas ou organizaÃƒÂ§ÃƒÂµes.
--   - write_enabled travado em FALSE via CHECK constraint (isPhysicalControlAllowed=false).
-- =============================================================================

-- 1. PLANTAS INDUSTRIAIS
create table if not exists public.industrial_plants (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

-- 2. SETORES INDUSTRIAIS
create table if not exists public.industrial_sectors (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, plant_id, id),
  foreign key (tenant_id, plant_id) references public.industrial_plants(tenant_id, id) on delete cascade
);

-- 3. CATÃƒÂLOGO DE TIPOS DE EQUIPAMENTO
create table if not exists public.industrial_equipment_types (
  id text primary key,
  category text not null,
  catalog_type text not null,
  manufacturer text,
  model text,
  created_at timestamptz not null default now()
);

-- 4. EQUIPAMENTOS CANÃƒâ€NICOS (id === CanonicalEquipment.id do UnifiedProjectDoc)
create table if not exists public.industrial_equipments (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  sector_id text,
  project_id uuid references public.projects(id) on delete set null,
  equipment_type_id text not null references public.industrial_equipment_types(id),
  tag_code text not null,
  display_name text not null default '',
  description text not null default '',
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plant_id, id),
  foreign key (tenant_id, plant_id) references public.industrial_plants(tenant_id, id) on delete cascade
);

-- 5. HISTÃƒâ€œRICO DE REVISÃƒâ€¢ES DE EQUIPAMENTOS
create table if not exists public.industrial_equipment_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  equipment_id text not null,
  revision integer not null,
  changed_by text not null,
  changed_fields text[] not null default '{}',
  snapshot jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  unique (equipment_id, revision),
  foreign key (tenant_id, plant_id, equipment_id)
    references public.industrial_equipments(tenant_id, plant_id, id) on delete cascade
);

-- 6. TAGS INDUSTRIAIS CANÃƒâ€NICAS (tag_id === CanonicalTag.id do UnifiedProjectDoc)
create table if not exists public.industrial_tags (
  tag_id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  equipment_id text,
  canonical_name text not null,
  display_name text not null default '',
  data_type text not null check (data_type in ('BOOL', 'INT', 'DINT', 'REAL', 'STRING')),
  engineering_unit text not null default '',
  raw_unit text,
  scale double precision not null default 1.0,
  offset_value double precision not null default 0.0,
  precision integer not null default 3 check (precision between 0 and 10),
  minimum_value double precision,
  maximum_value double precision,
  deadband double precision not null default 0.0 check (deadband >= 0),
  sample_interval_ms integer not null default 1000 check (sample_interval_ms > 0),
  stale_after_ms integer not null default 10000 check (stale_after_ms > 0),
  retention_class text not null default 'STANDARD_90D'
    check (retention_class in ('HIGH_FREQ_7D', 'STANDARD_90D', 'COMPLIANCE_5Y')),
  source_kind text not null default 'PHYSICAL'
    check (source_kind in ('PHYSICAL', 'SIMULATED', 'INTERNAL_RUNTIME', 'CALCULATED')),
  revision integer not null default 1 check (revision >= 1),
  configuration_version integer not null default 1 check (configuration_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plant_id, tag_id),
  unique (tenant_id, plant_id, canonical_name),
  foreign key (tenant_id, plant_id) references public.industrial_plants(tenant_id, id) on delete cascade,
  foreign key (tenant_id, plant_id, equipment_id)
    references public.industrial_equipments(tenant_id, plant_id, id) on delete set null
);

-- 7. HISTÃƒâ€œRICO DE REVISÃƒâ€¢ES DE TAGS
create table if not exists public.industrial_tag_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  tag_id text not null,
  revision integer not null,
  changed_by text not null,
  changed_fields text[] not null default '{}',
  snapshot jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  unique (tag_id, revision),
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 8. VÃƒÂNCULO CANÃƒâ€NICO EQUIPAMENTO Ã¢â€ â€ TAG
create table if not exists public.industrial_tag_bindings (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  equipment_id text not null,
  tag_id text not null,
  role text not null,
  terminal_id text,
  plc_channel_id text,
  created_at timestamptz not null default now(),
  unique (tenant_id, plant_id, equipment_id, tag_id, role),
  foreign key (tenant_id, plant_id, equipment_id)
    references public.industrial_equipments(tenant_id, plant_id, id) on delete cascade,
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 9. EDGE GATEWAYS CANÃƒâ€NICOS
create table if not exists public.industrial_gateways (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  sector_id text,
  name text not null,
  credential_hash text not null,
  certificate_fingerprint text not null,
  is_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plant_id, id),
  foreign key (tenant_id, plant_id) references public.industrial_plants(tenant_id, id) on delete cascade
);

-- 10. ALLOWLIST DE FONTES DE AQUISIÃƒâ€¡ÃƒÆ’O FÃƒÂSICA (GATEWAY Ã¢â€ â€ TAG Ã¢â€ â€ ENDEREÃƒâ€¡O DE PROTOCOLO)
create table if not exists public.industrial_gateway_tag_sources (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  gateway_id text not null,
  tag_id text not null,
  source_id text not null,
  protocol text not null check (protocol in ('OPC_UA', 'MODBUS_TCP', 'MQTT_SPARKPLUG_B')),
  physical_address text not null,
  raw_unit text,
  scale double precision,
  offset_value double precision,
  active boolean not null default true,
  -- Invariante inegociÃƒÂ¡vel de seguranÃƒÂ§a: escrita fÃƒÂ­sica proibida permanentemente
  write_enabled boolean not null default false check (write_enabled = false),
  created_at timestamptz not null default now(),
  unique (gateway_id, tag_id, source_id),
  foreign key (tenant_id, plant_id, gateway_id)
    references public.industrial_gateways(tenant_id, plant_id, id) on delete cascade,
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 11. HISTORIAN INDUSTRIAL IMUTÃƒÂVEL (SÃƒâ€°RIES TEMPORAIS COM PROVENIÃƒÅ NCIA E DEDUPLICAÃƒâ€¡ÃƒÆ’O)
create table if not exists public.industrial_historian_samples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  tag_id text not null,
  equipment_id text,
  gateway_id text not null,
  source_id text not null,
  sequence_number bigint not null check (sequence_number >= 0),
  raw_value jsonb not null,
  engineering_value jsonb,
  transformation jsonb not null,
  quality text not null check (quality in ('GOOD', 'UNCERTAIN', 'BAD')),
  provenance text not null check (provenance in (
    'PHYSICAL_DATA',
    'SIMULATED_DATA',
    'INTERNAL_RUNTIME',
    'CALCULATED_DATA',
    'FORCED_DATA',
    'STALE_DATA',
    'BAD_QUALITY',
    'NOT_CONNECTED'
  )),
  source_timestamp_ms bigint not null,
  edge_received_at_ms bigint not null,
  ingestion_timestamp_ms bigint not null,
  is_late boolean not null default false,
  tag_revision integer not null,
  configuration_version integer not null,
  batch_id text not null,
  -- DeduplicaÃƒÂ§ÃƒÂ£o idempotente no banco de dados
  unique (gateway_id, tag_id, source_id, sequence_number, source_timestamp_ms),
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 12. DEFINIÃƒâ€¡Ãƒâ€¢ES DE ALARME CANÃƒâ€NICAS (ISA-18.2)
create table if not exists public.industrial_alarm_definitions (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  tag_id text not null,
  equipment_id text,
  name text not null,
  condition_type text not null check (condition_type in ('HH', 'H', 'L', 'LL', 'BOOL_TRUE', 'BOOL_FALSE')),
  threshold double precision,
  deadband double precision not null default 0.0,
  severity text not null check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  priority integer not null check (priority between 1 and 4),
  created_at timestamptz not null default now(),
  unique (tenant_id, plant_id, id),
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 13. OCORRÃƒÅ NCIAS DE ALARME (IDENTIDADE ÃƒÅ¡NICA PRESERVADA ENTRE EDGE E CLOUD)
create table if not exists public.industrial_alarm_occurrences (
  occurrence_id text primary key,
  edge_occurrence_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id text not null,
  gateway_id text not null,
  alarm_definition_id text not null,
  tag_id text not null,
  equipment_id text,
  severity text not null check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  priority integer not null check (priority between 1 and 4),
  is_active boolean not null default false,
  is_acknowledged boolean not null default false,
  is_shelved boolean not null default false,
  activated_at_ms bigint not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, gateway_id, edge_occurrence_id),
  foreign key (tenant_id, plant_id, alarm_definition_id)
    references public.industrial_alarm_definitions(tenant_id, plant_id, id) on delete cascade
);

-- 14. TRANSIÃƒâ€¡Ãƒâ€¢ES DE ALARME IDEMPOTENTES
create table if not exists public.industrial_alarm_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  occurrence_id text not null references public.industrial_alarm_occurrences(occurrence_id) on delete cascade,
  transition_kind text not null check (transition_kind in (
    'ACTIVATED',
    'ACKNOWLEDGED',
    'RETURNED_TO_NORMAL',
    'SHELVED',
    'UNSHELVED',
    'SUPPRESSED'
  )),
  transition_sequence integer not null check (transition_sequence >= 1),
  occurred_at_ms bigint not null,
  received_at_ms bigint not null,
  operator_id text,
  sample_value jsonb,
  quality text not null check (quality in ('GOOD', 'UNCERTAIN', 'BAD')),
  origin text not null check (origin in ('EDGE', 'CLOUD_OPERATOR')),
  unique (occurrence_id, transition_sequence)
);

-- =============================================================================
-- ÃƒÂNDICES DE PERFORMANCE PARA CONSULTAS SCADA E HISTORIAN
-- =============================================================================
create index if not exists idx_ind_equipments_tenant_plant
  on public.industrial_equipments (tenant_id, plant_id, tag_code);

create index if not exists idx_ind_tags_tenant_plant
  on public.industrial_tags (tenant_id, plant_id, equipment_id);

create index if not exists idx_ind_historian_tag_time
  on public.industrial_historian_samples (tenant_id, plant_id, tag_id, source_timestamp_ms desc);

create index if not exists idx_ind_historian_equipment_time
  on public.industrial_historian_samples (tenant_id, plant_id, equipment_id, source_timestamp_ms desc);

create index if not exists idx_ind_alarm_occ_active
  on public.industrial_alarm_occurrences (tenant_id, plant_id, is_active, priority);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) ESTRITO MULTI-TENANT
-- =============================================================================
alter table public.industrial_plants enable row level security;
alter table public.industrial_sectors enable row level security;
alter table public.industrial_equipment_types enable row level security;
alter table public.industrial_equipments enable row level security;
alter table public.industrial_equipment_revisions enable row level security;
alter table public.industrial_tags enable row level security;
alter table public.industrial_tag_revisions enable row level security;
alter table public.industrial_tag_bindings enable row level security;
alter table public.industrial_gateways enable row level security;
alter table public.industrial_gateway_tag_sources enable row level security;
alter table public.industrial_historian_samples enable row level security;
alter table public.industrial_alarm_definitions enable row level security;
alter table public.industrial_alarm_occurrences enable row level security;
alter table public.industrial_alarm_transitions enable row level security;

drop policy if exists "tenant_isolation_industrial_plants" on public.industrial_plants;
create policy "tenant_isolation_industrial_plants" on public.industrial_plants
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_sectors" on public.industrial_sectors;
create policy "tenant_isolation_industrial_sectors" on public.industrial_sectors
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "read_industrial_equipment_types" on public.industrial_equipment_types;
create policy "read_industrial_equipment_types" on public.industrial_equipment_types
  for select using (auth.uid() is not null);

drop policy if exists "tenant_isolation_industrial_equipments" on public.industrial_equipments;
create policy "tenant_isolation_industrial_equipments" on public.industrial_equipments
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_equipment_revisions" on public.industrial_equipment_revisions;
create policy "tenant_isolation_industrial_equipment_revisions" on public.industrial_equipment_revisions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_tags" on public.industrial_tags;
create policy "tenant_isolation_industrial_tags" on public.industrial_tags
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_tag_revisions" on public.industrial_tag_revisions;
create policy "tenant_isolation_industrial_tag_revisions" on public.industrial_tag_revisions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_tag_bindings" on public.industrial_tag_bindings;
create policy "tenant_isolation_industrial_tag_bindings" on public.industrial_tag_bindings
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_gateways" on public.industrial_gateways;
create policy "tenant_isolation_industrial_gateways" on public.industrial_gateways
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_gateway_tag_sources" on public.industrial_gateway_tag_sources;
create policy "tenant_isolation_industrial_gateway_tag_sources" on public.industrial_gateway_tag_sources
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_historian_samples" on public.industrial_historian_samples;
create policy "tenant_isolation_industrial_historian_samples" on public.industrial_historian_samples
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_alarm_definitions" on public.industrial_alarm_definitions;
create policy "tenant_isolation_industrial_alarm_definitions" on public.industrial_alarm_definitions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_alarm_occurrences" on public.industrial_alarm_occurrences;
create policy "tenant_isolation_industrial_alarm_occurrences" on public.industrial_alarm_occurrences
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "tenant_isolation_industrial_alarm_transitions" on public.industrial_alarm_transitions;
create policy "tenant_isolation_industrial_alarm_transitions" on public.industrial_alarm_transitions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261108100000_gate3_7_industrial_observability.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 3.7: INDUSTRIAL OBSERVABILITY & RELIABILITY MODEL
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

-- 1. SNAPSHOTS DE SAÃƒÅ¡DE DE COMPONENTES
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

-- 3. TRANSIÃƒâ€¡Ãƒâ€¢ES E AUDITORIA IMUTÃƒÂVEL DE INCIDENTES
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

-- 4. POLÃƒÂTICAS DE ALERTA E THRESHOLDS
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

-- 5. DEFINIÃƒâ€¡Ãƒâ€¢ES E METAS DE SLO
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

-- 6. MEDIÃƒâ€¡Ãƒâ€¢ES HISTÃƒâ€œRICAS DE SLO E ERROR BUDGET
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

-- 7. CHECKPOINTS DO PIPELINE DE DADOS (10 ESTÃƒÂGIOS)
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
drop policy if exists "Users can view health snapshots of own tenant" on public.observability_health_snapshots;
create policy "Users can view health snapshots of own tenant"
  on public.observability_health_snapshots for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid or auth.jwt() ->> 'role' = 'PLATFORM_ADMIN');

-- Incidents RLS
drop policy if exists "Users can view incidents of own tenant" on public.observability_incidents;
create policy "Users can view incidents of own tenant"
  on public.observability_incidents for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid or auth.jwt() ->> 'role' = 'PLATFORM_ADMIN');

drop policy if exists "Engineers and Admins can update incidents of own tenant" on public.observability_incidents;
create policy "Engineers and Admins can update incidents of own tenant"
  on public.observability_incidents for update
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Transitions RLS
drop policy if exists "Users can view incident transitions of own tenant" on public.observability_incident_transitions;
create policy "Users can view incident transitions of own tenant"
  on public.observability_incident_transitions for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- SLO Measurements RLS
drop policy if exists "Users can view SLO measurements of own tenant" on public.observability_slo_measurements;
create policy "Users can view SLO measurements of own tenant"
  on public.observability_slo_measurements for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Pipeline Checkpoints RLS
drop policy if exists "Users can view pipeline checkpoints of own tenant" on public.observability_pipeline_checkpoints;
create policy "Users can view pipeline checkpoints of own tenant"
  on public.observability_pipeline_checkpoints for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261108110000_gate3_8_industrial_diagnostics.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 3.8 & 3.8.1: INDUSTRIAL DIAGNOSTICS & CAUSAL CORRELATION
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

-- 2. Tabela do Grafo de DependÃƒÂªncias Industriais (Fase 2)
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

-- 3. Tabela de DiagnÃƒÂ³sticos DeterminÃƒÂ­sticos Baseados em Regras (Fase 3)
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

CREATE POLICY "tenant_isolation_diagnostic_records"
  ON public.industrial_diagnostic_records
  FOR SELECT
  USING (organization_id = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_insert_diagnostic_records"
  ON public.industrial_diagnostic_records
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- 4. Tabela de HipÃƒÂ³teses Rejeitadas com Auditoria ImutÃƒÂ¡vel (Fase 7)
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

CREATE POLICY "tenant_isolation_rejected_hypotheses"
  ON public.industrial_incident_rejected_hypotheses
  FOR SELECT
  USING (organization_id = current_setting('app.current_organization_id', true));

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

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261111120000_gate4_3_security_hardening_rls.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 4.3 SECURITY HARDENING & RLS CORRECTION
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

-- 3. Gate 3.8: Corrigir GUC `app.current_organization_id` e SEARCH_PATH da funÃƒÂ§ÃƒÂ£o SECURITY DEFINER
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

-- 5. Gate 3.6: Impedir escrita por viewer nas tabelas canÃƒÂ´nicas industriais
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_select_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_manage_' || tbl, tbl);
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

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261111180000_gate4_3_1_enterprise_persistence.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 4.3.1 ENTERPRISE PERSISTENCE, APPEND-ONLY AUDIT & WEBHOOK LEDGER
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

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 4.3.2 CLOUD PERSISTENCE, ATOMIC RPCs & BILLING INTEGRITY
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

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 20261112140000_gate4_3_2_complete_rls_policies.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- ELÃƒâ€°TRICAI INDUSTRIAL OS Ã¢â‚¬â€ GATE 4.3.2 COMPLETE RLS POLICY HARDENING
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

-- Record migration versions in Supabase CLI schema_migrations (if table exists)
DO $ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name') THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
      ('20261108090000', 'gate3_6_canonical_industrial_model'),
      ('20261108100000', 'gate3_7_industrial_observability'),
      ('20261108110000', 'gate3_8_industrial_diagnostics'),
      ('20261111120000', 'gate4_3_security_hardening_rls'),
      ('20261111180000', 'gate4_3_1_enterprise_persistence'),
      ('20261112120000', 'gate4_3_2_cloud_persistence_and_rpcs'),
      ('20261112140000', 'gate4_3_2_complete_rls_policies')
    ON CONFLICT (version) DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations') THEN
    INSERT INTO supabase_migrations.schema_migrations (version) VALUES
      ('20261108090000'),
      ('20261108100000'),
      ('20261108110000'),
      ('20261111120000'),
      ('20261111180000'),
      ('20261112120000'),
      ('20261112140000')
    ON CONFLICT (version) DO NOTHING;
  END IF;
END $;