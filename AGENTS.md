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
| Hospedagem                       | Vercel (preset `nitro: vercel`) + projeto Supabase cloud (`project_id = "rvaaxvdimggztjxoktvy"` em `supabase/config.toml`) + Upstash (rate limiting, quando configurado)                                                                                                           |
| Integrações externas confirmadas | DeepSeek (`api.deepseek.com`), Stripe, Mercado Pago, Supabase (Auth/DB/Storage/Realtime), Google OAuth, Upstash Redis REST, Modbus TCP (socket no servidor, com guarda SSRF). **Lovable removido integralmente do projeto em 2026-11-19** — servidor MCP, broker de preview E o config de build `@lovable.dev/vite-tanstack-config`; o `vite.config.ts` agora compõe o stack TanStack Start diretamente (Tailwind + tsconfig-paths + tanstackStart + Nitro/Vercel + React). Nenhum `@lovable.dev/*` resta no código ou no `package.json`. A IA do chat chama-se **EletricAI** (antes "NexusMind") |
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
| FB Electric Studio (FBD/LAD por páginas, motor IEC AST→IR, EN/ENO, simulação, ST) | ✅ | `src/components/compact-studio/`, `src/lib/compact-studio/`, motor em `lib/fbd/engine/*`; o editor FBD legado foi unificado no Studio (2026-11-16) |
| PLC (rack, variáveis, blocos, PLCopen XML)                          | ✅ (camada de projeto) | `lib/plc/*`, `plcopen-export.ts`; **sem download/execução em PLC real**                                                                                                                                                                                                                                   |
| Comunicação Modbus                                                  | ✅ (Gate 3 Edge)       | Driver Modbus TCP Read-Only em `lib/edge/drivers/modbus-driver.ts`; MBAP/PDU, FC1/2/3/4, 4 endianness (ABCD/DCBA/CDAB/BADC), escala e zero/one-based                                                                                                                                                       |
| Comunicação OPC-UA                                                  | ✅ (Gate 3 Edge)       | Driver OPC UA Read-Only em `lib/edge/drivers/opcua-driver.ts`; SignAndEncrypt, Trust List, Browse, Read, Subscriptions, mapeamento de StatusCodes para qualidade                                                                                                                                          |
| Comunicação MQTT Sparkplug B                                        | ✅ (Gate 3 Edge)       | Driver Sparkplug B Read-Only em `lib/edge/drivers/sparkplug-driver.ts`; NBIRTH, DBIRTH, NDATA, DDATA, NDEATH, sequenciamento 0-255 e ACL de tópicos                                                                                                                                                        |
| ElétricAi Edge Gateway (Store-and-Forward)                          | ✅ (Gate 3 Edge)       | Daemon autônomo `lib/edge/gateway-manager.ts`, outbox transacional `lib/edge/buffer/sqlite-outbox.ts`, provisionamento por token descartável `lib/edge/provisioning.ts`, isolamento multi-tenant IEC 62443                                                                                                   |
| SCADA/HMI (telas, tags, alarmes ISA-18.2, trends)                   | ✅                     | `scada-canvas.tsx`, `scada-engine.ts`, sandbox de scripts em Web Worker                                                                                                                                                                                                                                   |
| Simulação                                                           | 🟡                     | Ladder/FBD simulam lógica real; planta 8M+2EX com motor determinístico; **circuitos de potência e PLC real não são simulados**; painel "Simulação" reúne planta, cenários, ponte e estudos                                                                                                                |
| CCM supervisório (comando de motores)                              | ✅ (simulação)         | Aba **SCADA → CCM — Motores**: frota derivada do unifilar (`lib/simulation/motor-fleet.ts`), motor de proteção puro (`motor-protection-engine.ts`: I²t IEC 60947-4-1 por classe, magnético B/C/D, falta de fase, falha de rotação, falha de sensor PT100/encoder, subtensão sem religamento), store efêmero com espelho de contatores/disjuntores no unifilar (`motor-control-store.ts`), I/O de CLP simulado; **escrita em campo bloqueada** |
| Digital twin 3D | ❌ (removido) | Módulo removido (`drop_digital_twin_module`); rota, stores, bucket `twin-models` e hotspots não existem mais |
| Cálculos elétricos                                                  | ✅                     | `electrical-calc.ts`: motor, demanda, queda de tensão, dimensionamento de cabo/corrente. `electrical-sim.ts` (novo): curto-circuito IEC 60909, seletividade IEC 60947, ruptura, arco elétrico IEEE 1584, esforço térmico de partida, com painel em Simulação. Harmônicas (`power-quality.ts`) e aterramento (`grounding.ts`) na tela `/calculations` |
| IA (architect, chat, patches, RAG normativo, créditos, rate limits) | ✅                     | `ai-architect.functions.ts`, `ai-chat.functions.ts`, `diagram/ai.functions.ts`; **upload/OCR de PDF na IA é mock**                                                                                                                                                                                        |
| Catálogo de componentes + importação CSV/XLSX                       | ✅                     | `/catalog`, `/settings/catalog-import` (tenant-admin)                                                                                                                                                                                                                                                     |
| Documentos/manuais (upload, OCR, indexação)                         | ❌                     | Tabelas `knowledge_*` existem no banco, mas **não há UI nem fluxo de upload** no frontend                                                                                                                                                                                                                 |
| Relatórios (PDF/DXF/BOM/Excel)                                      | ✅                     | `/projects/$id/export` (PDF jsPDF + DXF), BOM com exportação Excel (`lib/reports/xlsx-export.ts`, saneamento de fórmulas)                                                                                                                                                                                                                     |
| Assinaturas/billing (Stripe + Mercado Pago)                         | ✅                     | Checkout, webhooks assinados idempotentes (rota do servidor); **UI com fallback demo**                                                                                                                                                                                                                    |
| Equipe/convites/roles                                               | ✅                     | `settings.team.tsx` + RPC `accept_invite`; **fallback demo** quando backend indisponível                                                                                                                                                                                                                  |
| Administração de plataforma                                         | 🟡                     | Sem rota `/admin`; gating por `is_platform_admin()` em billing, rate limits, catálogo, blog                                                                                                                                                                                                               |
| MCP server para agentes (OAuth 2.1)                                 | ❌ (removido)          | Removido em 2026-11-19 junto com o Lovable (`@lovable.dev/mcp-js`, rotas `/mcp`, consent e well-known)                                                                                                                                                                                                      |
| Termos de uso / privacidade | ✅ | `/termos` e `/privacidade` (`public/legal/*.md`), aceite versionado no cadastro; falta revisão jurídica final |

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
- **Catálogo (distribuidor):** `MOUSER_API_KEY` (gratuita; só servidor)
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
├── vite.config.ts             ← TanStack Start + Nitro (Vercel) + vendor-chunks por rota (sem dependências Lovable)
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
│       (vazio — Edge Functions órfãs removidas em 2026-11-19; webhooks e IA rodam como rotas/server functions)
└── src/
    ├── routes/                ← roteamento file-based (42 rotas + __root)
    │   ├── __root.tsx         ← shell, AuthGate, chrome (sidebar/topbar), 404/erro
    │   ├── index.tsx, login.tsx, signup.tsx, forgot-password.tsx, reset-password.tsx
    │   ├── auth.callback.tsx, onboarding.tsx, invite.$token.tsx
    │   ├── dashboard.tsx, projects.tsx, projects.$projectId.{bom,export}.tsx
    │   ├── workspace.tsx      ← shell dos editores (?projectId=)
    │   ├── ai.tsx, chat.tsx, analytics.tsx, catalog.tsx, clients*.tsx, realtime.tsx
    │   ├── settings.tsx + settings.*.tsx (14 subrotas)
    │   │   (servidor MCP/Lovable removido em 2026-11-19: mcp.ts, [.]lovable.oauth.consent.tsx, [.well-known]/)
    │   └── api/public/        ← iot.ingest.ts, stripe.webhook.ts, mp.webhook.ts
    ├── components/
    │   ├── ui/                ← primitivas shadcn/Radix
    │   ├── canvases/          ← webgl-canvas (unifilar/multifilar), ladder-canvas, plc-canvas,
    │   │                        scada-canvas, sim-canvas, konva-canvas (editor HMI), ladder/{rung-grid,ladder-cell}
    │   ├── compact-studio/    ← FB Electric Studio (FBD/LAD, páginas, ST)
    │   ├── scada/, hmi/       ← faceplate, alarmes ISA-18.2, editor HMI de processo
    │   ├── industrial-workspace.tsx, mode-tabs, sidebars, right-panel, bottom-panel
    │   └── canvas-ai-chat.tsx, ai-patch-preview.tsx, onboarding-tour.tsx …
    ├── hooks/                 ← use-auth, use-active-tenant, use-collab, use-tenant-setting,
    │                            use-arduino-serial, use-notifications …
    ├── lib/                   ← domínio + server functions
    │   ├── diagram/           ← schema (Zod), store (comandos/undo), render/{stage,symbols,ports},
    │   │                        multifilar, export-dxf, ai.functions
    │   ├── ladder/            ← types, scan-core (runtime puro), compiler (IL/ST), importer,
    │   │                        validator, verify-estop, definitions, from-ai-spec
    │   ├── fbd/               ← engine/ (motor IEC usado pelo FB Electric Studio: model, datatypes,
    │   │                        registry, iec-library, compiler, runtime, simulation)
    │   ├── plc/               ← types, store, rack-validation, plcopen-export
    │   ├── simulation/        ← scada-engine, scada-worker (sandbox), script-sandbox, worker-guards
    │   ├── security/          ← rate-limiter.server, ai-rate-limit-*, url-safety, password-policy, safe-xlsx
    │   ├── ai/knowledge/      ← mapa de conhecimento da IA por editor (docs/IA_EDITORES.md)
    │   ├── *.functions.ts     ← server functions (projetos, BOM, catálogo, clientes, IA, billing,
    │   │                        IoT, digital twin, diagnósticos, Modbus/OPC-UA, tenant settings…)
    │   └── electrical-calc.ts, norm-validator.ts, pdf-export.ts, dxf-export.ts,
    │       project-store.ts, editor/store.ts, use-project-persistence.ts, plans.ts …
    ├── integrations/supabase/ ← client.ts (browser), client.server.ts (service role),
    │                            types.ts (tipos gerados), env.ts, auth-attacher.ts,
    │                            auth-middleware.ts, tenant-admin-middleware.ts,
    │                            ai-rate-limit-middleware.ts, previewAuthStorage.ts
    ├── __tests__/             ← ~195 arquivos / ~1 750 testes (Vitest) — `bun run test`
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
- **FB Electric Studio** (substitui o editor FBD legado) — `compact-studio/*` + `lib/fbd/engine`: páginas FBD/LAD, biblioteca IEC completa, compilação com grafo de dependências → AST → IR tipado, EN/ENO, simulação de passo fixo, geração de ST, "Gerar do unifilar". ✅
- **PLC** — `plc-canvas.tsx` (839 linhas): hardware (catálogo S7-like), rack com validação, variáveis (I/Q/M/DB), blocos (OB/FC/FB/DB) com Monaco, compilação de Ladder/FBD → ST, export PLCopen XML. **Sem download/execução em PLC físico.** ✅ (camada de projeto)
- **SCADA/HMI** — `scada-canvas.tsx` (Konva): widgets HMI, dialog de bind de tags, banner de alarmes, editor de scripts Monaco executados em **Web Worker sandbox** (`scada-worker.ts`, com testes). Alarmes com estados ISA-18.2 e persistência (`alarm_configs`, `alarm_history`). ✅
- **Simulação** — `sim-canvas.tsx` + `lib/simulation/scada-engine.ts` (alarmes ISA-18.2 por regras sobre tags) + **planta simulada 8M+2EX** (`lib/simulation/plant-engine.ts` puro/determinístico com rampa, térmica, proteções, histerese e E-STOP + `plant-store.ts` efêmero + `plant-sim-panel.tsx` com selo SIMULAÇÃO; tags derivadas alimentam alarmes e gráficos do Sim). Motores derivam In/Istart de `electrical-calc.ts`; **não atesta operação (Termos §10)**. O modo reúne quatro painéis: planta, **cenários de teste** (`test-scenarios.functions.ts` — engine headless determinístico, presets por tipo, histórico persistido em `test_scenario_runs`), **ponte Unifilar→Ladder** (`unifilar-ladder-bridge.ts` — análise pura, geração de ST/IL importável, mapeamentos em `unifilar_ladder_mapping`) e **estudos elétricos** (`electrical-sim.functions.ts` — resultados em `electrical_simulation_results`). ✅ (lógica da planta; potência elétrica via estudos dedicados)
- **Twin** — ❌ removido do produto (módulo, rota, bucket e tabelas de hotspots).
- **Alarmes** — `alarms-canvas.tsx` + server functions de config/histórico. ✅

### 5.6 Inteligência artificial ✅ (com lacunas)

- **Arquiteto** `/ai` — `ai-architect.functions.ts`: gera projeto elétrico completo a partir de prompt (Zod, ≤ 32 000 chars), RAG sobre `normative_chunks`, tool-call forçada com `AiDiagramPatchSchema`, loop de verificação (máx. 2 correções, inclui verificação de E-STOP), consumo de créditos (`consume_ai_credits`) e rate limits (`requireAiQuota` + `requireBurstLimit`). Aplica resultado nos stores e navega ao workspace.
- **Chat** `/chat` — `ai-chat.functions.ts`: streaming SSE, conversas/mensagens persistidas (`ai_conversations`, `ai_messages`), histórico até 40 mensagens enviado sem sanitização de prompt injection (RISK-010).
- **Canvas** — `canvas-ai-chat.tsx` + `diagram/ai.functions.ts` (`generateDiagramPatch`): patch validado por Zod e aplicado via comandos, com preview (`ai-patch-preview.tsx`). Timeout 60 s e retries. **Upload de PDF/CSV na IA é simulação** (mock com progresso falso).
- **Governança**: créditos por operação (`ai_credit_costs`), quota mensal, burst limit (Upstash ou memória), eventos `ai_status_events`/`ai_usage_events`.
- Chave DeepSeek **somente** no servidor. A Edge Function `ai-industrial-architect` **não é chamada pelo frontend** (RISK-009).

### 5.7 Cálculos elétricos ✅

`lib/electrical-calc.ts` (puro, testado): corrente nominal e de partida de motor, dimensionamento de condutor (curva IEC simplificada + fator 1,25), seleção de disjuntor, demanda/aparente/trafo padrão, queda de tensão. `lib/norm-validator.ts` aplica regras NBR 5410/14039, NR-10/12, IEC, ISA-18.2.

`lib/electrical-sim.ts` (novo, puro/determinístico, 26 testes): `shortCircuitIEC60909` (I''k3, I''k1, pico ip, fator c, X/R típico, k0 por grupo vetorial), `checkBreakingCapacity` (ruptura IEC 60947), `selectivityIEC60947` (total/parcial/nenhuma), `defaultInstantaneous` (curvas MCB B/C/D/K), `arcFlashIEEE1584` + `ppeFromEnergy` (NFPA 70E), `motorStartThermal` (I²t e ΔT normalizados por τ=120 s), `voltageDropCircuit` (limite NBR 5410). Consumido pelo painel **Estudos elétricos** (`electrical-study-panel.tsx`) que persiste em `electrical_simulation_results`.

`lib/power-quality.ts` (THD, TDD e limites IEEE 519-2014, fator K IEEE C57.110, neutro por triplens) e `lib/grounding.ts` (haste Dwight, paralelismo IEEE 142 Tab. 4-5, verificação TT NBR 5410). Tela dedicada `/calculations` (motor/ramal, queda de tensão, curto IEC 60909, demanda/trafo, harmônicas, aterramento) — 100 % no navegador.

