# GATE 4.3.1 — VERIFICATION EVIDENCE MATRIX

**Branch:** `gate-4.3.1-security-remediation` (base SHA: `3dac4b9f28f26d11d80e0cc8fb50a6b159b9b8eb`)

---

## 1. Matriz de Evidências Observadas

| Verificação / Suíte | Comando Executado | Escopo Real | Resultado Observado | Status |
|---|---|---|---|---|
| **TypeScript Typecheck** | `bun run typecheck` (`tsc --noEmit`) | Todo o projeto (incluindo Zod `4.6.7`, `.server.ts`, rotas e testes Gate 4.3.1) | **Exit 0 (`0` erros)** | `VERIFIED` |
| **ESLint & Formatação** | `bun run lint` (`eslint .`) | Repositório completo | **Exit 0 (`0` erros, `0` warnings)** | `VERIFIED` |
| **Suíte Vitest Completa** | `bun run test` (`vitest run`) | Todas as `149` suítes (`1.289` testes incluindo regressões Gate 4.3.1, SSRF, Ed25519 OTA, SQLite WAL & webhooks) | **`149/149` arquivos, `1.289/1.289` testes aprovados** | `VERIFIED` |
| **Auditoria de Dependências (`bun audit`)** | `bun audit --audit-level=high` | Grafo completo (`910` pacotes) pós-upgrade para `zod@4.6.7` | **Exit 0 (`0` CRITICAL/HIGH; `2` abaixo de `--audit-level=high`)** | `VERIFIED` |
| **Trivy Scan & SBOM CycloneDX** | `trivy fs --scanners vuln,secret,misconfig --severity "CRITICAL,HIGH" . --quiet` & `trivy fs --format cyclonedx` | Lockfile `bun.lock`, `.env`, bundle `.vercel/output/static`, código | **`0` vulns CRITICAL/HIGH, `0` Secrets, `0` Misconfigs**; [`GATE_4_3_1_SBOM.cdx.json`](file:///c:/Users/98911/Desktop/eletric/eletricaip/docs/security/GATE_4_3_1_SBOM.cdx.json) | `VERIFIED` |
| **Build de Produção (Vite + Nitro)** | `NODE_OPTIONS="--max-old-space-size=4096" bun run build` | Bundle client + servidor SSR | **Exit 0 (`47.41s`)** — módulo `fleet-runtime.server` isolado apenas em `__server.func/_ssr/` | `VERIFIED` |
| **Scan de Bundle Estático** | Node walker em `.vercel/output/static/**` | Todos os `279` arquivos públicos gerados pelo build | **`279` arquivos, `0` `.map`, `0` ocorrências** de segredos ou built-ins Node (`DatabaseSync`, `node:sqlite`, `SERVICE_ROLE_KEY`, etc.) | `VERIFIED` |
| **Sondas HTTP de Segurança ao Vivo** | HTTP requests contra `http://127.0.0.1:3000/` | `/login?redirect=/%09/evil.com?x=1`, `/api/public/mp/webhook?secret=abc`, `/api/public/stripe/webhook`, `/.well-known/oauth-protected-resource` (`X-Forwarded-Host: evil.attacker.com`) | Redirect `307 -> /login?redirect=%2Fdashboard`; MP `401`; Stripe `400`; MCP ignorou host forjado (`true`) | `VERIFIED` |
| **Playwright E2E Completo (`chromium-1440x900`)** | `bunx playwright test` | `tests/e2e/01..07` (`19` rotas, `358` controles, `4` viewports, testes interativos `/settings/protocols` `SIMULATOR` vs `EDGE_READ_ONLY` IMDS block & SCADA demo UUID) | **`52/52` testes aprovados (`2.9m`)** | `VERIFIED` |
| **Subagente Desktop `chrome_devtools` MCP** | `invoke_subagent` (`TypeName: "browser"`) | Conexão remota ao navegador desktop via MCP `list_pages` | Timeout após `1m0s` (`context deadline exceeded` aguardando aprovação remota no Chrome desktop) — substituído com cobertura Playwright real em Chromium headless | `BLOCKED_BY_ENVIRONMENT` |
| **Execução PostgreSQL RLS ao Vivo** | Inspeção de `com.docker.service` e CLI `psql` | `20261111120000` & `20261111180000` em container Postgres local | Docker Desktop parado (`npipe:////./pipe/dockerDesktopLinuxEngine` indisponível) e `psql` ausente; banco remoto `rvaaxvdimggztjxoktvy` protegido por mandato | `BLOCKED_BY_ENVIRONMENT` |
