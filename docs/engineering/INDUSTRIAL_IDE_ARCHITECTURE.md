# ELÉTRICAI INDUSTRIAL OS — INDUSTRIAL IDE ARCHITECTURE
## Arquitetura de Software do Estúdio Integrado de Engenharia de Automação

### 1. Visão Geral da Arquitetura
O **ElétricAi Industrial Engineering Studio** é concebido como uma plataforma de engenharia unificada e de missão crítica para automação industrial, projetada sob a arquitetura de **Fonte Única de Verdade Canônica (Canonical Single Source of Truth)**.

O sistema elimina silos entre diagramas elétricos unifilares, lógica programável IEC 61131-3 (ST, Ladder, FBD, SFC), configuração de hardware, supervisório SCADA e análise de segurança de máquinas, garantindo que qualquer modificação ou renomeação de entidade seja propagada transacionalmente através de identificadores UUID v4 imutáveis.

```
+-----------------------------------------------------------------------------------+
|                        ELÉTRICAI INDUSTRIAL OS — STUDIO IDE                       |
+-----------------------------------------------------------------------------------+
|  [Master Ribbon] Build All | Start/Pause Sim | Sample Station | Physical Lock: OFF|
+-----------------------------------------------------------------------------------+
|  [Left: Project Explorer] |  [Center: Tabbed Document Workspaces]                 |
|  - Controllers & Racks    |  - Structured Text Editor (Monaco + Semantic AST)     |
|  - POUs (ST/LD/FBD/SFC)   |  - SFC Interactive Engine (SVG State Machine)        |
|  - GVL & Canonical Tags   |  - Device Tree & Hardware Rack (I/O Channel Mapping)  |
|  - HMI Pages & Alarms     |  - Integrated HMI Sinoptic View (Live Actuators)     |
|  - Motion Axes (PLCopen)  |  - Safety Engineering Advisor (NR-12 Dual-Channel)    |
|  - Safety Loops (NR-12)   |  - PLCopen Multi-Axis Motion Controller               |
+---------------------------+-------------------------------------------------------+
|  [Bottom Dock: Multi-Tab Engine Dashboard]                                        |
|  - Simulation & Forcing Watch Table  - IEC Compiler Diagnostics  - Canonical Graph|
+-----------------------------------------------------------------------------------+
```

---

### 2. Camadas Arquiteturais do Sistema

#### 2.1 Camada Canônica de Dados Industriais (`src/lib/studio/canonical/`)
- **`types.ts`:** Define rigidamente as 32 entidades canônicas do sistema através de esquemas Zod e tipagem TypeScript:
  - `IndustrialProject`, `ProjectVersion`, `Controller`, `Device`, `HardwareModule`, `IOChannel`, `POU`, `ProgramNetwork`, `LadderRung`, `FBDNode`, `FBDConnection`, `SFCStep`, `SFCTransition`, `SFCAction`, `GlobalVariableList`, `PLCVariable`, `Tag`, `HMIPage`, `HMIWidget`, `AlarmDefinition`, `TrendDefinition`, `RecipeDefinition`, `ProtocolConfiguration`, `MotionAxis`, `MotionGroup`, `LibraryReference`, `DependencyGraph`, `DependencyReference`, `SimulationScenario`, `CompilationResult`, `CompilerDiagnostic`, `DiagnosticEvent`.
- **`project-service.ts`:**
  - `createSampleIndustrialProject`: Gera estação industrial canônica completa com reservatório, bomba centrífuga com controle de nível por histerese em ST, rungs de intertravamento em Ladder, sequenciador SFC e eixos PLCopen.
  - `renameEntity`: Mutação atômica que propaga a renomeação de Tags e POUs por todos os rungs, conexões FBD, passos SFC e widgets de IHM sem romper as ligações baseadas em UUID.
  - `validateReferentialIntegrity`: Auditoria de consistência referencial (tags órfãs, canais de E/S sem mapeamento, dependências cíclicas).
  - `rebuildDependencyGraph`: Reconstitui o grafo de relações `READS`, `WRITES` e `BINDS`.

#### 2.2 Camada de Compilação e Verificação Sintática IEC (`src/lib/studio/iec/parser/` e `compiler/`)
- **`st-lexer.ts`:** Tokenizador léxico que identifica palavras-chave IEC (`PROGRAM`, `VAR`, `IF`, `CASE`, `FOR`, `WHILE`), identificadores, literais de tempo (`T#10s`), literais analógicos e comentários multilinhas (`(* ... *)`) ou em linha (`//`).
- **`st-parser.ts`:** Analisador sintático recursivo descendente que constrói a Árvore de Sintaxe Abstrata (AST) tipada para POUs, blocos de declaração de variáveis e declarações estruturadas.
- **`st-semantic.ts`:** Analisador semântico com tabela de símbolos, resolução de escopo e verificação de tipos (`BOOL`, `INT`, `DINT`, `REAL`, `TIME`, `STRING`), impedindo atribuições a variáveis `CONSTANT` e acusando identificadores não declarados com linha e coluna exatas.
- **`compiler-pipeline.ts`:** Compilador que converte a AST de ST e redes de blocos em Representação Intermediária (IR) executável composta por quadruplas/instruções de bytecode (`LOAD_VAR`, `STORE_VAR`, `JUMP_IF_FALSE`, `CALL_FB`, etc.).

