-- =============================================================================
-- ELÉTRICAI INDUSTRIAL OS — GATE 3.6 CANONICAL INDUSTRIAL DATA MODEL
-- Migration: 20261108090000_gate3_6_canonical_industrial_model.sql
-- Status: PREPARED LOCALLY (DO NOT APPLY REMOTELY WITHOUT EXPLICIT AUTHORIZATION)
--
-- Objetivo:
--   Consolidar a hierarquia canônica ponta a ponta:
--   Organization (tenants) → Plant → Sector → Equipment → IndustrialTag →
--   CanonicalGateway → GatewayTagSource → HistorianSample / AlarmDefinition / AlarmOccurrence
--
-- Segurança:
--   - RLS estrito por tenant_id em todas as tabelas.
--   - Chaves estrangeiras compostas (tenant_id, plant_id) impedindo associação
--     cruzada entre plantas ou organizações.
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

-- 3. CATÁLOGO DE TIPOS DE EQUIPAMENTO
create table if not exists public.industrial_equipment_types (
  id text primary key,
  category text not null,
  catalog_type text not null,
  manufacturer text,
  model text,
  created_at timestamptz not null default now()
);

-- 4. EQUIPAMENTOS CANÔNICOS (id === CanonicalEquipment.id do UnifiedProjectDoc)
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

-- 5. HISTÓRICO DE REVISÕES DE EQUIPAMENTOS
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

-- 6. TAGS INDUSTRIAIS CANÔNICAS (tag_id === CanonicalTag.id do UnifiedProjectDoc)
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

-- 7. HISTÓRICO DE REVISÕES DE TAGS
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

-- 8. VÍNCULO CANÔNICO EQUIPAMENTO ↔ TAG
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

-- 9. EDGE GATEWAYS CANÔNICOS
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

-- 10. ALLOWLIST DE FONTES DE AQUISIÇÃO FÍSICA (GATEWAY ↔ TAG ↔ ENDEREÇO DE PROTOCOLO)
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
  -- Invariante inegociável de segurança: escrita física proibida permanentemente
  write_enabled boolean not null default false check (write_enabled = false),
  created_at timestamptz not null default now(),
  unique (gateway_id, tag_id, source_id),
  foreign key (tenant_id, plant_id, gateway_id)
    references public.industrial_gateways(tenant_id, plant_id, id) on delete cascade,
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 11. HISTORIAN INDUSTRIAL IMUTÁVEL (SÉRIES TEMPORAIS COM PROVENIÊNCIA E DEDUPLICAÇÃO)
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
  -- Deduplicação idempotente no banco de dados
  unique (gateway_id, tag_id, source_id, sequence_number, source_timestamp_ms),
  foreign key (tenant_id, plant_id, tag_id)
    references public.industrial_tags(tenant_id, plant_id, tag_id) on delete cascade
);

-- 12. DEFINIÇÕES DE ALARME CANÔNICAS (ISA-18.2)
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

-- 13. OCORRÊNCIAS DE ALARME (IDENTIDADE ÚNICA PRESERVADA ENTRE EDGE E CLOUD)
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

-- 14. TRANSIÇÕES DE ALARME IDEMPOTENTES
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
-- ÍNDICES DE PERFORMANCE PARA CONSULTAS SCADA E HISTORIAN
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

create policy "tenant_isolation_industrial_plants" on public.industrial_plants
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_sectors" on public.industrial_sectors
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "read_industrial_equipment_types" on public.industrial_equipment_types
  for select using (auth.uid() is not null);

create policy "tenant_isolation_industrial_equipments" on public.industrial_equipments
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_equipment_revisions" on public.industrial_equipment_revisions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_tags" on public.industrial_tags
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_tag_revisions" on public.industrial_tag_revisions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_tag_bindings" on public.industrial_tag_bindings
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_gateways" on public.industrial_gateways
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_gateway_tag_sources" on public.industrial_gateway_tag_sources
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_historian_samples" on public.industrial_historian_samples
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_alarm_definitions" on public.industrial_alarm_definitions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_alarm_occurrences" on public.industrial_alarm_occurrences
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );

create policy "tenant_isolation_industrial_alarm_transitions" on public.industrial_alarm_transitions
  for all using (
    tenant_id in (select tenant_id from public.tenant_memberships where user_id = auth.uid())
    or public.is_platform_admin()
  );
