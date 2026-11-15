# 02 — Ledger de Cobertura de Revisão (FILE REVIEW COVERAGE)

> Registro persistente de cobertura. É atualizado a cada lote da auditoria. Gerado por `tools/ledger.mjs` sobre `git ls-files` no HEAD `3d78bbb` (repo `eletricaip`).
> Classificações: FULLY_REVIEWED · PARTIALLY_REVIEWED · GENERATED_FILE · THIRD_PARTY · BINARY_ASSET · EXCLUDED_WITH_JUSTIFICATION · NOT_REVIEWED.

## Totais (ciclo 3, 2026-11-15)

| Classificação | Arquivos rastreados |
|---|---|
| FULLY_REVIEWED | 29 |
| PARTIALLY_REVIEWED | 105 (inclui as 71 migrations analisadas por parser estático automatizado) |
| NOT_REVIEWED | 708 (inclui 175 arquivos de teste: executados, mas não lidos) |
| EXCLUDED_WITH_JUSTIFICATION | 222 (documentação prévia: não usada como evidência) |
| GENERATED_FILE | 3 (`bun.lock`, `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`) |
| BINARY_ASSET | 21 |
| **Total** | **1.088** |

**Código próprio** (source + migrations + Edge Functions + config/scripts): 666 arquivos / 179.073 linhas.
- Lidos integralmente: 29 arquivos / 5.328 linhas (≈3,0% das linhas).
- Lidos parcialmente: 105 arquivos (leitura dirigida das funções críticas).
- **A auditoria NÃO é integral.** Os lotes B6–B10 do plano continuam pendentes (ver `15_MASTER_REMEDIATION_PLAN.md` §Continuação).

## Fora do controle de versão (não rastreados / ignorados)

| Caminho | Classificação | Justificativa |
|---|---|---|
| `node_modules/`, `.bun-cache/` | THIRD_PARTY | Dependências instaladas |
| `../ECC/` (workspace) | THIRD_PARTY | Toolkit de agentes de terceiros com git próprio; fora do produto |
| `.env` | PARTIALLY_REVIEWED | Somente nomes, tamanhos e claims decodificadas; valores nunca impressos (P0-SEC-001, P1-CFG-021) |
| `.vercel/output/` (667 arquivos) | GENERATED_FILE | Build de 14/11 17:47; varrido por `tools/secret-scan.mjs` |
| `dist-edge/` (3 binários, ~250 MB, mais 1 JS) | BINARY_ASSET | Edge daemon compilado; JS varrido em busca de segredos (nada encontrado) |
| `data/eletricai-fleet.sqlite*` | BINARY_ASSET | Banco local de frota; NOT_VERIFIED (conteúdo não inspecionado neste ciclo) |
| `playwright-report/`, `test-results/`, `logs/` | GENERATED_FILE | Varridos em busca de segredos (nada encontrado) |
| `supabase/.temp/` | GENERATED_FILE | Cache da CLI do Supabase |

## Linhas por arquivo

