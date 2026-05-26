// Adapter DiagramDoc → DXF.
// Mantém o gerador buildDxf() agnóstico e centraliza aqui a tradução
// (rotação, portas, roteamento ortogonal por porta de origem/destino).
import { buildDxf, downloadDxf, type DxfEdge, type DxfNode } from "@/lib/dxf-export";
import type { DiagramDoc, SheetKind } from "@/lib/diagram/schema";
import { findPort, rotatePort, getPorts } from "@/lib/diagram/render/ports";
import { SYMBOL_SIZE } from "@/lib/diagram/render/symbols";

const HALF = SYMBOL_SIZE / 2;

function nodeBox(node: { position: { x: number; y: number } }): {
  x: number;
  y: number;
} {
  // DiagramNode usa origem CENTRADA. DXF usa canto superior-esquerdo.
  return { x: node.position.x - HALF, y: node.position.y - HALF };
}

function portWorld(
  node: { position: { x: number; y: number }; rotation?: number; params: { kind: string } },
  portId: string | undefined,
): { x: number; y: number } {
  const kind = node.params.kind as Parameters<typeof getPorts>[0];
  const port = findPort(kind, portId) ?? getPorts(kind)[0];
  if (!port) return { ...node.position };
  const local = rotatePort(port, node.rotation ?? 0);
  return { x: node.position.x + local.x, y: node.position.y + local.y };
}

export function diagramToDxf(doc: DiagramDoc, sheet: SheetKind): string {
  const nodes: DxfNode[] = [];
  const edges: DxfEdge[] = [];

  for (const n of Object.values(doc.nodes)) {
    if (n.sheet !== sheet) continue;
    const box = nodeBox(n);
    nodes.push({
      id: n.id,
      position: box,
      label: n.label || n.params.kind,
      width: SYMBOL_SIZE,
      height: SYMBOL_SIZE,
      type: n.params.kind,
    });
  }

  for (const e of Object.values(doc.edges)) {
    if (e.sheet !== sheet) continue;
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;
    edges.push({
      id: e.id,
      from: portWorld(src, e.sourcePort),
      to: portWorld(tgt, e.targetPort),
    });
  }

  return buildDxf(nodes, edges);
}

export function exportDiagramDxf(doc: DiagramDoc, sheet: SheetKind, filename: string): {
  nodes: number;
  edges: number;
} {
  const dxf = diagramToDxf(doc, sheet);
  const counts = {
    nodes: Object.values(doc.nodes).filter((n) => n.sheet === sheet).length,
    edges: Object.values(doc.edges).filter((e) => e.sheet === sheet).length,
  };
  downloadDxf(filename, dxf);
  return counts;
}
