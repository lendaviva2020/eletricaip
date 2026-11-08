# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# MOTOR DETERMINÍSTICO DE CAUSA RAIZ (30 REGRAS CANÔNICAS)

## 1. Filosofia "Deterministic First"

No ElétricAi Industrial OS, o diagnóstico de causa raiz é executado primeiramente pelo motor determinístico [`DeterministicDiagnosticEngine`](../../src/lib/observability/diagnostic-rules-engine.ts), antes de qualquer camada consultiva de IA.

Cada registro [`DeterministicDiagnosticRecord`](../../src/lib/observability/types.ts) inclui:

- `diagnosticId`, `ruleId`, `ruleVersion` (`3.8.0-deterministic`)
- `tenantId`, `plantId`, `primaryComponent`, `affectedComponents`
- `evidenceReferences`, `observedConditions`, `expectedConditions`, `missingInformation`
- `hypothesis`, `confidence` (`0.0` a `1.0`), `confidenceMethod`
- `diagnosticStatus` (`OBSERVED`, `SUSPECTED`, `CONFIRMED_BY_EVIDENCE`, `INCONCLUSIVE`, `REJECTED`, `RESOLVED`)
- `recommendedRunbookIds`

---

## 2. Catálogo das 30 Regras Determinísticas Obrigatórias

| Regra | Condição Determinística | Diagnóstico / Hipótese |
|---|---|---|
| `RULE_01_GATEWAY_OFFLINE_INGESTION_HALT` | Gateway offline + ingestão parada | Perda de conectividade WAN ou falha elétrica do gateway |
| `RULE_02_GATEWAY_ONLINE_SOURCE_UNAVAILABLE` | Gateway online + fonte sem resposta | Falha na fonte industrial (PLC/Inversor) ou rede OT local |
| `RULE_03_MODBUS_RECURRENT_TIMEOUTS` | $\ge 3$ timeouts consecutivos Modbus TCP | Indisponibilidade do escravo Modbus, porta 502 ou rede OT |
| `RULE_04_OPCUA_SESSION_LOST` | Queda de sessão OPC UA | Perda de sessão, certificado rejeitado ou servidor OPC UA indisponível |
| `RULE_05_MQTT_BROKER_DISCONNECTED` | Broker MQTT desconectado | Queda do broker MQTT ou falha de autenticação/TLS |
| `RULE_06_CERTIFICATE_EXPIRED` | Certificado X.509 com `notAfter` expirado | Bloqueio de comunicação por certificado expirado |
| `RULE_07_CERTIFICATE_REVOKED` | Certificado revogado na CRL | Gateway bloqueado por segurança |
| `RULE_08_OUTBOX_ACCUMULATING` | Outbox $> 500$ + sincronização parada | Falha de envio para Cloud ou endpoint inacessível |
| `RULE_09_EDGE_DISK_NEAR_SATURATION` | Uso de disco no Edge $\ge 85\%$ | Risco de saturação da capacidade de buffer local |
| `RULE_10_SQLITE_STORAGE_FAILURE` | Erro de escrita SQLite WAL | Falha de armazenamento local no Edge |
| `RULE_11_CLOUD_UNAVAILABLE_EDGE_AUTONOMOUS` | Cloud indisponível + Edge autônomo ativo | Indisponibilidade Cloud sem perda de coleta local |
| `RULE_12_CLOUD_HEALTHY_DB_UNAVAILABLE` | Cloud saudável + PostgreSQL indisponível | Falha de persistência central |
| `RULE_13_DB_HEALTHY_APP_FAILURE` | Banco saudável + erro de aplicação Cloud | Falha de serviço Cloud |
| `RULE_14_HISTORIAN_FAILURE_SCADA_LIVE` | Historian sem gravar + SCADA tempo real ativo | Falha específica no pipeline de persistência histórica |
| `RULE_15_LATE_DATA_SYNC_INTERRUPTED` | Atraso de dados $> 15000\text{ ms}$ | Fila acumulada ou sincronização interrompida |
| `RULE_16_PIPELINE_SEQUENCE_GAP` | Lacuna na numeração de sequência | Perda ou atraso de lotes no pipeline |
| `RULE_17_DUPLICATE_MESSAGES_STORM` | Mensagens duplicadas recebidas | Reenvio de lote por timeout de ACK (tratado idempotentemente) |
| `RULE_18_OUT_OF_ORDER_TELEMETRY` | Amostras fora de ordem | Reprocessamento de buffer ou atraso de rede |
| `RULE_19_CLOCK_DRIFT_DETECTED` | Desvio de relógio $> 5000\text{ ms}$ | Relógio desalinhado entre fonte, Edge ou Cloud |
| `RULE_20_PERSISTENT_BAD_QUALITY` | Qualidade `BAD` persistente | Falha de leitura na origem ou sensor/PLC em fault |
| `RULE_21_SOURCE_STATE_UNKNOWN` | Qualidade/estado `UNKNOWN` | Ausência de evidência suficiente (`INCONCLUSIVE`) |
| `RULE_22_TAG_STALE_NO_SAMPLES` | Tag `STALE` sem deadband ativo | Ausência de novas amostras dentro do scan rate |
| `RULE_23_DEADBAND_NO_CHANGE_HEALTHY` | Deadband ativo sem variação física | Comportamento normal (`RESOLVED`), **não classificado como falha** |
| `RULE_24_CERT_FAILURE_ON_RECONNECT` | Erro TLS/X.509 na reconexão | Credencial expirada, revogada ou incorreta |
| `RULE_25_SYNC_FAILURE_POST_EDGE_UPDATE` | Falha de sync após update do Edge | Incompatibilidade ou regressão pós-atualização |
| `RULE_26_GATEWAY_RESOURCE_SATURATION` | CPU $\ge 90\%$ ou Memória $\ge 90\%$ | Sobrecarga local no Edge Gateway |
| `RULE_27_GATEWAY_CLOUD_AUTH_FAILURE` | Falha de autenticação do gateway | Credencial inválida ou bloqueada |
| `RULE_28_CROSS_TENANT_ACCESS_BLOCKED` | Tentativa de acesso cross-tenant | Evento de segurança bloqueado por RLS/RBAC |
| `RULE_29_HISTORICAL_QUERY_FAILURE` | Falha em consulta ao Historian | Indisponibilidade ou lentidão no Historian |
| `RULE_30_OBSERVABILITY_SERVICE_INTERRUPTION` | Falha no pipeline de observabilidade | Perda parcial de visibilidade operacional |
