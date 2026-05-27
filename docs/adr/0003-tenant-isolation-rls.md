# ADR-0003 · Isolamento multi-tenant via RLS

**Data:** 2026-05 · **Status:** Accepted

## Contexto

SaaS multi-tenant com dados sensíveis (projetos elétricos, BOMs, credenciais OPC-UA). Vazamento cross-tenant é falha crítica.

## Decisão

Toda tabela em `public.*` carrega `tenant_id uuid` e tem RLS habilitada com policy baseada em `public.get_user_tenant_id()` (SECURITY DEFINER). Roles via tabela `tenant_memberships` (nunca em `profiles`). Trigger `prevent_profile_privilege_escalation` trava mudanças de `role`/`tenant_id` no profile.

## Consequências

**Positivas:** Isolamento garantido na camada de banco; impossível bypass via cliente.
**Negativas:** Server functions com `supabaseAdmin` (service role) precisam validar `tenant_id` manualmente — toda nova função admin deve passar code review (#DOC-02).