#### 2.3 Camada de Simulação Determinística (`src/lib/studio/iec/runtime/` e `sfc/`)
- **`standard-blocks.ts`:** Biblioteca padronizada de blocos IEC 61131-3:
  - `TonBlock`: Temporizador com atraso na ligação (`IN`, `PT`, `Q`, `ET`).
  - `TofBlock`: Temporizador com atraso no desligamento.
  - `CtuBlock`: Contador incremental por borda de subida (`CU`, `RESET`, `PV`, `Q`, `CV`).
  - `PidBlock`: Controlador PID com ação proporcional, integrativa com anti-windup clamping e derivativa.
- **`task-scheduler.ts`:** Motor cíclico determinístico que simula a varredura do CLP:
  - Leitura da Imagem de Processo de Entrada (`%I`).
  - Execução das tarefas agendadas na ordem de prioridade.
  - Aplicação de forçamento em memória (`forcedVariables`).
  - Gravação da Imagem de Processo de Saída (`%Q`).
- **`sfc-engine.ts`:** Motor de grafos sequenciais SFC:
  - Mantém o conjunto de passos ativos (`activeStepIds`) e seus respectivos contadores de tempo de permanência (`stepTimers`).
  - Avaliação determinística de transições habilitadas.
  - Despacho de ações segundo qualificadores (`N`, `S`, `R`, `L`).
  - Detecção imediata de deadlocks em caso de passos órfãos ou ausência de transições habilitadas.

#### 2.4 Camada de Cinemática e Eixos PLCopen (`src/lib/studio/motion/`)
- **`motion-simulator.ts`:** Simulador cinemático multi-eixos aderente ao padrão PLCopen Motion Control Part 1 e Part 2.
  - Máquina de estados: `DISABLED` -> `STANDSTILL` -> `DISCRETE_MOTION` / `CONTINUOUS_MOTION` -> `STANDSTILL`.
  - Comandos fundamentais: `mcPower`, `mcMoveAbsolute`, `mcMoveVelocity`, `mcStop`, `mcReset`.
  - Integração de trajetória trapezoidal com perfis de aceleração e desaceleração configuráveis.

#### 2.5 Camada de Engenharia de Segurança e Bloqueio Físico (`src/lib/studio/safety/`)
- **`safety-advisory.ts`:**
  - Analisador de discrepância de contato duplo para botões de parada de emergência e sensores de proteção móvel (NR-12 / ISO 13849-1 Categoria 3 e 4).
  - Cálculo de Cobertura de Diagnóstico estimada (DC).
  - **Barreira Física Incondicional:** `export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;`. Todas as tentativas de acionamento de hardware externo são bloqueadas por exceção em tempo de execução.

---

### 3. Interface Visual do Usuário (UI / UX Industrial)
- **`ProjectExplorer` (`src/components/studio/project-explorer.tsx`):**
  Navegador em árvore com controladores, módulos de rack, POUs (com ícones por linguagem), variáveis de projeto, eixos motion e páginas de IHM.
- **`StEditor` (`src/components/studio/st-editor.tsx`):**
  Editor Monaco com sintaxe IEC 61131-3 ST, diagnóstico semântico em tempo real e botão de compilação individual de POU.
- **`SfcEditor` (`src/components/studio/sfc-editor.tsx`):**
  Editor e monitor visual de SFC com nós de passos, timers por passo, barras de transição e cartões de qualificadores de ação.
- **`DeviceTreeView` (`src/components/studio/device-tree-view.tsx`):**
  Visão modular do rack de CLP com slots, canais analógicos e digitais, endereçamento IEC e mapeamento para tags canônicas.
- **`HmiEditor` (`src/components/studio/hmi-editor.tsx`):**
  Sinótico reativo integrado que renderiza os elementos do processo (reservatório com nível, bomba centrífuga com rotação animada, chave de emergência e instrumentos).
- **`SafetyPanel` (`src/components/studio/safety-panel.tsx`):**
  Painel de segurança de máquinas com simulador de discrepância de contatos e advertência legal explícita.
- **`MotionPanel` (`src/components/studio/motion-panel.tsx`):**
  Painel de comando de eixos virtuais com controle PLCopen, régua de posição e gráfico trapezoidal.
- **`SimulationMonitor` (`src/components/studio/simulation-monitor.tsx`):**
  Console de execução determinística com seleção de tempo de varredura (10ms a 100ms), métricas de ciclo e tabela de observação de variáveis com forçamento seguro.
- **`EngineeringStudio` (`src/components/studio/engineering-studio.tsx`):**
  Shell principal integrado ao workspace do ElétricAi Industrial OS.
