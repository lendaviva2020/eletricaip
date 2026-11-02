# SCADA SUPERVISÓRIO — Arquitetura de Sistema Industrial

**Módulo:** SCADA SUPERVISÓRIO  
**Plataforma:** ElétricAi Industrial OS v4.2  
**Normas de Referência:** ISA-101 (HMI Systems), ISA-18.2 (Alarm Management), IEC 62443 (Security for Industrial Automation and Control Systems), IEC 61131-3 (Programmable Controllers).

---

## 1. Visão Geral da Arquitetura

O módulo **SCADA SUPERVISÓRIO** foi projetado e integrado diretamente ao núcleo do ElétricAi como um ambiente de engenharia e supervisão de primeira classe, eliminando silos operacionais e mantendo total coerência com o modelo canônico de engenharia (Schema v3).

```
                                  +---------------------------------------+
                                  |         ELÉTRICAI INDUSTRIAL OS       |
                                  |       Navegação & Single Source       |
                                  +-------------------+-------------------+
                                                      |
                    +---------------------------------+---------------------------------+
                    |                                 |                                 |
          +---------v---------+             +---------v---------+             +---------v---------+
          |    /workspace     |             |      /scada       |             |   /digital-twin   |
          | Unifilar/Multif.  |             | SCADA Supervisório|             |    Gêmeo Digital  |
          +---------+---------+             +---------+---------+             +---------+---------+
                    |                                 |                                 |
                    +---------------------------------+---------------------------------+
                                                      |
                                      +---------------v---------------+
                                      |   CANONICAL DATA ENGINE       |
                                      | - CanonicalEquipment          |
                                      | - CanonicalTag / TagRegistry  |
                                      | - Ephemeral RuntimeStore      |
                                      | - ISA-18.2 Live AlarmStore    |
                                      +---------------+---------------+
                                                      |
                         +----------------------------+----------------------------+
                         |                            |                            |
               +---------v---------+        +---------v---------+        +---------v---------+
               |  OPC UA Server    |        |  Modbus TCP Gate  |        |    MQTT Broker    |
               |  (Port 4840)      |        |  (Port 502)       |        |  (Sparkplug B)    |
               +-------------------+        +-------------------+        +-------------------+
```

---

## 2. Estrutura Modular das 11 Visões

O ambiente SCADA unifica 11 páginas especializadas integradas sob o mesmo shell:

| ID | Nome da Visão | Responsabilidade Técnica |
|---|---|---|
| 1 | **Visão Geral** | Sinótico principal da ETE (P&ID vetorial), KPIs executivos, tabela de alarmes ISA-18.2 em tempo real, gráfico de tendência multi-pen e dock de TAGs. |
| 2 | **Sinóticos Industriais** | Visualização setorial por macro-processos (ETE Geral, Bombagem & Recalque, Filtros, Reservatórios e Distribuição Elétrica). |
| 3 | **Alarmes** | Console de gerenciamento ISA-18.2: prioridades Crítica, Alta, Média, Baixa; reconhecimento auditado, silenciamento e exportação. |
| 4 | **Tendências** | Historiador multi-pen com amostragem periódica, seletor de intervalo de tempo (1m a 24h), estatísticas matemáticas e exportação CSV. |
| 5 | **Equipamentos** | Inventário unificado de equipamentos elétricos e mecânicos (TR-01, QM-01, PLC-01, P-01, P-02, T-101..T-105, F-01, Válvulas) com dados de placa e telemetria. |
| 6 | **TAGs Industriais** | Registro canônico de variáveis de processo com tipos IEC 61131-3, unidades de engenharia, flags de qualidade (GOOD, BAD, UNCERTAIN, FORCED) e comandos de forçamento auditados. |
| 7 | **Comunicação** | Monitoramento de gateways industriais: estado de conexões OPC UA, Modbus TCP e MQTT, latência de loopback e log de telegramas de rede. |
| 8 | **Eventos e Logs** | Trilha de auditoria operacional em conformidade com 21 CFR Part 11 / IEC 62443, registrando acionamentos de operador, E-STOP e transições de alarme. |
| 9 | **Relatórios** | Gerador de boletins técnicos: Boletim Diário de Operação (BDO), balanço hídrico, eficiência energética e análise Pareto de alarmes, com suporte para impressão e CSV. |
| 10 | **Editor HMI** | Integração total com o editor visual Konva 2D e sandbox Monaco Editor para scripts de automação customizados. |
| 11 | **Configurações** | Ajuste de parâmetros de varredura (50ms a 1000ms), sinalização sonora, controle de acesso baseado em papéis (RBAC) e sintonia física da simulação. |

---

## 3. Intertravamento Autoritativo de Segurança (E-STOP)

A segurança operacional é prioridade P0:
- O acionamento do botão **Parada de Emergência (E-STOP)** propaga interrupção mandatória imediata no `useScadaStore`.
- Todas as bombas, motores e atuadores são desligados instantaneamente (`TRIPPED`).
- A vazão de processo é cortada para `0.0 m³/h`.
- Um alarme com severidade `CRITICAL` da categoria `SAFETY` (`ETE.SAFETY.ESTOP`) é registrado imediatamente.
- Uma entrada na trilha de auditoria é gravada com carimbo de data/hora de alta precisão.
- O rearme é manual e intencional (`rearmEstop`), colocando o sistema em estado `STANDBY` seguro, sem religamento automático descontrolado.
