# GATE 4.0 — COMPILER PIPELINE, INTERACTIVE DEBUGGER & TRACE ENGINE
## DEPURAÇÃO ON-LINE, PONTOS DE INTERRUPÇÃO, TABELA DE WATCH E OSCILOSCÓPIO VIRTUAL

### 1. OBJETIVO E VISÃO GERAL

O subsistema de compilação e depuração do ElétricAi Industrial OS reproduz a experiência de diagnóstico e comissionamento do CODESYS V3.5 Online Mode.

Ele permite ao engenheiro de automação inspecionar variáveis em tempo de execução, definir pontos de interrupção (breakpoints) sem travar o navegador, executar o código passo a passo, forçar variáveis para simulação de falhas e capturar transitórios rápidos com um osciloscópio multicanal (Trace).

---

### 2. ARQUITETURA DO COMPILADOR E PIPELINE DE IR

```
   Código-Fonte IEC
(ST, LD, FBD, SFC, IL)
         │
         ▼
┌──────────────────┐
│  Lexer & Parser  │  ──> Diagnósticos Sintáticos
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Semantic Checker │  ──> Validação de Tipos e Escopos
└────────┬─────────┘
         ▼
┌──────────────────┐
│   IR Generator   │  ──> Bytecode Quad (LOAD/STORE/ALU/JUMP)
└────────┬─────────┘
         ▼
┌──────────────────────────────────────────────────┐
│      Interactive Debugger & Trace Engine         │
│  Breakpoints │ Step Exec │ Watches │ Oscilloscope│
└──────────────────────────────────────────────────┘
```

---

### 3. PONTOS DE INTERRUPÇÃO (BREAKPOINTS) E MODOS STEP

O `InteractiveDebuggerService` fornece:
- **Breakpoints de Linha e Condicionais**: Disparados na instrução de IR associada à linha do código-fonte ou quando uma expressão booleana é atendida.
- **Passo a Passo (Step Execution)**:
  - **Step Instruction**: Executa exatamente uma instrução de IR quad.
  - **Step Over**: Executa até a próxima linha de código-fonte na mesma função/programa.
  - **Step Into**: Se a instrução for uma chamada a bloco de função (`CALL_FB`), empilha a posição de retorno e entra no bloco chamado.
  - **Step Out**: Executa até que o bloco atual retorne (`RETURN`), restaurando o frame chamador.
- **Hit Count**: Rastreamento de quantas vezes cada ponto de interrupção foi atingido no ciclo de depuração.

---

### 4. TABELA DE INSPEÇÃO (WATCH TABLE) E FORÇAMENTO SEGURO

- **Inspeção Contínua**: Permite monitorar variáveis globais, tags e variáveis locais com buffer circular de histórico (armazenando os últimos 100 valores com carimbo de milissegundos).
- **Forcing Isolado**: O operador pode forçar valores (`forceVariable`) para simular cenários operacionais (ex: chave de nível baixa ativada). O forçamento é estritamente virtual no simulador e é barrado por hardware real:
  $$\text{IS\_PHYSICAL\_CONTROL\_ALLOWED} = \text{false}$$

---

### 5. OSCILOSCÓPIO VIRTUAL MULTICANAL (TRACE OSCILLOSCOPE)

O `TraceOscilloscopeEngine` permite capturar o comportamento dinâmico de sinais de processo:
- **Modos de Disparo (Trigger)**:
  - `CONTINUOUS`: Gravação ininterrupta em buffer circular.
  - `RISING_EDGE`: Inicia a captura após a transição falsa $\rightarrow$ verdadeira de uma tag.
  - `FALLING_EDGE`: Inicia a captura após a transição verdadeira $\rightarrow$ falsa.
  - `THRESHOLD`: Inicia a captura quando uma variável analógica ultrapassa um limiar estipulado.
- **Pré-Disparo (Pre-Trigger)**: Preserva os 20% anteriores ao evento de disparo para possibilitar a análise de causa raiz de falhas e transitórios.
- **Exportação CSV**: Formatação direta para importação em ferramentas estatísticas.
