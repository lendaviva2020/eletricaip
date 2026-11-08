# ELÉTRICAI INDUSTRIAL OS — GATE 3.7
## DOCUMENTO 4: CONECTIVIDADE INDUSTRIAL & DIAGNÓSTICO DE PROTOCOLOS

---

**Protocolos:** Modbus TCP, OPC UA, MQTT Sparkplug B  
**Invariante Primária:** `IS_PHYSICAL_CONTROL_ALLOWED = false` (Somente leitura e telemetria)  

---

## 1. DIAGNÓSTICO MODBUS TCP

### Métricas de Observabilidade:
- **Conectividade TCP:** Status do socket TCP (porta 502 padrão ou mapeada).
- **Tempo de Resposta (ms):** Latência de ida e volta da requisição FC3 / FC4.
- **Contador de Timeouts:** Incrementado a cada tentativa sem resposta no tempo limite estipulado.
- **Contador de Exceções:** Contagem de códigos de erro de protocolo (01 - Illegal Function, 02 - Illegal Data Address, etc.).
- **Taxa de Sucesso dos Ciclos de Varredura (%):**
  $$\text{SuccessRate} = \left( \frac{\text{SuccessfulCycles}}{\text{TotalPollingCycles}} \right) \times 100$$

### Regras de Segurança:
- Proibição absoluta das funções FC5 (Write Single Coil), FC6 (Write Single Register), FC15 (Write Multiple Coils) e FC16 (Write Multiple Registers).

---

## 2. DIAGNÓSTICO OPC UA

### Métricas de Observabilidade:
- **Estado da Sessão:** `ACTIVE`, `RECONNECTING`, `CLOSED` ou `FAILED`.
- **Estado do Secure Channel:** Criptografia TLS e renovação de chave de canal seguro.
- **Status dos Itens Monitorados:** Contagem de códigos `Good`, `Bad` e `Uncertain`.
- **Intervalo de Publicação:** Variação no tempo de recebimento de notificações de subscription.

### Regras de Segurança:
- Proibição de métodos `Call`, escrita em nós de controle ou alterações administrativas de permissão no servidor OPC UA.

---

## 3. DIAGNÓSTICO MQTT SPARKPLUG B

### Métricas de Observabilidade:
- **Estado de Conexão com Broker:** Socket MQTT e negociação TLS.
- **Keepalive & Latência de Entrega:** Medição do intervalo de pacotes PINGREQ / PINGRESP.
- **Mensagens Recebidas & Duplicadas:** Contagem de payloads `NBIRTH`, `NDATA`, `DBIRTH` e `DDATA`.
- **Presença de Sessão:** Flag `CleanSession` e entrega em QoS 0 ou QoS 1.

### Regras de Segurança:
- Proibição expressa de tópicos de comando físico: `NCMD` e `DCMD`. O agente escuta exclusivamente dados telemétricos e mensagens de estado.
