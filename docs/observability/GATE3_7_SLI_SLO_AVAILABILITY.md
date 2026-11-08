# ELÉTRICAI INDUSTRIAL OS — GATE 3.7
## DOCUMENTO 7: METROLOGIA DE SLI / SLO E DISPONIBILIDADE

---

**Normas:** Google Site Reliability Engineering (SRE), IEEE 762  
**Objetivo:** Eliminar alegações vagas de disponibilidade através de fórmulas auditáveis e error budgets  

---

## 1. DEFINIÇÃO FORMAL DOS 7 INDICADORES CENTRAIS

| Serviço Alvo | Indicador de Nível de Serviço (SLI) | Meta (SLO) | Janela | Método de Cálculo |
| :--- | :--- | :---: | :---: | :--- |
| **CLOUD_SERVICE** | Taxa de sucesso de requisições HTTP e RPC | $\ge 99.90\%$ | 30 dias | $\frac{\text{Requisições com Status } < 500}{\text{Total de Requisições Válidas}} \times 100$ |
| **EDGE_GATEWAY** | Proporção de janelas de tempo com heartbeat ativo | $\ge 99.50\%$ | 30 dias | $\frac{\text{Minutos Online com Heartbeat Confirmado}}{\text{Total de Minutos Elegíveis}} \times 100$ |
| **INDUSTRIAL_SOURCE**| Taxa de ciclos de leitura Modbus/OPC bem-sucedidos | $\ge 99.00\%$ | 30 dias | $\frac{\text{Ciclos de Leitura sem Timeout}}{\text{Total de Ciclos Programados}} \times 100$ |
| **DATA_INGESTION** | Ingestão e deduplicação sem perda de telemetria | $\ge 99.95\%$ | 30 dias | $\frac{\text{Amostras Ingeridas com Sequência Preservada}}{\text{Total de Amostras Emitidas}} \times 100$ |
| **SCADA_INTERFACE** | Sessões de operação com streaming ativo sem queda | $\ge 99.50\%$ | 30 dias | $\frac{\text{Minutos de Sessão SCADA Ativa}}{\text{Minutos de Operação Solicitados}} \times 100$ |
| **HISTORIAN_STORAGE**| Gravação persistente de séries sem rejeição | $\ge 99.99\%$ | 30 dias | $\frac{\text{Amostras Gravadas com Sucesso no Historian}}{\text{Amostras Encaminhadas para Persistência}} \times 100$ |
| **DATA_FRESHNESS** | Frescor dos dados industriais ($\le 3.000\text{ ms}$) | $\ge 98.00\%$ | 30 dias | $\frac{\text{Amostras com } (\text{CloudAt} - \text{SourceAt}) \le 3\text{s}}{\text{Total de Amostras Recebidas}} \times 100$ |

---

## 2. GESTÃO DE ERROR BUDGET (ORÇAMENTO DE ERROS)

Para cada SLO, o orçamento total de indisponibilidade admissível é definido como:
$$\text{ErrorBudget}_{\text{Total}} = 100\% - \text{SLO}_{\text{Target}}$$

Exemplo para `CLOUD_SERVICE` com meta de $99.90\%$:
- $\text{ErrorBudget}_{\text{Total}} = 0.10\%$
- Se a disponibilidade atingida for $99.98\%$, o erro ocorrido é $100\% - 99.98\% = 0.02\%$.
- Consumo de Budget:
  $$\text{BudgetConsumed} = \left(\frac{0.02\%}{0.10\%}\right) \times 100 = 20.0\%$$
- Budget Restante: $80.0\%$.

---

## 3. POLÍTICA DE EXPURGO DE MANUTENÇÃO PROGRAMADA

Intervalos de indisponibilidade só podem ser expurgados do denominador do SLO caso cumpram **TODOS** os seguintes requisitos:
1. Registro prévio na tabela `observability_maintenance_windows` ou chamada `registerMaintenanceWindow`.
2. Identificação de responsável técnico com papel `TENANT_ADMIN` ou `PLATFORM_ADMIN`.
3. Número de ticket de manutenção (Ordem de Serviço / Work Order).
4. Janela temporal finita com `startTime` e `endTime` explícitos.
