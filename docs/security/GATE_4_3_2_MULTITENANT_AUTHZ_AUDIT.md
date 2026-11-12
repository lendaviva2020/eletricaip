# GATE 4.3.2 — MULTI-TENANT AUTHORIZATION & SERVICE ROLE AUDIT

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Status:** `VERIFIED`

---

## 1. Inventário de Uso de `supabaseAdmin` (`SERVICE_ROLE`)

Todos os call sites de [`supabaseAdmin`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/integrations/supabase/client.server.ts) foram auditados em `src/`:

| Módulo | Propósito | Proteção / Escopo |
|---|---|---|
| [`client.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/integrations/supabase/client.server.ts) | Cliente admin singleton lazy | Lança erro se importado/acessado com `typeof window !== "undefined"` |
| [`fleet-supabase-store.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-supabase-store.server.ts) | Persistência Cloud Fleet & Ledger | Invocado exclusivamente após `resolveAuthenticatedFleetContext` / `authenticateGateway` ou rotas webhook HMAC |
| [`ai-chat.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/ai-chat.functions.ts) | Cotas IA (`check_ai_quota_for_user`, `increment_ai_tokens_for_user`) | Escopado por `userId` autenticado (`requireSupabaseAuth`) |
| [`billing.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/billing.functions.ts) | Override administrativo e leitura Stripe customer | Exige `requireActiveSession` + `isPlatformAdminUser()` para mutações |
| [`bom.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/bom.functions.ts) | Geração canônica BOM via RPC | Passa `userId` derivado da sessão verificada |
| [`tenants.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/tenants.functions.ts) | Aceite de convite por token + email autenticado | Valida `invite.email === claims.email`, expiração e `accepted_at IS NULL` |
| [`iot.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/iot.functions.ts) | Alertas IoT e barreira física (`enqueueIotCommand`) | Verifica membership do tenant; `enqueueIotCommand` bloqueado por `IS_PHYSICAL_CONTROL_ALLOWED = false` |
| [`account-deletion.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/account-deletion.functions.ts) | Exclusão segura de conta/usuário | Restrito à sessão ativa verificada (`requireActiveSession`) |
| [`catalog-import.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/catalog-import.functions.ts) | Importação administrativa de catálogo | Controle administrativo/autenticado |
| [`digital-twin.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/digital-twin.functions.ts) | Manutenção de partição mensal `tag_samples` | RPC operacional não controlada pelo cliente |
| [`ai-rate-limit-config.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/ai-rate-limit-config.server.ts) | Configuração global de rate-limit IA | Leitura server-side somente |
| [`iot.ingest.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/iot.ingest.ts) | Ingestão por API key | Rate limit por IP + hash SHA-256 da API key via `ingest_iot_reading` |
| [`stripe.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/stripe.webhook.ts), [`mp.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/mp.webhook.ts) | Webhooks financeiros | HMAC-SHA256 com janela replay 300s + ledger transacional + RPCs atômicas |

## 2. Hardening de Configuração Supabase Loopback

[`env.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/integrations/supabase/env.ts) passou a aceitar URLs loopback locais (`127.0.0.1` / `localhost`) **exclusivamente** quando `ALLOW_LOCAL_SUPABASE === "true"` ou `NODE_ENV === "test"` / `VITEST` estiverem ativos, mantendo bloqueio estrito contra projetos `.supabase.co` divergentes do `EXPECTED_SUPABASE_PROJECT_REF`.
