# ELÉTRICAI — ARQUITETURA DA TOPOLOGIA ELÉTRICA UNIFILAR
## Single Source of Truth, Grafo de Conectividade e Netlist Industrial

**Documento:** `docs/unifilar/UNIFILAR_TOPOLOGY_ARCHITECTURE.md`  
**Módulo:** Engine Unifilar & Conectividade Elétrica  
**Normas de Referência:** ABNT NBR 5410, ABNT NBR 14039, IEC 60947, IEC 60617, IEC 60204-1  
**Status:** Vigente e Homologado  

---

## 1. Visão Geral e Princípios Fundamentais

No ElétricAi, um diagrama elétrico unifilar não é uma coleção de linhas e caixas vetoriais soltas em um canvas. É a **expressão gráfica de uma rede elétrica topologicamente consistente e determinística**.

### Princípio da Separação Canônica:
1. **Camada Topológica (Grafo Elétrico Canônico):** Modela equipamentos, terminais físicos padronizados, nós de circuito e conexões condutoras (`CanonicalEquipment`, `CanonicalTerminal`, `ElectricalConnection`, `CanonicalNet`). Essa camada é a fonte única da verdade para cálculos elétricos (queda de tensão, curto-circuito, seletividade), simulação e exportação para multifilar/SCADA.
2. **Camada Geométrica (Canvas WebGL / Pixi):** Modela posições espaciais (`x`, `y`), waypoints ortogonais de renderização e âncoras visuais de portas (`T`, `B`, `L`, `R`). Nenhuma regra de negócio elétrica reside exclusivamente na camada de renderização.

```
┌────────────────────────────────────────────────────────┐
│             PROMPT DO ENGENHEIRO / IA                   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         AI PARSER & CIRCUIT TEMPLATE ENRICHER          │
│   • Normalização de nós (kind, specs, NBR 5410)        │
│   • Extração de edges com sourcePort e targetPort      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            CONNECTION REPAIR ENGINE (Fase 5)           │
│   • Detecção determinística de alimentador raiz        │
│   • Derivações de barramento automáticas               │
│   • Encademanento canônico (QF -> KM -> RT -> Mot)     │
│   • Fechamento de circuitos incompletos                │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            GRAPH VALIDATOR (Fase 6)                    │
│   • Detecção de nós órfãos, laços e curtos             │
│   • Rastreamento da fonte até a carga (CircuitPath)    │
│   • Validação de compatibilidade de tensão e fases     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            AUTO-LAYOUT & ROUTER (Fase 8)               │
│   • Níveis hierárquicos topológicos (Tree Levels)      │
│   • Waypoints ortogonais industriais (Manhattan)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         UNIFIED STORE & PERSISTÊNCIA CANÔNICA          │
│   • CanonicalEquipment com terminais IEC normalizados  │
│   • ElectricalConnection com netlist calculada         │
│   • Sincronização Unifilar <-> Multifilar <-> SCADA    │
└────────────────────────────────────────────────────────┘
```

---

## 2. Modelo de Dados da Conectividade

### 2.1 Equipamento Canônico (`CanonicalEquipment`)
Cada componente do diagrama possui uma representação no modelo canônico, indexada pelo seu `id` e identificada por seu `tagCode` industrial (ex.: `QF01`, `KM01`, `M01`, `T01`).
- **Terminais (`CanonicalTerminal`):** Lista estrita de portas de conexão elétrica com seus respectivos códigos padronizados (ex.: `1/L1`, `2/T1`, `A1`, `A2`, `PE`), tipo elétrico (`power`, `control`, `ground`, `signal`), nível de tensão nominal e capacidade de corrente.
- **Parâmetros (`diagramParams`):** Preserva integralmente os atributos originais do nó para garantir compatibilidade 100% bidirecional (round-trip) sem perda de metadados.

### 2.2 Conexão Elétrica (`ElectricalConnection`)
Diferente de uma simples aresta visual, uma conexão elétrica canônica expressa:
- `fromEquipmentId` e `fromTerminalId`: Terminal de saída da fonte ou do elemento a montante.
- `toEquipmentId` e `toTerminalId`: Terminal de entrada do receptor ou do elemento a jusante.
- `kind`: Tipo de circuito (`power`, `control`, `ground`, `analog`).
- `circuitConfig`: Configuração física dos condutores (`3F+N+PE`, `3F+PE`, `3F`, `F+N+PE`, `F+N`).
- `conductor`: Bitola nominal ($mm^2$), material (`Cu` / `Al`), tipo de isolação (`PVC`, `EPR`, `XLPE`) e comprimento estimado para cálculos de queda de tensão e impedância de loop.

### 2.3 Netlist Canônica (`CanonicalNet`)
O motor agrupa todas as conexões equipotenciais em redes elétricas compartilhadas (`CanonicalNet`).
- Dois condutores que se cruzam no diagrama visual sem um nó de derivação explícito pertencem a **redes distintas**, prevenindo curtos-circuitos acidentais no modelo elétrico.
- Barramentos (`busbar`) atuam como nós equipotenciais canônicos capazes de suportar múltiplas derivações a jusante sem criar loops inválidos.

---

## 3. Rastreamento e Propagação de Carga (CircuitPath)

O algoritmo de validação topológica (`validateElectricalTopology`) executa uma análise de fluxo direcional:
1. **Identificação de Fontes Raiz:**
   - Redes públicas de média/baixa tensão (`grid`), geradores (`generator`), transformadores (`transformer`).
   - Disjuntores de entrada de quadro geral (QGBT) que atuam como entrada de serviço quando não há subestação explicitada.
2. **Caminho da Fonte à Carga:**
   - Todo consumidor de energia (`motor`, `load`, `lamp`, `socket`, `heater`) deve possuir um caminho elétrico contínuo e sem interrupções até uma fonte válida.
   - O caminho elétrico detalhado (`CircuitPath`) é registrado contendo:
     - `sourceNodeId`: ID do nó supridor.
     - `targetNodeId`: ID da carga atendida.
     - `path`: Vetor sequencial de nós percorridos (ex.: `[QG01, BARRA_01, QF01, KM01, RT01, M01]`).
     - `nominalVoltageV`: Tensão operacional no barramento/circuito.
     - `isProtected`: Booleano confirmando se há pelo menos um dispositivo de proteção contra sobrecorrente no trajeto.

---

## 4. Garantia de Integridade e Reversibilidade

1. **Round-Trip Sem Regressão:**
   A conversão de um `DiagramDocument` para o `UnifiedProjectStore` e sua posterior restauração para o canvas preserva 100% dos nós, identificadores, posições de layout e conexões.
2. **Compatibilidade Multi-Engine:**
   A mesma netlist gerada no diagrama Unifilar alimenta:
   - O gerador de Diagramas Multifilares trifásicos com régua de bornes e numeração de fios.
   - O motor de supervisão SCADA com mapeamento automático de TAGs e estados operacionais.
   - Os cálculos normativos da NBR 5410 (seção mínima por capacidade de condução, queda de tensão e proteção contra choques).
