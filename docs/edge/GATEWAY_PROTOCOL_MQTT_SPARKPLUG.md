# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## PROTOCOL SPECIFICATION: MQTT SPARKPLUG B READ-ONLY ADAPTER

**Norma de Referência:** Eclipse Sparkplug B Specification V1.0 (ISO/IEC 20237)  
**Módulo Responsável:** `src/lib/edge/drivers/sparkplug-driver.ts`  
**Suíte de Homologação:** `src/__tests__/edge-sparkplug-homologation.test.ts`

---

## 1. ESCOPO E ESTRUTURA DO PROTOCOLO

O driver MQTT Sparkplug B do ElétricAi Edge Gateway permite a ingestão padronizada de telemetria proveniente de sensores inteligentes, gateways de telemetria e CLPs modernos que publicam no padrão Sparkplug B sobre brokers MQTT industriais (HiveMQ, Mosquitto, EMQX).

### Namespace Canônico do Tópico:
```
spBv1.0/{groupId}/{messageType}/{edgeNodeId}/[{deviceId}]
```

### Tipos de Mensagens Homologadas:
- **`NBIRTH` (Node Birth):** Publicado pelo nó de borda ao conectar-se. Contém o inventário completo de métricas do nó e o sequence number inicial.
- **`DBIRTH` (Device Birth):** Publicado para registrar dispositivos de campo ligados ao nó (ex.: inversores ou motores acoplados).
- **`NDATA` (Node Data):** Atualizações de telemetria periódicas ou por exceção das métricas do nó.
- **`DDATA` (Device Data):** Atualizações de telemetria das métricas do dispositivo.
- **`NDEATH` (Node Death):** Mensagem de óbito do nó, configurada no broker via Last Will and Testament (LWT) para sinalizar queda do nó.
- **`DDEATH` (Device Death):** Sinaliza perda de comunicação de um dispositivo específico.

---

## 2. CONTROLE DE SEQUÊNCIA E INTEGRIDADE

- **Sequence Number (`seq`):** Inteiro sequencial de 0 a 255 em mensagens `NDATA` e `DDATA`.
- **Detecção de Quebra:** Caso um pacote chegue fora de ordem ou com salto numérico, o driver detecta a descontinuidade e sinaliza que o nó necessita de procedimento de Rebirth para resincronização do catálogo de métricas.
- **Transição para STALE:** No recebimento de `NDEATH` (ou desconexão sem aviso), todas as variáveis vinculadas àquele nó são automaticamente transicionadas para a qualidade industrial `STALE`.

---

## 3. SEGURANÇA E READ-ONLY

- **TLS Obrigatório:** Conexão sobre portas seguras MQTTS (porta 8883) com validação de certificados de autoridade certificadora (CA).
- **Validação de Tópicos por Allowlist (ACL):** Mensagens recebidas em tópicos que não correspondam ao `groupId` autorizado são descartadas e contabilizadas em `requestsFailed`.
- **Bloqueio de Comandos:** Comandos de escrita física (`NCMD` e `DCMD`) estão estritamente omitidos da interface do driver.
