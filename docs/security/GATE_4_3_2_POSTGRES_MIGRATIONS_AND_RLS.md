# GATE 4.3.2 — POSTGRESQL MIGRATIONS, ATOMIC RPCs & RLS AUDIT

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Status de Migration/DDL & Revisão Estática:** `IMPLEMENTED` / `VERIFIED`  
**Status de Execução contra Daemon PostgreSQL / `supabase start` ao vivo:** `BLOCKED_BY_ENVIRONMENT`

---

## 1. Diagnóstico do Ambiente Local PostgreSQL / Docker

Durante o Gate 4.3.2 foram executadas verificações diretas no host Windows:
- Serviço `com.docker.service` encontra-se `Stopped` (`StartType: Manual`); `Start-Service com.docker.service` retorna erro de acesso sem elevação de administrador (`Não é possível abrir o serviço com.docker.service`).
- `wsl --status` / `wsl -l -v`: kernel do WSL 2 não encontrado e nenhuma distribuição Linux instalada, impedindo `dockerDesktopLinuxEngine` de inicializar mesmo após abrir `Docker Desktop.exe`.
- Binários nativos `postgres`, `pg_ctl`, `initdb` e `psql` ausentes no host (`C:\Program Files\PostgreSQL` inexistente).
- Projeto remoto `rvaaxvdimggztjxoktvy` intocado por proibição explícita de segurança.

**Classificação Honesta:** Execução de container PostgreSQL/Supabase local ao vivo permanece **`BLOCKED_BY_ENVIRONMENT`**. Como mitigação complementar determinística (sem substituir o ambiente Docker real), foi implementado um harness relacional de contrato RPC/PostgREST em [`gate-4-3-2-cloud-multi-instance-and-rpcs.test.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/__tests__/gate-4-3-2-cloud-multi-instance-and-rpcs.test.ts).

---

## 2. Defeitos Estruturais Corrigidos na Migration `20261112120000`

A auditoria das migrations [`20261014201000_core_tables_ddl.sql`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/migrations/20261014201000_core_tables_ddl.sql) e [`20261111180000_gate4_3_1_enterprise_persistence.sql`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/migrations/20261111180000_gate4_3_1_enterprise_persistence.sql) identificou lacunas reais corrigidas em [`20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/migrations/20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql):

1. **Índices `UNIQUE` Ausentes para `ON CONFLICT`:**
   - `public.invoices (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL` e `public.subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL` agora possuem índices únicos para suportar upserts idempotentes de webhooks.
   - `public.stripe_webhook_events (event_id)` e `public.mp_webhook_processed (payment_id)` receberam `DEFAULT now()` em `processed_at`, deduplicação preventiva e índices únicos + `REVOKE ALL FROM anon, authenticated`.
2. **Prevenção Estrutural de Fork na Cadeia de Auditoria:**
   - Criado `uq_fleet_audit_chain_previous_hash` em `public.fleet_audit_chain (previous_hash)`.
   - RPC `public.append_fleet_audit_event_atomic(...)` usa `pg_advisory_xact_lock` serializando o tip `tamper_proof_hash`.
3. **`tenant_id` vs `organization_id` Não-UUID (Lab) com RLS Fail-Closed:**
   - `tenant_id` em tabelas `fleet_*` permite `NULL` exclusivamente para seeding sistêmico/lab não pertencente a tenant UUID, mas todas as policies `rls_select_*` e `rls_manage_*` exigem `tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenant_memberships ...)` (além de `is_platform_admin()`).
4. **RPCs Atômicas `SECURITY DEFINER` com `SET search_path = public`:**
   - `append_fleet_audit_event_atomic`
   - `claim_provisioning_token_atomic` (com lock por `token_hash` e `provisioning_station_bindings`)
   - `record_ingested_batch_atomic` (com `FOR UPDATE` em `fleet_registered_gateways` e `fleet_latest_telemetry`)
   - `append_remote_config_monotonic_atomic`
   - `begin_webhook_event_atomic` / `complete_webhook_event_atomic`
   - `apply_mp_payment_transition_atomic` (bloqueia regressões de estado em pagamentos Mercado Pago)
   - Todas com `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`.
