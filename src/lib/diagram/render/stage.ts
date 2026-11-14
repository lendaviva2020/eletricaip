// DiagramStage — encapsula Application Pixi + Viewport e faz diff incremental
// entre o doc atual e o scene graph. Sem React por nó: a UI de topo apenas
// chama `sync(doc, sheet, selectedNodeIds, selectedEdgeIds, energization)` quando o store muda.
//
// Recursos: portas/handles, edge-draft com preview ortogonal, marquee
// (Shift+drag), snap-to-grid no commit, context menu, multi-select drag,
// seleção e exclusão de condutores/arestas, simulação elétrica com
// coloração por estado real (energizado, desenergizado, falha) e fundo cinza técnico.

import { Application, Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { DiagramDoc, DiagramEdge, DiagramNode, EdgeKind, Position, SheetKind } from "../schema";
import { drawSymbol } from "./symbols";
import { CONDUCTOR_LABELS } from "../multifilar";
import { getPorts, resolveVisualPort, rotatePort, type PortDef } from "./ports";
import {
  computeDiagramBounds,
  computeEdgeAnnotations,
  computeNodeBoundingBox,
  createPolylineHitArea,
  routeOrthogonalEdge,
  simplifyOrthogonalPoints,
  type BoundingBox,
  type CrossingPoint,
  type DiagramBounds,
  type Point,
} from "./wire-router";
import type { CircuitEnergizationState } from "../electrical-simulation";
import { isSwitchingDevice } from "../electrical-simulation";

const PORT_HIT_RADIUS = 7;
const PORT_COLOR = 0x60a5fa;
const PORT_COLOR_HOVER = 0xfbbf24;

interface SegmentDragState {
  pointerId: number;
  edgeId: string;
  segIndex: number;
  orientation: "H" | "V";
  basePoints: Point[];
  startWorld: Point;
  currentPoints: Point[];
  moved: boolean;
}

export interface MoveDelta {
  nodeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface EdgeDraftCommit {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  kind: EdgeKind;
}

export interface StageEvents {
  onSelectNode?: (id: string | null, ev?: { shiftKey: boolean }) => void;
  onSelectEdge?: (id: string | null, ev?: { shiftKey: boolean }) => void;
  onSelectMany?: (ids: string[], additive: boolean) => void;
  onMoveNodes?: (deltas: MoveDelta[]) => void;
  onCommitEdge?: (edge: EdgeDraftCommit) => void;
  onUpdateEdgeWaypoints?: (edgeId: string, waypoints: Position[]) => void;
  onZoomChange?: (zoomPercent: number) => void;
  onContextMenu?: (target: {
    nodeId: string | null;
    edgeId?: string | null;
    clientX: number;
    clientY: number;
  }) => void;
  onToggleDevice?: (nodeId: string) => void;
  /** Aplica snap-to-grid no commit do drag. */
  snap?: (v: number) => number;
}

interface NodeView {
  container: Container;
  symbol: Graphics;
  label: Text;
  selection: Graphics;
  deviceStatusBadge?: Graphics;
  portsLayer: Container;
  portGraphics: Map<string, Graphics>;
  kind: string;
}

interface EdgeView {
  /** Graphics para linha única; Container com N Graphics+Text no multifilar. */
  graphics: Container;
  hash: string;
}

interface DragState {
  pointerId: number;
  origins: Map<string, { x: number; y: number }>;
  start: { x: number; y: number };
  moved: boolean;
  primary: string;
}

interface EdgeDraft {
  pointerId: number;
  source: string;
  sourcePort: PortDef;
  preview: Graphics;
  hoverTarget: { nodeId: string; port: PortDef } | null;
}

interface MarqueeState {
  pointerId: number;
  start: { x: number; y: number };
  rect: Graphics;
  additive: boolean;
}

export class DiagramStage {
  app: Application;
  viewport!: Viewport;
  private nodesLayer = new Container();
  private edgesLayer = new Container();
  private junctionsLayer = new Graphics();
  private overlayLayer = new Container();
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private events: StageEvents = {};
  private selectedNodeIds = new Set<string>();
  private selectedEdgeIds = new Set<string>();
  private lastEnergization: CircuitEnergizationState | null = null;
  private lastDoc: DiagramDoc | null = null;
  private lastSheet: SheetKind = "unifilar";
  private zoomHistory: Array<{ scale: number; centerX: number; centerY: number }> = [];

  private resizeObs?: ResizeObserver;
  private host?: HTMLElement;
  private wheelListener?: (e: WheelEvent) => void;
  private initialized = false;
  private destroyed = false;

  private drag: DragState | null = null;
  private segmentDrag: SegmentDragState | null = null;
  private draft: EdgeDraft | null = null;
  private marquee: MarqueeState | null = null;

  constructor() {
    this.app = new Application();
  }

  async init(host: HTMLElement, events: StageEvents = {}) {
    this.host = host;
    this.events = events;

    // Fundo cinza técnico claro (#F0F2F3) conforme norma e preferência industrial.
    // Resolução técnica para alta nitidez: mínimo 2x no framebuffer para sub-pixels nítidos.
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetResolution = Math.max(dpr, 2);

    await this.app.init({
      background: 0xf0f2f3,
      antialias: true,
      resolution: targetResolution,
      autoDensity: true,
      resizeTo: host,
    });

    // Se o componente desmontou enquanto app.init aguardava resolução assíncrona (StrictMode / HMR),
    // descarta imediatamente a instância Pixi sem anexar um canvas órfão no DOM.
    if (this.destroyed) {
      try {
        this.app.destroy(true, { children: true });
      } catch {
        // Ignora erro caso o renderer tenha sido parcialmente destruído
      }
      return;
    }

    // Garante que apenas um único <canvas> exista dentro do host
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
    this.app.canvas.style.display = "block";
    this.app.canvas.style.width = "100%";
    this.app.canvas.style.height = "100%";
    host.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: host.clientWidth || 800,
      screenHeight: host.clientHeight || 600,
      worldWidth: 20000,
      worldHeight: 20000,
      events: this.app.renderer.events,
    });

    // Limites amplos de zoom com trava contra escala zero / NaN
    this.viewport.drag().pinch().wheel().decelerate().clampZoom({ minScale: 0.1, maxScale: 4.0 });
    this.viewport.on("zoomed", () => {
      this.events.onZoomChange?.(this.getZoomPercent());
    });
    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.edgesLayer);
    this.viewport.addChild(this.junctionsLayer);
    this.viewport.addChild(this.nodesLayer);
    this.viewport.addChild(this.overlayLayer);

    this.drawGrid();

    this.viewport.eventMode = "static";
    this.viewport.cursor = "grab";

    this.viewport.on("pointerdown", (e) => this.onViewportPointerDown(e));
    this.viewport.on("pointermove", (e) => this.onPointerMove(e));
    this.viewport.on("pointerup", (e) => this.onPointerUp(e));
    this.viewport.on("pointerupoutside", (e) => this.onPointerUp(e));
    this.viewport.on("rightclick", (e) => {
      const native = e.nativeEvent as PointerEvent;
      native?.preventDefault?.();
      this.events.onContextMenu?.({
        nodeId: null,
        edgeId: null,
        clientX: native?.clientX ?? 0,
        clientY: native?.clientY ?? 0,
      });
    });

    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.wheelListener = (e: WheelEvent) => {
      e.preventDefault();
    };
    this.app.canvas.addEventListener("wheel", this.wheelListener, { passive: false });

    this.resizeObs = new ResizeObserver(() => {
      if (this.destroyed || !this.viewport) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w && h) this.viewport.resize(w, h, 20000, 20000);
    });
    this.resizeObs.observe(host);

    this.initialized = true;
  }

  destroy() {
    this.destroyed = true;
    this.initialized = false;
    this.resizeObs?.disconnect();
    if (this.wheelListener && this.app.renderer && this.app.canvas) {
      this.app.canvas.removeEventListener("wheel", this.wheelListener);
    }
    if (this.app.renderer) {
      if (this.host && this.app.canvas?.parentElement === this.host) {
        this.host.removeChild(this.app.canvas);
      }
      try {
        this.app.destroy(true, { children: true });
      } catch {
        // Ignora erro de destruição duplicada
      }
    }
    this.nodes.clear();
    this.edges.clear();
  }

  /**
   * Grade técnica profissional com passo duplo:
   * - Grade secundária discreta: #E1E5E9 (passo 25)
   * - Grade principal com maior contraste: #CBD3DA (passo 100)
   */
  private drawGrid() {
    const grid = new Graphics();
    const min = -2000;
    const max = 6000;

    // Grade secundária (25px)
    for (let x = min; x <= max; x += 25) {
      if (x % 100 !== 0) {
        grid.moveTo(x, min).lineTo(x, max);
      }
    }
    for (let y = min; y <= max; y += 25) {
      if (y % 100 !== 0) {
        grid.moveTo(min, y).lineTo(max, y);
      }
    }
    grid.stroke({ width: 0.8, color: 0xe1e5e9, alpha: 0.9 });

    // Grade principal (100px)
    for (let x = min; x <= max; x += 100) {
      grid.moveTo(x, min).lineTo(x, max);
    }
    for (let y = min; y <= max; y += 100) {
      grid.moveTo(min, y).lineTo(max, y);
    }
    grid.stroke({ width: 1.2, color: 0xcbd3da, alpha: 1.0 });

    this.viewport.addChildAt(grid, 0);
  }

  private pushZoomSnapshot() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    const center = this.viewport.center;
    const snap = { scale: this.viewport.scaled, centerX: center.x, centerY: center.y };
    const top = this.zoomHistory[this.zoomHistory.length - 1];
    if (
      top &&
      Math.abs(top.scale - snap.scale) < 0.01 &&
      Math.abs(top.centerX - snap.centerX) < 5 &&
      Math.abs(top.centerY - snap.centerY) < 5
    ) {
      return;
    }
    this.zoomHistory.push(snap);
    if (this.zoomHistory.length > 15) this.zoomHistory.shift();
  }

  getContentBounds(nodes?: DiagramNode[]): DiagramBounds | null {
    const currentNodes =
      nodes ??
      (this.lastDoc
        ? Object.values(this.lastDoc.nodes).filter((n) => n.sheet === this.lastSheet)
        : []);
    const currentEdges = this.lastDoc
      ? Object.values(this.lastDoc.edges).filter((e) => e.sheet === this.lastSheet)
      : [];
    return computeDiagramBounds(currentNodes, currentEdges);
  }

  /**
   * Enquadramento inteligente baseado na caixa envolvente real dos símbolos,
   * rótulos e rotas de condutores. Nunca infla o viewport por palco fixo gigante
   * nem altera coordenadas persistidas.
   */
  fitView(nodes?: DiagramNode[], opts?: { recordHistory?: boolean; screenPaddingPx?: number }) {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    if (opts?.recordHistory !== false) this.pushZoomSnapshot();

    const targetNodes =
      nodes ??
      (this.lastDoc
        ? Object.values(this.lastDoc.nodes).filter((n) => n.sheet === this.lastSheet)
        : []);
    const nodeIds = new Set(targetNodes.map((n) => n.id));
    const targetEdges = this.lastDoc
      ? Object.values(this.lastDoc.edges).filter(
          (e) =>
            e.sheet === this.lastSheet &&
            (nodes ? nodeIds.has(e.source) && nodeIds.has(e.target) : true),
        )
      : [];

    const bounds = computeDiagramBounds(targetNodes, targetEdges);
    if (!bounds) {
      this.viewport.setZoom(1, true);
      this.viewport.moveCenter(400, 300);
      this.events.onZoomChange?.(this.getZoomPercent());
      return;
    }

    const screenW = Math.max(240, this.viewport.screenWidth || 800);
    const screenH = Math.max(200, this.viewport.screenHeight || 600);
    const padPx = opts?.screenPaddingPx ?? Math.min(72, Math.round(Math.min(screenW, screenH) * 0.1));
    const availW = Math.max(120, screenW - padPx * 2);
    const availH = Math.max(120, screenH - padPx * 2);

    const worldPad = 40;
    const contentW = Math.max(120, bounds.width + worldPad * 2);
    const contentH = Math.max(100, bounds.height + worldPad * 2);

    let scale = Math.min(availW / contentW, availH / contentH);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    // Permite diagramas grandes reduzirem o suficiente para caberem inteiros e pequenos crescerem até 1.5x
    scale = Math.max(0.12, Math.min(scale, 1.5));

    this.viewport.setZoom(scale, true);
    this.viewport.moveCenter(bounds.centerX, bounds.centerY);
    this.events.onZoomChange?.(this.getZoomPercent());
  }

  fitSelection() {
    if (!this.lastDoc || this.selectedNodeIds.size === 0) return;
    const selected = Array.from(this.selectedNodeIds)
      .map((id) => this.lastDoc?.nodes[id])
      .filter((n): n is DiagramNode => Boolean(n && n.sheet === this.lastSheet));
    if (selected.length > 0) this.fitView(selected);
  }

  fitNetwork(seedNodeId?: string) {
    if (!this.lastDoc) return;
    const seed = seedNodeId ?? Array.from(this.selectedNodeIds)[0];
    if (!seed || !this.lastDoc.nodes[seed]) {
      this.fitView();
      return;
    }
    const visited = new Set<string>([seed]);
    const queue = [seed];
    const sheetEdges = Object.values(this.lastDoc.edges).filter((e) => e.sheet === this.lastSheet);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of sheetEdges) {
        if (e.source === cur && !visited.has(e.target)) {
          visited.add(e.target);
          queue.push(e.target);
        } else if (e.target === cur && !visited.has(e.source)) {
          visited.add(e.source);
          queue.push(e.source);
        }
      }
    }
    const netNodes = Array.from(visited)
      .map((id) => this.lastDoc?.nodes[id])
      .filter((n): n is DiagramNode => Boolean(n && n.sheet === this.lastSheet));
    if (netNodes.length > 0) this.fitView(netNodes);
  }

  centerView() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    this.pushZoomSnapshot();
    const bounds = this.getContentBounds();
    if (!bounds) {
      this.viewport.moveCenter(400, 300);
      return;
    }
    this.viewport.moveCenter(bounds.centerX, bounds.centerY);
  }

  zoomIn() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    this.pushZoomSnapshot();
    const cur = this.viewport.scaled;
    this.viewport.setZoom(Math.min(cur * 1.18, 4.0), true);
    this.events.onZoomChange?.(this.getZoomPercent());
  }

  zoomOut() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    this.pushZoomSnapshot();
    const cur = this.viewport.scaled;
    this.viewport.setZoom(Math.max(cur / 1.18, 0.1), true);
    this.events.onZoomChange?.(this.getZoomPercent());
  }

  zoomTo(scaleFactor: number) {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return;
    this.pushZoomSnapshot();
    this.viewport.setZoom(Math.max(0.1, Math.min(scaleFactor, 4.0)), true);
    this.events.onZoomChange?.(this.getZoomPercent());
  }

  resetZoom() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    this.pushZoomSnapshot();
    this.viewport.setZoom(1.0, true);
    this.events.onZoomChange?.(this.getZoomPercent());
  }

  previousZoom() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    const prev = this.zoomHistory.pop();
    if (!prev) return;
    this.viewport.setZoom(prev.scale, true);
    this.viewport.moveCenter(prev.centerX, prev.centerY);
    this.events.onZoomChange?.(this.getZoomPercent());
  }

  getZoomPercent(): number {
    if (this.destroyed || !this.initialized || !this.viewport) return 100;
    return Math.round(this.viewport.scaled * 100);
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.app.renderer || this.destroyed || !this.initialized || !this.viewport) {
      return { x: 2000, y: 2000 };
    }
    return this.viewport.toWorld(clientX, clientY);
  }

  /** Diff incremental do scene graph contra o doc. */
  sync(
    doc: DiagramDoc,
    sheet: SheetKind,
    selectedNodeIds: string[] = [],
    selectedEdgeIds: string[] = [],
    energization?: CircuitEnergizationState | null,
  ) {
    this.lastDoc = doc;
    this.lastSheet = sheet;
    this.lastEnergization = energization ?? null;
    this.selectedNodeIds = new Set(selectedNodeIds);
    this.selectedEdgeIds = new Set(selectedEdgeIds);

    if (this.destroyed || !this.initialized) return;

    const wantNodes = Object.values(doc.nodes).filter((n) => n.sheet === sheet);
    const wantEdges = Object.values(doc.edges).filter((e) => e.sheet === sheet);
    const wantNodeIds = new Set(wantNodes.map((n) => n.id));
    const wantEdgeIds = new Set(wantEdges.map((e) => e.id));

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

    for (const n of wantNodes) this.upsertNode(n, energization);
    this.renderSheetEdges(wantNodes, wantEdges, doc, energization);

    for (const [id, v] of this.nodes) this.applySelectionTo(id, v);
  }

  // ============== nodes ==============

  private upsertNode(n: DiagramNode, energization?: CircuitEnergizationState | null) {
    let view = this.nodes.get(n.id);
    const isDevice = isSwitchingDevice(n.params.kind);
    const isOpen = energization?.openDeviceIds.has(n.id) ?? false;

    if (!view || view.kind !== n.params.kind) {
      if (view) view.container.destroy({ children: true });
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "grab";

      // Caixa de impacto transparente preenchida para garantir que cliques no interior
      // vazado dos símbolos vetoriais sempre selecionem e arrastem o componente.
      const hitW = n.params.kind === "busbar" ? 64 : 28;
      const hitH = n.params.kind === "busbar" ? 12 : 24;
      const hitBox = new Graphics();
      hitBox.rect(-hitW, -hitH, hitW * 2, hitH * 2).fill({ color: 0xffffff, alpha: 0.001 });

      const selection = new Graphics();
      const symbol = drawSymbol(n.params.kind);
      const label = new Text({
        text: n.label || n.params.kind,
        style: {
          fill: 0x0f172a,
          fontSize: 11.5,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: "600",
        },
        resolution: 2,
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 24);

      const deviceStatusBadge = new Graphics();
      const portsLayer = new Container();

      container.addChild(hitBox);
      container.addChild(selection);
      container.addChild(symbol);
      container.addChild(deviceStatusBadge);
      container.addChild(label);
      container.addChild(portsLayer);
      this.nodesLayer.addChild(container);

      this.attachNodeEvents(container, n.id);
      view = {
        container,
        symbol,
        label,
        selection,
        deviceStatusBadge,
        portsLayer,
        portGraphics: new Map(),
        kind: n.params.kind,
      };
      this.nodes.set(n.id, view);
    }

    view.container.position.set(n.position.x, n.position.y);
    view.container.rotation = ((n.rotation ?? 0) * Math.PI) / 180;
    view.label.text = n.label || n.params.kind;

    // Indicador visual de estado de dispositivo de manobra (aberto/fechado)
    if (view.deviceStatusBadge) {
      view.deviceStatusBadge.clear();
      if (energization && energization.status !== "stopped" && isDevice) {
        if (isOpen) {
          view.deviceStatusBadge
            .rect(-16, -26, 32, 12)
            .fill({ color: 0xef4444, alpha: 0.9 })
            .stroke({ width: 1, color: 0xb91c1c });
        } else {
          view.deviceStatusBadge
            .rect(-16, -26, 32, 12)
            .fill({ color: 0x10b981, alpha: 0.9 })
            .stroke({ width: 1, color: 0x047857 });
        }
      }
    }

    this.syncPorts(n, view);
  }

  private syncPorts(node: DiagramNode, view: NodeView) {
    const ports = getPorts(node.params.kind);
    const wantPortIds = new Set(ports.map((p) => p.id));

    for (const [pid, g] of view.portGraphics) {
      if (!wantPortIds.has(pid)) {
        g.destroy();
        view.portGraphics.delete(pid);
      }
    }

    for (const port of ports) {
      let g = view.portGraphics.get(port.id);
      if (!g) {
        g = new Graphics();
        g.eventMode = "static";
        g.cursor = "crosshair";
        g.circle(0, 0, 4.5).fill({ color: PORT_COLOR }).stroke({ width: 1.2, color: 0x1e293b });
        g.hitArea = {
          contains: (x: number, y: number) => x * x + y * y <= PORT_HIT_RADIUS * PORT_HIT_RADIUS,
        };
        g.on("pointerover", () => (g!.tint = PORT_COLOR_HOVER));
        g.on("pointerout", () => (g!.tint = 0xffffff));
        g.on("pointerdown", (e: FederatedPointerEvent) => this.beginEdgeDraft(e, node.id, port));
        view.portsLayer.addChild(g);
        view.portGraphics.set(port.id, g);
      }
      g.position.set(port.x, port.y);
    }
  }

  private applySelectionTo(id: string, view: NodeView) {
    const selected = this.selectedNodeIds.has(id);
    view.selection.clear();
    if (selected) {
      const w = view.kind === "busbar" ? 66 : 32;
      const h = view.kind === "busbar" ? 14 : 26;
      // Moldura interna translúcida ciano
      view.selection.rect(-w, -h, w * 2, h * 2).stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.8 });

      // Alças de canto industriais em laranja elétrico (#F97316)
      const cLen = 7;
      view.selection
        .moveTo(-w - 2, -h + cLen)
        .lineTo(-w - 2, -h - 2)
        .lineTo(-w + cLen, -h - 2)
        .moveTo(w - cLen, -h - 2)
        .lineTo(w + 2, -h - 2)
        .lineTo(w + 2, -h + cLen)
        .moveTo(-w - 2, h - cLen)
        .lineTo(-w - 2, h + 2)
        .lineTo(-w + cLen, h + 2)
        .moveTo(w - cLen, h + 2)
        .lineTo(w + 2, h + 2)
        .lineTo(w + 2, h - cLen)
        .stroke({ width: 2.5, color: 0xf97316 });
    }
  }

  // ============== edges ==============

  private portWorld(
    node: DiagramNode,
    portId: string | undefined,
    role: "source" | "target" = "source",
    positionOverride?: Position,
  ): { x: number; y: number; side: PortDef["side"] } {
    const pos = positionOverride ?? node.position;
    const port = resolveVisualPort(node.params.kind, portId, role, node.params);
    if (!port) return { x: pos.x, y: pos.y, side: role === "source" ? "bottom" : "top" };
    const rotated = rotatePort(port, node.rotation ?? 0);
    return { x: pos.x + rotated.x, y: pos.y + rotated.y, side: port.side };
  }

  private renderSheetEdges(
    wantNodes: DiagramNode[],
    wantEdges: DiagramEdge[],
    doc: DiagramDoc,
    energization?: CircuitEnergizationState | null,
    positionOverrides?: Map<string, Position>,
  ) {
    const useObstacles = wantNodes.length <= 250 && wantEdges.length <= 300;
    const nodeBoxById = new Map<string, BoundingBox>();
    if (useObstacles) {
      for (const n of wantNodes) {
        const pos = positionOverrides?.get(n.id) ?? n.position;
        nodeBoxById.set(
          n.id,
          pos === n.position ? computeNodeBoundingBox(n) : computeNodeBoundingBox({ ...n, position: pos }),
        );
      }
    }

    const edgePlans: Array<{
      edge: DiagramEdge;
      id: string;
      source: string;
      sourcePort?: string;
      target: string;
      targetPort?: string;
      isBusbarTap: boolean;
      busbarPoint?: Point;
      points: Point[];
    }> = [];

    for (const e of wantEdges) {
      const srcNode = doc.nodes[e.source];
      const tgtNode = doc.nodes[e.target];
      if (!srcNode || !tgtNode) continue;

      const from = this.portWorld(srcNode, e.sourcePort, "source", positionOverrides?.get(e.source));
      const to = this.portWorld(tgtNode, e.targetPort, "target", positionOverrides?.get(e.target));

      const obstacles: BoundingBox[] = [];
      if (useObstacles) {
        for (const n of wantNodes) {
          if (n.id === srcNode.id || n.id === tgtNode.id) continue;
          const b = nodeBoxById.get(n.id);
          if (b) obstacles.push(b);
        }
      }

      const points = routeOrthogonalEdge({
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        srcSide: from.side,
        tgtSide: to.side,
        obstacles,
        existingWaypoints: e.waypoints,
      });

      const isSrcBus = srcNode.params.kind === "busbar";
      const isTgtBus = tgtNode.params.kind === "busbar";
      edgePlans.push({
        edge: e,
        id: e.id,
        source: e.source,
        sourcePort: e.sourcePort,
        target: e.target,
        targetPort: e.targetPort,
        isBusbarTap: isSrcBus || isTgtBus,
        busbarPoint: isSrcBus ? { x: from.x, y: from.y } : isTgtBus ? { x: to.x, y: to.y } : undefined,
        points,
      });
    }

    const { junctions, crossingsByEdge } = computeEdgeAnnotations(edgePlans);

    this.junctionsLayer.clear();
    const isSimRunning = energization && energization.status !== "stopped";
    const defaultDotColor = isSimRunning ? 0x10b981 : 0x1e293b;
    for (const j of junctions) {
      this.junctionsLayer
        .circle(j.x, j.y, 4)
        .fill({ color: defaultDotColor })
        .stroke({ width: 1, color: 0xf0f2f3 });
    }

    for (const plan of edgePlans) {
      this.upsertEdge(
        plan.edge,
        doc,
        plan.points,
        crossingsByEdge.get(plan.edge.id) ?? [],
        energization,
      );
    }
  }

  private drawOrthogonalPathWithBridges(
    g: Graphics,
    points: ReadonlyArray<Point>,
    crossings: ReadonlyArray<CrossingPoint>,
  ) {
    if (points.length < 2) return;
    const JUMP_R = 5;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const isHoriz = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.x - a.x) > 1;
      if (!isHoriz || crossings.length === 0) {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        continue;
      }

      const dir = b.x >= a.x ? 1 : -1;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const segCrossings = crossings
        .filter((c) => Math.abs(c.y - a.y) < 1 && c.x > minX + JUMP_R && c.x < maxX - JUMP_R)
        .sort((c1, c2) => (dir > 0 ? c1.x - c2.x : c2.x - c1.x));

      if (segCrossings.length === 0) {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        continue;
      }

      let cursorX = a.x;
      for (const c of segCrossings) {
        const enterX = c.x - dir * JUMP_R;
        const exitX = c.x + dir * JUMP_R;
        g.moveTo(cursorX, a.y).lineTo(enterX, a.y);
        // Pequena ponte semicircular para cruzamento sem conexão elétrica
        if (dir > 0) {
          g.arc(c.x, a.y, JUMP_R, Math.PI, 0, false);
        } else {
          g.arc(c.x, a.y, JUMP_R, 0, Math.PI, true);
        }
        cursorX = exitX;
      }
      g.moveTo(cursorX, a.y).lineTo(b.x, b.y);
    }
  }

  private upsertEdge(
    e: DiagramEdge,
    doc: DiagramDoc,
    points: ReadonlyArray<Point>,
    crossings: ReadonlyArray<CrossingPoint>,
    energization?: CircuitEnergizationState | null,
  ) {
    const srcNode = doc.nodes[e.source];
    const tgtNode = doc.nodes[e.target];
    if (!srcNode || !tgtNode || points.length < 2) return;

    const from = points[0];
    const to = points[points.length - 1];
    const isSelected = this.selectedEdgeIds.has(e.id);
    const isSimRunning = energization && energization.status !== "stopped";

    // Hash inclui pontos, cruzamentos, seleção e energização para diff preciso
    const simFlag = isSimRunning
      ? energization.faultEdgeIds.has(e.id)
        ? "fault"
        : energization.energizedEdgeIds.has(e.id)
          ? "on"
          : "off"
      : "idle";
    const ptsKey = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
    const crossKey = crossings.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(";");

    const hash = `${e.source}:${ptsKey}:${crossKey}:${e.kind}:${e.circuitConfig ?? ""}:sel=${isSelected}:sim=${simFlag}`;
    const existing = this.edges.get(e.id);
    if (existing && existing.hash === hash) return;
    if (existing) existing.graphics.destroy({ children: true });

    // Determina cor do condutor
    let strokeColor = 0x334155; // Padrão grafite escuro em repouso
    if (isSelected) {
      strokeColor = 0xf97316; // Laranja industrial quando selecionado
    } else if (isSimRunning) {
      if (energization.faultEdgeIds.has(e.id)) {
        strokeColor = 0xef4444; // Vermelho em falha
      } else if (energization.energizedEdgeIds.has(e.id)) {
        strokeColor = 0x10b981; // Verde elétrico vivo quando energizado
      } else {
        strokeColor = 0x64748b; // Cinza neutro sem energização
      }
    } else if (e.kind === "signal") {
      strokeColor = 0xf97316;
    }

    // Multifilar: N condutores paralelos (renderizado EXCLUSIVAMENTE na folha multifilar)
    const isMultifilarSheet = this.lastSheet === "multifilar";
    const conductors = e.circuitConfig ? CONDUCTOR_LABELS[e.circuitConfig] : null;
    if (isMultifilarSheet && conductors && conductors.length > 1) {
      const spacing = 6;
      const total = conductors.length;
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      container.hitArea = createPolylineHitArea(points, 14);

      conductors.forEach((label, i) => {
        const offset = (i - (total - 1) / 2) * spacing;
        let cColor = strokeColor;
        if (!isSelected && !isSimRunning) {
          cColor = label === "N" ? 0x0284c7 : label === "PE" ? 0x15803d : 0x334155;
        }

        const shifted = points.map((pt, idx) => {
          const prev = points[Math.max(0, idx - 1)];
          const next = points[Math.min(points.length - 1, idx + 1)];
          const isHoriz = Math.abs(next.x - prev.x) > Math.abs(next.y - prev.y);
          return {
            x: pt.x + (isHoriz ? 0 : offset),
            y: pt.y + (isHoriz ? offset : 0),
          };
        });

        const g = new Graphics();
        g.moveTo(shifted[0].x, shifted[0].y);
        for (let k = 1; k < shifted.length; k++) {
          g.lineTo(shifted[k].x, shifted[k].y);
        }
        g.stroke({ width: isSelected ? 2.5 : 1.6, color: cColor });
        container.addChild(g);

        const midIdx = Math.floor(shifted.length / 2);
        const anchor = shifted[midIdx];
        const text = new Text({
          text: label,
          style: {
            fill: cColor,
            fontSize: 10.5,
            fontFamily: "monospace",
            fontWeight: "bold",
          },
          resolution: 2,
        });
        text.position.set(anchor.x + 3, anchor.y - 10);
        container.addChild(text);
      });

      this.attachEdgeEvents(container, e.id);
      this.edgesLayer.addChild(container);
      this.edges.set(e.id, { graphics: container, hash });
      return;
    }

    // Unifilar: Condutor único com suporte a waypoints, cruzamentos e alças de ajuste
    const container = new Container();
    const g = new Graphics();
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = createPolylineHitArea(points, 11);

    if (e.kind === "signal") {
      // Linha tracejada industrial para controle/sinal
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) continue;
        const ux = dx / dist;
        const uy = dy / dist;
        const dash = 6;
        const gap = 4;
        let curr = 0;
        let drawing = true;
        while (curr < dist) {
          const len = drawing ? dash : gap;
          const next = Math.min(curr + len, dist);
          if (drawing) {
            g.moveTo(a.x + ux * curr, a.y + uy * curr).lineTo(a.x + ux * next, a.y + uy * next);
          }
          curr = next;
          drawing = !drawing;
        }
      }
      g.stroke({ width: isSelected ? 3.0 : 1.8, color: strokeColor });
      g.circle(from.x, from.y, 3).fill({ color: strokeColor });
      g.circle(to.x, to.y, 2.5).fill({ color: strokeColor });
    } else {
      // Condutor de potência com rotas ortogonais e pontes para cruzamentos sem ligação
      this.drawOrthogonalPathWithBridges(g, points, crossings);
      g.stroke({ width: isSelected ? 3.2 : 2.1, color: strokeColor });
    }

    this.attachEdgeEvents(g, e.id);
    container.addChild(g);

    // Alças interativas de segmento quando o condutor está selecionado
    if (isSelected && points.length >= 4) {
      for (let i = 1; i <= points.length - 3; i++) {
        const a = points[i];
        const b = points[i + 1];
        const isHoriz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 16;
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 16;
        if (!isHoriz && !isVert) continue;

        const hx = (a.x + b.x) / 2;
        const hy = (a.y + b.y) / 2;
        const handle = new Graphics();
        handle.eventMode = "static";
        handle.cursor = isHoriz ? "ns-resize" : "ew-resize";
        handle.rect(-4.5, -4.5, 9, 9).fill({ color: 0xf97316 }).stroke({ width: 1, color: 0xffffff });
        handle.position.set(hx, hy);
        const segIdx = i;
        const orientation: "H" | "V" = isHoriz ? "H" : "V";
        handle.on("pointerdown", (ev: FederatedPointerEvent) => {
          if (ev.button !== 0) return;
          ev.stopPropagation();
          const world = this.viewport.toWorld(ev.global);
          this.viewport.plugins.pause("drag");
          this.segmentDrag = {
            pointerId: ev.pointerId,
            edgeId: e.id,
            segIndex: segIdx,
            orientation,
            basePoints: points.map((p) => ({ ...p })),
            startWorld: { x: world.x, y: world.y },
            currentPoints: points.map((p) => ({ ...p })),
            moved: false,
          };
        });
        container.addChild(handle);
      }
    }

    this.edgesLayer.addChild(container);
    this.edges.set(e.id, { graphics: container, hash });
  }

  private attachEdgeEvents(target: Container, edgeId: string) {
    target.on("pointerdown", (e: FederatedPointerEvent) => {
      if (e.button === 2) {
        const native = e.nativeEvent as PointerEvent;
        this.events.onContextMenu?.({
          nodeId: null,
          edgeId,
          clientX: native?.clientX ?? 0,
          clientY: native?.clientY ?? 0,
        });
        e.stopPropagation();
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      this.events.onSelectEdge?.(edgeId, { shiftKey: e.shiftKey });
    });
  }

  private refreshEdgesFor(_nodeIds: Iterable<string>) {
    if (!this.lastDoc) return;
    const wantNodes = Object.values(this.lastDoc.nodes).filter((n) => n.sheet === this.lastSheet);
    const wantEdges = Object.values(this.lastDoc.edges).filter((e) => e.sheet === this.lastSheet);
    const overrides = new Map<string, Position>();
    for (const [id, v] of this.nodes) {
      overrides.set(id, { x: v.container.x, y: v.container.y });
    }
    this.renderSheetEdges(wantNodes, wantEdges, this.lastDoc, this.lastEnergization, overrides);
  }

  // ============== pointer pipeline ==============

  private attachNodeEvents(container: Container, id: string) {
    container.on("pointerdown", (e: FederatedPointerEvent) => {
      if (e.button === 2) {
        const native = e.nativeEvent as PointerEvent;
        this.events.onContextMenu?.({
          nodeId: id,
          clientX: native?.clientX ?? 0,
          clientY: native?.clientY ?? 0,
        });
        e.stopPropagation();
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();

      // Interação durante simulação: alternar abertura de disjuntores/chaves
      if (this.lastEnergization && this.lastEnergization.status !== "stopped" && !e.shiftKey) {
        const node = this.lastDoc?.nodes[id];
        if (node && isSwitchingDevice(node.params.kind)) {
          this.events.onToggleDevice?.(id);
        }
      }

      const additive = e.shiftKey;
      const wasSelected = this.selectedNodeIds.has(id);
      if (!wasSelected) {
        if (additive) {
          this.events.onSelectMany?.([...this.selectedNodeIds, id], true);
        } else {
          this.events.onSelectNode?.(id, { shiftKey: false });
        }
      }

      const ids = new Set(this.selectedNodeIds);
      ids.add(id);
      const origins = new Map<string, { x: number; y: number }>();
      for (const nid of ids) {
        const v = this.nodes.get(nid);
        if (v) origins.set(nid, { x: v.container.x, y: v.container.y });
      }
      const world = this.viewport.toWorld(e.global);
      this.viewport.plugins.pause("drag");
      this.drag = {
        pointerId: e.pointerId,
        origins,
        start: { x: world.x, y: world.y },
        moved: false,
        primary: id,
      };
    });
  }

  private onViewportPointerDown(e: FederatedPointerEvent) {
    if (e.target !== this.viewport) return;
    if (e.button !== 0) return;

    if (e.shiftKey) {
      const world = this.viewport.toWorld(e.global);
      const rect = new Graphics();
      this.overlayLayer.addChild(rect);
      this.viewport.plugins.pause("drag");
      this.marquee = {
        pointerId: e.pointerId,
        start: { x: world.x, y: world.y },
        rect,
        additive: e.shiftKey,
      };
      return;
    }

    // Clique em vazio desseleciona nós e arestas
    this.events.onSelectNode?.(null);
    this.events.onSelectEdge?.(null);
  }

  private onPointerMove(e: FederatedPointerEvent) {
    if (this.segmentDrag && e.pointerId === this.segmentDrag.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const sd = this.segmentDrag;
      const snap = this.events.snap ?? ((v: number) => v);
      const pts = sd.basePoints.map((p) => ({ ...p }));
      if (sd.orientation === "H") {
        const dy = snap(world.y) - sd.startWorld.y;
        pts[sd.segIndex].y += dy;
        pts[sd.segIndex + 1].y += dy;
      } else {
        const dx = snap(world.x) - sd.startWorld.x;
        pts[sd.segIndex].x += dx;
        pts[sd.segIndex + 1].x += dx;
      }
      sd.currentPoints = simplifyOrthogonalPoints(pts);
      sd.moved = true;
      const edge = this.lastDoc?.edges[sd.edgeId];
      if (edge && this.lastDoc) {
        this.upsertEdge(edge, this.lastDoc, sd.currentPoints, [], this.lastEnergization);
      }
      return;
    }

    if (this.drag && e.pointerId === this.drag.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const dx = world.x - this.drag.start.x;
      const dy = world.y - this.drag.start.y;
      this.drag.moved = this.drag.moved || Math.abs(dx) + Math.abs(dy) > 1;
      for (const [nid, origin] of this.drag.origins) {
        const v = this.nodes.get(nid);
        if (!v) continue;
        v.container.position.set(origin.x + dx, origin.y + dy);
      }
      this.refreshEdgesFor(this.drag.origins.keys());
      return;
    }

    if (this.draft && e.pointerId === this.draft.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const src = this.findNode(this.draft.source);
      if (!src) return;
      const from = this.portWorldFromView(src, this.draft.sourcePort);
      this.draft.hoverTarget = this.findPortAt(world.x, world.y, this.draft.source);
      const tgtSide = this.draft.hoverTarget?.port.side ?? "top";
      let targetPt = { x: world.x, y: world.y };
      if (this.draft.hoverTarget) {
        const t = this.findNode(this.draft.hoverTarget.nodeId);
        if (t) targetPt = this.portWorldFromView(t, this.draft.hoverTarget.port);
      }
      const previewPts = routeOrthogonalEdge({
        from,
        to: targetPt,
        srcSide: this.draft.sourcePort.side,
        tgtSide,
      });
      this.draft.preview.clear();
      if (previewPts.length >= 2) {
        this.draft.preview.moveTo(previewPts[0].x, previewPts[0].y);
        for (let i = 1; i < previewPts.length; i++) {
          this.draft.preview.lineTo(previewPts[i].x, previewPts[i].y);
        }
        this.draft.preview.stroke({ width: 1.8, color: 0xf59e0b, alpha: 0.9 });
      }
      if (this.draft.hoverTarget) {
        this.draft.preview.circle(targetPt.x, targetPt.y, 6).stroke({ width: 1.8, color: 0x0284c7 });
      }
      return;
    }

    if (this.marquee && e.pointerId === this.marquee.pointerId) {
      const world = this.viewport.toWorld(e.global);
      const x = Math.min(this.marquee.start.x, world.x);
      const y = Math.min(this.marquee.start.y, world.y);
      const w = Math.abs(world.x - this.marquee.start.x);
      const h = Math.abs(world.y - this.marquee.start.y);
      this.marquee.rect.clear();
      this.marquee.rect
        .rect(x, y, w, h)
        .fill({ color: 0x0284c7, alpha: 0.08 })
        .stroke({ width: 1, color: 0x0284c7, alpha: 0.8 });
    }
  }

  private onPointerUp(e: FederatedPointerEvent) {
    if (this.segmentDrag && e.pointerId === this.segmentDrag.pointerId) {
      const sd = this.segmentDrag;
      this.segmentDrag = null;
      this.viewport.plugins.resume("drag");
      if (sd.moved && sd.currentPoints.length >= 2) {
        this.events.onUpdateEdgeWaypoints?.(sd.edgeId, sd.currentPoints);
      }
      return;
    }

    if (this.drag && e.pointerId === this.drag.pointerId) {
      const d = this.drag;
      this.drag = null;
      this.viewport.plugins.resume("drag");
      if (!d.moved) return;
      const snap = this.events.snap ?? ((v: number) => v);
      const deltas: MoveDelta[] = [];
      for (const [nid, origin] of d.origins) {
        const v = this.nodes.get(nid);
        if (!v) continue;
        const to = { x: snap(v.container.x), y: snap(v.container.y) };
        v.container.position.set(to.x, to.y);
        deltas.push({ nodeId: nid, from: origin, to });
      }
      this.events.onMoveNodes?.(deltas);
      return;
    }

    if (this.draft && e.pointerId === this.draft.pointerId) {
      const d = this.draft;
      d.preview.destroy();
      this.draft = null;
      if (d.hoverTarget) {
        this.events.onCommitEdge?.({
          source: d.source,
          sourcePort: d.sourcePort.id,
          target: d.hoverTarget.nodeId,
          targetPort: d.hoverTarget.port.id,
          kind: "power",
        });
      }
      return;
    }

    if (this.marquee && e.pointerId === this.marquee.pointerId) {
      const m = this.marquee;
      this.marquee = null;
      this.viewport.plugins.resume("drag");
      const world = this.viewport.toWorld(e.global);
      const x = Math.min(m.start.x, world.x);
      const y = Math.min(m.start.y, world.y);
      const w = Math.abs(world.x - m.start.x);
      const h = Math.abs(world.y - m.start.y);
      m.rect.destroy();
      const picked: string[] = [];
      for (const [id, v] of this.nodes) {
        if (
          v.container.x >= x &&
          v.container.x <= x + w &&
          v.container.y >= y &&
          v.container.y <= y + h
        ) {
          picked.push(id);
        }
      }
      this.events.onSelectMany?.(
        m.additive ? Array.from(new Set([...this.selectedNodeIds, ...picked])) : picked,
        m.additive,
      );
    }
  }

  private beginEdgeDraft(e: FederatedPointerEvent, nodeId: string, port: PortDef) {
    if (e.button === 2) {
      const native = e.nativeEvent as PointerEvent;
      this.events.onContextMenu?.({
        nodeId,
        clientX: native?.clientX ?? 0,
        clientY: native?.clientY ?? 0,
      });
      e.stopPropagation();
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();

    // Seleciona também o nó caso o usuário tenha clicado na porta para selecionar o componente
    if (!this.selectedNodeIds.has(nodeId)) {
      this.events.onSelectNode?.(nodeId, { shiftKey: e.shiftKey });
    }

    const preview = new Graphics();
    this.overlayLayer.addChild(preview);
    this.draft = {
      pointerId: e.pointerId,
      source: nodeId,
      sourcePort: port,
      preview,
      hoverTarget: null,
    };
  }

  private findNode(id: string): { container: Container; kind: string } | null {
    const v = this.nodes.get(id);
    if (!v) return null;
    return { container: v.container, kind: v.kind };
  }

  private portWorldFromView(
    view: { container: Container },
    port: PortDef,
  ): { x: number; y: number } {
    const deg = (view.container.rotation * 180) / Math.PI;
    const r = rotatePort(port, deg);
    return { x: view.container.x + r.x, y: view.container.y + r.y };
  }

  private findPortAt(
    x: number,
    y: number,
    exceptId: string,
  ): { nodeId: string; port: PortDef } | null {
    let best: { nodeId: string; port: PortDef; d2: number } | null = null;
    const tol = 14;
    for (const [id, v] of this.nodes) {
      if (id === exceptId) continue;
      const dx = x - v.container.x;
      const dy = y - v.container.y;
      if (Math.abs(dx) > 40 || Math.abs(dy) > 40) continue;
      const deg = (v.container.rotation * 180) / Math.PI;
      for (const p of getPorts(v.kind as Parameters<typeof getPorts>[0])) {
        const r = rotatePort(p, deg);
        const px = v.container.x + r.x;
        const py = v.container.y + r.y;
        const d2 = (x - px) ** 2 + (y - py) ** 2;
        if (d2 <= tol * tol && (!best || d2 < best.d2)) {
          best = { nodeId: id, port: p, d2 };
        }
      }
    }
    return best ? { nodeId: best.nodeId, port: best.port } : null;
  }
}
