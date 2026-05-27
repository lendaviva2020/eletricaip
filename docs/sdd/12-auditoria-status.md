---
status: living-document
owner: equipe
last_review: 2026-05-25
---

# 12 · Painel de Auditoria de Status

Painel mestre vivo. **Refletido a partir do codebase real**, não do SDD original (que já está desatualizado em várias seções). Atualize a cada PR.

Legenda: ✅ done · 🟡 partial (gaps) · ❌ missing · 🔒 manual

---

## Rotas (`src/routes/`)

| Rota | Arquivo | Status | Gaps |
|---|---|---|---|
| `/` | `index.tsx` | ✅ | — |
| `/login` | `login.tsx` | ✅ | — |
| `/signup` | `signup.tsx` | ✅ | — |
| `/forgot-password` | `forgot-password.tsx` | ✅ | — |
| `/reset-password` | `reset-password.tsx` | ✅ | — |
| `/onboarding` | `onboarding.tsx` | ✅ | — |
| `/dashboard` | `dashboard.tsx` | ✅ | — |
| `/projects` | `projects.tsx` | ✅ | — |
| `/projects/:id/bom` | `projects.$projectId.bom.tsx` | ✅ | — |
| `/projects/:id/export` | `projects.$projectId.export.tsx` | ✅ | — |
| `/workspace` | `workspace.tsx` | 🟡 | Carregamento por `?projectId=` (#R-01) |
| `/digital-twin` | `digital-twin.tsx` | 🟡 | `seedDigitalTwinDemo` não auto-rodado (#TWIN-01) |
| `/ai` | `ai.tsx` | ✅ | — |
| `/chat` | `chat.tsx` | ✅ | — |
| `/analytics` | `analytics.tsx` | ✅ | — |
| `/catalog` | `catalog.tsx` | ✅ | — |
| `/clients` | `clients.tsx` | ✅ | — |
| `/clients/:id` | `clients.$clientId.tsx` | ✅ | — |
| `/realtime` | `realtime.tsx` | ✅ | — |
| `/invite/:token` | `invite.$token.tsx` | 🟡 | Wire com RPC `accept_invite` (#INV-01) |
| `/settings` | `settings.tsx` | ✅ | — |
| `/settings/profile` | `settings.profile.tsx` | ✅ | — |
| `/settings/billing` | `settings.billing.tsx` | ✅ | — |
| `/settings/team` | `settings.team.tsx` | ✅ | — |
| `/settings/security` | `settings.security.tsx` | ✅ | — |
| `/settings/security-monitor` | `settings.security-monitor.tsx` | ✅ | — |
| `/settings/ai-status` | `settings.ai-status.tsx` | ✅ | — |
| `/settings/notifications` | `settings.notifications.tsx` | ✅ | — |
| `/settings/appearance` | `settings.appearance.tsx` | ✅ | — |
| `/settings/integrations` | `settings.integrations.tsx` | ✅ | — |
| `/settings/protocols` | — | ❌ | A criar (#R-02) |
| `/api/public/iot.ingest` | `api/public/iot.ingest.ts` | ✅ | — |
| `/api/public/stripe.webhook` | `api/public/stripe.webhook.ts` | 🟡 | Auditar `timingSafeEqual` (#SEC-02) |
| `/api/public/mp.webhook` | `api/public/mp.webhook.ts` | 🟡 | Auditar assinatura (#SEC-02) |

**Conclusão:** ao contrário do SDD original, a malha de rotas está praticamente completa. Foco da Fase 1 → consolidar `workspace.tsx?projectId=`, criar `/settings/protocols`, fechar wire de convite.

---

## Stores (`src/lib/**/store.ts`)

| Store | Arquivo | Status | Gaps |
|---|---|---|---|
| `useProjectStore` | `lib/project-store.ts` | 🟡 | Snapshot SCADA fragmentado com VoltaiStore (#SCADA-01) |
| `useVoltaiStore` | `lib/voltai/store.ts` | 🟡 | A descomissionar após migração ao DiagramStore (#WGL-07) |
| `useEditorStore` | `lib/editor/store.ts` | ✅ | — |
| `useDiagramStore` | `lib/diagram/store.ts` | ✅ | — |
| `usePlcStore` | `lib/plc/store.ts` | 🟡 | Sem integração com editor central (#PLC-01) |
| `useDigitalTwinStore` | `lib/digital-twin-store.ts` | 🟡 | Telemetria sem persistência (#TWIN-02) |
| `useNotificationStore` | `lib/notification-store.ts` | ✅ | — |
| `useSettingsStore` | `lib/settings-store.ts` | ✅ | — |
| `useAuthStore` | `hooks/auth-store.ts` | ✅ | — |

---

## Modos do Workspace

| Modo | Canvas | Status | Gaps abertos |
|---|---|---|---|
| Unifilar (legado) | `unifilar-canvas.tsx` (ReactFlow + VoltaiStore) | 🟡 | Conviver até #WGL-07 |
| Unifilar (WebGL) | `webgl-canvas.tsx` (Pixi + DiagramStore) | 🟡 | #WGL-01 a #WGL-06 |
| Ladder | `ladder/rung-grid.tsx` | 🟡 | TOF/TP (#LAD-01), validador (#LAD-02), autocomplete (#LAD-03) |
| FBD | `fbd-canvas.tsx` | 🟡 | Sync params bloco↔runtime (#FBD-01), export (#FBD-02) |
| SCADA | `scada-canvas.tsx` + `konva-canvas.tsx` | 🟡 | Sandbox de script (#SCADA-02), persistência (#SCADA-01), UI tag binding (#SCADA-03) |
| Digital Twin | `twin-canvas.tsx` + `twin-3d-viewer.tsx` | 🟡 | Auto-seed (#TWIN-01), persistência telemetria (#TWIN-02), upload GLB (#TWIN-03) |
| PLC | `plc-canvas.tsx` | 🟡 | Integração editor (#PLC-01), compilar (#PLC-02), export PLCopen (#PLC-03) |
| Simulação | `sim-canvas.tsx` | ✅ | — |
| Alarmes | `alarms-canvas.tsx` | ✅ | — |

---

## Segurança

| Item | Status | Nota |
|---|---|---|
| RLS em `public.*` | ✅ | Auditado |
| RLS `realtime.messages` | ✅ | Migração 20260524003400 |
| Profiles privilege escalation | ✅ | Trigger + policy WITH CHECK |
| `client-logos` bucket privado | ✅ | Migração 20260525021759 |
| Modbus SSRF | ✅ | `isHostAllowed` bloqueia loopback/internas |
| Leaked Password Protection | 🔒 | Habilitar em Supabase → Auth → Providers |
| Webhook signature (Stripe/MP) | 🟡 | Auditar `timingSafeEqual` (#SEC-02) |
| Rate limit IA / IoT | 🟡 | Revisar burst por endpoint (#SEC-03) |
| AI quota source-of-truth | ✅ | `getAiCredits` server-side; badge sincronizado |
| Security dashboard | ✅ | `/settings/security-monitor` |

---

## IA

| Item | Status | Nota |
|---|---|---|
| `ai-chat.functions.ts` | ✅ | DeepSeek + cota |
| `ai-architect.functions.ts` | 🟡 | Schema Zod compartilhado (#AI-01) |
| Patches IA reversíveis | ✅ | `buildAiPatchCommand` |
| Preview diff antes do commit | ❌ | #AI-02 |
| Telemetria por operação | 🟡 | `ai_credit_costs` existe; sem dashboard (#AI-03) |

---

## Próximos passos

1. Criar issues do backlog (Fase 2) em [`13-backlog.md`](./13-backlog.md) com IDs estáveis (#WGL-XX, #PLC-XX, etc.).
2. Confirmar com o usuário o ponto de partida da Fase 2 (WebGL Unifilar vs PLC↔Editor).
3. A cada PR, atualizar este painel e os arquivos de módulo.
