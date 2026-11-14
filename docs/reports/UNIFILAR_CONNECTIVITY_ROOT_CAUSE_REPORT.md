# ELÉTRICAI INDUSTRIAL OS — RELATÓRIO DE CAUSA RAIZ (RCA)
# INVESTIGAÇÃO DA FALHA DE CONEXÕES NO CANVAS UNIFILAR (BUG P0)

**Data:** 14 de Novembro de 2026  
**Status:** CAUSA RAIZ IDENTIFICADA E RESOLVIDA  
**Severidade:** P0 — Crítica  
**Módulos Afetados:** IA Architect Client (`/ai` & chat), Universal Importer, Project Persistence, WebGL Canvas  

---

## 1. SINTOMA DE CAMPO REPORTADO

Usuários e testes de homologação relataram que, após gerar um projeto elétrico via IA interna (`/ai` ou chat do canvas) ou ao colar/importar um projeto proveniente de IA externa (ChatGPT, Claude, DeepSeek):
1. Os equipamentos (disjuntores, barramentos, contatores, relés térmicos, motores) apareciam dispostos no Canvas Unifilar.
2. No entanto, as **linhas elétricas (condutores/fios) NÃO eram renderizadas**.
3. O diagrama unifilar aparentava ser um conjunto de blocos soltos e desconectados, apesar de a lógica Ladder e a lista de variáveis estarem funcionais.

---

## 2. INVESTIGAÇÃO DETALHADA E AS 4 CAUSAS RAIZ

Após auditoria forense linha a linha em toda a pipeline:
`GERAÇÃO IA / IMPORTAÇÃO -> PARSING -> NORMALIZAÇÃO -> GRAFO ELÉTRICO -> PERSISTÊNCIA -> HYDRATION DO CANVAS -> RENDERIZADOR UNIFILAR`

Foram comprovadas 4 causas raiz complementares:

### Causa Raiz #1 — Omissão de deploy no `useDiagramStore` em `applyArchitectToStore`
- **Arquivo:** [`src/lib/ai-architect-client.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/ai-architect-client.ts) (linhas 276–280).
- **Mecanismo da Falha:**  
  Quando a IA interna gerava o projeto (`ArchitectResult`), a função `applyArchitectToStore`:
  1. Populava nós e arestas de SCADA em `useProjectStore`.
  2. Populava rungs Ladder em `useEditorStore`.
  3. Populava blocos FBD em `useEditorStore`.
  4. Porém, no Passo 2 (linhas 276-279), havia apenas um comentário legado informando que o deploy no antigo `useVoltaiStore` havia sido removido. **Nenhum comando era despachado para `useDiagramStore`!**
  Como o `WebGLCanvas` lê exclusivamente de `useDiagramStore.doc`, o canvas unifilar permanecia vazio ou com o documento anterior estático.

### Causa Raiz #2 — Efeito cascata na persistência do snapshot (`buildProjectSnapshot`)
- **Arquivo:** [`src/lib/use-project-persistence.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/use-project-persistence.ts) (linha 409).
- **Mecanismo da Falha:**  
  Ao salvar o projeto para o Supabase, a função `buildProjectSnapshot()` coletava:
  `diagram: ds.doc as DiagramDoc` lido de `useDiagramStore`.
  Como `useDiagramStore` nunca havia recebido as arestas geradas pela IA, o snapshot salvo no banco gravava `snap.diagram` sem conexões ou vazio.
  Ao reabrir o projeto (`performLoad`), o sistema carregava `snap.diagram` sem conexões, perpetuando o circuito quebrado.

### Causa Raiz #3 — Perda de arestas por descasamento de Tag vs ID no Importador Universal
- **Arquivo:** [`src/lib/importer/universal-importer.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/importer/universal-importer.ts) (linhas 528–547).
- **Mecanismo da Falha:**  
  Quando uma IA externa gerava um `eletricai.canvas-bundle`, ela frequentemente referenciava as conexões por tags (ex.: `source: "DJ-01"`, `target: "BARRA-01"`), enquanto a lista de nós possuía `id: "node_1"`, `label: "DJ-01"`, `properties: { tag: "DJ-01" }`.
  Na conversão para `DiagramDoc`:
  `if (!doc.nodes[srcId] || !doc.nodes[tgtId]) continue;`
  Como `doc.nodes` estava indexado pelo `id` interno e não pela tag/label, a verificação falhava e as arestas eram **descartadas silenciosamente**.

### Causa Raiz #4 — Colapso de portas de derivação de barramento e falta de reparo
- **Arquivo:** [`src/lib/diagram/render/stage.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/diagram/render/stage.ts) e [`src/lib/diagram/render/ports.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/diagram/render/ports.ts).
- **Mecanismo da Falha:**  
  Quando as arestas eram criadas sem `sourcePort` explícito em nós do tipo `busbar`, o método `portWorld` caía no fallback `ports[1]`, que é sempre a porta `"B1"` (-40px, 4px).
  Como resultado, todas as derivações a jusante do barramento convergiam para um único ponto físico sobreposto.
  Adicionalmente, se o pacote externo não declarasse explicitamente os elos intermediários, o sistema não executava o motor determinístico `repairDiagramConnections` para sintetizar a topologia em anel ou radial.

---

## 3. CONCLUSÃO

A causa não era visual ou de sombreamento WebGL/Pixi.js, e sim uma **ruptura na cadeia de transformação de dados entre o gerador/importador e o store canônico do canvas (`useDiagramStore`)**.
A correção exigiu a sincronização bidirecional completa da pipeline e o acionamento do motor determinístico de reparo topológico.
