# GATE 4.3.2 — REPRODUCIBLE VERIFICATION EVIDENCE

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Base Commit (Gate 4.3.1):** `29116f7958fc47a5ec4022e5665f7b09e1780912`  

---

## Matriz de Evidências Executadas Após a Última Edição de Código

| Verificação | Comando Executado | Resultado Observado |
|---|---|---|
| Formatação (`prettier`) | `bun run format:check` | `FORMAT_EXIT=0` — `All matched files use Prettier code style!` |
| Tipagem estrita (`tsc`) | `bun run typecheck` | `TSC_EXIT=0` — `0` erros TypeScript (`strict: true`) |
| Análise estática (`eslint`) | `bun run lint` | `LINT_EXIT=0` — `0` erros, `0` warnings |
| Suíte Unitária & Integração (`vitest`) | `bun run test` | `VITEST_EXIT=0` — **`150 passed (150)`** arquivos, **`1298 passed (1298)`** testes em `48.92s` (inclui `9/9` em `gate-4-3-2-cloud-multi-instance-and-rpcs.test.ts`) |
| Build Produção Cloud (`vite` + Nitro) | `bun run build` (`NODE_OPTIONS=--max-old-space-size=4096`) | `BUILD_EXIT=0` (`48.91s` cliente, `46.67s` server `.vercel/output/nitro.json`) |
| Varredura do Bundle Estático | Scan Regex em `.vercel/output/static/` | `STATIC_FILES=279`, `STATIC_LEAKS=0` (`0` segredos, `0` `node:sqlite`/`node:net`/`node:dns`) |
| Build Edge Daemon | `bun run build:edge` | `EDGE_BUILD_EXIT=0` (`dist-edge/eletricai-edge-daemon.js` `99.36 KB`) |
| Auditoria Dependências | `bun run security:audit` | `BUN_AUDIT_EXIT=0` (`0` HIGH/CRITICAL em `910` pacotes; `2` abaixo de HIGH dev-only) |
| Varredura Trivy (`vuln,secret`) & SBOM | `trivy fs --scanners vuln,secret --severity HIGH,CRITICAL .` | `TRIVY_SCAN_EXIT=0` (`0` vulnerabilidades HIGH/CRITICAL, `0` segredos; SBOM `GATE_4_3_2_SBOM.cdx.json`) |
| E2E Navegador Real (`playwright`) | `.\node_modules\.bin\playwright.exe test` (Vite dev `127.0.0.1:3000`) | `PW_ALL_EXIT=0` — **`55 passed (3.2m)`** (`358` controles inventariados + 6 viewports `1280x720`, `1366x768`, `1440x900`, `1600x900`, `1920x1080`, `390x844`) |
| Daemon PostgreSQL / Docker Local | `Start-Service com.docker.service`, `wsl --status`, `docker info` | **`BLOCKED_BY_ENVIRONMENT`** (`com.docker.service` parado sem elevação, kernel WSL2 e `psql`/`postgres` ausentes no host) |
