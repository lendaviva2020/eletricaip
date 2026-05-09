import { useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  type Connection, type Edge, type Node, type NodeChange, applyNodeChanges,
  ReactFlowProvider, useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useProjectStore, type IndustrialNode } from "@/lib/project-store";
import { IndustrialFlowNode } from "./_industrial-node";

const nodeTypes = { industrial: IndustrialFlowNode };

function Inner({ filter }: { filter?: (n: IndustrialNode) => boolean }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const select = useProjectStore((s) => s.select);
  const selectedId = useProjectStore((s) => s.selectedId);
  const updatePos = useProjectStore((s) => s.updateNodePosition);
  const addEdge = useProjectStore((s) => s.addEdge);
  const addNode = useProjectStore((s) => s.addNode);

  const visible = useMemo(() => (filter ? nodes.filter(filter) : nodes), [nodes, filter]);

  const rfNodes: Node<IndustrialNode>[] = useMemo(
    () => visible.map((n) => ({
      id: n.id, type: "industrial", position: n.position, data: n, selected: n.id === selectedId,
    })),
    [visible, selectedId]
  );

  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const rfEdges: Edge[] = useMemo(
    () => edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        id: e.id, source: e.source, target: e.target,
        animated: e.kind === "power" || e.kind === "pipe",
        style: {
          stroke: e.kind === "power" ? "oklch(0.86 0.20 90)" : e.kind === "pipe" ? "oklch(0.78 0.17 200)" : "oklch(0.78 0.18 150)",
          strokeWidth: e.kind === "power" ? 2.5 : 2,
        },
      })),
    [edges, visibleIds]
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, rfNodes);
    next.forEach((n) => {
      const old = visible.find((v) => v.id === n.id);
      if (old && (old.position.x !== n.position.x || old.position.y !== n.position.y)) {
        updatePos(n.id, n.position);
      }
    });
  }, [rfNodes, visible, updatePos]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    addEdge({ source: c.source, target: c.target, kind: "power" });
  }, [addEdge]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const label = event.dataTransfer.getData("application/eletricai");
    if (!label) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNode(label, position);
  }, [screenToFlowPosition, addNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div ref={wrapperRef} className="relative h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <FloatingLegend title="Unifilar · IEC 60617" items={[`${visible.length} nós`, `${rfEdges.length} ligações`, "Drag & Drop", "Live Sync"]} />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onPaneClick={() => select(null)}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="oklch(0.32 0.02 250)" />
        <Controls className="!bg-card !border !border-border !rounded-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" showInteractive={false} />
        <MiniMap
          className="!bg-card !border !border-border !rounded-md"
          maskColor="oklch(0.16 0.012 250 / 0.8)"
          nodeColor={(n) => {
            const cat = (n.data as IndustrialNode)?.category;
            if (cat === "power") return "oklch(0.78 0.17 200)";
            if (cat === "mech") return "oklch(0.78 0.18 150)";
            if (cat === "inst") return "oklch(0.82 0.17 80)";
            return "oklch(0.74 0.15 240)";
          }}
        />
      </ReactFlow>
      <BottomStrip items={[["Icc", "12.4 kA"], ["Seletividade", "OK"], ["Queda V%", "1.8 %"], ["Sync", "↔ Twin · SCADA · Ladder"]]} />
    </div>
  );
}

export function UnifilarCanvas() {
  return (
    <ReactFlowProvider>
      <Inner filter={(n) => n.category === "power" || n.kind === "motor"} />
    </ReactFlowProvider>
  );
}

export function FloatingLegend({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="absolute top-4 left-4 z-10 glass rounded-md px-3 py-2 text-[11px] pointer-events-none">
      <div className="text-muted-foreground uppercase tracking-[0.18em] text-[9px] mb-1">{title}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-foreground/90">
        {items.map((i) => <span key={i}>{i}</span>)}
      </div>
    </div>
  );
}

export function BottomStrip({ items }: { items: [string, string][] }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 glass rounded-md px-3 py-2 flex flex-wrap gap-4 text-[11px] pointer-events-none">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase tracking-wider text-[9px]">{k}</span>
          <span className="font-mono text-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}

// Reusable for FBD (filters logic-friendly nodes; also accepts inst sensors as inputs)
export function FlowSurface({ filter, title }: { filter?: (n: IndustrialNode) => boolean; title: string }) {
  return (
    <ReactFlowProvider>
      <FlowInner filter={filter} title={title} />
    </ReactFlowProvider>
  );
}

function FlowInner({ filter, title }: { filter?: (n: IndustrialNode) => boolean; title: string }) {
  return <Inner filter={filter} />;
}
