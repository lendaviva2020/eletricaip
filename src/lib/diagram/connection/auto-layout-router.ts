// Orthogonal Wire Router & Industrial Diagram Auto-Layout Engine
// Standards: IEC 60617, ISA-101
// Places nodes cleanly by topological levels and computes orthogonal wire routes

import type { DiagramDoc, DiagramNode, DiagramEdge } from "../schema";
import { resolveVisualPort, rotatePort } from "../render/ports";
import { computeNodeBoundingBox, routeOrthogonalEdge } from "../render/wire-router";

export interface LayoutOptions {
  startX?: number;
  startY?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
}

/**
 * Assigns hierarchical levels (rows) and positions to industrial equipment nodes
 * based on their topological electrical roles.
 */
export function autoLayoutIndustrialDiagram(doc: DiagramDoc, opts?: LayoutOptions): DiagramDoc {
  const startX = opts?.startX ?? 200;
  const startY = opts?.startY ?? 100;
  const hSpace = opts?.horizontalSpacing ?? 260;
  const vSpace = opts?.verticalSpacing ?? 140;

  const nextDoc: DiagramDoc = {
    ...doc,
    nodes: { ...doc.nodes },
    edges: { ...doc.edges },
  };

  const nodes = Object.values(nextDoc.nodes).filter(
    (n) => n.sheet === "unifilar" || !n.id.startsWith("mf_"),
  );

  const trafos = nodes.filter(
    (n) => n.params.kind === "transformer" || n.params.kind === "generator",
  );
  const busbar = nodes.find((n) => n.params.kind === "busbar");
  const breakers = nodes.filter((n) => n.params.kind === "breaker");
  const contactors = nodes.filter((n) => n.params.kind === "contactor");
  const thermalRelays = nodes.filter((n) => n.params.kind === "thermal_relay");
  const vfds = nodes.filter((n) => n.params.kind === "vfd");
  const softstarters = nodes.filter((n) => n.params.kind === "softstarter");
  const psus = nodes.filter((n) => n.params.kind === "psu");
  const motors = nodes.filter((n) => n.params.kind === "motor");
  const otherLoads = nodes.filter(
    (n) => n.params.kind === "load" || n.params.kind === "lamp" || n.params.kind === "socket",
  );

  // Find incoming connection to busbar
  const busbarInEdge = busbar
    ? Object.values(nextDoc.edges).find((e) => e.target === busbar.id)
    : undefined;

  const mainBreaker = busbarInEdge
    ? nextDoc.nodes[busbarInEdge.source]
    : (breakers.find((b) => /geral|main|qgbt|qf0|dj0/i.test(b.label || b.id)) ?? breakers[0]);

  const branchBreakers = breakers.filter((b) => b.id !== mainBreaker?.id);

  let currentY = startY;

  // Level 0: Transformer / Grid Infeed
  if (trafos.length > 0) {
    const trafoX = startX + 300;
    for (const t of trafos) {
      if (nextDoc.nodes[t.id]) {
        nextDoc.nodes[t.id] = { ...t, position: { x: trafoX, y: currentY } };
      }
    }
    currentY += vSpace;
  }

  // Level 1: Main Disconnect / Breaker
  if (mainBreaker && nextDoc.nodes[mainBreaker.id]) {
    const mainX = startX + 300;
    nextDoc.nodes[mainBreaker.id] = {
      ...mainBreaker,
      position: { x: mainX, y: currentY },
    };
    currentY += vSpace;
  }

  // Level 2: Busbar
  if (busbar && nextDoc.nodes[busbar.id]) {
    const busX = startX + 300;
    nextDoc.nodes[busbar.id] = {
      ...busbar,
      position: { x: busX, y: currentY },
    };
    currentY += vSpace;
  }

  // Level 3 to 6: Branch columns
  const branchCount = Math.max(
    branchBreakers.length,
    contactors.length + vfds.length + softstarters.length + psus.length,
  );

  const totalWidth = Math.max(1, branchCount) * hSpace;
  const branchStartX = Math.max(100, startX + 300 - totalWidth / 2 + hSpace / 2);

  // Layout each branch column vertically
  // Collect columns: each branch gets an X index
  const columns: Array<{
    breaker?: DiagramNode;
    switching?: DiagramNode;
    thermal?: DiagramNode;
    load?: DiagramNode;
  }> = [];

  // Match branch breakers to their downstream equipment
  branchBreakers.forEach((brk, idx) => {
    const outgoing = Object.values(nextDoc.edges).filter((e) => e.source === brk.id);
    const downstreamId = outgoing[0]?.target;
    const switchingNode = downstreamId ? nextDoc.nodes[downstreamId] : undefined;

    let thermalNode: DiagramNode | undefined;
    let loadNode: DiagramNode | undefined;

    if (switchingNode) {
      const swOut = Object.values(nextDoc.edges).filter((e) => e.source === switchingNode.id);
      const afterSwId = swOut[0]?.target;
      const afterSwNode = afterSwId ? nextDoc.nodes[afterSwId] : undefined;

      if (afterSwNode?.params.kind === "thermal_relay") {
        thermalNode = afterSwNode;
        const thOut = Object.values(nextDoc.edges).filter((e) => e.source === thermalNode!.id);
        const loadId = thOut[0]?.target;
        loadNode = loadId ? nextDoc.nodes[loadId] : undefined;
      } else if (
        afterSwNode?.params.kind === "motor" ||
        afterSwNode?.params.kind === "load" ||
        afterSwNode?.params.kind === "lamp"
      ) {
        loadNode = afterSwNode;
      }
    }

    columns.push({
      breaker: brk,
      switching: switchingNode,
      thermal: thermalNode,
      load: loadNode,
    });
  });

  // Assign coordinates to branch columns
  columns.forEach((col, idx) => {
    const colX = branchStartX + idx * hSpace;
    let rowY = currentY;

    if (col.breaker && nextDoc.nodes[col.breaker.id]) {
      nextDoc.nodes[col.breaker.id] = {
        ...col.breaker,
        position: { x: colX, y: rowY },
      };
    }
    rowY += vSpace;

    if (col.switching && nextDoc.nodes[col.switching.id]) {
      nextDoc.nodes[col.switching.id] = {
        ...col.switching,
        position: { x: colX, y: rowY },
      };
    }
    rowY += vSpace;

    if (col.thermal && nextDoc.nodes[col.thermal.id]) {
      nextDoc.nodes[col.thermal.id] = {
        ...col.thermal,
        position: { x: colX, y: rowY },
      };
    }
    rowY += vSpace;

    if (col.load && nextDoc.nodes[col.load.id]) {
      nextDoc.nodes[col.load.id] = {
        ...col.load,
        position: { x: colX, y: rowY },
      };
    }
  });

  // Calculate orthogonal waypoints using resolved ports and obstacle avoidance
  return routeDiagramEdges(nextDoc);
}

