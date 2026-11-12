# GATE 4.3.1 — WEBHOOKS TRANSACIONAIS & IDEMPOTÊNCIA FINANCEIRA

**Status:** `IMPLEMENTED`, `TESTED`, `VERIFIED`

---

## 1. Falha Original Eliminada

Na auditoria anterior, handlers Stripe ([`stripe.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/stripe.webhook.ts)), Mercado Pago ([`mp.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/mp.webhook.ts)) e a Edge Function ([`supabase/functions/stripe-webhook/index.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/functions/stripe-webhook/index.ts)) realizavam escritas em `tenants`, `subscriptions` e `invoices` ignorando ou apenas logando `{ error }`, podendo responder **HTTP `200 OK`** mesmo quando o banco falhava.

---

## 2. Máquina de Estados Transacional (`webhook-ledger.server.ts`)

Criado o controle central [`runTransactionalWebhookHandler`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/webhook-ledger.server.ts) backed pelas tabelas `webhook_processing_ledger` (SQLite WAL local & migration PostgreSQL):

- **Estados suportados:** `RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`, `RETRYABLE`.
- **Lease Lock Anti-Concorrência:** `beginWebhookEvent` adquire lock com TTL (30s). Entregas simultâneas enquanto o worker ativo processa retornam **HTTP `409 in_flight_conflict`**; locks expirados permitem retomada segura após crash.
- **Asserção Estrita de Banco (`assertSupabaseWriteOk`):** toda chamada a `tenants`, `subscriptions` e `invoices` nos fluxos Stripe e Mercado Pago é validada explicitamente; qualquer `{ error }` dispara exceção -> transição automática do ledger para `RETRYABLE` -> remoção da pré-reserva em `stripe_webhook_events` / `mp_webhook_processed` -> resposta **HTTP `500`**.
- **Edge Function Supabase ([`stripe-webhook/index.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/functions/stripe-webhook/index.ts)):** agora lança exceção em qualquer erro Supabase, executa limpeza da linha de idempotência em `catch` e devolve HTTP `500` para retry seguro pelo Stripe.
- **Idempotência Comprovada:** eventos em estado `PROCESSED` respondem **HTTP `200`** imediatamente em reentregas sem reexecutar mutações de cobrança/plano.
