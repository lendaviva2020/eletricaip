# AGENTS.md — ElétricAi

> Documento técnico de referência do repositório e inventário de auditoria de segurança.
> Gerado a partir de inspeção somente de leitura do código-fonte, migrations e configurações.
> Nenhuma alteração foi feita na implementação; nenhum segredo é reproduzido neste documento.
>
> **Legenda de estado das funcionalidades:** ✅ implementado · 🟡 parcial · 🎨 apenas visual/demo · ❌ não implementado/planejado · ❓ não verificado

---

## 1. Identificação do sistema

| Campo                            | Valor verificado                                                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nome                             | **ElétricAi** (README: "ELETRICAI"; nome interno do pacote: `tanstack_start_ts`, sem campo `version` no `package.json`)                                                                                                                                                            |
| Versão                           | ❓ Não verificável — não há campo de versão no projeto                                                                                                                                                                                                                             |
| Objetivo                         | Plataforma de engenharia elétrica e automação industrial assistida por IA: projetos elétricos (unifilar/multifilar), lógica de controle (Ladder/FBD), configuração de PLC, SCADA/HMI, digital twin 3D, cálculos, catálogo de componentes, IoT/telemetria e cobrança por assinatura |
| Público-alvo                     | Engenheiros elétricos, automatistas, integradores e plantas industriais — mercado brasileiro (preços em BRL, Mercado Pago, normas NBR/ABNT e IEC)                                                                                                                                  |
| Arquitetura                      | SPA/SSR **TanStack Start** (React 19) na Vercel; camada de API por **server functions** (`createServerFn`); **Supabase** (Postgres + RLS, Auth, Storage, Realtime, Edge Functions); IA via **DeepSeek** somente no servidor                                                        |
| Hospedagem                       | Vercel (preset `nitro: vercel`) + projeto Supabase cloud (`project_id = "hcjkwqyxqxnbqikwltvc"` em `supabase/config.toml`) + Upstash (rate limiting, quando configurado)                                                                                                           |
| Integrações externas confirmadas | DeepSeek (`api.deepseek.com`), Stripe, Mercado Pago, Supabase (Auth/DB/Storage/Realtime), Google OAuth, Upstash Redis REST, Lovable (`@lovable.dev/mcp-js`, broker de preview), Modbus TCP (socket no servidor, com guarda SSRF)                                                   |
| Estado real                      | Substancialmente implementado nos editores e persistência; várias telas exibem dados sintéticos/demo; alguns módulos do briefing não têm UI (documentos, relatórios dedicados, tela de cálculos, admin dedicado)                                                                   |

---

## 2. O que o sistema faz

O ElétricAi permite a um engenheiro criar e gerir **projetos de automação industrial** em um único workspace web:

1. O usuário se cadastra (e-mail/senha ou Google), cria um projeto (com cliente/tenant) e entra no **workspace**.
2. No workspace, ele desenha o **diagrama unifilar** (componentes IEC em canvas WebGL/Pixi), gera o **multifilar** derivado, escreve lógica **Ladder** e **FBD**, configura o **PLC** (rack, variáveis, blocos), desenha telas **SCADA/HMI**, simula a lógica e acompanha um **digital twin 3D** com telemetria IoT.
3. A **IA (DeepSeek)** gera projetos elétricos a partir de linguagem natural (`/ai`), conversa em chat persistente (`/chat`) e propõe patches no canvas do workspace — sempre com validação Zod, preview e limite de créditos.
4. Tudo é persistido em um **snapshot JSONB** do projeto (auto-save com debounce de 2 s) com versionamento explícito; BOM, alarmes, telemetria e metadados ficam em tabelas próprias.
5. O modelo de negócio é **freemium** (free/basic/pro/premium) com checkout Stripe/Mercado Pago, webhooks assinados e limites por plano (`plan_limits`, créditos de IA).

### Estado real das funcionalidades

| Área                                                                | Estado                 | Evidência resumida                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro/login/OAuth/recuperação de senha                           | ✅                     | Supabase Auth; redirect validado por `isSafeRedirect`                                                                                                                                                                                                                                                     |
| Dashboard                                                           | 🟡                     | Projetos recentes reais; gráficos de tendência com dados sintéticos (seno)                                                                                                                                                                                                                                |
| Gestão de projetos (CRUD, duplicar, arquivar, versões, autosave)    | ✅                     | `projects.functions.ts`, `project_versions`, snapshot + debounce 2 s                                                                                                                                                                                                                                      |
| Editor unifilar/multifilar (Pixi.js + viewport)                     | ✅                     | `lib/diagram/*`, `render/stage.ts`, testes `multifilar`                                                                                                                                                                                                                                                   |
| Multifilar gerado do unifilar                                       | ✅                     | `lib/diagram/multifilar.ts` (inferência F/N/3F/N, memorial de condutores)                                                                                                                                                                                                                                 |
| Editor Ladder + runtime de scan (TON/TOF/TP/CTU)                    | ✅                     | `lib/ladder/scan-core.ts` (puro), compilador IL/ST, importador, validador, verificação de E-STOP por simulação                                                                                                                                                                                            |
| Editor FBD + motor IEC (AST→IR, EN/ENO, runtime, simulação)         | ✅                     | `lib/fbd/engine/*`; paleta além dos blocos IEC é limitada; **sem blocos customizados no motor**                                                                                                                                                                                                           |
| PLC (rack, variáveis, blocos, PLCopen XML)                          | ✅ (camada de projeto) | `lib/plc/*`, `plcopen-export.ts`; **sem download/execução em PLC real**                                                                                                                                                                                                                                   |
| Comunicação Modbus                                                  | 🟡                     | Conexão TCP real com guarda SSRF, mas **sem framing Modbus**; registradores em memória simulada                                                                                                                                                                                                           |
| Comunicação OPC-UA                                                  | 🟡/❌                  | Sessão simulada; conexão real lança erro — `node-opcua` não está em `package.json`                                                                                                                                                                                                                        |
| SCADA/HMI (telas, tags, alarmes ISA-18.2, trends)                   | ✅                     | `scada-canvas.tsx`, `scada-engine.ts`, sandbox de scripts em Web Worker                                                                                                                                                                                                                                   |
| Simulação                                                           | 🟡                     | Ladder/FBD simulam lógica real; planta 8M+2EX com motor determinístico; **circuitos de potência e PLC real não são simulados**; painel "Simulação" reúne planta, cenários, ponte e estudos                                                                                                                |
| Digital twin 3D + telemetria + what-if                              | ✅                     | `/digital-twin`, upload GLB (bucket privado, signed URLs), flush de telemetria, Realtime                                                                                                                                                                                                                  |
| Cálculos elétricos                                                  | ✅                     | `electrical-calc.ts`: motor, demanda, queda de tensão, dimensionamento de cabo/corrente. `electrical-sim.ts` (novo): curto-circuito IEC 60909, seletividade IEC 60947, ruptura, arco elétrico IEEE 1584, esforço térmico de partida, com painel em Simulação. **Ainda ausentes:** harmônicas, aterramento |
| IA (architect, chat, patches, RAG normativo, créditos, rate limits) | ✅                     | `ai-architect.functions.ts`, `ai-chat.functions.ts`, `diagram/ai.functions.ts`; **upload/OCR de PDF na IA é mock**                                                                                                                                                                                        |
| Catálogo de componentes + importação CSV/XLSX                       | ✅                     | `/catalog`, `/settings/catalog-import` (tenant-admin)                                                                                                                                                                                                                                                     |
| Documentos/manuais (upload, OCR, indexação)                         | ❌                     | Tabelas `knowledge_*` existem no banco, mas **não há UI nem fluxo de upload** no frontend                                                                                                                                                                                                                 |
| Relatórios (PDF/DXF/BOM)                                            | ✅/🟡                  | `/projects/$id/export` (PDF jsPDF + DXF), BOM; **sem exportação Excel de relatórios**                                                                                                                                                                                                                     |
| Assinaturas/billing (Stripe + Mercado Pago)                         | ✅                     | Checkout, webhooks assinados idempotentes (rota do servidor); **UI com fallback demo**                                                                                                                                                                                                                    |
| Equipe/convites/roles                                               | ✅                     | `settings.team.tsx` + RPC `accept_invite`; **fallback demo** quando backend indisponível                                                                                                                                                                                                                  |
| Administração de plataforma                                         | 🟡                     | Sem rota `/admin`; gating por `is_platform_admin()` em billing, rate limits, catálogo, blog                                                                                                                                                                                                               |
| MCP server para agentes (OAuth 2.1)                                 | ✅/❓                  | `/mcp` + consent screen; enforcement interno da lib `@lovable.dev/mcp-js` não verificado                                                                                                                                                                                                                  |
| Termos de uso / privacidade                                         | ❌                     | Links no footer da landing apontam para `#`                                                                                                                                                                                                                                                               |

---

## 3. Tecnologias e como rodar

### Stack verificada

| Camada                | Tecnologias                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework/linguagem   | TanStack Start 1.168 (React 19, TanStack Router 1.170, file-based routing), TypeScript 5.8 (`strict: true`), Vite 7, Nitro (preset Vercel)                                            |
| UI                    | Tailwind CSS v4, Radix UI, shadcn/ui (`components.json`), lucide-react, framer-motion, sonner, cmdk, vaul, react-resizable-panels                                                     |
| Canvas/gráficos       | Pixi.js 8 + pixi-viewport (unifilar/multifilar), Konva + react-konva (SCADA/twin), React Flow (FBD), Three.js + @react-three/fiber/drei (twin 3D), Recharts (gráficos), html-to-image |
| Estado                | Zustand + Immer (stores), TanStack Query (server state)                                                                                                                               |
| Formulários/validação | react-hook-form + Zod (`@hookform/resolvers`), validação Zod em rotas, server functions, schema do diagrama e saídas de IA                                                            |
| Editor de código      | Monaco Editor                                                                                                                                                                         |
| Exportação            | jsPDF (PDF), dxf próprio, xlsx (importação de catálogo)                                                                                                                               |
| Backend/BaaS          | Supabase: Postgres (RLS), Auth (e-mail/senha + Google OAuth), Storage, Realtime, Edge Functions (Deno)                                                                                |
| IA                    | DeepSeek (`deepseek-chat`) — chamado **somente** em server functions e Edge Function, com chave via `DEEPSEEK_API_KEY`                                                                |
| Pagamentos            | Stripe (API REST via `fetch`, sem SDK) e Mercado Pago                                                                                                                                 |
| Rate limiting         | `@upstash/ratelimit` + `@upstash/redis` (REST)                                                                                                                                        |
| Segurança             | `jose` (verificação JWT no servidor), DOMPurify (presente, não utilizado — ver RISK-020)                                                                                              |
| Testes/lint           | Vitest 4 + Testing Library + jsdom; ESLint 9 (typescript-eslint) + Prettier                                                                                                           |
| Gerenciador           | Bun 1.3.3 (`packageManager`; `bun.lock`; `vercel.json` usa `bun install --frozen-lockfile`)                                                                                           |

### Pré-requisitos

- Bun ≥ 1.3 (recomendado; o README menciona npm, mas o lockfile é do Bun)
- Projeto Supabase provisionado (Auth, DB com migrations, Storage)
- Chave DeepSeek para os recursos de IA
- Opcionais: Stripe e Mercado Pago (billing), Upstash (rate limiting), Google OAuth

### Comandos (extraídos do `package.json`)

| Comando         | Script real                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| Desenvolvimento | `bun run dev` (`vite dev`)                                                         |
| Build           | `bun run build` (`vite build`) · `bun run build:dev`                               |
| Preview         | `bun run preview`                                                                  |
| Dev na Vercel   | `bun run start` (`npx vercel dev`)                                                 |
| Lint            | `bun run lint` (`eslint .`)                                                        |
| Formatação      | `bun run format` (`prettier --write .`)                                            |
| Testes          | `bun run test` (`vitest run`)                                                      |
| Typecheck       | `bun run typecheck` (`tsc --noEmit`) — adicionado em 2026-10-12 (fecha o RISK-025) |

> O `README.md` menciona CI em `.github/workflows/ci.yml` executando lint/testes/typecheck e deploys — **restaurada em 2026-10-12** (`.github/workflows/ci.yml` versionada no commit `e04c386`).

### Variáveis de ambiente (somente nomes; nunca coloque valores aqui)

Usadas no código (confirmadas por inspeção):

- **Supabase (cliente/navegador):** `VITE_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`; `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `VITE_SUPABASE_PROJECT_ID`
- **Supabase (servidor):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (legacy HS256 no `auth-middleware.ts`)
- **IA:** `DEEPSEEK_API_KEY`
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PRICE_BASIC_MONTHLY`, `VITE_STRIPE_PRICE_PRO_MONTHLY`, `VITE_STRIPE_PRICE_PREMIUM_MONTHLY`
- **Mercado Pago:** `MP_ACCESS_TOKEN` (alias `MERCADO_PAGO_ACCESS_TOKEN`), `MP_WEBHOOK_SECRET`
- **Rate limiting:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **App:** `PUBLIC_APP_URL`
- **Deploy (GitHub Actions, documentadas no README):** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

⚠️ Drift de documentação: o `.env.example` lista `MERCADO_PAGO_WEBHOOK_SECRET` (o código lê `MP_WEBHOOK_SECRET`) e **não** lista `UPSTASH_REDIS_REST_URL/TOKEN` nem `SUPABASE_JWT_SECRET`. Além disso, `src/integrations/supabase/env.ts` mantém fallbacks hardcoded de URL/anon key (RISK-008).

---

## 4. Estrutura de pastas

