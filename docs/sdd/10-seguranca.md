---
title: Segurança
status: in-progress
owner: platform
last_review: 2026-05-27
---

# 10. Segurança

## 10.1 Modelo de confiança

- **Browser**: anon key + sessão Supabase persistida; RLS aplica.
- **Server fn autenticada**: `requireSupabaseAuth` valida bearer; consultas rodam como o usuário.
- **Server fn admin**: `supabaseAdmin` (service role) — bypass de RLS, restrito a webhooks/cron/admin verificado.

## 10.2 Auth e autorização

- **RBAC**: fonte de verdade é `tenant_memberships.role` (`owner|admin|engineer|operator|viewer`).
  `profiles.role` NÃO é mais consultado em decisões de autorização (corrigido em #SEC-03).
  Helper `requireTenantAdmin(supabase, userId)` em `src/lib/tenants.functions.ts` resolve o tenant ativo e verifica papel.
- **Escalação de privilégios em profiles**: trigger `prevent_profile_privilege_escalation` (BEFORE UPDATE) trava mudanças em `role`, `tenant_id` e `id`. A policy de UPDATE em `profiles` foi simplificada para `id = auth.uid()` (sem subquery auto-referencial) — o trigger é a barreira.
- **Leaked Password Protection**: 🔒 ação manual no dashboard Supabase (Auth → Providers). Não pode ser feito via migration.

## 10.3 Webhooks

- **Stripe (TanStack)**: `src/routes/api/public/stripe.webhook.ts` — HMAC-SHA256 com `timingSafeEq()` + tolerância de 300s.
- **Stripe (Edge legado)**: `supabase/functions/stripe-webhook/index.ts` — corrigido para usar `timingSafeEqual` e validar timestamp (#SEC-02).
- **Mercado Pago**: `src/routes/api/public/mp.webhook.ts` — assinatura HMAC com `MP_WEBHOOK_SECRET`.

## 10.4 Storage

- `avatars`, `catalog-images`, `catalog-datasheets` são **públicos** por design (UX). Risco aceito; arquivos não devem ter PII.
- `client-logos` é privado, signed URLs.
- `file_versions` agora tem policies completas (INSERT por membros, UPDATE/DELETE por owner/admin/engineer).

## 10.5 Rate limiting

- IA: `consume_ai_credits` consome quota mensal por operação.
- IoT ingest: `ingest_iot_reading` valida `api_key` com `sha256` e scope `iot:ingest`.
- (Pendente #SEC-05) Rate limit burst por IP em endpoints públicos.

## 10.6 Auditoria

- `audit_logs` registra ações sensíveis (mudança de plano, exclusão de membro, troca de papel).
- `subscription_audit_log` rastreia mudanças de plano.
- Dashboard em `/settings/security-monitor` consome `getSecurityDashboard`.

## 10.7 Status dos achados (scan 2026-05-27)

| # | Achado | Status |
|---|--------|--------|
| SEC-01 | Profile UPDATE policy com subquery auto-referencial | ✅ corrigido (trigger + policy simplificada) |
| SEC-02 | Stripe Edge: comparação não-timing-safe | ✅ corrigido (`timingSafeEqual` + tolerância 300s) |
| SEC-03 | Admin check em `profiles.role` (deve ser `tenant_memberships`) | ✅ corrigido (`requireTenantAdmin`) |
| SEC-04 | Fallback hardcoded de URL/anon key em auth-middleware | ✅ removido |
| SEC-05 | file_versions sem policies de INSERT/UPDATE/DELETE | ✅ adicionadas (escopo por tenant) |
| SEC-06 | Avatars/catalog buckets públicos | ⚠️ aceito (sem PII; documentado) |
| SEC-07 | Leaked Password Protection | 🔒 ação manual no dashboard |
