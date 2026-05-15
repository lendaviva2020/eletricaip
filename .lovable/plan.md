
# Análise ponta a ponta — EletricAI Industrial OS

## Diagnóstico atual

**Stack**: TanStack Start v1 + React 19 + Vite 7 + Tailwind v4 + Supabase + DeepSeek (edge function) + Konva/ReactFlow + Zustand.

**Backend**: 57 tabelas em `public` (multi-tenant, billing, IoT, knowledge base, blog, alarmes, telemetria particionada, voltai learning). 1 edge function (`ai-industrial-architect`).

**Frontend**: 15 rotas, ~9100 linhas. Workspace industrial com 8 canvases (unifilar, ladder, FBD, SCADA, twin, PLC, sim, alarmes).

### Problemas e lacunas detectadas

1. **Server-side ausente para a maior parte das chamadas** — quase tudo bate direto no Supabase do navegador via RLS. Não há `createServerFn` em uso (padrão recomendado do TanStack Start neste template). Edge function `ai-industrial-architect` deveria virar server function.
2. **Quota de IA bypassável** (finding aberto): contagem em `localStorage`. Tabela `usage_records` existe mas não é consultada antes de chamar DeepSeek.
3. **`SECURITY DEFINER` exposta a anon** (lint Supabase warn) — alguma função pública executável sem auth.
4. **Erro de runtime atual**: "Failed to fetch dynamically imported module: virtual:tanstack-start-client-entry" — preview travado, provavelmente cache do dev server após edições recentes em `routeTree.gen.ts`.
5. **Multi-tenant inconsistente**: existem `tenants` + `tenant_memberships`, mas o código cliente não lê tenant ativo em lugar nenhum visível. Risco de dados cruzados se as RLS dependerem de tenant.
6. **Billing incompleto**: tabelas `subscriptions`, `invoices`, `stripe_webhook_events`, `mp_webhook_processed` existem; nenhum webhook/route `/api/public/*` no código. Stripe/Mercado Pago não plugados.
7. **Persistência do projeto**: `useProjectStore` e `useVoltaiStore` (Zustand) só vivem em memória. Tabelas `projects`, `diagrams`, `project_versions` existem e estão ociosas — usuário perde tudo ao recarregar.
8. **IoT/Runtime**: tabelas `iot_devices`, `iot_readings`, `plant_telemetry`, `tag_samples_*` particionadas existem, mas `runtime-client.ts` não está integrado ao Supabase Realtime.
9. **Knowledge/RAG**: `knowledge_documents`, `knowledge_chunks`, `normative_chunks` prontas para embeddings, mas o assistente IA não faz RAG — só envia o JSON do projeto pro DeepSeek.
10. **Catálogo de componentes**: `catalog_*` no banco; o app usa hardcoded em `voltai/component-definitions.ts` (1116 linhas). Duas fontes da verdade.
11. **Validador normativo** existe (`norm-validator.ts`) mas não é invocado em lugar nenhum no UI.
12. **SEO**: rotas têm `head()` parcial; falta og:image, JSON-LD, sitemap.
13. **Acessibilidade/responsivo**: viewport mobile (492px) não foi auditado nas canvases.
14. **Sem testes**, sem CI hooks visíveis, sem error tracking estruturado (`error-capture.ts` é stub).

---

## Roadmap em 8 fases

Cada fase é independente o suficiente para ser executada sozinha, validada e publicada antes da próxima.

### Fase 1 — Estabilizar base (crítico, ~30 min)
- Resolver runtime error do `virtual:tanstack-start-client-entry` (restart + verificar `routeTree.gen.ts`).
- Corrigir o lint Supabase `anon_security_definer_function_executable` (revogar EXECUTE de anon nas funções `is_platform_admin`, `has_role`, etc.).
- Implementar quota de IA server-side (`usage_records` + `plan_limits` consultadas antes de chamar DeepSeek). Fecha o último finding de segurança.

### Fase 2 — Persistência de projetos (alta, ~2 h)
- Wire `useProjectStore` e `useVoltaiStore` em `projects` + `diagrams`.
- Server functions: `saveProject`, `loadProject`, `listProjects`, `deleteProject`.
- Auto-save (debounce 2 s) e versionamento em `project_versions`.
- Página `/projects` populada com lista real (hoje é placeholder).

### Fase 3 — Migrar IA para server function + RAG (alta, ~3 h)
- Converter `ai-industrial-architect` em `createServerFn` com `requireSupabaseAuth`.
- Adicionar busca em `normative_chunks` (RAG) antes de mandar para DeepSeek — IA cita norma específica.
- Logar conversas em `ai_conversations` + `ai_messages` (já existem).
- Streaming de resposta com SSE.

### Fase 4 — Multi-tenant + RBAC consistente (média, ~2 h)
- Hook `useActiveTenant` + selector no topbar.
- Garantir que toda RLS de tabela compartilhada checa `tenant_memberships`.
- Convites (`invites`) — fluxo de envio via email + aceite.

### Fase 5 — Billing real (Stripe + Mercado Pago) (média, ~3 h)
- Rotas `/api/public/stripe/webhook` e `/api/public/mp/webhook` com verificação de assinatura.
- Sync para `subscriptions`, `invoices`, `subscription_audit_log`.
- UI de upgrade/downgrade em `/settings`.
- Enforce `plan_limits` por tenant.

### Fase 6 — Runtime/IoT em tempo real (média, ~3 h)
- Conectar `runtime-client.ts` ao Supabase Realtime nas tabelas `iot_readings` / `tag_samples_*`.
- Comandos descendentes via `iot_command_log`.
- Página `/analytics` com gráficos Recharts sobre `plant_telemetry`.
- Validador normativo (`norm-validator.ts`) invocado a cada mudança e exibido no painel direito.

### Fase 7 — Catálogo unificado + IEC 60617 (média, ~2 h)
- Mover componentes hardcoded para `catalog_components` (seed migration).
- Carregar dinamicamente; fabricantes em `catalog_manufacturers`.
- Importação CSV/JSON de catálogos.

### Fase 8 — Polimento (SEO, a11y, mobile, observabilidade) (~2 h)
- `head()` completo em todas as rotas + sitemap + JSON-LD `SoftwareApplication`.
- og:image gerada por rota.
- Mobile: drawer no lugar dos painéis laterais (<768 px), pinch/zoom em canvases.
- Error capture real (Sentry-like via tabela `audit_logs`).
- Lighthouse run e ajustes.

---

## Detalhes técnicos por fase

```text
Fase 1 ── stabilize ─┐
                     ├─► Fase 2 (persistência) ─┐
                     │                          ├─► Fase 4 (tenant) ─► Fase 5 (billing)
                     └─► Fase 3 (IA + RAG) ─────┤
                                                └─► Fase 6 (runtime/IoT)
                                                         │
                                                         └─► Fase 7 (catálogo) ─► Fase 8 (polish)
```

- Fase 1 deve preceder tudo (preview travado bloqueia validação).
- Fase 2 e 3 podem ser paralelizadas, mas 3 depende do user_id (autenticado já está OK).
- Fase 5 depende de 4 (plan_limits são por tenant).

## Como prosseguir

Confirme se o roadmap está coerente com sua prioridade ou me diga qual fase começar. Sugiro **Fase 1 agora** (corrige preview + fecha findings de segurança), e depois decidimos se a Fase 2 (persistência) ou Fase 3 (IA com RAG) entrega mais valor antes.
