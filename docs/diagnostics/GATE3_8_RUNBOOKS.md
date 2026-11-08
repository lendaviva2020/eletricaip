# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# BIBLIOTECA OFICIAL DE PROCEDIMENTOS TÉCNICOS E RUNBOOKS

## 1. Governança e Versionamento

O módulo [`IndustrialRunbookLibrary`](../../src/lib/observability/runbook-library.ts) mantém o catálogo oficial de procedimentos técnicos de diagnóstico, mitigação e validação operacional em 12 categorias industriais.

Cada `IndustrialRunbook` contém:
- `runbookId`, `title`, `category`, `affectedComponentTypes`
- `symptoms`, `diagnosticChecks`, `recoveryProcedure`, `validationProcedure`
- `requiredPermissions`, `safetyWarnings`, `expectedEvidence`
- `version`, `author`, `approvalStatus` (`APPROVED`) e `revisionHistory`

---

## 2. Classificação de Passos e Limites de Segurança

Todo passo de runbook (`RunbookStep`) é tipado explicitamente por `RunbookActionType`:
1. `INFORMATIVE`: Orientação informativa sobre comportamento normal (ex: deadband ativo).
2. `READ_ONLY_VERIFICATION`: Verificação estritamente somente leitura de telemetria, logs ou grafo.
3. `SOFTWARE_ADMIN_PROCEDURE`: Procedimento administrativo de software na camada Cloud ou daemon Edge (ex: rotação de logs, renovação de certificado).
4. `AUTHORIZED_ENGINEER_REQUIRED`: Ajuste de parâmetros de software de engenharia que exige papel `ENGINEER` ou superior.
5. `QUALIFIED_HUMAN_FIELD_INTERVENTION`: Intervenção física em painel elétrico, cabeamento OT ou instrumentação em campo executada exclusivamente por profissional humano habilitado (NR-10).

Nenhum runbook executa ou habilita escrita remota em PLCs, inversores ou atuadores (`isPhysicalControlAllowed: false`).

---

## 3. Cobertura das 12 Categorias Obrigatórias

| Categoria | Runbooks Homologados |
|---|---|
| `CLOUD` | `RB_CLOUD_DEGRADATION_RESPONSE` |
| `EDGE` | `RB_EDGE_OFFLINE_RECOVERY`, `RB_EDGE_DISK_CLEANUP_AND_WAL` |
| `MODBUS` | `RB_MODBUS_TIMEOUT_DIAGNOSIS` |
| `OPC_UA` | `RB_OPCUA_SESSION_RECOVERY` |
| `MQTT` | `RB_MQTT_BROKER_RECONNECT` |
| `HISTORIAN` | `RB_HISTORIAN_INGESTION_RECOVERY` |
| `SCADA` | `RB_SCADA_STALE_DATA_INVESTIGATION` |
| `DATABASE` | `RB_DATABASE_CONNECTIVITY_RECOVERY` |
| `CERTIFICATES` | `RB_CERT_ROTATION_RENEWAL` |
| `SECURITY` | `RB_SECURITY_INCIDENT_RESPONSE` |
| `SYNCHRONIZATION` | `RB_SYNC_OUTBOX_DRAIN` |
| `DATA_QUALITY` | `RB_DATA_QUALITY_CLOCK_DRIFT`, `RB_DATA_QUALITY_BAD_SENSOR`, `RB_DATA_QUALITY_DEADBAND_VERIFY` |
