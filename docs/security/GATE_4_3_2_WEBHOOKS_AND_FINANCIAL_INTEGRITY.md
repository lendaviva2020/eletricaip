# GATE 4.3.2 — WEBHOOKS, TRANSACTIONAL LEDGER & FINANCIAL INTEGRITY

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Status:** `VERIFIED`

---

## 1. Ledger Transacional Compartilhado na Cloud

- [`runTransactionalWebhookHandler`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/webhook-ledger.server.ts) foi atualizado para aceitar `asyncStore` (`SupabaseFleetStorageBackend`) e selecionar automaticamente `getCloudSupabaseFleetStore()` quando o runtime operar em Cloud PostgreSQL.
- No PostgreSQL ([`20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/migrations/20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql)), `begin_webhook_event_atomic` e `complete_webhook_event_atomic` aplicam row lock `FOR UPDATE` em `webhook_processing_ledger`, garantindo:
  - Concorrência multi-instância em voo -> retorno HTTP `409 in_flight_conflict`;
  - Falha de banco -> rollback da reserva + transição para `RETRYABLE` + retorno HTTP `500`;
  - Recuperação limpa em retry após expiração de lease ou `RETRYABLE` -> transição para `PROCESSED`;
  - Transição inválida (`INVALID_PAYMENT_STATE_TRANSITION`) -> estado terminal `FAILED` + HTTP `409`.

## 2. Máquina de Estados Mercado Pago & Constraints DDL

- [`mp.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/mp.webhook.ts) valida transições permitidas via [`isValidMpStatusTransition`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/mp.webhook.ts) e executa atomicamente a RPC PostgreSQL `apply_mp_payment_transition_atomic` (`mp_payment_state_machine` + `invoices` + `tenants`).
- Regressões fora de ordem (ex.: `approved -> in_process`) são bloqueadas com HTTP `409 invalid_state_transition` sem sobrescrever o plano ativo do tenant.
- Reparos estruturais em `20261112120000`: índices `UNIQUE` em `invoices(stripe_invoice_id)`, `subscriptions(stripe_subscription_id)`, `stripe_webhook_events(event_id)` e `mp_webhook_processed(payment_id)`, além de `REVOKE ALL FROM anon, authenticated`.
