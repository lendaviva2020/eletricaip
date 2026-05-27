create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('simulation_complete','credits_low','team_invite','alarm','export_ready','info')),
  title text not null,
  message text not null,
  data jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_tenant_user
  on public.notifications(tenant_id, user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view their tenant notifications"
  on public.notifications for select
  using (
    tenant_id in (
      select tenant_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can insert notifications for their tenant"
  on public.notifications for insert
  with check (
    tenant_id in (
      select tenant_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
