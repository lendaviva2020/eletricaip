import { useState, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Download,
  FileCode,
  Play,
  StopCircle,
  Trash2,
  Settings,
  Sparkles,
  Sigma,
} from "lucide-react";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";
import { useEditorStore, type FbdNode, type FbdEdge } from "@/lib/editor/store";
import { BLOCK_DEFINITIONS, type FbdBlockKind } from "@/lib/fbd/types";
import { scanFbd, createInitialState, type FbdRuntimeState } from "@/lib/fbd/runtime";
import { compileFbdToSt, compileFbdToIL } from "@/lib/fbd/compiler";

const DEF_MAP = new Map(BLOCK_DEFINITIONS.map((d) => [d.kind, d]));

const PIN_COLORS: Record<string, string> = {
  BOOL: "oklch(0.78 0.17 200)",
  INT: "oklch(0.86 0.20 90)",
  REAL: "oklch(0.75 0.18 80)",
  TIME: "oklch(0.70 0.15 250)",
  ANY: "oklch(0.65 0.10 0)",
};

const nodeTypes = { fbdBlock: FbdBlockNode };

interface PinInfo {
  label: string;
  type: string;
}

interface FbdNodeData {
  label: string;
  type: string;
  inputs: PinInfo[];
  outputs: PinInfo[];
  params: Record<string, string | number>;
  onParamChange?: (nodeId: string, key: string, val: string | number) => void;
  pinValues?: Record<string, unknown>;
  isRunning?: boolean;
}

