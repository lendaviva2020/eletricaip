# GATE 4.3.1 — PERSISTÊNCIA DO FLEET MANAGEMENT & AUDIT TRAIL APPEND-ONLY

**Status:** `IMPLEMENTED`, `TESTED`, `VERIFIED`

---

## 1. Camada Persistente SQLite WAL + Paridade PostgreSQL

Anteriormente, `CloudGatewayRegistry`, `EdgeFleetManager`, `FleetCertificateManager`, `RemoteConfigManager`, `SignedUpdateManager`, `EdgeProvisioningService` e `FleetAuditManager` mantinham estado somente em memória volátil (`Map` e arrays).

No Gate 4.3.1 foram implementados:

1. **Contrato isomórfico [`FleetStorageBackend`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/types.ts):** abstrai persistência transacional sem acoplar módulos client/shared a built-ins do Node.
2. **Backend transacional SQLite [`SqliteFleetStorageBackend`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-persistent-store.server.ts):** utiliza exclusivamente APIs nativas (`node:sqlite` no Node 24 e `bun:sqlite` no runtime Bun) com `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, `PRAGMA foreign_keys = ON` e transações `BEGIN IMMEDIATE ... COMMIT`.
3. **Isolamento Browser/Server [`fleet-runtime.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts):** conecta os singletons do servidor ao banco persistente (`ELETRICAI_FLEET_DB_PATH` ou `data/eletricai-fleet.sqlite`, usando `:memory:` apenas em testes unitários sem path customizado), garantindo **0 dependências Node** no bundle estático do navegador (`.vercel/output/static/`).

### Invariantes Persistidos entre Reinicializações (Cold Starts)

- **Tokens de provisionamento (`provisioning_tokens`):** consumo único atômico (`UPDATE ... WHERE is_consumed = 0 AND is_revoked = 0`) evitando condição de corrida e replay após reinício.
- **Identidade e revogação (`registered_gateways`, `fleet_gateways`):** revogações de certificado/gateway e histórico de estado sobreviveram à reinicialização completa da instância em testes em disco.
- **Ingestão de telemetria (`ingested_telemetry_dedup`, `latest_gateway_telemetry`):** chaves de deduplicação `${gatewayId}:${tagName}:${sourceTimestamp}` e número de sequência monotônico `last_batch_sequence` mantidos atomicamente por lote.
- **Certificados e desafios PoP (`gateway_certificates`, `certificate_challenges`):** desafios Proof-of-Possession são gravados como uso único (`consumeChallengeOnce`) impedindo ataque de replay criptográfico.
- **Configuração Remota (`remote_configs`):** restrição `UNIQUE (gateway_id, config_version)` e verificação monotônica `MAX(config_version) < proposedVersion` dentro de transação + persistência de `is_lkgc` após rollback.

---

## 2. Cadeia de Auditoria Imutável (Append-Only Audit Chain)

Corrigida a mutação pós-hash identificada em [`FleetAuditManager`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-audit.ts):

1. **Zero Mutação Retroativa:** `acknowledgeEvent` / `acknowledgeEventAndGetRecord` **nunca** altera `event.lifecycleState` nem `event.details` de um registro já gravado/assinado. Em vez disso, encadeia um **novo bloco** `GATEWAY_EVENT_ACKNOWLEDGED` referenciando `acknowledgedEventId` e `acknowledgedEventHash`.
2. **Serialização Canônica Determinística:** função `canonicalJson()` ordena recursivamente chaves de objetos e versiona cada registro com `schemaVersion: "4.3.1"`.
3. **Bloqueio de Apagamento/Reset em Banco:** triggers SQLite (`trg_fleet_audit_no_update`, `trg_fleet_audit_no_delete`) e PostgreSQL (`trg_fleet_audit_chain_immutable`) abortam qualquer `UPDATE` ou `DELETE` com `AUDIT_CHAIN_IMMUTABLE`.
4. **Proteção de `clear()`:** `FleetAuditManager.clear()` lança erro imediato se executado em `NODE_ENV=production`, `VERCEL_ENV=production` ou quando conectado a qualquer armazenamento persistente (`this.store`).
