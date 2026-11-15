# 01 — Inventário Completo do Repositório

## 1. Preservação do estado Git (somente leitura; nenhuma escrita git feita)

| Repositório | Caminho | Branch | HEAD | Estado |
|---|---|---|---|---|
| Aplicação (alvo) | `eletric/eletricaip` | `feat/ai-continuity-unifilar-connectivity-fix` | `3d78bbb24057e23e57058781c952156ea97c45d2` | Árvore limpa (0 modificados, 0 não rastreados), nenhum stash, 45 branches locais/remotas; origin `github.com/lendaviva2020/eletricaip` |
| Workspace externo | `eletric/` | `master` | `6562891f323b2e53f2c8386794e70cac74168449` | Não rastreados: `ECC/`, `eletricaip/`, `package-lock.json` |

Ignorados relevantes no repo da aplicação: `.env`, `.vercel/`, `data/`, `dist-edge/`, `logs/`, `playwright-report/`, `test-results/`, `supabase/.temp/`, `.agents/`, `.bun-cache/`.
Últimos commits: `3d78bbb` fix(vite) pre-bundle radix · `38267ee` AI continuity gateway / auto-repair / unifilar connectivity · `f8a8ac6` docs workspace-p0 · `c9bec9b`/`1243cd1` remoção do Digital Twin · `35b1d13` unifilar connectivity.

Ao final do ciclo, a única alteração no repositório é a pasta nova `docs/audit/` (não rastreada).

## 2. Totais (arquivos rastreados)

- **1.088 arquivos rastreados.** Por extensão: ts 517 · tsx 220 · md 215 · sql 72 · json 17 · woff2 10 · mjs 6 · svg 5 · yml 2 · toml 2 · sh 2 · css 2 · mp4 2 · outros 16.
- **Código próprio:** 666 arquivos / 179.073 linhas (source 556 / 158.708 · migrations 71 / 12.551 · Edge Functions 4 / 1.599 · config/scripts 35 / 6.215).
- **Testes:** 175 arquivos / 93.110 linhas (`src/__tests__` + `__tests__` dentro de `src/lib/**` + `tests/e2e`).
- **Documentação:** 223 arquivos / 154.555 linhas (relatórios Gate anteriores, não usados como evidência).
- **Gerados:** `bun.lock`, `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts` (3.517 linhas).
- **Binários:** 21 (fontes, mídia de landing, logos).

## 3. Stack verificada no código

TanStack Start 1.168 / Router 1.170 (SSR, server functions com `createServerFn` + middleware) · React · Vite via `@lovable.dev/vite-tanstack-config` · Nitro preset Vercel · Tailwind 4 · Radix UI · Monaco · Konva / PixiJS / ReactFlow / Recharts · Supabase JS 2.105 (Auth, PostgREST, RPC) · Upstash Redis rate limit · Google GenAI (Gemini) · Stripe e Mercado Pago (webhooks próprios) · `@lovable.dev/mcp-js` (rota `/mcp`) · edge daemon em Bun (`src/edge-daemon`, compilado para linux-x64/arm64/win) · Vitest + Playwright.

## 4. Inventário por módulo (arquivos / linhas / tipos)

