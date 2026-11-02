# ELÉTRICAI — VALIDAÇÃO DE CONECTIVIDADE E TOPOLOGIA ELÉTRICA
## Regras Determinísticas de Grafo e Auditoria de Engenharia

**Documento:** `docs/unifilar/UNIFILAR_CONNECTION_VALIDATION.md`  
**Módulo:** `src/lib/diagram/connection/graph-validator.ts`  
**Normas:** ABNT NBR 5410, IEC 60364, IEC 60947  
**Status:** Vigente e Homologado  

---

## 1. Princípios da Validação Topológica

Diferente de validadores puramente gráficos (que apenas checam se retângulos colidem ou se linhas possuem início e fim), o **GraphValidator** do ElétricAi audita as propriedades elétricas e normativas da rede antes de permitir cálculos ou persistência definitiva.

---

## 2. Catálogo de Regras de Validação

O validador executa 10 verificações formais sobre o grafo:

### Regra 1: Ausência de Nós Órfãos (Isolados)
- **Critério:** Todo equipamento inserido no diagrama unifilar deve possuir ao menos uma conexão elétrica (de entrada, saída ou derivação), exceto se for explicitamente marcado como reserva desenergizada.
- **Severidade:** `WARNING` para quadros/chaves em montagem; `ERROR` para cargas ativas.

### Regra 2: Integridade Referencial das Conexões
- **Critério:** Todo `source` e `target` de uma conexão (`DiagramEdge` ou `ElectricalConnection`) deve corresponder a nós existentes no documento (`nodes[id] != null`). Conexões apontando para IDs inexistentes ou "fantasmas" são rejeitadas.
- **Severidade:** `ERROR` (`INVALID`).

### Regra 3: Rastreabilidade Fonte ➔ Carga (Alimentação Contínua)
- **Critério:** Todo equipamento consumidor de energia (`motor`, `load`, `lamp`, `socket`, `heater`) deve possuir um caminho elétrico contínuo e ininterrupto (`CircuitPath`) até uma fonte válida (rede da concessionária, gerador, transformador ou alimentador geral QGBT).
- **Severidade:** `ERROR` (`INVALID`).

### Regra 4: Proteção Obrigatória de Ramal
- **Critério:** Em conformidade com a NBR 5410 (item 5.3) e IEC 60364-4-43, nenhum circuito terminal pode ser conectado diretamente ao barramento principal sem um dispositivo de proteção contra sobrecorrente e curto-circuito (disjuntor termomagnético ou fusível).
- **Severidade:** `ERROR`.

### Regra 5: Compatibilidade de Tensão e Fase
- **Critério:** Equipamentos monofásicos ($220V$) derivados de sistemas trifásicos devem ser conectados a arranjos compatíveis ($F+N$ ou $F+F$). Cargas trifásicas ($380V$) não podem ser alimentadas por circuitos monofásicos.
- **Severidade:** `ERROR`.

### Regra 6: Isolamento de Força vs Comando
- **Critério:** Condutores de força trifásica não podem ser conectados diretamente a entradas de comando digital ($24VCC$) ou circuitos analógicos de instrumentação sem dispositivo de interface ou conversão galvânica (PSU / transformador de comando).
- **Severidade:** `ERROR`.

### Regra 7: Proibição de Loops Inválidos (Laços de Potência)
- **Critério:** Em sistemas radiais típicos de baixa tensão, não são permitidos anéis fechados não supervisionados entre saídas de disjuntores distintos (paralelismo acidental de fontes).
- **Severidade:** `ERROR`.

### Regra 8: Derivações de Barramento Equipotenciais
- **Critério:** Barramentos gerais (`busbar`, `ccm`) suportam múltiplas derivações a jusante. Cada derivação herda o nível de tensão e capacidade do barramento, sem curto-circuito entre ramais adjacentes.
- **Severidade:** `INFO` / `VALID`.

### Regra 9: Cruzamento de Linhas sem Junção Elétrica
- **Critério:** Condutores que se cruzam no canvas visual em $X$ ou $+$ sem ponto de junção explícito (`junctionNode`) mantêm netlists totalmente isoladas. Não há propagação de potencial entre eles.
- **Severidade:** `VALID`.

### Regra 10: Limite Normativo de Queda de Tensão
- **Critério:** Conforme NBR 5410 item 6.2.7, a queda de tensão máxima acumulada da origem da instalação até a carga terminal não pode ultrapassar $4\%$ (ou $7\%$ em partida de motores). O cálculo determinístico é acionado automaticamente a partir do trajeto obtido pelo `CircuitPath`.
- **Severidade:** `WARNING` se $\Delta U > 4\%$; `ERROR` se $\Delta U > 7\%$.

---

## 3. Contrato de Dados: `ConnectivityReport`

```typescript
export interface ConnectivityReport {
  status: "VALID" | "WARNING" | "INVALID";
  summary: {
    totalNodes: number;
    totalEdges: number;
    totalNets: number;
    connectedLoads: number;
    unconnectedLoads: number;
    rootSourcesCount: number;
  };
  orphanedNodes: Array<{
    nodeId: string;
    label: string;
    kind: string;
  }>;
  unpoweredLoads: Array<{
    nodeId: string;
    label: string;
    reason: string;
  }>;
  invalidConnections: Array<{
    edgeId: string;
    source: string;
    target: string;
    reason: string;
  }>;
  warnings: string[];
  circuitPaths: CircuitPath[];
}
```
