# GATE 4.0 — INDUSTRIAL COMMUNICATION & FIELD PROTOCOLS ENGINE
## MODBUS TCP/RTU, OPC UA E MQTT / SPARKPLUG B COM BARREIRA DE ISOLAMENTO FÍSICO

### 1. OBJETIVO E VISÃO GERAL

O módulo `ProtocolEngine` do ElétricAi Industrial OS implementa a camada de comunicação de barramentos de campo e telemetria industrial, em conformidade com as capacidades de Fieldbus e IoT do CODESYS V3.5.

A camada é projetada de forma agnóstica a hardware físico, executando validação rigorosa de frames binários e garantindo que comandos de escrita em campo real sejam inviolavelmente bloqueados por software.

---

### 2. PROTOCOLO MODBUS TCP E MODBUS RTU

#### Estrutura do Frame Modbus TCP (MBAP + PDU):
- **Transaction ID (2 bytes)**: Identificador da transação para correlação de requisição/resposta.
- **Protocol ID (2 bytes)**: Obrigatoriamente `0x0000` para Modbus TCP.
- **Length (2 bytes)**: Contagem dos bytes subsequentes.
- **Unit ID (1 byte)**: Endereço escravo/dispositivo (1 a 247).
- **Function Code (1 byte)**: FC01 a FC16.
- **Dados / Endereço (N bytes)**: Endereço inicial e quantidade ou valores de registradores.

#### Integridade Modbus RTU:
- Implementa o algoritmo **CRC16 (Cyclic Redundancy Check)** utilizando o polinômio padrão `0xA001`, verificando a integridade de quadros seriais contra ruídos eletromagnéticos.

---

### 3. PROTOCOLO OPC UA (IEC 62541)

O motor OPC UA do ElétricAi suporta:
- **Resolução de NodeId**: Suporte a identificadores numéricos (`ns=1;i=1001`), textuais (`ns=2;s=PUMP_01.SpeedHz`), GUIDs e tipos opacos.
- **AddressSpace Virtual**: Tabela de nós hierárquica conectada diretamente ao modelo canônico de variáveis.
- **Status Codes Padronizados**: `Good` (0x00000000), `Bad_NotFound`, `Bad_TypeMismatch` e `Bad_SecurityChecksFailed`.

---

### 4. PROTOCOLO MQTT E SPARKPLUG B

Conforme a especificação oficial **Eclipse Sparkplug B v1.0**:
- **Namespace Canônico**: `spBv1.0/{group_id}/{message_type}/{edge_node_id}/[{device_id}]`
- **Tipos de Mensagens Gerenciadas**:
  - `NBIRTH` / `NDEATH`: Ciclo de vida e certidão de nascimento do nó de borda.
  - `DBIRTH` / `DDEATH`: Reconhecimento e desconexão de dispositivos escravos.
  - `NDATA` / `DDATA`: Telemetria em tempo real com carimbo de milissegundos.
  - `NCMD` / `DCMD`: Comandos de escrita (bloqueados para hardware real).
- **Controle de Sequência**: Contador de sequência circular de 8 bits (0 a 255) para detecção de pacotes perdidos ou fora de ordem.

---

### 5. BARREIRA DE ISOLAMENTO FÍSICO INVIOLÁVEL

Qualquer invocação de função com efeito colateral em rede física real (ex: FC05, FC06, FC15, FC16 Modbus ou NCMD/DCMD Sparkplug B) aciona imediatamente a verificação da salvaguarda:
```typescript
if (IS_PHYSICAL_CONTROL_ALLOWED) {
  throw new Error("VIOLAÇÃO DE SEGURANÇA: Escrita em equipamento físico é proibida.");
}
```
Como `IS_PHYSICAL_CONTROL_ALLOWED` é fixado como constante booleana `false`, o sistema garante conformidade estrita de segurança e impossibilidade técnica de controle físico indevido.
