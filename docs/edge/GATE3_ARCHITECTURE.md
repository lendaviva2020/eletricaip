# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATE 3 ARCHITECTURE & SYSTEM SPECIFICATION

**Versão:** 3.0.0-industrial  
**Data:** 02 de Novembro de 2026  
**Padrões de Referência:** IEC 62443, NIST SP 800-82 Rev. 3, OPC UA Parts 2/4/5/8, Modbus TCP, Eclipse Sparkplug B

---

## 1. VISÃO GERAL DO PRODUTO

O **ElétricAi Edge Gateway** é uma camada de software autônoma e desacoplada, projetada para execução no ambiente on-premise (chão de fábrica, subestações, centros de controle de motores - CCM e painéis de automação). Ele conecta a nuvem do ElétricAi aos ativos industriais físicos (CLPs, remotas de I/O, medidores de energia e inversores).

### Princípio Fundamental de Arquitetura
> **SEGURANÇA READ-ONLY DE BORDA:**  
> No Gate 3, todos os drivers industriais operam estritamente em modo de leitura e subscrição (`supportsWrite: false`). Nenhuma capacidade de escrita, acionamento físico ou comando de produção está habilitada. `isPhysicalControlAllowed: false` permanece inviolável.

---

## 2. SEPARAÇÃO DE RESPONSABILIDADES: CLOUD vs. EDGE

```
┌─────────────────────────────────────────────────────────────┐
│                    ELÉTRICAI CLOUD                          │
│  - Gestão de Organizações, Plantas e Usuários (Multi-tenant)│
│  - Tag Registry Global & Canonical Equipment                │
│  - Historian Consolidado (TimescaleDB / Supabase)           │
│  - Alarm Engine & Notificações Corporativas                 │
│  - Sinóticos Supervisórios Web & Dashboards ISA-101         │
│  - Auditoria Imutável (SHA-256 Hash Chain)                  │
└──────────────────────────────▲──────────────────────────────┘
                               │
            Conexão Segura de Saída (mTLS / WSS)
            (Portas de CLPs NUNCA expostas à Internet)
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                 ELÉTRICAI EDGE GATEWAY                      │
│  - Daemon Autônomo Linux (x86_64 / ARM64)                   │
│  - Identidade de Estação & Provisionamento por Token        │
│  - Adaptadores Industriais Homologados (OPC UA, Modbus, MQTT│
│  - Buffer Transacional Offline (Store-and-Forward SQLite)   │
│  - Normalização de Engenharia & Qualidade (GOOD/BAD/STALE)  │
│  - Monitoramento de Saúde & Telemetria Local                │
└──────────────────────────────▲──────────────────────────────┘
                               │
          Rede Operacional Industrial Segmentada (OT)
                               │
 ┌─────────────────────────────┼─────────────────────────────┐
 │                             │                             │
 ▼                             ▼                             ▼
Servidores OPC UA         Redes Modbus TCP           Brokers Sparkplug B
(CLPs Siemens/Rockwell)   (Multimedidores QGBT)      (Sensores Inteligentes)
```

### ElétricAi Cloud
- Responsável pela governança corporativa, RLS, gestão de projetos, configurações de alarme e relatórios operacionais.
- Nunca inicia conexões de entrada arbitrárias para o chão-de-fábrica.

### ElétricAi Edge Gateway
- Daemon de alta performance executando como serviço de sistema operacional (`systemd` ou container Docker).
- Opera independentemente da disponibilidade de conexão de Internet da fábrica.
- Mantém a aquisição de dados ininterrupta mesmo durante quedas de WAN.

---

## 3. TECNOLOGIA E RUNTIME DA BORDA

- **Runtime Base:** Node.js / Bun Runtime desacoplado do bundle React.
- **Linguagem:** TypeScript com tipagem estrita e verificação de limites em tempo de compilação.
- **Sistemas Operacionais Homologados:**
  - Linux x86_64 (Debian 12+, Ubuntu Server 22.04 LTS+, Alpine Linux 3.19+).
  - Linux ARM64 (Raspberry Pi Compute Module 4, Advantech UNO, Siemens IOT2050).
- **Armazenamento de Borda:** SQLite com modo WAL (Write-Ahead Logging) para resiliência a cortes abruptos de energia elétrica da fábrica.

---

## 4. FLUXO DE DADOS DE AQUISIÇÃO INDUSTRIAL

```
[Dispositivo Industrial / CLP]
       │ (Leitura / Monitored Item)
       ▼
[Driver de Protocolo (OPC UA / Modbus / MQTT)]
       │ (Normalização de Tipos & Qualidade)
       ▼
[Industrial Tag Runtime Local]
       │ (Deadband & Validação)
       ▼
[Persistent Edge Outbox (Buffer SQLite)]
       │ (Store-and-Forward / Replay Idempotente)
       ▼
[Sincronização Segura Cloud]
       │ (Ingestão em Lote)
       ▼
[Historian & Alarm Engine Cloud]
```

---

## 5. REGRAS DE REPLAY E OPERAÇÃO OFFLINE

1. **Idempotência Garantida:** Cada amostra possui um `id` único e um `sequenceNumber` sequencial gerado pelo Gateway.
2. **Preservação Temporal:** O `sourceTimestamp` original gerado pelo CLP é preservado sem alteração, mesmo que o pacote seja descarregado horas após a interrupção da rede.
3. **Marcação de Amostra Atrasada:** Amostras reenviadas após quedas de conexão são marcadas com a flag `isDelayedReplay: true`.
4. **Isolamento de Comandos:** Comandos físicos JAMAIS entram em filas de buffer offline. Telemetria é acumulada e reenviada; comandos operacionais nunca sofrem replay tardio.