```
eletricaip/
├── AGENTS.md                  ← este documento
├── README.md                  ← onboarding de secrets do CI/CD
├── roadmap.md                 ← roadmap de features
├── package.json / bun.lock    ← scripts e dependências (Bun)
├── vite.config.ts             ← TanStack Start + Nitro (Vercel) + chunks manuais + plugin MCP
├── vitest.config.ts           ← configuração dos testes
├── tsconfig.json              ← TypeScript strict, alias @/* → ./src/*
├── eslint.config.js           ← ESLint 9
├── vercel.json                ← headers de segurança (CSP, X-Frame-Options etc.)
├── components.json            ← shadcn/ui
├── bunfig.toml / opencode.json
├── .env.example               ← nomes de variáveis (sem valores reais)
├── docs/
│   ├── sdd/                   ← design docs (visão geral, stack, segurança, backlog, auditoria de status)
│   └── fbd/                   ← matriz de implementação do FBD
├── public/                    ← favicon e assets estáticos
├── supabase/
│   ├── config.toml            ← project_id + verify_jwt da Edge Function de IA
│   ├── migrations/            ← 54 arquivos SQL (11 são placeholders de histórico remoto)
│   └── functions/
│       ├── ai-industrial-architect/  ← Edge Function de IA (órfã do frontend — ver RISK-009)
│       └── stripe-webhook/           ← Edge Function de webhook Stripe (sem idempotência — RISK-013)
└── src/
    ├── routes/                ← roteamento file-based (42 rotas + __root)
    │   ├── __root.tsx         ← shell, AuthGate, chrome (sidebar/topbar), 404/erro
    │   ├── index.tsx, login.tsx, signup.tsx, forgot-password.tsx, reset-password.tsx
    │   ├── auth.callback.tsx, onboarding.tsx, invite.$token.tsx
    │   ├── dashboard.tsx, projects.tsx, projects.$projectId.{bom,export}.tsx
    │   ├── workspace.tsx      ← shell dos editores (?projectId=)
    │   ├── ai.tsx, chat.tsx, analytics.tsx, catalog.tsx, clients*.tsx, realtime.tsx
    │   ├── digital-twin.tsx   ← twin 3D standalone
    │   ├── settings.tsx + settings.*.tsx (14 subrotas)
    │   ├── mcp.ts             ← endpoint MCP (server handler)
    │   ├── [.]lovable.oauth.consent.tsx, [.well-known]/oauth-protected-resource.ts
    │   └── api/public/        ← iot.ingest.ts, stripe.webhook.ts, mp.webhook.ts
    ├── components/
    │   ├── ui/                ← primitivas shadcn/Radix
    │   ├── canvases/          ← webgl-canvas, ladder-canvas, fbd-canvas, plc-canvas,
    │   │                        scada-canvas, sim-canvas, twin-canvas, konva-canvas (legado),
    │   │                        twin-3d-viewer, ladder/{rung-grid,ladder-cell}
    │   ├── scada/, fbd/       ← bind-tag-dialog, fbd-engine-panel
    │   ├── industrial-workspace.tsx, mode-tabs, sidebars, right-panel, bottom-panel
    │   └── canvas-ai-chat.tsx, ai-patch-preview.tsx, onboarding-tour.tsx …
    ├── hooks/                 ← use-auth, use-active-tenant, use-collab, use-fbd-engine,
    │                            use-tenant-setting, use-twin-telemetry-persistence, use-notifications …
    ├── lib/                   ← domínio + server functions
    │   ├── diagram/           ← schema (Zod), store (comandos/undo), render/{stage,symbols,ports},
    │   │                        multifilar, export-dxf, ai.functions
    │   ├── ladder/            ← types, scan-core (runtime puro), compiler (IL/ST), importer,
    │   │                        validator, verify-estop, definitions, from-ai-spec
    │   ├── fbd/               ← types/compiler/runtime legados + engine/ (model, datatypes,
    │   │                        registry, iec-library, compiler, runtime, simulation)
    │   ├── plc/               ← types, store, rack-validation, plcopen-export
    │   ├── simulation/        ← scada-engine, scada-worker (sandbox), script-sandbox, worker-guards
    │   ├── security/          ← rate-limiter.server, ai-rate-limit-*, ai-metrics, svg-sanitizer
    │   ├── mcp/               ← index (defineMcp), supabase, tools/*
    │   ├── *.functions.ts     ← server functions (projetos, BOM, catálogo, clientes, IA, billing,
    │   │                        IoT, digital twin, diagnósticos, Modbus/OPC-UA, tenant settings…)
    │   └── electrical-calc.ts, norm-validator.ts, pdf-export.ts, dxf-export.ts,
    │       project-store.ts, editor/store.ts, use-project-persistence.ts, plans.ts …
    ├── integrations/supabase/ ← client.ts (browser), client.server.ts (service role),
    │                            types.ts (tipos gerados), env.ts, auth-attacher.ts,
    │                            auth-middleware.ts, tenant-admin-middleware.ts,
    │                            ai-rate-limit-middleware.ts, previewAuthStorage.ts
    ├── __tests__/             ← 31 arquivos de teste / 260 testes (Vitest)
    ├── router.tsx / routeTree.gen.ts (gerado) / start.ts / server.ts / styles.css
```

Observações:

- **Não existem** diretórios `src/services`, `src/pages`, `.github/` nem `.env` versionado.
- A lógica de servidor vive em `src/lib/*.functions.ts` (server functions do TanStack) e nas rotas `src/routes/api/public/*`.
- O schema central do banco (tabelas principais) **não** está em migrations locais — ver §6 e RISK-014.

---

## 5. Principais telas e funcionalidades

### 5.1 Landing page — `/` (`src/routes/index.tsx`) ✅ UI

Apresentação, features, workflow, pricing (planos hardcoded R$0/100/580/1000 → `/settings/billing`), CTA. Links de termos/privacidade apontam para `/termos` e `/privacidade` (RISK-027 mitigado em 2026-10-12). Redireciona usuário autenticado para `/dashboard`.

### 5.2 Autenticação

- `/login`, `/signup` (e-mail/senha + Google OAuth), `/forgot-password`, `/reset-password`, `/auth/callback` (PKCE `exchangeCodeForSession`) — todos com Supabase Auth.
- `?redirect=` validado por `isSafeRedirect` (`src/lib/safe-redirect.ts`, com testes).
- Sessão persistida em **localStorage** via `previewAuthStorage` (RISK-004); refresh automático (`autoRefreshToken`).
- Gate de rotas client-side no `__root.tsx` (`AuthGate`, allowlist de rotas públicas).
- Proteção de dados no servidor: **todas** as server functions inspecionadas aplicam `requireSupabaseAuth` (91 definições) ou `requireTenantAdmin`.
- `/settings/security`: troca de senha + `signOut` global. **Sem MFA e sem lista de sessões/dispositivos** (RISK-017).
- Perfil em `/settings/profile` (tabela `profiles`).

### 5.3 Dashboard — `/dashboard` 🟡

Loader prefetch de projetos + créditos de IA (`getAiCredits`); projetos recentes reais; gráficos de tendência com **dados sintéticos** (RISK-028).

### 5.4 Gestão de projetos — `/projects` ✅

CRUD, duplicar, arquivar, excluir (server functions com limite por plano via `plan_limits`), busca/filtros. Persistência em `projects`, `diagrams`, `project_versions`. Auto-save com debounce de 2 s no workspace (`use-project-persistence.ts`). Colaboração em tempo real por Realtime (`use-collab.ts`, canal `diagram:v2:<projectId>`).

### 5.5 Workspace — `/workspace?projectId=` ✅ (modos carregados sob demanda)

`industrial-workspace.tsx` com modos: `unifilar | ladder | fbd | scada | twin | plc | sim | alarms`, cada um em `React.lazy` + `ErrorBoundary`.

- **Unifilar/Multifilar** — `webgl-canvas.tsx` + `lib/diagram/render/stage.ts` (Pixi.js 8 + viewport): símbolos IEC, portas, conexões, marquee, snap, undo/redo (padrão de comandos), paleta (`lib/palette/component-catalog.ts`), geração de multifilar, BOM, export DXF/PDF. Persistência no snapshot `diagrams.canvas_data` (Zod `SnapshotSchema`). ✅
- **Ladder** — `ladder-canvas.tsx` → `rung-grid.tsx`: matriz de células (XIC/XIO/OTE/OTL/OTU/TON/TOF/TP/CTU), runtime de scan puro (`scan-core.ts`, orçamento 50 ms/2000 rungs), compilação IL/ST, importação IL/ST, validador estático, verificação de E-STOP por simulação. Elementos de paleta além dos 9 executáveis (comparadores/mat/lógica) são **decorativos** (sem suporte no engine). ✅ (paleta parcial)
- **FBD** — `fbd-canvas.tsx` (React Flow) + `lib/fbd/engine`: compilação com grafo de dependências → AST → IR tipado, EN/ENO IEC, runtime determinístico, simulação de passo fixo, forçamento de saídas, diagnósticos; ponte para SCADA (`scada-bridge.ts`). Caminho legado (`lib/fbd/{types,compiler,runtime}.ts`) ainda usado para FBD→ST no PLC. **Sem blocos customizados/fabricante no motor.** ✅
- **PLC** — `plc-canvas.tsx` (839 linhas): hardware (catálogo S7-like), rack com validação, variáveis (I/Q/M/DB), blocos (OB/FC/FB/DB) com Monaco, compilação de Ladder/FBD → ST, export PLCopen XML. **Sem download/execução em PLC físico.** ✅ (camada de projeto)
- **SCADA/HMI** — `scada-canvas.tsx` (Konva): widgets HMI, dialog de bind de tags, banner de alarmes, editor de scripts Monaco executados em **Web Worker sandbox** (`scada-worker.ts`, com testes). Alarmes com estados ISA-18.2 e persistência (`alarm_configs`, `alarm_history`). ✅
- **Simulação** — `sim-canvas.tsx` + `lib/simulation/scada-engine.ts` (alarmes ISA-18.2 por regras sobre tags) + **planta simulada 8M+2EX** (`lib/simulation/plant-engine.ts` puro/determinístico com rampa, térmica, proteções, histerese e E-STOP + `plant-store.ts` efêmero + `plant-sim-panel.tsx` com selo SIMULAÇÃO; tags derivadas alimentam alarmes e gráficos do Sim). Motores derivam In/Istart de `electrical-calc.ts`; **não atesta operação (Termos §10)**. O modo reúne quatro painéis: planta, **cenários de teste** (`test-scenarios.functions.ts` — engine headless determinístico, presets por tipo, histórico persistido em `test_scenario_runs`), **ponte Unifilar→Ladder** (`unifilar-ladder-bridge.ts` — análise pura, geração de ST/IL importável, mapeamentos em `unifilar_ladder_mapping`) e **estudos elétricos** (`electrical-sim.functions.ts` — resultados em `electrical_simulation_results`). ✅ (lógica da planta; potência elétrica via estudos dedicados)
- **Twin (no workspace e rota dedicada `/digital-twin`)** — visual 3D (Three.js/R3F), hotspots persistidos (`twin_hotspots`), upload de modelo GLB/GLTF (bucket privado `twin-models`, signed URLs), telemetria com flush em lote (`tag_samples`), painel What-If com gate de persistência, saúde da telemetria. ✅
- **Alarmes** — `alarms-canvas.tsx` + server functions de config/histórico. ✅

### 5.6 Inteligência artificial ✅ (com lacunas)

- **Arquiteto** `/ai` — `ai-architect.functions.ts`: gera projeto elétrico completo a partir de prompt (Zod, ≤ 32 000 chars), RAG sobre `normative_chunks`, tool-call forçada com `AiDiagramPatchSchema`, loop de verificação (máx. 2 correções, inclui verificação de E-STOP), consumo de créditos (`consume_ai_credits`) e rate limits (`requireAiQuota` + `requireBurstLimit`). Aplica resultado nos stores e navega ao workspace.
- **Chat** `/chat` — `ai-chat.functions.ts`: streaming SSE, conversas/mensagens persistidas (`ai_conversations`, `ai_messages`), histórico até 40 mensagens enviado sem sanitização de prompt injection (RISK-010).
- **Canvas** — `canvas-ai-chat.tsx` + `diagram/ai.functions.ts` (`generateDiagramPatch`): patch validado por Zod e aplicado via comandos, com preview (`ai-patch-preview.tsx`). Timeout 60 s e retries. **Upload de PDF/CSV na IA é simulação** (mock com progresso falso).
- **Governança**: créditos por operação (`ai_credit_costs`), quota mensal, burst limit (Upstash ou memória), painel `/settings/ai-status`, métricas `/settings/rate-limits` (admin), eventos `ai_status_events`/`ai_usage_events`.
- Chave DeepSeek **somente** no servidor. A Edge Function `ai-industrial-architect` **não é chamada pelo frontend** (RISK-009).

### 5.7 Cálculos elétricos ✅

`lib/electrical-calc.ts` (puro, testado): corrente nominal e de partida de motor, dimensionamento de condutor (curva IEC simplificada + fator 1,25), seleção de disjuntor, demanda/aparente/trafo padrão, queda de tensão. `lib/norm-validator.ts` aplica regras NBR 5410/14039, NR-10/12, IEC, ISA-18.2.

`lib/electrical-sim.ts` (novo, puro/determinístico, 26 testes): `shortCircuitIEC60909` (I''k3, I''k1, pico ip, fator c, X/R típico, k0 por grupo vetorial), `checkBreakingCapacity` (ruptura IEC 60947), `selectivityIEC60947` (total/parcial/nenhuma), `defaultInstantaneous` (curvas MCB B/C/D/K), `arcFlashIEEE1584` + `ppeFromEnergy` (NFPA 70E), `motorStartThermal` (I²t e ΔT normalizados por τ=120 s), `voltageDropCircuit` (limite NBR 5410). Consumido pelo painel **Estudos elétricos** (`electrical-study-panel.tsx`) que persiste em `electrical_simulation_results`.

**Ausentes:** harmônicas, aterramento. Ainda não há tela de cálculos dedicada fora do modo Simulação.

### 5.8 Catálogo, documentos e relatórios

- `/catalog` (leitura, dados do banco), `/settings/catalog-import` (CSV/XLSX, limitado a 2000 linhas, `requireTenantAdmin`). 🟡 (pode estar vazio — "aguardando cadastro pelo administrador")
- **Documentos/manuais:** ❌ sem UI; tabelas `knowledge_documents`/`knowledge_chunks`/`files`/`file_versions` existem no banco mas sem consumidores no frontend (RISK-033 relacionado).
- **Relatórios:** `/projects/$projectId/export` (PDF com memorial via jsPDF + DXF) e `/projects/$projectId/bom`. Sem Excel de relatórios.

### 5.9 Realtime/IoT — `/realtime` ✅ (plano Pro)

Devices, leituras, alertas, ack, fila de comandos (`iot_command_log` com watchdog/fail-safe), criação de API keys (armazenadas como hash SHA-256 + prefixo), inspeção de endpoint público `/api/public/iot/ingest` (Bearer API key, Zod, rate limit Upstash, RPC `ingest_iot_reading`).

### 5.10 Gestão, billing e administração

- `/clients` (CRM por tenant), `/settings/team` (membros, convites, roles, matriz de permissões — RPC `accept_invite`), `/settings/notifications` (persistido em `tenant_settings`), `/settings/integrations` (credenciais padrão Modbus/OPC-UA/MQTT em `tenant_settings`), `/settings/protocols` (teste Modbus TCP real com SSRF guard; OPC-UA simulada), `/settings/diagnostics`, `/settings/security-monitor`, `/settings/autosave`, `/settings/appearance` (tema real; densidade/idioma sem consumidores).
- `/settings/billing` (admin de plataforma): `getBillingOverview`, `createStripeCheckout`, `createMpPreference`, `cancelSubscription`, `changePlanManual` + audit log; **fallback demo** quando backend indisponível.
- `/analytics`: uso de IA real; métricas industriais são **placeholder** (`Math.random()`).
- Webhooks: `/api/public/stripe/webhook` (HMAC timing-safe + idempotência via `stripe_webhook_events`), `/api/public/mp/webhook` (segredo compartilhado timing-safe + idempotência + reconsulta no MP).
- `/mcp`: servidor MCP com OAuth 2.1 (issuer Supabase) e tools que atuam **como o usuário autenticado** (token encaminhado, sem fallback anônimo).

---

## 6. Banco de dados

### 6.1 Visão geral

