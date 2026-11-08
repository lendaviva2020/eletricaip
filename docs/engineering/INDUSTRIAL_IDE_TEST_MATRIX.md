# ELÉTRICAI INDUSTRIAL OS — INDUSTRIAL IDE TEST MATRIX
## Matriz de Testes Automatizados e Validação de Conformidade IEC 61131-3

### 1. Resumo da Execução de Testes
- **Test Runner:** Vitest v4.1.12 / Bun Runtime
- **Total de Suítes de Teste:** 5
- **Total de Casos de Teste:** 24
- **Taxa de Sucesso:** 100% (24 aprovados, 0 falhas)
- **Verificação de Tipos TypeScript:** 100% Soundness (`bun x tsc --noEmit` exit code 0)

---

### 2. Detalhamento por Suíte de Testes

#### 2.1 Suíte 1: IEC 61131-3 Structured Text Lexer, Parser & Compiler
**Arquivo:** `src/lib/studio/__tests__/st-parser-compiler.test.ts` (6 testes)

| ID | Caso de Teste | Descrição / Entrada | Critério de Aceitação | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **ST-01** | Tokenização Léxica Completa | Código ST com comentários multilinhas `(* *)` e inline `//`, literais e palavras-chave | Identificadores, tipos e palavras-chave IEC extraídos sem ruídos | **APROVADO** |
| **ST-02** | Análise Sintática de Declarações e Condicionais | POU com blocos `VAR`, `IF-THEN`, `ELSIF`, `ELSE` | Construção correta de `POUDeclaration` e nós `IF_STMT` | **APROVADO** |
| **ST-03** | Análise Sintática de Laços de Repetição | Código ST contendo `FOR-TO-BY`, `WHILE` e `REPEAT-UNTIL` | Reconhecimento estruturado de `FOR_STMT`, `WHILE_STMT` e `REPEAT_STMT` | **APROVADO** |
| **ST-04** | Detecção Semântica de Variáveis Não Declaradas | Expressão contendo identificador ausente na tabela de símbolos | Emissão de diagnóstico com severidade `ERROR`, indicando linha e coluna exatas | **APROVADO** |
| **ST-05** | Proteção contra Escrita em `CONSTANT` | Atribuição de novo valor a uma constante declarada em `VAR CONSTANT` | Emissão de diagnóstico de erro semântico bloqueando a mutação | **APROVADO** |
| **ST-06** | Compilação em Representação Intermediária (IR) | Projeto canônico contendo POUs com lógica de controle de nível | Geração de blocos IR com instruções de bytecode (`LOAD_VAR`, `STORE_VAR`, etc.) | **APROVADO** |

---

#### 2.2 Suíte 2: Runtime Determinístico e Blocos Padronizados IEC
**Arquivo:** `src/lib/studio/__tests__/deterministic-simulator.test.ts` (7 testes)

| ID | Caso de Teste | Descrição / Entrada | Critério de Aceitação | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **RT-01** | Temporizador TON (On-Delay) | Entrada `IN = true`, tempo pré-definido `PT = 100ms`, passos de 50ms | `Q` permanece `false` com `ET = 50ms`; `Q` comuta para `true` em `ET = 100ms` | **APROVADO** |
| **RT-02** | Temporizador TOF (Off-Delay) | `IN` desce de `true` para `false` com `PT = 100ms` | `Q` se mantém ativa durante os 100ms e desliga após o término | **APROVADO** |
| **RT-03** | Contador CTU (Count Up) | Pulsos de subida em `CU` até atingir o valor pré-ajustado `PV = 3` | `CV` incrementa de 1 em 1; `Q` é acionada ao atingir `PV`; `RESET` zera o contador | **APROVADO** |
| **RT-04** | Algoritmo PID Industrial | `SETPOINT = 50.0`, `ACTUAL = 40.0`, `KP = 2.0`, `TN = 10s`, `deltaSec = 0.1s` | Cálculo da saída manipulada `Y` com saturação e anti-windup (0% a 100%) | **APROVADO** |
| **RT-05** | Barreira de Isolamento Físico | Verificação da constante global `IS_PHYSICAL_CONTROL_ALLOWED` | Estritamente igual a `false` em tempo de compilação e execução | **APROVADO** |
| **RT-06** | Execução de Varredura Determinística | 5 ciclos de scan (20ms cada) no escalonador de tarefas | Contador de ciclos avança para 5 e tempo simulado totaliza 100ms | **APROVADO** |
| **RT-07** | Forçamento em Memória (Forcing Seguro) | Aplicação de `forceVariable("rTankLevel", 999.0)` | Valor permanece forçado nos ciclos de varredura sem atingir hardware externo | **APROVADO** |

