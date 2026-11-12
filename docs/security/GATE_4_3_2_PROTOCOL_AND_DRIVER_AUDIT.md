# GATE 4.3.2 — PROTOCOL LAYER & EDGE DRIVER TECHNICAL AUDIT

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Status:** `VERIFIED`

---

## 1. Matriz Honesta de Classificação ([`protocol-classification.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/protocol-classification.ts))

| Módulo / Driver | Classe Declarada | Capacidade Real & Limite Honesto |
|---|---|---|
| [`modbus-server.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/modbus-server.functions.ts) / [`modbus-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/modbus-handlers.server.ts) | `SIMULATOR` / Cloud Read-Only Mediated | Zero `net.Socket`/`dns`; lê snapshots do `CloudGatewayRegistry` em `EDGE_READ_ONLY` ou simula em memória (`SIMULATOR`). |
| [`opcua-server.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/opcua-server.functions.ts) / [`opcua-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/opcua-handlers.server.ts) | `SIMULATOR` / Cloud Read-Only Mediated | Zero sessões OPC UA binárias diretas na Cloud; consome telemetria ingerida ou simulador. |
| [`ModbusTcpClientDriver`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/modbus-driver.ts) | `LAB_EDGE_ADAPTER` | Codifica/decodifica frames binários MBAP + PDU (`buildMbapReadRequestFrame`, `decodeMbapReadResponseFrame`), decodifica `INT16`/`UINT16`/`INT32`/`UINT32`/`FLOAT32` nos 4 endiannesses (`ABCD`, `DCBA`, `CDAB`, `BADC`), bloqueia FC5/FC6/FC15/FC16; opera sobre mapa de laboratório sem socket físico. |
| [`OpcUaClientDriver`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/opcua-driver.ts) | `LAB_EDGE_ADAPTER` | Allowlist de serviços read-only, verificação SHA-256 em TrustList, recusa `SecurityPolicy='None'` em `NODE_ENV=production`; armazenamento de nós em memória de laboratório. |
| [`SparkplugBDriver`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/sparkplug-driver.ts) | `LAB_EDGE_ADAPTER` | Parsing de tópicos `spBv1.0/{groupId}/{messageType}/{edgeNodeId}`, rollover `seq` 0..255, rejeição de `NCMD`/`DCMD` tanto em `publish`/`sendCommand` quanto em `handleIncomingMessage` e validação estrita de `groupId` + `edgeNodeId`. |
| [`protocol-engine.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/studio/communication/protocol-engine.ts) | `PARSER` | Parsers puros de frame MBAP/CRC-16, NodeId e payloads Sparkplug B no Studio. |