- **66 tabelas** com RLS habilitado e **169 policies** — conforme dump literal do banco vivo consolidado em `supabase/migrations/20260906072900_baseline_rls_consolidation.sql` (contagem verificada em 2026-10-12; `twin_hotspots` ausente no dump — coberta pela migration `20261012090000`).
- **Push 2026-10-14 (projeto do app `rvaaxvdimggztjxoktvy`): 56/56 migrations aplicadas, 0 pendentes** (`supabase db push --include-all`; link trocado de `hcjkwqyxqxnbqikwltvc`, que recebeu 16 parciais e foi abandonado como alvo). Para o push passar, 20+ migrations foram tornadas replay-safe (guards `IF EXISTS` + `EXCEPTION WHEN undefined_table/column/function`; baseline de 401 statements transformado por script com as 168 policies byte-idênticas verificadas). Verificado no banco: 7 tabelas novas com RLS ligado; trigger hardcoded de admin removido (`pg_trigger` = 0); `platform_admins` vazio.
- **Ressalva crítica**: o banco do app **não tem as tabelas centrais** (`profiles`, `projects`, `tenants`, `tenant_memberships`, `plan_limits`, `diagrams`, `iot_*`, `catalog_*`...) — o DDL delas nunca esteve no repo. Os guards pularam policies/seeds dependentes. **O app não funciona contra este banco até o DDL central ser restaurado** (pg_dump do banco vivo original ou recriação). RISK-014 segue aberto nessa parte.
- **6 tabelas novas** criadas pelo push (`unifilar_ladder_mapping`, `test_scenarios`, `test_scenario_runs`, `electrical_simulation_results`, `ai_electrical_config` em `20261012120000`; `deletion_requests` em `20261012110000`, com RLS verificado). O código as acessa via helper `untyped()` — **remover o `untyped()` e regenerar `types.ts`** (`supabase gen types typescript`, agora com as tabelas presentes no banco).
- **15 tabelas** são criadas em migrations locais (as 9 históricas `ai_credit_costs`, `project_bom_items`, `notifications`, `runtime_logs`, `clients`, `tenant_settings`, `ai_status_events`, `ai_rate_limit_configs`, `ai_usage_events` + as 6 novas acima). Os 11 arquivos `*_remote_history_placeholder.sql` indicam que **o schema central existe apenas no projeto remoto** — a cadeia local **não recria o banco do zero** (RISK-014).
- Tipos gerados: `src/integrations/supabase/types.ts` (65 tabelas, 34 funções RPC; nenhuma view) — **desatualizados**: não incluem as 6 tabelas novas nem a remoção do trigger de admin.

### 6.2 Modelo de tenants (organizações)

- `tenants` (organização; `plan`, `subscription_status`, ids Stripe protegidos por revogações de coluna) ← `profiles.tenant_id` (1:1 com `auth.users`) e `tenant_memberships` (papéis `owner|admin|engineer|operator|viewer`).
- Modelos de papel **duplos**: políticas misturam `get_user_role()` (baseado em `profiles`) e `tenant_memberships.role` — a consistência entre as duas fontes **não é verificável** pelo código do repositório (as funções `get_user_role`/`get_user_tenant_id` não estão no repo).
- `projects.tenant_id` é o pivô: `diagrams`, `simulations`, `simulation_tags`, `alarm_configs`, `alarm_history`, `function_block_instances`, `trend_configs`, `tag_samples`, `project_versions`, `calculations`, `project_bom_items`, `project_folders` autorizam via projeto + tenant (algumas também aceitam `created_by = auth.uid()`).
- Camada de plataforma: `platform_admins` + `is_platform_admin()` controla blog, feature flags, catálogo, configs de rate limit, override de planos.

### 6.3 Persistência dos módulos

- **Editores (unifilar/multifilar/Ladder/FBD/PLC/layout SCADA/tags/snapshot de simulação):** um snapshot JSONB (versão de esquema 2) em `diagrams.canvas_data`, linha do projeto em `projects`, histórico em `project_versions` (restore explícito).
- **BOM:** `project_bom_items` (+ RPC `generate_bom_from_canvas`).
- **Alarmes:** `alarm_configs`, `alarm_history` (RPC `batch_insert_alarm_history`).
- **Telemetria/trends:** `tag_samples` com partições mensais (`tag_samples_2026_04`, `_05`; RPCs `batch_insert_tag_samples`, `create_monthly_tag_samples_partition`).
- **IoT:** `iot_devices`, `iot_readings` (escritas de cliente bloqueadas por policies RESTRICTIVE), `iot_alerts`, `iot_command_log`, `api_keys`.
- **Gêmeo digital:** `twin_hotspots` (**sem evidência de RLS no repo — RISK-001**), `projects.twin_model_path`, bucket `twin-models`.
- **IA:** `ai_conversations`, `ai_messages`, `ai_credit_costs`, `ai_usage_events`, `ai_status_events`, `ai_rate_limit_configs`, `normative_documents`/`normative_chunks` (base normativa compartilhada, SELECT para autenticados).
- **Billing:** `tenants`, `subscriptions`, `invoices`, `billing_events`, `stripe_webhook_events` (deny-all a clientes), `mp_webhook_processed` (deny-all), `usage_records`, `subscription_audit_log`, `plan_limits`.
- **Gestão:** `profiles`, `tenant_memberships`, `invites` (token oculto a clientes), `tenant_settings`, `notifications`, `clients`, `audit_logs` (leitura só para admin do tenant; escrita via service role), `catalog_*`, `files`/`file_versions`, `comments`.
- **Somente no banco, sem consumidor no frontend (reservadas):** `function_block_instances`, `user_function_block_templates`, `simulations`, `simulation_tags`, `plant_telemetry`, `electrical_components`, `calculations`, `system_templates`, `knowledge_*`, `blog_*`, `feature_flags`, `trend_configs`, `voltai_*`.

### 6.4 Functions, triggers e grants

- **SECURITY DEFINER definidas localmente (19 + wrappers `*_for_user` somente service_role):** `is_platform_admin`, `check_ai_quota`, `consume_ai_credits`, `get_ai_credits_remaining`, `accept_invite`, `change_tenant_plan` (apenas platform admin), `tenant_has_feature`, `generate_bom_from_canvas`, `ingest_iot_reading` (autentica por hash de API key), `iot_acknowledge_alert`, `iot_enqueue_command`, `increment_ai_tokens`, `prevent_profile_privilege_escalation` (trigger), entre outras.
- **Funções executáveis por `authenticated` cujas definições NÃO estão no repo:** `increment_usage`, `bootstrap_personal_tenant_if_missing`, `get_user_role`, `get_user_tenant_id`, `batch_insert_alarm_history`, `batch_insert_tag_samples`, `batch_update_simulation_tags`, `search_normative_chunks`, `search_catalog_components` — autorização interna **não auditável** aqui (RISK-015).
- **Triggers:** anti-escalation em `profiles` (3 variantes quase duplicadas; uma delas é ignorada quando a role setting é `service_role`), `sync_known_platform_admin_email` em `auth.users` (**e-mail hardcoded — RISK-002**), `updated_at` em várias tabelas.
- **Histórico de grants oscilante:** hardening (2026-05-18) → reversão parcial (2026-06-01) → re-revogação parcial (2026-09-12). Estado final: `change_tenant_plan` e `increment_ai_tokens` só service_role; demais funcs acima seguem executáveis por clientes (RISK-017 relacionado a superfície dormente).
- **Proteções de coluna:** `tenants.stripe_customer_id`/`stripe_subscription_id` e `invites.token` com SELECT revogado de clientes.

### 6.5 Storage e Realtime

- Buckets com policies no repo: `client-logos` (hoje privado, path por tenant, papéis engineer+) e `twin-models` (qualquer papel do tenant — RISK-016). Buckets públicos por design conforme doc interna: `avatars`, `catalog-images`, `catalog-datasheets`.
- Realtime: publicação de `iot_readings`/`iot_alerts`/`iot_command_log`/`runtime_logs`; policies de `realtime.messages` restritas a tópicos `user:<uid>:%` ou `tenant:<tenant_id>:%`.

---

## 7. Padrões de código e layout

### Padrões existentes

- **Server functions** em `src/lib/*.functions.ts` com middleware encadeado: `requireSupabaseAuth` → (`requireAiQuota` → `requireBurstLimit`) ou `requireTenantAdmin`. O token do usuário é anexado automaticamente a toda server function pelo middleware global `attachSupabaseAuth` (`src/start.ts`).
- **Dois clientes Supabase:** browser (anon key, escopo RLS do usuário) e servidor (`client.server.ts`, service role, protegido por convenção `.server.ts` com proxy que lança no browser).
- **Zod em todas as fronteiras:** `validateSearch` das rotas, schemas das server functions, `DiagramDocSchema`/`SnapshotSchema`, validação da saída de IA (`AiDiagramPatchSchema.safeParse`).
- **Estado:** Zustand + Immer para stores locais (diagrama com padrão de comandos reversíveis e undo/redo); TanStack Query para dados do servidor; zustand `persist` para preferências.
- **Erros:** códigos de erro padronizados nas Edge/API (ex.: `AUTH_REQUIRED`, `QUOTA_EXCEEDED`), SSR com página 500 marcada (`src/server.ts`), contadores de erro 500/503 em `/settings/diagnostics`.
- **Design system:** shadcn/ui + Radix + Tailwind v4, tema claro/escuro, tokens em CSS, componentes em `src/components/ui`.
- **Testes:** Vitest (31 arquivos / 260 testes) cobrindo domínio puro (Ladder/FBD/cálculos/multifilar/SSRF/sandbox/redirect/rate limit IoT/twin/planta/elétrica de potência/ponte Unifilar→Ladder).
- **Segurança:** autorização no servidor + RLS; assinatura de webhooks com comparação constant-time; SSRF guard em Modbus (RFC1918 + defesa contra DNS rebinding); sandbox de scripts SCADA em Web Worker; tokens de API armazenados como hash.

### Padrões a não quebrar (recomendações para mudanças futuras)

- Não introduzir `any` (o projeto é `strict`); validar dados externos com Zod em runtime; manter toda escrita atrás de server functions autenticadas; não mover segredos para o bundle do cliente; preservar o padrão de comandos reversíveis do diagrama; atualizar `docs/sdd` e este arquivo quando houver mudança autorizada.

---

## 8. Pontos frágeis e arquivos sensíveis

