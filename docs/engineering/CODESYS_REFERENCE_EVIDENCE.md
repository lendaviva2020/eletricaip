# ELÉTRICAI INDUSTRIAL OS — CODESYS REFERENCE EVIDENCE
## Evidências de Referência Funcional e Especificação Técnica (Clean Room Analysis)

### 1. Contexto e Metodologia de Sala Limpa (Clean Room Mode)
Este documento consolida as evidências funcionais obtidas através da análise técnica de especificações abertas da automação industrial, em particular as normas **IEC 61131-3 (3ª Edição)**, **PLCopen Motion Control (Part 1 & 2)**, **ISA-101** e **ISO 13849-1 / IEC 62061**, tomando como referência funcional de usabilidade e arquitetura o ambiente **CODESYS Development System V3.5** (CODESYS GmbH).

Nenhum arquivo binário, biblioteca proprietária, rotina descompilada ou código-fonte do CODESYS foi extraído, copiado ou executado de maneira reversa. Todas as implementações do ElétricAi Industrial OS foram desenvolvidas de raiz ("from scratch") em TypeScript puro, em estrita observância à propriedade intelectual e com padrões industriais independentes.

---

### 2. Evidências de Arquitetura de Referência CODESYS

#### 2.1 Modelo Canônico de Projeto e Árvore de Dispositivos (Device Tree)
- **Comportamento no CODESYS:**
  O CODESYS organiza uma aplicação em uma árvore hierárquica `Root -> Device (PLC) -> PLC Logic -> Application -> Task Configuration + POUs + GVLs`.
- **Implementação ElétricAi:**
  O módulo `src/lib/studio/canonical/types.ts` unifica o projeto em `IndustrialProject`, vinculando rigidamente controladores (`Controller`), dispositivos (`Device`), tarefas cíclicas (`TaskConfiguration`), unidades de organização de programa (`POU`) e listas de variáveis globais (`GlobalVariableList`) sob UUIDs v4 imutáveis.

#### 2.2 Linguagens IEC 61131-3: Structured Text (ST) e SFC
- **Comportamento no CODESYS:**
  - **Structured Text:** Permite declarações tipadas (`VAR ... END_VAR`), blocos condicionais (`IF ... THEN ... ELSIF ... ELSE`), estruturas de seleção (`CASE ... OF`), laços (`FOR`, `WHILE`, `REPEAT`) e chamadas de blocos de função.
  - **Sequential Function Chart (SFC):** Modela graficamente o sequenciamento de máquinas de estado industriais. Passos (`Steps`) mantêm contadores temporais individuais (`Step.t`). Transições avaliam expressões booleanas e qualificadores de ação (`N`, `S`, `R`, `L`) controlam a persistência de comandos.
- **Implementação ElétricAi:**
  - O analisador sintático `StParser` e o analisador de tipos `StSemanticAnalyzer` geram AST formal, reportando linha e coluna de diagnósticos em tempo real sem avaliação arbitrária (`eval()`).
  - O motor `SFCEngine` executa o ciclo de evolução de passos IEC, com cálculo determinístico de permanência no passo (`timeInStepMs`), ativação atômica de sucessores e detecção de deadlocks em grafos órfãos.

#### 2.3 Compilação, Representação Intermediária (IR) e Imagem de Processo
- **Comportamento no CODESYS:**
  O código fonte das POUs é compilado em uma representação intermediária ou código nativo executado por um runtime de CLP. A comunicação de E/S é desacoplada através das áreas de memória de processo `%I` (Inputs) e `%Q` (Outputs).
- **Implementação ElétricAi:**
  - `IECCompilerPipeline` compila POUs escritas em ST, SFC ou Ladder para uma tabela de instruções de bytecode (`LOAD_VAR`, `STORE_VAR`, `JUMP_IF_FALSE`, `CALL_FB`, etc.).
  - `IECTaskScheduler` orquestra a leitura determinística do `%I` no início do ciclo de scan, executa os blocos IR na ordem de prioridade das tarefas, e grava as saídas em `%Q` no término da varredura.

#### 2.4 Forçamento de Variáveis (Forcing) e Isolamento Físico
- **Comportamento no CODESYS:**
  Em modo online/simulação, o engenheiro pode aplicar "Force Values" sobre variáveis e canais de E/S.
- **Implementação ElétricAi:**
  - O simulador suporta `forceVariable` e `unforceVariable` exclusivamente na memória virtual do processo browser.
  - **Garantia de Trava Física:** O código enforce incondicionalmente `IS_PHYSICAL_CONTROL_ALLOWED = false`. Nenhuma tentativa de forçamento emite pacotes para portas seriais, soquetes raw de rede ou barramentos físicos externos.

#### 2.5 Cinética e Motion Control (PLCopen)
- **Comportamento no CODESYS SoftMotion:**
  Gerencia eixos virtuais ou reais através de blocos de função da especificação PLCopen: `MC_Power`, `MC_MoveAbsolute`, `MC_MoveVelocity`, `MC_Stop` e `MC_Reset`, obedecendo a uma máquina de estados estrita (`DISABLED`, `STANDSTILL`, `DISCRETE_MOTION`, `CONTINUOUS_MOTION`, `ERROR_STOP`).
- **Implementação ElétricAi:**
  - O módulo `MotionSimulator` modela eixos lineares e rotativos com integração trapezoidal determinística por ciclo de varredura, respeitando aceleração máxima, desaceleração e limites físicos virtuais.

#### 2.6 Engenharia de Segurança (Safety Advisory)
- **Comportamento no CODESYS Safety:**
  Suporta CLPs de segurança certificados SIL3 com arquiteturas 1oo2D ou 2oo2D e monitoramento de discrepância temporal em chaves de emergência de duplo contato.
- **Implementação ElétricAi:**
  - `SafetyEngineeringAdvisory` analisa a topologia de loops de parada de emergência e intertravamento de portas (NR-12 / ISO 13849-1), calculando se a discrepância temporal entre contatos redundantes excede o limite tolerado (ex.: 500ms).
  - Inclui aviso legal obrigatório em todas as telas (`NON-SIL ADVISORY ONLY`), impedindo qualquer presunção de certificação física por terceiros.
