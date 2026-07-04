import { useCallback, useMemo, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useCollab } from "@/hooks/use-collab";
import { MultiplayerCursors } from "@/components/multiplayer-cursors";
import { useProjectStore } from "@/lib/project-store";
import {
  Undo2,
  Redo2,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  LayoutGrid,
  RotateCw,
  Trash2,
  Maximize2,
} from "lucide-react";
import {
  VOLTAI_COLORS,
  VOLTAI_COMPONENT_BY_TYPE,
  type VoltaiComponentType,
} from "@/lib/voltai/component-definitions";
import { useVoltaiStore, type VoltaiDiagramComponent } from "@/lib/voltai/store";
import { useVoltaiSimulation } from "@/lib/voltai/use-voltai-simulation";
import { VoltaiFlowNode } from "./voltai-node";
import { CircuitControlPanel } from "./circuit-control-panel";
import { BottomStrip, FloatingLegend } from "./canvas-chrome";


function isVoltaiComponentType(value: string): value is VoltaiComponentType {
  return value in VOLTAI_COMPONENT_BY_TYPE;
}

function edgeRoleFromHandle(sourceHandle?: string | null) {
  if (!sourceHandle) return "power";
  for (const definition of Object.values(VOLTAI_COMPONENT_BY_TYPE)) {
    const terminal = definition.bornes.find((borne) => borne.id === sourceHandle);
    if (terminal) return terminal.role;
  }
  return "power";
}

const NODE_TYPES = { voltai: VoltaiFlowNode };
const EDGE_TYPES = {};

