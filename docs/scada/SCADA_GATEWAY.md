# SCADA SUPERVISÓRIO — Gateways e Comunicação Industrial

**Documento:** Protocolos e Conectividade Industrial  
**Padrões:** OPC UA (IEC 62541), Modbus TCP (IEC 61158), MQTT Sparkplug B

---

## 1. Protocolos Suportados

O módulo de comunicação conecta o ElétricAi a dispositivos de chão de fábrica e sistemas em nuvem através de três drivers principais:

### 1.1. OPC UA (Open Platform Communications Unified Architecture)
- **Modo**: Servidor e Cliente nativo
- **Endpoint**: `opc.tcp://127.0.0.1:4840`
- **Namespace**: `urn:eletricai:scada:supervisory`
- **Políticas de Segurança**: `Basic256Sha256`, `SignAndEncrypt`
- **Mapeamento de Nós**: Toda `CanonicalTag` do projeto é exposta automaticamente no espaço de endereçamento (Address Space) como uma variável com tipo, valor, timestamp e qualidade.

### 1.2. Modbus TCP
- **Modo**: Servidor TCP escutando na porta 502
- **Unit ID**: 1 (Padrão)
- **Mapeamento de Tabelas**:
  - `0xxxx (Coils)`: Comandos digitais de partida/parada e abertura de válvulas.
  - `1xxxx (Discrete Inputs)`: Estados de sensores de fim de curso e contatos auxiliares de disjuntores.
  - `3xxxx (Input Registers)`: Leituras analógicas de transmissores (nível, vazão, pressão).
  - `4xxxx (Holding Registers)`: Setpoints de processo, parâmetros de controle e dados elétricos em ponto flutuante IEEE 754 (2 registradores por valor REAL).
- **Proteção Anti-SSRF**: Validação estrita de endereços IP para prevenir conexões a redes não autorizadas.

### 1.3. MQTT Industrial (Sparkplug B)
- **Broker**: `mqtt://broker.eletricai.internal:1883`
- **Tópicos**: `ete/telemetry/#` e `ete/commands/#`
- **QoS**: Nível 1 (At least once) para telemetria de processo; Nível 2 para alarmes críticos.

---

## 2. Diagnóstico de Rede e Loopback

A tela de comunicação disponibiliza um teste de loopback em tempo real que afere a latência de tráfego, contagem de telegramas transmitidos/recebidos e taxa de erros de CRC.
