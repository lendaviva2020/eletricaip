/**
 * Minimal AutoCAD DXF (R12) writer with premium CAD symbol generators.
 * Produces structured ENTITIES section with LINE + CIRCLE + TEXT in layers:
 * - COMPONENTS (electrical housings and nodes)
 * - WIRES (power, signal, or piping connection lines)
 * - LABELS (technical tags, names, and parameters)
 * - SYMBOLS (internal schematic representations like contact arms, coils, etc.)
 */

type Vec2 = { x: number; y: number };

export interface DxfNode {
  id: string;
  position: Vec2;
  label?: string;
  width?: number;
  height?: number;
  type?: string;
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

function circle(p: Vec2, r: number, layer = "COMPONENTS"): string {
  return (
    pair(0, "CIRCLE") +
    pair(8, layer) +
    pair(10, p.x.toFixed(3)) +
    pair(20, (-p.y).toFixed(3)) +
    pair(40, r.toFixed(3))
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

// Draw standard electric symbols depending on node type
function drawSymbol(n: DxfNode): string {
  const w = n.width ?? 60;
  const h = n.height ?? 30;
  const p = n.position;
  const type = (n.type ?? "").toLowerCase();

  if (type.includes("motor") || type.includes("pump") || type.includes("conveyor")) {
    // Motor symbol (Circle with an 'M')
    const r = Math.min(w, h) / 2;
    const center = { x: p.x + w / 2, y: p.y + h / 2 };
    return (
      circle(center, r, "COMPONENTS") +
      text({ x: center.x - 3, y: center.y + 3 }, "M", 8, "SYMBOLS")
    );
  }

  if (type.includes("transformer") || type.includes("trafo")) {
    // Transformer symbol (Two overlapping circles)
    const r = Math.min(w, h) * 0.35;
    const center1 = { x: p.x + w * 0.35, y: p.y + h / 2 };
    const center2 = { x: p.x + w * 0.65, y: p.y + h / 2 };
    return circle(center1, r, "COMPONENTS") + circle(center2, r, "COMPONENTS");
  }

  if (type.includes("breaker") || type.includes("disjuntor")) {
    // Breaker/switch symbol (box with diagonal contact arm)
    return (
      rect(p, w, h, "COMPONENTS") +
      line(
        { x: p.x + w * 0.2, y: p.y + h * 0.8 },
        { x: p.x + w * 0.8, y: p.y + h * 0.2 },
        "SYMBOLS",
      )
    );
  }

  if (type.includes("contactor") || type.includes("contator")) {
    // Contactor symbol (box with parallel contacts)
    return (
      rect(p, w, h, "COMPONENTS") +
      line(
        { x: p.x + w * 0.3, y: p.y + h * 0.5 },
        { x: p.x + w * 0.7, y: p.y + h * 0.5 },
        "SYMBOLS",
      ) +
      line(
        { x: p.x + w * 0.5, y: p.y + h * 0.2 },
        { x: p.x + w * 0.5, y: p.y + h * 0.8 },
        "SYMBOLS",
      )
    );
  }

  // Fallback to beautiful box
  return rect(p, w, h, "COMPONENTS");
}

export function buildDxf(nodes: DxfNode[], edges: DxfEdge[]): string {
  let body = "";
  body += pair(0, "SECTION") + pair(2, "ENTITIES");

  // Draw all components and symbols
  for (const n of nodes) {
    body += drawSymbol(n);
    if (n.label) {
      body += text(
        { x: n.position.x + 4, y: n.position.y + (n.height ?? 30) + 10 },
        n.label,
        6,
        "LABELS",
      );
    }
  }

  // Draw connection wires
  for (const e of edges) {
    body += line(e.from, e.to, "WIRES");
  }

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
