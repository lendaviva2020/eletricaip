// Adapter DiagramDoc → SVG Vetorial Industrial.
// Gera SVG padronizado em conformidade com IEC 60617 para visualização e documentação.
import type { DiagramDoc, SheetKind } from "@/lib/diagram/schema";
import { findPort, rotatePort, getPorts } from "@/lib/diagram/render/ports";
import { SYMBOL_SIZE } from "@/lib/diagram/render/symbols";
import {
  DEFAULT_PAGE_ID,
  TITLE_BLOCK_COLS,
  TITLE_BLOCK_ROWS,
  docForPage,
  drawingSetupOf,
  frameForPage,
  groupPageReferences,
  pageReferences,
  titleBlockCells,
  zoneMarks,
  type DrawingFrame,
} from "@/lib/diagram/pages";

const HALF = SYMBOL_SIZE / 2;

/** Texto vindo do projeto (tags, título) nunca entra cru no SVG. */
export function escapeSvgText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/** Moldura, zonas e carimbo da folha em SVG (todo texto escapado). */
function frameSvg(frame: DrawingFrame, doc: DiagramDoc, sheet: SheetKind, pageId: string): string {
  const band = 20;
  const zx = frame.inner.x + band;
  const zy = frame.inner.y + band;
  const zw = frame.inner.width - 2 * band;
  const zh = frame.inner.height - 2 * band;
  let out = `
  <g id="frame" fill="none" stroke="#64748b">
    <rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" stroke-width="1" stroke-opacity="0.5"/>
    <rect x="${frame.inner.x}" y="${frame.inner.y}" width="${frame.inner.width}" height="${frame.inner.height}" stroke-width="2.5"/>
    <rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" stroke-width="1"/>`;
  for (let c = 1; c < frame.columns; c++) {
    const x = zx + (c * zw) / frame.columns;
    out += `<line x1="${x}" y1="${frame.inner.y}" x2="${x}" y2="${zy}"/><line x1="${x}" y1="${zy + zh}" x2="${x}" y2="${frame.inner.y + frame.inner.height}"/>`;
  }
  for (let r = 1; r < frame.rows; r++) {
    const y = zy + (r * zh) / frame.rows;
    out += `<line x1="${frame.inner.x}" y1="${y}" x2="${zx}" y2="${y}"/><line x1="${zx + zw}" y1="${y}" x2="${frame.inner.x + frame.inner.width}" y2="${y}"/>`;
  }
  out += `</g>
  <g id="zones" fill="#94a3b8" font-family="monospace" font-size="11" text-anchor="middle" dominant-baseline="middle">`;
  for (const m of zoneMarks(frame)) {
    out += `<text x="${m.x}" y="${m.y}">${escapeSvgText(m.label)}</text>`;
  }
  const tb = frame.titleBlock;
  const cw = tb.width / TITLE_BLOCK_COLS;
  const rh = tb.height / TITLE_BLOCK_ROWS;
  out += `</g>
  <g id="title-block">
    <rect x="${tb.x}" y="${tb.y}" width="${tb.width}" height="${tb.height}" fill="#0b1220" stroke="#64748b" stroke-width="2"/>`;
  for (const cell of titleBlockCells(doc, sheet, pageId)) {
    const x = tb.x + cell.col * cw;
    const y = tb.y + cell.row * rh;
    out += `
    <rect x="${x}" y="${y}" width="${cell.span * cw}" height="${rh}" fill="none" stroke="#64748b"/>
    <text x="${x + 6}" y="${y + 12}" fill="#94a3b8" font-family="sans-serif" font-size="8">${escapeSvgText(cell.label.toUpperCase())}</text>
    <text x="${x + 6}" y="${y + 30}" fill="#e2e8f0" font-family="sans-serif" font-size="${cell.emphasis ? 13 : 11}"${cell.emphasis ? ' font-weight="bold"' : ""}>${escapeSvgText(cell.value)}</text>`;
  }
  out += `
  </g>`;
  return out;
}

/**
 * SVG de uma folha do diagrama. Com moldura ligada, a folha inteira (zonas e
 * carimbo NBR 10582); sem moldura, recorte justo do conteúdo.
 */
