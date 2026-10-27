// Adapter DiagramDoc → SVG Vetorial Industrial.
// Gera SVG padronizado em conformidade com IEC 60617 para visualização e documentação.
import type { DiagramDoc, SheetKind } from "@/lib/diagram/schema";
import { findPort, rotatePort, getPorts } from "@/lib/diagram/render/ports";
import { SYMBOL_SIZE } from "@/lib/diagram/render/symbols";

const HALF = SYMBOL_SIZE / 2;

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

export function diagramToSvg(doc: DiagramDoc, sheet: SheetKind): string {
  const sheetNodes = Object.values(doc.nodes).filter((n) => n.sheet === sheet);
  const sheetEdges = Object.values(doc.edges).filter((e) => e.sheet === sheet);

  if (sheetNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <rect width="800" height="600" fill="#0b0f17"/>
      <text x="400" y="300" fill="#94a3b8" text-anchor="middle" font-family="monospace" font-size="16">
        Diagrama Vazio (${sheet})
      </text>
    </svg>`;
  }

  // Calcular limites (bounding box)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of sheetNodes) {
    minX = Math.min(minX, n.position.x - HALF - 40);
    maxX = Math.max(maxX, n.position.x + HALF + 40);
    minY = Math.min(minY, n.position.y - HALF - 40);
    maxY = Math.max(maxY, n.position.y + HALF + 40);
  }

  const margin = 60;
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin + 80; // espaço para selo de engenharia

  const width = Math.max(800, maxX - minX);
  const height = Math.max(600, maxY - minY);

  const title = doc.metadata.title || "MCC-01_REFORCO";
  const dateStr = new Date().toLocaleDateString("pt-BR");

  const norms = (doc.metadata.norms ?? ["NBR 5410", "IEC 60617"]).join(" · ");

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.8" fill="#1e293b"/>
    </pattern>
  </defs>

  <!-- Fundo industrial escuro com grid -->
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#0b0f17"/>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)"/>

  <!-- Moldura de engenharia -->
  <rect x="${minX + 15}" y="${minY + 15}" width="${width - 30}" height="${height - 30}" fill="none" stroke="#334155" stroke-width="1.5"/>

  <!-- Ligações (Edges) -->
  <g id="edges">`;

  for (const e of sheetEdges) {
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;

    const p1 = portWorld(src, e.sourcePort);
    const p2 = portWorld(tgt, e.targetPort);

    const isSignal = e.kind === "signal";
    const strokeColor = isSignal ? "#f97316" : "#f8fafc";
    const strokeWidth = isSignal ? "1.5" : "2";
    const strokeDash = isSignal ? 'stroke-dasharray="4,4"' : "";

    // Traçado ortogonal
    const midY = (p1.y + p2.y) / 2;
    const pathD = `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;

    svg += `
    <path d="${pathD}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" ${strokeDash}/>
    <circle cx="${p1.x}" cy="${p1.y}" r="3" fill="${strokeColor}"/>
    <circle cx="${p2.x}" cy="${p2.y}" r="3" fill="${strokeColor}"/>`;

    if (isSignal) {
      // Ponto de derivação de sinal
      svg += `<circle cx="${p1.x}" cy="${midY}" r="3.5" fill="#f97316"/>`;
    }
  }

  svg += `
  </g>

  <!-- Componentes (Nodes) -->
  <g id="nodes">`;

  for (const n of sheetNodes) {
    const tag = (n.params as any).tag || n.label || n.id;
    const isBusbar = n.params.kind === "busbar";
    const isSelected = false;

    if (isBusbar) {
      // Barra trifásica horizontal espessa
      const barLen = (n.params as any).length_px ?? 400;
      svg += `
      <g transform="translate(${n.position.x}, ${n.position.y})">
        <line x1="${-barLen / 2}" y1="0" x2="${barLen / 2}" y2="0" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/>
        <text x="0" y="-12" fill="#38bdf8" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">
          ${tag} · 380V / 630A
        </text>
      </g>`;
      continue;
    }

    svg += `
    <g transform="translate(${n.position.x}, ${n.position.y})">
      <!-- Caixa do símbolo -->
      <rect x="${-HALF}" y="${-HALF}" width="${SYMBOL_SIZE}" height="${SYMBOL_SIZE}" rx="4" fill="#131b2c" stroke="#334155" stroke-width="1.5"/>
      <text x="0" y="4" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle">
        ${n.params.kind.slice(0, 4).toUpperCase()}
      </text>
      <!-- Tag do componente -->
      <text x="0" y="${-HALF - 8}" fill="#f8fafc" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
        ${tag}
      </text>
    </g>`;
  }

  svg += `
  </g>

  <!-- Selo de Engenharia (Title Block) -->
  <g transform="translate(${maxX - 340}, ${maxY - 110})">
    <rect width="320" height="90" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" rx="2"/>
    <text x="12" y="22" fill="#38bdf8" font-family="sans-serif" font-size="13" font-weight="bold">⚡ ElétricAi · CAD Elétrico</text>
    <text x="12" y="42" fill="#f8fafc" font-family="monospace" font-size="11">PROJETO: ${title}</text>
    <text x="12" y="60" fill="#94a3b8" font-family="monospace" font-size="10">FOLHA: ${sheet === "unifilar" ? "01/03 (Unifilar)" : "02/03 (Multifilar)"} · DATA: ${dateStr}</text>
    <text x="12" y="76" fill="#64748b" font-family="monospace" font-size="9">NORMAS: ${norms}</text>
  </g>
</svg>`;

  return svg;
}

export function exportDiagramSvg(doc: DiagramDoc, sheet: SheetKind, filename: string): void {
  const svg = diagramToSvg(doc, sheet);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
