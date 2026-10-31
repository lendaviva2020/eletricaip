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
import type { DiagramDoc, DiagramEdge, DiagramNode, EdgeKind, SheetKind } from "../schema";
import { drawSymbol } from "./symbols";
import { CONDUCTOR_LABELS } from "../multifilar";
import { getPorts, rotatePort, type PortDef } from "./ports";
import type { CircuitEnergizationState } from "../electrical-simulation";
import { isSwitchingDevice } from "../electrical-simulation";

const PORT_HIT_RADIUS = 6;
const PORT_COLOR = 0x60a5fa;
const PORT_COLOR_HOVER = 0xfbbf24;

function distToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) ** 2 + (py - projY) ** 2;
}

function createOrthogonalWireHitArea(
  from: { x: number; y: number },
  to: { x: number; y: number },
  midX: number,
  tolerance: number,
) {
  const tol2 = tolerance * tolerance;
  return {
    contains: (x: number, y: number) => {
      const d1 = distToSegmentSquared(x, y, from.x, from.y, midX, from.y);
      if (d1 <= tol2) return true;
      const d2 = distToSegmentSquared(x, y, midX, from.y, midX, to.y);
      if (d2 <= tol2) return true;
      const d3 = distToSegmentSquared(x, y, midX, to.y, to.x, to.y);
      return d3 <= tol2;
    },
  };
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
  private overlayLayer = new Container();
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private events: StageEvents = {};
  private selectedNodeIds = new Set<string>();
  private selectedEdgeIds = new Set<string>();
  private lastEnergization: CircuitEnergizationState | null = null;
  private lastDoc: DiagramDoc | null = null;
  private lastSheet: SheetKind = "unifilar";

  private resizeObs?: ResizeObserver;
  private host?: HTMLElement;
  private wheelListener?: (e: WheelEvent) => void;
  private initialized = false;
  private destroyed = false;

  private drag: DragState | null = null;
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
      worldWidth: 4000,
      worldHeight: 4000,
      events: this.app.renderer.events,
    });

    // Limites de zoom estritos para evitar valores infinitos, NaN ou escala zero
    this.viewport.drag().pinch().wheel().decelerate().clampZoom({ minScale: 0.25, maxScale: 3.0 });
    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.edgesLayer);
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
      if (w && h) this.viewport.resize(w, h, 4000, 4000);
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

  /**
   * Enquadramento inteligente baseado na caixa envolvente dos componentes reais.
   * Não altera coordenadas persistidas e impede zoom infinito ou escalas extremas.
   */
  fitView(nodes?: DiagramNode[]) {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    const currentNodes =
      nodes ??
      (this.lastDoc
        ? Object.values(this.lastDoc.nodes).filter((n) => n.sheet === this.lastSheet)
        : []);

    if (!currentNodes || currentNodes.length === 0) {
      this.viewport.setZoom(1, true);
      this.viewport.moveCenter(1000, 800);
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of currentNodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x);
      maxY = Math.max(maxY, n.position.y);
    }

    const pad = 120;
    const boxW = Math.max(maxX - minX + pad * 2, 400);
    const boxH = Math.max(maxY - minY + pad * 2, 300);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const screenW = this.viewport.screenWidth || 800;
    const screenH = this.viewport.screenHeight || 600;

    let scale = Math.min(screenW / boxW, screenH / boxH);
    // Limite confortável entre 0.5x e 1.4x
    scale = Math.max(0.5, Math.min(scale, 1.4));

    this.viewport.setZoom(scale, true);
    this.viewport.moveCenter(centerX, centerY);
  }

  zoomIn() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    const cur = this.viewport.scaled;
    this.viewport.setZoom(Math.min(cur * 1.15, 3.0), true);
  }

  zoomOut() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    const cur = this.viewport.scaled;
    this.viewport.setZoom(Math.max(cur / 1.15, 0.25), true);
  }

  resetZoom() {
    if (this.destroyed || !this.initialized || !this.viewport) return;
    this.viewport.setZoom(1.0, true);
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
    for (const e of wantEdges) this.upsertEdge(e, doc, energization);

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
      const w = 32;
      const h = 26;
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
  ): { x: number; y: number } {
    const ports = getPorts(node.params.kind);
    const shortId = portId?.includes(":") ? portId.slice(portId.lastIndexOf(":") + 1) : portId;
    let port =
      (portId && ports.find((p) => p.id === portId)) ||
      (shortId && ports.find((p) => p.id === shortId));
    if (!port) {
      if (shortId === "out" || (!shortId && role === "source")) {
        port = ports[1] ?? ports[0];
      } else {
        port = ports[0];
      }
    }
    if (!port) return { ...node.position };
    const rotated = rotatePort(port, node.rotation ?? 0);
    return { x: node.position.x + rotated.x, y: node.position.y + rotated.y };
  }

  private upsertEdge(
    e: DiagramEdge,
    doc: DiagramDoc,
    energization?: CircuitEnergizationState | null,
  ) {
    const srcNode = doc.nodes[e.source];
    const tgtNode = doc.nodes[e.target];
    if (!srcNode || !tgtNode) return;

    const from = this.portWorld(srcNode, e.sourcePort, "source");
    const to = this.portWorld(tgtNode, e.targetPort, "target");
    const isSelected = this.selectedEdgeIds.has(e.id);
    const isSimRunning = energization && energization.status !== "stopped";

    // Hash inclui seleção e status de energização para atualização reativa instantânea
    const simFlag = isSimRunning
      ? energization.faultEdgeIds.has(e.id)
        ? "fault"
        : energization.energizedEdgeIds.has(e.id)
          ? "on"
          : "off"
      : "idle";

    const hash = `${e.source}:${from.x.toFixed(1)},${from.y.toFixed(1)}->${e.target}:${to.x.toFixed(1)},${to.y.toFixed(1)}:${e.kind}:${e.circuitConfig ?? ""}:sel=${isSelected}:sim=${simFlag}`;
    const existing = this.edges.get(e.id);
    if (existing && existing.hash === hash) return;
    if (existing) existing.graphics.destroy();

    const midX = (from.x + to.x) / 2;

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
      container.hitArea = createOrthogonalWireHitArea(from, to, midX, 14);

      conductors.forEach((label, i) => {
        const offset = (i - (total - 1) / 2) * spacing;
        let cColor = strokeColor;
        if (!isSelected && !isSimRunning) {
          cColor = label === "N" ? 0x0284c7 : label === "PE" ? 0x15803d : 0x334155;
        }

        const g = new Graphics();
        g.moveTo(from.x, from.y + offset)
          .lineTo(midX + offset, from.y + offset)
          .lineTo(midX + offset, to.y + offset)
          .lineTo(to.x, to.y + offset);
        g.stroke({ width: isSelected ? 2.5 : 1.6, color: cColor });
        container.addChild(g);

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
        text.position.set(midX + offset + 3, (from.y + to.y) / 2 + offset - 10);
        container.addChild(text);
      });

      this.attachEdgeEvents(container, e.id);
      this.edgesLayer.addChild(container);
      this.edges.set(e.id, { graphics: container, hash });
      return;
    }

    // Unifilar: Condutor único
    const g = new Graphics();
    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = createOrthogonalWireHitArea(from, to, midX, 10);

    if (e.kind === "signal") {
      // Linha tracejada industrial para controle/sinal
      const segments = [
        { x1: from.x, y1: from.y, x2: midX, y2: from.y },
        { x1: midX, y1: from.y, x2: midX, y2: to.y },
        { x1: midX, y1: to.y, x2: to.x, y2: to.y },
      ];
      for (const seg of segments) {
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
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
            g.moveTo(seg.x1 + ux * curr, seg.y1 + uy * curr).lineTo(
              seg.x1 + ux * next,
              seg.y1 + uy * next,
            );
          }
          curr = next;
          drawing = !drawing;
        }
      }
      g.stroke({ width: isSelected ? 3.0 : 1.8, color: strokeColor });
      g.circle(from.x, from.y, 3).fill({ color: strokeColor });
      g.circle(to.x, to.y, 2.5).fill({ color: strokeColor });
    } else {
      // Condutor de potência
      g.moveTo(from.x, from.y).lineTo(midX, from.y).lineTo(midX, to.y).lineTo(to.x, to.y);
      g.stroke({ width: isSelected ? 3.2 : 2.0, color: strokeColor });

      if (srcNode.params.kind === "busbar" || tgtNode.params.kind === "busbar") {
        const dotX = srcNode.params.kind === "busbar" ? from.x : to.x;
        const dotY = srcNode.params.kind === "busbar" ? from.y : to.y;
        g.circle(dotX, dotY, 4).fill({ color: strokeColor });
      }
    }

    this.attachEdgeEvents(g, e.id);
    this.edgesLayer.addChild(g);
    this.edges.set(e.id, { graphics: g, hash });
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

  private refreshEdgesFor(nodeIds: Iterable<string>) {
    const set = new Set(nodeIds);
    for (const [id, v] of this.edges) {
      if ([...set].some((nid) => v.hash.includes(nid))) {
        v.graphics.destroy();
        this.edges.delete(id);
      }
    }
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
      this.draft.preview.clear();
      const midX = (from.x + world.x) / 2;
      this.draft.preview
        .moveTo(from.x, from.y)
        .lineTo(midX, from.y)
        .lineTo(midX, world.y)
        .lineTo(world.x, world.y)
        .stroke({ width: 1.8, color: 0xf59e0b, alpha: 0.9 });
      this.draft.hoverTarget = this.findPortAt(world.x, world.y, this.draft.source);
      if (this.draft.hoverTarget) {
        const t = this.findNode(this.draft.hoverTarget.nodeId);
        if (t) {
          const tw = this.portWorldFromView(t, this.draft.hoverTarget.port);
          this.draft.preview.circle(tw.x, tw.y, 6).stroke({ width: 1.8, color: 0x0284c7 });
        }
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