/**
 * Recalcula os waypoints ortogonais de TODAS as arestas a partir das posições
 * atuais dos nós — sem mover nenhum nó. Usado na correção de um diagrama já
 * desenhado pelo usuário, onde o layout manual deve ser preservado.
 */
export function routeDiagramEdges(doc: DiagramDoc): DiagramDoc {
  const nextDoc: DiagramDoc = {
    ...doc,
    nodes: { ...doc.nodes },
    edges: { ...doc.edges },
  };

  const allNodes = Object.values(nextDoc.nodes);
  const useObstacles = allNodes.length <= 300;
  const nodeBoxById = new Map<string, ReturnType<typeof computeNodeBoundingBox>>();
  if (useObstacles) {
    for (const n of allNodes) {
      nodeBoxById.set(n.id, computeNodeBoundingBox(n));
    }
  }

  for (const [eId, edge] of Object.entries(nextDoc.edges)) {
    const src = nextDoc.nodes[edge.source];
    const tgt = nextDoc.nodes[edge.target];
    if (!src || !tgt) continue;

    const srcPort = resolveVisualPort(src.params.kind, edge.sourcePort, "source", src.params);
    const tgtPort = resolveVisualPort(tgt.params.kind, edge.targetPort, "target", tgt.params);
    const srcOffset = srcPort ? rotatePort(srcPort, src.rotation ?? 0) : { x: 0, y: 0 };
    const tgtOffset = tgtPort ? rotatePort(tgtPort, tgt.rotation ?? 0) : { x: 0, y: 0 };

    const from = { x: src.position.x + srcOffset.x, y: src.position.y + srcOffset.y };
    const to = { x: tgt.position.x + tgtOffset.x, y: tgt.position.y + tgtOffset.y };

    const obstacles: ReturnType<typeof computeNodeBoundingBox>[] = [];
    if (useObstacles) {
      for (const n of allNodes) {
        if (n.sheet !== edge.sheet || n.id === src.id || n.id === tgt.id) continue;
        const box = nodeBoxById.get(n.id);
        if (box) obstacles.push(box);
      }
    }

    const waypoints = routeOrthogonalEdge({
      from,
      to,
      srcSide: srcPort?.side ?? "bottom",
      tgtSide: tgtPort?.side ?? "top",
      obstacles,
    });

    nextDoc.edges[eId] = { ...edge, waypoints };
  }

  return nextDoc;
}

