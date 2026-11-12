/**
 * Multipage FBD Editor for eletric Studio — virtualized for >1,000 blocks.
 * Shares canonical CompactProgramModel without compiling on visual drag moves.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Plus,
  Trash,
  ArrowUUpLeft,
  ArrowUUpRight,
  Copy,
  ClipboardText,
  AlignLeft,
  AlignTop,
  GridFour,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type {
  CompactDiagnostic,
  CompactNode,
  CompactProgramModel,
} from "@/lib/compact-studio/domain/types";
import type { CompactRuntimeFrame } from "@/lib/compact-studio/runtime";
import { CompactBlockGlyph } from "./compact-svg-symbols";

interface FbdNodeData {
  readonly compactNode: CompactNode;
  readonly liveOutputs?: Readonly<Record<string, boolean | number | string>>;
  readonly hasError?: boolean;
  readonly hasWarning?: boolean;
}

const CompactFbdNodeCard = memo(function CompactFbdNodeCard({
  data,
  selected,
}: NodeProps<FbdNodeData>) {
  const { compactNode, liveOutputs, hasError, hasWarning } = data;
  return (
    <div
      className={`rounded-md border bg-card/95 min-w-[168px] shadow-md transition-colors ${
        hasError
          ? "border-destructive ring-1 ring-destructive/50"
          : hasWarning
            ? "border-amber-500/80"
            : selected
              ? "border-primary ring-1 ring-primary/50"
              : "border-border"
      }`}
    >
      <div className="px-2.5 py-1 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <CompactBlockGlyph category={compactNode.category} className="w-3.5 h-3.5" />
          <span>{compactNode.blockType}</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {compactNode.instanceName}
        </span>
      </div>

      <div className="p-2 flex justify-between gap-4 text-[10px] font-mono">
        <div className="flex flex-col gap-2">
          {compactNode.inputs.map((inp) => (
            <div key={inp.id} className="relative flex items-center gap-1.5 pl-1">
              <Handle
                type="target"
                position={Position.Left}
                id={inp.id}
                style={{
                  left: -12,
                  width: 8,
                  height: 8,
                  background: inp.signalType === "BOOL" ? "#38bdf8" : "#f59e0b",
                }}
              />
              <span className="text-foreground">{inp.negated ? `!${inp.name}` : inp.name}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 items-end">
          {compactNode.outputs.map((out) => {
            const val = liveOutputs?.[out.name];
            return (
              <div key={out.id} className="relative flex items-center gap-1.5 pr-1">
                {val !== undefined && (
                  <span
                    className={`px-1 rounded text-[9px] ${
                      val === true
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {typeof val === "boolean" ? (val ? "1" : "0") : String(val)}
                  </span>
                )}
                <span className="text-foreground">{out.name}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={out.id}
                  style={{
                    right: -12,
                    width: 8,
                    height: 8,
                    background: out.signalType === "BOOL" ? "#22c55e" : "#f59e0b",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const NODE_TYPES: NodeTypes = Object.freeze({
  compactBlock: CompactFbdNodeCard,
});

export interface CompactFbdCanvasProps {
  readonly model: CompactProgramModel;
  readonly activePageId: string;
  readonly selectedNodeIds: readonly string[];
  readonly liveFrame: CompactRuntimeFrame | null;
  readonly diagnostics: readonly CompactDiagnostic[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onSelectPage: (pageId: string) => void;
  readonly onAddPage: () => void;
  readonly onSelectNodes: (nodeIds: string[]) => void;
  readonly onMoveNodes: (positions: Record<string, { x: number; y: number }>) => void;
  readonly onConnectPorts: (conn: {
    fromNodeId: string;
    fromPortId: string;
    toNodeId: string;
    toPortId: string;
  }) => void;
  readonly onDeleteSelected: () => void;
  readonly onCopy: () => void;
  readonly onPaste: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onAlign: (mode: "left" | "top" | "grid_snap") => void;
  readonly onAddBlock: (blockType: string) => void;
}

const QUICK_PALETTE: readonly { readonly type: string; readonly label: string }[] = [
  { type: "INPUT_DI", label: "I (DI)" },
  { type: "OUTPUT_QO", label: "Q (DO)" },
  { type: "AND", label: "AND" },
  { type: "OR", label: "OR" },
  { type: "NOT", label: "NOT" },
  { type: "SR", label: "SR" },
  { type: "TON", label: "TON" },
  { type: "TONR", label: "TONR" },
  { type: "PULSE_RELAY", label: "Pulso" },
  { type: "WEEKLY_TIMER", label: "Relógio Sem." },
  { type: "CTUD_COMPACT", label: "Contador" },
  { type: "ANALOG_THRESHOLD", label: "Limiar An." },
  { type: "PI_CONTROLLER", label: "PI" },
];

export const CompactFbdCanvas: React.FC<CompactFbdCanvasProps> = (props) => {
  const { t } = useI18n();
  const [searchFilter, setSearchFilter] = useState("");
  const pageNodes = useMemo(
    () => props.model.nodes.filter((n) => n.pageId === props.activePageId),
    [props.model.nodes, props.activePageId],
  );

  const diagByNode = useMemo(() => {
    const map = new Map<string, { err: boolean; warn: boolean }>();
    for (const d of props.diagnostics) {
      if (!d.nodeId) continue;
      const cur = map.get(d.nodeId) ?? { err: false, warn: false };
      if (d.severity === "error") cur.err = true;
      if (d.severity === "warning") cur.warn = true;
      map.set(d.nodeId, cur);
    }
    return map;
  }, [props.diagnostics]);

  const rfNodes = useMemo<Node<FbdNodeData>[]>(
    () =>
      pageNodes.map((n) => {
        const pos = props.model.layout.fbd[n.id] ?? { x: 80, y: 80 };
        const dState = diagByNode.get(n.id);
        return {
          id: n.id,
          type: "compactBlock",
          position: { x: pos.x, y: pos.y },
          selected: props.selectedNodeIds.includes(n.id),
          data: {
            compactNode: n,
            liveOutputs: props.liveFrame?.outputs[n.id],
            hasError: dState?.err,
            hasWarning: dState?.warn,
          },
        };
      }),
    [pageNodes, props.model.layout.fbd, props.selectedNodeIds, props.liveFrame, diagByNode],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      props.model.connections
        .filter((c) => c.pageId === props.activePageId)
        .map((c) => ({
          id: c.id,
          source: c.fromNodeId,
          sourceHandle: c.fromPortId,
          target: c.toNodeId,
          targetHandle: c.toPortId,
          type: "smoothstep",
          animated: Boolean(props.liveFrame),
        })),
    [props.model.connections, props.activePageId, props.liveFrame],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const moved: Record<string, { x: number; y: number }> = {};
      const selected: string[] = [];
      let selectionChanged = false;

      const next = applyNodeChanges(changes, rfNodes);
      for (const ch of changes) {
        if (ch.type === "position" && ch.position) {
          moved[ch.id] = { x: ch.position.x, y: ch.position.y };
        }
        if (ch.type === "select") {
          selectionChanged = true;
        }
      }
      if (Object.keys(moved).length > 0) {
        props.onMoveNodes(moved);
      }
      if (selectionChanged) {
        for (const n of next) if (n.selected) selected.push(n.id);
        props.onSelectNodes(selected);
      }
    },
    [rfNodes, props],
  );

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) return;
      props.onConnectPorts({
        fromNodeId: conn.source,
        fromPortId: conn.sourceHandle,
        toNodeId: conn.target,
        toPortId: conn.targetHandle,
      });
    },
    [props],
  );

  const filteredPalette = useMemo(
    () =>
      QUICK_PALETTE.filter((item) =>
        item.label.toLowerCase().includes(searchFilter.trim().toLowerCase()),
      ),
    [searchFilter],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        props.onUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        props.onRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        props.onCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        props.onPaste();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if ((e.target as HTMLElement)?.tagName !== "INPUT") {
          props.onDeleteSelected();
        }
      }
    },
    [props],
  );

  return (
    <div
      className="flex flex-col h-full w-full min-h-0"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={t("compactStudio.fbdEditorAria") || "Editor FBD"}
    >
      {/* Toolbar & Page Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-panel text-xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          {props.model.pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => props.onSelectPage(page.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                page.id === props.activePageId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {page.name}
            </button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={props.onAddPage}
            title="Nova página"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!props.canUndo}
            onClick={props.onUndo}
            title="Desfazer (Ctrl+Z)"
          >
            <ArrowUUpLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!props.canRedo}
            onClick={props.onRedo}
            title="Refazer (Ctrl+Y)"
          >
            <ArrowUUpRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={props.onCopy}
            title="Copiar (Ctrl+C)"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={props.onPaste}
            title="Colar (Ctrl+V)"
          >
            <ClipboardText className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => props.onAlign("left")}
            title="Alinhar à esquerda"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => props.onAlign("top")}
            title="Alinhar ao topo"
          >
            <AlignTop className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => props.onAlign("grid_snap")}
            title="Alinhar à grade"
          >
            <GridFour className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={props.onDeleteSelected}
            title="Excluir seleção"
          >
            <Trash className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Block Palette Strip */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border bg-background/60 overflow-x-auto">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder={t("compactStudio.searchBlock") || "Filtrar bloco..."}
          aria-label={t("compactStudio.searchBlock") || "Filtrar bloco"}
          className="h-6 w-32 px-2 text-[11px] rounded border border-border bg-input font-mono"
        />
        {filteredPalette.map((item) => (
          <Button
            key={item.type}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => props.onAddBlock(item.type)}
            className="h-6 px-2 text-[11px] font-mono shrink-0"
          >
            + {item.label}
          </Button>
        ))}
      </div>

      {/* Virtualized Canvas (>1,000 blocks via onlyRenderVisibleElements) */}
      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onConnect={handleConnect}
            onlyRenderVisibleElements={true}
            snapToGrid={true}
            snapGrid={[20, 20]}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
};
