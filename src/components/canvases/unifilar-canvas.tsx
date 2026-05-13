import { useCallback, useMemo, useRef } from "react";
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
import {
  VOLTAI_COLORS,
  VOLTAI_COMPONENT_BY_TYPE,
  type VoltaiComponentType,
} from "@/lib/voltai/component-definitions";
import { useVoltaiStore, type VoltaiDiagramComponent } from "@/lib/voltai/store";
import { useVoltaiSimulation } from "@/lib/voltai/use-voltai-simulation";
import { VoltaiFlowNode } from "./voltai-node";

const nodeTypes = { voltai: VoltaiFlowNode };

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

function Inner() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const components = useVoltaiStore((store) => store.components);
  const edges = useVoltaiStore((store) => store.edges);
  const selectedId = useVoltaiStore((store) => store.selectedId);
  const select = useVoltaiStore((store) => store.selectComponent);
  const updatePos = useVoltaiStore((store) => store.updateComponentPosition);
  const addEdge = useVoltaiStore((store) => store.addEdge);
  const addComponent = useVoltaiStore((store) => store.addComponent);
  useVoltaiSimulation(true);

  const rfNodes: Node<VoltaiDiagramComponent>[] = useMemo(
    () =>
      components.map((component) => ({
        id: component.id,
        type: "voltai",
        position: component.position,
        data: component,
        selected: component.id === selectedId,
      })),
    [components, selectedId],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => ({
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
      })),
    [edges],
  );

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
    >
      <FloatingLegend
        title="Unifilar · IEC 60617"
        items={[
          `${components.length} componentes`,
          `${rfEdges.length} ligacoes`,
          "Drag & Drop",
          "Sim 50 ms",
        ]}
      />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => select(node.id)}
        onPaneClick={() => select(null)}
        fitView
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
          className="!bg-card !border !border-border !rounded-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-card !border !border-border !rounded-md"
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

export function FloatingLegend({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="absolute top-4 left-4 z-10 glass rounded-md px-3 py-2 text-[11px] pointer-events-none">
      <div className="text-muted-foreground uppercase tracking-[0.18em] text-[9px] mb-1">
        {title}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-foreground/90">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export function BottomStrip({ items }: { items: [string, string][] }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 glass rounded-md px-3 py-2 flex flex-wrap gap-4 text-[11px] pointer-events-none">
      {items.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase tracking-wider text-[9px]">{key}</span>
          <span className="font-mono text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}

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