### 5.8 Catálogo, documentos e relatórios

- `/catalog` (leitura, dados do banco), `/settings/catalog-import` (CSV/XLSX, limitado a 2000 linhas, `requireTenantAdmin`). 🟡 (pode estar vazio — "aguardando cadastro pelo administrador")
- **Documentos/manuais:** ❌ sem UI; tabelas `knowledge_documents`/`knowledge_chunks`/`files`/`file_versions` existem no banco mas sem consumidores no frontend (RISK-033 relacionado).
- **Relatórios:** `/projects/$projectId/export` (PDF com memorial via jsPDF + DXF) e `/projects/$projectId/bom`. Sem Excel de relatórios.

### 5.9 Realtime/IoT — `/realtime` ✅ (plano Pro)

Devices, leituras, alertas, ack, fila de comandos (`iot_command_log` com watchdog/fail-safe), criação de API keys (armazenadas como hash SHA-256 + prefixo), inspeção de endpoint público `/api/public/iot/ingest` (Bearer API key, Zod, rate limit Upstash, RPC `ingest_iot_reading`).

### 5.10 Gestão, billing e administração

- `/clients` (CRM por tenant), `/settings/team` (membros, convites, roles, matriz de permissões — RPC `accept_invite`), `/settings/notifications` (persistido em `tenant_settings`), `/settings/integrations` (credenciais padrão Modbus/OPC-UA/MQTT em `tenant_settings`), `/settings/protocols` (teste Modbus TCP real com SSRF guard; OPC-UA simulada), `/settings/appearance` (tema real; densidade/idioma sem consumidores).
- `/settings/billing` (admin de plataforma): `getBillingOverview`, `createStripeCheckout`, `createMpPreference`, `cancelSubscription`, `changePlanManual` + audit log; **fallback demo** quando backend indisponível.
- `/analytics`: uso de IA real; métricas industriais são **placeholder** (`Math.random()`).
- Webhooks: `/api/public/stripe/webhook` (HMAC timing-safe + idempotência via `stripe_webhook_events`), `/api/public/mp/webhook` (segredo compartilhado timing-safe + idempotência + reconsulta no MP).
- Servidor MCP (`/mcp`): ❌ removido junto com o Lovable em 2026-11-19.

---

## 6. Banco de dados

### 6.1 Visão geral

- **66 tabelas** com RLS habilitado e **169 policies** — conforme dump literal do banco vivo consolidado em `supabase/migrations/20260906072900_baseline_rls_consolidation.sql` (contagem verificada em 2026-10-12; `twin_hotspots` ausente no dump — coberta pela migration `20261012090000`).
- **Push 2026-10-14 (projeto do app `rvaaxvdimggztjxoktvy`): 56/56 migrations aplicadas, 0 pendentes** (`supabase db push --include-all`; link trocado de `hcjkwqyxqxnbqikwltvc`, que recebeu 16 parciais e foi abandonado como alvo). Para o push passar, 20+ migrations foram tornadas replay-safe (guards `IF EXISTS` + `EXCEPTION WHEN undefined_table/column/function`; baseline de 401 statements transformado por script com as 168 policies byte-idênticas verificadas). Verificado no banco: 7 tabelas novas com RLS ligado; trigger hardcoded de admin removido (`pg_trigger` = 0); `platform_admins` vazio.
- **Atualização 2026-11-16**: a ressalva antiga ("banco sem tabelas centrais") está **superada** — `20261014201000_core_tables_ddl` criou `profiles`, `projects`, `tenants`, `tenant_memberships`, `plan_limits`, `diagrams` etc. Auditoria ao vivo: todas as tabelas `public` com RLS e ao menos uma policy; 0 funções `SECURITY DEFINER` executáveis por `anon`; nenhuma view; único bucket (`client-logos`) privado.
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
- **Gêmeo digital:** ❌ removido (`drop_digital_twin_module`).
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
- **Testes:** Vitest (~195 arquivos / ~1 750 testes) cobrindo domínio puro (Ladder/FBD/cálculos/multifilar/cabos NBR 5410/reparo/SSRF/sandbox/SCADA/IA) + firmware (`bun run test:firmware`).
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
13. Executar `bun run lint`, `bun run test` e `bun run build` após alterações autorizadas (e `bun run typecheck`).
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
| RISK-005 | P2         | Mitigado       | RLS                  | `invoices`, `subscriptions`             | Alta       | Pentest 2026-11-19: policies SELECT vivas de `invoices`/`subscriptions` exigem `role IN (admin,owner)` — verificado em `pg_policies` |
| RISK-006 | P2         | Mitigado       | Autenticação         | Login/cadastro/reset                    | Alta       | 2026-11-19: `checkAuthRateLimit` (server fn, bucket `auth` 5/15min por IP) chamado antes de login/signup/forgot; fail-open com fallback local. Falta reset-password e confirmar limites nativos do Supabase |
| RISK-007 | P2         | Mitigado       | API                  | Rate limiting global                    | Alta       | Upstash com falha → limite LOCAL por instância para todos (2026-11-19); custo da IA segue limitado pelos créditos no banco |
| RISK-008 | P2         | Confirmado     | Segredos             | Bundle do cliente (`env.ts`)            | Normal     | Remover fallbacks; build sem vars continua correto                                                                      |
| RISK-009 | P2         | Mitigado       | API                  | Edge Function `ai-industrial-architect` | Normal     | Pentest 2026-11-19: `list_edge_functions`=[] (não deployada); diretório órfão e deploy no CI removidos                   |
| RISK-010 | P2         | Mitigado       | IA                   | `streamChat` (DeepSeek)                 | Normal     | Sanitização aplicada no histórico via `sanitizePromptText` (máx 2000 chars/msg)                                         |
| RISK-011 | P2         | Suspeito       | Frontend             | Sandbox de scripts SCADA                | Normal     | Tentar contornar o pre-scan regex em ambiente de teste isolado                                                          |
| RISK-012 | P2         | Mitigado       | Frontend             | `/catalog` (`datasheet_url`)            | Normal     | `toSafeExternalHref` na importação e na exibição (2026-11-16) |
| RISK-013 | P2         | Mitigado       | Pagamentos           | Webhooks Stripe (duplicados)            | Alta       | Pentest 2026-11-19: edge órfã não deployada; diretório + job de CI `--no-verify-jwt` removidos; só a rota de servidor (idempotente) permanece |
| RISK-014 | P2         | Confirmado     | Banco de dados       | Cadeia de migrations                    | Normal     | Replay limpo em ambiente efêmero; reconciliar drift                                                                     |
| RISK-015 | P2         | Mitigado       | Banco de dados       | RPCs `SECURITY DEFINER`                 | Alta       | Pentest 2026-11-19: os 11 corpos lidos de `pg_proc` derivam tenant de `auth.uid()`/conferem `tenant_memberships.role`; `search_path` fixado; sem alvo do cliente (ver `docs/SECURITY_PENTEST_2026-11-19.md`) |
| RISK-016 | P2         | N/A            | RLS                  | Bucket `twin-models`                    | Normal     | Módulo digital-twin removido (`drop_digital_twin_module`); bucket/fluxo não existem mais                                 |
| RISK-017 | P2         | Mitigado (parcial) | Autenticação         | MFA/sessões                             | Normal     | TOTP opcional + gate no AuthGate + recusa aal1 no `requireSupabaseAuth` (2026-11-16); falta política RLS aal2 (MCP/PostgREST) e lista de sessões |
| RISK-018 | P2         | Não verificado | Backup               | Continuidade (Supabase/Vercel)          | Alta       | Confirmar plano/retention e executar restore de teste                                                                   |
| RISK-019 | P2         | N/A            | API                  | Servidor MCP                            | Normal     | Servidor MCP (Lovable) removido em 2026-11-19 — rotas `/mcp`, consent e well-known e `@lovable.dev/mcp-js` eliminados    |
| RISK-020 | P3         | Mitigado       | Frontend             | `svg-sanitizer.ts`, `chart.tsx`         | Baixa      | `svg-sanitizer.ts` e `chart.tsx` removidos; único `dangerouslySetInnerHTML` restante (`__root.tsx:154`) é script estático de tema, sem dado de usuário/servidor |
| RISK-021 | P3         | Mitigado       | Upload               | Uploads GLB/CSV                         | Baixa      | Upload GLB removido com o twin; CSV com limite de tamanho/linhas e saneamento (2026-11-16) |
| RISK-022 | P3         | Confirmado (bloqueado) | Frontend       | Proteção de rotas                       | Baixa      | `beforeLoad` no servidor exige a sessão em cookie; hoje está em localStorage (RISK-004) — depende do workstream de cookie httpOnly (P-03) |
| RISK-023 | P3         | N/A            | Frontend             | Consent OAuth MCP                       | Baixa      | Rota de consentimento removida com o servidor MCP/Lovable (2026-11-19); `isSafeOAuthRedirect` permanece em `url-safety.ts` |
| RISK-024 | P3         | Mitigado       | Autenticação         | Política de senha                       | Baixa      | `password-policy.ts` única em cadastro/reset/troca (2026-11-16) |
| RISK-025 | P3         | Mitigado       | Infraestrutura       | CI/CD, scripts, `.env.example`          | Normal     | `.github/workflows/ci.yml` versionado, `bun run typecheck` existe e `.env.example` reconciliado com os nomes reais (verificado 2026-11-19) |
| RISK-026 | P3         | Não verificado | Autenticação         | Supabase Auth (e-mail/OAuth)            | Normal     | Conferir dashboard: exigência de confirmação e URIs de redirect                                                         |
| RISK-027 | P3         | Mitigado       | Outro                | Landing (termos/privacidade)            | Normal     | Publicadas em `/privacidade` e `/termos`; pendente revisão jurídica + aceite versionado                                 |
| RISK-028 | P3         | Confirmado     | Outro                | Dashboard/analytics/billing/team        | Baixa      | Isolar modo demo; sinalizar dados sintéticos na UI                                                                      |
| RISK-029 | P3         | Confirmado     | Frontend             | localStorage                            | Baixa      | Reduzir espelhos operacionais; validar URLs/keys coladas                                                                |
| RISK-030 | P3         | Mitigado       | API                  | CORS dos endpoints públicos             | Baixa      | `/api/public/iot/ingest` usa allowlist de origem (`PUBLIC_APP_URL`); Edge Functions com CORS `*` removidas (pentest 2026-11-19) |
| RISK-031 | P3         | Confirmado     | RLS                  | `tenant_memberships` (SELECT)           | Baixa      | Restringir colunas/visibilidade; teste com membro comum                                                                 |
| RISK-032 | P3         | Mitigado (parcial) | Auditoria        | Observabilidade                         | Normal     | `lib/error-capture.ts` envia erros ao Sentry (dados sensíveis mascarados) quando `SENTRY_DSN` está configurado; falta alerta de custo de IA |
| RISK-033 | P3         | N/A (hoje)     | Upload               | Antivírus/quarentena                    | Baixa      | Upload GLB removido com o twin; só resta parse client-side de CSV/XLSX (saneado). Reavaliar quando houver upload de documentos |
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
- **Dependências:** `previewAuthStorage` (agora só `localStorage` — broker Lovable removido em 2026-11-19), Monaco, Web Workers
- **Risco da correção:** Alto (quebra preview/SSR se mal implementado — exige testes em todos os fluxos de auth)
- **Validação necessária:** Após mudança, XSS sintético não consegue ler token; login/logout/OAuth/refresh funcionam
- **Referências:** `client.ts:17-23`, `previewAuthStorage.ts`, `vercel.json:5-34`

## RISK-005 — Policies de `invoices`/`subscriptions` permitem leitura a qualquer membro do tenant

- **Severidade:** P2
- **Status:** Mitigado — Pentest 2026-11-19: policies SELECT vivas de `invoices`/`subscriptions` exigem `role IN (admin,owner)` — verificado em `pg_policies` *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — 2026-11-19: `checkAuthRateLimit` (server fn, bucket `auth` 5/15min por IP) chamado antes de login/signup/forgot; fail-open com fallback local. Falta reset-password e confirmar limites nativos do Supabase *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Dependências:** `env.ts`, `client.ts`, deploy Vercel
- **Risco da correção:** Baixo
- **Validação necessária:** Build sem env vars falha com mensagem clara; build com env vars funciona
- **Referências:** `src/integrations/supabase/env.ts:7-9,24-34`

## RISK-009 — Edge Function de IA órfã, com limites mais fracos que o caminho real

- **Severidade:** P2
- **Status:** Mitigado — Pentest 2026-11-19: `list_edge_functions`=[] (não deployada); diretório órfão e deploy no CI removidos *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — `toSafeExternalHref` na importação e na exibição (2026-11-16) *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — Pentest 2026-11-19: edge órfã não deployada; diretório + job de CI `--no-verify-jwt` removidos; só a rota de servidor (idempotente) permanece *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — Pentest 2026-11-19: os 11 corpos lidos de `pg_proc` derivam tenant de `auth.uid()`/conferem `tenant_memberships.role`; `search_path` fixado; sem alvo do cliente (ver `docs/SECURITY_PENTEST_2026-11-19.md`) *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** N/A — Módulo digital-twin removido (`drop_digital_twin_module`); bucket/fluxo não existem mais *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado (parcial) — TOTP opcional + gate no AuthGate + recusa aal1 no `requireSupabaseAuth` (2026-11-16); falta política RLS aal2 (MCP/PostgREST) e lista de sessões *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** N/A — Servidor MCP (Lovable) removido em 2026-11-19 — rotas `/mcp`, consent e well-known e `@lovable.dev/mcp-js` eliminados *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — `svg-sanitizer.ts` e `chart.tsx` removidos; único `dangerouslySetInnerHTML` restante (`__root.tsx:154`) é script estático de tema, sem dado de usuário/servidor *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — Upload GLB removido com o twin; CSV com limite de tamanho/linhas e saneamento (2026-11-16) *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Localização:** `src/routes/__root.tsx:24-30,120-194` (`AuthGate`); não há mais `beforeLoad` de auth (a rota de consentimento MCP que o usava foi removida em 2026-11-19)
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
- **Status:** N/A — Rota de consentimento removida com o servidor MCP/Lovable (2026-11-19); `isSafeOAuthRedirect` permanece em `url-safety.ts` *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — `password-policy.ts` única em cadastro/reset/troca (2026-11-16) *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — `.github/workflows/ci.yml` versionado, `bun run typecheck` existe e `.env.example` reconciliado com os nomes reais (verificado 2026-11-19) *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado — `/api/public/iot/ingest` usa allowlist de origem (`PUBLIC_APP_URL`); Edge Functions com CORS `*` removidas (pentest 2026-11-19) *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** Mitigado (parcial) — `lib/error-capture.ts` envia erros ao Sentry (dados sensíveis mascarados) quando `SENTRY_DSN` está configurado; falta alerta de custo de IA *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Status:** N/A (hoje) — Upload GLB removido com o twin; só resta parse client-side de CSV/XLSX (saneado). Reavaliar quando houver upload de documentos *(sincronizado com a matriz §10.1; texto abaixo descreve o achado original)*
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
- **Por status:** o resumo abaixo foi **superado** pelo pentest autorizado de 2026-11-19 (`docs/SECURITY_PENTEST_2026-11-19.md`), que verificou o banco vivo. Ver a matriz §10.1 para o status atual por risco.
- **Pentest 2026-11-19 — verificado AO VIVO (introspecção read-only do banco `rvaaxvdimggztjxoktvy`):**
  1. Banco **tem** as tabelas centrais (`profiles`, `projects`, `tenants`, `tenant_memberships`...); 0 tabelas `public` sem RLS; 0 com RLS sem policy (deny-by-default confirmado). A antiga ressalva "banco sem tabelas centrais" está **obsoleta** (ver §6.1).
  2. RISK-015: os 11 corpos `SECURITY DEFINER` derivam tenant de `auth.uid()`/conferem `tenant_memberships.role`; `search_path` fixado — seguros.
  3. RISK-003 (escalação `owner`) e RISK-005 (billing): policies vivas owner/admin-gated — corrigidas e verificadas.
  4. Auto-upgrade de plano bloqueado: `authenticated` só tem `UPDATE` em `tenants(name,settings,updated_at)`. RISK-002: `platform_admins` sem policy de escrita, trigger ausente.
