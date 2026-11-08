# GATE 4.0 — IEC 61131-3 UNIFIED LANGUAGE ENGINES & IR TRANSLATORS
## MODELAGEM FORMAL, COMPILAÇÃO E TRADUÇÃO BIDIRECIONAL (ST, LD, FBD, SFC, IL)

### 1. OBJETIVO E VISÃO GERAL

O ElétricAi Industrial OS implementa conformidade total com as cinco linguagens definidas na norma **IEC 61131-3**, fornecendo paridade funcional com os editores e geradores de código do CODESYS V3.5.

Todas as linguagens convergem para uma única **Representação Intermediária (IR)** em bytecode quad, permitindo execução homogênea no runtime determinístico, depuração passo-a-passo e tradução cruzada entre linguagens.

```
┌────────────────────────────────────────────────────────┐
│               Linguagens IEC 61131-3                   │
│   ST (Textual) │ LD (Gráfico) │ FBD │ SFC │ IL         │
└───────┬──────────────┬───────────┬─────┬─────┬─────────┘
        │              │           │     │     │
        ▼              ▼           ▼     ▼     ▼
┌────────────────────────────────────────────────────────┐
│                Unified IR Translators                  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│     Representação Intermediária (Bytecode Quad IR)     │
│       LOAD / STORE / ALU / JUMP / CALL_FB / RETURN     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│     Runtime Virtual Determinístico & Simulador         │
│         (IS_PHYSICAL_CONTROL_ALLOWED = false)          │
└────────────────────────────────────────────────────────┘
```

---

### 2. MATRIZ DE RECURSOS POR LINGUAGEM

| Linguagem | Tipo | Motor de Análise / Tradução | Elementos Chave |
|---|---|---|---|
| **ST** (Structured Text) | Textual Estruturado | `StLexer`, `StParser`, `StSemanticAnalyzer` | IF/ELSIF/ELSE, CASE, FOR, WHILE, REPEAT, Expressões aritméticas/lógicas |
| **LD** (Ladder Diagram) | Gráfico / Rungs | `LadderEngine` | Contatos NO/NC/R_TRIG/F_TRIG, Bobinas (Normal, Negada, Set, Reset), Ramos paralelos |
| **FBD** (Function Block Diagram) | Gráfico / Rede de Nós | `FBDEngine` | Ordenação topológica por in-degree, Pinos de entrada/saída, Propagação de conexões |
| **SFC** (Sequential Function Chart) | Gráfico de Estados | `SFCEngine` | Etapas (Steps), Transições booleanas, Ações com qualificadores (N, S, R, P, L, D) |
| **IL** (Instruction List) | Textual / Acumulador | `ILEngine` | Registrador de resultado atual (`_cr`), Opcodes LD/ST/AND/OR/ADD/SUB/JMP/RET |

---

### 3. MECANISMO DE TRADUÇÃO BIDIRECIONAL COM IR

O módulo `UnifiedIRTranslator` permite:
1. **Compilação**: Converte qualquer POU (em qualquer uma das 5 linguagens) em instruções atômicas de IR:
   - `LOAD_CONST`, `LOAD_VAR`, `STORE_VAR`
   - `ADD`, `SUB`, `MUL`, `DIV`, `AND`, `OR`, `NOT`, `XOR`
   - `EQ`, `NEQ`, `LT`, `LE`, `GT`, `GE`
   - `JUMP`, `JUMP_IF_TRUE`, `JUMP_IF_FALSE`
   - `CALL_FB`, `RETURN`
2. **Descompilação**: Reconstrói código legível em Structured Text (ST) a partir do IR compilado, viabilizando inspeção de baixo nível para engenheiros de automação.
3. **Preservação de Mapeamentos**: Variáveis temporárias (`_t_...`) e registradores de fluxo de potência de Ladder (`_rung_pwr`) são devidamente tipados e isolados no escopo local do POU.