/** Deslocamento vertical padrão (px) entre um equipamento e o seguinte no ramal. */
const RELATIVE_PLACEMENT_V = 140;

/**
 * Posiciona APENAS os nós recém-adicionados (`addedIds`), deixando intactas as
 * posições de todos os equipamentos que o usuário já havia desenhado.
 *
 * Cada nó novo é ancorado ao vizinho elétrico já posicionado: abaixo da sua
 * fonte (aresta que chega) ou acima da sua carga (aresta que sai). Se não houver
 * vizinho posicionado, mantém a posição que a IA sugeriu. Colisões exatas são
 * empurradas para baixo, nunca para cima de um equipamento existente.
 */
export function placeAddedNodes(doc: DiagramDoc, addedIds: ReadonlySet<string>): DiagramDoc {
  if (addedIds.size === 0) return doc;
  const nextNodes: Record<string, DiagramNode> = { ...doc.nodes };
  const posKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

  // Posições ocupadas pelos nós que PERMANECEM (não recém-adicionados).
  const occupied = new Set<string>();
  for (const n of Object.values(doc.nodes)) {
    if (!addedIds.has(n.id)) occupied.add(posKey(n.position.x, n.position.y));
  }

  const edges = Object.values(doc.edges);
  // Processa em ordem estável para cadeias de nós novos encadeados.
  const ordered = [...addedIds].sort();
  for (const id of ordered) {
    const node = nextNodes[id];
    if (!node) continue;

    const inEdge = edges.find((e) => e.target === id && nextNodes[e.source]);
    const outEdge = edges.find((e) => e.source === id && nextNodes[e.target]);

    let pos = node.position;
    if (inEdge) {
      const s = nextNodes[inEdge.source];
      pos = { x: s.position.x, y: s.position.y + RELATIVE_PLACEMENT_V };
    } else if (outEdge) {
      const t = nextNodes[outEdge.target];
      pos = { x: t.position.x, y: t.position.y - RELATIVE_PLACEMENT_V };
    }
    // Evita sobrepor exatamente outro equipamento.
    let guard = 0;
    while (occupied.has(posKey(pos.x, pos.y)) && guard < 100) {
      pos = { x: pos.x + 40, y: pos.y + RELATIVE_PLACEMENT_V };
      guard += 1;
    }
    occupied.add(posKey(pos.x, pos.y));
    nextNodes[id] = { ...node, position: pos };
  }

  return { ...doc, nodes: nextNodes };
}