- **Itens de código ainda abertos:** RISK-004/P-03 (sessão em localStorage → cookie httpOnly; re-arquitetura de auth, exige validação de login/OAuth nos dispositivos) — **desbloqueia** RISK-022 (guard `beforeLoad`); RISK-014 (DDL reproduzível); RISK-011 (sandbox SCADA); RISK-032 (error tracking externo).
- **Itens só no painel (fora do repo):** RISK-026 / leaked-password protection (P-02), RISK-018 backups/RPO-RTO (P-06), política de senha e MFA/aal2 no Supabase Auth.
- **Riscos de comprometimento de credenciais:** RISK-004 (token em localStorage + CSP com unsafe-eval), RISK-008 (fallback anon-key hardcoded — chave pública por design, aceito com ressalva).
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

## 11. SCADA SUPERVISÓRIO INDUSTRIAL — Diretrizes e Arquitetura

O módulo SCADA SUPERVISÓRIO é um subsistema de primeira classe integrado à plataforma, em conformidade com as normas ISA-101, ISA-18.2, IEC 62443 e IEC 61131-3.

### 11.1 Princípios Inegociáveis

1. **Single Source of Truth**: Equipamentos visíveis no SCADA (`CanonicalEquipment`) compartilham identidade única com o Unifilar, Multifilar, Ladder e Digital Twin. Não criar entidades duplicadas ou desconectadas.
2. **Fronteiras de Segurança Operacional e os 4 Níveis de Parada (NR-10 / NR-12)**:
   - Um botão de software em navegador web **NUNCA** substitui um circuito físico de emergência (NR-10, NR-12, ISO 13849-1, IEC 62061). O sistema diferencia rigidamente via `SafetyActionLevel`:
     a. `SIMULATION_HALT`: Parada exclusiva da simulação local/virtual. Bloqueio mandatório de escrita em campo (`isPhysicalControlAllowed: false`) e banner permanente NR-10/NR-12 na UI.
     b. `OPERATIONAL_STOP_REQUEST`: Requisição de parada operacional do processo industrial via CLP (Cat. 0/1 IEC 60204-1).
     c. `PHYSICAL_EMERGENCY_STOP`: Circuito físico cabeado de segurança (cogumelo vermelho com trava e contatos NF positivos).
     d. `VALIDATED_SAFETY_FUNCTION`: Função de segurança instrumentada certificada SIL 2/3 / PL d/e com relé de monitoramento.
   - O comando de simulação gera o alarme auditado `ETE.SAFETY.ESTOP` com flag `isSimulated: true` e ação auditada `SIMULATION_HALT`. O rearme é manual e intencional.
3. **Multi-tenancy e Isolamento de Contexto (`resolveScadaProjectContext`)**:
   - A rota `/scada` e seus sub-painéis dependem obrigatoriamente do search param `projectId`.
   - A autorização é validada no servidor via server function `resolveScadaProjectContext` verificando `tenant_memberships` e RLS do Supabase. Bloqueio 403 HTTP imediato e isolamento/limpeza completa de store (`clearProjectContext`) caso o usuário não pertença à organização proprietária da planta.
   - Proibido acoplar fixtures estáticas na inicialização da aplicação: plantas de demonstração usam semente explícita (`demo-ete-seed.ts`) com ID isolado (`00000000-0000-4000-8000-000000000001`).
4. **Identificação Mandatória de Simulação**:
   - Sempre que o sistema estiver operando com dados virtuais/simulados, é mandatório exibir o banner amarelo/âmbar: `MODO SIMULAÇÃO — DADOS ILUSTRATIVOS, NÃO ORIGINADOS DE EQUIPAMENTO FÍSICO.`
5. **Isolamento de Persistência**:
   - A telemetria de alta frequência (100 ms) roda no `useScadaStore` de forma desacoplada do documento do projeto para garantir zero poluição de histórico e evitar requisições repetitivas de autosave ao Supabase.
6. **Preservação de Código e Ferramental**:
   - O editor de telas Konva 2D e o script sandbox com Monaco Editor são integrados na Visão 10 ("Editor HMI"), preservando os componentes legados sem descarte.

---

## 12. UNIFILAR & CONECTIVIDADE ELÉTRICA CANÔNICA — Diretrizes e Arquitetura

O módulo de Diagrama Unifilar e Conectividade Elétrica é o núcleo de distribuição de potência da plataforma, em estrita conformidade com a ABNT NBR 5410, ABNT NBR 14039, IEC 60947, IEC 60617 e IEC 60204-1.

### 12.1 Princípios Inegociáveis

1. **Topologia Elétrica vs Renderização Geométrica**:
   - O diagrama unifilar é primariamente um **grafo topológico elétrico determinístico** (`CanonicalEquipment`, `CanonicalTerminal`, `ElectricalConnection`, `CanonicalNet`).
   - O canvas WebGL/Pixi é apenas a projeção visual e geométrica desse grafo. Nenhuma regra de continuidade, seletividade ou cálculo elétrico depende de suposições visuais ou distâncias de pixels no canvas.
2. **Proibição de Equipamentos Desconectados e Circuitos Fantasmas na Geração por IA**:
   - Todo fluxo de geração de diagramas por inteligência artificial aciona obrigatoriamente o pipeline de reparação determinística (`repairDiagramConnections`).
   - Disjuntores gerais (QGBT) conectam-se ao barramento principal; disjuntores de ramal derivam do barramento; ramais de motores encadeiam ordenadamente: Disjuntor ($2/T1$) $\to$ Contator ($1/L1$) $\to$ Relé Térmico ($1/L1$) $\to$ Motor ($U1$).
   - Ramais com Inversor de Frequência conectam: Disjuntor $\to$ VFD ($R/S/T \to U/V/W$) $\to$ Motor ($U1$).
   - Fontes de alimentação conectam: Disjuntor $\to$ PSU ($L/N \to +24V/0V$).
3. **Terminais Industriais Padronizados**:
   - Proibido o uso de portas genéricas fictícias (`:in`, `:out`, `:port1`). Toda conexão física é mapeada para códigos de terminal reais da IEC 60947 / IEC 60617 / NBR 5410 (`1/L1`, `2/T1`, `A1`, `A2`, `13-14`, `95-96`, `U1`, `PE`).
   - A função `resolveTerminalCode` realiza o mapeamento determinístico entre as âncoras geométricas (`T`, `B`, `L`, `R`) e os terminais normalizados do equipamento.
4. **Isolamento de Netlists em Cruzamentos Visuais**:
   - Cruzamentos de linhas condutoras no canvas em ângulo reto ($+$ ou $\times$) sem ponto de derivação explícito pertencem a netlists totalmente independentes. Não há condução de potencial nem curto-circuito virtual entre condutores que apenas se sobrepõem na tela.
5. **Rastreabilidade e Alimentação Contínua da Fonte à Carga (`CircuitPath`)**:
   - Todo consumidor elétrico ativo deve possuir um caminho ininterrupto e protegido contra sobrecorrente desde uma fonte de alimentação válida (rede, gerador, transformador ou alimentador raiz QGBT).
   - O validador de grafos (`validateElectricalTopology`) emite o `ConnectivityReport` estruturado com o status do projeto (`VALID`, `WARNING`, `INVALID`).
6. **Equivalência e Sincronização Unifilar $\leftrightarrow$ Multifilar**:
   - A conversão de um circuito unifilar para multifilar desdobra as fases em condutores individuais de acordo com o código de cores da NBR 5410 (Preto/Cinza/Vermelho para fases, Azul Claro para Neutro, Verde/Amarelo para PE) e gera automaticamente réguas de bornes padronizadas (`-X1`) na fronteira entre painel e campo.


---

## 13. CCM SUPERVISÓRIO (Comando de Motores) — Diretrizes

1. **Fonte única**: o CCM não cria motores. Cada `motor` da folha unifilar vira um acionamento; a cadeia disjuntor → contator → relé térmico/inversor é descoberta por **topologia de arestas `power`** (`discoverFeederChain`), parando em barramentos/fontes.
2. **Integração bidirecional com o unifilar**: comandos do CCM escrevem `deviceStates` do editor (contator fecha ao ligar, disjuntor abre em curto); manobras feitas no unifilar (ex.: abrir `Q0`) desenergizam os ramais e bloqueiam partidas (`startPermissive`).
3. **Estados visuais (ISA-101/18.2)**: cinza = parado; verde = partindo/ligado; **vermelho piscando** = falha não reconhecida; vermelho fixo = reconhecida até o rearme. Com `prefers-reduced-motion` o piscar vira hachura.
4. **Rearme** exige causa removida, relé térmico resfriado (θ ≤ 0,7) e enrolamento < 130 °C, e **nunca religa** o motor. E-STOP derruba todos os comandos; após o rearme não há religamento automático.
5. **Segurança**: `MCC_FIELD_WRITE_ENABLED = false`. Tudo é `SIMULATION_HALT`; o banner de simulação é obrigatório. Qualquer escrita em CLP real exige o projeto de autorização da regra 21.
6. **Planta de demonstração** (`mcc-demo-plant.ts`) só é carregada por ação explícita, com confirmação se houver diagrama, e usa ID isolado.

### Correções de engenharia (2026-11-15)

- `electrical-sim.ts`: corrente de pico IEC 60909 usava `√3` (superestimava `ip` em 22,5 %); agora `ip = κ·√2·I″k`.
- `electrical-calc.ts`: `calcDemand` ignorava rendimento (subdimensionava trafo/alimentador ~8 %); `motorNominalCurrent` não gera mais `Infinity/NaN` com entradas inválidas.
- `diagram/electrical-simulation.ts`: energização percorria arestas de **sinal/tubulação** (contornando disjuntor aberto) e tratava rótulos como "Alimentador"/tags "TR-…" de cargas como fonte; BFS agora O(V+E).
- `plant-engine.ts`: falhas de motor nunca rearmavam; specs customizadas eram ignoradas no passo; tag `${id}_TEMP` declarada mas não emitida. `plant-definition.ts`: aliases só copiavam valores verdadeiros (RUN=true obsoleto) e `VIBRACAO_M03` recebia rpm.
- `importer/*`: mensagens de limite dependiam da localidade do servidor; fixadas em pt-BR.

### Unifilar, IA e eletric Studio (2026-11-15, 2ª rodada)

- **Motor de reparo** (`connection-repair-engine.ts`): só folha unifilar e arestas `power` contam como alimentação; pareamento pelo vizinho mais próximo dentro de `MAX_PAIRING_DISTANCE` respeitando o sentido do fluxo — sem candidato plausível vira pendência em `remainingIssues` (nunca liga ramal distante). Contator prefere relé térmico > inversor/soft > motor. Disjuntor geral reconhecido pela tag `Q0`; trafo direto no barramento quando não há geral. `synthesizeDiagramDocFromProject` gera params válidos no schema.
- **Patches da IA** (`ai-patch-sanitizer.ts`): obrigatório antes de aplicar — renomeia IDs colidentes, remove ligações em cascata, descarta arestas pendentes/laços/duplicadas e troca de tipo via update. Aplicado no servidor (`generateDiagramPatch`, que também valida o `doc` do cliente com Zod) e no `applyAiPatch` do store.
- **Prompt da IA**: ramal DOL/estrela-triângulo exige `thermal_relay`; VFD/soft dispensam; tag `Q0` no disjuntor geral.
- **"CORRIGIR COM IA"** usa `sendRef` (função do render atual) com `forcePatch` — não use closures do primeiro render em listeners globais.
- **eletric Studio ← unifilar** (`compact-studio/integration/unifilar-motor-program.ts`, botão "Gerar do unifilar"): página `uf-motors` idempotente com selo RS (reset dominante), contatos NF fail-safe (parada, térmico 95-96, emergência). Não reaproveita endereços/símbolos do usuário; acusa falta de I/O no hardware.
- **Blocos do Studio corrigidos**: `HOUR_COUNTER` (alarme no 1º scan; R não apagava após o 1º intervalo), `RANDOM_GEN` (sem atraso na ligação), `PI_CONTROLLER` (bumpless Manual→Auto; reset fora de `minOut`). Motor de execução: `dt` inválido não corrompe temporizadores e o log de dados não é mais copiado a cada scan.

### Demonstração, segurança e idioma (2026-11-15, 3ª rodada)

- **Login de demonstração**: botão "Entrar em modo demonstração" na tela de login existe **só no servidor de desenvolvimento** (`import.meta.env.DEV`; ausente do build de produção — verificado). Abre `/workspace?projectId=00000000-0000-4000-8000-0000000000cc`, projeto local com a planta CCM que **não lê nem grava** no servidor (`isDemoProject` em `use-project-persistence.ts`). Use-o para testes E2E com Playwright (`npx vite dev --host 127.0.0.1` — o container não tem IPv6).
- **Deploy**: todo push na `main` dispara `deploy-vercel --prod` no CI. Migrations NÃO são aplicadas pelo CI.
- **Sem identidade fixa no código**: desvios de privilégio por e-mail foram removidos (middlewares de IA, billing, bootstrap SQL). Migration `20261115120000_remove_email_vip_bypass.sql` recria a função no banco — **pendente de `supabase db push`**. Teste de guarda em `gemini-integration.test.ts` impede reintrodução.
- **i18n**: textos visíveis devem usar `t("ns.chave")` com a chave nos DOIS catálogos (o tipo `TranslationCatalog` obriga paridade). Constantes de módulo guardam a CHAVE, traduzida na renderização. Biblioteca elétrica: `lib/palette/component-i18n.ts`. Mensagens de evento geradas pelos motores de simulação (texto livre) seguem em pt-BR.
- **UI**: menu "Ambientes de engenharia" é renderizado em portal (ficava atrás das barras do canvas); SCADA tem limite de 15 s ao validar contexto no servidor.

### Segurança e relatórios (2026-11-16, 4ª rodada)

- **URLs externas** (`lib/security/url-safety.ts`): `toSafeExternalHref` para todo `href` vindo de dados; `isSafeOAuthRedirect` para callbacks OAuth. Nunca renderize `href={valorDoBanco}` sem passar por eles.
- **Senha** (`lib/security/password-policy.ts`): política única (8+, letra e número, ≤ 72 bytes) em cadastro, redefinição e troca. Configure a mesma política no Supabase Auth.
- **Planilhas**: importação CSV e XLSX passam por `sanitizeSpreadsheetRecord` (fail-closed em `__proto__`) com limite de tamanho antes da leitura; exportação (`lib/reports/xlsx-export.ts`) saneia todo texto contra injeção de fórmula.
- **MFA/TOTP** (`components/auth/mfa.tsx` + `integrations/supabase/mfa-enforcement.ts`): usuário com fator verificado precisa de sessão `aal2` — o AuthGate não renderiza rotas privadas e o `requireSupabaseAuth` responde 401 `MFA_REQUIRED` (503 fail-closed se o Auth não responder). **Pendente**: política RLS restritiva exigindo `aal2` para quem tem fator (protege acesso direto ao PostgREST e o servidor MCP) e confirmar TOTP habilitado no painel do Supabase.

### Banco, planos e Documentação EletricAI (2026-11-16, 5ª rodada)

