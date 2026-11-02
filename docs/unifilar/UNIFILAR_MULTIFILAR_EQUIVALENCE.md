# ELÉTRICAI — EQUIVALÊNCIA E SINCRONIZAÇÃO UNIFILAR ↔ MULTIFILAR
## Expansão Multifilar Trifásica, Réguas de Bornes e Identificação Canônica

**Documento:** `docs/unifilar/UNIFILAR_MULTIFILAR_EQUIVALENCE.md`  
**Módulos:** `src/lib/diagram/multifilar.ts`, `src/lib/diagram/connection/connection-engine.ts`, `src/lib/model/unified-store.ts`  
**Normas:** ABNT NBR 5410, IEC 60617, IEC 60204-1  
**Status:** Vigente e Homologado  

---

## 1. Princípio da Equivalência Canônica

O diagrama unifilar sintetiza a arquitetura e a distribuição de potência de uma instalação. No entanto, para a montagem prática de painéis elétricos, parametrização de bornes e fiação de campo, é imprescindível a visualização **multifilar detalhada** (com separação física de todas as fases, condutor neutro, condutor de proteção e réguas de interconexão).

No ElétricAi, a conversão Unifilar $\leftrightarrow$ Multifilar não cria entidades duplicadas ou desconexas. Ambas as representações compartilham a mesma identidade canônica (`equipmentId`, `tagCode`, `terminalCode`).

---

## 2. Regras de Expansão e Desdobramento de Condutores

Quando uma conexão unifilar é expandida para o domínio multifilar:

### 2.1 Código de Cores Padronizado (NBR 5410 item 6.1.5.3)
| Função | Código de Identificação | Cor do Condutor | Código Hexadecimal |
| :--- | :--- | :--- | :--- |
| Fase L1 / R | `L1` | Preto ou Marrom | `#1A1A1A` / `#6B3E26` |
| Fase L2 / S | `L2` | Branco ou Cinza | `#CCCCCC` / `#808080` |
| Fase L3 / T | `L3` | Vermelho | `#CC0000` |
| Neutro | `N` | Azul Claro | `#0080FF` |
| Proteção (Terra) | `PE` | Verde com listras Amarelas | `#00A859` |
| Comando CC (+) | `+24V` | Vermelho Escuro | `#A82020` |
| Comando CC (0V) | `0V` | Azul Escuro | `#1A3B8B` |

### 2.2 Desdobramento de Conexões por Configuração de Circuito
1. **Configuração `3F+N+PE`:**
   - 1 condutor unifilar $\to$ 5 condutores multifilares individuais:
     - `1/L1` $\to$ `L1`
     - `3/L2` $\to$ `L2`
     - `5/L3` $\to$ `L3`
     - `N/L` $\to$ `N`
     - `PE` $\to$ `PE`
2. **Configuração `3F+PE` (Alimentação direta de Motores Trifásicos):**
   - 1 condutor unifilar $\to$ 4 condutores multifilares:
     - `2/T1` $\to$ `U1`
     - `4/T2` $\to$ `V1`
     - `6/T3` $\to$ `W1`
     - `PE` $\to$ `PE` (Carcaça do motor)
3. **Configuração `F+N+PE` (Tomadas e Iluminação 220V/127V):**
   - 1 condutor unifilar $\to$ 3 condutores individuais:
     - Fase $\to$ Terminal `L`
     - Neutro $\to$ Terminal `N`
     - Terra $\to$ Terminal `PE`

---

## 3. Geração Automática de Réguas de Bornes (Terminal Strips)

Para cada transição entre o interior do painel elétrico (QGBT / CCM) e o campo exterior (motores, botoeiras, sensores), o gerador multifilar insere automaticamente réguas de bornes padronizadas (`-X1`, `-X2`):

```
PAINEL ELÉTRICO (CCM)              RÉGUA DE BORNES (-X1)           CAMPO (MOTOR M-01)
┌───────────────────────┐          ┌───────────────────┐          ┌──────────────────┐
│ Relé Térmico RT01     │          │                   │          │                  │
│ Terminal 2/T1 ────────┼─────────>│ Borne 1 ──────────┼─────────>│ Terminal U1      │
│ Terminal 4/T2 ────────┼─────────>│ Borne 2 ──────────┼─────────>│ Terminal V1      │
│ Terminal 6/T3 ────────┼─────────>│ Borne 3 ──────────┼─────────>│ Terminal W1      │
│ Barramento PE ────────┼─────────>│ Borne PE ─────────┼─────────>│ Carcaça PE       │
└───────────────────────┘          └───────────────────┘          └──────────────────┘
```

---

## 4. Circuito de Comando Associado

A partir do diagrama unifilar de potência, o motor multifilar gera os rascunhos de comando elétrico correspondentes:
- **Partida Direta:**
  - Circuito de alimentação de bobina $24VCC$ ou $220VCA$ com contato NF de emergência ($E\text{-}STOP$), contato NF do relé térmico ($95-96$), botoeira desliga ($S0$), botoeira liga ($S1$) e contato de selo auxiliar do contator ($KM1: 13-14$).
- **Partida por Inversor:**
  - Conexões digitais de habilitação ($DI1$ para sentido horário, $DI2$ para reset de falha, $COM$ conectado ao comum da fonte $24V$).
