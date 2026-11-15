// Saneamento de patches da IA contra o documento atual — PURO e determinístico.
//
// A saída da IA já passou pelo Zod (formato), mas o Zod não conhece o estado do
// diagrama. Este módulo garante a INTEGRIDADE REFERENCIAL antes de aplicar:
//  • ID de nó novo que colide com nó existente → renomeado (antes sobrescrevia o
//    equipamento do usuário e o Ctrl+Z o apagava em vez de restaurar).
//  • Remoção de nó → remove também as arestas ligadas a ele (sem fios pendurados).
//  • Aresta para nó inexistente, laço (A→A) ou par duplicado → descartada.
//  • updateNodes de nó inexistente ou que troca o TIPO do equipamento → descartado
//    (trocar disjuntor por motor via "update" mascara uma substituição).
// Cada correção vira um aviso legível para o relatório ao usuário.
import type { AiDiagramPatch, DiagramDoc, DiagramEdge, DiagramNode } from "./schema";

export interface PatchSanitizeResult {
  patch: AiDiagramPatch;
  warnings: string[];
}

function uniqueId(base: string, taken: Set<string>): string {
  const stem = base.slice(0, 120);
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Inalcançável na prática (máx. 100 nós por patch); mantém determinismo.
  return `${stem}_${taken.size + 1}`;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function sanitizeAiPatch(doc: DiagramDoc, patch: AiDiagramPatch): PatchSanitizeResult {
  const warnings: string[] = [];
  const removeNodeIds = new Set(patch.removeNodeIds.filter((id) => doc.nodes[id]));
  for (const id of patch.removeNodeIds) {
    if (!doc.nodes[id]) warnings.push(`Remoção ignorada: nó inexistente "${id}"`);
  }

  // 1. Renomeia IDs de nós novos que colidem com nós que permanecem no doc
  //    (ou entre si). Arestas novas que citam o ID passam a apontar ao novo nó.
  const takenNodeIds = new Set(Object.keys(doc.nodes).filter((id) => !removeNodeIds.has(id)));
  const nodeRename = new Map<string, string>();
  const addNodes: DiagramNode[] = [];
  for (const n of patch.addNodes) {
    let id = n.id;
    if (takenNodeIds.has(id)) {
      id = uniqueId(n.id, takenNodeIds);
      nodeRename.set(n.id, id);
      warnings.push(`ID "${n.id}" já existia — novo equipamento renomeado para "${id}"`);
    }
    takenNodeIds.add(id);
    addNodes.push(id === n.id ? n : { ...n, id });
  }
  const resolve = (id: string) => nodeRename.get(id) ?? id;

  // 2. Arestas existentes removidas explicitamente + em cascata dos nós removidos.
  const removeEdgeIds = new Set(patch.removeEdgeIds.filter((id) => doc.edges[id]));
  for (const e of Object.values(doc.edges)) {
    if ((removeNodeIds.has(e.source) || removeNodeIds.has(e.target)) && !removeEdgeIds.has(e.id)) {
      removeEdgeIds.add(e.id);
      warnings.push(`Ligação "${e.id}" removida junto com o equipamento desligado`);
    }
  }

  // 3. Arestas novas: endpoints válidos, sem laço, sem duplicar par já ligado.
  const surviving = (id: string) =>
    (doc.nodes[id] !== undefined && !removeNodeIds.has(id)) || addNodes.some((n) => n.id === id);
  const takenEdgeIds = new Set(Object.keys(doc.edges).filter((id) => !removeEdgeIds.has(id)));
  const linkedPairs = new Set<string>();
  for (const e of Object.values(doc.edges)) {
    if (!removeEdgeIds.has(e.id) && e.kind === "power")
      linkedPairs.add(pairKey(e.source, e.target));
  }
  const addEdges: DiagramEdge[] = [];
  for (const raw of patch.addEdges) {
    const e: DiagramEdge = { ...raw, source: resolve(raw.source), target: resolve(raw.target) };
    if (e.source === e.target) {
      warnings.push(`Ligação "${raw.id}" descartada: liga o equipamento a ele mesmo`);
      continue;
    }
    if (!surviving(e.source) || !surviving(e.target)) {
      warnings.push(`Ligação "${raw.id}" descartada: equipamento inexistente`);
      continue;
    }
    if (e.kind === "power") {
      const k = pairKey(e.source, e.target);
      if (linkedPairs.has(k)) {
        warnings.push(`Ligação "${raw.id}" descartada: duplicaria condutor já existente`);
        continue;
      }
      linkedPairs.add(k);
    }
    if (takenEdgeIds.has(e.id)) {
      const id = uniqueId(e.id, takenEdgeIds);
      warnings.push(`ID de ligação "${e.id}" já existia — renomeado para "${id}"`);
      e.id = id;
    }
    takenEdgeIds.add(e.id);
    addEdges.push(e);
  }

  // 4. Atualizações: só em nós que existem e permanecem; sem troca de tipo.
  const updateNodes: AiDiagramPatch["updateNodes"] = [];
  for (const u of patch.updateNodes) {
    const cur = doc.nodes[u.id];
    if (!cur || removeNodeIds.has(u.id)) {
      warnings.push(`Atualização ignorada: nó "${u.id}" inexistente`);
      continue;
    }
    if (u.params && u.params.kind !== cur.params.kind) {
      warnings.push(
        `Atualização de "${u.id}" ignorada: trocaria ${cur.params.kind} por ${u.params.kind} (remova e adicione)`,
      );
      const { params: _drop, ...rest } = u;
      if (rest.position || rest.label !== undefined) updateNodes.push(rest);
      continue;
    }
    updateNodes.push(u);
  }
  const updateEdges = (patch.updateEdges ?? []).filter((u) => {
    const ok = doc.edges[u.id] !== undefined && !removeEdgeIds.has(u.id);
    if (!ok) warnings.push(`Atualização de ligação ignorada: "${u.id}" inexistente`);
    return ok;
  });

  return {
    patch: {
      ...patch,
      addNodes,
      addEdges,
      removeNodeIds: [...removeNodeIds],
      removeEdgeIds: [...removeEdgeIds],
      updateNodes,
      updateEdges,
    },
    warnings,
  };
}