function FbdBlockNode({ id, data }: { id: string; data: Record<string, unknown> }) {
  const d = data as unknown as FbdNodeData;
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="rounded border border-primary/40 bg-card/95 min-w-[160px] shadow-lg overflow-hidden select-none">
      <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between gap-2">
        <span className="font-display text-[10px] font-bold text-primary tracking-wider uppercase">
          {d.type}
        </span>
        <div className="flex items-center gap-1">
          {d.params && Object.keys(d.params).length > 0 && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Settings className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 flex justify-between relative gap-6">
        <div className="flex flex-col gap-2.5 items-start">
          {d.inputs.map((pin, i) => {
            const val = d.pinValues?.[pin.label];
            return (
              <div
                key={pin.label}
                className="relative flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground"
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={pin.label}
                  style={{
                    top: i * 20 + 20,
                    left: -16,
                    background: PIN_COLORS[pin.type] ?? PIN_COLORS.ANY,
                    width: 7,
                    height: 7,
                    border: "none",
                  }}
                />
                <span>{pin.label}</span>
                {d.isRunning && val !== undefined && (
                  <span
                    className={`ml-0.5 text-[8px] font-bold ${
                      pin.type === "BOOL"
                        ? val
                          ? "text-green-400"
                          : "text-muted-foreground/40"
                        : "text-cyan-400"
                    }`}
                  >
                    {pin.type === "BOOL" ? (val ? "1" : "0") : String(val)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2.5 items-end">
          {d.outputs.map((pin, i) => {
            const val = d.pinValues?.[pin.label];
            return (
              <div
                key={pin.label}
                className="relative flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground"
              >
                {d.isRunning && val !== undefined && (
                  <span
                    className={`mr-0.5 text-[8px] font-bold ${
                      pin.type === "BOOL"
                        ? val
                          ? "text-green-400"
                          : "text-muted-foreground/40"
                        : "text-cyan-400"
                    }`}
                  >
                    {pin.type === "BOOL" ? (val ? "1" : "0") : String(val)}
                  </span>
                )}
                <span>{pin.label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={pin.label}
                  style={{
                    top: i * 20 + 20,
                    right: -16,
                    background: PIN_COLORS[pin.type] ?? PIN_COLORS.ANY,
                    width: 7,
                    height: 7,
                    border: "none",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {showConfig && d.params && d.onParamChange && (
        <div className="border-t border-border p-2 bg-background/50 flex flex-col gap-1.5">
          {Object.entries(d.params).map(([key, val]) => {
            const def = DEF_MAP.get(d.type as FbdBlockKind);
            const paramDef = def?.params?.find((p) => p.key === key);
            return (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-semibold text-muted-foreground">
                  {paramDef?.label ?? key}
                </label>
                <input
                  type="text"
                  value={val}
                  onChange={(e) => d.onParamChange!(id, key, e.target.value)}
                  className="h-6 px-1.5 text-[10px] bg-input border border-border rounded font-mono"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FbdCanvas() {
  const nodes = useEditorStore((s) => s.fbdNodes);
  const edges = useEditorStore((s) => s.fbdEdges);
  const setFbdAll = useEditorStore((s) => s.setFbdAll);

  const [isRunning, setIsRunning] = useState(false);
  const [stCode, setStCode] = useState("");
  const [showStPanel, setShowStPanel] = useState(false);
  const [showIlPanel, setShowIlPanel] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simStateRef = useRef<FbdRuntimeState>(createInitialState());
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleParamChange = useCallback(
    (nodeId: string, key: string, val: string | number) => {
      setFbdAll(
        (prevNodes: FbdNode[]) =>
          prevNodes.map((n: FbdNode) => {
            if (n.id === nodeId) {
              const currentData = n.data as unknown as FbdNodeData;
              return {
                ...n,
                data: {
                  ...currentData,
                  params: { ...(currentData?.params ?? {}), [key]: val },
                } as unknown as Record<string, unknown>,
              };
            }
            return n;
          }),
        (prevEdges: FbdEdge[]) => prevEdges,
      );
    },
    [setFbdAll],
  );

  const startSimulation = useCallback(() => {
    if (nodes.length === 0) return;
    simStateRef.current = createInitialState();
    setIsRunning(true);
  }, [nodes]);

  const stopSimulation = useCallback(() => {
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setFbdAll(
        (prevNodes: FbdNode[]) =>
          prevNodes.map((n: FbdNode) => ({
            ...n,
            data: { ...(n.data as unknown as FbdNodeData), pinValues: undefined, isRunning: false } as unknown as Record<string, unknown>,
          })),
        (prevEdges: FbdEdge[]) => prevEdges,
      );
      return;
    }

    intervalRef.current = setInterval(() => {
      setFbdAll(
        (prevNodes: FbdNode[]) => {
          const fbdBlocks = toFbdBlocks(prevNodes);
          const fbdConns = toFbdConnections(edges);
          try {
            const result = scanFbd(fbdBlocks, fbdConns, {}, simStateRef.current, 100);
            simStateRef.current = result.state;
            return prevNodes.map((n: FbdNode) => {
              const pinValues: Record<string, unknown> = {};
              const nodeData = n.data as unknown as FbdNodeData;
              const def = DEF_MAP.get(nodeData.type as FbdBlockKind);
              if (def) {
                for (const inp of def.inputs) {
                  const key = `${n.id}.${inp.label}`;
                  if (key in result.outputs) {
                    pinValues[inp.label] = result.outputs[key];
                  }
                }
                for (const out of def.outputs) {
                  const key = `${n.id}.${out.label}`;
                  if (key in result.outputs) {
                    pinValues[out.label] = result.outputs[key];
                  }
                }
              }
              return {
                ...n,
                data: { ...nodeData, pinValues, isRunning: true } as unknown as Record<string, unknown>,
              };
            });
          } catch {
            return prevNodes;
          }
        },
        (prevEdges: FbdEdge[]) => prevEdges,
      );
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, edges, setFbdAll]);

  useEffect(() => {
    if (!showStPanel && !showIlPanel) return;
    const fbdBlocks = toFbdBlocks(nodes);
    const fbdConns = toFbdConnections(edges);
    const st = compileFbdToSt(fbdBlocks, fbdConns);
    setStCode(st);
  }, [nodes, edges, showStPanel, showIlPanel]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setFbdAll(
        (prevNodes: FbdNode[]) => applyNodeChanges(changes, prevNodes) as FbdNode[],
        (prevEdges: FbdEdge[]) => prevEdges,
      );
    },
    [setFbdAll],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setFbdAll(
        (prevNodes: FbdNode[]) => prevNodes,
        (prevEdges: FbdEdge[]) => applyEdgeChanges(changes, prevEdges) as FbdEdge[],
      );
    },
    [setFbdAll],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n: FbdNode) => n.id === params.source);
      const targetNode = nodes.find((n: FbdNode) => n.id === params.target);
      const sourceData = sourceNode?.data as unknown as FbdNodeData | undefined;
      const targetData = targetNode?.data as unknown as FbdNodeData | undefined;
      const sourcePinDef = sourceData?.outputs?.find(
        (p: PinInfo) => p.label === params.sourceHandle,
      );
      const targetPinDef = targetData?.inputs?.find(
        (p: PinInfo) => p.label === params.targetHandle,
      );

      if (sourcePinDef && targetPinDef && sourcePinDef.type !== targetPinDef.type) {
        alert(`Erro de Tipo: não pode conectar ${sourcePinDef.type} com ${targetPinDef.type}.`);
        return;
      }

      const edgeTypeColor = PIN_COLORS[sourcePinDef?.type as string] ?? PIN_COLORS.ANY;

      setFbdAll(
        (prevNodes: FbdNode[]) => prevNodes,
        (prevEdges: FbdEdge[]) =>
          addEdge(
            {
              ...params,
              style: { stroke: edgeTypeColor, strokeWidth: 2 },
            },
            prevEdges,
          ) as FbdEdge[],
      );
    },
    [nodes, setFbdAll],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/fbd-block") as FbdBlockKind;
      const def = DEF_MAP.get(kind);
      if (!def) return;

      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = {
        x: event.clientX - rect.left - 80,
        y: event.clientY - rect.top - 40,
      };

      const count = nodes.filter((n: FbdNode) => {
        const nd = n.data as unknown as FbdNodeData;
        return nd.type === kind;
      }).length + 1;
      const nodeId = `${kind}_${count}`;

      const params: Record<string, string | number> = {};
      if (def.params) {
        for (const p of def.params) {
          params[p.key] = p.defaultValue;
        }
      }

      const newNode: FbdNode = {
        id: nodeId,
        type: "fbdBlock",
        position,
        data: {
          label: nodeId,
          type: kind,
          inputs: def.inputs.map((i) => ({ label: i.label, type: i.type })),
          outputs: def.outputs.map((o) => ({ label: o.label, type: o.type })),
          params,
          onParamChange: handleParamChange,
        } as unknown as Record<string, unknown>,
      };

      setFbdAll(
        (prevNodes: FbdNode[]) => prevNodes.concat(newNode),
        (prevEdges: FbdEdge[]) => prevEdges,
      );
    },
    [nodes, setFbdAll, handleParamChange],
  );

  const deleteSelected = useCallback(() => {
    setFbdAll(
      (prevNodes: FbdNode[]) => prevNodes.filter((n: FbdNode) => n.selected),
      (prevEdges: FbdEdge[]) => prevEdges.filter((e: FbdEdge) => e.selected),
    );
  }, [setFbdAll]);

  const exportCode = (code: string, ext: string) => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `fbd_export.${ext}`;
    link.click();
  };

  return (
    <div className="relative h-full w-full bg-[--canvas-bg]" ref={wrapperRef}>
      <FloatingLegend
        title="FBD · Diagrama de Blocos Funcionais"
        items={[
          "IEC 61131-3",
          `${nodes.length} blocos`,
          `${edges.length} conexões`,
          isRunning ? "● Rodando" : "■ Parado",
        ]}
      />

      <div className="absolute top-16 left-6 z-10 flex gap-2 flex-wrap">
        {isRunning ? (
          <button
            onClick={stopSimulation}
            className="h-8 px-3 rounded bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 text-[10px] font-bold uppercase tracking-wider text-red-400 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <StopCircle className="h-3.5 w-3.5" />
            <span>Parar</span>
          </button>
        ) : (
          <button
            onClick={startSimulation}
            className="h-8 px-3 rounded bg-green-500/20 border border-green-500/40 hover:bg-green-500/30 text-[10px] font-bold uppercase tracking-wider text-green-400 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Simular</span>
          </button>
        )}

        <button
          onClick={() => {
            setShowStPanel(!showStPanel);
            if (showIlPanel) setShowIlPanel(false);
          }}
          className="h-8 px-3 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1.5 cursor-pointer"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>ST</span>
        </button>

        <button
          onClick={() => {
            setShowIlPanel(!showIlPanel);
            if (showStPanel) setShowStPanel(false);
          }}
          className="h-8 px-3 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Sigma className="h-3.5 w-3.5" />
          <span>IL</span>
        </button>

        <button
          onClick={deleteSelected}
          className="h-8 px-3 rounded border border-border bg-card/60 hover:bg-accent text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Apagar</span>
        </button>
      </div>

      <div className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          snapToGrid
          snapGrid={[20, 20]}
          fitView
          onlyRenderVisibleElements={true}
        >
          <Background color="var(--color-border)" gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeColor={() => "var(--color-primary)"}
            maskColor="rgba(0,0,0,0.4)"
            style={{ background: "var(--color-card)" }}
          />
        </ReactFlow>
      </div>

      {(showStPanel || showIlPanel) && (
        <div className="absolute right-6 top-16 z-20 w-[340px] max-h-[420px] rounded-lg border border-primary/30 flex flex-col shadow-2xl overflow-hidden glass-strong bg-background/95">
          <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border bg-card/40">
            <span className="text-[10px] font-display font-bold tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {showStPanel ? "COMPILADOR ST" : "INSTRUCTION LIST"}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  const fbdBlocks = toFbdBlocks(nodes);
                  const fbdConns = toFbdConnections(edges);
                  const code = showStPanel
                    ? compileFbdToSt(fbdBlocks, fbdConns)
                    : compileFbdToIL(fbdBlocks, fbdConns);
                  exportCode(code, showStPanel ? "st" : "il");
                }}
                title="Exportar"
                className="h-7 w-7 grid place-items-center rounded hover:bg-accent/50 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-auto max-h-[360px]">
            <pre className="text-[10px] font-mono text-muted-foreground leading-normal whitespace-pre-wrap">
              {stCode}
            </pre>
          </div>
        </div>
      )}

      <BottomStrip
        items={[
          ["Norma", "IEC 61131-3"],
          ["Engine", "FBD Runtime v2"],
          ["Status", isRunning ? "Rodando" : "Parado"],
        ]}
      />
    </div>
  );
}

function toFbdBlocks(nodes: FbdNode[]): import("@/lib/fbd/types").FbdBlock[] {
  return nodes.map((n: FbdNode) => {
    const nodeData = n.data as unknown as FbdNodeData;
    const inputs = nodeData?.inputs ?? [];
    const outputs = nodeData?.outputs ?? [];
    return {
      id: n.id,
      kind: (nodeData?.type as FbdBlockKind) ?? "AND",
      label: nodeData?.label ?? n.id,
      position: n.position ?? { x: 0, y: 0 },
      params: (nodeData?.params as Record<string, string | number>) ?? {},
      pins: [
        ...inputs.map((p: PinInfo) => ({
          id: `${n.id}.${p.label}`,
          label: p.label,
          type: p.type as "BOOL" | "INT" | "REAL" | "TIME" | "ANY",
          direction: "input" as const,
          blockId: n.id,
        })),
        ...outputs.map((p: PinInfo) => ({
          id: `${n.id}.${p.label}`,
          label: p.label,
          type: p.type as "BOOL" | "INT" | "REAL" | "TIME" | "ANY",
          direction: "output" as const,
          blockId: n.id,
        })),
      ],
    };
  });
}

function toFbdConnections(edges: FbdEdge[]): import("@/lib/fbd/types").FbdConnection[] {
  return edges.map((e: FbdEdge) => ({
    id: e.id ?? `${e.source}.${e.sourceHandle}->${e.target}.${e.targetHandle}`,
    sourcePin: `${e.source}.${e.sourceHandle}`,
    targetPin: `${e.target}.${e.targetHandle}`,
  }));
}
