-- ElétricAi Runtime: pacotes de programa publicados/aprovados e dispositivos
-- (gateways) que os executam.
--
-- Segurança:
--  * Leitura só para membros da empresa (RLS). NENHUMA escrita direta de
--    cliente: publicar, aprovar, revogar e criar dispositivo passam por server
--    functions que conferem o papel (owner/admin/engineer) e gravam com service
--    role, com trilha de auditoria.
--  * O token do dispositivo é guardado só como SHA-256 e a coluna não é legível
--    por clientes.
--  * Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).

create table if not exists public.runtime_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  label text not null default '' check (length(label) <= 120),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  package jsonb not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 2000000),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  unique (project_id, version),
  unique (project_id, sha256),
  check ((approved_at is null) = (approved_by is null)),
  check ((revoked_at is null) = (revoked_by is null))
);

create index if not exists runtime_packages_tenant_idx on public.runtime_packages (tenant_id);
create index if not exists runtime_packages_project_idx on public.runtime_packages (project_id, version desc);

create table if not exists public.runtime_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (length(token_prefix) between 4 and 16),
  target_package_id uuid references public.runtime_packages(id) on delete set null,
  stop_requested boolean not null default false,
  last_seen_at timestamptz,
  last_mode text check (last_mode is null or last_mode in ('SHADOW', 'RUN', 'SAFE')),
  last_package_hash text check (last_package_hash is null or last_package_hash ~ '^[0-9a-f]{64}$'),
  last_state jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists runtime_devices_tenant_idx on public.runtime_devices (tenant_id);
create index if not exists runtime_devices_project_idx on public.runtime_devices (project_id);
create index if not exists runtime_devices_target_idx on public.runtime_devices (target_package_id);

alter table public.runtime_packages enable row level security;
alter table public.runtime_devices enable row level security;

drop policy if exists runtime_packages_select_members on public.runtime_packages;
create policy runtime_packages_select_members on public.runtime_packages
  for select to authenticated
  using (exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = runtime_packages.tenant_id and m.user_id = (select auth.uid())
  ));

drop policy if exists runtime_devices_select_members on public.runtime_devices;
create policy runtime_devices_select_members on public.runtime_devices
  for select to authenticated
  using (exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = runtime_devices.tenant_id and m.user_id = (select auth.uid())
  ));

-- Sem acesso anônimo; cliente autenticado só lê (e nunca o hash do token).
revoke all on public.runtime_packages from anon, authenticated;
revoke all on public.runtime_devices from anon, authenticated;
grant select on public.runtime_packages to authenticated;
grant select (
  id, tenant_id, project_id, name, token_prefix, target_package_id, stop_requested,
  last_seen_at, last_mode, last_package_hash, last_state, created_by, created_at, revoked_at
) on public.runtime_devices to authenticated;
grant all on public.runtime_packages to service_role;
grant all on public.runtime_devices to service_role;
