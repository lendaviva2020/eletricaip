# ELÉTRICAI — BIBLIOTECA DE TERMINAIS INDUSTRIAIS PADRONIZADOS
## Especificação Canônica de Terminais de Equipamentos Elétricos

**Documento:** `docs/unifilar/UNIFILAR_TERMINAL_LIBRARY.md`  
**Módulo:** `src/lib/diagram/connection/terminal-library.ts`  
**Normas:** IEC 60947-1, IEC 60947-4-1, IEC 60617, IEC 60204-1, ABNT NBR 5410, ABNT NBR 14039  
**Status:** Vigente e Homologado  

---

## 1. Introdução e Objetivo

Em um projeto elétrico profissional, a identificação dos pontos de conexão física dos equipamentos não pode ser arbitrária.
Termos genéricos como `:in`, `:out`, `:port1` ou `:port2` geram ambiguidades que impedem:
- A ligação correta de circuitos de força vs circuitos de comando.
- A diferenciação entre polaridades de alimentação CA e CC.
- A geração automatizada de diagramas multifilares e réguas de bornes.
- A verificação de curto-circuito e coordenação de proteções.

A biblioteca de terminais padronizados do ElétricAi mapeia cada tipo de nó do diagrama (`kind`) para uma lista de **terminais canônicos da indústria**, com seus respectivos códigos normalizados, tipo funcional, nível de tensão e capacidade.

---

## 2. Catálogo de Equipamentos e Terminais

### 2.1 Disjuntores e Chaves Seccionadoras (`breaker`, `motor_circuit_breaker`, `disconnector`)
- **Norma:** IEC 60947-2
- **Linha (Alimentação Superior):**
  - Unipolar: `1` (ou `1/L1`)
  - Bipolar / Fase + Neutro: `1/L1`, `N/L`
  - Tripolar: `1/L1`, `3/L2`, `5/L3`
  - Tetrapolar: `1/L1`, `3/L2`, `5/L3`, `N/L`
- **Carga (Saída Inferior):**
  - Unipolar: `2` (ou `2/T1`)
  - Bipolar / Fase + Neutro: `2/T1`, `N/T`
  - Tripolar: `2/T1`, `4/T2`, `6/T3`
  - Tetrapolar: `2/T1`, `4/T2`, `6/T3`, `N/T`
- **Auxiliares:** `13-14` (contato NA de indicação de ligado), `95-96` (contato trip).

### 2.2 Contatores de Potência (`contactor`)
- **Norma:** IEC 60947-4-1
- **Terminais de Força (Alimentação / Linha):** `1/L1`, `3/L2`, `5/L3`
- **Terminais de Força (Carga / Saída):** `2/T1`, `4/T2`, `6/T3`
- **Bobina de Acionamento:** `A1` (+ ou Linha de comando), `A2` (- ou Neutro de comando)
- **Contatos Auxiliares Integrados:** `13-14` (NA - Selo), `21-22` (NF - Intertravamento)

### 2.3 Relés Térmicos de Sobrecarga (`thermal_relay`)
- **Norma:** IEC 60947-4-1
- **Força Entrada (Conectado ao Contator):** `1/L1`, `3/L2`, `5/L3`
- **Força Saída (Cabo para o Motor):** `2/T1`, `4/T2`, `6/T3`
- **Contatos de Falha de Sobrecarga:**
  - `95-96`: NF (Interrompe o circuito de bobina do contator em caso de trip).
  - `97-98`: NA (Sinalização de alarme/falha térmica para o CLP ou painel).

### 2.4 Motores Elétricos de Indução (`motor`)
- **Norma:** ABNT NBR 17094 / IEC 60034-8
- **Motores Trifásicos (6 Terminais):**
  - `U1`, `V1`, `W1` (Entradas dos enrolamentos)
  - `U2`, `V2`, `W2` (Saídas dos enrolamentos para fechamento Estrela-Triângulo)
  - `PE`: Terminal de aterramento de carcaça
- **Motores Monofásicos:**
  - `U`, `V` (ou `1`, `2`)
  - `PE`: Aterramento

### 2.5 Inversores de Frequência (`vfd`) e Softstarters (`softstarter`)
- **Entrada de Rede (Alimentação Trifásica):** `R/L1`, `S/L2`, `T/L3`
- **Saída para Carga (Modulada PWM / Tensão Reduzida):** `U/T1`, `V/T2`, `W/T3`
- **Barramento de Corrente Contínua (DC Link):** `+ / DC+`, `- / DC-`
- **Controle e I/O Integrado:** `DI1`, `DI2`, `DI3`, `COM`, `+24V`, `AI1`, `GND`
- **Terminal de Terra de Alta Frequência:** `PE`

### 2.6 Fontes de Alimentação de Comando (`psu`)
- **Entrada CA:** `L` (Fase), `N` (Neutro), `PE` (Terra)
- **Saída CC:** `+24V` (Positivo contínuo), `0V` (Comum / Negativo contínuo)

### 2.7 Transformadores de Potência (`transformer`)
- **Norma:** ABNT NBR 5356 / IEC 60076
- **Primário (Alta/Média Tensão):** `H1`, `H2`, `H3` (Fases primárias), `H0` (Neutro primário se estrela)
- **Secundário (Baixa Tensão):** `X1`, `X2`, `X3` (Fases secundárias), `X0` (Neutro de baixa tensão para aterramento TN-S)
- **Aterramento de Carcaça e Neutro:** `PE`

### 2.8 Barramentos Gerais e CCMs (`busbar`, `ccm`)
- **Terminais de Barramento Principal:** `L1`, `L2`, `L3`, `N`, `PE`
- Suportam conexão N:M (uma ou mais fontes de alimentação e múltiplas saídas de ramais).

---

## 3. Mapeamento Bidirecional Geometria ↔ Terminal

O motor de conectividade (`resolveTerminalCode`) resolve automaticamente a correspondência entre portas geométricas do canvas e códigos elétricos:

| Tipo do Componente | Porta Geométrica | Direção Elétrica | Terminal Canônico Resolvido |
| :--- | :--- | :--- | :--- |
| Disjuntor | `T` (Topo) | Entrada | `1/L1` (ou `1`) |
| Disjuntor | `B` (Base) | Saída | `2/T1` (ou `2`) |
| Contator | `T` (Topo) | Entrada | `1/L1` |
| Contator | `B` (Base) | Saída | `2/T1` |
| Motor | `T` (Topo) | Entrada | `U1` (ou `U`) |
| Inversor (VFD) | `T` (Topo) | Entrada | `R/L1` |
| Inversor (VFD) | `B` (Base) | Saída | `U/T1` |
| Fonte (PSU) | `T` (Topo) | Entrada CA | `L` |
| Fonte (PSU) | `B` (Base) | Saída CC | `+24V` |
| Barramento | Qualquer | Derivação | `L1` (distribui fase para os disjuntores de ramal) |

Se a porta visual for fornecida já como código de terminal industrial (ex.: `2/T1`), ela é preservada diretamente sem transformação.
