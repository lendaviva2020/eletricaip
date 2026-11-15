# 11 — Resultados da Execução de Testes

Ambiente: Windows 10, Node 24.15.0, Bun 1.4.2. Execução em 2026-11-15, offline: `NODE_USE_ENV_PROXY=1` e `HTTP(S)_PROXY=http://127.0.0.1:9` bloquearam a saída de rede, e `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `MP_ACCESS_TOKEN`, `UPSTASH_*` e `SUPABASE_SERVICE_ROLE_KEY` foram esvaziadas no próprio comando. O `.env` não foi editado. As saídas brutas ficaram no scratchpad da auditoria (`test-out/*.txt`, `vitest.json`).

| Verificação | Comando | Exit | Resultado |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | **2** | **25 erros TS**: `settings.ai-status.tsx` (10), `ai-chat.functions.ts` (5), `canvas-ai-chat.tsx` (5), `chat.tsx` (3), `ai-gateway.functions.ts` (2). Tipos de retorno de server functions inferidos como `{}`/`unknown` (TS2339/TS18046) e handlers incompatíveis com o middleware (TS2345) |
| Lint | `npx eslint .` | **1** | 30 problemas (29 erros prettier, 1 warning) |
| Formatação | `npx prettier --check .` | **1** | 7 arquivos fora do padrão (gateway de IA e `settings.ai-status.tsx`) |
| Testes unitários/integração | `npx vitest run` | **0** | **165 arquivos, 1.372 testes: 1.372 aprovados, 0 reprovados, 0 pulados** (64,7 s) |
| Auditoria de dependências | `bun audit --audit-level=high` | 1 | **BLOCKED_BY_EXTERNAL_DEPENDENCY** (exige o registry npm; a rede estava bloqueada) |
| Build | `bun run build` | — | **NÃO EXECUTADO**: sobrescreveria `.vercel/output` (artefato de deploy existente). Em lugar disso, o build existente (14/11 17:47) foi varrido; ver doc 07 §4 |
| E2E Playwright | `tests/e2e` (8 specs) | — | **NÃO EXECUTADO** neste ciclo (as specs não foram inspecionadas quanto a chamadas remotas) |
| Testes de RLS | — | — | Ciclo 1: BLOCKED. **Executados no ciclo 4** (ver abaixo) |
| Verificação de cálculos (auditoria) | `bun run tools/calc-check.ts` | 0 | 9 divergências confirmadas (doc 05) |

## Conclusões

1. A branch atual **reprova no CI** (`.github/workflows/ci.yml` roda format:check, typecheck e lint antes dos testes). Os erros de tipo concentram-se no trabalho recente de IA (commit `38267ee`).
2. A suíte verde **não** valida a correção de engenharia: os defeitos P1-CALC-022..027 passam despercebidos.
3. Contagem por categoria: 1 aprovado (vitest), 3 reprovados (typecheck, lint, format), 3 bloqueados (audit, RLS, e2e/remoto), 1 não executado por segurança (build).

## Ciclo 4: Supabase local (Docker 29.4.3, Supabase CLI 2.120.0, cópia isolada de `supabase/`)

| Verificação | Comando / ferramenta | Resultado |
|---|---|---|
| Aplicar as 71 migrations num banco vazio | `supabase start --workdir <scratchpad>` | **Aprovado**: todas aplicadas, exit 0 |
| Isolamento multi-tenant (3 usuários) | `node tools/rls-test.mjs` | **Reprovado**: vazamento cross-tenant via UPDATE e via INSERT de `profiles` (P0-DB-005) |
| Concorrência no save | `bun tools/race-check.ts` | **Reprovado**: 41 de 50 saves concorrentes aceitos indevidamente (P1-DATA-043) |
| Validação do snapshot | `bun tools/snapshot-check.ts` | **Reprovado**: 4 de 4 variações com um campo inválido descartam o projeto inteiro (P1-DATA-044) |
| App no browser contra o Supabase local | — | **Bloqueado pelo código** (`env.ts` rejeita URL local no cliente; P2-DX-060) |

O stack foi encerrado com `supabase stop` ao final; o repositório continua sem alterações (só `docs/audit/`).
