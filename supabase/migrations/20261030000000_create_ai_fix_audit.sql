-- ==============================================================================
-- Migration: Trilha de Auditoria Forense Imutável (Append-Only) para IA Fix
-- Tabela: public.ai_fix_audit
-- Data: 2026-10-30
-- Conformidade: ABNT NBR 5410:2004 / LGPD / Princípios de Falha Segura
--
-- Princípios de Segurança e Auditoria:
-- 1. Append-Only estrito: Sem políticas de UPDATE ou DELETE. Registros são eternos.
-- 2. Qualquer reversão (undo) é registrada como nova linha com user_action = 'undone'
--    referenciando o audit_id original através de reverts_audit_id.
-- 3. Apenas usuários autenticados com acesso ao projeto do tenant podem consultar.
-- ==============================================================================

create table if not exists public.ai_fix_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  diagnostic_id text not null,
  rule_id text not null,
  standard text not null,
  clause text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  proposal_id text not null,
  ai_model text not null,
  rationale_pt text not null,
  applied_by_user boolean not null default false,
  user_action text not null check (user_action in ('approved', 'rejected', 'undone')),
  reverts_audit_id uuid references public.ai_fix_audit(id) on delete set null,
  undone_at timestamptz
);

comment on table public.ai_fix_audit is 'Trilha forense append-only de propostas corretivas de engenharia sugeridas por IA e homologadas por usuários.';
comment on column public.ai_fix_audit.before_state is 'Snapshot JSON do estado antes da proposta (seção, queda de tensão, margens).';
comment on column public.ai_fix_audit.after_state is 'Snapshot JSON do estado proposto após a aplicação do patch.';
comment on column public.ai_fix_audit.reverts_audit_id is 'Referência ao id do registro de auditoria revertido quando user_action = undone.';

-- Índices de consulta e performance
create index if not exists idx_ai_fix_audit_project_created
  on public.ai_fix_audit(project_id, created_at desc);

create index if not exists idx_ai_fix_audit_user
  on public.ai_fix_audit(user_id);

create index if not exists idx_ai_fix_audit_reverts
  on public.ai_fix_audit(reverts_audit_id);

-- Ativação estrita de Row Level Security
alter table public.ai_fix_audit enable row level security;

-- Política de Leitura: Usuário com permissão no projeto
drop policy if exists "ai_fix_audit_select_policy" on public.ai_fix_audit;
create policy "ai_fix_audit_select_policy"
  on public.ai_fix_audit
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.projects p
      where p.id = ai_fix_audit.project_id
        and (
          p.created_by = auth.uid()
          or exists (
            select 1 from public.tenant_memberships tm
            where tm.tenant_id = p.tenant_id
              and tm.user_id = auth.uid()
          )
        )
    )
  );

-- Política de Inserção: Apenas usuário autenticado gerando seu próprio registro
drop policy if exists "ai_fix_audit_insert_policy" on public.ai_fix_audit;
create policy "ai_fix_audit_insert_policy"
  on public.ai_fix_audit
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = ai_fix_audit.project_id
    )
  );

-- NOTA FORENSE: Não existem políticas de UPDATE ou DELETE para public.ai_fix_audit.
-- Isto garante imutabilidade física no nível do banco de dados (WORM - Write Once, Read Many).