| Arquivo | Tipo | Módulo | Linhas | Estado | Achados | Risco | Observações |
|---|---|---|---|---|---|---|---|
| `.env.example` | config/script | .env.example | 80 | NOT_REVIEWED |  | MEDIO |  |
| `.gitattributes` | config/script | .gitattributes | 5 | NOT_REVIEWED |  | MEDIO |  |
| `.github/workflows/ci.yml` | config/script | .github | 125 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `.github/workflows/db-backup.yml` | config/script | .github | 63 | NOT_REVIEWED |  | MEDIO |  |
| `.gitignore` | config/script | .gitignore | 62 | NOT_REVIEWED |  | MEDIO |  |
| `.lovable/mcp/manifest.json` | config/script | .lovable | 165 | NOT_REVIEWED |  | MEDIO |  |
| `.lovable/plan.md` | doc | .lovable | 23 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `".lovable/plan/estabiliza\303\247\303\243o-do-eletricai-em-produ\303\247\303\243o-2026-09-13.md"` | doc | ".lovable | 0 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `.lovable/project.json` | config/script | .lovable | 5 | NOT_REVIEWED |  | MEDIO |  |
| `.prettierignore` | config/script | .prettierignore | 31 | NOT_REVIEWED |  | MEDIO |  |
| `.prettierrc` | config/script | .prettierrc | 7 | NOT_REVIEWED |  | MEDIO |  |
| `AGENTS.md` | doc | AGENTS.md | 1317 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `README.md` | doc | README.md | 83 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `bun.lock` | lockfile | bun.lock | 2082 | GENERATED_FILE |  | MEDIO |  |
| `bunfig.toml` | config/script | bunfig.toml | 3 | NOT_REVIEWED |  | MEDIO |  |
| `catalog/electrical-components.yaml` | config/script | catalog | 502 | NOT_REVIEWED |  | ALTO |  |
| `components.json` | config/script | components.json | 23 | NOT_REVIEWED |  | MEDIO |  |
| `config/edge-gateway.json` | config/script | config | 94 | NOT_REVIEWED |  | ALTO |  |
| `deploy/grafana/eletricai-edge-dashboard.json` | config/script | deploy | 163 | NOT_REVIEWED |  | ALTO |  |
| `deploy/systemd/eletricai-gateway.service` | config/script | deploy | 71 | NOT_REVIEWED |  | MEDIO |  |
| `docs/CANVAS_ZOOM_AND_FIT_VIEW_FIX.md` | doc | docs | 43 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/DATABASE_INVENTORY.md` | doc | docs | 71 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/DATABASE_MIGRATION_PLAN.md` | doc | docs | 65 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/DATABASE_VALIDATION_REPORT.md` | doc | docs | 59 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/DIGITAL_TWIN_COMPLETE_REMOVAL_REPORT.md` | doc | docs | 55 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/DIGITAL_TWIN_REFERENCE_AUDIT.md` | doc | docs | 29 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/INDUSTRIAL_WORKSPACE_NAVIGATION_REDESIGN.md` | doc | docs | 35 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/UNIFILAR_ELECTRICAL_CONNECTIVITY_ROOT_CAUSE.md` | doc | docs | 42 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/UNIFILAR_TOPOLOGY_ENGINEERING_VALIDATION.md` | doc | docs | 42 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/WORKSPACE_FINAL_REGRESSION_REPORT.md` | doc | docs | 54 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/WORKSPACE_RESPONSIVE_ACCEPTANCE.md` | doc | docs | 44 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/0001-webgl-pixi-vs-reactflow.md` | doc | docs | 23 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/0002-command-pattern-diagram.md` | doc | docs | 17 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/0003-tenant-isolation-rls.md` | doc | docs | 17 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/ADR-001-canonical-equipment-identity.md` | doc | docs | 44 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/ADR-002-tag-metadata-vs-runtime-separation.md` | doc | docs | 39 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/ADR-003-scada-project-context-and-multitenancy.md` | doc | docs | 42 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/ADR-004-supervisory-commands-vs-safety-boundaries.md` | doc | docs | 46 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/ADR-005-persistent-historian-and-deterministic-alarm-engine.md` | doc | docs | 51 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/adr/ADR-006-edge-gateway-runtime-and-storage.md` | doc | docs | 37 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/CANVAS_INTEGRATION_CONTRACTS.md` | doc | docs | 184 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/CLOUD_EDGE_DATA_CONTRACT.md` | doc | docs | 284 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/CLOUD_EDGE_DEPLOYMENT_MODEL.md` | doc | docs | 140 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/CLOUD_EDGE_PHYSICAL_ARCHITECTURE.md` | doc | docs | 145 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/CLOUD_EDGE_SECURITY_BOUNDARY.md` | doc | docs | 153 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/GATE3_4_ARCHITECTURE_INTEGRATION_REPORT.md` | doc | docs | 96 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/architecture/UNIFIED_ENGINEERING_MODEL.md` | doc | docs | 322 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/AUDITORIA_COMPLETA.md` | doc | docs | 159 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/CHECKLIST_DE_LANCAMENTO.md` | doc | docs | 72 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/DECISOES_ARQUITETURAIS.md` | doc | docs | 91 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/INVENTARIO_FUNCIONAL.md` | doc | docs | 120 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/MATRIZ_DE_RISCOS.md` | doc | docs | 80 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/PLANO_DE_EXECUCAO.md` | doc | docs | 254 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/PLANO_DE_TESTES.md` | doc | docs | 112 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/auditoria/PROCEDIMENTO_BACKUP_RESTORE.md` | doc | docs | 74 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `"docs/audits/EL\303\211TRICAI_COMPLETE_SYSTEM_INVENTORY.md"` | doc | "docs | 0 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_1_ADVERSARIAL_VERIFICATION.md` | doc | docs | 147 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_ACCEPTANCE_REPORT.md` | doc | docs | 33 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_AI_ASSISTED_DIAGNOSTICS.md` | doc | docs | 41 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_CAUSAL_CORRELATION.md` | doc | docs | 40 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_DIAGNOSTICS_ARCHITECTURE.md` | doc | docs | 45 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_INCIDENT_INVESTIGATION.md` | doc | docs | 41 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_ROOT_CAUSE_ENGINE.md` | doc | docs | 53 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_RUNBOOKS.md` | doc | docs | 45 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/diagnostics/GATE3_8_SECURITY_REVIEW.md` | doc | docs | 36 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_1_LAB_COMMISSIONING_REPORT.md` | doc | docs | 226 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_2_PRODUCTION_HARDENING_REPORT.md` | doc | docs | 271 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_3_INDEPENDENT_BENCH_VALIDATION_REPORT.md` | doc | docs | 304 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_5_ACCEPTANCE_REPORT.md` | doc | docs | 96 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_5_FLEET_MANAGEMENT_ARCHITECTURE.md` | doc | docs | 154 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_5_GATEWAY_LIFECYCLE.md` | doc | docs | 97 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_5_SECURE_CONFIGURATION.md` | doc | docs | 116 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_5_SIGNED_UPDATES.md` | doc | docs | 100 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_ACCEPTANCE_REPORT.md` | doc | docs | 66 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_ARCHITECTURE.md` | doc | docs | 106 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_SECURITY_MODEL.md` | doc | docs | 74 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATE3_TEST_PLAN.md` | doc | docs | 43 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_DEPLOYMENT.md` | doc | docs | 102 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_OPERATIONS.md` | doc | docs | 58 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_PROTOCOL_MODBUS.md` | doc | docs | 47 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_PROTOCOL_MQTT_SPARKPLUG.md` | doc | docs | 42 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_PROTOCOL_OPCUA.md` | doc | docs | 55 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_PROVISIONING.md` | doc | docs | 60 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/edge/GATEWAY_STORE_AND_FORWARD.md` | doc | docs | 60 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/CODESYS_FUNCTIONAL_PARITY_MATRIX.md` | doc | docs | 22 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/CODESYS_REFERENCE_EVIDENCE.md` | doc | docs | 53 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_ACCEPTANCE_EVIDENCE.md` | doc | docs | 74 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_CANONICAL_MODEL.md` | doc | docs | 80 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_CODESYS_DEEP_FUNCTIONAL_INVENTORY.md` | doc | docs | 72 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_COMMUNICATION_ENGINE.md` | doc | docs | 58 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_COMPILER_DEBUGGER.md` | doc | docs | 70 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_CONTROLLER_MANAGEMENT.md` | doc | docs | 39 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_EXISTING_CODE_AUDIT.md` | doc | docs | 55 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_HMI_SCADA_INTEGRATION.md` | doc | docs | 60 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_IEC_LANGUAGE_ENGINE.md` | doc | docs | 59 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_LIBRARY_MANAGER.md` | doc | docs | 83 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_PROJECT_COMPARISON.md` | doc | docs | 36 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_0_TASK_RUNTIME.md` | doc | docs | 55 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_1_CONSOLIDATION_HOMOLOGATION.md` | doc | docs | 258 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_2_1_EVIDENCE_INTEGRITY.md` | doc | docs | 387 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/GATE_4_2_AUTONOMOUS_QA_FINAL_REPORT.md` | doc | docs | 245 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/INDUSTRIAL_ENGINEERING_STUDIO_REPORT.md` | doc | docs | 99 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/INDUSTRIAL_IDE_ARCHITECTURE.md` | doc | docs | 97 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/INDUSTRIAL_IDE_IMPLEMENTATION_ROADMAP.md` | doc | docs | 73 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/INDUSTRIAL_IDE_TEST_MATRIX.md` | doc | docs | 76 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/engineering/button_inventory_gate42.json` | doc | docs | 6626 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/especificacao-original.md` | doc | docs | 3322 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/fbd/FBD_IMPLEMENTATION_MATRIX.md` | doc | docs | 17 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/i18n/INTERNATIONALIZATION_AUDIT.md` | doc | docs | 157 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_1_RUNTIME_STABILIZATION_REPORT.md` | doc | docs | 146 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_ACCEPTANCE_REPORT.md` | doc | docs | 83 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_ALARM_LIFECYCLE.md` | doc | docs | 24 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_CANONICAL_DATA_MODEL.md` | doc | docs | 61 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_EDGE_INTEGRATION.md` | doc | docs | 40 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_SCADA_HISTORIAN_INTEGRATION.md` | doc | docs | 37 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_SECURITY_REVIEW.md` | doc | docs | 28 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/industrial-data/GATE3_6_TAG_CONTRACT.md` | doc | docs | 59 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/00-auditoria.md` | doc | docs | 110 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/01-matriz-de-reuso.md` | doc | docs | 42 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/02-adrs.md` | doc | docs | 102 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/03-backlog-priorizado.md` | doc | docs | 30 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/04-perguntas-em-aberto.md` | doc | docs | 54 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/DIVIDA.md` | doc | docs | 14 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/RESUMO_FINAL_FASES_1_A_11.md` | doc | docs | 27 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/logo-studio/ROADMAP.md` | doc | docs | 49 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_ACCEPTANCE_REPORT.md` | doc | docs | 68 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_CLOUD_HEALTH.md` | doc | docs | 50 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_DATA_RELIABILITY.md` | doc | docs | 63 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_EDGE_HEALTH.md` | doc | docs | 51 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_INCIDENT_MANAGEMENT.md` | doc | docs | 40 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_INDUSTRIAL_CONNECTIVITY.md` | doc | docs | 49 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_OBSERVABILITY_ARCHITECTURE.md` | doc | docs | 77 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_SECURITY_AND_RETENTION.md` | doc | docs | 37 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/observability/GATE3_7_SLI_SLO_AVAILABILITY.md` | doc | docs | 46 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/plans/UNIFIED_MODEL_AND_I18N_ROADMAP.md` | doc | docs | 210 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/reports/AI_CONTINUOUS_ENGINEERING_MEMORY_REPORT.md` | doc | docs | 93 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/reports/AI_DIAGNOSTIC_AUTO_REPAIR_REPORT.md` | doc | docs | 112 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/reports/AI_ENGINEERING_INTEGRATION_ACCEPTANCE_REPORT.md` | doc | docs | 56 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/reports/UNIFILAR_CANVAS_RENDERING_FIX_REPORT.md` | doc | docs | 87 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/reports/UNIFILAR_CONNECTIVITY_ROOT_CAUSE_REPORT.md` | doc | docs | 66 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/reports/UNIFILAR_REGRESSION_TEST_REPORT.md` | doc | docs | 68 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_ACCEPTANCE_REPORT.md` | doc | docs | 39 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_ALARM_ENGINE.md` | doc | docs | 49 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_ALARM_ENGINE_IMPLEMENTATION.md` | doc | docs | 73 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_ARCHITECTURE.md` | doc | docs | 75 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_CANONICAL_EQUIPMENT.md` | doc | docs | 65 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_DATA_MODEL.md` | doc | docs | 44 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_DATA_QUALITY.md` | doc | docs | 60 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_EQUIPMENT_LIBRARY.md` | doc | docs | 73 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_GATE1_ACCEPTANCE_REPORT.md` | doc | docs | 114 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_GATE1_REMEDIATION.md` | doc | docs | 74 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_GATE2_5_INTEGRITY_ACCEPTANCE.md` | doc | docs | 148 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_GATE2_ARCHITECTURE.md` | doc | docs | 128 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_GATE2_TEST_REPORT.md` | doc | docs | 64 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_GATEWAY.md` | doc | docs | 39 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_HISTORIAN.md` | doc | docs | 32 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_HISTORIAN_IMPLEMENTATION.md` | doc | docs | 80 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_INDEPENDENT_AUDIT_2026-11-01.md` | doc | docs | 459 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_MASTER_AUDIT.md` | doc | docs | 99 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_PROJECT_ISOLATION.md` | doc | docs | 79 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_RUNTIME.md` | doc | docs | 31 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_RUNTIME_CRASH_REMEDIATION.md` | doc | docs | 432 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_SAFETY_BOUNDARIES.md` | doc | docs | 50 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_SECURITY.md` | doc | docs | 37 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_TAG_REGISTRY.md` | doc | docs | 76 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_TELEMETRY_CAPACITY.md` | doc | docs | 85 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/scada/SCADA_TEST_PLAN.md` | doc | docs | 30 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/01-visao-geral.md` | doc | docs | 35 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/02-stack.md` | doc | docs | 38 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/10-seguranca.md` | doc | docs | 59 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/12-auditoria-status.md` | doc | docs | 116 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/13-backlog.md` | doc | docs | 96 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/15-decisoes-riscos.md` | doc | docs | 45 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/sdd/README.md` | doc | docs | 44 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/security/API_ATTACK_MATRIX.md` | doc | docs | 32 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/ASVS_5_0_0_CONTROL_MATRIX.md` | doc | docs | 60 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/DEPENDENCY_INVENTORY.md` | doc | docs | 64 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE3_8_2_ADVISORY_VALIDATION.md` | doc | docs | 119 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE3_8_2_DEPENDENCY_INVENTORY.md` | doc | docs | 61 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE3_8_2_REGRESSION_REPORT.md` | doc | docs | 62 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE3_8_2_SECURITY_REMEDIATION_REPORT.md` | doc | docs | 91 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_3_8_2_1_CVE_RECONCILIATION.md` | doc | docs | 177 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_3_8_2_1_INDEPENDENT_VERIFICATION.md` | doc | docs | 256 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json` | doc | docs | 43039 | PARTIALLY_REVIEWED | P0-SEC-020 | ALTO |  |
| `docs/security/GATE_3_8_2_2_CVE_INVENTORY_CORRECTED.md` | doc | docs | 170 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_3_8_2_2_FINAL_SECURITY_EVIDENCE.md` | doc | docs | 175 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_3_8_2_2_TRIVY_REPRODUCIBILITY.md` | doc | docs | 81 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_3_8_2_SECURITY_REMEDIATION.md` | doc | docs | 115 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_CLOUD_EDGE_OT_ARCHITECTURE.md` | doc | docs | 50 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_DEPENDENCY_AND_BUILD_REPORT.md` | doc | docs | 37 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_FINAL_REPORT.md` | doc | docs | 43 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_INITIAL_STATE.md` | doc | docs | 61 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_MULTITENANT_AUTHZ_AND_RLS.md` | doc | docs | 41 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_OPEN_FINDINGS.md` | doc | docs | 12 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_PERSISTENCE_AND_AUDIT_TRAIL.md` | doc | docs | 35 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_PROTOCOL_AND_DRIVER_CLASSIFICATION.md` | doc | docs | 36 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_REMEDIATION_CHANGELOG.md` | doc | docs | 45 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_SBOM.cdx.json` | doc | docs | 18377 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_SIGNED_UPDATES_AND_PKI.md` | doc | docs | 33 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_VERIFICATION_EVIDENCE.md` | doc | docs | 22 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_1_WEBHOOKS_AND_FINANCIAL_IDEMPOTENCY.md` | doc | docs | 22 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_AUDIT_CHAIN_AND_CONCURRENCY.md` | doc | docs | 21 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_CLOUD_EDGE_OT_ISOLATION.md` | doc | docs | 25 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_CLOUD_PERSISTENCE_ARCHITECTURE.md` | doc | docs | 36 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_E2E_BROWSER_HOMOLOGATION.md` | doc | docs | 21 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_FINAL_REPORT.md` | doc | docs | 41 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_INITIAL_STATE.md` | doc | docs | 55 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_MULTITENANT_AUTHZ_AUDIT.md` | doc | docs | 32 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_OPEN_FINDINGS.md` | doc | docs | 12 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_POSTGRES_MIGRATIONS_AND_RLS.md` | doc | docs | 65 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_PROTOCOL_AND_DRIVER_AUDIT.md` | doc | docs | 19 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_RED_TEAM_ADVERSARIAL_REPORT.md` | doc | docs | 23 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_REMEDIATION_CHANGELOG.md` | doc | docs | 41 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_SBOM.cdx.json` | doc | docs | 18377 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_SIGNED_UPDATES_AND_PKI.md` | doc | docs | 20 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_SUPPLY_CHAIN_BUILD_AND_CI.md` | doc | docs | 23 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_VERIFICATION_EVIDENCE.md` | doc | docs | 24 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_2_WEBHOOKS_AND_FINANCIAL_INTEGRITY.md` | doc | docs | 23 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_RED_TEAM_BLUE_TEAM_FINAL_REPORT.md` | doc | docs | 93 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/GATE_4_3_SBOM.cdx.json` | doc | docs | 18377 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/INCIDENT_RESPONSE_RUNBOOK.md` | doc | docs | 66 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/MULTITENANT_ISOLATION_REPORT.md` | doc | docs | 37 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/SECRET_EXPOSURE_ASSESSMENT.md` | doc | docs | 58 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/SECRET_EXPOSURE_REPORT.md` | doc | docs | 38 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/SECURITY_REMEDIATION_LOG.md` | doc | docs | 32 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/THREAT_MODEL_GATE_4_3.md` | doc | docs | 57 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/security/sbom-cyclonedx.json` | doc | docs | 27864 | EXCLUDED_WITH_JUSTIFICATION |  | ALTO | Documentacao previa: nao usada como evidencia |
| `docs/testing/CROSS_CANVAS_AND_I18N_TEST_PLAN.md` | doc | docs | 79 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_ACCEPTANCE_REPORT.md` | doc | docs | 68 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_AI_GENERATION_PIPELINE.md` | doc | docs | 134 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_CONNECTION_ENGINE_AUDIT.md` | doc | docs | 147 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_CONNECTION_VALIDATION.md` | doc | docs | 96 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_GATE_U1_1_ACCEPTANCE.md` | doc | docs | 200 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_MULTIFILAR_EQUIVALENCE.md` | doc | docs | 80 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_TERMINAL_LIBRARY.md` | doc | docs | 106 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `docs/unifilar/UNIFILAR_TOPOLOGY_ARCHITECTURE.md` | doc | docs | 114 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `eslint.config.js` | config/script | eslint.config.js | 63 | NOT_REVIEWED |  | MEDIO |  |
| `opencode.json` | config/script | opencode.json | 14 | NOT_REVIEWED |  | MEDIO |  |
| `package.json` | config/script | package.json | 163 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `playwright.config.ts` | config/script | playwright.config.ts | 28 | FULLY_REVIEWED |  | MEDIO |  |
| `public/brand/eletricai-logo.svg` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/brand/eletricai-symbol-mono.svg` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/brand/eletricai-symbol.svg` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/brand/favicon.svg` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/favicon.ico` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/favicon.svg` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/LICENSE.txt` | config/script | public | 8 | NOT_REVIEWED |  | MEDIO |  |
| `public/fonts/fonts.css` | config/script | public | 83 | NOT_REVIEWED |  | MEDIO |  |
| `public/fonts/ibm-plex-mono-400.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/ibm-plex-mono-500.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/ibm-plex-mono-600.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/ibm-plex-sans-400.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/ibm-plex-sans-500.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/ibm-plex-sans-600.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/ibm-plex-sans-700.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/space-grotesk-500.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/space-grotesk-600.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/fonts/space-grotesk-700.woff2` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/landing/demo-canvas-1080.mp4` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/landing/demo-canvas-720.mp4` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/landing/demo-canvas-poster.webp` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/legal/privacy-policy.md` | doc | public | 199 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `public/legal/terms-of-service.md` | doc | public | 185 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `public/media/eletricai-demo-poster.jpg` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `public/media/eletricai-demo.webm` | asset | public | 0 | BINARY_ASSET |  | BAIXO |  |
| `roadmap.md` | doc | roadmap.md | 9 | EXCLUDED_WITH_JUSTIFICATION |  | BAIXO | Documentacao previa: nao usada como evidencia |
| `scripts/audit-canvas-stability.mjs` | config/script | scripts | 454 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/backup-db.sh` | config/script | scripts | 82 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/benchmark-graphical-rendering.mjs` | config/script | scripts | 390 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/download-fonts.mjs` | config/script | scripts | 85 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/encode-webm.mjs` | config/script | scripts | 60 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/measure-ladder-containers.mjs` | config/script | scripts | 156 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/record-real-demo.mjs` | config/script | scripts | 323 | NOT_REVIEWED |  | MEDIO |  |
| `scripts/restore-db.sh` | config/script | scripts | 76 | NOT_REVIEWED |  | MEDIO |  |
| `src/__tests__/ai-continuous-memory.test.ts` | test | __tests__ | 178 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ai-diagnostic-auto-repair.test.ts` | test | __tests__ | 214 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/auth-redirect-flow.test.tsx` | test | __tests__ | 351 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/auth-token-security-after-logout.test.ts` | test | __tests__ | 228 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/briefing-and-prompt-governance.test.ts` | test | __tests__ | 237 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/canonical-industrial-data-integration.test.ts` | test | __tests__ | 1545 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/canvas-complete-persistence-roundtrip.test.ts` | test | __tests__ | 292 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/canvas-gradual-performance-import.test.ts` | test | __tests__ | 384 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/canvas-integration-phase-c.test.ts` | test | __tests__ | 505 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/canvas-unifilar-multifilar-engineering.test.ts` | test | __tests__ | 508 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/collab-remote-command.test.ts` | test | __tests__ | 47 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase1-domain.test.ts` | test | __tests__ | 270 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase10-network-comms.test.ts` | test | __tests__ | 196 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase11-hardening-e2e.test.tsx` | test | __tests__ | 113 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase2-runtime-blocks.test.ts` | test | __tests__ | 499 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase3-fbd-editor.test.ts` | test | __tests__ | 249 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase4-conversion.test.ts` | test | __tests__ | 280 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase5-hardware.test.ts` | test | __tests__ | 88 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase6-udfs.test.ts` | test | __tests__ | 264 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase7-docs-csv-pdf.test.ts` | test | __tests__ | 135 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase8-sim-diff.test.ts` | test | __tests__ | 127 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/compact-studio-phase9-ssot-rls.test.ts` | test | __tests__ | 168 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/deletion.test.ts` | test | __tests__ | 281 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/design-system.test.tsx` | test | __tests__ | 226 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-ai-defenses.test.ts` | test | __tests__ | 145 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-conductor-solver.test.ts` | test | __tests__ | 183 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-contracts-and-validation.test.ts` | test | __tests__ | 274 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-draft-orchestrator.test.ts` | test | __tests__ | 229 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-rules-catalog.test.ts` | test | __tests__ | 143 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-security-and-edge-cases.test.ts` | test | __tests__ | 256 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-severity.test.ts` | test | __tests__ | 185 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/diagnostics-ui-and-undo.test.tsx` | test | __tests__ | 161 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/e2e-full-journey-regression.test.ts` | test | __tests__ | 579 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-daemon-cli.test.ts` | test | __tests__ | 167 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-durability-sqlite.test.ts` | test | __tests__ | 137 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-modbus-independent.test.ts` | test | __tests__ | 264 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-opcua-independent.test.ts` | test | __tests__ | 314 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-resilience-failures.test.ts` | test | __tests__ | 317 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-security-matrix.test.ts` | test | __tests__ | 236 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-bench-sparkplug-independent.test.ts` | test | __tests__ | 193 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-cloud-architecture-integration.test.ts` | test | __tests__ | 678 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-daemon-standalone.test.ts` | test | __tests__ | 194 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-durability-criticality.test.ts` | test | __tests__ | 204 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-fleet-operational-readiness.test.ts` | test | __tests__ | 665 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-integrated-gateway.test.ts` | test | __tests__ | 323 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-lab-interoperability.test.ts` | test | __tests__ | 377 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-modbus-allowlist-hardening.test.ts` | test | __tests__ | 160 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-modbus-homologation.test.ts` | test | __tests__ | 199 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-opcua-homologation.test.ts` | test | __tests__ | 208 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-physical-readonly-enforcement.test.ts` | test | __tests__ | 106 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-provisioning-concurrency.test.ts` | test | __tests__ | 126 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-provisioning-lifecycle.test.ts` | test | __tests__ | 161 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-sparkplug-command-deny.test.ts` | test | __tests__ | 116 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-sparkplug-homologation.test.ts` | test | __tests__ | 178 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/edge-sqlite-wal-durability.test.ts` | test | __tests__ | 269 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/electrical-calc.test.ts` | test | __tests__ | 126 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/electrical-short-circuit-and-i2t.test.ts` | test | __tests__ | 184 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/electrical-sim.test.ts` | test | __tests__ | 304 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/engineering-dossier.test.ts` | test | __tests__ | 343 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-editor-bridge.test.ts` | test | __tests__ | 105 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-engine-compiler.test.ts` | test | __tests__ | 235 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-engine-demo.test.ts` | test | __tests__ | 77 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-engine-types.test.ts` | test | __tests__ | 76 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-runtime.test.ts` | test | __tests__ | 200 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-scada-bridge.test.ts` | test | __tests__ | 38 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fbd-st-codegen.test.ts` | test | __tests__ | 135 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fixtures/benchmark-project-28k.json` | test | __tests__ | 44399 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/fixtures/generate-28k-fixture.ts` | test | __tests__ | 396 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-2-1-dev-auth-security.test.ts` | test | __tests__ | 122 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-2-1-multi-tenant-rls-isolation.test.ts` | test | __tests__ | 180 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-3-1-cloud-edge-ot.test.ts` | test | __tests__ | 317 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-3-1-persistence-audit-ota.test.ts` | test | __tests__ | 439 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-3-1-webhooks-authz.test.ts` | test | __tests__ | 437 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-3-2-cloud-multi-instance-and-rpcs.test.ts` | test | __tests__ | 1154 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate-4-3-redteam-security-regression.test.ts` | test | __tests__ | 395 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate3_6_1_runtime_stabilization.test.ts` | test | __tests__ | 231 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate3_7_industrial_observability.test.ts` | test | __tests__ | 852 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate3_8_1_adversarial_verification.test.ts` | test | __tests__ | 1270 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gate3_8_2_security_remediation.test.ts` | test | __tests__ | 549 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate3_8_2_supply_chain_security.test.ts` | test | __tests__ | 367 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate3_8_industrial_diagnostics.test.ts` | test | __tests__ | 1303 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/gate4_3_3_independent_review.test.ts` | test | __tests__ | 732 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gemini-i18n.test.ts` | test | __tests__ | 155 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/gemini-integration.test.ts` | test | __tests__ | 204 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/i18n-store-and-catalogs.test.ts` | test | __tests__ | 160 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/i18n-ui-and-exports.test.ts` | test | __tests__ | 118 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/industrial-benchmark-10-projects.test.ts` | test | __tests__ | 446 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/iot-ingest-rate-limit.test.ts` | test | __tests__ | 115 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-estop-verify.test.ts` | test | __tests__ | 83 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-import.test.ts` | test | __tests__ | 143 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-p0-remediation.test.ts` | test | __tests__ | 434 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-palette-alignment.test.ts` | test | __tests__ | 67 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-phase-2-operations.test.ts` | test | __tests__ | 401 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-phase-3-functional.test.ts` | test | __tests__ | 1091 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-phase-4-runtime-semantics.test.ts` | test | __tests__ | 896 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-professional-acceptance.test.ts` | test | __tests__ | 563 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-rung-cols.test.ts` | test | __tests__ | 62 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-runtime.test.ts` | test | __tests__ | 175 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-tof-tp.test.ts` | test | __tests__ | 88 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-unique-keys-and-stability.test.ts` | test | __tests__ | 174 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/ladder-validator-ui.test.ts` | test | __tests__ | 24 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/modbus-ssrf-guard.test.ts` | test | __tests__ | 101 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/multifilar.test.ts` | test | __tests__ | 215 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/nbr5410-ampacity.test.ts` | test | __tests__ | 221 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/no-render-loops-or-sim-autosave.test.ts` | test | __tests__ | 125 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/normative-compliance-and-mode-tabs.test.tsx` | test | __tests__ | 92 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/observability-and-backup.test.ts` | test | __tests__ | 159 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/onboarding-tour.test.tsx` | test | __tests__ | 60 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/persistence-concurrency-conflict.test.ts` | test | __tests__ | 149 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/persistence-full-roundtrip.test.ts` | test | __tests__ | 167 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/persistence-slow-network-and-hydration-guard.test.ts` | test | __tests__ | 193 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/plant-engine.test.ts` | test | __tests__ | 174 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/plc-rack-validation.test.ts` | test | __tests__ | 92 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/project-import-export-v3.test.ts` | test | __tests__ | 164 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/right-property-panel-diagram.test.ts` | test | __tests__ | 74 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/safe-redirect.test.ts` | test | __tests__ | 56 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/safety-core-and-canvas-sharpness.test.ts` | test | __tests__ | 332 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-critical-runtime-resilience.test.ts` | test | __tests__ | 416 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate1a-security-and-multitenancy.test.ts` | test | __tests__ | 320 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate1b-canonical-equipment.test.ts` | test | __tests__ | 304 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-5-audit-verifier.test.ts` | test | __tests__ | 239 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-5-capacity-benchmark.test.ts` | test | __tests__ | 273 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-5-energy-calculator.test.ts` | test | __tests__ | 150 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-5-runtime-and-deadband.test.ts` | test | __tests__ | 385 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-5-staleness-forcing.test.ts` | test | __tests__ | 361 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-alarm-engine.test.ts` | test | __tests__ | 406 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-historian-and-reports.test.ts` | test | __tests__ | 182 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-tag-runtime.test.ts` | test | __tests__ | 263 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-gate2-user-journey.test.ts` | test | __tests__ | 354 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-sandbox-guards.test.ts` | test | __tests__ | 100 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-sandbox-hardening.test.ts` | test | __tests__ | 46 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/scada-supervisory-system.test.ts` | test | __tests__ | 191 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/settings-logout.test.tsx` | test | __tests__ | 195 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/settings-nav.test.ts` | test | __tests__ | 73 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/settings-store.test.tsx` | test | __tests__ | 96 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/settings-switches-ui.test.tsx` | test | __tests__ | 135 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/signup-feedback.test.tsx` | test | __tests__ | 82 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/sim-canvas-stability.test.tsx` | test | __tests__ | 198 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/supabase-env-validation.test.ts` | test | __tests__ | 75 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/tablet-layout.test.ts` | test | __tests__ | 34 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/tenant-bootstrap-and-projects.test.ts` | test | __tests__ | 708 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unified-bottom-dock-and-library.test.tsx` | test | __tests__ | 409 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unified-model-v3.test.ts` | test | __tests__ | 427 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unifilar-ai-prompt-pipeline.test.ts` | test | __tests__ | 192 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unifilar-connection-engine-scenarios.test.ts` | test | __tests__ | 551 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unifilar-connectivity-pipeline.test.ts` | test | __tests__ | 580 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unifilar-gate-u1-1-benchmark.test.ts` | test | __tests__ | 2025 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unifilar-ladder-bridge.test.ts` | test | __tests__ | 205 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/unifilar-routing-and-compliance.test.ts` | test | __tests__ | 420 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/universal-importer-scale-28k.test.ts` | test | __tests__ | 317 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/universal-importer.test.ts` | test | __tests__ | 593 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/voltage-drop-reactance.test.ts` | test | __tests__ | 104 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/workspace-navigation-focus-and-no-twin.test.tsx` | test | __tests__ | 163 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/__tests__/workspace-stabilization-canvas-and-sim.test.tsx` | test | __tests__ | 491 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/components/ai-credits-badge.tsx` | source | components | 74 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ai-patch-preview.tsx` | source | components | 194 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/app-sidebar.tsx` | source | components | 257 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/auth/logout-dialog.tsx` | source | components/auth | 173 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/bottom-panel.tsx` | source | components | 6 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/brand-bolt.tsx` | source | components | 8 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/brand/eletricai-logo.tsx` | source | components/brand | 109 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvas-ai-chat.tsx` | source | components | 876 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/_industrial-node.tsx` | source | components/canvases | 47 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/alarms-canvas.tsx` | source | components/canvases | 233 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/canvas-chrome.tsx` | source | components/canvases | 32 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/fbd-canvas.tsx` | source | components/canvases | 597 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/konva-canvas.tsx` | source | components/canvases | 1008 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/ladder-canvas.tsx` | source | components/canvases | 13 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/ladder/ladder-cell.tsx` | source | components/canvases | 532 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/ladder/rung-grid.tsx` | source | components/canvases | 1701 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/lazy.tsx` | source | components/canvases | 139 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/plc-canvas.tsx` | source | components/canvases | 960 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/scada-canvas.tsx` | source | components/canvases | 616 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/sim-canvas.tsx` | source | components/canvases | 614 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/canvases/webgl-canvas.tsx` | source | components/canvases | 1480 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/clients/client-form-dialog.tsx` | source | components/clients | 211 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/command-palette.tsx` | source | components | 133 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/compact-fbd-canvas.tsx` | source | components/compact-studio | 469 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/compact-lad-canvas.tsx` | source | components/compact-studio | 341 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/compact-simulator-panel.tsx` | source | components/compact-studio | 352 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/compact-studio-workspace.tsx` | source | components/compact-studio | 648 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/compact-svg-symbols.tsx` | source | components/compact-studio | 101 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/documentation-panel.tsx` | source | components/compact-studio | 228 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/hardware-configurator.tsx` | source | components/compact-studio | 315 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/compact-studio/udf-library-panel.tsx` | source | components/compact-studio | 207 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/diagnostics/ai-fix-button.tsx` | source | components/diagnostics | 101 | NOT_REVIEWED |  | ALTO |  |
| `src/components/diagnostics/normative-compliance-panel.tsx` | source | components/diagnostics | 208 | NOT_REVIEWED |  | ALTO |  |
| `src/components/dossier/engineering-dossier-modal.tsx` | source | components/dossier | 928 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/edge/fleet-dashboard.tsx` | source | components/edge | 850 | NOT_REVIEWED |  | ALTO |  |
| `src/components/editor-ai-config-banner.tsx` | source | components | 75 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/ai-fix-dialog.tsx` | source | components/editor | 224 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/ladder-property-panel.tsx` | source | components/editor | 526 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/left-sidebar-host.tsx` | source | components/editor | 34 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/property-fields/validated-param-field.tsx` | source | components/editor | 97 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/right-property-panel.tsx` | source | components/editor | 569 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/editor-fbd-sidebar.tsx` | source | components/editor | 49 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/editor-ladder-sidebar.tsx` | source | components/editor | 255 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/editor-plc-sidebar.tsx` | source | components/editor | 39 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/editor-scada-sidebar.tsx` | source | components/editor | 42 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/editor-sim-sidebar.tsx` | source | components/editor | 309 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/editor-unifilar-sidebar.tsx` | source | components/editor | 1176 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/sidebars/sidebar-primitives.tsx` | source | components/editor | 68 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/editor/unified-bottom-dock.tsx` | source | components/editor | 1268 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/error-boundary.tsx` | source | components | 65 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/fbd/fbd-engine-panel.tsx` | source | components/fbd | 251 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/importer/universal-import-modal.tsx` | source | components/importer | 957 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/industrial-workspace.tsx` | source | components | 542 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/language-switcher.tsx` | source | components | 28 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/legal-page.tsx` | source | components | 87 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/mobile-menu.tsx` | source | components | 147 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/mode-tabs.tsx` | source | components | 472 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/multiplayer-cursors.tsx` | source | components | 33 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/observability/industrial-operations-center.tsx` | source | components/observability | 1320 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/onboarding-tour.tsx` | source | components | 228 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/plant-sim-panel.tsx` | source | components | 353 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/premium/activity-timeline.tsx` | source | components/premium | 62 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/premium/circular-progress.tsx` | source | components/premium | 57 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/premium/metric-card.tsx` | source | components/premium | 48 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/premium/neural-bg.tsx` | source | components/premium | 77 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/premium/permission-matrix.tsx` | source | components/premium | 85 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/revision-history.tsx` | source | components | 127 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/right-panel.tsx` | source | components | 252 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/runtime-status.tsx` | source | components | 275 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/bind-tag-dialog.tsx` | source | components/scada | 179 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/equipment-inspector-drawer.tsx` | source | components/scada | 370 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/scada-header.tsx` | source | components/scada | 291 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/scada-layout.tsx` | source | components/scada | 369 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/scada-os-status-bar.tsx` | source | components/scada | 95 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/scada-sidebar.tsx` | source | components/scada | 163 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/synoptic/ete-synoptic-p-and-id.tsx` | source | components/scada | 1497 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-alarms-view.tsx` | source | components/scada | 335 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-communication-view.tsx` | source | components/scada | 363 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-equipment-view.tsx` | source | components/scada | 164 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-events-view.tsx` | source | components/scada | 168 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-hmi-editor-view.tsx` | source | components/scada | 36 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-overview-view.tsx` | source | components/scada | 983 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-reports-view.tsx` | source | components/scada | 232 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-settings-view.tsx` | source | components/scada | 197 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-synoptics-view.tsx` | source | components/scada | 183 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-tags-view.tsx` | source | components/scada | 282 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/scada/views/scada-trends-view.tsx` | source | components/scada | 443 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/share-modal.tsx` | source | components | 122 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/simulation/electrical-study-panel.tsx` | source | components/simulation | 776 | NOT_REVIEWED |  | ALTO |  |
| `src/components/simulation/test-scenarios-panel.tsx` | source | components/simulation | 662 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/simulation/unifilar-ladder-bridge-panel.tsx` | source | components/simulation | 350 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/simulation/watch-table.tsx` | source | components/simulation | 228 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/device-tree-view.tsx` | source | components/studio | 234 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/engineering-studio.tsx` | source | components/studio | 448 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/hmi-editor.tsx` | source | components/studio | 223 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/motion-panel.tsx` | source | components/studio | 214 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/project-explorer.tsx` | source | components/studio | 347 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/safety-panel.tsx` | source | components/studio | 178 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/sfc-editor.tsx` | source | components/studio | 148 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/simulation-monitor.tsx` | source | components/studio | 230 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/studio/st-editor.tsx` | source | components/studio | 298 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/topbar.tsx` | source | components | 152 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/accordion.tsx` | source | components/ui | 56 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/alert-dialog.tsx` | source | components/ui | 116 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/alert.tsx` | source | components/ui | 50 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/aspect-ratio.tsx` | source | components/ui | 6 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/avatar.tsx` | source | components/ui | 48 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/badge.tsx` | source | components/ui | 35 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/breadcrumb.tsx` | source | components/ui | 102 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/button.tsx` | source | components/ui | 70 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/calendar.tsx` | source | components/ui | 178 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/card.tsx` | source | components/ui | 56 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/carousel.tsx` | source | components/ui | 241 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/chart.tsx` | source | components/ui | 332 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/checkbox.tsx` | source | components/ui | 27 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/collapsible.tsx` | source | components/ui | 12 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/command.tsx` | source | components/ui | 144 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/confirm-dialog.tsx` | source | components/ui | 79 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/context-menu.tsx` | source | components/ui | 188 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/dialog.tsx` | source | components/ui | 108 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/drawer.tsx` | source | components/ui | 99 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/dropdown-menu.tsx` | source | components/ui | 193 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/empty-state.tsx` | source | components/ui | 44 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/error-state.tsx` | source | components/ui | 49 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/form-field.tsx` | source | components/ui | 66 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/form.tsx` | source | components/ui | 172 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/hover-card.tsx` | source | components/ui | 28 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/icon-button.tsx` | source | components/ui | 38 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/input-otp.tsx` | source | components/ui | 70 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/input.tsx` | source | components/ui | 27 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/label.tsx` | source | components/ui | 22 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/loading-state.tsx` | source | components/ui | 37 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/menubar.tsx` | source | components/ui | 230 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/navigation-menu.tsx` | source | components/ui | 121 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/notification-dropdown.tsx` | source | components/ui | 183 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/page-header.tsx` | source | components/ui | 43 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/pagination.tsx` | source | components/ui | 99 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/popover.tsx` | source | components/ui | 32 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/progress.tsx` | source | components/ui | 26 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/radio-group.tsx` | source | components/ui | 37 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/resizable.tsx` | source | components/ui | 38 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/scroll-area.tsx` | source | components/ui | 45 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/search-input.tsx` | source | components/ui | 51 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/section-header.tsx` | source | components/ui | 42 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/select.tsx` | source | components/ui | 153 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/separator.tsx` | source | components/ui | 25 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/sheet.tsx` | source | components/ui | 126 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/sidebar.tsx` | source | components/ui | 745 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/skeleton.tsx` | source | components/ui | 8 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/slider.tsx` | source | components/ui | 24 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/sonner.tsx` | source | components/ui | 26 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/switch.tsx` | source | components/ui | 28 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/table-skeleton.tsx` | source | components/ui | 52 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/table.tsx` | source | components/ui | 102 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/tabs.tsx` | source | components/ui | 54 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/textarea.tsx` | source | components/ui | 26 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/toggle-group.tsx` | source | components/ui | 58 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/toggle.tsx` | source | components/ui | 43 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/ui/tooltip.tsx` | source | components/ui | 33 | NOT_REVIEWED |  | MEDIO |  |
| `src/components/upgrade-modal.tsx` | source | components | 132 | NOT_REVIEWED |  | MEDIO |  |
| `src/edge-daemon/config.ts` | source | edge-daemon | 189 | FULLY_REVIEWED | P1-INC-048 | ALTO |  |
| `src/edge-daemon/daemon.ts` | source | edge-daemon | 307 | FULLY_REVIEWED | P1-INC-048 | ALTO |  |
| `src/edge-daemon/index.ts` | source | edge-daemon | 63 | NOT_REVIEWED |  | ALTO |  |
| `src/edge-daemon/logger.ts` | source | edge-daemon | 139 | NOT_REVIEWED |  | ALTO |  |
| `src/hooks/use-active-tenant.ts` | source | hooks | 50 | NOT_REVIEWED |  | MEDIO |  |
| `src/hooks/use-auth.tsx` | source | hooks | 358 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `src/hooks/use-collab.ts` | source | hooks | 181 | NOT_REVIEWED |  | MEDIO |  |
| `src/hooks/use-fbd-engine.ts` | source | hooks | 211 | NOT_REVIEWED |  | MEDIO |  |
| `src/hooks/use-mobile.tsx` | source | hooks | 20 | NOT_REVIEWED |  | MEDIO |  |
| `src/hooks/use-notifications.ts` | source | hooks | 100 | NOT_REVIEWED |  | MEDIO |  |
| `src/hooks/use-opcua-bridge.ts` | source | hooks | 172 | NOT_REVIEWED |  | MEDIO |  |
| `src/hooks/use-tenant-setting.ts` | source | hooks | 96 | NOT_REVIEWED |  | MEDIO |  |
| `src/integrations/supabase/ai-rate-limit-middleware.ts` | source | integrations | 190 | PARTIALLY_REVIEWED | P1-SEC-053 | ALTO |  |
| `src/integrations/supabase/auth-attacher.ts` | source | integrations | 33 | FULLY_REVIEWED | P1-SEC-002 | ALTO |  |
| `src/integrations/supabase/auth-middleware.ts` | source | integrations | 252 | FULLY_REVIEWED | P1-SEC-002, P0-SEC-020 | ALTO |  |
| `src/integrations/supabase/client.server.ts` | source | integrations | 75 | FULLY_REVIEWED |  | ALTO |  |
| `src/integrations/supabase/client.ts` | source | integrations | 36 | FULLY_REVIEWED |  | ALTO |  |
| `src/integrations/supabase/env.ts` | source | integrations | 195 | FULLY_REVIEWED | P3-SEC-003, P1-CFG-021 | ALTO |  |
| `src/integrations/supabase/previewAuthStorage.ts` | source | integrations | 94 | FULLY_REVIEWED |  | ALTO |  |
| `src/integrations/supabase/tenant-admin-middleware.ts` | source | integrations | 36 | FULLY_REVIEWED |  | ALTO |  |
| `src/integrations/supabase/types.ts` | generated | integrations | 3518 | GENERATED_FILE |  | ALTO |  |
| `src/lib/account-deletion.functions.ts` | source | lib | 177 | FULLY_REVIEWED |  | ALTO |  |
| `src/lib/ai-architect-client.ts` | source | lib | 657 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai-architect.functions.ts` | source | lib | 706 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/ai-chat.functions.ts` | source | lib | 563 | PARTIALLY_REVIEWED | P2-AI-013, P3-AI-014 | ALTO |  |
| `src/lib/ai-usage.functions.ts` | source | lib | 131 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/ai/briefing-parser.ts` | source | lib/ai | 921 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/context-sanitizer.ts` | source | lib/ai | 81 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/gateway/ai-gateway.functions.ts` | source | lib/ai | 191 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/ai/gateway/ai-gateway.server.ts` | source | lib/ai | 639 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/gateway/credential-security.server.ts` | source | lib/ai | 221 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/ai/gateway/engineering-context.server.ts` | source | lib/ai | 199 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/gateway/engineering-tools.server.ts` | source | lib/ai | 1233 | PARTIALLY_REVIEWED | P3-AI-015 | MEDIO |  |
| `src/lib/ai/gateway/provider-registry.server.ts` | source | lib/ai | 1163 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/gateway/types.ts` | source | lib/ai | 201 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/gemini-client.server.ts` | source | lib/ai | 242 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/memory.server.ts` | source | lib/ai | 279 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/verification-types.ts` | source | lib/ai | 20 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ai/verify-architecture.ts` | source | lib/ai | 52 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/alarm-store.ts` | source | lib | 101 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/alarm.functions.ts` | source | lib | 161 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/autosave-log.ts` | source | lib | 70 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/billing.functions.ts` | source | lib | 392 | PARTIALLY_REVIEWED | P1-SEC-053 | ALTO |  |
| `src/lib/bom.functions.ts` | source | lib | 125 | FULLY_REVIEWED |  | ALTO |  |
| `src/lib/catalog-import.functions.ts` | source | lib | 225 | PARTIALLY_REVIEWED |  | ALTO |  |
| `src/lib/catalog.functions.ts` | source | lib | 52 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/clients.functions.ts` | source | lib | 189 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/compact-studio/branding.ts` | source | lib/compact-studio | 32 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/conversion/canonical-lad-fbd.ts` | source | lib/compact-studio | 833 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/conversion/index.ts` | source | lib/compact-studio | 2 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/docs/cross-reference.ts` | source | lib/compact-studio | 98 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/docs/index.ts` | source | lib/compact-studio | 5 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/docs/io-csv.ts` | source | lib/compact-studio | 114 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/docs/pdf-report.ts` | source | lib/compact-studio | 157 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/docs/plcopen-bridge.ts` | source | lib/compact-studio | 66 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/domain/index.ts` | source | lib/compact-studio | 8 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/domain/migrations.ts` | source | lib/compact-studio | 205 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/compact-studio/domain/schemas.ts` | source | lib/compact-studio | 219 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/domain/types.ts` | source | lib/compact-studio | 275 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/domain/validation.ts` | source | lib/compact-studio | 505 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/editor/clipboard-and-layout.ts` | source | lib/compact-studio | 414 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/editor/history-commands.ts` | source | lib/compact-studio | 102 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/editor/index.ts` | source | lib/compact-studio | 3 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/feature-flags.ts` | source | lib/compact-studio | 75 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/hardware/catalog-loader.ts` | source | lib/compact-studio | 63 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/hardware/compact-hardware-catalog.v1.json` | source | lib/compact-studio | 258 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/hardware/hardware-engine.ts` | source | lib/compact-studio | 345 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/hardware/index.ts` | source | lib/compact-studio | 3 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/integration/index.ts` | source | lib/compact-studio | 2 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/integration/ssot-bridge.ts` | source | lib/compact-studio | 205 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/network/device-comms-gateway.ts` | source | lib/compact-studio | 154 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/network/index.ts` | source | lib/compact-studio | 3 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/network/virtual-network.ts` | source | lib/compact-studio | 101 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/compact-blocks.ts` | source | lib/compact-studio | 1189 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/compact-compiler.ts` | source | lib/compact-studio | 372 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/compact-execution-engine.ts` | source | lib/compact-studio | 212 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/compact-runtime-worker.ts` | source | lib/compact-studio | 97 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/index.ts` | source | lib/compact-studio | 6 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/simulated-clock.ts` | source | lib/compact-studio | 73 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/runtime/worker-client.ts` | source | lib/compact-studio | 145 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/sim/index.ts` | source | lib/compact-studio | 3 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/sim/program-diff.ts` | source | lib/compact-studio | 146 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/sim/recorder.ts` | source | lib/compact-studio | 103 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/udf/index.ts` | source | lib/compact-studio | 2 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/compact-studio/udf/udf-engine.ts` | source | lib/compact-studio | 351 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/component-definitions.ts` | source | lib | 618 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/current-project.ts` | source | lib | 80 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/design-system/contrast.ts` | source | lib/design-system | 73 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/design-system/theme.ts` | source | lib/design-system | 98 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/design-system/tokens.ts` | source | lib/design-system | 146 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagnostics-counter.ts` | source | lib | 141 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics.functions.ts` | source | lib | 135 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/ai-fix.functions.ts` | source | lib/diagnostics | 229 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/ai-repair-context.ts` | source | lib/diagnostics | 920 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/conductor-solver.ts` | source | lib/diagnostics | 266 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/contract.ts` | source | lib/diagnostics | 336 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/crypto-hash.ts` | source | lib/diagnostics | 171 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/draft-orchestrator.ts` | source | lib/diagnostics | 375 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/rules-catalog.ts` | source | lib/diagnostics | 205 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagnostics/types.ts` | source | lib/diagnostics | 5 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagram/ai.functions.ts` | source | lib/diagram | 536 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagram/commands.ts` | source | lib/diagram | 252 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/auto-layout-router.ts` | source | lib/diagram | 231 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/canonical-params.ts` | source | lib/diagram | 353 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/connection-engine.ts` | source | lib/diagram | 460 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/connection-repair-engine.ts` | source | lib/diagram | 892 | PARTIALLY_REVIEWED | P3-DIA-057 | MEDIO |  |
| `src/lib/diagram/connection/graph-validator.ts` | source | lib/diagram | 709 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/index.ts` | source | lib/diagram | 8 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/terminal-library.ts` | source | lib/diagram | 622 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/connection/types.ts` | source | lib/diagram | 123 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/electrical-simulation.ts` | source | lib/diagram | 233 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/diagram/export-dxf.ts` | source | lib/diagram | 78 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/export-svg.ts` | source | lib/diagram | 172 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/history.ts` | source | lib/diagram | 62 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/model.ts` | source | lib/diagram | 73 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/multifilar.ts` | source | lib/diagram | 687 | PARTIALLY_REVIEWED | P1-CALC-050, P1-CALC-051, P2-CALC-052 | MEDIO |  |
| `src/lib/diagram/param-specs.ts` | source | lib/diagram | 340 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/render/ports.ts` | source | lib/diagram | 222 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/render/stage.ts` | source | lib/diagram | 1473 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/render/symbols.ts` | source | lib/diagram | 314 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/render/wire-router.ts` | source | lib/diagram | 566 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/schema.ts` | source | lib/diagram | 324 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/store.ts` | source | lib/diagram | 176 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/diagram/zod-to-json-schema.ts` | source | lib/diagram | 119 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dossier/bom.ts` | source | lib/dossier | 558 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dossier/calculations.ts` | source | lib/dossier | 345 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/dossier/dossier.functions.ts` | source | lib/dossier | 272 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/dossier/export-spreadsheets.ts` | source | lib/dossier | 139 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dossier/extractor.ts` | source | lib/dossier | 417 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dossier/normative.ts` | source | lib/dossier | 375 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/dossier/pdf-builder.ts` | source | lib/dossier | 481 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dossier/plcopen.ts` | source | lib/dossier | 140 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dossier/types.ts` | source | lib/dossier | 337 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/dxf-export.ts` | source | lib | 178 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/edge/buffer/sqlite-outbox.ts` | source | lib/edge | 664 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/cloud-gateway-registry.ts` | source | lib/edge | 379 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/cloud-protocol-guard.server.ts` | source | lib/edge | 253 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/cloud-sync-client.ts` | source | lib/edge | 245 | PARTIALLY_REVIEWED | P1-INC-048 | ALTO |  |
| `src/lib/edge/drivers/modbus-driver.ts` | source | lib/edge | 598 | PARTIALLY_REVIEWED | P1-INC-048 | ALTO |  |
| `src/lib/edge/drivers/opcua-driver.ts` | source | lib/edge | 452 | PARTIALLY_REVIEWED | P2-SEC-049 | ALTO |  |
| `src/lib/edge/drivers/sparkplug-driver.ts` | source | lib/edge | 336 | PARTIALLY_REVIEWED | P1-INC-048 | ALTO |  |
| `src/lib/edge/edge-network-allowlist.ts` | source | lib/edge | 74 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-audit.ts` | source | lib/edge | 337 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-auth-context.server.ts` | source | lib/edge | 178 | PARTIALLY_REVIEWED | P0-SEC-020, P2-SEC-054 | ALTO |  |
| `src/lib/edge/fleet-certificates.ts` | source | lib/edge | 313 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-handlers.server.ts` | source | lib/edge | 323 | PARTIALLY_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-manager.ts` | source | lib/edge | 672 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-persistent-store.server.ts` | source | lib/edge | 1035 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-rbac.ts` | source | lib/edge | 147 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-runtime.server.ts` | source | lib/edge | 401 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet-supabase-store.server.ts` | source | lib/edge | 688 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/fleet.functions.ts` | source | lib/edge | 235 | PARTIALLY_REVIEWED |  | ALTO |  |
| `src/lib/edge/gateway-manager.ts` | source | lib/edge | 285 | FULLY_REVIEWED | P1-INC-048 | ALTO |  |
| `src/lib/edge/modbus-handlers.server.ts` | source | lib/edge | 505 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/opcua-handlers.server.ts` | source | lib/edge | 514 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/protocol-classification.ts` | source | lib/edge | 448 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/provisioning.ts` | source | lib/edge | 576 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/remote-config.ts` | source | lib/edge | 431 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/signed-updates.ts` | source | lib/edge | 736 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/edge/types.ts` | source | lib/edge | 718 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/editor/property-schemas.ts` | source | lib/editor | 59 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/editor/store.ts` | source | lib/editor | 379 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/editor/tablet-layout.ts` | source | lib/editor | 15 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/electrical-calc.ts` | source | lib | 1306 | FULLY_REVIEWED | P1-CALC-022..027, P2-CALC-024/028..032, P3-CALC-033 | ALTO |  |
| `src/lib/electrical-sim.functions.ts` | source | lib | 335 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/electrical-sim.ts` | source | lib | 760 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/error-capture.ts` | source | lib | 402 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/error-page.ts` | source | lib | 31 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/export.functions.ts` | source | lib | 42 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/fbd/compiler.ts` | source | lib/fbd | 13 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/editor-bridge.ts` | source | lib/fbd | 216 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/compiler.ts` | source | lib/fbd | 525 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/datatypes.ts` | source | lib/fbd | 203 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/iec-library.ts` | source | lib/fbd | 613 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/index.ts` | source | lib/fbd | 9 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/model.ts` | source | lib/fbd | 116 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/registry.ts` | source | lib/fbd | 120 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/runtime.ts` | source | lib/fbd | 218 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/simulation.ts` | source | lib/fbd | 106 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/engine/st-generator.ts` | source | lib/fbd | 321 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/runtime.ts` | source | lib/fbd | 381 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/scada-bridge.ts` | source | lib/fbd | 44 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/fbd/types.ts` | source | lib/fbd | 297 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/catalogs/en.ts` | source | lib/i18n | 545 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/catalogs/pt-BR.ts` | source | lib/i18n | 551 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/format.ts` | source | lib/i18n | 81 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/index.ts` | source | lib/i18n | 7 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/missing-key-detector.ts` | source | lib/i18n | 24 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/store.ts` | source | lib/i18n | 179 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/i18n/types.ts` | source | lib/i18n | 25 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/adapters/csv-adapter.ts` | source | lib/importer | 150 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/adapters/json-adapter.ts` | source | lib/importer | 248 | PARTIALLY_REVIEWED | P2-IMP-056 | MEDIO |  |
| `src/lib/importer/adapters/netlist-adapter.ts` | source | lib/importer | 172 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/adapters/plcopen-adapter.ts` | source | lib/importer | 173 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/adapters/st-adapter.ts` | source | lib/importer | 390 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/adapters/txt-spec-adapter.ts` | source | lib/importer | 356 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/adapters/yaml-adapter.ts` | source | lib/importer | 174 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/bundle-schema.ts` | source | lib/importer | 293 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/external-ai-prompts.ts` | source | lib/importer | 254 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/security-validator.ts` | source | lib/importer | 323 | PARTIALLY_REVIEWED |  | ALTO |  |
| `src/lib/importer/types.ts` | source | lib/importer | 215 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/importer/universal-importer.ts` | source | lib/importer | 538 | PARTIALLY_REVIEWED | P2-IMP-055 | MEDIO |  |
| `src/lib/industrial/canonical-data-service.ts` | source | lib/industrial | 1300 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/industrial/index.ts` | source | lib/industrial | 5 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/industrial/tag-contract.ts` | source | lib/industrial | 138 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/industrial/types.ts` | source | lib/industrial | 418 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/industrial/units.ts` | source | lib/industrial | 74 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/iot.functions.ts` | source | lib | 346 | FULLY_REVIEWED | P3-RBAC-019 | ALTO |  |
| `src/lib/ladder/compiler.ts` | source | lib/ladder | 440 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/definitions.ts` | source | lib/ladder | 715 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/from-ai-spec.ts` | source | lib/ladder | 78 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/importer.ts` | source | lib/ladder | 501 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/runtime.ts` | source | lib/ladder | 115 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/scan-core.ts` | source | lib/ladder | 1297 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/types.ts` | source | lib/ladder | 483 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/validator-ui.ts` | source | lib/ladder | 12 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/validator.ts` | source | lib/ladder | 203 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/ladder/verify-estop.ts` | source | lib/ladder | 146 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/index.ts` | source | lib/mcp | 28 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/supabase.ts` | source | lib/mcp | 74 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/tools/create-project.ts` | source | lib/mcp | 59 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/tools/get-project.ts` | source | lib/mcp | 44 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/tools/list-alarms.ts` | source | lib/mcp | 41 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/tools/list-bom-items.ts` | source | lib/mcp | 37 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/mcp/tools/list-projects.ts` | source | lib/mcp | 35 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/modbus-server.functions.ts` | source | lib | 95 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/model/control-bridge.ts` | source | lib/model | 310 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/model/index.ts` | source | lib/model | 6 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/model/migration-v2-to-v3.ts` | source | lib/model | 1124 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/model/runtime-store.ts` | source | lib/model | 215 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/model/unified-schema.ts` | source | lib/model | 525 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/model/unified-store.ts` | source | lib/model | 1121 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/monaco/setup.ts` | source | lib/monaco | 80 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/norm-validator.ts` | source | lib | 351 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/notification-service.ts` | source | lib | 50 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/notification-store.ts` | source | lib | 83 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/ai-diagnostic-assistant.ts` | source | lib/observability | 469 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/causal-correlation-engine.ts` | source | lib/observability | 769 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/data-reliability-tracker.ts` | source | lib/observability | 245 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/dependency-graph.ts` | source | lib/observability | 382 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/diagnostic-rules-engine.ts` | source | lib/observability | 887 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/health-engine.ts` | source | lib/observability | 768 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/incident-manager.ts` | source | lib/observability | 886 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/index.ts` | source | lib/observability | 16 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/observability.functions.ts` | source | lib/observability | 538 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/observability/reliability-metrics.ts` | source | lib/observability | 217 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/runbook-library.ts` | source | lib/observability | 1000 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/observability/sli-slo-calculator.ts` | source | lib/observability | 202 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/observability/types.ts` | source | lib/observability | 704 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/opcua-server.functions.ts` | source | lib | 98 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/palette/component-catalog.ts` | source | lib/palette | 1110 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/pdf-export.ts` | source | lib | 312 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/plans.ts` | source | lib | 79 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/plc/plcopen-export.ts` | source | lib/plc | 106 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/plc/rack-validation.ts` | source | lib/plc | 56 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/plc/store.ts` | source | lib/plc | 115 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/plc/types.ts` | source | lib/plc | 285 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/project-store.ts` | source | lib | 521 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/projects.functions.ts` | source | lib | 814 | PARTIALLY_REVIEWED | P1-DATA-043, P1-DATA-044, P2-DATA-045, P2-ARCH-037 | ALTO |  |
| `src/lib/query-prefetch.ts` | source | lib | 20 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/runtime-client.ts` | source | lib | 209 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/safe-redirect.ts` | source | lib | 79 | FULLY_REVIEWED |  | MEDIO |  |
| `src/lib/scada/alarm-engine.ts` | source | lib/scada | 604 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `src/lib/scada/audit-verifier.ts` | source | lib/scada | 170 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/scada/canonical-bridge.ts` | source | lib/scada | 165 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/scada/demo-ete-seed.ts` | source | lib/scada | 915 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/scada/edge-ingest.functions.ts` | source | lib/scada | 60 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/scada/energy-calculator.ts` | source | lib/scada | 196 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/scada/scada-store.ts` | source | lib/scada | 1107 | PARTIALLY_REVIEWED | P2-DATA-047 | MEDIO |  |
| `src/lib/scada/scada.functions.ts` | source | lib/scada | 962 | PARTIALLY_REVIEWED | P3-SCADA-058 | ALTO |  |
| `src/lib/scada/tag-runtime.ts` | source | lib/scada | 474 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/scada/types.ts` | source | lib/scada | 382 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/security-monitor.functions.ts` | source | lib | 221 | PARTIALLY_REVIEWED |  | ALTO |  |
| `src/lib/security/ai-metrics.server.ts` | source | lib/security | 127 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/ai-rate-limit-config.functions.ts` | source | lib/security | 84 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/ai-rate-limit-config.server.ts` | source | lib/security | 90 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/client-ip-guard.ts` | source | lib/security | 126 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/data-pipeline-guard.ts` | source | lib/security | 409 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/index.ts` | source | lib/security | 22 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/isomorphic-crypto.ts` | source | lib/security | 140 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/mcp-security-guard.ts` | source | lib/security | 299 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/mcp-session-guard.ts` | source | lib/security | 136 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/network-proxy-guard.ts` | source | lib/security | 290 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/payload-guard.ts` | source | lib/security | 123 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/rate-limiter.server.ts` | source | lib/security | 370 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/safe-html-sanitizer.ts` | source | lib/security | 128 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/safe-xlsx.ts` | source | lib/security | 173 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/sanitization-guard.ts` | source | lib/security | 209 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/secret-bundle-inspector.ts` | source | lib/security | 131 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/security-audit-log.server.ts` | source | lib/security | 77 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/spreadsheet-guard.ts` | source | lib/security | 159 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/webhook-ledger.server.ts` | source | lib/security | 153 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/security/xml-guard.ts` | source | lib/security | 191 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/settings-store.ts` | source | lib | 71 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/plant-definition.ts` | source | lib/simulation | 188 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/plant-engine.ts` | source | lib/simulation | 372 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/plant-ladder-program.ts` | source | lib/simulation | 207 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/plant-store.ts` | source | lib/simulation | 82 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/safety-core.ts` | source | lib/simulation | 166 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/sandbox-hardening.ts` | source | lib/simulation | 56 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/scada-engine.ts` | source | lib/simulation | 115 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/scada-worker.ts` | source | lib/simulation | 203 | PARTIALLY_REVIEWED | P2-SEC-034 | MEDIO |  |
| `src/lib/simulation/script-sandbox.ts` | source | lib/simulation | 82 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/test-scenarios.functions.ts` | source | lib/simulation | 595 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/simulation/unifilar-ladder-bridge.ts` | source | lib/simulation | 399 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/simulation/worker-guards.ts` | source | lib/simulation | 40 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/__tests__/canonical-sync.test.ts` | test | lib/studio | 82 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/communication-fleet.test.ts` | test | lib/studio | 159 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/debugger-trace.test.ts` | test | lib/studio | 130 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/deterministic-simulator.test.ts` | test | lib/studio | 145 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/languages-ir.test.ts` | test | lib/studio | 159 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/library-manager.test.ts` | test | lib/studio | 199 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/project-comparison.test.ts` | test | lib/studio | 222 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/safety-advisory-physical-lock.test.ts` | test | lib/studio | 84 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/scada-alarms-recipe.test.ts` | test | lib/studio | 204 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/sfc-execution.test.ts` | test | lib/studio | 221 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/st-parser-compiler.test.ts` | test | lib/studio | 195 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/task-manager.test.ts` | test | lib/studio | 161 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/__tests__/transversal-e2e.test.ts` | test | lib/studio | 218 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `src/lib/studio/canonical/e2e-scenario.ts` | source | lib/studio | 832 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/canonical/project-service.ts` | source | lib/studio | 1132 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/canonical/types.ts` | source | lib/studio | 973 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/canonical/uuid.ts` | source | lib/studio | 15 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/communication/protocol-engine.ts` | source | lib/studio | 317 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/comparison/project-comparison.ts` | source | lib/studio | 488 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/fleet/certificate-manager.ts` | source | lib/studio | 74 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/fleet/fleet-manager.ts` | source | lib/studio | 123 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/compiler/compiler-pipeline.ts` | source | lib/studio | 392 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/compiler/intermediate-representation.ts` | source | lib/studio | 79 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/debugger/debugger-service.ts` | source | lib/studio | 399 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/debugger/trace-engine.ts` | source | lib/studio | 133 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/languages/fbd-engine.ts` | source | lib/studio | 286 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/languages/il-engine.ts` | source | lib/studio | 226 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/languages/ir-translator.ts` | source | lib/studio | 114 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/languages/ladder-engine.ts` | source | lib/studio | 375 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/parser/st-ast.ts` | source | lib/studio | 202 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/parser/st-lexer.ts` | source | lib/studio | 355 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/parser/st-parser.ts` | source | lib/studio | 719 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/parser/st-semantic.ts` | source | lib/studio | 357 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/runtime/standard-blocks.ts` | source | lib/studio | 192 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/runtime/task-scheduler.ts` | source | lib/studio | 551 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/sfc/sfc-engine.ts` | source | lib/studio | 174 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/iec/task/task-manager.ts` | source | lib/studio | 232 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/libraries/industrial-libraries.ts` | source | lib/studio | 1054 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/libraries/library-manager.ts` | source | lib/studio | 490 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/motion/motion-simulator.ts` | source | lib/studio | 125 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/safety/safety-advisory.ts` | source | lib/studio | 74 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/scada/hmi-scada-bridge.ts` | source | lib/studio | 395 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/studio/studio-store.ts` | source | lib/studio | 562 | PARTIALLY_REVIEWED | P1-DATA-046 | MEDIO |  |
| `src/lib/tenant-settings.functions.ts` | source | lib | 128 | NOT_REVIEWED |  | ALTO |  |
| `src/lib/tenants.functions.ts` | source | lib | 309 | FULLY_REVIEWED | P1-SEC-009 | ALTO |  |
| `src/lib/use-project-persistence.ts` | source | lib | 420 | PARTIALLY_REVIEWED |  | MEDIO |  |
| `src/lib/utils.ts` | source | lib | 7 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/workers/worker-manager.ts` | source | lib/workers | 206 | NOT_REVIEWED |  | MEDIO |  |
| `src/lib/workspace-data.ts` | source | lib | 54 | NOT_REVIEWED |  | MEDIO |  |
| `src/routeTree.gen.ts` | generated | routeTree.gen.ts | 1071 | GENERATED_FILE |  | MEDIO |  |
| `src/router.tsx` | source | router.tsx | 17 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/[.]lovable.oauth.consent.tsx` | source | routes | 171 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/[.well-known]/oauth-protected-resource.ts` | source | routes | 24 | FULLY_REVIEWED |  | MEDIO |  |
| `src/routes/__root.tsx` | source | routes | 288 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/ai.tsx` | source | routes | 378 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/analytics.tsx` | source | routes | 418 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/api/public/iot.ingest.ts` | source | routes | 140 | FULLY_REVIEWED |  | ALTO |  |
| `src/routes/api/public/mp.webhook.ts` | source | routes | 344 | FULLY_REVIEWED | P2-BILL-012 | ALTO |  |
| `src/routes/api/public/stripe.webhook.ts` | source | routes | 263 | FULLY_REVIEWED | P2-BILL-011, P2-BILL-012 | ALTO |  |
| `src/routes/auth.callback.tsx` | source | routes | 73 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/catalog.tsx` | source | routes | 140 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/chat.tsx` | source | routes | 328 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/clients.$clientId.tsx` | source | routes | 204 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/clients.tsx` | source | routes | 320 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/dashboard.tsx` | source | routes | 579 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/design-system.tsx` | source | routes | 632 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/forgot-password.tsx` | source | routes | 69 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/index.tsx` | source | routes | 1212 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/invite.$token.tsx` | source | routes | 91 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/login.tsx` | source | routes | 222 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/mcp.ts` | source | routes | 23 | FULLY_REVIEWED |  | MEDIO |  |
| `src/routes/onboarding.tsx` | source | routes | 241 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/privacidade.tsx` | source | routes | 27 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/projects.$projectId.bom.tsx` | source | routes | 283 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/projects.$projectId.export.tsx` | source | routes | 226 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/projects.tsx` | source | routes | 560 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/realtime.tsx` | source | routes | 452 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/reset-password.tsx` | source | routes | 73 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/scada.tsx` | source | routes | 38 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.ai-status.tsx` | source | routes | 660 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.appearance.tsx` | source | routes | 85 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.autosave.tsx` | source | routes | 225 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.billing.tsx` | source | routes | 940 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.catalog-import.tsx` | source | routes | 300 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.diagnostics.tsx` | source | routes | 635 | NOT_REVIEWED |  | ALTO |  |
| `src/routes/settings.edge-fleet.tsx` | source | routes | 17 | NOT_REVIEWED |  | ALTO |  |
| `src/routes/settings.integrations.tsx` | source | routes | 140 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.notifications.tsx` | source | routes | 67 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.observability.tsx` | source | routes | 20 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.profile.tsx` | source | routes | 319 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.protocols.tsx` | source | routes | 488 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.rate-limits.tsx` | source | routes | 284 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.security-monitor.tsx` | source | routes | 412 | NOT_REVIEWED |  | ALTO |  |
| `src/routes/settings.security.tsx` | source | routes | 95 | NOT_REVIEWED |  | ALTO |  |
| `src/routes/settings.team.tsx` | source | routes | 884 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/settings.tsx` | source | routes | 359 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/signup.tsx` | source | routes | 135 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/termos.tsx` | source | routes | 27 | NOT_REVIEWED |  | MEDIO |  |
| `src/routes/workspace.tsx` | source | routes | 32 | NOT_REVIEWED |  | MEDIO |  |
| `src/server.ts` | source | server.ts | 100 | FULLY_REVIEWED |  | MEDIO |  |
| `src/start.ts` | source | start.ts | 25 | FULLY_REVIEWED |  | MEDIO |  |
| `src/styles.css` | source | styles.css | 536 | NOT_REVIEWED |  | MEDIO |  |
| `src/types/bun-sqlite.d.ts` | source | types | 30 | NOT_REVIEWED |  | MEDIO |  |
| `src/types/supply-chain-modules.d.ts` | source | types | 27 | NOT_REVIEWED |  | MEDIO |  |
| `src/vite-env.d.ts` | source | vite-env.d.ts | 17 | NOT_REVIEWED |  | MEDIO |  |
| `supabase/SQL_EDITOR_APPLY_PENDING_MIGRATIONS.sql` | config/script | supabase | 2649 | NOT_REVIEWED |  | MEDIO |  |
| `supabase/config.toml` | config/script | supabase | 5 | FULLY_REVIEWED | P2-ARCH-018 | MEDIO |  |
| `supabase/functions/ai-electrical-generator/index.ts` | edge-function | supabase | 482 | PARTIALLY_REVIEWED |  | ALTO |  |
| `supabase/functions/ai-fix-diagnostics/index.ts` | edge-function | supabase | 420 | PARTIALLY_REVIEWED | P2-AI-016, P2-AI-017 | ALTO |  |
| `supabase/functions/ai-industrial-architect/index.ts` | edge-function | supabase | 418 | PARTIALLY_REVIEWED |  | ALTO |  |
| `supabase/functions/stripe-webhook/index.ts` | edge-function | supabase | 279 | PARTIALLY_REVIEWED | P2-ARCH-018 | ALTO |  |
| `supabase/migrations/20260505201856_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505201912_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505201917_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505201934_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505201937_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505201939_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505201957_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505202000_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505202035_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505202036_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260505202039_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515131608_df5c8eac-a1a0-4938-8b40-93d2b9fc1040.sql` | migration | supabase | 164 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515132404_6ec3a006-a5ef-4ab3-a62a-d262002d78aa.sql` | migration | supabase | 81 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515143515_e391699c-9b9f-4d4e-bba1-18bd12dc479d.sql` | migration | supabase | 57 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515151638_027f1a43-5ea2-4ead-80ea-fd425b5fe7c9.sql` | migration | supabase | 139 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515152908_f2c85d4a-364d-4c9c-a412-482afa392de7.sql` | migration | supabase | 45 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515153903_2da605cf-32d0-4864-92c5-4715db18f7e0.sql` | migration | supabase | 72 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515163005_213f7152-c9aa-45db-abfc-134692390cff.sql` | migration | supabase | 91 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515163236_e60b1855-8853-4788-807c-fdc0b3e020ea.sql` | migration | supabase | 62 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515171049_727a7c07-364c-4f38-a879-d89d7805f0bd.sql` | migration | supabase | 126 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515171326_9e75d621-3980-4b05-8804-28762a6f310d.sql` | migration | supabase | 45 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515172029_af6c2fea-ff3b-4b24-98fc-e21f5f5a87b5.sql` | migration | supabase | 154 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515172755_a6db46a2-f5bf-470b-bdf8-9d943ecfbbaf.sql` | migration | supabase | 195 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260515173526_4b44c9ae-a673-446a-9b1e-25bb06858fb4.sql` | migration | supabase | 81 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260518000001_create_notifications_table.sql` | migration | supabase | 79 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260518162000_harden_security_definer_permissions.sql` | migration | supabase | 94 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260518170000_grant_platform_admin_to_known_email.sql` | migration | supabase | 49 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260518183000_close_authenticated_security_definer_gaps.sql` | migration | supabase | 340 | PARTIALLY_REVIEWED |  | ALTO |  |
| `supabase/migrations/20260519020805_620e7556-b7b2-463d-9775-2b84787d8307.sql` | migration | supabase | 125 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260519020851_5cedeac7-fa87-4b94-9686-469ea674fd1c.sql` | migration | supabase | 23 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260522020224_fdc73a18-56c4-4d1b-b50d-6986817e8073.sql` | migration | supabase | 1 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260524002210_6ad57136-6e38-4a4b-a9e8-c821c78103fc.sql` | migration | supabase | 117 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260524002930_3b85bab7-85bb-4893-a36a-007b1e2025ca.sql` | migration | supabase | 30 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260524003400_9c6abb7f-a89c-42dd-a183-4611f9ef3a16.sql` | migration | supabase | 95 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260525021759_a33b9b60-ccdb-4d88-b7a9-28d2267cfea3.sql` | migration | supabase | 112 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260527022235_14cab480-790a-45d0-8801-63f1065e3058.sql` | migration | supabase | 100 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260531133205_f089dcc7-7d9f-4685-8f2c-bf4159180ed7.sql` | migration | supabase | 25 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260601000000_fix_authenticated_function_grants.sql` | migration | supabase | 103 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260602134459_de56dc63-b2c4-4e4d-b970-251cd341ec3c.sql` | migration | supabase | 189 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260605004018_dbc51219-00d0-4520-8512-19335736156c.sql` | migration | supabase | 59 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260608023333_08d93f81-0d26-4189-97d3-cd8eb94a937f.sql` | migration | supabase | 9 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260608023607_5c9a1676-1399-440a-b56a-3f01aa3c74ca.sql` | migration | supabase | 168 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260615215024_425aac29-1cfa-4180-9d23-de887d72f75f.sql` | migration | supabase | 76 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260616105310_3f70d122-ea39-45a0-a27b-cfdb39a092b8.sql` | migration | supabase | 109 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260619225124_ea404bdd-342d-4daa-ae16-3e24ca34d4fd.sql` | migration | supabase | 54 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260626082857_31dfcdf3-71c5-4827-8b63-667eff8dc9b7.sql` | migration | supabase | 53 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260703091614_b60c20e3-5d63-4993-b76a-690b04dc6b97.sql` | migration | supabase | 128 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260808023701_33655919-bb38-41be-82ca-aea346721d5f.sql` | migration | supabase | 22 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260906072900_baseline_rls_consolidation.sql` | migration | supabase | 3304 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260912071224_45f3a189-e1fd-479e-8430-e232622ac863.sql` | migration | supabase | 18 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20260912153256_4ed0c178-49fd-44a6-b1b5-c062e054cc39.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261012090000_fix_risk001_twin_hotspots_rls.sql` | migration | supabase | 145 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261012090001_fix_risk002_remove_hardcoded_admin_trigger.sql` | migration | supabase | 20 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261012090002_fix_risk003_membership_role_escalation.sql` | migration | supabase | 102 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261012110000_fix_deletion_policies_and_requests.sql` | migration | supabase | 86 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261012120000_complete_missing_tables.sql` | migration | supabase | 562 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261014201000_core_tables_ddl.sql` | migration | supabase | 1327 | PARTIALLY_REVIEWED | P1-DB-005 | ALTO |  |
| `supabase/migrations/20261014202000_fix_risk005_invoices_subscriptions_rls.sql` | migration | supabase | 53 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261015210000_bootstrap_personal_tenant_rpc.sql` | migration | supabase | 383 | FULLY_REVIEWED | P1-DB-005 | ALTO |  |
| `supabase/migrations/20261030000000_create_ai_fix_audit.sql` | migration | supabase | 90 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261030023846_remote_history_placeholder.sql` | migration | supabase | 2 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261108090000_gate3_6_canonical_industrial_model.sql` | migration | supabase | 426 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261108100000_gate3_7_industrial_observability.sql` | migration | supabase | 216 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261108110000_gate3_8_industrial_diagnostics.sql` | migration | supabase | 152 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261111120000_gate4_3_security_hardening_rls.sql` | migration | supabase | 382 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261111180000_gate4_3_1_enterprise_persistence.sql` | migration | supabase | 246 | PARTIALLY_REVIEWED |  | ALTO |  |
| `supabase/migrations/20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql` | migration | supabase | 640 | PARTIALLY_REVIEWED |  | ALTO |  |
| `supabase/migrations/20261112140000_gate4_3_2_complete_rls_policies.sql` | migration | supabase | 537 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261112150000_compact_studio_libraries_and_audit.sql` | migration | supabase | 122 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261114120000_gate4_3_3_memory_and_rls_hardening.sql` | migration | supabase | 189 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `supabase/migrations/20261114150000_drop_digital_twin_module.sql` | migration | supabase | 53 | PARTIALLY_REVIEWED |  | ALTO | Parse estatico automatizado de RLS/policies (tools/rls.mjs); leitura humana pendente |
| `tests/e2e/01-navigation-and-routes.spec.ts` | test | tests | 71 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tests/e2e/02-workspace-and-modes.spec.ts` | test | tests | 104 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tests/e2e/03-codesys-engineering-studio.spec.ts` | test | tests | 175 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tests/e2e/03-workspace-reconstruction-p0.spec.ts` | test | tests | 85 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tests/e2e/04-scada-and-alarms.spec.ts` | test | tests | 110 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tests/e2e/05-security-barrier-and-fleet.spec.ts` | test | tests | 149 | NOT_REVIEWED |  | ALTO | Executado (vitest) mas nao lido |
| `tests/e2e/06-button-inventory-and-coverage.spec.ts` | test | tests | 251 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tests/e2e/07-multi-viewport-responsiveness.spec.ts` | test | tests | 52 | NOT_REVIEWED |  | BAIXO | Executado (vitest) mas nao lido |
| `tsconfig.json` | config/script | tsconfig.json | 28 | NOT_REVIEWED |  | MEDIO |  |
| `vercel.json` | config/script | vercel.json | 45 | FULLY_REVIEWED | P2-SEC-004 | MEDIO |  |
| `vite.config.ts` | config/script | vite.config.ts | 89 | FULLY_REVIEWED | P1-SEC-010 | MEDIO |  |
| `vitest.config.ts` | config/script | vitest.config.ts | 15 | FULLY_REVIEWED |  | MEDIO |  |