- **Migrations aplicadas no projeto `rvaaxvdimggztjxoktvy`** (via MCP): `drop_digital_twin_module` (0 linhas/objetos afetados, verificado antes), `remove_email_vip_bypass`, `20261116090000_harden_function_grants` (funções de trigger e `ingest_iot_reading` só service role; anon perde RPCs que exigem login), `20261116091000_fix_tenant_billing_columns_and_owner_demotion` (cliente só atualiza `name/settings` de `tenants` — antes owner/admin gravava `plan='premium'` sem pagar; admin não rebaixa mais o owner), `20261116100000_platform_monthly_metrics`, `20261116101000_seed_plan_limits_and_ai_costs` (**`plan_limits` estava vazia: todo plano pago funcionava como o grátis**; custos de `ai_fix_diagnostics`/`ai_electrical_generator` ausentes quebravam esses recursos), `20261116102000_fix_check_ai_quota_unlimited`.
- **Atenção:** a versão registrada no banco pelo MCP usa o timestamp da aplicação, não o do nome do arquivo. Todas são idempotentes (`IF EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`), então um `supabase db push` futuro que as reaplique é seguro.
- **Limites de plano**: `plan_limits` espelha `src/lib/plans.ts` (teste garante paridade). Mudou preço/limite no app → nova migration.
- **Teste de planos pelo dono**: admin da plataforma troca o plano da própria empresa em Faturamento (`changePlanManual`, auditado em `subscription_audit_log`). Nada de e-mail fixo no código/banco.
- **Painel mensal** `/settings/platform-metrics` (admin da plataforma): empresas, usuários, projetos, itens/valor de BOM (com contagem de itens sem preço), IA e MRR estimado. RPC agregada só service role, sem PII.
- **Documentação EletricAI** (`src/lib/documentation/`, puro e testado): designação `=planta+local-tag` (IEC 81346-2; nunca renomeia tag do usuário, só sugere), fios numerados por **potencial** (barramento equipotencializa por fase; PE único), terminais REAIS da `terminal-library` (IEC 60947), régua de bornes só na fronteira painel ↔ campo (`-X1` potência, `-X2` comando), lista de cabos (`4G4 mm²`), referência cruzada bobina ↔ contatos (NA x3-x4, NF x1-x2, térmico 95-96/97-98; bobina dupla, contato sem bobina, contatos excedidos). Seção/comprimento ausentes viram **pendência**, nunca valor presumido. Integrado ao dossiê (abas Dispositivos, Lista de Cabos, Referência Cruzada, Verificação).
- **Corrigido no dossiê**: régua de bornes inventava contator `KM_<tag>` para todo motor/carga (inclusive com inversor); condutores numerados por ligação com 3F+N+PE/2,5 mm²/15 m presumidos; planilha e CSV sem proteção contra injeção de fórmula (agora toda célula de texto é saneada; designação IEC 81346 estrita é exibida sem apóstrofo).

### Desempenho do banco e Documentação EletricAI no editor (2026-11-16, 6ª rodada)

- **Migration `20261116110000_perf_rls_initplan_fk_indexes`** (aplicada): 155 policies com `auth.uid()` avaliado por linha → `(SELECT auth.uid())` via `ALTER POLICY` gerado no banco (fingerprint das 202 policies idêntico antes/depois); 37 índices para FKs; PK em `mp_webhook_processed`, `stripe_webhook_events`, `plant_telemetry`. Advisors 0001/0003/0004 zerados. **Não** remover "índices não usados" (banco com pouco tráfego) nem fundir "multiple permissive policies" em lote (muda quem vê o quê).
- **Fabricação de dados corrigida no modelo canônico**: `ConductorSpecSchema` tinha `lengthM` default 10 e o conversor/`unified-store`/`connection-engine` preenchiam 2,5 mm²/10 m/B1 — e `projectLegacyViewsFromV3` gravava isso de volta no diagrama. Agora seção, comprimento e método de instalação são opcionais; ausência = pendência.
- **Editor unifilar → painel "Documentação EletricAI"** (`components/editor/sidebars/eletricai-doc-panel.tsx`): verificação ao vivo (dispositivos, cabos, bornes, erros/avisos) via `documentationFromDiagram` (mesmo conversor canônico do dossiê) e "Numerar dispositivos"/"Renumerar tudo" (`lib/documentation/diagram-numbering.ts`): um único comando `Batch` reversível (Ctrl+Z), ordem por coluna/linha, preserva tags válidas únicas, corrige ausentes/inválidas/duplicadas. Verificado em E2E no projeto de demonstração.

### Nomes de terceiros (2026-11-16)

- **Regra do produto**: nenhuma marca de software de terceiros (ferramentas de CAE elétrico ou de programação de CLP) aparece no app, nos textos, comentários ou documentação. As funcionalidades são da **Documentação EletricAI**. Normas (IEC/NBR/ISA) podem ser citadas.
- Exceção técnica: o identificador interno `CODESYS_VIRTUAL` (enum de fornecedor gravado em projetos salvos) não é exibido e não foi renomeado para não quebrar projetos existentes.

### Dados reais em todo o app (2026-11-16, 7ª rodada)

- **Plano vivo**: `docs/PLANO_EXECUCAO.md` (estado de cada editor/tela com arquivo:linha e backlog priorizado). Atualize-o a cada rodada.
- **Regra**: nada exibido como leitura real pode ser inventado. Sem fonte de dado → 0/"pendente"/"sem sinal", nunca um valor plausível. Simulação só com rótulo de simulação. Teste-guarda: `real-data-integrity.test.ts`.
- Corrigidos: `sim-canvas.tsx` (senoides com runtime real, 1750 rpm/11,6 A presumidos por bobina ligada, temperatura exibida como corrente, nível 50% fixo); `runtime-client.ts` (alarme fixo "M-02" e ciclo aleatório → ciclo medido por `performance.now()`); faturamento (gráfico de 7 dias era vetor de zeros → `getAiUsageSummary().daily` de `ai_usage_events`); barra do PLC (árvore fictícia → `usePlcStore` com navegação); busca inoperante nas barras PLC/FBD/SCADA (`SidebarSearch` agora controlado + `normalizeSearch`).
- **Base normativa da IA** (migration `20261116120000_normative_knowledge_base`, aplicada): 11 documentos / 28 resumos técnicos PRÓPRIOS (não copiar texto de norma — direito autoral) + coluna gerada `normative_chunks.search_text` sem acento; `fetchNormativeContext` consulta `search_text` (antes "tensão" nunca casava). Catálogo (`catalog_components`) segue vazio: depende da planilha de fornecedores do dono.

### Base normativa revisada e catálogo da empresa (2026-11-16, 8ª rodada)

- **Base normativa** (migration `20261116130000_normative_knowledge_review`, aplicada): 5 trechos corrigidos após conferência com fontes públicas (κ IEC 60909 de 1,02 a 2,0; 1,25 × In atribuído ao NEC 430.22; neutro sem número de tabela não confirmado; DR em tomadas internas que alimentam área externa; NBR 14039 edição 2021). Todos os 28 trechos têm `metadata.aviso` e a IA os recebe como "resumos indicativos". Ainda vale revisão por engenheiro.
- **Catálogo da empresa** (`tenant_catalog_items`, migration `20261116140000`): começa VAZIO; o cliente escolhe cadastro manual, planilha ou distribuidor. RLS: leitura por membro; escrita owner/admin/engineer. Preço guarda valor + moeda + origem (`manual|planilha|mouser`) + data; nunca convertido nem estimado.
- **Mouser** (`lib/catalog/mouser.ts` puro + `mouser-client.server.ts`): host fixo, `redirect: "error"`, timeout 12 s, resposta ≤ 2 MB validada por Zod, rate limit `api` por usuário. O navegador só envia CÓDIGOS; preço/estoque são reconsultados no servidor na importação e em "Atualizar preços" (até 50 itens, mais antigos primeiro).
- **Importação de planilha** passou a gravar no catálogo da empresa por padrão; o global (`catalog_components`) só para admin da plataforma.
- **Pendente**: regenerar `types.ts` com `tenant_catalog_items` (hoje acessado sem genérico, saída validada por Zod) e ligar o BOM ao catálogo da empresa.

### FB Electric Studio — FBD e Studio unificados (2026-11-16, 9ª rodada)

- **Diagnóstico**: o antigo editor "FBD" (`canvases/fbd-canvas.tsx`, nós React Flow em `editor.fbdNodes`) e o "eletric Studio" (`compactStudio`, `CompactProgramModel`) executavam no MESMO motor (`lib/fbd/engine`) e na mesma biblioteca IEC; só o formato salvo e a tela eram diferentes. O Studio já era superconjunto (FBD+LAD, páginas, hardware, UDF, simulador, documentação, rede).
- **Agora há um só editor de blocos: FB Electric Studio** (`PRODUCT_NAME`; modo `compactStudio`). O modo `fbd` saiu das abas e é alias (`setActiveMode("fbd")` → `compactStudio`). Sempre visível (a flag `logoStudio` não esconde mais o editor).
- **Migração sem perda** (`compact-studio/conversion/legacy-fbd-import.ts` + `integration/legacy-fbd-migration.ts`): no carregamento do projeto, `editor.fbdNodes` vira a página "FBD importado" (blocos, parâmetros, ligações, posições); o formato antigo só é apagado depois que o Studio aceita o modelo. Página já migrada NUNCA é sobrescrita por cópia antiga. Blocos/pinos inexistentes vão para o relatório, não são inventados.
- **CLP**: cada bloco de programa FBD = uma página `plc-<id>` do Studio (`integration/plc-block-pages.ts`); "Abrir no editor" leva à página; "Compilar" gera ST da página pelo Studio (`runtime/structured-text.ts`, registry do Studio). v2→v3 não copia mais FBD para bloco `pb-fbd-main`.
- **IA**: a lógica FBD gerada vai para a página "Lógica FBD (IA)" do Studio.
- **Ganhos no Studio**: biblioteca COMPLETA (IEC + compactos + E/S, 300+ blocos) com busca sem acento e seletor por categoria (`editor/library.ts`); aba **ST** (página ou programa, copiar/baixar .st). Corrigido: instâncias de tipos diferentes viravam "B1" (duplicadas) e caíam na mesma posição; chaves i18n `compactStudio.*` ausentes.
- **Removido** (sem consumidores após a unificação): `fbd-canvas.tsx`, `fbd-engine-panel.tsx`, `use-fbd-engine.ts`, `editor-fbd-sidebar.tsx`, `lib/fbd/{editor-bridge,types,compiler,runtime,scada-bridge}.ts` (o Studio publica no SCADA por `publishCompactFrameToRuntimeStore`).
- O "Studio IEC" (`mode: studio` — ST, SFC, HMI, segurança, movimento) é OUTRO editor (multilinguagem IEC) e foi mantido.

### Celular, IA/IoT em produção e perfil da conta (2026-11-16, 10ª rodada)

- **Documentação de bibliotecas**: use o MCP **Context7** (`.mcp.json` e `opencode.json`: `npx -y @upstash/context7-mcp@latest`) para consultar a documentação ATUAL de qualquer biblioteca antes de atualizar/usar APIs.
- **Provedor de IA real é o Google Gemini** (`GEMINI_API_KEY`, `lib/ai/gemini-client.server.ts`); referências a DeepSeek neste documento são históricas.
- **Rate limiter sem Upstash** (produção hoje não tem `UPSTASH_REDIS_REST_URL/TOKEN`): todos os limitadores usam limite LOCAL por instância (IA 10/10 s; IoT 120/min por chave e por IP). Antes IA e IoT negavam tudo → banner "IA indisponível" e todo POST de dispositivo com 429. Upstash CONFIGURADO com falha continua fail-closed para IA/IoT (RISK-007). Corrigido também: o opt-in `AI_RATE_LIMIT_LOCAL_FALLBACK` era inalcançável (fail-closed testado antes). Recomenda-se configurar Upstash (gratuito) para limite global entre instâncias.
- **Canvas no celular** (`render/stage.ts` + `canvases/diagram-compat-view.tsx`): `init()` do WebGL sem `.catch` deixava o canvas preto para sempre; agora falha de init ou perda de contexto (`webglcontextlost`) mostra o **modo de compatibilidade** (o mesmo SVG da exportação, como `<img>` blob — sem execução de script) com "Tentar novamente". Resolução limitada a 2x no celular; WebGL explícito; escala travada enquadra o início do circuito. `diagramToSvg` agora escapa texto e não inventa 380 V/630 A no barramento.
- **Perfil da conta** (`lib/account-type.ts` + `account-type.functions.ts`): cadastro escolhe **Empresa** (nome da empresa obrigatório) ou **Profissional autônomo**; vai para `tenants.settings.account_type` no 1º login (Google: guardado no navegador até o callback). Só o owner altera em Configurações → Perfil; UPDATE bloqueado por RLS (0 linhas) não vira sucesso. Links de divulgação: `/signup?perfil=empresa|autonomo`.
- **Arduino/ESP32**: guia `docs/ARDUINO_TESTE.md` (contrato do `/api/public/iot/ingest`, sketch ESP32 HTTPS, ponte serial para Uno). Ingestão exige plano Pro/Premium e chave com escopo `iot:ingest`.
- `/catalog` não quebra enquanto `tenant_catalog_items` não existir no banco (estado "sendo ativado").

### Planos v2, limites, legal, SEO, BOM e Ladder (2026-11-16, 11ª rodada)

- **Planos v2** (`lib/plans.ts` = fonte única; `plan_limits` espelhado pela migration `20261116150000`): Grátis R$0 · **Autônomo** (id `basic`) R$119/mês ou R$1.190/ano · **Pro Empresa** R$349/R$3.490 · **Premium** R$890/R$8.900; usuário extra R$79/mês; IA nunca ilimitada (150/400/1500 créditos); IoT só Pro (10 disp.) e Premium (50). Preço de lançamento 30% por 12 meses para as 50 primeiras empresas (`planCharge`, `isLaunchEligible` fail-closed). IDs internos mantidos (já gravados em `tenants.plan`/Stripe).
- **Checkout** mensal/anual (`interval`): Stripe usa `VITE_STRIPE_PRICE_*_YEARLY` e cupom opcional `STRIPE_LAUNCH_COUPON_ID`; Mercado Pago calcula o valor no servidor. **Webhook MP** (`lib/billing/mp-plan-payment.ts`): valor pago abaixo do preço de lançamento NÃO libera plano; grava vencimento em `subscriptions` (`mp_<id>`). **Cron diário** `/api/public/cron/expire-subscriptions` (Vercel Cron + `CRON_SECRET`, 503 sem segredo) → `expire_overdue_subscriptions()` rebaixa 3 dias após vencer.
- **Limites no banco**: `ingest_iot_reading` recusa dispositivo NOVO acima de `max_iot_devices` (`device_limit` → HTTP 402); trigger `enforce_tenant_seat_limit` em `tenant_memberships`; convite confere usuários (membros + convites pendentes). Testado em Postgres 16 local (10 aceitos/11º recusado, 4º usuário do Pro recusado, vencimento 1 d mantém / 5 d rebaixa).
- **IA**: `getGeminiModel("architect")` = Pro (`GEMINI_MODEL`) só na geração de projeto; demais usam Flash `gemini-3.8-flash` (`GEMINI_MODEL_FAST`).
- **Legal** (`lib/legal.ts`): CNPJ/endereço/telefone inventados REMOVIDOS dos .md; `{{TOKENS}}` preenchidos por `VITE_LEGAL_*` ou "a informar". Aceite versionado (`terms_version`, `privacy_version`, `terms_accepted_at`) no cadastro (Google: gravado no 1º login). Termos alinhados ao vencimento real e ao arrependimento (CDC art. 49).
- **SEO**: `/para-empresas` e `/para-autonomos` (title, description, canonical, JSON-LD), `robots.txt`, `sitemap.xml`; links no rodapé.
- **BOM ← catálogo** (`lib/catalog/bom-pricing.ts` + `applyCatalogPricesToBom`): só BRL, casa código (+fabricante), ambíguo/outra moeda/sem preço não preenche; não sobrescreve preço digitado.
- **Ladder**: painel "Referência cruzada" (`components/editor/sidebars/ladder-xref-panel.tsx`, `lib/ladder/cross-reference.ts`): bobina dupla (por redes distintas), contato sem escrita (exceto entradas %I/tags de entrada), SET sem RESET; clique leva à rede.
- **SQL pendente**: `docs/SQL_APLICAR_HOJE.sql` (catálogo + planos v2) — o MCP do Supabase pede confirmação que expira; aplicar pelo SQL Editor.

