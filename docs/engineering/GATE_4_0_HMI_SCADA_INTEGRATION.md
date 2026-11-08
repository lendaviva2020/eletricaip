# GATE 4.0 — INTEGRATED HMI, SCADA, ISA-18.2 ALARMS & RECIPE ENGINE
## VINCULAÇÃO DIRETA DE TAGS, FACEPLATES INDUSTRIAIS, CICLO DE VIDA DE ALARMES E GESTÃO DE RECEITAS

### 1. OBJETIVO E VISÃO GERAL

O subsistema HMI/SCADA do ElétricAi Industrial OS implementa paridade funcional com o CODESYS Visualization, Alarm Management e Recipe Management.

Ao invés de duplicar registros de tags entre a lógica de controle (PLC) e as telas gráficas (SCADA), o ElétricAi utiliza uma **Fonte Única da Verdade (Single Source of Truth)**: cada elemento gráfico vincula-se diretamente ao `id` da Tag Canônica ou da variável de POU, assegurando sincronismo instantâneo de estados.

---

### 2. PADRÃO ISA-18.2 PARA GESTÃO DE ALARMES

A máquina de estados implementada pelo `ISA18AlarmLifecycleEngine` segue rigorosamente a norma internacional **ANSI/ISA-18.2-2016** (Management of Alarm Systems for the Process Industries):

```
                     ┌──────────────────┐
                     │      NORMAL      │
                     └─────────┬────────┘
                               │ Disparo da Condição
                               ▼
                ┌───────────────────────────────┐
                │     UNACKNOWLEDGED_ACTIVE     │
                └───────┬───────────────┬───────┘
  Condição Cessa│                       │ Reconhecido pelo Operador
                ▼                       ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│    UNACKNOWLEDGED_CLEARED    │ │     ACKNOWLEDGED_ACTIVE      │
└───────────────┬──────────────┘ └──────────────┬───────────────┘
                │ Reconhecido                   │ Condição Cessa
                ▼                               ▼
        ┌───────────────┐               ┌───────────────┐
        │    NORMAL     │               │    NORMAL     │
        └───────────────┘               └───────────────┘
```

#### Recursos Avançados:
- **Shelving (Silenciamento Temporário)**: O operador pode colocar um alarme ruidoso (chattering) em modo *Shelved* por um período configurável (ex: 30 minutos). Após esse tempo, o alarme retorna automaticamente ao monitoramento ativo.
- **Rastreamento de Chattering**: Contabiliza a frequência de transições para auditoria de alarmes incomodativos.
- **Rastreabilidade**: Carimbo de tempo e identificação do usuário em cada reconhecimento.

---

### 3. FACEPLATES INDUSTRIAIS INTEGRADOS

Cada símbolo visual nos esquemáticos e sinóticos atua como um Faceplate de engenharia completo:
- **Motor / Bomba**: Exibe estado de operação (Parado, Rodando, Trip/Falha), medição de corrente e horímetro de operação.
- **Válvula On/Off / Modulante**: Supervisão de chaves fim de curso (aberto/fechado), detecção de atraso de curso (transit timeout) e indicação de percentual de abertura.
- **Tanque / Reservatório**: Nível percentual, gradiente de enchimento e limites visuais de nível muito alto (HH) e muito baixo (LL).

---

### 4. GESTÃO DE RECEITAS INDUSTRIAIS (RECIPE MANAGER)

O módulo `IndustrialRecipeManager`:
- Armazena perfis de parâmetros de processo (ex: Setpoints de dosagem de químicos, tempos de ciclo, limites de corrente) indexados por produto.
- Executa a transferência atômica dos valores da receita para as tags do projeto.
- Registra histórico de auditoria com autor, data/hora e valores prévios.
- Aplicação estritamente virtual mantendo o isolamento físico: `IS_PHYSICAL_CONTROL_ALLOWED = false`.
