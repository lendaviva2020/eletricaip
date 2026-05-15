/**
 * Minimal AutoCAD DXF (R12) writer.
 * Produces ENTITIES section with LINE + TEXT, enough for AutoCAD/QCAD/LibreCAD
 * to open the unifilar with positions preserved. Not a full DXF spec impl.
 */

type Vec2 = { x: number; y: number };

export interface DxfNode {
  id: string;
  position: Vec2;
  label?: string;
  width?: number;
  height?: number;
}
export interface DxfEdge {
  id: string;
  from: Vec2;
  to: Vec2;
}

function pair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function line(p1: Vec2, p2: Vec2, layer = "WIRES"): string {
  return (
    pair(0, "LINE") +
    pair(8, layer) +
    pair(10, p1.x.toFixed(3)) +
    pair(20, (-p1.y).toFixed(3)) +
    pair(11, p2.x.toFixed(3)) +
    pair(21, (-p2.y).toFixed(3))
  );
}

function rect(p: Vec2, w: number, h: number, layer = "COMPONENTS"): string {
  const a = p;
  const b = { x: p.x + w, y: p.y };
  const c = { x: p.x + w, y: p.y + h };
  const d = { x: p.x, y: p.y + h };
  return line(a, b, layer) + line(b, c, layer) + line(c, d, layer) + line(d, a, layer);
}

function text(p: Vec2, value: string, height = 8, layer = "LABELS"): string {
  return (
    pair(0, "TEXT") +
    pair(8, layer) +
    pair(10, p.x.toFixed(3)) +
    pair(20, (-p.y).toFixed(3)) +
    pair(40, height.toFixed(2)) +
    pair(1, value.replace(/\n/g, " ").slice(0, 80))
  );
}

export function buildDxf(nodes: DxfNode[], edges: DxfEdge[]): string {
  let body = "";
  body += pair(0, "SECTION") + pair(2, "ENTITIES");
  for (const n of nodes) {
    const w = n.width ?? 60;
    const h = n.height ?? 30;
    body += rect(n.position, w, h);
    if (n.label) body += text({ x: n.position.x + 4, y: n.position.y + 6 }, n.label);
  }
  for (const e of edges) body += line(e.from, e.to);
  body += pair(0, "ENDSEC") + pair(0, "EOF");
  return body;
}

export function downloadDxf(filename: string, dxf: string) {
  const blob = new Blob([dxf], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".dxf") ? filename : `${filename}.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}
