// Orthogonal Wire Router & Industrial Diagram Auto-Layout Engine
// Standards: IEC 60617, ISA-101
// Places nodes cleanly by topological levels and computes orthogonal wire routes

import type { DiagramDoc, DiagramNode, DiagramEdge, Position } from "../schema";

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

  // Calculate orthogonal waypoints for edges
  for (const [eId, edge] of Object.entries(nextDoc.edges)) {
    const src = nextDoc.nodes[edge.source];
    const tgt = nextDoc.nodes[edge.target];
    if (!src || !tgt) continue;

    // If source and target are in the same vertical column (same X)
    if (Math.abs(src.position.x - tgt.position.x) < 5) {
      // Straight vertical line: no waypoints needed
      nextDoc.edges[eId] = { ...edge, waypoints: [] };
    } else {
      // Orthogonal step: go down, turn horizontal, go down into target
      const midY = (src.position.y + tgt.position.y) / 2;
      const waypoints: Position[] = [
        { x: src.position.x, y: midY },
        { x: tgt.position.x, y: midY },
      ];
      nextDoc.edges[eId] = { ...edge, waypoints };
    }
  }

  return nextDoc;
}
