# GATE 4.0 — MULTI-TYPE IEC TASK RUNTIME & WATCHDOG ARCHITECTURE
## ESCALONAMENTO DE TAREFAS, PREEMPÇÃO POR PRIORIDADE E TEMPORIZAÇÃO DETERMINÍSTICA

### 1. OBJETIVO E VISÃO GERAL

O subsistema de execução de tarefas do ElétricAi Industrial OS implementa o modelo de agendamento em tempo real da norma IEC 61131-3 e do CODESYS V3.5 Task Configuration.

O controlador virtual do ElétricAi suporta múltiplos tipos de tarefas concorrentes, cada uma com parâmetros específicos de disparo, prioridade e proteção por cão de guarda (watchdog).

---

### 2. TIPOS DE TAREFAS SUPORTADAS

| Tipo de Tarefa | Gatilho / Condição | Uso Típico na Indústria |
|---|---|---|
| `CYCLIC` | Disparo periódico por temporizador (intervalMs: 1 a 1000 ms) | Malhas de controle PID, varredura de I/O, atualização de displays |
| `FREEWHEELING` | Execução contínua em laço livre sem atraso estipulado | Tarefas de processamento matemático secundário, geração de relatórios |
| `EVENT` | Disparo na borda de subida de uma tag ou variável booleana | Partida de emergência, captura de falhas em alta velocidade |
| `STATUS_TRIGGERED`| Execução contínua enquanto uma condição booleana for verdadeira | Modos manuais de manutenção, rotinas de limpeza |
| `EXTERNAL_EVENT` | Disparo por interrupção de hardware ou evento externo | Sincronismo de rede temporal, gatilhos de sensores rápidos |

---

### 3. MECANISMO DE PRIORIDADE E ORDENAÇÃO (0 a 31)

No padrão IEC 61131-3:
- **Prioridade 0**: Prioridade máxima absoluta (geralmente reservada para tarefas de segurança ou controle de movimento rápido).
- **Prioridade 1 a 15**: Tarefas de controle de processo e varredura cíclica principal.
- **Prioridade 16 a 31**: Tarefas de comunicação, telemetria, diagnóstico e freewheeling.

Em cada passo do relógio virtual, o escalonador avalia quais tarefas estão aptas a rodar e ordena a fila de execução em ordem crescente de prioridade:
$$\text{Fila} = \text{sort}(\{T_i \mid \text{isReady}(T_i) \land \neg \text{watchdogTripped}(T_i)\}, \text{by priority ASC})$$

---

### 4. SUPERVISÃO POR WATCHDOG E SENSIBILIDADE

O tempo de execução de cada tarefa é cronometrado com precisão sub-milissegundo:
$$\Delta t_{\text{exec}} = t_{\text{fim}} - t_{\text{inicio}}$$

Se $\Delta t_{\text{exec}} > \text{watchdogMs}$:
1. O contador de faltas consecutivas `consecutiveWatchdogMisses` é incrementado.
2. Se `consecutiveWatchdogMisses >= watchdogSensitivity`:
   - A tarefa é travada (`watchdogTripped = true`).
   - Um evento de diagnóstico industrial com severidade `CRITICAL` é despachado para o registro de auditoria.
   - O controlador interrompe a chamada aos POUs dessa tarefa até um reset explícito de engenharia.

---

### 5. CÁLCULO DE JITTER E DETECÇÃO DE OVERRUN

- **Jitter ($\text{Jitter}$)**: Representa o desvio em relação ao intervalo programado:
  $$\text{Jitter} = |(t_{\text{atual}} - t_{\text{anterior}}) - T_{\text{intervalo}}|$$
- **Overrun**: Ocorre quando o tempo de execução é superior ao próprio intervalo cíclico programado ($\Delta t_{\text{exec}} > T_{\text{intervalo}}$), indicando sobrecarga computacional na CPU do controlador.
