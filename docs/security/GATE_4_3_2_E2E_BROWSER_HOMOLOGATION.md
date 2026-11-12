# GATE 4.3.2 — REAL BROWSER E2E HOMOLOGATION REPORT (PLAYWRIGHT)

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Executor:** Playwright Test (`chromium`) contra Vite Dev Server (`http://127.0.0.1:3000`)  
**Resultado:** **`55 passed (3.2m)`** (`PW_ALL_EXIT=0`, zero falhas, zero skips)  

---

## 1. Cobertura Executada em Navegador Real

| Suíte E2E | Casos | Resultado | Escopo Validado |
|---|---|---|---|
| `tests/e2e/01-navigation-and-routes.spec.ts` | 19 | `19 passed` | Carregamento sem erros críticos em `/`, `/workspace`, `/dashboard`, `/projects`, `/scada`, `/digital-twin`, `/analytics`, `/catalog`, `/clients`, `/chat`, `/settings`, `/settings/security`, `/settings/edge-fleet`, `/settings/observability`, `/settings/diagnostics`, `/settings/protocols`, `/privacidade`, `/termos`, `/login`. |
| `tests/e2e/02-workspace-and-modes.spec.ts` | 4 | `4 passed` | Alternância de modos (Unifilar, Multifilar, Ladder, FBD, SCADA, Studio), canvas e alternância tema/idioma. |
| `tests/e2e/03-codesys-engineering-studio.spec.ts` | 4 | `4 passed` | Interface Studio IEC, compilação, abas Device Tree / HMI / Safety / Motion, simulação determinística e barreira no monitor de simulação. |
| `tests/e2e/04-scada-and-alarms.spec.ts` | 3 | `3 passed` | Seletor de planta SCADA, 11 visões laterais, ciclo de vida de alarmes ISA-18.2. |
| `tests/e2e/05-security-barrier-and-fleet.spec.ts` | 7 | `7 passed` | Security Monitor, Edge Fleet Dashboard (drawer *Inspecionar*, abas *Trilha de Auditoria* e *Configuração Remota*), Observability, Diagnostics, Protocols (`SIMULATOR` vs `EDGE_READ_ONLY` fail-closed contra IMDS SSRF `169.254.169.254`), SCADA UUID sintético, defesa Open Redirect (`/%09/evil.com` -> `127.0.0.1:3000`), `/realtime` e `/settings/billing` sem `pageerror`. |
| `tests/e2e/06-button-inventory-and-coverage.spec.ts` | 12 | `12 passed` | Auditoria interativa automática de **358 botões e controles** ao longo das rotas principais. |
| `tests/e2e/07-multi-viewport-responsiveness.spec.ts` | 6 | `6 passed` | Renderização de Workspace e SCADA sem overlay de erro e largura fiel nos viewports `1280x720`, `1366x768`, `1440x900`, `1600x900`, `1920x1080` e `390x844`. |
