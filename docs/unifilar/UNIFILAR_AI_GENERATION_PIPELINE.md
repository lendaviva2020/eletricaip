# ELÉTRICAI — PIPELINE DE GERAÇÃO ELÉTRICA POR IA
## Da Linguagem Natural ao Grafo Elétrico Totalmente Conectado e Validado

**Documento:** `docs/unifilar/UNIFILAR_AI_GENERATION_PIPELINE.md`  
**Módulos:** `src/lib/diagram/ai.functions.ts`, `src/lib/diagram/zod-to-json-schema.ts`, `src/lib/diagram/connection/connection-repair-engine.ts`, `src/lib/diagram/connection/auto-layout-router.ts`  
**Status:** Vigente e Homologado  

---

## 1. O Problema Histórico e a Filosofia da Solução

### 1.1 O Erro do Paradigma Anterior
Anteriormente, ao solicitar um circuito à IA (ex.: "QGBT com 3 partidas diretas de 10CV e uma fonte 24V"), o LLM gerava nós visuais soltos e deixava o array de conexões (`addEdges`) vazio ou incompleto. Isso resultava em diagramas com equipamentos "flutuando" no canvas, disjuntores sem saída, motores sem alimentação e barramentos desconectados.

### 1.2 O Princípio Fundamental da Arquitetura ElétricAi
> **"A IA interpreta a intenção funcional e os parâmetros nominais; o motor determinístico valida, conecta, repara e posiciona a rede elétrica com base em regras estritas de engenharia."**

Nenhum diagrama gerado por IA é entregue ao canvas sem passar pela validação e reparação automática de topologia.

---

## 2. As Fases do Pipeline de Geração

O fluxo de processamento de um prompt executa rigorosamente 6 etapas sequenciais:

```
                  ┌─────────────────────────────────────────┐
                  │          PROMPT DO ENGENHEIRO           │
                  │   Ex: "QGBT 380V com alimentador geral, │
                  │   barramento e 2 partidas de 15CV"      │
                  └───────────────────┬─────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 1: SYSTEM PROMPT & STRUCTURED OUTPUT (Gemini API)                     │
│  • System Prompt com diretivas imperativas de conectividade total (NBR 5410)│
│  • Schema JSON estrito incluindo 'sourcePort', 'targetPort' e 'circuitConfig│
│  • Exemplo canônico de circuito completo fornecido no contexto              │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ (Retorna nós + conexões iniciais)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 2: PARSING & COMPATIBILIZAÇÃO (Zod)                                   │
│  • Validação estrita do payload JSON retornado pela IA                      │
│  • Atribuição de IDs únicos caso ausentes                                   │
│  • Normalização de parâmetros elétricos e tags industriais                  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 3: REPARAÇÃO DETERMINÍSTICA DE CONEXÕES (ConnectionRepairEngine)     │
│  • Detecção de alimentador geral (QG) e barramento principal                │
│  • Vinculação obrigatória: Barramento ──> Disjuntores de ramal              │
│  • Encademanento automático em ramal motor:                                 │
│    Disjuntor (2/T1) ──> Contator (1/L1)                                     │
│    Contator (2/T1)  ──> Relé Térmico (1/L1)                                 │
│    Relé Térmico (2/T1) ──> Motor (U1)                                       │
│  • Vinculação de ramal com inversor:                                        │
│    Disjuntor (2/T1) ──> VFD (R/L1) ──> Motor (U1)                           │
│  • Vinculação de fonte de comando:                                          │
│    Disjuntor (2/T1) ──> PSU (L)                                             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 4: AUTO-LAYOUT E ROTEAMENTO ORTOGONAL (AutoLayoutRouter)              │
│  • Cálculo de níveis hierárquicos topológicos (Árvore de Potência)          │
│  • Distribuição horizontal equidistante dos ramais derivados                │
│  • Geração de waypoints ortogonais em ângulo reto (estilo EPLAN / CAD)     │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 5: AUDITORIA TOPOLÓGICA (GraphValidator)                              │
│  • Rastreamento da fonte até a carga de cada consumidor                     │
│  • Verificação de nós órfãos ou desconectados                               │
│  • Emissão do ConnectivityReport (Status: VALID, WARNING, INVALID)          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 6: ENTREGA AO CANVAS E FEEDBACK AO USUÁRIO                            │
│  • Aplicação atômica das mutações no store do Canvas (addNodes, addEdges)   │
│  • Exibição no chat de relatório detalhado: nós, conexões, reparos e status │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detalhes das Funções Principais

### 3.1 `repairDiagramConnections(doc)`
Essa função examina o grafo elétrico atual e aplica padrões de circuito normatizados:
1. **Padrão QGBT / Barramento:** Se existir um disjuntor de entrada e um barramento sem conexão entre eles, estabelece a ligação `QG:2/T1 -> BARRA:L1`.
2. **Padrão Derivação de Barramento:** Para cada disjuntor de ramal que não possui entrada conectada, cria a conexão do barramento para o disjuntor (`BARRA:L1 -> QF:1/L1`).
3. **Padrão Partida de Motor:** Para nós do mesmo ramal (detectados por vizinhança ou nomes correlatos), completa as conexões sequenciais ausentes:
   - $Disjuntor \xrightarrow{2/T1 \to 1/L1} Contator$
   - $Contator \xrightarrow{2/T1 \to 1/L1} Rel\acute{e} \ T\acute{e}rmico$
   - $Rel\acute{e} \ T\acute{e}rmico \xrightarrow{2/T1 \to U1} Motor$
4. **Padrão Inversor / Carga Especial:**
   - $Disjuntor \xrightarrow{2/T1 \to R/L1} Inversor \xrightarrow{U/T1 \to U1} Motor$
   - $Disjuntor \xrightarrow{2/T1 \to L} Fonte \ PSU$

### 3.2 `autoLayoutAndRouteDiagram(doc)`
Garante legibilidade industrial imediata:
- Nível 0 ($Y = 100$): Disjuntor Geral / Transformador / Entrada.
- Nível 1 ($Y = 250$): Barramento de Distribuição (horizontalmente estendido).
- Nível 2 ($Y = 400$): Disjuntores de Ramal ($X_i = X_{base} + i \times \Delta X$).
- Nível 3 ($Y = 550$): Contatores / Inversores.
- Nível 4 ($Y = 700$): Relés Térmicos.
- Nível 5 ($Y = 850$): Motores e Cargas Finais.
- Waypoints: Rotas ortogonais automáticas de 3 ou 5 segmentos evitando sobreposição de condutores.

### 3.3 `validateElectricalTopology(doc)`
Verifica a integridade completa do grafo e gera o `ConnectivityReport`:
- `orphanedNodes`: Nós que não possuem nenhuma conexão no diagrama.
- `unpoweredLoads`: Consumidores sem caminho contínuo até uma fonte alimentadora.
- `circuitPaths`: Vetor com a árvore completa de alimentação de cada carga.
- `status`: `"VALID"`, `"WARNING"` ou `"INVALID"`.

---

## 4. Feedback no Chat da IA

Após a execução da chamada, a interface do assistente exibe o resumo imediato da conectividade gerada:

```markdown
⚡ **Circuito Gerado e Conectado com Sucesso**
- Equipamentos criados: 8 nós
- Conexões estabelecidas: 7 condutores
- Conexões reparadas automaticamente: 4 ramais
- Status topológico: ✅ VÁLIDO (Todas as cargas com caminho contínuo até o alimentador geral)
```
