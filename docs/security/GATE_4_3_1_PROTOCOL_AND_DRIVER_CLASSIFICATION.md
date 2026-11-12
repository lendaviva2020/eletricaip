# GATE 4.3.1 — CLASSIFICAÇÃO HONESTA DE PROTOCOLOS, DRIVERS & PROVENIÊNCIA

**Status:** `IMPLEMENTED`, `TESTED`, `VERIFIED`

---

## 1. Taxonomia Oficial de Implementação (`PROTOCOL_LAYER_CLASSIFICATION`)

Definida em [`src/lib/edge/protocol-classification.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/protocol-classification.ts) e exposta na interface [`/settings/protocols`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/settings.protocols.tsx):

| Módulo / Componente | Classe Honesta (`implementationClass`) | Localização Real | Escrita Física |
|---|---|---|---|
| [`modbus-server.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/modbus-server.functions.ts) | `SIMULATOR` / Leitura mediada | `CLOUD` | **Bloqueada** |
| [`opcua-server.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/opcua-server.functions.ts) | `SIMULATOR` / Leitura mediada | `CLOUD` | **Bloqueada** |
| [`ModbusProtocolEngine`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/studio/communication/protocol-engine.ts) | `PARSER` | `SHARED_PURE` | **Bloqueada** |
| [`OPCUAProtocolEngine`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/studio/communication/protocol-engine.ts) | `PARSER` | `SHARED_PURE` | **Bloqueada** |
| [`SparkplugBProtocolEngine`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/studio/communication/protocol-engine.ts) | `PARSER` | `SHARED_PURE` | **Bloqueada** |
| [`MQTTProtocolEngine`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/studio/communication/protocol-engine.ts) | `PARSER` | `SHARED_PURE` | **Bloqueada** |
| [`ModbusTcpClientDriver`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/modbus-driver.ts) | `LAB_EDGE_ADAPTER` | `EDGE_GATEWAY` | **Bloqueada** |
| [`OpcUaClientDriver`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/opcua-driver.ts) | `LAB_EDGE_ADAPTER` | `EDGE_GATEWAY` | **Bloqueada** |
| [`SparkplugBDriver`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/sparkplug-driver.ts) | `LAB_EDGE_ADAPTER` | `EDGE_GATEWAY` | **Bloqueada** |
| [`CloudGatewayRegistry`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/cloud-gateway-registry.ts) | `EDGE_TRANSPORT` | `CLOUD` | **Bloqueada** |

Nenhuma camada na nuvem executa `PHYSICAL_COMMUNICATION` direta contra rede OT; comunicação física real é reservada exclusivamente a agentes on-premise Edge Gateway operando estritamente em modo leitura.

---

## 2. Classificação Explícita de Proveniência (`TagProvenance`)

Cada registrador Modbus, nó OPC-UA e resposta RPC transporta proveniência rastreável:

- `PHYSICAL_READ_ONLY`: dado recebido via ingestão assinada de Edge Gateway `ONLINE`.
- `SIMULATED`: dado sintetizado em memória no modo `SIMULATOR` (`host === "simulation"` / `opc.tcp://simulation:4840`).
- `FORCED_SIMULATED`: escrita aplicada **exclusivamente** no simulador em memória virtual.
- `CALCULATED`, `STALE`, `BAD`, `NOT_CONNECTED`, `UNKNOWN`: estados explícitos quando gateway está degradado, desconectado ou sem telemetria ingerida — nunca substituídos silenciosamente por valores fictícios de simulador em modo `EDGE_READ_ONLY`.