---

#### 2.3 Suíte 3: Sequential Function Chart (SFC) Engine
**Arquivo:** `src/lib/studio/__tests__/sfc-execution.test.ts` (4 testes)

| ID | Caso de Teste | Descrição / Entrada | Critério de Aceitação | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **SFC-01** | Inicialização de Passos Iniciais | Grafo SFC contendo passo marcado como `isInitial: true` | Passo inicial ativo imediatamente com cronômetro de passo zerado | **APROVADO** |
| **SFC-02** | Evolução de Passos e Disparo de Transição | Passo de enchimento evoluindo para mistura após condição `rLevel >= 80.0` | Desativação atômica do passo anterior e ativação do passo sucessor | **APROVADO** |
| **SFC-03** | Qualificadores de Ação (N, S, R) | Ação memorizada `S` no passo 1 e ação de reset `R` no passo 2 | Ação permanece ativa mesmo após desativar o passo 1 até a execução de `R` | **APROVADO** |
| **SFC-04** | Detecção de Deadlock Estrutural | Passo ativo sem transições de saída definidas | `isDeadlocked: true` com diagnóstico explícito de travamento de sequência | **APROVADO** |

---

#### 2.4 Suíte 4: Sincronização Canônica e Integridade Referencial
**Arquivo:** `src/lib/studio/__tests__/canonical-sync.test.ts` (3 testes)

| ID | Caso de Teste | Descrição / Entrada | Critério de Aceitação | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **CAN-01** | Criação e Validação do Modelo Canônico | Projeto contendo todas as 32 entidades canônicas | Integridade referencial válida, 0 referências órfãs de tags e POUs | **APROVADO** |
| **CAN-02** | Renomeação Atômica Transacional | Renomeação de tag propagada entre POU ST, Ladder e widgets de IHM | Vínculo de UUIDs preservado integralmente sem quebra de referências | **APROVADO** |
| **CAN-03** | Reconstrução de Grafo de Dependências | Geração das arestas de dependência entre POUs, IHM, Alarmes e Tags | Grafo acíclico reconstituído com arestas categorizadas (`READS`, `WRITES`, `BINDS`) | **APROVADO** |

---

#### 2.5 Suíte 5: Consultoria de Segurança NR-12 e Cinemática PLCopen
**Arquivo:** `src/lib/studio/__tests__/safety-advisory-physical-lock.test.ts` (4 testes)

| ID | Caso de Teste | Descrição / Entrada | Critério de Aceitação | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **SAF-01** | Bloqueio Físico Global | Avaliação de `IS_PHYSICAL_CONTROL_ALLOWED` | Retorna incondicionalmente `false` | **APROVADO** |
| **SAF-02** | Discrepância de Contato de Parada de Emergência | Contato 1 aberto e Contato 2 fechado com duração de 150ms (limite 100ms) | Detecção de falha de discrepância com rebaixamento de cobertura diagnóstica | **APROVADO** |
| **SAF-03** | Aviso Legal Mandatório | Leitura do texto legal de advertência de segurança | Presença obrigatória dos alertas de não-substituição de relés certificados | **APROVADO** |
| **SAF-04** | Máquina de Estados Motion PLCopen | Sequência: `mcPower` -> `mcMoveAbsolute` -> interpolação -> `STANDSTILL` | Transições corretas na máquina de estados de eixos virtuais | **APROVADO** |