### Bancada Arduino Uno R3 pela Web Serial (2026-11-16, 12ª rodada)

- **Arquitetura** (`src/lib/hardware/`, puro e testado em `arduino-bench.test.ts`):
  - `serial/protocol.ts` — protocolo ASCII de linha com checksum XOR `*HH` (`CMD:<pino>:<0|1>`, `PING`, `ALL:0`, `RST`, `CFG?` / `HELLO`, `ACK`, `ERR`, `DATA`). Toda linha recebida é dado não confiável: tamanho, caracteres, checksum e faixas conferidos.
  - `serial/web-serial.ts` (tipos e suporte), `serial/bench-controller.ts` (singleton por aba + store zustand: sobrevive à troca de editor; PING a cada 500 ms; comando espera ACK; `ALL:0` ao desconectar).
  - `bench-config.ts` (Zod: pinos D2–D13 sem conflito, sensores ACS712/SCT-013/ZMPT101B), `bench-from-diagram.ts` (contator do unifilar → relé; disjuntor do ramal → entrada auxiliar; seção de condutor nunca presumida).
  - `command-guard.ts` — **arquitetura de autorização da regra 21**: desligar sempre permitido; ligar exige habilitação na sessão, telemetria recente, E-STOP liberado, intertravamento, disjuntor fechado, NBR 5410 §5.3.4.1 (Ib ≤ In ≤ I'z, I2 ≤ 1,45·I'z) e capacidade do contato. A UI ainda pede confirmação antes de energizar.
  - `firmware/uno-firmware.ts` — gerador do `.ino` (sem `String`, sem `delay`, `millis()`, watchdog 1 s, E-STOP NF com trava até `RST`, saídas escritas no nível desligado antes do `pinMode`, desliga tudo sem host).
- **Hook** `src/hooks/use-arduino-serial.ts`; **painel** "Bancada Arduino" na barra do editor unifilar (`arduino-bench-panel.tsx`), que espelha o estado REAL de contatores/disjuntores no diagrama (`setDeviceState`).
- **Firmware base**: `firmware/arduino-uno/eletricai_uno_base/eletricai_uno_base.ino` = saída do gerador para `DEFAULT_BENCH_CONFIG` (teste garante igualdade). Mudou o gerador → regenere o `.ino`. `bun run test:firmware` roda a lógica num simulador C++ (`firmware/arduino-uno/test-harness`) e, com `avr-g++`, compila para o ATmega328P (hoje 10 KB de flash, 588 B de SRAM). Está no CI.
- **Telemetria real na nuvem** (`lib/bench-telemetry.functions.ts` + `lib/hardware/bench-telemetry.ts` + `hooks/use-bench-cloud-sync.ts`): botão "Enviar para a nuvem" no painel. Servidor: sessão + limite de taxa por usuário + Zod; banco: `ingest_bench_telemetry` (só service role) confere empresa (`profiles.tenant_id`), papel (owner/admin/engineer/operator), plano com IoT e limite de dispositivos. A bancada inteira é UM dispositivo; cada grandeza vai em `iot_readings.metric` (`A0`, `out.D4`, `in.D8`, `estop`) com `unit`. Banda morta (1 % do fundo de escala; digital em qualquer mudança) + batimento de 60 s. Nada é enviado com telemetria velha. Erros definitivos (plano, limite, papel) desligam o envio; temporários repetem com espera crescente. `/realtime` ganhou seletor de grandeza.
- **Bugs que impediam QUALQUER leitura IoT de entrar no banco** (inclusive ESP32 por chave de API), corrigidos em `20261116150000`: tipo `iot_device_kind` inexistente (a coluna é `sensor_kind`); `iot_readings.device_id` (texto) comparado com uuid; `ingested_at` obrigatório sem default.
- **Pendente de aprovação**: `docs/SQL_APLICAR_HOJE.sql` (catálogo + planos v2 + telemetria) — o MCP pede confirmação por causa de um `DROP TRIGGER IF EXISTS` e o pedido expirou. Testado em Postgres 16 local com o esquema de produção (duas execuções seguidas sem erro).

### Vídeo do hero e correções achadas ao gravar (2026-11-16, 13ª rodada)

- **Vídeo do hero** (`public/landing/demo-canvas-{1080,720}.mp4` + `demo-canvas-poster.webp`, 110 s, 30 fps): gravado no app (projeto de demonstração local, sem servidor) montando do zero trafo → disjuntor geral → partida direta (Q1/K1/F1/M1) e ramal com inversor (Q2/T2/M2): biblioteca → ligações porta a porta → numeração IEC 81346 → BOM → multifilar → FB Electric Studio (gerar do unifilar, LAD, ST) → SCADA/CCM (partida DOL e VFD em simulação) → E-STOP. Sem o aviso de "Falha ao salvar (RLS)" e as abas antigas do vídeo anterior.
- **CCM/Studio atribuíam equipamento do ramal vizinho** (`motor-fleet.ts` `discoverFeederChain`): sem barramento, a busca subia até o disjuntor geral e descia pelo outro ramal (M1 "herdava" o inversor de M2 e virava VFD). Agora para em pontos de derivação (>2 ligações de potência). Teste em `motor-protection-engine.test.ts`.
- **Diagnóstico com erros falsos de queda de tensão** (`multifilar.ts`): sem comprimento/seção o cálculo adotava 25 m / 4 mm² e usava o In do disjuntor como corrente → "6,6 % > 4 %" em ERRO e condutor marcado como falha na simulação. Agora trecho sem dados não é calculado: vira UMA pendência (`listCablesMissingData`, "queda de tensão não verificável"); In do disjuntor como corrente é marcado como premissa.
- **Disjuntor da biblioteca nascia com 1 polo** (`webgl-canvas.tsx` `defaultNodeParams`): todo disjuntor num circuito 380 V trifásico gerava "Inconsistência de fases". Padrão agora 3 polos.
- **Tag não aparecia no desenho** (`render/node-label.ts`): o canvas mostrava `label || kind`; componente da biblioteca tem rótulo "QF"/"KM" e a numeração IEC 81346 ficava invisível. Agora a tag vem primeiro.
- **Controles e minimapa do React Flow brancos no tema escuro** (FB Electric Studio): tokens do tema em `styles.css`.


### SCADA Fase 0, IA da plataforma, Configurações e Perfil (2026-11-17, 14ª rodada)

