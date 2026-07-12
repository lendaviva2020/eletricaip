---
status: living-document
owner: equipe
last_review: 2026-06-24
---

# 12 · Painel de Auditoria de Status

Painel mestre vivo. **Refletido a partir do codebase real** após varredura
de 24/06/2026. Atualize a cada PR.

Legenda: ✅ done · 🟡 partial (gaps) · ❌ missing · 🔒 manual

---

## Rotas (`src/routes/`)

| Rota | Arquivo | Status | Notas |
|---|---|---|---|
| `/` | `index.tsx` | ✅ | — |
| `/login` · `/signup` · `/forgot-password` · `/reset-password` · `/onboarding` | * | ✅ | — |
| `/dashboard` · `/projects` · `/projects/:id/bom` · `/projects/:id/export` | * | ✅ | — |
| `/workspace` | `workspace.tsx` | ✅ | `?projectId=` aceito e hidrata stores |
| `/digital-twin` | `digital-twin.tsx` | ✅ | Auto-seed via `seedDigitalTwinDemo` |
| `/ai` · `/chat` · `/analytics` · `/catalog` · `/clients` · `/clients/:id` · `/realtime` | * | ✅ | Analytics ainda usa mocks (#AI-03) |
| `/invite/:token` | `invite.$token.tsx` | ✅ | Wire `acceptInviteByToken` → RPC `accept_invite` |
| `/settings` + subrotas | `settings.*.tsx` | ✅ | 14 cards funcionais, com guards de `isPlatformAdmin` |
| `/settings/protocols` | `settings.protocols.tsx` | ✅ | OPC-UA/Modbus/MQTT via `tenant_settings` |
| `/api/public/iot.ingest` · `/api/public/stripe.webhook` · `/api/public/mp.webhook` | * | ✅ | `timingSafeEqual` constant-time auditado |

---

## Stores (`src/lib/**/store.ts`)

| Store | Status | Notas |
|---|---|---|
| `useProjectStore` · `useEditorStore` · `useDiagramStore` · `useNotificationStore` · `useSettingsStore` · `useAuthStore` | ✅ | — |
| `useVoltaiStore` | ✅ removido | #WGL-07 concluído — RightPropertyPanel e collab migrados para `useDiagramStore`; slot `voltai` do snapshot mantido como passthrough legado |
| `usePlcStore` | ✅ | Integrado a Ladder/FBD via `plc-canvas.tsx` (#PLC-01) |
| `useDigitalTwinStore` | 🟢 | Telemetria persistida via `flushTwinTelemetry` (#TWIN-02 ✅) |

---

## Modos do Workspace

| Modo | Status | Notas |
|---|---|---|
| Unifilar WebGL (`webgl-canvas.tsx`) | ✅ | Pixi v8 + Viewport: portas/handles, edge-draft ortogonal, marquee, snap-to-grid, context menu, multi-select drag — todos implementados em `lib/diagram/render/stage.ts` |
| Unifilar legado (`unifilar-canvas.tsx`) | 🟡 | Sobrevive até #WGL-07 |
| Ladder | ✅ | TON/TOF/TP/CTU runtime (#LAD-01), validador `lib/ladder/validator.ts` (#LAD-02), autocomplete de tags (#LAD-03), importador IL/ST (#LAD-04) |
| FBD | ✅ | Sync de params bloco↔runtime (#FBD-01), export (#FBD-02), validação visual (#FBD-03) |
| SCADA | ✅ | Worker sandbox `lib/simulation/script-sandbox.ts` (#SCADA-02), `bind-tag-dialog` (#SCADA-03), alarm→notification (#SCADA-04), snapshot unificado (#SCADA-01) |
| Digital Twin | ✅ | Auto-seed ✅ (#TWIN-01); telemetria persistida ✅ (#TWIN-02); upload GLB ✅ (#TWIN-03); modo "E-se?" ✅ (#TWIN-04 — overrides locais, cenários e gate de persistência) |
| PLC | ✅ | Compile ST (#PLC-02), export PLCopen XML (#PLC-03), I/O map (#PLC-04), validação slot (#PLC-05) |
| Simulação · Alarmes | ✅ | — |

---

## Segurança

| Item | Status | Nota |
|---|---|---|
| RLS em `public.*` e `realtime.messages` | ✅ | Auditado |
| Profiles privilege escalation | ✅ | Trigger + WITH CHECK |
| Buckets privados (`client-logos`) | ✅ | — |
| Modbus SSRF | ✅ | `isHostAllowed` |
| Webhook signature (Stripe/MP) | ✅ | `timingSafeEqual` constant-time (#SEC-02) |
| Rate limit IA / IoT por endpoint | ✅ | `lib/security/rate-limiter.server.ts` + `ai-rate-limit-middleware` (#SEC-03) |
| AI quota source-of-truth | ✅ | `getAiCredits` server-side |
| Security dashboard | ✅ | `/settings/security-monitor` |
| Leaked Password Protection | 🔒 | **Manual** — habilitar em Supabase → Auth → Providers (#SEC-04) |

---

## IA

| Item | Status | Nota |
|---|---|---|
| `ai-chat.functions.ts` (DeepSeek + cota) | ✅ | — |
| `ai-architect.functions.ts` (Zod compartilhado) | ✅ | Schema em `lib/diagram/schema.ts` (#AI-01) |
| Patches IA reversíveis | ✅ | `buildAiPatchCommand` |
| Preview diff antes do commit | ✅ | `ai-patch-preview.tsx` (#AI-02) |
| Dashboard telemetria por operação | ✅ | `/analytics` agrega `ai_usage_events` real por mês/operação (#AI-03) |

---

## Itens realmente pendentes para "pronto para cliente"

1. **#SEC-04** 🔒 *Manual:* habilitar Leaked Password Protection no dashboard
   Supabase (Auth → Providers → Password). Não há API automatizável.
2. **#WGL-07** Descomissionar shim Voltai — **concluído ✅**:
   - **Etapa 1 ✅** Chrome extraído para `canvas-chrome.tsx`; 6 canvases
     desacoplados de `unifilar-canvas.tsx`.
   - **Etapa 2 ✅** `RightPropertyPanel` migrado ao DiagramStore.
   - **Etapa 3 ✅** `useCollab` reescrito sobre o DiagramStore.
   - **Etapa 4 ✅** Deletados `src/lib/voltai/{store,symbols,use-voltai-simulation}.ts`,
     `unifilar-canvas.tsx`, `voltai-node.tsx`, `circuit-control-panel.tsx`.
     Catálogo de componentes movido para `src/lib/palette/component-catalog.ts`
     (mesmos tipos `VoltaiComponentType` / `VOLTAI_COMPONENT_DEFINITIONS`
     preservados no path novo). `use-project-persistence.ts` e
     `ai-architect-client.ts` deixaram de tocar em `useVoltaiStore`;
     slot `voltai` do snapshot permanece no schema por retrocompat mas é
     gravado vazio. Diretório `src/lib/voltai/` deixou de existir.

Tudo o demais do backlog está ✅.

---

## Próximos passos sugeridos

- Habilitar Leaked Password Protection (manual, 1 clique no Supabase).
- Endpoint `getAiCostsByOperation` server fn + wire em `/analytics`.
- Hypertable `tag_samples` já existe — adicionar gravação batch no loop do
  Digital Twin (`useEffect` de `telemetryBuffers`).
- Após #WGL-07, deletar `voltai/store.ts` e `unifilar-canvas.tsx`.