| Arquivo/região                                                                                                       | Por que é sensível                                                                                                    | Validação antes de alterar                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/*` e `baseline_rls_consolidation.sql`                                                           | Fonte do modelo de segurança (RLS/grants/triggers); o dump de baseline é a referência do banco vivo                   | Nunca editar migrations já aplicadas; criar nova migration apenas sob demanda explícita; conferir grants/RLS resultantes |
| `20260518170000_grant_platform_admin_to_known_email.sql`                                                             | Trigger permanente de admin de plataforma (RISK-002)                                                                  | Substituir por gestão via `platform_admins` sem trigger hardcoded, com plano de rollback                                 |
| `src/integrations/supabase/client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `tenant-admin-middleware.ts` | Base de toda autorização de servidor; o `auth-attacher` é efeito global — removê-lo derruba todas as server functions | Testar fluxos autenticados e anônimos; conferir fallback legacy de JWT                                                   |
| `src/lib/security/rate-limiter.server.ts`                                                                            | Rate limiting fail-open (RISK-007); mudanças afetam IA/IoT/auth                                                       | Validar comportamento com e sem Upstash                                                                                  |
| `src/lib/projects.functions.ts` + `use-project-persistence.ts` + `lib/diagram/schema.ts`                             | Salvamento/versionamento do snapshot unificado — quebra afeta todos os editores                                       | Preservar compatibilidade do `SnapshotSchema` (versionamento) e testes de snapshot                                       |
| `src/lib/ladder/scan-core.ts`, `src/lib/fbd/engine/*`                                                                | Motores de simulação determinísticos usados por testes e verificação de segurança (E-STOP)                            | Rodar a suíte completa; não quebrar pureza/determinismo                                                                  |
| `src/lib/simulation/scada-worker.ts` + `script-sandbox.ts`                                                           | Sandbox de execução de scripts de usuário                                                                             | Não remover guards; revisar testes `scada-sandbox-guards`                                                                |
| `src/lib/modbus-server.functions.ts`, `opcua-server.functions.ts`                                                    | Ponte para rede industrial (SSRF guard; escrita em sessão)                                                            | Manter `isHostAllowed`/`resolveToAllowedIPv4`; qualquer protocolo real exige projeto de autorização explícito            |
| Rotas `api/public/*.ts` (webhooks, IoT)                                                                              | Entradas públicas autenticadas por segredo/chave                                                                      | Manter verificação de assinatura, idempotência e rate limit                                                              |
| `src/lib/billing.functions.ts` + webhooks                                                                            | Estado de assinatura/planos e receita                                                                                 | Não confiar em metadata do cliente; testar eventos repetidos                                                             |
| `src/lib/ai-*.functions.ts`, `diagram/ai.functions.ts`, Edge Function de IA                                          | Custo, prompt injection e integridade do projeto                                                                      | Manter sanitização, limites e validação Zod da saída                                                                     |
| `src/routes/__root.tsx` (AuthGate)                                                                                   | Gate central de rotas                                                                                                 | Manter allowlist restrita; verificar novas rotas públicas                                                                |
| `vercel.json` (CSP/headers)                                                                                          | Defesa de navegador                                                                                                   | Testar app após mudanças de CSP (Monaco/Workers/blob)                                                                    |
| `src/integrations/supabase/types.ts`                                                                                 | Tipos gerados do banco — divergência causa `untyped()` (ex.: `twin_hotspots`)                                         | Regenerar após migrations; não editar à mão                                                                              |
| `src/routeTree.gen.ts`                                                                                               | Gerado pelo plugin — não editar manualmente                                                                           | Deixar o dev server/regen atualizar                                                                                      |

---

## 9. Regras obrigatórias para agentes de programação

1. Ler a documentação (`AGENTS.md`, `README.md`, `docs/sdd/`) antes de modificar o projeto.
2. Inspecionar o fluxo existente (rotas → stores → server functions → RLS) antes de alterar funcionalidades.
3. Não substituir estruturas funcionais sem justificativa técnica.
4. Não criar mocks para substituir funcionalidades de produção.
5. Não inventar tabelas, rotas, endpoints ou funções — o que não existe no repo não existe no sistema.
6. Não utilizar `any` em TypeScript sem justificativa excepcional documentada.
7. Nunca colocar segredos no frontend nem em `import.meta.env` de valores sensíveis.
8. Aplicar autorização no servidor (server functions com middleware) e no banco (RLS).
9. Respeitar RLS e o isolamento entre organizações (tenant) — nunca confiar em filtros só de UI.
10. Validar dados externos em runtime (Zod) — inclusive saídas de IA.
11. Não remover funcionalidades existentes sem autorização.
12. Criar migrations apenas quando explicitamente solicitado; nunca editar migration já aplicada.
13. Executar `bun run lint`, `bun run test` e `bun run build` após alterações autorizadas (não há script de typecheck — rodar `npx tsc --noEmit` se disponível).
14. Não declarar testes aprovados sem executá-los.
15. Não declarar funcionalidades prontas sem evidência de implementação.
16. Preservar acessibilidade e responsividade existentes.
17. Atualizar a documentação (`AGENTS.md`, `docs/sdd/`) quando alterações forem autorizadas.
18. Não expor segredos em logs, relatórios ou commits (não imprimir valores de `.env`).
19. Revisar impactos em autenticação, banco, permissões e integrações antes de mudanças.
20. Priorizar segurança, integridade dos dados e compatibilidade com a arquitetura existente.
21. Nenhum recurso (inclusive IA) pode executar ações em equipamentos reais sem arquitetura explícita de autorização e confirmação; simulação não atesta aptidão para operação industrial.

---

## 10. Auditoria de segurança e riscos identificados

Auditoria estática somente de leitura realizada sobre código, migrations e configurações. **Nenhum teste de intrusão, exploração ou alteração foi executado.** Ausência de achado nesta inspeção não significa ausência de vulnerabilidade. Valores de segredos não foram reproduzidos.

### 10.1 Matriz consolidada

| ID       | Severidade | Status         | Categoria            | Ativo afetado                           | Prioridade | Validação necessária                                                                                                    |
| -------- | ---------- | -------------- | -------------------- | --------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| RISK-001 | P1         | Mitigado       | RLS                  | Tabela `twin_hotspots`                  | Imediata   | Aplicar migration 20261012090000 e testar acesso cruzado entre tenants                                                  |
| RISK-002 | P1         | Mitigado       | Autorização          | `platform_admins` / `auth.users`        | Imediata   | Aplicar migration 20261012090001; auditar `platform_admins` e confirmar que o grant não é recriado                      |
| RISK-003 | P1         | Mitigado       | RLS                  | `tenant_memberships`                    | Imediata   | Aplicar migration 20261012090002; teste autorizado: admin não-owner não grava `role='owner'`                            |
| RISK-004 | P1         | Confirmado     | Autenticação         | Sessão de usuários + CSP                | Alta       | CSP endurecida em `vercel.json` (feito); migração para cookie httpOnly pendente como workstream dedicado                |
| RISK-005 | P2         | Confirmado     | RLS                  | `invoices`, `subscriptions`             | Alta       | Teste: membro não-admin não lê linhas de billing                                                                        |
| RISK-006 | P2         | Confirmado     | Autenticação         | Login/cadastro/reset                    | Alta       | Aplicar limiter `auth` e testar 429 após exceder janela                                                                 |
| RISK-007 | P2         | Mitigado       | API                  | Rate limiting global                    | Alta       | Fail-closed para AI/IoT + fallback local p/ API/Auth + alerting automático (logs estruturados)                          |
| RISK-008 | P2         | Confirmado     | Segredos             | Bundle do cliente (`env.ts`)            | Normal     | Remover fallbacks; build sem vars continua correto                                                                      |
| RISK-009 | P2         | Confirmado     | API                  | Edge Function `ai-industrial-architect` | Normal     | Confirmar se está em uso em produção; alinhar limites ou remover                                                        |
| RISK-010 | P2         | Mitigado       | IA                   | `streamChat` (DeepSeek)                 | Normal     | Sanitização aplicada no histórico via `sanitizePromptText` (máx 2000 chars/msg)                                         |
| RISK-011 | P2         | Suspeito       | Frontend             | Sandbox de scripts SCADA                | Normal     | Tentar contornar o pre-scan regex em ambiente de teste isolado                                                          |
| RISK-012 | P2         | Confirmado     | Frontend             | `/catalog` (`datasheet_url`)            | Normal     | Validar esquema http(s) ao renderizar/importar; teste com `javascript:`                                                 |
| RISK-013 | P2         | Confirmado     | Pagamentos           | Webhooks Stripe (duplicados)            | Alta       | Consolidar em uma implementação; teste de evento repetido                                                               |
| RISK-014 | P2         | Confirmado     | Banco de dados       | Cadeia de migrations                    | Normal     | Replay limpo em ambiente efêmero; reconciliar drift                                                                     |
| RISK-015 | P2         | Não verificado | Banco de dados       | RPCs `SECURITY DEFINER`                 | Alta       | Auditar corpos no banco (`pg_proc`) e restringir grants                                                                 |
| RISK-016 | P2         | Confirmado     | RLS                  | Bucket `twin-models`                    | Normal     | Teste: papel `viewer` não consegue gravar/apagar                                                                        |
| RISK-017 | P2         | Confirmado     | Autenticação         | MFA/sessões                             | Normal     | Habilitar MFA (Supabase) e testar fluxo                                                                                 |
| RISK-018 | P2         | Não verificado | Backup               | Continuidade (Supabase/Vercel)          | Alta       | Confirmar plano/retention e executar restore de teste                                                                   |
| RISK-019 | P2         | Não verificado | API                  | Servidor MCP                            | Normal     | Testar chamada MCP sem consentimento/token válido                                                                       |
| RISK-020 | P3         | Confirmado     | Frontend             | `svg-sanitizer.ts`, `chart.tsx`         | Baixa      | Sanitizar ou remover código morto; teste com HTML hostil                                                                |
| RISK-021 | P3         | Confirmado     | Upload               | Uploads GLB/CSV                         | Baixa      | Adicionar magic bytes + rate limit; teste de arquivo renomeado                                                          |
| RISK-022 | P3         | Confirmado     | Frontend             | Proteção de rotas                       | Baixa      | Adicionar `beforeLoad` e testar rota privada sem sessão                                                                 |
| RISK-023 | P3         | Confirmado     | Frontend             | Consent OAuth MCP                       | Baixa      | Aplicar `isSafeRedirect`; teste com URL externa                                                                         |
| RISK-024 | P3         | Confirmado     | Autenticação         | Política de senha                       | Baixa      | Unificar mínimo (8) nos dois fluxos e testar                                                                            |
| RISK-025 | P3         | Confirmado     | Infraestrutura       | CI/CD, scripts, `.env.example`          | Normal     | Restaurar workflow versionado e script typecheck; conferir nomes de env                                                 |
| RISK-026 | P3         | Não verificado | Autenticação         | Supabase Auth (e-mail/OAuth)            | Normal     | Conferir dashboard: exigência de confirmação e URIs de redirect                                                         |
| RISK-027 | P3         | Mitigado       | Outro                | Landing (termos/privacidade)            | Normal     | Publicadas em `/privacidade` e `/termos`; pendente revisão jurídica + aceite versionado                                 |
| RISK-028 | P3         | Confirmado     | Outro                | Dashboard/analytics/billing/team        | Baixa      | Isolar modo demo; sinalizar dados sintéticos na UI                                                                      |
| RISK-029 | P3         | Confirmado     | Frontend             | localStorage                            | Baixa      | Reduzir espelhos operacionais; validar URLs/keys coladas                                                                |
| RISK-030 | P3         | Confirmado     | API                  | CORS dos endpoints públicos             | Baixa      | Restringir origem quando viável; teste de preflight                                                                     |
| RISK-031 | P3         | Confirmado     | RLS                  | `tenant_memberships` (SELECT)           | Baixa      | Restringir colunas/visibilidade; teste com membro comum                                                                 |
| RISK-032 | P3         | Confirmado     | Auditoria            | Observabilidade                         | Normal     | Integrar error tracking e alertas de custo de IA                                                                        |
| RISK-033 | P3         | Confirmado     | Upload               | Antivírus/quarentena                    | Baixa      | Avaliar scanning na ingestão quando houver upload de documentos                                                         |
| RISK-034 | P3         | Mitigado       | Outro                | Código morto/legado                     | Baixa      | `bun run lint && bun run test && bun run build` após remoções (lint+test+typecheck executados e verdes)                 |
| RISK-035 | P2         | Mitigado       | Exclusão/LGPD        | `ai_messages` órfãs no delete           | Alta       | Migration 20261012110000 (policy DELETE) + erro checado; 9 testes em `deletion.test.ts`                                 |
| RISK-036 | P2         | Mitigado       | Exclusão/Integridade | `deleteProject` parcial + órfãs         | Alta       | Gate owner/admin pré-mutação + 11 tabelas filhas + erro por etapa; testes com Supabase mocado                           |
| RISK-037 | P2         | Mitigado       | Exclusão/LGPD        | Sem fluxo de eliminação de conta        | Alta       | `requestAccountDeletion` + `eraseUserData` (platform admin) + tabela `deletion_requests`; Storage/tag_samples pendentes |

### 10.2 Registros individuais

## RISK-001 — Tabela `twin_hotspots` sem evidência de RLS no repositório

- **Severidade:** P1
- **Status:** Mitigado (aplicada em `rvaaxvdimggztjxoktvy` em 2026-10-14; tabela criada com RLS ligado, verificado via `pg_class`. Policies por projeto puladas — `projects`/`tenant_memberships` não existem nesse banco; serão criadas quando o DDL central for restaurado. RLS sem policy = deny por padrão.)
- **Categoria:** RLS
- **Ativo afetado:** Dados de hotspots do digital twin por projeto (posições, mapeamentos de tag, limiares)
- **Localização:** `src/lib/digital-twin.functions.ts:191,252,253,272` (consultas do cliente); mitigação em `supabase/migrations/20261012090000_fix_risk001_twin_hotspots_rls.sql`
- **Evidência:** A tabela era consultada/gravada pelo código sem RLS comprovada no repo; migration idempotente criada (`CREATE TABLE IF NOT EXISTS` + `ENABLE ROW LEVEL SECURITY` + 4 policies + grants + trigger de `updated_at`)
- **Cenário de risco:** Se RLS não estiver habilitado no banco vivo, qualquer usuário autenticado poderia ler/alterar/excluir hotspots de projetos de outras organizações (IDOR)
- **Impacto potencial:** Vazamento e adulteração de dados de projetos industriais de outros clientes
- **Probabilidade:** Não determinada
- **Abrangência:** Todos os tenants que usam digital twin
- **Controles existentes:** As escritas passam por server functions com `requireSupabaseAuth` (reduz, mas não elimina, o risco — o acesso direto via PostgREST/anon client escaparia)
- **Controles ausentes ou insuficientes:** Comprovação de RLS/policies da tabela; presença nos tipos gerados
- **Recomendação:** Conferir no banco vivo `relrowsecurity` e `pg_policies` de `twin_hotspots`; se ausente, habilitar RLS com policies por tenant/projeto e regenerar tipos
- **Prioridade de tratamento:** Imediata
- **Dependências:** `digital-twin.functions.ts`, projeto Supabase
- **Risco da correção:** Médio (migrations de RLS podem quebrar escritas legítimas se mal escritas)
- **Validação necessária:** Com usuário A, tentar SELECT/INSERT/UPDATE/DELETE em hotspot de projeto do usuário B e receber erro/linha vazia
- **Referências:** `src/lib/digital-twin.functions.ts`; comentário em `digital-twin.functions.ts:146-150`; ausência em `types.ts` e nas migrations

## RISK-002 — E-mail pessoal hardcoded concede platform admin automaticamente via trigger

- **Severidade:** P1
- **Status:** Mitigado (aplicada em `rvaaxvdimggztjxoktvy` em 2026-10-14; verificado: trigger ausente em `pg_trigger` e `platform_admins` vazio — 0 linhas. Grant permanente eliminado nesse banco.)
- **Categoria:** Autorização
- **Ativo afetado:** `platform_admins` (privilégio máximo da plataforma)
- **Localização:** `supabase/migrations/20260518170000_grant_platform_admin_to_known_email.sql:10,30` e trigger `sync_known_platform_admin_email_on_auth_users` (:43-46); mitigação em `supabase/migrations/20261012090001_fix_risk002_remove_hardcoded_admin_trigger.sql` (remove trigger + função, preserva admins existentes)
- **Evidência:** Migration cria função `SECURITY DEFINER` que força `platform_admins.role='admin'` para um e-mail pessoal fixo (endereço pessoal commitado — PII) e instala trigger `AFTER INSERT OR UPDATE OF email ON auth.users` que re-aplica o grant permanentemente
- **Cenário de risco:** Comprometimento da caixa de e-mail equivale a comprometimento administrativo permanente; o grant é refeito mesmo se removido manualmente; e-mail pessoal no repo é vetor de phishing/engenharia social
- **Impacto potencial:** Controle total da camada de plataforma (planos, catálogo, feature flags, blog, rate limits)
- **Probabilidade:** Média
- **Abrangência:** Plataforma inteira
- **Controles existentes:** Nenhum — o mecanismo é o próprio trigger
- **Controles ausentes ou insuficientes:** Gestão de admin via procedimento auditável, sem identidade hardcoded
- **Recomendação:** Remover o trigger e a função em nova migration; migrar admins para cadastro via `platform_admins` com procedimento auditado; rotacionar/revogar sessões da conta afetada; remover PII do repo (git filter-repo quando autorizado)
- **Prioridade de tratamento:** Imediata
- **Dependências:** `platform_admins`, `auth.users`, funções `is_platform_admin`
- **Risco da correção:** Médio (pode derrubar acesso administrativo legítimo — planejar acesso alternativo antes)
- **Validação necessária:** Após remoção, insert/update de e-mail não-grantado não cria linha em `platform_admins`; admins existentes mantêm acesso pela via oficial
- **Referências:** `supabase/migrations/20260518170000_grant_platform_admin_to_known_email.sql`

## RISK-003 — `tenant_memberships`: admin pode elevar papel para `owner` (escalação via policy)

- **Severidade:** P1
- **Status:** Mitigado (migration aplicada em `rvaaxvdimggztjxoktvy` em 2026-10-14, mas corpo pulado — tabela não existe nesse banco. Sem tabela não há superfície; policies granulares serão criadas quando o DDL central for restaurado.)
- **Categoria:** RLS
- **Ativo afetado:** `tenant_memberships` (papéis e composição de equipes)
- **Localização:** policy "Admins can manage memberships" (`FOR ALL`) em `supabase/migrations/20260906072900_baseline_rls_consolidation.sql:787-789`; mitigação em `supabase/migrations/20261012090002_fix_risk003_membership_role_escalation.sql` (policies granulares; `role='owner'` só gravável por owner)
- **Evidência:** `USING`/`WITH CHECK` garantem apenas `tenant_id = get_user_tenant_id() AND get_user_role() = 'admin'` — não restringem `NEW.role`, `NEW.user_id` nem `NEW.tenant_id`
- **Cenário de risco:** Um admin grava via PostgREST `role='owner'` para si mesmo (ou adiciona usuários arbitrários), obtendo privilégio máximo do tenant (ex.: exclusão de membros, mudanças de tenant)
- **Impacto potencial:** Escalação de privilégios dentro do tenant; possível sequestro administrativo
- **Probabilidade:** Alta
- **Abrangência:** Todos os tenants com múltiplos membros
- **Controles existentes:** Verificação de papel do chamador; anti-escalation em `profiles` (trigger) — mas esse protege `profiles`, não `tenant_memberships`
- **Controles ausentes ou insuficientes:** Restrição de `NEW.role` (ex.: impedir criação de `owner` por não-owner) e de `NEW.user_id`
- **Recomendação:** Trocar a policy por variantes `FOR INSERT`/`FOR UPDATE` com `WITH CHECK` limitando `role` a papéis administráveis e `user_id`/`tenant_id` consistentes; restringir `owner` a transferência explícita
- **Prioridade de tratamento:** Imediata
- **Dependências:** policies de `projects`, `files`, `tenant_settings` que dependem de papéis
- **Risco da correção:** Alto (pode quebrar fluxos de convite/roles — testar todos os perfis)
- **Validação necessária:** Com admin (não-owner), tentar `UPDATE tenant_memberships SET role='owner'` e receber erro de policy
- **Referências:** `baseline_rls_consolidation.sql:787-792`

## RISK-004 — Tokens de sessão em `localStorage` com CSP que permite `unsafe-inline`/`unsafe-eval`

- **Severidade:** P1
- **Status:** Confirmado (mitigação parcial aplicada; cookie httpOnly pendente)
- **Categoria:** Autenticação
- **Ativo afetado:** Sessão de todos os usuários (access/refresh token)
- **Localização:** `src/integrations/supabase/client.ts:19`, `src/integrations/supabase/previewAuthStorage.ts:18,74-89`, `vercel.json:11`
- **Evidência:** Em hosts normais o storage de sessão é `localStorage`. Mitigação parcial aplicada em 2026-10-12: CSP endurecida em `vercel.json` (`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`). A migração completa para cookie httpOnly **não** foi executada — exige re arquitetura do fluxo de auth (SSR + middleware + rotas de login) com testes executados; registrada como workstream dedicado
- **Cenário de risco:** Qualquer XSS (ex.: via RISK-012 ou dependência comprometida) lê o token do `localStorage` e sequestra a sessão
- **Impacto potencial:** Acesso completo à conta e aos dados do tenant do usuário
- **Probabilidade:** Média (requer um vetor XSS)
- **Abrangência:** Todos os usuários autenticados
- **Controles existentes:** CSP com `frame-ancestors 'none'`, `X-Frame-Options DENY`, `nosniff`; DOMPurify disponível (não usado)
- **Controles ausentes ou insuficientes:** Sessão em cookie httpOnly (Supabase SSR), CSP sem `unsafe-eval`
- **Recomendação:** Migrar a sessão para cookies httpOnly com detecção no servidor, ou endurecer CSP removendo `unsafe-eval` via configuração dos workers (Monaco); manter plano de remoção de sinks de HTML
- **Prioridade de tratamento:** Alta
- **Dependências:** `previewAuthStorage`, telas de preview Lovable, Monaco, Web Workers
- **Risco da correção:** Alto (quebra preview/SSR se mal implementado — exige testes em todos os fluxos de auth)
- **Validação necessária:** Após mudança, XSS sintético não consegue ler token; login/logout/OAuth/refresh funcionam
- **Referências:** `client.ts:17-23`, `previewAuthStorage.ts`, `vercel.json:5-34`

## RISK-005 — Policies de `invoices`/`subscriptions` permitem leitura a qualquer membro do tenant

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** RLS
- **Ativo afetado:** Dados de faturamento/assinatura do tenant
- **Localização:** `baseline_rls_consolidation.sql:448-449` (invoices), `:730-731` (subscriptions)
- **Evidência:** Policies nomeadas "Admins can view…" mas com predicado apenas `tenant_id = get_user_tenant_id()` e `TO public` — sem checagem de papel
- **Cenário de risco:** Qualquer membro (inclusive `viewer`) lê valores, status e datas de faturamento via PostgREST
- **Impacto potencial:** Exposição de informações comerciais dentro do tenant
- **Probabilidade:** Alta
- **Abrangência:** Todos os tenants
- **Controles existentes:** Proteção de coluna sobre `stripe_customer_id`/`stripe_subscription_id` (SELECT revogado de clientes)
- **Controles ausentes ou insuficientes:** Filtro de papel nas policies
- **Recomendação:** Adicionar predicado de papel (owner/admin) nas policies de SELECT; revisar se o app precisa desses dados para membros não-admin
- **Prioridade de tratamento:** Alta
- **Dependências:** `billing.functions.ts`, `/settings/billing`
- **Risco da correção:** Baixo
- **Validação necessária:** Membro não-admin recebe 0 linhas em `select * from invoices`
- **Referências:** `baseline_rls_consolidation.sql:448-451,730-733`; `migrations/20260531133205…`

## RISK-006 — Sem rate limiting de aplicação em login, cadastro e recuperação de senha

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** Autenticação
- **Ativo afetado:** Fluxos de autenticação (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
- **Localização:** `src/lib/security/rate-limiter.server.ts:32` (bucket `auth` definido, sem chamadores); `src/routes/login.tsx:58`, `signup.tsx:32`, `forgot-password.tsx:22`, `reset-password.tsx:33` (chamam Supabase Auth direto do navegador)
- **Evidência:** Busca por `checkRateLimit("auth")` não retorna nenhum ponto de uso; as telas de auth não passam por server functions
- **Cenário de risco:** Força bruta / enumeração / abuso de envio de e-mails de reset limitam-se às proteções de plataforma do Supabase (não verificadas aqui)
- **Impacto potencial:** Contas comprometidas por força bruta; custo/spam de e-mails
- **Probabilidade:** Média
- **Abrangência:** Todos os usuários
- **Controles existentes:** Possíveis limites nativos do Supabase Auth (não verificados)
- **Controles ausentes ou insuficientes:** Rate limit por IP/conta na camada da aplicação
- **Recomendação:** Intermediar login/reset por server functions com o bucket `auth` (5/15 min) ou aplicar WAF/limites no edge
- **Prioridade de tratamento:** Alta
- **Dependências:** Fluxos de auth, `rate-limiter.server.ts`
- **Risco da correção:** Médio (pode afetar UX legítima e testes)
- **Validação necessária:** 6 tentativas em 15 min retornam 429
- **Referências:** `rate-limiter.server.ts:30-33`; rotas de auth

## RISK-007 — Rate limiter fail-open quando Upstash está ausente ou com erro

- **Severidade:** P2
- **Status:** Mitigado (2026-10-12)
- **Categoria:** API
- **Ativo afetado:** Limites de IA, API, auth e IoT
- **Localização:** `src/lib/security/rate-limiter.server.ts` (refatorado); `src/integrations/supabase/ai-rate-limit-middleware.ts` (atualizado); `src/routes/api/public/iot.ingest.ts` (atualizado)
- **Evidência:** Implementado policy por limiter:
  - **Críticos (fail-closed)**: AI, IoT → negam requisição (HTTP 503) quando Upstash indisponível
  - **Não-críticos (fail-open com fallback local)**: API, Auth → bucket em memória por instância + alerting
  - **Alerting**: Log estruturado JSON (`level: "WARN"`, `event: "bypass_alert"`) a cada 30s de bypass contínuo; log de recuperação (`event: "bypass_recovered"`); função `getBypassStatus()` para diagnóstico
  - **Opt-in para AI fallback local**: `AI_RATE_LIMIT_LOCAL_FALLBACK=true` habilita bucket local no middleware de IA
- **Cenário de risco:** Desconfiguração ou indisponibilidade do Upstash silencia todos os limites (custo de IA, abuso de API, IoT)
- **Impacto potencial:** Custo descontrolado de IA, abuso de endpoints, exaustão de recursos
- **Probabilidade:** Média
- **Abrangência:** Todos os limites dependente do Upstash
- **Controles existentes:** Circuit breaker, quota mensal de créditos de IA (banco) que continua valendo, fallback local para API/Auth
- **Controles adicionados:** Fail-closed para AI/IoT; alerting automático de bypass prolongado; métrica de duração de bypass
- **Recomendação:** Implementada em 2026-10-12. Configurar `AI_RATE_LIMIT_LOCAL_FALLBACK=true` apenas se necessário para alta disponibilidade de IA. Monitorar logs por `bypass_alert`.
- **Prioridade de tratamento:** Alta
- **Dependências:** `.env` de produção (UPSTASH_REDIS_REST_URL/TOKEN), `diagnostics.functions.ts` (expõe status do Upstash + breaker + bypass status)
- **Risco da correção:** Médio (fail-closed pode derrubar IA/IoT se Upstash cair — mitigar com health check + alerta)
- **Validação necessária:** Sem Upstash, chamada de IA/IoT retorna 503 (fail-closed); API/Auth usam fallback local; logs mostram `bypass_alert` após 1min e `bypass_recovered` na volta
- **Referências:** `rate-limiter.server.ts`; `ai-rate-limit-middleware.ts`; `iot.ingest.ts`; `diagnostics.functions.ts:12`

## RISK-008 — Fallbacks hardcoded de URL e anon key do Supabase no código do cliente

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** Segredos
- **Ativo afetado:** Configuração do cliente Supabase embarcada no bundle
- **Localização:** `src/integrations/supabase/env.ts:7-9` (fallbacks `SUPABASE_URL_FALLBACK` e `SUPABASE_PUBLISHABLE_KEY_FALLBACK`)
- **Evidência:** Constantes com URL do projeto e anon key (JWT) escritas no fonte, usadas quando as env vars não existem
- **Cenário de risco:** A anon key é pública por design (RLS protege dados), mas o fallback fixa o projeto no bundle, impede rotação via env e mascara erros de configuração apontando silenciosamente para o projeto de produção
- **Impacto potencial:** Degradação de configuração; dependência de RLS para conter exposição
- **Probabilidade:** Baixa
- **Abrangência:** Build de produção e ambientes mal configurados
- **Controles existentes:** RLS como defesa real; chaves secretas (service role/DeepSeek) permanecem só no servidor
- **Controles ausentes ou insuficientes:** Falha explícita quando env vars públicas faltam
- **Recomendação:** Remover os fallbacks, lançando erro de configuração em build sem env vars; avaliar rotação da anon key se o projeto for público
- **Prioridade de tratamento:** Normal
- **Dependências:** `env.ts`, `client.ts`, deploy Lovable/Vercel
- **Risco da correção:** Baixo
- **Validação necessária:** Build sem env vars falha com mensagem clara; build com env vars funciona
- **Referências:** `src/integrations/supabase/env.ts:7-9,24-34`

## RISK-009 — Edge Function de IA órfã, com limites mais fracos que o caminho real

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** API
- **Ativo afetado:** Endpoint de IA `ai-industrial-architect`
- **Localização:** `supabase/functions/ai-industrial-architect/index.ts` (399 linhas); `supabase/config.toml:3-4`
- **Evidência:** Nenhuma invocação no frontend (`supabase.functions.invoke` não existe em `src`); a função não aplica burst limit Upstash, não define `max_tokens` na geração, usa CORS `*` e retorna HTTP 200 para a maioria dos erros; o frontend usa a camada de server functions paralela
- **Cenário de risco:** Se o endpoint estiver exposto em produção, é um caminho de IA com custo/ilimitação distintos do caminho auditado; a duplicação de lógica gera divergência de segurança
- **Impacto potencial:** Consumo de IA sem os limites do caminho principal; manutenção divergente
- **Probabilidade:** Baixa (se realmente órfã) / Média (se exposta)
- **Abrangência:** Custo da plataforma
- **Controles existentes:** `verify_jwt = true`, validação de Bearer, quota mensal via RPC, sanitização de contexto, caps de tamanho
- **Controles ausentes ou insuficientes:** Burst limit, `max_tokens`, alinhamento com o caminho do servidor
- **Recomendação:** Confirmar uso; se órfã, remover do deploy ou documentar como alternativa; caso mantida, aplicar os mesmos limites (Upstash + `max_tokens`)
- **Prioridade de tratamento:** Normal
- **Dependências:** CI de deploy de Edge Functions, `DEEPSEEK_API_KEY`
- **Risco da correção:** Baixo
- **Validação necessária:** Invocação sem JWT retorna 401; chamada autenticada respeita burst limit idêntico ao do servidor
- **Referências:** `supabase/functions/ai-industrial-architect/index.ts:214-222,286-333`; grep sem chamadores em `src`

## RISK-010 — `streamChat` envia histórico de mensagens sem sanitização de prompt injection

- **Severidade:** P2
- **Status:** Mitigado (2026-10-12)
- **Categoria:** IA
- **Ativo afetado:** Chat persistente (`/chat`)
- **Localização:** `src/lib/ai-chat.functions.ts:155-167` (histórico até 40 mensagens) — **agora aplica `sanitizePromptText`**
- **Evidência:** O sanitizador de contexto existe e é usado no arquiteto (`ai-architect.functions.ts:416-422`), mas o chat enviava o histórico armazenado diretamente ao modelo. **Corrigido:** cada mensagem do histórico agora passa por `sanitizePromptText(content, 2000)` antes de ser enviada ao LLM.
- **Cenário de risco:**
  1. Usuário armazena mensagem com injeção; em nova sessão o modelo obedece instrução maliciosa (indireta)
  2. Se um dia o chat ganhar tools que alteram projeto, a injeção vira ação
- **Impacto potencial:** Respostas enviesadas, vazamento do contexto normativo/RAG injetado, futuras ações indevidas
- **Probabilidade:** Média
- **Abrangência:** Usuários do chat
- **Controles existentes:** Saída exibida como markdown; sem execução de ferramentas pelo chat hoje; limite de histórico
- **Controles adicionados:** Sanitização de prompt injection no histórico (`sanitizePromptText` remove padrões conhecidos de jailbreak); mensagens do usuário tratadas como dados citados
- **Recomendação:** Implementada em 2026-10-12. Revisar se/quando tools forem adicionadas ao chat.
- **Prioridade de tratamento:** Normal
- **Dependências:** `ai-chat.functions.ts`, `lib/ai/context-sanitizer.ts`
- **Risco da correção:** Baixo
- **Validação necessária:** Mensagem de histórico contendo "ignore instruções anteriores" não altera o comportamento do system prompt (testado via sanitizer unit tests)
- **Referências:** `ai-chat.functions.ts:155-170`; `context-sanitizer.ts:22-28`

## RISK-011 — Sandbox de scripts SCADA depende de pre-scan regex contornável

- **Severidade:** P2
- **Status:** Suspeito
- **Categoria:** Frontend
- **Ativo afetado:** Execução de scripts de usuário no editor SCADA
- **Localização:** `src/lib/simulation/scada-worker.ts:64-193` (`new Function` com Proxy defensivo + pre-scan regex), host `script-sandbox.ts` (timeout 250 ms)
- **Evidência:** O código executa scripts autoralas via `new Function` dentro de Web Worker; a defesa primária é o isolamento do worker + bloqueio de globals + Proxy; o pre-scan regex é, por construção, contornável (backlog próprio #SCADA-02)
- **Cenário de risco:** Se o isolamento do worker tiver uma brecha (ex.: API exposta no worker), o regex não segura; o script roda na origem do app
- **Impacto potencial:** Execução de código arbitrário no contexto do usuário
- **Probabilidade:** Baixa
- **Abrangência:** Usuários que escrevem scripts SCADA
- **Controles existentes:** Web Worker sem DOM/rede/storage, globals bloqueados, Proxy defensivo, timeout, testes (`scada-sandbox-guards.test.ts`)
- **Controles ausentes ou insuficientes:** Execução em iframe/opaque origin ou avaliação sem `new Function`
- **Recomendação:** Manter worker, mas considerar sandbox mais forte (ex.: iframe sandboxado ou interpretador restrito); documentar risco aceito
- **Prioridade de tratamento:** Normal
- **Dependências:** Monaco, worker-manager
- **Risco da correção:** Alto (mudança de arquitetura de execução)
- **Validação necessária:** Suite de guards + tentativas de escape documentadas em ambiente de teste
- **Referências:** `scada-worker.ts:1-22,99-193`; `script-sandbox.ts`

## RISK-012 — `datasheet_url` do catálogo é renderizado como `href` sem validação de esquema

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** Frontend
- **Ativo afetado:** Link de datasheet em `/catalog`
- **Localização:** `src/routes/catalog.tsx:85-89` (`href={c.datasheet_url}`); origem do valor: importação admin `src/lib/catalog-import.functions.ts:47,167`
- **Evidência:** A URL vem de CSV/XLSX importado por tenant-admin e é renderizada sem checagem de esquema (o fluxo de clientes usa prefixo `https://` — `clients.$clientId.tsx:177`)
- **Cenário de risco:** Importação maliciosa/comprometida armazena `javascript:...`; membro que clica executa script no contexto do app (XSS armazenado dependente de clique)
- **Impacto potencial:** Sequestro de sessão do usuário que clica (agravado pelo RISK-004)
- **Probabilidade:** Baixa (requer admin malicioso/comprometido + clique)
- **Abrangência:** Membros do tenant afetado
- **Controles existentes:** Importação restrita a tenant-admin; CSP reduz parcialmente o impacto
- **Controles ausentes ou insuficientes:** Validação de esquema `http/https` na importação e na renderização
- **Recomendação:** Normalizar/validar URLs na importação (permitir apenas http/https) e prefixar valores inválidos, como já feito em clients
- **Prioridade de tratamento:** Normal
- **Dependências:** `catalog-import.functions.ts`, catálogo do tenant
- **Risco da correção:** Baixo
- **Validação necessária:** Linha de CSV com `javascript:alert(1)` resulta em link inofensivo ou rejeitado
- **Referências:** `catalog.tsx:85-89`; `catalog-import.functions.ts:47,167`

## RISK-013 — Duas implementações de webhook Stripe divergentes (uma sem idempotência)

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** Pagamentos
- **Ativo afetado:** Sincronização de assinaturas/planos
- **Localização:** `supabase/functions/stripe-webhook/index.ts` (sem idempotência; `getPlanFromPrice` deriva nome de env var do price id cru, :78-81) vs `src/routes/api/public/stripe.webhook.ts` (idempotência via `stripe_webhook_events`, :27-37)
- **Evidência:** A Edge Function não deduplica eventos e tem bug de mapeamento de plano; a rota do servidor deduplica e falha com 500 para retry
- **Cenário de risco:** Se ambas estiverem registradas no mesmo endpoint Stripe (ou a edge for usada), eventos repetidos reprocessam pagamentos e o mapeamento de plano da edge falha silenciosamente
- **Impacto potencial:** Planos dessincronizados, cobrança duplicada, perda de receita
- **Probabilidade:** Média
- **Abrangência:** Todos os clientes com assinatura
- **Controles existentes:** Verificação de assinatura HMAC timing-safe com tolerância de 300 s em ambas
- **Controles ausentes ou insuficientes:** Idempotência e mapeamento correto de plano na versão Edge
- **Recomendação:** Consolidar em uma única implementação (recomenda-se a rota do servidor) e desligar a outra; adicionar idempotência à edge se mantida
- **Prioridade de tratamento:** Alta
- **Dependências:** Configuração do endpoint no painel Stripe; CI que faz deploy da edge
- **Risco da correção:** Médio (troca de endpoint requer coordenação com Stripe)
- **Validação necessária:** Reenvio do mesmo evento não altera estado duas vezes; `checkout.session.completed` mapeia o plano correto
- **Referências:** `supabase/functions/stripe-webhook/index.ts:25-105`; `api/public/stripe.webhook.ts:14-44`

## RISK-014 — Cadeia de migrations não reproduzível e com drift local/remoto

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** Banco de dados
- **Ativo afetado:** Reprodutibilidade do schema e das policies
- **Localização:** 11 arquivos `20260505201*_remote_history_placeholder.sql`; `baseline_rls_consolidation.sql`; `20260616105310…:51-53` (policy ausente no dump)
- **Evidência:** O schema central (projects, tenants, diagrams…) não tem DDL no repo; o replay local falharia; uma policy criada localmente não aparece no dump de baseline (drift)
- **Cenário de risco:** Ambiente novo/recoveria de desastre não pode ser recriado a partir do código; mudanças futuras podem divergir do banco vivo
- **Impacto potencial:** Impossibilidade de restore completo "código como fonte"; risco em continuidade e auditoria
- **Probabilidade:** Alta
- **Abrangência:** Infraestrutura e recuperação
- **Controles existentes:** Dump de baseline com 66 tabelas/169 policies como referência; tipos gerados
- **Controles ausentes ou insuficientes:** DDL completo versionado; pipeline de schema drift
- **Recomendação:** Exportar o DDL real (pg_dump schema-only) como migrations iniciais; configurar detecção de drift no CI
- **Prioridade de tratamento:** Normal
- **Dependências:** Projeto Supabase remoto
- **Risco da correção:** Médio (exportações podem conflitar com migrations existentes)
- **Validação necessária:** Projeto efêmero sobe do zero com as migrations e passa os testes de diagnóstico
- **Referências:** `supabase/migrations/*_remote_history_placeholder.sql`; `20260616105310…:51-53`

## RISK-015 — Funções `SECURITY DEFINER` executáveis por clientes sem definição no repositório

- **Severidade:** P2
- **Status:** Não verificado
- **Categoria:** Banco de dados
- **Ativo afetado:** RPCs `increment_usage`, `bootstrap_personal_tenant_if_missing`, `get_user_role`, `get_user_tenant_id`, `batch_insert_alarm_history`, `batch_insert_tag_samples`, `batch_update_simulation_tags`, `search_*`
- **Localização:** Grants restaurados em `supabase/migrations/20260601000000_fix_authenticated_function_grants.sql:5-16`; corpos fora do repo
- **Evidência:** As funções são executáveis por `authenticated`, mas seus corpos não estão em nenhuma migration — a autorização interna não pode ser auditada aqui; `increment_usage` permite auto-relato de consumo
- **Cenário de risco:** Se alguma delas não valida pertencimento ao tenant, um usuário autenticado gravaria dados de outros tenants (bypass de RLS por definer)
- **Impacto potencial:** Vazamento/alteração cruzada de tenants; contaminação de métricas
- **Probabilidade:** Não determinada
- **Abrangência:** Todos os usuários autenticados
- **Controles existentes:** Grants revogados de `anon`; wrappers `*_for_user` restritos a service_role
- **Controles ausentes ou insuficientes:** Corpos auditáveis no repo; verificação de tenant dentro das funções
- **Recomendação:** Extraer os corpos (`pg_proc`) para migrations auditáveis; revisar grants e remover o que não for usado (ex.: `increment_usage`, `batch_update_simulation_tags` sem chamadores)
- **Prioridade de tratamento:** Alta
- **Dependências:** Server functions que consomem esses RPCs
- **Risco da correção:** Alto (funções são caminho quente de telemetria/IA)
- **Validação necessária:** Teste cruzado: usuário A não consegue gravar/ler dados de tenant B via RPC
- **Referências:** `20260601000000_fix_authenticated_function_grants.sql`; `types.ts:2761-2949`

## RISK-016 — Bucket `twin-models` aceita escrita de qualquer papel do tenant

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** RLS
- **Ativo afetado:** Modelos 3D dos gêmeos digitais
- **Localização:** `supabase/migrations/20260626082857…:10-33` (policies `*_own_tenant` sem predicado de papel); criação do bucket fora do repo
- **Evidência:** As policies escopam apenas pelo primeiro segmento do caminho = tenant; qualquer membro (inclusive `viewer`) pode INSERT/UPDATE/DELETE; a criação do bucket não está em migration
- **Cenário de risco:** Membro de baixo privilégio substitui/apaga modelos 3D de colegas; uploads abusivos sem limite de taxa
- **Impacto potencial:** Perda/alteração de ativos de projeto; custo de storage
- **Probabilidade:** Média
- **Abrangência:** Tenants que usam digital twin
- **Controles existentes:** Escopo por tenant no caminho; signed URLs de leitura; limite de 75 MB e regex de nome no servidor
- **Controles ausentes ou insuficientes:** Restrição de papel (engineer+) e rate limit
- **Recomendação:** Adicionar predicado de papel às policies (espelhando `client-logos`) e limitar taxa do endpoint de upload
- **Prioridade de tratamento:** Normal
- **Dependências:** `digital-twin.functions.ts`
- **Risco da correção:** Baixo
- **Validação necessária:** Usuário `viewer` recebe erro ao gerar URL de upload
- **Referências:** `20260626082857…:3-33`; `digital-twin.functions.ts:69-110`

## RISK-017 — Sem MFA e sem gestão de sessões/dispositivos

- **Severidade:** P2
- **Status:** Confirmado
- **Categoria:** Autenticação
- **Ativo afetado:** Contas administrativas e empresariais
- **Localização:** `src/routes/settings.security.tsx:25-36` (apenas troca de senha e `signOut` global)
- **Evidência:** Não há fluxo de MFA/TOTP nem listagem/revogação de sessões por dispositivo em nenhuma rota ou função
- **Cenário de risco:** Comprometimento de senha de um admin de plataforma/tenant não pode ser contido por segundo fator nem revogação seletiva de sessões
- **Impacto potencial:** Acesso persistente de invasores
- **Probabilidade:** Média
- **Abrangência:** Todos os usuários; crítico para admins
- **Controles existentes:** `signOut` global; expiração/refresh padrão do Supabase Auth
- **Controles ausentes ou insuficientes:** MFA (Supabase Auth), gestão de sessões
- **Recomendação:** Habilitar MFA para admins/owners no Supabase e expor lista de sessões com revogação
- **Prioridade de tratamento:** Normal
- **Dependências:** Configuração do Supabase Auth, UI de segurança
- **Risco da correção:** Baixo
- **Validação necessária:** Login de admin sem fator segundo é bloqueado quando MFA obrigatório
- **Referências:** `settings.security.tsx`; doc interna `docs/sdd/10-seguranca.md:22`

## RISK-018 — Backups, RPO/RTO e plano de resposta a incidentes não verificáveis

- **Severidade:** P2
- **Status:** Não verificado
- **Categoria:** Backup
- **Ativo afetado:** Continuidade e recuperação de dados
- **Localização:** Configuração do projeto Supabase/Vercel (fora do repositório)
- **Evidência:** Nenhum artefato no repo documenta plano de backup, retenção, criptografia, RPO/RTO ou procedimento de restore; doc interna não trata do tema
- **Cenário de risco:** Perda de dados por falha do provedor ou exclusão acidental sem caminho de recuperação testado
- **Impacto potencial:** Perda permanente de projetos/documentos de clientes
- **Probabilidade:** Baixa (evento) / Alto impacto
- **Abrangência:** Todos os dados da plataforma
- **Controles existentes:** Possíveis backups nativos do plano Supabase/Vercel (não verificados)
- **Controles ausentes ou insuficientes:** Documentação, testes periódicos de restore, RPO/RTO definidos
- **Recomendação:** Registrar RPO/RTO, habilitar backup pontual, agendar restore de teste trimestral em ambiente efêmero
- **Prioridade de tratamento:** Alta
- **Dependências:** Contratos Supabase/Vercel
- **Risco da correção:** Baixo
- **Validação necessária:** Relatório de restore de teste com dados sintéticos
- **Referências:** Não verificado no repositório

## RISK-019 — Autorização do servidor MCP depende de biblioteca de terceiros não auditada aqui

- **Severidade:** P2
- **Status:** Não verificado
- **Categoria:** API
- **Ativo afetado:** Servidor MCP em `/mcp` e consent screen OAuth 2.1
- **Localização:** `src/routes/mcp.ts:12-23`, `src/lib/mcp/index.ts:22-25`, `src/routes/[.]lovable.oauth.consent.tsx`
- **Evidência:** O enforcement de OAuth/issuer fica dentro de `@lovable.dev/mcp-js`; o roadmap declara que "publicar o app para ativar o servidor de autorização OAuth" ainda está pendente
- **Cenário de risco:** Se o fluxo OAuth de authorization server não estiver totalmente ativo, clients MCP poderiam acessar tools sem consentimento efetivo
- **Impacto potencial:** Acesso de agentes externos a projetos/BOM/alarms em nome do usuário
- **Probabilidade:** Não determinada
- **Abrangência:** Usuários com MCP configurado
- **Controles existentes:** Tools atuam com o token do usuário (RLS aplica; sem fallback anônimo — `src/lib/mcp/supabase.ts:58-69`)
- **Controles ausentes ou insuficientes:** Comprovação de exigência de token/consentimento
- **Recomendação:** Testar chamada MCP sem token (espera-se 401) e com token de outro usuário; documentar o estado do authorization server
- **Prioridade de tratamento:** Normal
- **Dependências:** Publicação do app (roadmap)
- **Risco da correção:** Não determinado
- **Validação necessária:** Requisição sem Bearer retorna 401/403
- **Referências:** `src/routes/mcp.ts`; `roadmap.md:5`; `mcp/supabase.ts:58-69`

## RISK-020 — Sanitizador SVG (DOMPurify) é código morto; único `dangerouslySetInnerHTML` sem sanitização

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Frontend
- **Ativo afetado:** `src/components/ui/chart.tsx`, `src/lib/security/svg-sanitizer.ts`
- **Localização:** `chart.tsx:73-88` (injeta `<style>` gerado); `svg-sanitizer.ts` sem importadores
- **Evidência:** Busca por `dangerouslySetInnerHTML` retorna apenas `chart.tsx`; `sanitizeSvg` não é importado em lugar algum; não há `innerHTML`/`eval` fora do sandbox SCADA
- **Cenário de risco:** Hoje o risco é baixo (config de chart vem de código estático); se dados de usuário/server forem injetados no config, vira CSS/HTML injection sem sanitização
- **Impacto potencial:** XSS se a superfície crescer
- **Probabilidade:** Baixa
- **Abrangência:** Global (biblioteca de UI)
- **Controles existentes:** CSP; ausência de outros sinks de HTML
- **Controles ausentes ou insuficientes:** Uso do DOMPurify já disponível
- **Recomendação:** Executada parcialmente em 2026-10-12: `svg-sanitizer.ts` removido (era código morto, ver RISK-034). Restante: envolver a injeção de estilo do `chart.tsx` com sanitização se algum dia aceitar dados de usuário/servidor
- **Prioridade de tratamento:** Baixa
- **Dependências:** Componentes shadcn
- **Risco da correção:** Baixo
- **Validação necessária:** Config de chart com string hostil não injeta markup
- **Referências:** `chart.tsx:73-88`; `svg-sanitizer.ts:6,33-38`

## RISK-021 — Uploads sem validação de magic bytes e sem limite de taxa; importação de catálogo sem cap de tamanho no cliente

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Upload
- **Ativo afetado:** Modelos GLB/GLTF (`twin-models`) e importação CSV/XLSX do catálogo
- **Localização:** `src/lib/digital-twin.functions.ts:69-110` (regex de nome, 75 MB, sem magic bytes); `src/routes/settings.catalog-import.tsx:179-188` (parse no cliente, sem limite de bytes)
- **Evidência:** O servidor valida extensão/tamanho/caminho, mas não o conteúdo real do arquivo; nenhum rate limit no endpoint de URL de upload
- **Cenário de risco:** Arquivo renomeado com extensão válida é servido via signed URL; importação de arquivo muito grande trava o navegador
- **Impacto potencial:** Conteúdo inesperado no bucket; indisponibilidade do cliente
- **Probabilidade:** Baixa
- **Abrangência:** Tenants com uploads
- **Controles existentes:** Bucket privado com signed URLs, validação de caminho por tenant/projeto, limite de 2000 linhas no servidor, parse fora do servidor
- **Controles ausentes ou insuficientes:** Verificação de assinatura/magic bytes, rate limit, antivírus (RISK-033)
- **Recomendação:** Validar cabeçalho GLB (`glTF` magic) no confirm upload; limitar taxa e tamanho no cliente
- **Prioridade de tratamento:** Baixa
- **Dependências:** Storage Supabase
- **Risco da correção:** Baixo
- **Validação necessária:** Upload de `.glb` com conteúdo inválido é rejeitado
- **Referências:** `digital-twin.functions.ts:69-110,282-297`

## RISK-022 — Proteção de rotas apenas client-side (sem `beforeLoad`)

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Frontend
- **Ativo afetado:** Rotas privadas
- **Localização:** `src/routes/__root.tsx:24-30,120-194` (`AuthGate`); único `beforeLoad` de auth em `[.]lovable.oauth.consent.tsx:55-62`
- **Evidência:** O gate é um componente React; loaders só fazem prefetch e curto-circuitam no servidor
- **Cenário de risco:** Rota futura que busque dados com cliente sem RLS/loader exporia conteúdo antes do gate; hoje os dados vêm de server functions autenticadas (91/91 com middleware)
- **Impacto potencial:** Vazamento pontual de conteúdo não autenticado
- **Probabilidade:** Baixa (hoje)
- **Abrangência:** Global
- **Controles existentes:** Autorização real no servidor (server functions + RLS)
- **Controles ausentes ou insuficientes:** Guarda estrutural no router
- **Recomendação:** Adicionar `beforeLoad` de sessão no router para rotas privadas; manter allowlist mínima de públicas
- **Prioridade de tratamento:** Baixa
- **Dependências:** `router.tsx`, `__root.tsx`
- **Risco da correção:** Médio (pode quebrar SSR/redirects)
- **Validação necessária:** Acesso a `/dashboard` sem sessão redireciona antes do render de dados
- **Referências:** `__root.tsx:120-194`

## RISK-023 — Consent OAuth do MCP redireciona sem `isSafeRedirect`

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Frontend
- **Ativo afetado:** Fluxo de consentimento `/.lovable/oauth/consent`
- **Localização:** `src/routes/[.]lovable.oauth.consent.tsx:68-69,113`
- **Evidência:** `redirect_url`/`redirect_to` vindos do servidor OAuth são usados em `redirect({href})`/`window.location.href` sem passar pelo validador usado no login
- **Cenário de risco:** Se o servidor OAuth aceitar redirect não registrado, o consentimento vira open redirect (phishing)
- **Impacto potencial:** Roubo de credenciais via redirecionamento convincente
- **Probabilidade:** Baixa (depende do servidor OAuth)
- **Abrangência:** Usuários de clientes MCP
- **Controles existentes:** Registro de URIs de redirect no authorization server (esperado); sessão exigida no `beforeLoad`
- **Controles ausentes ou insuficientes:** Validação client-side da URL
- **Recomendação:** Aplicar `isSafeRedirect` (ou allowlist de origens) antes de redirecionar
- **Prioridade de tratamento:** Baixa
- **Dependências:** `safe-redirect.ts`
- **Risco da correção:** Baixo
- **Validação necessária:** Redirect para origem externa não registrada é bloqueado
- **Referências:** `[.]lovable.oauth.consent.tsx:63-117`; `safe-redirect.ts:8-15`

## RISK-024 — Política de senha inconsistente (cadastro aceita 6 caracteres; reset exige 8)

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Autenticação
- **Ativo afetado:** Qualidade de senha das contas
- **Localização:** `src/routes/signup.tsx:66-72` (mínimo 6) vs `src/routes/reset-password.tsx:29` (mínimo 8)
- **Evidência:** Validações divergentes no cliente; a política efetiva do Supabase Auth não é verificável no repo
- **Cenário de risco:** Contas criadas com senhas mais fracas que as redefinidas
- **Impacto potencial:** Maior exposição a força bruta
- **Probabilidade:** Média
- **Abrangência:** Novos usuários
- **Controles existentes:** Mínimo de 8 no reset; política server-side do Supabase (não verificada)
- **Controles ausentes ou insuficientes:** Política única e forte nos dois fluxos
- **Recomendação:** Unificar mínimo (8+, idealmente 10+ com complexidade/checked) e refletir na política do Supabase
- **Prioridade de tratamento:** Baixa
- **Dependências:** Configuração Supabase Auth
- **Risco da correção:** Baixo
- **Validação necessária:** Cadastro com senha de 6 caracteres é rejeitado
- **Referências:** `signup.tsx:66-72`; `reset-password.tsx:29`

## RISK-025 — CI/CD referenciado não está versionado; sem script de typecheck; drift no `.env.example`

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Infraestrutura
- **Ativo afetado:** Pipeline de qualidade/deploy e configuração de ambientes
- **Localização:** `README.md:8-71` (descreve `.github/workflows/ci.yml`); pasta `.github/` inexistente; `package.json:13-22` (sem script typecheck); `.env.example` (nomes divergentes: `MERCADO_PAGO_WEBHOOK_SECRET` vs código `MP_WEBHOOK_SECRET`; sem `UPSTASH_REDIS_REST_URL/TOKEN` nem `SUPABASE_JWT_SECRET`)
- **Evidência:** Inspeção direta do repositório
- **Cenário de risco:** Sem CI versionada, lint/testes/typecheck dependem de disciplina manual; segredos de deploy documentados sem workflow auditável; configuração de ambiente nova falha por nomes errados
- **Impacto potencial:** Regressões em produção; deploys com permissões não auditadas
- **Probabilidade:** Alta
- **Abrangência:** Todo o projeto
- **Controles existentes:** Scripts locais de lint/test/build; lockfile do Bun
- **Controles ausentes ou insuficientes:** Workflow revisável; typecheck automatizado
- **Recomendação:** Versionar o workflow (com least-privilege nos tokens), adicionar `typecheck: tsc --noEmit` e reconciliar `.env.example` com os nomes reais
- **Prioridade de tratamento:** Normal
- **Dependências:** GitHub/Vercel
- **Risco da correção:** Baixo
- **Validação necessária:** CI verde em PR; `bun run typecheck` existe e passa
- **Referências:** `README.md`; ausência de `.github/`; `package.json`

## RISK-026 — Verificação de e-mail e configuração OAuth Google dependem do dashboard Supabase

- **Severidade:** P3
- **Status:** Não verificado
- **Categoria:** Autenticação
- **Ativo afetado:** Cadastro e login social
- **Localização:** `src/routes/signup.tsx:32-39` (`emailRedirectTo`), `login.tsx:67` (OAuth Google); configuração do provedor fora do repo
- **Evidência:** O código solicita os fluxos, mas exigência de confirmação de e-mail, proteção contra enumeração e URIs de redirect permitidas são configuradas no painel Supabase/Google
- **Cenário de risco:** Se confirmação estiver desativada, contas falsas podem ser criadas em escala; se URIs forem amplas, abuso de OAuth
- **Impacto potencial:** Contas fraudulentas; abuso de recursos (IA)
- **Probabilidade:** Não determinada
- **Abrangência:** Novos usuários
- **Controles existentes:** Fluxo de confirmação implementado no cliente; rate limit de IA por conta
- **Controles ausentes ou insuficientes:** Evidência configural
- **Recomendação:** Conferir no dashboard: "Confirm email" ativo, domínios/URIs restritos, Leaked Password Protection (SEC-04 da doc interna)
- **Prioridade de tratamento:** Baixa
- **Dependências:** Supabase Auth, Google Cloud
- **Risco da correção:** Não determinado
- **Validação necessária:** Cadastro sem confirmação não obtém sessão; redirect OAuth fora da allowlist é rejeitado
- **Referências:** `signup.tsx:32-47`; `docs/sdd/10-seguranca.md:22`

## RISK-027 — Termos de uso e política de privacidade sem páginas reais

- **Severidade:** P3
- **Status:** Mitigado (2026-10-12)
- **Categoria:** Outro
- **Ativo afetado:** Landing page / conformidade legal (LGPD)
- **Localização:** `public/legal/privacy-policy.md`, `public/legal/terms-of-service.md` (v1.1 com §17 de confidencialidade industrial), rotas `/privacidade` (`src/routes/privacidade.tsx`) e `/termos` (`src/routes/termos.tsx`), componente `src/components/legal-page.tsx`
- **Evidência:** Documentos v1.0 publicados e versionados no repo; footer da landing (`index.tsx`) e aviso do signup vinculados às rotas reais; rotas adicionadas a `PUBLIC_PATHS` no `__root.tsx` (acesso sem login)
- **Cenário de risco:** Não conformidade legal e desconfiança comercial
- **Impacto potencial:** Passivo jurídico; bloqueio em assessment de clientes corporativos
- **Probabilidade:** Alta (para operação comercial)
- **Abrangência:** Todos os usuários
- **Controles existentes:** Documentos publicados, vinculados no cadastro e no footer
- **Controles ausentes ou insuficientes:** Revisão jurídica final (CNPJ/endereço placeholder), aceite explícito versionado no signup (checkbox + timestamp)
- **Recomendação:** Implementada em 2026-10-12. Pendente: preencher CNPJ/endereço reais, revisão por jurídico, adicionar checkbox de aceite com versão no signup
- **Prioridade de tratamento:** Normal
- **Dependências:** Jurídico
- **Risco da correção:** Baixo
- **Validação necessária:** Executada: `/privacidade` e `/termos` renderizam o Markdown; typecheck + lint + 196 testes verdes
- **Referências:** `public/legal/*.md`; `legal-page.tsx`; `privacidade.tsx`; `termos.tsx`

## RISK-028 — Dados sintéticos/demo apresentados em telas de operação

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Outro
- **Ativo afetado:** Integridade percebida do dashboard, analytics, billing e team
- **Localização:** `dashboard.tsx:49-51,415-417` (senos/rand), `analytics.tsx:28-32,225` (placeholder declarado), `settings.billing.tsx:158-161` e `settings.team.tsx:181-231` (fallbacks demo)
- **Evidência:** Comentários no código declaram placeholders; fallbacks exibem dados fictícios quando o backend falha
- **Cenário de risco:** Usuário/admin toma decisão com base em número fictício apresentado como real
- **Impacto potencial:** Decisões operacionais/comerciais erradas
- **Probabilidade:** Média
- **Abrangência:** Telas afetadas
- **Controles existentes:** Comentários internos; billing sinaliza "demo"
- **Controles ausentes ou insuficientes:** Sinalização visual clara de modo demo para o usuário final
- **Recomendação:** Rotular explicitamente dados sintéticos na UI e ocultar cards sem fonte real
- **Prioridade de tratamento:** Baixa
- **Dependências:** Telas de relatório
- **Risco da correção:** Baixo
- **Validação necessária:** UI indica "dados de demonstração" nos cartões sintéticos
- **Referências:** `analytics.tsx:225`; `dashboard.tsx:49-51`

## RISK-029 — Espelhamento operacional em `localStorage` (settings, runtime config com URL/key coladas)

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Frontend
- **Ativo afetado:** Preferências e configuração de runtime
- **Localização:** `src/hooks/use-tenant-setting.ts:22-37`, `src/lib/runtime-client.ts:9,25-37`, `settings.integrations.tsx:17-24`, `digital-twin-store.ts`, `settings-store.ts`
- **Evidência:** Espelhos locais de `tenant_settings` (inclui usuário OPC-UA/MQTT, sem senhas) e `RuntimeConfig` preenchido com URL/anon key colados pelo usuário
- **Cenário de risco:** Dados operacionais em cliente; URL/key erradas apontam runtime para outro projeto; leitura por XSS (ver RISK-004)
- **Impacto potencial:** Fuga de metadados operacionais; configuração errada de telemetria
- **Probabilidade:** Baixa
- **Abrangência:** Usuários que configuram protocolos/runtime
- **Controles existentes:** Sem senhas no storage; anon key é pública
- **Controles ausentes ou insuficientes:** Minimização de dados em storage
- **Recomendação:** Reduzir espelhos ao necessário e validar URL/key no salvamento (apenas projetos do próprio tenant)
- **Prioridade de tratamento:** Baixa
- **Dependências:** `use-tenant-setting`, `runtime-client`
- **Risco da correção:** Médio (pode afetar funcionalidade offline/demo)
- **Validação necessária:** Fluxos de settings/runtime continuam após redução do storage
- **Referências:** `runtime-client.ts:25-37`; `use-tenant-setting.ts:22-37`

## RISK-030 — CORS `*` nos endpoints públicos

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** API
- **Ativo afetado:** `/api/public/iot/ingest`, Edge Functions
- **Localização:** `src/routes/api/public/iot.ingest.ts:15-22`; `supabase/functions/*/index.ts` (CORS `*`)
- **Evidência:** Cabeçalhos permitem qualquer origem
- **Cenário de risco:** Chamadas cross-origin são aceitas; o abuso é limitado por token/chave/assinatura, não por origem
- **Impacto potencial:** Uso indevido de endpoints por páginas de terceiros em nome do navegador de vítimas (limitado pelos segredos)
- **Probabilidade:** Baixa
- **Abrangência:** Endpoints públicos
- **Controles existentes:** Autenticação por API key/assinatura + rate limit no ingest
- **Controles ausentes ou insuficientes:** Allowlist de origem
- **Recomendação:** Restringir `Access-Control-Allow-Origin` às origens conhecidas quando aplicável
- **Prioridade de tratamento:** Baixa
- **Dependências:** Dispositivos IoT (origens arbitrárias) — avaliar antes de restringir
- **Risco da correção:** Médio (pode quebrar dispositivos/third parties)
- **Validação necessária:** Preflight aceita apenas origens da allowlist
- **Referências:** `iot.ingest.ts:15-22`

## RISK-031 — SELECT em `tenant_memberships` expõe todos os membros e papéis a qualquer membro

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** RLS
- **Ativo afetado:** Composição de equipes do tenant
- **Localização:** `baseline_rls_consolidation.sql:791-792` (policy SELECT `TO public` por tenant)
- **Evidência:** Qualquer membro lê user_ids e papéis de todos os membros
- **Cenário de risco:** Mapeamento de estrutura interna; auxilia phishing direcionado
- **Impacto potencial:** Exposição de metadados de usuários (não há senhas/PII extra)
- **Probabilidade:** Baixa
- **Abrangência:** Tenants multiusuário
- **Controles existentes:** Escopo por tenant (sem vazamento entre tenants)
- **Controles ausentes ou insuficientes:** Restrição de colunas/visibilidade a admins
- **Recomendação:** Avaliar restringir a leitura completa aos admins, mantendo o mínimo necessário para a UI de equipe
- **Prioridade de tratamento:** Baixa
- **Dependências:** `/settings/team`, convites
- **Risco da correção:** Médio (UI de equipe depende desses dados)
- **Validação necessária:** Membro comum não vê lista completa de membros (ou vê apenas o mínimo)
- **Referências:** `baseline_rls_consolidation.sql:791-792`

## RISK-032 — Sem error tracking externo nem alertas de custo de IA

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Auditoria
- **Ativo afetado:** Observabilidade da aplicação
- **Localização:** `src/lib/error-capture.ts`, `diagnostics.functions.ts`, `/settings/diagnostics`, `/settings/ai-status` (busca de eventos por Sentry/Datadog/Logtail não encontrada)
- **Evidência:** Contadores locais de erro 500/503 e eventos de status de IA em memória/tabela, sem serviço externo de agregação ou alerta
- **Cenário de risco:** Incidentes e picos de custo de IA só são vistos se alguém abrir os painéis internos
- **Impacto potencial:** Downtime prolongado; fatura de IA inesperada
- **Probabilidade:** Média
- **Abrangência:** Plataforma
- **Controles existentes:** Painéis internos de diagnóstico; `ai_usage_events`/`ai_status_events`
- **Controles ausentes ou insuficientes:** Alertas proativos, error tracking centralizado, dashboard de custo
- **Recomendação:** Integrar error tracking com redação de dados e alertas de orçamento de IA
- **Prioridade de tratamento:** Normal
- **Dependências:** Escolha de provedor, LGPD
- **Risco da correção:** Baixo
- **Validação necessária:** Erro 500 sintético gera alerta
- **Referências:** `error-capture.ts`, `diagnostics.functions.ts`

## RISK-033 — Sem antivírus/quarentena; superfície de upload limitada mas crescente

- **Severidade:** P3
- **Status:** Confirmado
- **Categoria:** Upload
- **Ativo afetado:** Bucket `twin-models` e futuros uploads de documentos
- **Localização:** `src/lib/digital-twin.functions.ts` (fluxo de upload atual)
- **Evidência:** Não há scanning de malware nem etapa de quarentena em nenhum fluxo; hoje só há upload real de GLB/GLTF (e parse client-side de CSV/XLSX)
- **Cenário de risco:** Arquivo malicioso armazenado e distribuído via signed URL; risco cresce com o módulo de documentos planejado
- **Impacto potencial:** Exposição de usuários a conteúdo malicioso
- **Probabilidade:** Baixa (superfície pequena hoje)
- **Abrangência:** Tenants com uploads
- **Controles existentes:** Bucket privado + signed URLs + validação de nome/extensão/tamanho
- **Controles ausentes ou insuficientes:** Scanner, quarentena, processamento isolado
- **Recomendação:** Ao adicionar upload de documentos/PDF, incluir scanning na ingestão e processamento isolado (OCR em sandbox)
- **Prioridade de tratamento:** Baixa
- **Dependências:** Módulo de documentos (planejado)
- **Risco da correção:** Baixo
- **Validação necessária:** Arquivo de teste EICAR é bloqueado na ingestão
- **Referências:** `digital-twin.functions.ts:69-110`

## RISK-034 — Código morto/legado que aumenta risco de manutenção

- **Severidade:** P3
- **Status:** Mitigado (2026-10-12; escopo detalhado em Localização/Evidência)
- **Categoria:** Outro
- **Ativo afetado:** Manutenibilidade e superfície de ataque
- **Localização:** Mapeamento de consumidores (grep em todo o repo) executado em 2026-10-12 antes de cada remoção
- **Evidência:** Resultado do mapeamento: `src/hooks/auth-store.ts` — **removido** (zero importadores; auth canônico é `use-auth.tsx`); `src/lib/security/svg-sanitizer.ts` — **removido** (zero importadores; resolve também metade do RISK-020); `konva-canvas.tsx` — **mantido**: o achado estava errado, é usado via `LazyKonvaCanvas` (`lazy.tsx:124-138`) por `scada-canvas.tsx:4`; Edge Function de IA órfã — **mantida** (escopo do RISK-009, exige decisão de deploy); RPCs sem chamador — **mantidas** (vivem no banco/`types.ts` gerado; remoção exige migration); `projects.twin_model_path` — **endereçado** via migration `20261012090000` (regenerar `types.ts` pendente)
- **Cenário de risco:** Manutentor altera store/auth "errado"; endpoint esquecido permanece exposto; funções dormentes mantêm superfície privilegiada
- **Impacto potencial:** Regressões e superfície de ataque desnecessária
- **Probabilidade:** Média
- **Abrangência:** Código e infraestrutura
- **Controles existentes:** Convenção `.server.ts`, testes de regressão
- **Controles ausentes ou insuficientes:** Limpeza guiada por busca de consumidores
- **Recomendação:** Executada em 2026-10-12 (remoções acima). Itens retidos com justificativa em Evidência.
- **Prioridade de tratamento:** Baixa
- **Dependências:** Vários módulos
- **Risco da correção:** Médio (remoção pode quebrar importações ocultas — exigir suíte verde)
- **Validação necessária:** Executada: `tsc --noEmit` limpo, `eslint` limpo, `bun run test` 27 arquivos/196 testes verdes
- **Referências:** Deletados: `src/hooks/auth-store.ts`, `src/lib/security/svg-sanitizer.ts`; retido com prova de uso: `src/components/canvases/konva-canvas.tsx` via `lazy.tsx:124-138`

## RISK-035 — `deleteConversation` deixava mensagens órfãs (falha silenciosa de RLS)

- **Severidade:** P2
- **Status:** Mitigado (2026-10-12)
- **Categoria:** Exclusão/LGPD
- **Ativo afetado:** `ai_messages` (conteúdo de prompts do usuário)
- **Localização:** `src/lib/ai-chat.functions.ts:77` (delete sem checar erro); ausência de policy `FOR DELETE` em `ai_messages` (baseline `:101-110` só tem INSERT/SELECT)
- **Evidência:** O delete das mensagens era negado pelo RLS e o erro ignorado; a conversa era apagada e as mensagens permaneciam invisíveis porém armazenadas — violação da §6 da Política
- **Cenário de risco:** Titular "exclui" conversa e os prompts permanecem no banco
- **Impacto potencial:** Descumprimento do Art. 18, VI da LGPD
- **Probabilidade:** Alta (todo delete de conversa)
- **Abrangência:** Todos os usuários do chat
- **Controles existentes:** Policy de DELETE criada; erro agora aborta antes de tocar na conversa
- **Controles ausentes ou insuficientes:** Nenhum após a correção
- **Recomendação:** Executada em 2026-10-12: migration `20261012110000` (policy DELETE) + checagem de erro + testes
- **Prioridade de tratamento:** Alta
- **Dependências:** `ai_messages`, `ai_conversations`
- **Risco da correção:** Baixo
- **Validação necessária:** Executada: `deletion.test.ts` (ordem mensagens→conversa; abort sem tocar na conversa sob negação RLS). Pendente: `supabase db push` da migration + teste em staging com as queries do protocolo
- **Referências:** `ai-chat.functions.ts:71-88`; `20261012110000_fix_deletion_policies_and_requests.sql`; `deletion.test.ts`

## RISK-036 — `deleteProject` corrompia projeto e deixava tabelas órfãs

- **Severidade:** P2
- **Status:** Mitigado (2026-10-12)
- **Categoria:** Exclusão/Integridade
- **Ativo afetado:** `projects` + 11 tabelas filhas
- **Localização:** `src/lib/projects.functions.ts:495-506` (versão anterior: sem gate de papel, sem checar erros, só 2 tabelas filhas)
- **Evidência:** (a) engineer apagava `diagrams`/`project_versions` e falhava no `DELETE projects` (policy admin-only via `profiles.role`) — corrupção parcial; (b) BOM, alarmes, simulações, trends, cálculos, arquivos e FB instances permaneciam órfãos
- **Cenário de risco:** Exclusão parcial destrói canvas/histórico sem remover o projeto; dados órfãos acumulam e escapam da eliminação LGPD
- **Impacto potencial:** Perda de dados + descumprimento de eliminação
- **Probabilidade:** Alta
- **Abrangência:** Todos os tenants
- **Controles existentes:** Gate owner/admin via `tenant_memberships` antes de qualquer mutação; 11 filhas com erro nomeado por tabela; `twin_hotspots` por `ON DELETE CASCADE`
- **Controles ausentes ou insuficientes:** `tag_samples` (sem policy DELETE p/ cliente) e `comments` (só próprias) — limpeza via expurgo com service role (follow-up)
- **Recomendação:** Executada em 2026-10-12 + testes
- **Prioridade de tratamento:** Alta
- **Dependências:** Policies DELETE das filhas (verificadas no baseline); migration `20261012110000` (policy DELETE p/ `alarm_history`)
- **Risco da correção:** Médio (mudança de semântica: engineer perde o botão efetivo de excluir — passa a receber 403 explícito em vez de corrupção silenciosa)
- **Validação necessária:** Executada: `deletion.test.ts` (403 sem mutação p/ engineer; 404 sem mutação; ordem filhas→projeto; erro nomeado por tabela). Pendente: apply da migration + protocolo de staging
- **Referências:** `projects.functions.ts` (`PROJECT_CHILD_TABLES`, `deleteProjectChildren`); `deletion.test.ts`

## RISK-037 — Sem fluxo de eliminação de conta (LGPD Art. 18, VI)

- **Severidade:** P2
- **Status:** Mitigado (2026-10-12; Storage/tag_samples pendentes)
- **Categoria:** Exclusão/LGPD
- **Ativo afetado:** Identidade do titular (`auth.users`, `profiles`, `tenant_memberships`, conversas IA, API keys)
- **Localização:** Novo módulo `src/lib/account-deletion.functions.ts`; tabela `deletion_requests` (migration `20261012110000`)
- **Evidência:** Grep por `deleteUser|profiles.delete` retornava 0 resultados — eliminação de conta era 100% manual via dashboard
- **Cenário de risco:** Pedido de eliminação sem fluxo rastreável nem SLA
- **Impacto potencial:** Descumprimento de prazo (15 dias úteis) e de eliminação
- **Probabilidade:** Média
- **Abrangência:** Todos os titulares
- **Controles existentes:** `requestAccountDeletion` (deduplicado, fila auditável com RLS) + `listMyDeletionRequests` + `eraseUserData` (gate platform admin via `is_platform_admin()`, relatório por etapa, rollback de status em falha)
- **Controles ausentes ou insuficientes:** Limpeza de objetos no Storage e de `tag_samples`; `created_by` NOT NULL impede anonimização total (UUIDs órfãos sem identidade vinculável — risco residual documentado)
- **Recomendação:** Executada em 2026-10-12. Follow-ups: expurgo Storage/tag_samples com service role; migration tornando `created_by` nulável se exigido
- **Prioridade de tratamento:** Alta
- **Dependências:** `is_platform_admin()`, service role, tabela `deletion_requests`
- **Risco da correção:** Alto (operação destrutiva irreversível — por isso gate admin + relatório + status)
- **Validação necessária:** Executada: `deletion.test.ts` (negação não-admin sem mutação; relatório completo + ordem mensagens→conversas). Pendente: apply da migration + ensaio em staging + runbook de restore (RISK-018)
- **Referências:** `account-deletion.functions.ts`; `20261012110000_fix_deletion_policies_and_requests.sql`; `deletion.test.ts`

### 10.3 Resumo executivo

- **Total de riscos identificados:** 37 (0 P0 confirmados nesta inspeção estática — a ausência de P0 **não** atesta segurança; ver limitações)
- **Por severidade:** P0: 0 · P1: 4 · P2: 18 · P3: 15
- **Por status:** Confirmado: 22 · Suspeito: 1 · Não verificado: 4 · Mitigado: 10
- **Riscos que exigem avaliação imediata (push 2026-10-14 em `rvaaxvdimggztjxoktvy`, 56/56 aplicadas):**
  1. RISK-001 (`twin_hotspots`) — tabela criada com RLS ligado; policies por projeto puladas (sem `projects`/`tenant_memberships`) — pendente DDL central + teste de acesso cruzado
  2. RISK-002 (trigger de e-mail hardcoded) — **resolvido e verificado**: trigger ausente, `platform_admins` vazio
  3. RISK-003 (escalação `owner`) — migration aplicada mas sem efeito (sem tabela); pendente DDL central + teste com admin não-owner
  4. **Novo achado crítico**: o banco do app **não tem nenhuma tabela central** (`profiles`, `projects`, `tenants`...) — o DDL nunca esteve no repo. O app não opera contra este banco até restauração (pg_dump do banco vivo original).
- **Principais riscos de vazamento/perda de dados:** RISK-001, RISK-003, RISK-015 (RPCs definer não auditáveis), RISK-018 (backups não verificados), RISK-005 (billing visível a membros)
- **Principais riscos de acesso indevido entre organizações:** RISK-001, RISK-003, RISK-015, RISK-016
- **Riscos de comprometimento de credenciais:** RISK-004 (token em localStorage + CSP fraca), RISK-002 (conta admin permanente), RISK-008 (fallbacks hardcoded), RISK-006 (sem rate limit de auth)
- **Riscos de indisponibilidade/perda:** RISK-018 (backups/RPO-RTO), RISK-014 (migrations não reproduzíveis), RISK-007 (fail-open de rate limit → custo/abuso), RISK-032 (falta de alertas)
- **Controles essenciais não verificados:** estado real de RLS de `twin_hotspots`; corpos das RPCs `SECURITY DEFINER`; configuração de Auth (confirmação de e-mail, MFA, leaked-password protection); plano de backup do Supabase/Vercel; enforcement OAuth do MCP; configuração de `verify_jwt` da Edge Function de webhook no painel
- **Ordem recomendada de tratamento:** (1) confirmar/reparar RLS de `twin_hotspots`; (2) remover trigger de e-mail hardcoded e migrar gestão de admins; (3) corrigir policy de `tenant_memberships`; (4) endurecer sessão/CSP; (5) restringir policies de billing; (6) aplicar rate limit de auth e fail-closed de IA/IoT; (7) consolidar webhooks Stripe; (8) auditar RPCs definer e backups; (9) demais P3 em ordem de esforço

### 10.4 Controles positivos verificados (evidência de boas práticas)

- Autorização no servidor: 91 server functions com `requireSupabaseAuth`/`requireTenantAdmin`; JWT verificado localmente (JWKS/`jose`) com fallback `auth.getUser`.
- RLS em 66 tabelas com 169 policies no dump de baseline (mais `twin_hotspots` via migration `20261012090000`, pendente de apply); deny-all para escritas de cliente em `iot_readings`, `stripe_webhook_events`, `mp_webhook_processed`, `plant_telemetry`, partições de `tag_samples`.
- Proteção de colunas: ids Stripe e token de convito com SELECT revogado de clientes; token de API IoT armazenado como hash SHA-256.
- Webhooks Stripe/MP com verificação de assinatura constant-time, tolerância de replay e (na rota do servidor) idempotência; MP reconsulta o pagamento na API oficial.
- SSRF guard em Modbus (RFC1918, bloqueio de loopback/metadata/IPv6, defesa contra DNS-rebinding) com testes.
- Saída de IA validada por Zod (`AiDiagramPatchSchema.safeParse`), com preview antes de aplicar e loop de verificação (inclui E-STOP por simulação).
- Upload GLB com escopo por tenant/projeto, signed URLs, nome saneado e limite de tamanho.
- Comandos de equipamento: fila `iot_command_log` com watchdog/fail-safe, RPC restrita a service_role e papel engineer+; simulação local claramente separada (nenhum caminho de IA escreve em equipamento real).
- CSP + `X-Frame-Options DENY` + `nosniff` + `Referrer-Policy` + `Permissions-Policy` no `vercel.json`; guard de open-redirect com testes.

### 10.5 Limitações desta auditoria

- Inspeção **estática** apenas; nenhum teste dinâmico, pen-test ou verificação contra o banco vivo/serviços.
- Configurações fora do repositório (Supabase dashboard, Vercel, Stripe, Google, Upstash, GitHub) são **não verificáveis** aqui.
- Parte do schema e das funções existe apenas no banco remoto (migrations placeholder), o que limita a auditoria de RLS/functions a partir do código.
- Dependências não foram submetidas a varredura de vulnerabilidades (sem execução de install/audit).
- Histórico Git não foi varrido por segredos além dos arquivos atuais do working tree.
- Se o ambiente de execução não permitiu inspecionar um componente (ex.: enforcement interno da lib MCP), isso está registrado como **Não verificado** nos riscos acima.

---

_Documento gerado por auditoria de leitura. Nenhum outro arquivo do repositório foi modificado; nenhuma dependência foi instalada; nenhuma migration foi executada; nenhuma credencial foi revelada._