- **IA paga pela plataforma** (`lib/ai/ai-provider.server.ts`): DeepSeek (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_MODEL_ARCHITECT`; endpoint compatível OpenAI, `response_format: json_object`) é o padrão e cai para o Gemini se faltar chave ou o provedor falhar. O usuário NÃO configura chave: troca de IA conversando no chat ("use o Gemini", "qual IA você usa?") — `lib/ai/provider-switch.ts` (determinístico, não gasta crédito) grava `profiles.preferences.ai_provider`. Mensagens de erro nunca citam nomes de variável de ambiente.
- **Configurações removidas**: status da IA, limites de IA, monitor de segurança, diagnóstico e autosave (páginas e server functions órfãs). A proteção invisível de custo continua: créditos mensais do plano + limite de rajada no servidor.
- **Histórico** (`20261117090000_tag_samples_source_unit`, aplicada): `tag_samples` guarda `source` (SIMULATION/INTERNAL_RUNTIME/OPC_UA/MODBUS_TCP/MQTT/IOT/IMPORTED/UNKNOWN), `unit`, `equipment_id`, `sequence_number`, `received_at`. Lote ≤ 500 (`MAX_HISTORIAN_BATCH`), também no ingest do Edge.
- **SCADA Fase 0**: projeto de cliente não recebe jitter nem alarmes automáticos (30/40 A); categoria pelo tipo real (`scadaCategoryOf`: motor → MOTOR, não "bomba"); telemetria nasce em 0 com qualidade `NOT_CONNECTED` e dados de placa em `EquipmentTelemetry.nominal`; vazão 92,4/90,3 m³/h só na demonstração; drivers exibem o estado real (`summarizeDrivers`); KPIs e sinóptico ETE só na demonstração; status sem "IEC 62443 SL-2"/"60 Hz Sync"/versões inventadas. Tag sem fonte (`NOT_CONNECTED`) não gera alarme de comunicação — só perda de sinal (`STALE`). Buffer do histórico limitado a 2000 amostras, enviado a cada 10 s em lotes de 500 (falha devolve à fila; demonstração nunca grava). `/scada` aberto direto monta a frota a partir do diagrama salvo (`SnapshotSchema` + `upgradeSnapshotV2ToV3`). Erros de banco do SCADA não vazam mensagem do Postgres. Testes: `scada-phase0-integrity.test.ts`.
- **Perfil** (`lib/profile.ts` + `profile.functions.ts`): a tela gravava o "cargo" em `profiles.role` — o PAPEL DE SEGURANÇA usado pelo RLS; o trigger anti-escalação desfazia e a UI dizia "salvo". Agora o cargo vai para `preferences.job_title`; o papel na empresa é exibido (somente leitura); gravação conferida (0 linhas = erro); avatar só HTTPS (ou foto do Google); idioma salvo vale em todos os dispositivos; conta sem linha em `profiles` é criada no primeiro acesso. Nunca escreva em `profiles.role` a partir do cliente.

### SCADA Fase 1 — fonte única e persistência (2026-11-17, 15ª rodada)

- **Base única de tags** (`lib/scada/tag-hub.ts`): `useScadaStore.tags` é a fonte da verdade (valor + qualidade + ORIGEM). Toda fonte publica por `publishTags(source, …)`: script/escrita HMI (`SIMULATION`), runtime de CLP (`INTERNAL_RUNTIME`, padrão do `applyTick` sem `source`), Modbus/OPC UA pela proveniência real (simulador = `SIMULATION`), CCM (`mccTagsToPublished`, sem o `-999` de "sem sensor") e bancada Arduino (`IOT`, prefixo `BANCADA.`; perda de telemetria → `STALE`). `useProjectStore.tags` (editor HMI) é só espelho de valores. Tags salvos de projetos antigos entram como `IMPORTED`/`NOT_CONNECTED`. `ProtocolDriver` ganhou `IOT`.
- **Lista única de alarmes**: `alarm-store.ts` removido; o modo Alarmes lê `useScadaStore.alarms`. `mergeAlarmLists` corrige dois bugs: a saída do motor substituía a lista inteira (apagava E-STOP/externos) e, sem alarmes no motor, o último ficava na tela para sempre. Alarme externo: `raiseExternalAlarm`/`clearExternalAlarm` (normalizado sem reconhecimento fica UNACK com `clearedAt`; reconhecido+normalizado sai só depois de gravado — `pruneSettledAlarms`). Reconhecer NÃO apaga a condição (o banner HMI zerava `ALARM_ACTIVE`).
- **Persistência** (`scada-operations.functions.ts` + `use-scada-project-sync.ts`, montado no workspace e em `/scada`, uma instância por aba): ao abrir, `loadScadaPersistedState` restaura alarmes pendentes e a trilha de auditoria (visualizador não lê auditoria); a cada 5 s, ao reconhecer e ao sair, `persistScadaBatch` faz upsert por OCORRÊNCIA (`id@timestamp`) e acrescenta auditoria; o histórico de tags também é gravado aqui. Falha = reenvio (idempotente).
- **Auditoria** (`audit-append.server.ts`, service role após `authorizeProjectAccess`): `audit_logs` não aceita INSERT de cliente — o `recordScadaAuditEvent` antigo NUNCA gravava. Cadeia SHA-256 com `created_at` estritamente crescente e unicidade `(tenant_id, previous_hash)` (corrida → relê a ponta). A verificação normaliza a data devolvida pelo banco (`+00:00`). Abertura de projeto não é auditada.
- **Forçar tag**: `ForceTagDialog` (valor no tipo do tag, motivo 5–500, expiração 15 min/1 h/8 h) → `authorizeTagForce` exige papel owner/admin/engineer e grava a auditoria no servidor ANTES de aplicar; o store usa o runtime (`forceTagValue` guarda o valor real por baixo, recusa tag crítico de segurança). Liberar volta ao valor real com qualidade `UNCERTAIN` (antes ficava o valor forçado como `GOOD`). A visão geral forçava +5 % com um clique — removido.
- **Migration `20261117120000_scada_alarm_audit_persistence`** (aplicada): `id` de `alarm_history`/`audit_logs` não tinha default (nenhum insert funcionava), `ip_address` deixou de ser obrigatório, `alarm_history.occurrence_id`/`source`/`updated_at` + índice único `(project_id, occurrence_id)`, índice único `(tenant_id, previous_hash)` em `audit_logs`. Verificado no banco (transação desfeita): reconhecimento atualiza a mesma linha; segunda gravação no mesmo elo é bloqueada.
- Testes: `scada-phase1-foundation.test.ts`.

### Canvas do unifilar/multifilar em produção (2026-11-17, 16ª rodada)

- **Causa raiz** de "não funciona no computador nem no celular": a CSP de produção (`vercel.json`, sem `'unsafe-eval'` — correto) bloqueava o Pixi v8, que gera código de shader com `new Function`. O canvas NUNCA iniciava em produção e o app caía no modo de compatibilidade (imagem travada); no servidor de desenvolvimento não há CSP, por isso funcionava lá. Correção: `import "pixi.js/unsafe-eval"` no topo de `render/stage.ts` (polyfills oficiais do Pixi, sem eval). Teste-guarda em `canvas-mobile-fallback.test.tsx`.
- **Somente WebGL** (decisão do dono): `preference: ["webgl"]`, `failIfMajorPerformanceCaveat: false` (aceita GPU fraca/emulada). Falha ao iniciar ou perda de contexto → recria em **WebGL leve** (`StageRendererMode = "lite"`: sem antialias, 1x, `low-power`), até 3 recriações. Sem WebGL algum: aviso com instruções para ligar a aceleração de hardware (nada de imagem travada).
- **Animação da simulação** (`render/flow-animation.ts`, puro e testado): partículas de corrente correndo da origem para a carga nos condutores de potência energizados, falta piscando, pulso visual ao abrir ("derrubar") disjuntor/contator; ~30 quadros/s, limitado a 80 partículas por cabo, respeita `prefers-reduced-motion`.
- Toque: `touch-action: none` no canvas (pinça/arrasto do editor, não da página); barra girar/excluir vai para baixo no celular (cobria o transformador).
- Verificado com Playwright e a CSP de produção injetada: desktop e Pixel 7 em WebGL; simulação com quadros diferentes (animação viva).

### Editor HMI de processo (2026-11-17, 17ª rodada)

- **SCADA → Editor HMI → "Tela de processo"** (`components/hmi/hmi-process-studio.tsx`, React Flow — DOM/SVG, igual em PC/tablet/celular). O editor Konva + sandbox continua na aba "Widgets e scripts". Três modos sobre o MESMO documento:
  - **Desenho**: biblioteca (`lib/hmi/process-library.ts`, 52 equipamentos em 9 categorias — rosca, esteira, redler, elevador de canecas, moega, silo, bombas, exaustor, ventilador, soprador, compressor, tanques, tanque de óleo/condensado, válvulas, caldeira, trocador, purgador, torre, secador, cozinhador, prensa, decanter, separador, moinho, peneira, misturador, filtro prensa, ciclone, rede de esgoto, elevatória, gradeamento, decantador, motor, painel, inversor, gerador, transmissores). Arrastar (ou tocar para adicionar no celular), ligar PORTAS com meio validado (água, óleo, vapor, condensado, esgoto, ar, gás, produto, farinha, grãos, energia, sinal), girar, renomear, tag, desfazer/refazer.
  - **Código** (`lib/hmi/hmi-dsl.ts`): `tela "…"`, `equipamento ID tipo "nome" em x,y [girar N] [tag T]`, `ligar A.porta -> B.porta [meio]`. Ida e volta exata desenho↔código; erros com número de linha.
  - **IA** (`lib/hmi/hmi-ai.functions.ts`): o usuário descreve a planta, a IA escreve o código (catálogo e portas no prompt, entrada isolada contra prompt injection), o servidor valida com o MESMO parser e pede uma correção se houver erro; créditos `generate_panel`; só aplica após o usuário confirmar.
  - **Operar** (`lib/hmi/hmi-runtime.ts`, puro): ligar/desligar, reversão SÓ parado, velocidade, abrir/fechar válvulas, nível simulado; produto corre nas ligações (equipamento sem produto a montante roda em vazio), tanques enchem/esvaziam; "Parar tudo" e rearme que não religa. Tags `<TAG>.LIGADO/REVERSO/VELOCIDADE/ABERTA/NIVEL` publicados na base única com origem `SIMULATION`. Banner de simulação obrigatório; nenhum comando sai para o campo (regra 21).
- **Símbolos** (`components/hmi/process-symbols.tsx`): desenho PRÓPRIO realista (aço em degradê, volume, flanges, pés/berços, motor TFVE com aletas e caixa de ligação, bomba com voluta, caldeira com fornalha). Bibliotecas realistas de mercado são proprietárias (licença por usuário, sem redistribuição em SaaS) — não embutir sem licença. Galeria: `docs/hmi-biblioteca-equipamentos.png`.
- **Persistência**: `snapshot.hmiProcess` (`HmiDocSchema`, inválido abre vazio), autosave pelo `useHmiStore`.
- **SCADA no celular**: barra lateral some abaixo de 768 px e vira seletor (`ScadaMobileNav`).
- Testes: `hmi-process.test.ts`; E2E com CSP de produção (desktop e Pixel 7): código → desenho → operar, sem erros.

### SCADA Fase 2 — hierarquia ISA-101 (2026-11-17, 18ª rodada)

- **Modelo de ativos** (`lib/scada/asset-hierarchy.ts`, puro): áreas pela designação `=planta+local` (IEC 81346) lida de `specs.custom.plant/location` do equipamento canônico (`EquipmentTelemetry.plant/location/designation`, preenchidos em `canonical-bridge.ts`); sem local → "Área não definida" (nunca inventada). Árvore planta → local → equipamento com busca sem acento. Desvios: alarme não reconhecido/reconhecido, falha (TRIPPED), manutenção, qualidade ruim, sem atualização, forçado. Estado da área: ALARME/DESVIO/NORMAL/SEM DADOS (sem tag conectado = sem dados, não "normal"). O store guarda o mesmo tag por nome e por id — use `uniqueTags`.
- **Dono do alarme** (`equipmentIdForAlarm`): pelo tag vinculado (`linkedEquipmentId`/`linkedTags`) ou prefixo `TAG.`/`TAG_` com separador (M1 não casa M10). Sem dono → lista à parte; nunca por palpite no texto.
- **Visão Geral = nível 1**: só áreas e desvios; KPIs sem fonte removidos (cliente). O P&ID da ETE e os KPIs ficam só na demonstração (rotulados). O dock antigo (tags/eventos/OPC) saiu — cada coisa tem sua aba.
- **Faceplate único** (`equipment-inspector-drawer.tsx`): designação/área, alarmes do equipamento (com reconhecer), desvios, **tendência já aberta** (`tag-trend-buffer.ts`: só valores publicados desde a abertura, ≤ 600 pontos/tag, trecho de qualidade não boa tracejado, troca de projeto zera), comando (simulação), dados de placa/medidos (sem "25 °C"/"CLP-01" inventados), tags com origem e forçamento, documentos (unifilar e dossiê). Antes os alarmes do equipamento eram calculados por substring e nem exibidos.
- **Banner fixo de alarmes** no rodapé (`scada-os-status-bar.tsx`): contador não reconhecidos/ativos e o alarme mais importante (`pickBannerAlarm`); 1 clique abre o faceplate do dono. Removidos "ESTAÇÃO ENG-OP-01", "Entrar no Runtime", "v1.0.0-bench", "+4,2 %", "Set: 95 %" e a marca de CLP no seed/sinótico.
- **Aceite**: alarme (banner, lista de alarmes ou visão geral) → faceplate em 1 clique, tendência visível sem outro clique. Testes: `scada-phase2-hierarchy.test.tsx`; E2E com CSP de produção em desktop e Pixel 7 sem erros.
- **Paleta**: cor forte só para alarme/falha (vermelho) e desvio/simulação (âmbar); estados normais em cinza.

### SCADA Fase 3 — alarmes ISA-18.2 e correções de produção (2026-11-19, 19ª rodada)

- **Ponto de alarme** (`lib/scada/alarm-management.ts`, puro): chave estável `CATEGORIA|TAG` (`alarmPointKey`) entre ocorrências. **Prateleira** sempre com prazo (15 min a 8 h) e motivo, vence sozinha; **fora de serviço** com motivo, só sai quando a engenharia devolve. Ambos somem da lista ativa, do banner, da visão geral e do faceplate (`useAlarmPartition`/`useVisibleAlarms`) e aparecem nas abas próprias com as ocorrências escondidas contadas. **Alarme de segurança (`SAFETY`) nunca vai para a prateleira nem sai de serviço** (regra no cliente e no servidor).
- **Racionalização**: causa, consequência, ação do operador e tempo para agir por ponto; a ação aparece na lista de alarmes e no faceplate.
- **Primeiro alarme** (`firstOutIds`): marca "1º" no alarme que abriu uma rajada (≥ 2 em 10 s no mesmo equipamento).
- **Indicadores** (`computeAlarmKpis` + `loadAlarmKpis`): calculados de `alarm_history` (24 h / 7 d / 30 d) — alarmes por hora, pico em 10 min, tempo em inundação (> 10 em 10 min), 10 mais frequentes, oscilação (≥ 3 em 60 s), parados > 24 h, mediana até reconhecer, prioridades. Referências usuais (ISA-18.2/EEMUA 191) só como orientação. Demonstração calcula só com a sessão, rotulado.
- **Servidor** (`alarm-management.functions.ts`): prateleira = owner/admin/engineer/operator; fora de serviço e racionalização = owner/admin/engineer; ponto e tag conferidos; auditoria gravada ANTES da mudança; escrita só com service role. Tabela `alarm_point_settings` (migration `20261117150000`, aplicada; RLS de leitura para membros, sem escrita de cliente, sem acesso anon). Selo "100 % AUDITADO" (sem base) removido; CSV de alarmes protegido contra fórmula.
- **IA travada em produção (corrigido)**: o Upstash respondia corpo vazio e o limitador NEGAVA a IA para todos ("[UNKNOWN] A IA não retornou um patch válido") — o DeepSeek nem era chamado. Agora Upstash com falha usa o limite local por instância em todos os limitadores (o custo da IA continua limitado pelos créditos mensais no banco); URL/token passam por `cleanEnv` (espaço, quebra de linha, aspas); URL que não seja `https://<nome>.upstash.io` é ignorada com aviso; o chat mostra o código real do erro em vez de `[UNKNOWN]`. Mudou variável na Vercel → precisa de novo deploy.
- **Histórico nunca gravava (corrigido)**: `tag_samples.id` sem valor automático (23502 nos logs). Migration `20261119090000_tag_samples_id_identity` (aplicada).
- Testes: `scada-phase3-alarms.test.tsx`, `rate-limiter-unconfigured.test.ts`.

### IA por editor, cabos NBR 5410 e documentação (2026-11-19, 20ª rodada)

- **Mapa de conhecimento da IA** (`src/lib/ai/knowledge/engineering-rules.ts`, doc `docs/IA_EDITORES.md`): fonte única das regras por editor (unifilar, multifilar, ladder, FB Electric Studio, SCADA/HMI). Patch do canvas recebe unifilar+multifilar; Arquiteto recebe unifilar+ladder+Studio; chat recebe todos. Teste-guarda `ai-knowledge-map.test.ts`. Regra nova → muda lá, nos dois idiomas.
- **Cabos — por que a IA não conseguia corrigir**: `updateEdges` do patch não aceitava `cable` (a IA inventava um nó "CABO ALIM 25mm² 15m"), o `ApplyAiPatch` ignorava cabo e o servidor descartava o `updateEdges` da IA. Agora `updateEdges[].cable` (`CableSpecSchema`) é aplicado, desfeito por Ctrl+Z e mesclado no servidor.
- **Dimensionamento NBR 5410** (`lib/diagram/connection/cable-sizing.ts`, puro): Ib = soma das cargas a jusante, In = 1º relé térmico/disjuntor a montante, seção por `sizeConductorNBR5410` (Ib ≤ In ≤ I'z; motor I'z ≥ 1,25·In). Roda em toda geração/correção e no botão **Dimensionar cabos (NBR 5410)** do painel Documentação EletricAI (sem crédito, Ctrl+Z). Nunca preenche comprimento; método não informado = B1 declarado como premissa; seção do usuário só muda se subdimensionada.
- **Diagnóstico de cabos**: comprimento só é cobrado do cabo de campo (painel → carga) e do alimentador (fonte externa → painel), com nomes ("F1 → M1"). Fiação interna sem seção vira aviso separado `cond_section_missing`, resolvível pelo dimensionamento.
- **Reparo — dispositivos em série** (`connection-repair-engine.ts`, passo 0): seccionadora/DR/fusível encadeados (TR → Q0 → QS → DR → barramento; Q → DR → tomada); o disjuntor geral é achado subindo pela cadeia série (`mainBreakerAbove`) — antes o QS ficava "sem alimentação" e o Q0 podia ser realimentado pelo barramento.
- **E-STOP — convenção única fail-safe**: contato NF físico, entrada 1 = íntegra, lido com **XIC** em série (`S0_OK`). O prompt do Arquiteto mandava XIO (exigiria botoeira NA: fio rompido não para). `verifyEstopInterlock` detecta a polaridade do rung; XIO ainda interlocka mas gera aviso `logic-estop-polarity`.
- **Documentação**: 15 registros de risco contradiziam a matriz (sincronizados); RISK-025 (CI/typecheck/.env) e RISK-032 (Sentry) atualizados; 33 docs com caminhos inexistentes — docs vivos corrigidos para os sucessores, relatórios datados marcados como **históricos** (conteúdo preservado); `docs/testing/CROSS_CANVAS_AND_I18N_TEST_PLAN.md` ganhou o estado real de cobertura (T3 e scanner de textos fixos seguem pendentes).
- Testes: `cable-sizing.test.ts`, `repair-series-devices.test.ts`, `ai-knowledge-map.test.ts`, `ladder-estop-verify.test.ts`.

### Unifilar completo: cabos, coordenação, painel da IA e Ladder (2026-11-20, 21ª rodada)

- **Aba "Cálculos NBR 5410"** (`components/editor/cable-table.tsx`): tabela de TODOS os trechos (`sizeDiagramCables(doc).rows`: Ib, proteção, seção atual × mínima, comprimento, método, ΔV, status `ok|sem_secao|subdimensionada|sem_comprimento|queda_excedida|nao_dimensionavel`). Seção, método e comprimento são editáveis (comando `UpdateEdgeCable`, Ctrl+Z); "Dimensionar cabos" aplica o dimensionamento num `Batch`. Comprimento nunca é preenchido pelo sistema — só o usuário digita. Queda limitada a 4 % (`MAX_CABLE_DROP_PCT`), calculada com a Ib real do trecho.
- **Coordenação de proteções** (`lib/diagram/connection/protection-coordination.ts`, puro): proteção ≥ Ib a jusante; relé térmico 0,95–1,25 × In do motor; contator AC-3 ≥ In do motor; seletividade amperimétrica (In do ramal < In a montante); Icu (`icc_kA`) ≥ curto presumido IEC 60909 no secundário do trafo (`uk_pct` de placa, opcional no schema; sem ele, uk típico por kVA declarado como premissa). Vira alertas `coord_*` no diagnóstico; não invalida o `conn_ok` (conectividade). Regras também no mapa de conhecimento da IA.
- **Diagnóstico**: um só "Corrigir com IA" (o laranja, em lote). Avisos de cabo NÃO vão para a IA: "Informar comprimentos" abre a tabela no trecho; "Dimensionar" aplica a NBR 5410 sem crédito.
- **Painel da direita**: a "Sugestão contextual" (M-03/VFD/2,5→4 mm²) e o painel de manutenção eram texto fixo. Agora mostra as pendências reais do diagrama com ações reais e envia perguntas ao chat (`eletricai-ai-prompt`); manutenção é estado vazio honesto.
- **Ladder**: o editor injetava o programa de demonstração (bombas/ETE) em todo projeto sem redes, e o autosave o gravava no projeto do usuário. Agora começa vazio; o exemplo só entra pelo botão "Carregar exemplo (demonstração)"; exemplo injetado e nunca editado é removido ao abrir (`isUntouchedReferenceExample`), editado é preservado.
- **Rótulos**: designação antiga no rótulo ("K1 KM-01 32A") é removida na renumeração, na numeração do painel e na sincronização da IA (`stripStaleDesignation`).
- **Posicionamento de nó novo na correção** (`placeAddedNodes`): colisão por caixa (120 × 100 px) e tentativa em colunas laterais antes de descer — antes só posição idêntica era evitada.
- Lacunas conhecidas: não há tipo DPS (surtos, NBR 5410 §5.4.2) nem cálculo de I'z com fatores de agrupamento/temperatura por trecho; impedância da rede e dos cabos é desprezada no curto (lado da segurança).
- Testes: `unifilar-completion.test.ts`.

### Cálculo de rede do unifilar (2026-11-20, 22ª rodada)

- **Motor** (`lib/diagram/connection/network-calculation.ts`, puro): `analyzeNetwork(doc)` calcula a partir de cada trafo/gerador do diagrama o curto trifásico MÁXIMO (c = 1,10, cabos a 20 °C) e o fase-terra MÍNIMO (c = 0,95, cabos na temperatura final do curto, PE pela NBR 5410 Tab. 58) em cada ponto, somando rede (S"k da concessionária, IEC 60909-0 §6.2), trafo (uk de placa ou típico declarado) e cabos de campo. Fiação interna do painel tem impedância desprezada (premissa). Cabo de campo sem seção/comprimento deixa o ponto **indeterminado** (`blockedByEdgeId`) — nunca presumido. Várias fontes: máximo = maior, mínimo = menor.
- **Verificações** (alertas `net_*` no diagnóstico, cada uma com o item da norma): seccionamento automático TN (Ik1 mín. no ponto mais distante da zona do disjuntor ≥ disparo instantâneo B 5×/C 10×/D 20×In — NBR 5410 §5.1.2.2.4); TT exige DR a montante de toda carga; queda total ≤ 7 % desde a fonte (§6.2.7.1); cabos que suportam o curto do seu ponto por < 10 ms (um aviso agregado pedindo conferir o I²t de passagem do disjuntor — não é erro, depende de catálogo); esquema de aterramento não informado (verifica como TN, falha vira aviso). IT não é calculado (premissa).
- **Icu no ponto de instalação**: `protection-coordination.ts` agora compara a capacidade de interrupção com o curto LOCAL de cada disjuntor; sem dados a montante, usa o curto do secundário (maior, lado da segurança) e diz isso na mensagem.
- **Dados da rede são do projeto**: `metadata.network` (`earthing`, `utilityScc_MVA`, `ambientTemp_C`; schema opcional, retrocompatível), alterados pelo comando reversível `UpdateNetworkSettings`. Agrupamento por cabo em `cable.groupedCircuits` (Tab. 42); temperatura e agrupamento entram no dimensionamento (`sizeConductorNBR5410`).
- **UI**: aba "Cálculos NBR 5410" ganhou o painel de rede (`components/editor/network-panel.tsx`: dados, tabela por ponto com curto máx./mín., queda total e Icu, premissas) e coluna de agrupamento na tabela de cabos. "Mostrar resultados no diagrama" (`network-overlay-store.ts`, preferência local) desenha etiquetas no canvas (`render/network-overlay.ts` puro + `DiagramStage.setNetworkBadges`, camada sem eventos, cores da paleta, cálculo com debounce de 150 ms). Verificado em E2E no projeto de demonstração, sem erros.
- **IA**: regras de cálculo de rede no mapa de conhecimento (pedir aterramento/S"k/uk ao usuário; nunca inventar).
- Próximos: DPS (§5.4.2); revisão aprovada e congelada (hash) com memorial por revisão.
- Testes: `network-calculation.test.ts`.

### Curvas de disparo e seletividade (2026-11-20, 23ª rodada)

- **Curvas** (`lib/diagram/connection/trip-curves.ts`, puro): faixas dos LIMITES da norma — disjuntor IEC 60898-1 (1,13/1,45/2,55·In e magnético B 3–5, C 5–10, D 10–20 × In, ≤ 0,1 s; abaixo do magnético mínimo não abre em menos de 0,1 s), relé térmico IEC 60947-4-1 Tab. 3 (1,05/1,2·Ir e janela da classe em 7,2·Ir) e dano adiabático do cabo (k·S/I)². Não são curvas de fabricante (premissa exibida).
- **Seletividade** (`selectivityByCurves`): método amperimétrico — sobrecarga exige In(montante) ≥ 1,6 × In(jusante) (`LOW_OVERLOAD_RATIO`, aviso); no curto, seletivo até o magnético MÍNIMO de montante, comparado com o curto LOCAL do disjuntor de jusante (total/parcial/indeterminada). In(montante) ≤ In(jusante) = `NO_SELECTIVITY` (erro). Parciais viram UM aviso agregado (`PARTIAL_SELECTIVITY`). As bandas da norma NÃO decidem a seletividade na sobrecarga: são extremos e se sobrepõem até em pares seletivos na prática (gerariam erro falso).
- **Partida de motor** (`motorStartChecks`): DOL ≈ 7·In, estrela-triângulo ≈ 7/3·In; inversor/soft no caminho dispensam. Corrente de partida ≥ magnético mínimo do disjuntor do ramal = `BREAKER_TRIPS_ON_START` (erro); pico do 1º meio ciclo (≈ 2 × eficaz, premissa) ≥ magnético mínimo = `START_INRUSH_RISK` (aviso).
- **UI**: gráfico tempo × corrente log × log (`components/editor/trip-curve-chart.tsx`, SVG próprio) na aba "Cálculos NBR 5410": escolhe a carga, desenha a cadeia de proteção (disjuntores e relé térmico como faixas, cabos tracejados), marca Ib, partida, curto mínimo F-T e curto máximo no ponto; tabela de pares com relação de In, limite e veredito. Verificado em E2E no projeto de demonstração.
- Testes: `trip-curves.test.ts`.

### DPS — proteção contra surtos (2026-11-20, 24ª rodada)

- **Bug**: o item "Protetor contra Surtos" da biblioteca virava `lightcurtain` (cortina de luz) ao ser solto no unifilar. Agora existe o tipo **`spd`** (schema com `spd_class` I/II/III, `uc_V`, `up_kV`, `in_kA`, `iimp_kA`, `poles`), símbolo IEC 60617, portas, terminais (L1–L3, N → PE), designação `F` (IEC 81346), multifilar 3F+N e parâmetros no painel.
- **Regras** (`lib/diagram/connection/surge-protection.ts`, puro; alertas `spd_*`, fora do `conn_ok`): DPS no ponto de entrada (origem = fonte → geral → primeiro barramento/derivação), obrigatório com alimentação aérea ou SPDA (`metadata.network.overheadSupply`/`lightningProtection`; não informado = aviso); SPDA exige classe I com Iimp ≥ 12,5 kA; classe II na origem com In ≥ 5 kA; Uc ≥ 1,1·U0 (TN/TT) ou ≥ U (IT); Up ≤ categoria II (1,5/2,5/4 kV por U0); fusível/disjuntor próprio do DPS. Uc/Up/In/Iimp ausentes = pendência (`SPD_DATA_MISSING`), nunca presumidos.
- **Cabos do DPS**: seção mínima 4 mm² (16 mm² classe I) — antes seriam dimensionados pelo In do disjuntor geral.
- **UI**: dados da rede ganharam "Alimentação aérea" e "Edificação com SPDA" (Não informado/Sim/Não). IA: regra do DPS no mapa de conhecimento.
- Próximo: revisão aprovada e congelada (hash) com memorial de cálculo por revisão.
- Testes: `surge-protection.test.ts`.

### Revisão congelada e unifilar só com dados reais (2026-11-20, 25ª rodada)

- **Revisão aprovada e selada** (`lib/dossier/revision-seal.ts` puro + `approveAndEmitDossier`/`verifyApprovedRevisions`): só owner/admin/engineer aprovam (`authorizeProjectAccess`); a emissão é BLOQUEADA com erro no diagnóstico do unifilar ou parâmetro padrão não confirmado. O servidor grava em `project_versions` o snapshot + `calculationMemorial` (curto por ponto, cabos, achados, premissas — mesmos motores do editor) + `revisionSeal` (SHA-256 do conteúdo em JSON CANÔNICO — o JSONB reordena chaves — e do memorial, responsável, registro, ART opcional) e acrescenta `PROJECT_REVISION_APPROVED` na trilha de auditoria encadeada (cliente não escreve nela). A verificação recalcula o hash e compara com o da AUDITORIA: "íntegra", "ADULTERADA" ou "sem selo"; também diz se o canvas mudou depois da última revisão. Sem migration (usa `project_versions` + `audit_logs`). Revisão = maior `version_number` + 1; todos os erros de banco conferidos.
- **Dados inventados removidos**: defaults de fabricante/modelo de marcas na biblioteca (Schneider/WEG/Rockwell/Siemens/Stemac) e CPU/protocolo de CLP; painel de propriedades com 7,5 kW / 15,2 A / "W22 Premium" / "iC60N" / Icu "10 kA" fixos (agora o valor real ou "não informado"); aprovação que gravava "Engenheiro Responsável Técnico"/"CREA / CFT" quando o campo vinha vazio (agora obrigatório); queda de tensão com 20 A "padrão"; prefill de 45 m no estudo elétrico; fornecedor de CLP padrão no dossiê; botão do CCM que gravava a planta de demonstração no unifilar do cliente.
- **Memorial do dossiê** (`lib/dossier/calculations.ts`): usava 20 m, 10 kA, Icu 10/25 kA, 5,5 kW e o disjuntor que ELE escolhia. Agora usa cabo (seção/comprimento/método), disjuntor (In/curva/Icu) e disjuntor geral do PROJETO; ausência = pendência (`lengthM`/`voltageDropPct`/`voltageDropPass`/`breakingCapacityIcuKa`/`presumedIccKa` = null; `cableSource`/`protectionSource`/`mainBreakerSource` dizem se é do projeto ou recomendado). Curto presumido vem do cálculo de rede. Queda não verificada = PENDENTE, nunca "aprovada".
- **BOM do dossiê** (`lib/dossier/bom.ts`): só equipamentos e cabos que existem no projeto, com os dados informados; sem DPS/DR/botoeiras/fonte/CLP/sensores/cabos de comando inventados.
- **Padrões da biblioteca** (`params.unconfirmed`): símbolo novo nasce com valores nominais marcados como não confirmados (e a conversão de projetos antigos sem potência marca `power_kW`); editar o parâmetro confirma; o diagnóstico avisa (`defaults_*`) e a emissão bloqueia.
- **Migração v2→v3**: Icu, curva e polos de disjuntores de projetos antigos eram descartados — agora preservados.
- Testes: `revision-seal.test.ts`, `engineering-dossier.test.ts` (atualizado: não exige mais os dados inventados).

### Valores da IA, IT, arco elétrico e multifilar (2026-11-20, 26ª rodada)

- **Valores não confirmados** (`lib/diagram/unconfirmed-params.ts`, fonte única): todo valor nominal escolhido pelo sistema fica em `params.unconfirmed` — biblioteca (`defaultNodeParams`), IA do canvas (`sanitizeAiPatch`: nó novo = tudo pendente; atualização = só o que mudou, somado ao que já estava pendente), Arquiteto (`convertArchitectResultToDiagramDoc`) e migração v2→v3. Editar o campo confirma; o painel de propriedades lista as pendências e tem **"Confirmar valores conferidos"** (comando reversível). O diagnóstico `defaults_*` avisa e a emissão da revisão bloqueia.
- **Esquema IT** (`network-calculation.ts`): segunda falta com massas interligadas e neutro distribuído (caso desfavorável): I = Ik1mín/2 comparada ao disparo instantâneo (`IT_SECOND_FAULT_FAIL/PENDING`, NBR 5410 §5.1.2.2.4.4) + aviso obrigatório de DSI (`IT_IMD_REQUIRED`). Premissas declaradas.
- **Arco elétrico — a fórmula antiga era inventada**: `arcFlashIEEE1584` usava uma equação que não é a do IEEE 1584 e o limite de aproximação estava INVERTIDO (energia baixa dava limite maior que a distância de trabalho). Reescrito com o modelo empírico IEEE 1584-2002 para BT (corrente de arco eq. 1, energia normalizada, Cf 1,5, expoente por tipo de equipamento, K2 = 0 no IT); conferido com cálculo manual (480 V/10 kA/painel/0,1 s ≈ 8,9 J/cm²).
- **Arco por quadro** (`lib/diagram/connection/arc-flash.ts`, puro): cada barramento/CCM usa o Ik3 máx. do ponto, a tensão da fonte e o tempo MÁXIMO da faixa do disjuntor de montante na corrente de arco E em 85 % dela (pior caso, IEEE 1584 §9.10.4); tempo limitado a 2 s quando a faixa não garante disparo (premissa). Gap/distância típicos por tipo (painel/CCM 25 mm/455 mm; quadro ≥ 630 A 32 mm/610 mm). Sem curto, tensão ou disjuntor com In → pendência. Alertas `arc_*` (> 40 cal/cm² = ERRO, cat. ≥ 3 = aviso; fora de `conn_ok`). UI: tabela na aba "Cálculos NBR 5410" (`arc-flash-panel.tsx`), etiqueta no canvas e **etiquetas para impressão** (`arc-flash-labels.ts`: HTML autônomo, todo texto escapado, sem script, rotulado como indicativo).
- **Multifilar — auditoria**:
  - Nenhum circuito levava PE: agora o cabo que chega à carga leva PE (`3F+PE` motor/banco de capacitores; `F+N+PE` monofásico; `load` ≥ 300 V → `3F+PE`); pontes internas do painel sem PE. Novo valor `3F+PE` em `circuitConfig` (schema, modelo unificado, JSON schema da IA, fiação) — extensão compatível.
  - Inversor → motor saía `3F+N` (neutro inventado): a carga define o circuito.
  - Ponte entre dispositivos sem informação (contator → contator) caía em `F+N` mesmo em circuito trifásico: `inferCircuitConfigInDoc` herda da carga a jusante (ou da fonte a montante).
  - Sincronização não levava seção/comprimento editados no unifilar ao multifilar: corrigido.
  - Importador convertia `3F+PE` em `3F+N+PE` (neutro inventado): corrigido.
  - Queda de tensão do diagnóstico usava 380/220 V e cos φ 0,85 fixos e um `drop_V` sem uso: agora é a MESMA da tabela de cabos, com a tensão da fonte do diagrama (`systemLineVoltage`; sem fonte, 380/220 V declarados como premissa).
  - Removidos `lib/diagnostics/{rules-catalog,conductor-solver,draft-orchestrator}.ts` (código morto: sem importadores no app; adotavam 4 mm²/25 m/20 A).
- Sem dados de catálogo, continuam fora: curvas de fabricante, tabelas de filiação (cascata) e I²t de passagem — são declarados como premissa, nunca presumidos.
- Testes: `unconfirmed-params.test.ts`, `arc-flash-board.test.ts`, IT em `network-calculation.test.ts`, IEEE 1584 em `electrical-sim.test.ts`, PE/propagação/sincronização em `multifilar.test.ts`.
- **/ai "Aplicar" — canvas vazio corrigido**: o resultado ficava só na memória e o workspace abria SEM projeto; ao criar/abrir um projeto, o carregamento (vazio) sobrescrevia tudo. Agora os três botões criam um projeto novo (nome = título do resultado), gravam o snapshot completo (`saveProject` + versão) e abrem `/workspace?projectId=<id>` no modo escolhido. Erros (ex.: limite de projetos do plano) aparecem em aviso. Teste: `ai-apply-snapshot.test.ts`.
- **Botões invisíveis**: `--gradient-primary` não existia (fundo transparente + texto escuro) — "Aplicar como Unifilar", enviar no /ai, criar projeto no onboarding, simulação e runtime. Definido em `styles.css` (claro e escuro).
- **Versões**: `autoSaveVersion` do Arquiteto gravava em `project_versions` um formato próprio no projeto que estivesse aberto (removido); "Salvar versão" da barra superior gravava só `{nodes, edges}` e falhava sempre com "Nenhum projeto ativo" (`useCurrentProject` nunca era definido — agora é definido ao carregar o projeto) — passa a gravar o snapshot completo validado. `restoreProjectVersion` recusa versão em formato antigo (antes restaurava e deixava o canvas vazio) e grava pelo `saveProjectRecord`.

### Ladder acompanha o unifilar (2026-11-20, 27ª rodada)

- **Antes**: o Ladder não tinha vínculo com o unifilar — a "ponte" antiga (`simulation/unifilar-ladder-bridge.ts`) lia o store legado e só rodava por botão em Simulação; o Arquiteto gerava redes próprias com endereços %I inventados e **parada em XIO** (botão NA: fio rompido não parava o motor) e um FBD de blocos AND/TON soltos.
- **Gerador** (`lib/ladder/from-unifilar.ts`, puro): cada motor da frota (`buildMotorFleet`) vira redes com a função real — partida direta/soft-starter (selo partida NA/parada NF em série com emergência `S0_OK` ou a tag do botão de emergência do diagrama, `Q_OK` do disjuntor e `F_OK` 95-96 do térmico — NF, 1 = íntegro), inversor (`<T>_MARCHA` + `<T>_PRONTO`), estrela-triângulo (linha + `K_Y`/`K_D` com TON e intertravamento; aviso para desenhar os contatores e ajustar o tempo sugerido de 5 s) e sinalização `<M>_FALHA`; contator que alimenta carga não motora vira liga/desliga. Operandos = TAGS do unifilar (sem endereço físico inventado; mapeamento %I/%Q no editor do CLP). Tags com `direction` (entrada/saída/memória) — a referência cruzada reconhece as entradas.
- **Sincronização** (`hooks/use-unifilar-ladder-sync.ts`, montado no workspace após o carregamento, debounce 400 ms): redes geradas têm id `uf-…` e `source.signature` (lógica efetiva da topologia + rótulo + comentário). Não editadas acompanham o unifilar (e saem quando o equipamento sai); **editadas pelo engenheiro passam a ser dele** e não são sobrescritas; redes do usuário nunca são tocadas; bobina que o usuário já programa não é gerada de novo (sem bobina dupla); sem mudança, mesma referência (não marca o projeto como alterado). Chave "Acompanhar o unifilar" no editor (preferência local) + selo por rede ("do unifilar" / "editada por você") + avisos (sem emergência no diagrama, ramal sem contator).
- **Arquiteto (/ai e chat do canvas)**: Ladder e FB Electric Studio agora vêm do unifilar gerado (`buildLadderFromUnifilar` + `syncMotorLogicFromUnifilar`).
- Verificado no projeto de demonstração (E2E, sem erros): 18 redes geradas; os testes simulam no `scanRungsPure` (selo, térmico, emergência, temporização Y-Δ). Testes: `ladder-from-unifilar.test.ts`.

### Partida com reversão, kits de partida e FB Studio acompanhando o unifilar (2026-11-20, 28ª rodada)

- **Kits de partida** (`lib/diagram/starter-kits.ts` + seção "Kits de partida de motor" na biblioteca): partida direta, estrela-triângulo e **reversão** soltam o ramal completo e LIGADO num só comando (Ctrl+Z desfaz tudo), com tags únicas IEC 81346 (`assignKitTags`: próximo Q/K/F/M livre) e valores da biblioteca como não confirmados.
- **Reversão**: novo `startMethod: "REVERSING"` (schema, modelo unificado, dossiê, CCM — corrente/tempo de partida = partida direta) e **função do contator** `role` (`line|star|delta|forward|reverse`, opcional; campo "Função no ramal" no painel; não é dado nominal). Dois contatores em paralelo sem inversor são tratados como reversão mesmo com "DOL" (aviso para declarar a função).
- **Ramal com contatores em paralelo** (`discoverFeederChain`): o relé térmico/contator com 3 ligações parava a busca (os contatores nunca eram achados). Agora atravessa contator e térmico; `chain.contactorIds` lista todos; o principal é o de função "line"/"forward".
- **Fonte única de nomes** (`motorControlPlan` em `lib/ladder/from-unifilar.ts`): Ladder e FB Electric Studio usam os MESMOS operandos (K1, F1_OK, Q1_OK, M1_PARTIR, M1_PARAR, M1_HORARIO, M1_ANTI_HORARIO, S0_OK). O Studio antes usava `PARTIDA_M1`/`K_M1`/`EMERG_OK` e ignorava disjuntor e inversor.
- **Ladder**: reversão = dois selos, cada sentido intertravado pelo outro (XIO) — inverter só depois de parar; estrela-triângulo usa os contatores REAIS do desenho pela função (antes inventava `K_Y`/`K_D`).
- **FB Electric Studio acompanha o unifilar** (`autoSyncStudioFromUnifilar`, no mesmo hook do Ladder): a página "Motores (unifilar)" guarda `source.signature` (FNV-1a da lógica — blocos, ligações, símbolos; sem posições). Lógica editada pelo engenheiro → página dele (aviso; "Gerar do unifilar" força). Posições de blocos movidos são preservadas. Reversão no Studio: dois RS com reset = desliga OU outro sentido (leitura da saída no ciclo anterior via entrada `K_RET` — quebra o laço algébrico como num CLP).
- **Correções achadas no caminho**: lista de partidas do painel não tinha estrela-triângulo; o leitor de briefing transformava "estrela-triângulo" em **soft-starter**; `motorStartingCurrent` usava 7·In na estrela-triângulo (agora 7/3·In); esquema da ferramenta do Arquiteto só aceitava DOL/SOFT/VFD.
- Pendente (sem dado/representação): inversão de fases L1↔L3 da reversão não é desenhada no multifilar.
- Testes: `starter-kits.test.ts` (kits, reversão e Y-Δ simulados no Ladder e no Studio, sincronização do Studio), `compact-studio-unifilar-sync.test.ts` atualizado.

### IA assistente em todos os editores, barra do FB Studio, multifilar da reversão e kit por toque (2026-11-20, 29ª rodada)

- **Por que a IA "não ajudava"**: (1) o chat do canvas estava SEMPRE em modo patch — até "oi" ia ao gerador de patch e voltava "[UNKNOWN] A IA não retornou um patch válido"; o modo alternativo chamava o Arquiteto (gera um projeto inteiro). Não havia conversa. (2) O contexto de erros vinha do validador LEGADO (`useProjectStore` + `validateProject`), não do diagnóstico real; Ladder/Studio/SCADA não entravam. (3) Uma conversa só por projeto.
- **Assistente por editor** (`lib/ai/editor-assistant.functions.ts`, `askEditorAssistant`, middleware de auth + cota + rajada; tokens contabilizados como o chat): persona de engenheiro que conversa normalmente (cumprimentos, perguntas gerais) e AGE no editor aberto, aplicando NBR 5410/14039, NR-10/12, IEC 60204-1/60947/60909/61131-3, ISA-101/18.2, NFPA 70E/IEEE 1584; nunca inventa dado (pergunta). Separa o diagnóstico em: corrijo agora / preciso de dado seu / informativo. Saída JSON `{reply, actions}`.
- **Contexto real por editor** (`lib/ai/editor-context.ts`, puro): unifilar/multifilar (equipamentos, ligações, cabos, dados da rede, diagnóstico completo), Ladder (redes, tags com valor/sentido e **por que cada rede está desligada agora** — ex.: "bloqueada por F1_OK=0" — e falhas ativas), FB Studio (páginas, símbolos, diagnóstico), SCADA/Alarmes/Simulação (alarmes ativos).
- **Ações validadas** (`lib/ai/editor-actions.ts`, Zod + lista por editor; inválidas/descabidas descartadas e contadas): `diagram_set_params` (valor pela tag, validado pelo schema do tipo, fica NÃO CONFIRMADO; não troca tipo nem confirma), `diagram_set_network` (só dado informado pelo usuário), `diagram_dimension_cables`, `diagram_change` (estrutura → motor de patch com reparo e créditos), `ladder_set_tag` (valor SIMULADO), `ladder_upsert_rung`/`ladder_remove_rung` (rede gerada alterada pela IA passa a ser do engenheiro), `ladder_resync_unifilar`, `studio_regenerate_from_unifilar`, `open_editor`. Executadas no navegador (`editor-assistant-client.ts`) com **"Desfazer o que a IA fez"**. Nada comanda equipamento real.
- **Uma conversa por editor**: `getOrCreateProjectConversation` ganhou `scope` (título `Editor · <editor>`); o chat guarda uma thread por editor e a resposta volta para a thread em que a pergunta foi feita. Cabeçalho mostra o editor; quadro "Problemas neste editor" com os problemas reais; ferramentas do unifilar (briefing, atalhos) só no unifilar; botão de exemplo legado removido. **"Corrigir com IA" do diagnóstico agora passa pelo assistente** (que corrige valores, pede dados e só aciona o patch para mudança estrutural).
- Verificado no diagnóstico do projeto de demonstração: os 6 avisos de relé térmico acima de 1,25 × In são corrigíveis por `diagram_set_params` (teste), aterramento/SPDA dependem do usuário, seletividade parcial/I²t são informativos.
- **Barra lateral do FB Studio** (`editor-studio-sidebar.tsx`): o host não tinha caso para `compactStudio` (painel/gaveta vazios). Agora: sincronização com o unifilar + "Gerar/regenerar", páginas (navegam via `useStudioNavigation`), diagnóstico do programa, símbolos de E/S com busca. `hasLeftSidebar(mode)` evita alça/gaveta vazias em modos sem barra.
- **Multifilar da reversão**: `edge.phaseSwap` (opcional) na saída do contator com função `reverse` — condutores L1↔L3 trocados e marca "⇄ L1↔L3" no desenho (`conductorLabelsFor`, `isPhaseSwapFeed`; sincronizado).
- **Kit por toque (celular)**: tocar no cartão do kit insere o ramal num espaço livre à direita do diagrama e enquadra o kit (independe do auto zoom). Verificado em Pixel 7 emulado.
- **Sem chave de IA neste ambiente**: a resposta do modelo não foi exercitada aqui (sem login de produção e sem copiar segredos de produção); contexto, ações, filtros, aplicação e desfazer têm testes (`editor-assistant.test.ts`) e o chat por editor foi verificado em E2E.

### Landing para empresas (2026-11-20, 30ª rodada)

- **Exemplo técnico corrigido** (`routes/index.tsx`, aba "Exemplo prático"): mostrava Q1 63 A protegendo cabo 6 mm² B1 (I'z ≈ 41 A) com o texto "Ib ≤ In ≤ Iz" — violava a NBR 5410 que a página anuncia. Agora: motor 7,5 kW (Ib 15,2 A), Q1 20 A curva D (partida ≈ 106 A < 200 A), 3×4 mm² B1 (I'z 32 A), 30 m, ΔU ≈ 1,0 %, rotulado como exemplo. O Ladder do exemplo usava emergência/térmico em XIO (botão NA) — agora contatos NF íntegros em XIC + selo, igual ao gerador. BOM sem marcas de fabricantes.
- **Novas seções** (`components/landing/enterprise-sections.tsx`): recursos (o que existe hoje), para quem é + comparação com ferramenta de desenho genérica (sem marcas), segurança e conformidade (só controles implementados), plano **Corporativo sob consulta** (sem prometer SSO), programa piloto (empresas fundadoras = oferta de lançamento), FAQ (`lib/marketing/landing-faq.ts`, também em JSON-LD FAQPage), aviso de responsabilidade técnica (ART/NR-10/NR-12) e **pedido de demonstração**.
- **Pedido de demonstração** (`lib/marketing/sales-contact.ts`, puro): sem tabela de leads (não há backend); o pedido é validado por Zod (controle de caracteres removido) e enviado pelo canal REAL configurado — `VITE_SALES_WHATSAPP` (DDI + número, só dígitos) e/ou `VITE_SALES_EMAIL` (cai para `VITE_LEGAL_CONTACT_EMAIL`). Sem canal válido, a página diz que o canal está sendo configurado — nunca finge que enviou.
- Hero orientado a resultado + "Agendar demonstração"; menu com Recursos/Exemplo prático/Segurança/Contato; planos em cartões no celular (a tabela escondia Pro e Premium); rodapé com razão social/CNPJ/contato de `legalEntity()` ("a informar" sem as variáveis); JSON-LD com `<` escapado.
- **Pendente do dono**: preencher `VITE_LEGAL_*` e `VITE_SALES_*` na Vercel (e novo deploy). Prova social só com casos reais autorizados.
- Testes: `landing-enterprise.test.ts`; E2E desktop e Pixel 7 sem erros e sem rolagem horizontal.

### ElétricAi Runtime — execução em campo (2026-11-20, 31ª rodada)

- **O que é**: o programa dos editores (Ladder + FB Electric Studio, mesmos motores puros) executado num gateway (PC/Raspberry Pi/Linux) com Modbus TCP REAL de leitura e escrita, WebVisu local e ligação com a nuvem. Sem editor novo: tudo na aba **Runtime** do editor CLP (`components/plc/runtime-panel.tsx`). Guia: `docs/RUNTIME.md`.
- **Descoberta**: os drivers do gateway antigo (`lib/edge/drivers/*`, `modbus-handlers.server.ts`) são SIMULADOS (sem socket) e somente leitura — continuam como estão (testes de leitura apenas). O Runtime tem driver próprio em `lib/runtime/node/`.
- **Módulos** (`src/lib/runtime/`): `io-map.ts` (Zod: conexões, pontos tag→endereço, emergência; escrita negada por padrão, saída com escrita exige valor seguro, endereço de escrita único), `program-package.ts` (pacote + SHA-256 de JSON canônico; verificação no gateway), `runtime-core.ts` (imagem de processo, entradas congeladas, Ladder + Studio, comando de operador só em memória), `write-guard.ts` (SOMBRA → EM OPERAÇÃO → SEGURO; arme LOCAL; qualquer falha trava em SEGURO e escreve o valor seguro), `modbus-codec.ts`; Node: `node/modbus-tcp-client.ts` (MBAP, FC1-6/15/16, eco conferido, timeout derruba a conexão), `node/modbus-tcp-server.ts` (escravo de bancada/testes), `node/field-io.ts` (leitura agrupada, escrita por exceção + reescrita a cada 1 s), `node/runtime-daemon.ts`, `node/webvisu-server.ts` (PIN em tempo constante, bloqueio após 5 erros, cookie HttpOnly SameSite=Strict, anti-CSRF por cabeçalho + Origin, CSP com nonce, sem HTML de dados), `node/cloud-link.ts` (só HTTPS; pacote aceito só com hash conferido; nuvem pode PARAR, nunca armar). Executável: `src/edge-runtime/index.ts` → `bun run build:runtime` (`dist-runtime/`, ignorado no git/lint).
- **Nuvem**: `runtime.functions.ts` (publicar/aprovar/revogar pacote, cadastrar gateway com token `ert_…` mostrado uma vez e guardado como SHA-256, implantar só pacote aprovado, parar/revogar; papel owner/admin/engineer, parada também operator; planos Pro/Premium; projeto de demonstração bloqueado; auditoria encadeada) e rotas `/api/public/runtime/report` (estado, telemetria por exceção em `tag_samples` com origem `INTERNAL_RUNTIME`, eventos na auditoria) e `/api/public/runtime/package`.
- **Migration** `20261120150000_runtime_packages_devices.sql` (tabelas `runtime_packages`/`runtime_devices`, RLS de leitura por membro, sem escrita de cliente, coluna do hash do token não legível): **PENDENTE de aplicação** — o MCP pediu confirmação e expirou. Enquanto isso a aba mostra "sendo ativado" e geração/download do pacote funcionam.
- **Verificado**: 22 testes novos (`runtime-core`, `runtime-modbus` contra socket real, `runtime-daemon-e2e` com WebVisu+arme+emergência, `runtime-cloud` com nuvem falsa e pacote adulterado); executável compilado rodando offline; pacote gerado na tela a partir do projeto de demonstração (18 redes + FB Studio) executado no Runtime: 308 varreduras, 0,17 ms/varredura, sem falhas; hash do navegador = hash do servidor.
- **Pendente**: OPC UA/MQTT/Modbus RTU/GPIO com escrita; tipos gerados (`types.ts`) com as tabelas novas.

### WebVisu com a tela de processo completa (2026-11-20, 32ª rodada)

- O WebVisu desenha a MESMA tela do Editor HMI: geometria em `lib/hmi/hmi-layout.ts` (puro; `rotatePort` agora é fonte única — o editor reexporta), símbolos pelo MESMO `ProcessSymbol` renderizado no gateway com `react-dom/server` (`lib/runtime/node/hmi-symbol-svg.tsx`, cache por tipo+estado, animações embutidas) e servidos em `GET /api/hmi/symbol?type&s` como **imagem** SVG (CSP `default-src 'none'`, sessão obrigatória, tipo e chave validados).
- Estado só das tags reais (`lib/hmi/hmi-tag-state.ts`): `<TAG>.LIGADO`/`<TAG>`, `.REVERSO`, `.VELOCIDADE`, `.ABERTA`, `.NIVEL`; sem tag = "sem sinal" (apagado). O fluxo nas ligações NÃO é desenhado (no editor ele é dedução da simulação). Clique no equipamento abre as tags dele (comando só em memória).
- Traçado ortogonal com contorno quando o destino está "atrás" da saída. Rótulos com contorno para leitura sobre as linhas.
- Bundle do Runtime passou a incluir React (1,3 MB). Testes: `webvisu-hmi.test.ts` (geometria, estado, símbolo sem script, rota com CSP e sessão). Verificado no navegador (desktop e Pixel 7) com o executável compilado.