| Módulo | Arquivos | Linhas | Composição |
|---|---|---|---|
| `docs` | 215 | 152739 | doc:215 |
| `__tests__` | 154 | 89934 | test:154 |
| `supabase` | 77 | 16804 | config/script:2, edge-function:4, migration:71 |
| `routes` | 48 | 13943 | source:48 |
| `lib/studio` | 43 | 13619 | test:13, source:30 |
| `lib` | 44 | 11844 | source:44 |
| `lib/edge` | 26 | 11543 | source:26 |
| `lib/diagram` | 24 | 9025 | source:24 |
| `components/canvases` | 13 | 7972 | source:13 |
| `lib/observability` | 13 | 7083 | source:13 |
| `lib/compact-studio` | 38 | 6946 | source:38 |
| `components/scada` | 18 | 6350 | source:18 |
| `lib/ai` | 13 | 5442 | source:13 |
| `components/ui` | 57 | 5143 | source:57 |
| `lib/scada` | 10 | 5035 | source:10 |
| `components/editor` | 13 | 4656 | source:13 |
| `components` | 23 | 4638 | source:23 |
| `integrations` | 9 | 4429 | source:8, generated:1 |
| `lib/ladder` | 10 | 3990 | source:10 |
| `lib/security` | 20 | 3437 | source:20 |
| `lib/model` | 6 | 3301 | source:6 |
| `lib/importer` | 12 | 3286 | source:12 |
| `lib/fbd` | 14 | 3182 | source:14 |
| `lib/dossier` | 9 | 3064 | source:9 |
| `components/compact-studio` | 8 | 2661 | source:8 |
| `lib/diagnostics` | 8 | 2507 | source:8 |
| `lib/simulation` | 12 | 2505 | source:12 |
| `components/studio` | 9 | 2320 | source:9 |
| `bun.lock` | 1 | 2082 | lockfile:1 |
| `components/simulation` | 4 | 2016 | source:4 |
| `lib/industrial` | 5 | 1935 | source:5 |
| `scripts` | 8 | 1626 | config/script:8 |
| `lib/i18n` | 7 | 1412 | source:7 |
| `components/observability` | 1 | 1320 | source:1 |
| `AGENTS.md` | 1 | 1317 | doc:1 |
| `hooks` | 8 | 1188 | source:8 |
| `lib/palette` | 1 | 1110 | source:1 |
| `routeTree.gen.ts` | 1 | 1071 | generated:1 |
| `tests` | 8 | 997 | test:8 |
| `components/importer` | 1 | 957 | source:1 |
| `components/dossier` | 1 | 928 | source:1 |
| `components/edge` | 1 | 850 | source:1 |
| `edge-daemon` | 4 | 698 | source:4 |
| `lib/plc` | 4 | 562 | source:4 |
| `styles.css` | 1 | 536 | source:1 |
| `catalog` | 1 | 502 | config/script:1 |
| `public` | 25 | 475 | asset:21, config/script:2, doc:2 |
| `lib/editor` | 3 | 453 | source:3 |
| `components/premium` | 5 | 329 | source:5 |
| `lib/mcp` | 7 | 318 | source:7 |
| `lib/design-system` | 3 | 317 | source:3 |
| `components/diagnostics` | 2 | 309 | source:2 |
| `components/fbd` | 1 | 251 | source:1 |
| `deploy` | 2 | 234 | config/script:2 |
| `components/clients` | 1 | 211 | source:1 |
| `lib/workers` | 1 | 206 | source:1 |
| `.lovable` | 3 | 193 | config/script:2, doc:1 |
| `.github` | 2 | 188 | config/script:2 |
| `components/auth` | 1 | 173 | source:1 |
| `package.json` | 1 | 163 | config/script:1 |
| `components/brand` | 1 | 109 | source:1 |
| `server.ts` | 1 | 100 | source:1 |
| `config` | 1 | 94 | config/script:1 |
| `vite.config.ts` | 1 | 89 | config/script:1 |
| `README.md` | 1 | 83 | doc:1 |
| `.env.example` | 1 | 80 | config/script:1 |
| `lib/monaco` | 1 | 80 | source:1 |
| `eslint.config.js` | 1 | 63 | config/script:1 |
| `.gitignore` | 1 | 62 | config/script:1 |
| `types` | 2 | 57 | source:2 |
| `vercel.json` | 1 | 45 | config/script:1 |
| `.prettierignore` | 1 | 31 | config/script:1 |
| `playwright.config.ts` | 1 | 28 | config/script:1 |
| `tsconfig.json` | 1 | 28 | config/script:1 |
| `start.ts` | 1 | 25 | source:1 |
| `components.json` | 1 | 23 | config/script:1 |
| `router.tsx` | 1 | 17 | source:1 |
| `vite-env.d.ts` | 1 | 17 | source:1 |
| `vitest.config.ts` | 1 | 15 | config/script:1 |
| `opencode.json` | 1 | 14 | config/script:1 |
| `roadmap.md` | 1 | 9 | doc:1 |
| `.prettierrc` | 1 | 7 | config/script:1 |
| `.gitattributes` | 1 | 5 | config/script:1 |
| `bunfig.toml` | 1 | 3 | config/script:1 |
| `".lovable` | 1 | 0 | doc:1 |
| `"docs` | 1 | 0 | doc:1 |

## 5. Backend

- **Server functions:** 30 arquivos `*.functions.ts` em `src/lib/**`, mais rotas HTTP em `src/routes/api/public/*` (`iot.ingest`, `stripe.webhook`, `mp.webhook`), `/mcp` e `/.well-known/oauth-protected-resource`.
- **Supabase:** 71 migrations, das quais 11 são `remote_history_placeholder` (o schema base não está no repo). Edge Functions: `ai-electrical-generator`, `ai-fix-diagnostics`, `ai-industrial-architect`, `stripe-webhook`.
- **CI:** `.github/workflows/ci.yml` (format, typecheck, lint, audit, grep de fronteiras, testes, build, scan de bundle, e2e) e `db-backup.yml`.
