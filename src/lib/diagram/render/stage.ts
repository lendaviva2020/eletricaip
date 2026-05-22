// DiagramStage — encapsula a Application Pixi + Viewport e faz diff incremental
// entre o doc atual e o scene graph. Sem React por nó: a UI de topo apenas
// chama `sync(doc, sheet)` quando o store muda.
import { Application, Container, Graphics, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { DiagramDoc, DiagramEdge, DiagramNode, SheetKind } from "../schema";
import { drawSymbol } from "./symbols";

const NODE_LAYER = "nodes";
const EDGE_LAYER = "edges";

interface NodeView {
  container: Container;
  symbol: Graphics;
  label: Text;
  kind: string;
}

interface EdgeView {
  graphics: Graphics;
  hash: string;
}

export type StageEvents = {
  onSelectNode?: (id: string | null, ev?: PointerEvent) => void;
  onMoveNode?: (id: string, from: { x: number; y: number }, to: { x: number; y: number }) => void;
};

export class DiagramStage {
  app: Application;
  viewport!: Viewport;
  private nodesLayer = new Container();
  private edgesLayer = new Container();
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private events: StageEvents = {};
  private selectedId: string | null = null;
  private resizeObs?: ResizeObserver;
  private host?: HTMLElement;

  constructor() {
    this.app = new Application();
  }

  async init(host: HTMLElement, events: StageEvents = {}) {
    this.host = host;
    this.events = events;
    await this.app.init({
      background: 0x0b0f17,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: host.clientWidth,
      screenHeight: host.clientHeight,
      worldWidth: 4000,
      worldHeight: 4000,
      events: this.app.renderer.events,
    });
    this.viewport.drag().pinch().wheel().decelerate().clampZoom({ minScale: 0.2, maxScale: 4 });
    this.app.stage.addChild(this.viewport);
    this.edgesLayer.label = EDGE_LAYER;
    this.nodesLayer.label = NODE_LAYER;
    this.viewport.addChild(this.edgesLayer);
    this.viewport.addChild(this.nodesLayer);

    // grid leve
    this.drawGrid();

    // background click → desseleciona
    this.viewport.eventMode = "static";
    this.viewport.on("pointertap", (e) => {
      if (e.target === this.viewport) {
        this.events.onSelectNode?.(null);
        this.setSelected(null);
      }
    });

    // mantém viewport sincronizado a resize
    this.resizeObs = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w && h) this.viewport.resize(w, h, 4000, 4000);
    });
    this.resizeObs.observe(host);
  }

  destroy() {
    this.resizeObs?.disconnect();
    if (this.host && this.app.canvas.parentElement === this.host) {
      this.host.removeChild(this.app.canvas);
    }
    this.app.destroy(true, { children: true });
    this.nodes.clear();
    this.edges.clear();
  }

  private drawGrid() {
    const grid = new Graphics();
    const step = 50;
    for (let x = 0; x <= 4000; x += step) grid.moveTo(x, 0).lineTo(x, 4000);
    for (let y = 0; y <= 4000; y += step) grid.moveTo(0, y).lineTo(4000, y);
    grid.stroke({ width: 1, color: 0x1f2937, alpha: 0.4 });
    this.viewport.addChildAt(grid, 0);
  }

  fitView() {
    this.viewport.fit();
    this.viewport.moveCenter(2000, 2000);
  }

  setSelected(id: string | null) {
    if (this.selectedId && this.nodes.has(this.selectedId)) {
      this.nodes.get(this.selectedId)!.container.alpha = 1;
    }
    this.selectedId = id;
    if (id && this.nodes.has(id)) {
      this.nodes.get(id)!.container.alpha = 0.85;
    }
  }

  // diff incremental do scene graph contra o doc.
  sync(doc: DiagramDoc, sheet: SheetKind, selectedIds: string[] = []) {
    const wantNodes = Object.values(doc.nodes).filter((n) => n.sheet === sheet);
    const wantEdges = Object.values(doc.edges).filter((e) => e.sheet === sheet);
    const wantNodeIds = new Set(wantNodes.map((n) => n.id));
    const wantEdgeIds = new Set(wantEdges.map((e) => e.id));

    // remover sumiços
    for (const [id, v] of this.nodes) {
      if (!wantNodeIds.has(id)) {
        v.container.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
    for (const [id, v] of this.edges) {
      if (!wantEdgeIds.has(id)) {
        v.graphics.destroy();
        this.edges.delete(id);
      }
    }

    // upsert nós
    for (const n of wantNodes) this.upsertNode(n);

    // upsert edges (depois dos nós para poder ler posições)
    for (const e of wantEdges) this.upsertEdge(e, doc);

    // seleção
    this.setSelected(selectedIds[0] ?? null);
  }

  private upsertNode(n: DiagramNode) {
    let view = this.nodes.get(n.id);
    if (!view || view.kind !== n.params.kind) {
      if (view) view.container.destroy({ children: true });
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      const symbol = drawSymbol(n.params.kind);
      const label = new Text({
        text: n.label || n.params.kind,
        style: { fill: 0xcbd5e1, fontSize: 10, fontFamily: "system-ui, sans-serif" },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 22);
      container.addChild(symbol);
      container.addChild(label);
      this.nodesLayer.addChild(container);
      this.attachDrag(container, n.id);
      view = { container, symbol, label, kind: n.params.kind };
      this.nodes.set(n.id, view);
    } else {
      view.label.text = n.label || n.params.kind;
    }
    view.container.position.set(n.position.x, n.position.y);
    view.container.rotation = (n.rotation || 0) * (Math.PI / 180);
  }

  private attachDrag(container: Container, id: string) {
    let dragging = false;
    let start: { x: number; y: number } | null = null;
    let origin: { x: number; y: number } | null = null;
    let moved = false;

    container.on("pointerdown", (e) => {
      e.stopPropagation();
      dragging = true;
      moved = false;
      const p = this.viewport.toWorld(e.global);
      start = { x: p.x, y: p.y };
      origin = { x: container.x, y: container.y };
      this.viewport.plugins.pause("drag");
    });
    const onMove = (e: PointerEvent) => {
      if (!dragging || !start || !origin) return;
      const p = this.viewport.toWorld({ x: e.clientX, y: e.clientY });
      const nx = origin.x + (p.x - start.x);
      const ny = origin.y + (p.y - start.y);
      container.position.set(nx, ny);
      moved = true;
      this.refreshEdgesFor(id);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      this.viewport.plugins.resume("drag");
      if (moved && origin) {
        this.events.onMoveNode?.(id, origin, { x: container.x, y: container.y });
      } else {
        this.events.onSelectNode?.(id);
        this.setSelected(id);
      }
      start = origin = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    container.on("pointerdown", () => {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  private refreshEdgesFor(nodeId: string) {
    for (const [id, v] of this.edges) {
      if (v.hash.includes(nodeId)) {
        v.graphics.destroy();
        this.edges.delete(id);
      }
    }
  }

  private upsertEdge(e: DiagramEdge, doc: DiagramDoc) {
    const src = this.nodes.get(e.source);
    const tgt = this.nodes.get(e.target);
    if (!src || !tgt) return;
    const sx = src.container.x;
    const sy = src.container.y;
    const tx = tgt.container.x;
    const ty = tgt.container.y;
    const hash = `${e.source}:${sx},${sy}->${e.target}:${tx},${ty}:${e.kind}`;
    const existing = this.edges.get(e.id);
    if (existing && existing.hash === hash) return;
    if (existing) existing.graphics.destroy();
    const color = e.kind === "power" ? 0x60a5fa : e.kind === "signal" ? 0xa78bfa : e.kind === "ground" ? 0x10b981 : 0x94a3b8;
    const g = new Graphics();
    const midX = (sx + tx) / 2;
    g.moveTo(sx, sy).lineTo(midX, sy).lineTo(midX, ty).lineTo(tx, ty);
    g.stroke({ width: 1.5, color });
    this.edgesLayer.addChild(g);
    this.edges.set(e.id, { graphics: g, hash });
  }
}