function Inner() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const projectId = useProjectStore((s) => s.projectId);
  const { cursors, broadcastCursor } = useCollab(projectId);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      broadcastCursor(x, y);
    },
    [broadcastCursor],
  );

  const components = useVoltaiStore((store) => store.components);
  const edges = useVoltaiStore((store) => store.edges);
  const selectedId = useVoltaiStore((store) => store.selectedId);
  const select = useVoltaiStore((store) => store.selectComponent);
  const updatePos = useVoltaiStore((store) => store.updateComponentPosition);
  const addEdge = useVoltaiStore((store) => store.addEdge);
  const addComponent = useVoltaiStore((store) => store.addComponent);

  // New advanced diagramming store links
  const undo = useVoltaiStore((store) => store.undo);
  const redo = useVoltaiStore((store) => store.redo);
  const deleteSelected = useVoltaiStore((store) => store.deleteSelected);
  const rotateComponent = useVoltaiStore((store) => store.rotateComponent);
  const alignComponents = useVoltaiStore((store) => store.alignComponents);
  const past = useVoltaiStore((store) => store.past);
  const future = useVoltaiStore((store) => store.future);

  useVoltaiSimulation(true);

  // Auto-fit view when components load
  useEffect(() => {
    if (components.length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
      return () => clearTimeout(timer);
    }
  }, [components.length, fitView]);

  // Keybindings for Undo, Redo, and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bypass when typing in form inputs or properties panel fields
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteSelected, undo, redo]);

  const nodesRef = useRef<Node<VoltaiDiagramComponent>[]>([]);
  const rfNodes = useMemo(() => {
    const nextNodes = components.map((component) => {
      const isSelected = component.id === selectedId;
      const existing = nodesRef.current.find((n) => n.id === component.id);
      if (
        existing &&
        existing.position.x === component.position.x &&
        existing.position.y === component.position.y &&
        existing.data === component &&
        existing.selected === isSelected
      ) {
        return existing;
      }
      return {
        id: component.id,
        type: "voltai",
        position: component.position,
        data: component,
        selected: isSelected,
      };
    });

    const isIdentical =
      nodesRef.current.length === nextNodes.length &&
      nodesRef.current.every((n, i) => n === nextNodes[i]);
    if (!isIdentical) {
      nodesRef.current = nextNodes;
    }
    return nodesRef.current;
  }, [components, selectedId]);

  const edgesRef = useRef<Edge[]>([]);
  const rfEdges = useMemo(() => {
    const nextEdges = edges.map((edge) => {
      const existing = edgesRef.current.find((e) => e.id === edge.id);
      if (
        existing &&
        existing.source === edge.source &&
        existing.target === edge.target &&
        existing.sourceHandle === edge.sourceHandle &&
        existing.targetHandle === edge.targetHandle &&
        existing.animated === (edge.role === "power") &&
        existing.style?.stroke === VOLTAI_COLORS[edge.role]
      ) {
        return existing;
      }
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: edge.role === "power",
        style: {
          stroke: VOLTAI_COLORS[edge.role],
          strokeWidth: edge.role === "power" ? 2.5 : 2,
        },
      };
    });

    const isIdentical =
      edgesRef.current.length === nextEdges.length &&
      edgesRef.current.every((e, i) => e === nextEdges[i]);
    if (!isIdentical) {
      edgesRef.current = nextEdges;
    }
    return edgesRef.current;
  }, [edges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, rfNodes);
      next.forEach((node) => {
        const old = components.find((component) => component.id === node.id);
        if (old && (old.position.x !== node.position.x || old.position.y !== node.position.y)) {
          updatePos(node.id, node.position);
        }
      });
    },
    [components, rfNodes, updatePos],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      addEdge({
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        role: edgeRoleFromHandle(connection.sourceHandle),
      });
    },
    [addEdge],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawType = event.dataTransfer.getData("application/voltai-component");
      if (!rawType || !isVoltaiComponentType(rawType)) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addComponent(rawType, position);
    },
    [addComponent, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onMouseMove={handleMouseMove}
    >
      <FloatingLegend
        title="Unifilar · IEC 60617"
        items={[
          `${components.length} componentes`,
          `${rfEdges.length} ligações`,
          "Atalhos Ativos (Del / Ctrl+Z)",
          "Simulação determinística (50ms)",
        ]}
      />

      {/* ADVANCED FLOATING TOOLBAR */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 select-none pointer-events-auto">
        {/* History Group (Undo / Redo) */}
        <div className="flex gap-1 p-1 rounded-lg border border-border bg-card/90 backdrop-blur shadow-lg">
          <button
            onClick={() => undo()}
            disabled={past.length === 0}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Desfazer última alteração (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => redo()}
            disabled={future.length === 0}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Refazer alteração desfeita (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* Auto-Align and Layout Group */}
        <div className="flex flex-col gap-1 p-1 rounded-lg border border-border bg-card/90 backdrop-blur shadow-lg">
          <button
            onClick={() => alignComponents("horizontal")}
            disabled={components.length <= 1}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Alinhar componentes horizontalmente"
          >
            <AlignHorizontalJustifyCenter className="h-4 w-4" />
          </button>
          <button
            onClick={() => alignComponents("vertical")}
            disabled={components.length <= 1}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Alinhar componentes verticalmente"
          >
            <AlignVerticalJustifyCenter className="h-4 w-4" />
          </button>
          <button
            onClick={() => alignComponents("grid")}
            disabled={components.length <= 1}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Auto-alinhar todos em grade retilínea"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        {/* Selected Node Transform Group */}
        <div className="flex flex-col gap-1 p-1 rounded-lg border border-border bg-card/90 backdrop-blur shadow-lg">
          <button
            onClick={() => selectedId && rotateComponent(selectedId, "cw")}
            disabled={!selectedId}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground transition-all cursor-pointer"
            title="Rotacionar símbolo 90° no sentido horário"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => deleteSelected()}
            disabled={!selectedId}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/15 text-foreground hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground transition-all cursor-pointer"
            title="Excluir item selecionado (Delete)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom and Fit Visualisation Group */}
        <div className="flex p-1 rounded-lg border border-border bg-card/90 backdrop-blur shadow-lg">
          <button
            onClick={() => fitView({ padding: 0.2, duration: 600 })}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-foreground transition-colors cursor-pointer"
            title="Centralizar e ajustar diagramas na tela"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => select(node.id)}
        onPaneClick={() => select(null)}
        fitView
        onlyRenderVisibleElements={true}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="oklch(0.32 0.02 250)"
        />
        <Controls
          className="bg-card! border! border-border! rounded-md! [&>button]:bg-card! [&>button]:border-border! [&>button]:text-foreground!"
          showInteractive={false}
        />
        <MiniMap
          className="bg-card! border! border-border! rounded-md!"
          maskColor="oklch(0.16 0.012 250 / 0.8)"
          nodeColor={(node) => {
            const type = (node.data as VoltaiDiagramComponent)?.type;
            const definition = type ? VOLTAI_COMPONENT_BY_TYPE[type] : null;
            if (definition?.category === "Protecao") return VOLTAI_COLORS.power;
            if (definition?.category === "Controle") return VOLTAI_COLORS.control;
            if (definition?.category === "Sinal" || definition?.category === "Medicao")
              return VOLTAI_COLORS.signal;
            return VOLTAI_COLORS.neutral;
          }}
        />
      </ReactFlow>
      <MultiplayerCursors cursors={cursors} />
      <CircuitControlPanel />
      <BottomStrip
        items={[
          ["Icc", "12.4 kA"],
          ["Seletividade", "OK"],
          ["Queda V%", "1.8 %"],
          ["Sync", "Twin · SCADA · Ladder"],
        ]}
      />
    </div>
  );
}

export function UnifilarCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}

// BottomStrip e FloatingLegend agora vivem em `./canvas-chrome` (#WGL-07 · etapa 1).
// Re-export mantido para compat com imports externos legados.
export { BottomStrip, FloatingLegend } from "./canvas-chrome";



export function FlowSurface({
  title,
}: {
  filter?: (node: VoltaiDiagramComponent) => boolean;
  title: string;
}) {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