export function diagramToSvg(
  fullDoc: DiagramDoc,
  sheet: SheetKind,
  pageId: string = DEFAULT_PAGE_ID,
): string {
  const doc = docForPage(fullDoc, sheet, pageId);
  const setup = drawingSetupOf(fullDoc);
  const frame = setup.showFrame ? frameForPage(fullDoc, sheet, pageId, setup.format) : null;
  const sheetNodes = Object.values(doc.nodes).filter((n) => n.sheet === sheet);
  const sheetEdges = Object.values(doc.edges).filter((e) => e.sheet === sheet);

  if (sheetNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <rect width="800" height="600" fill="#0b0f17"/>
      <text x="400" y="300" fill="#94a3b8" text-anchor="middle" font-family="monospace" font-size="16">
        Diagrama Vazio (${escapeSvgText(sheet)})
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

  if (frame) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.width);
    maxY = Math.max(maxY, frame.y + frame.height);
  }
  const width = Math.max(800, maxX - minX);
  const height = Math.max(600, maxY - minY);

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

${frame ? frameSvg(frame, fullDoc, sheet, pageId) : ""}

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
    const params = n.params as { tag?: string; voltage_V?: number; current_A?: number };
    const tag = escapeSvgText(params.tag || n.label || n.id);
    const isBusbar = n.params.kind === "busbar";
    const isSelected = false;

    if (isBusbar) {
      // Barra trifásica horizontal espessa
      const barLen = (n.params as any).length_px ?? 400;
      svg += `
      <g transform="translate(${n.position.x}, ${n.position.y})">
        <line x1="${-barLen / 2}" y1="0" x2="${barLen / 2}" y2="0" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/>
        <text x="0" y="-12" fill="#38bdf8" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">
          ${tag}${params.voltage_V ? ` · ${params.voltage_V} V` : ""}${params.current_A ? ` / ${params.current_A} A` : ""}
        </text>
      </g>`;
      continue;
    }

    svg += `
    <g transform="translate(${n.position.x}, ${n.position.y})">
      <!-- Caixa do símbolo -->
      <rect x="${-HALF}" y="${-HALF}" width="${SYMBOL_SIZE}" height="${SYMBOL_SIZE}" rx="4" fill="#131b2c" stroke="#334155" stroke-width="1.5"/>
      <text x="0" y="4" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle">
        ${escapeSvgText(n.params.kind.slice(0, 4).toUpperCase())}
      </text>
      <!-- Tag do componente -->
      <text x="0" y="${-HALF - 8}" fill="#f8fafc" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
        ${tag}
      </text>
    </g>`;
  }

  svg += `
  </g>

  <g id="page-references" font-family="monospace" font-size="10" font-weight="bold" fill="#38bdf8">${groupPageReferences(
    pageReferences(fullDoc, sheet, pageId),
  )
    .map((r) => {
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[r.dir];
      const ex = r.x + v[0] * 18;
      const ey = r.y + v[1] * 18;
      const px = -v[1] * 5;
      const py = v[0] * 5;
      const tx = ex + v[0] * 12 + (r.dir === "left" ? -4 : 6);
      const ty = ey + v[1] * 12 + (r.dir === "up" ? -2 : r.dir === "down" ? 10 : 4);
      const anchor = r.dir === "left" ? ' text-anchor="end"' : "";
      return `<line x1="${r.x}" y1="${r.y}" x2="${ex}" y2="${ey}" stroke="#38bdf8" stroke-width="2"/><polygon points="${ex + px},${ey + py} ${ex - px},${ey - py} ${ex + v[0] * 8},${ey + v[1] * 8}"/><text x="${tx}" y="${ty}"${anchor}>${escapeSvgText(r.label)}</text>`;
    })
    .join("")}</g>
</svg>`;

  return svg;
}

export function exportDiagramSvg(
  doc: DiagramDoc,
  sheet: SheetKind,
  filename: string,
  pageId: string = DEFAULT_PAGE_ID,
): void {
  const svg = diagramToSvg(doc, sheet, pageId);
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
