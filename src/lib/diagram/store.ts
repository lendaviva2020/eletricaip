// Store Zustand do diagrama — única fonte de verdade do modelo.
// Expõe `doc`, `dispatch(command)`, `undo`, `redo`, `selection`.
// Componentes de UI/canvas leem este store via selectors memoizados.
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { applyCommand, buildAiPatchCommand, cmd, invertCommand, type Command } from "./commands";
import { emptyHistory, popRedo, popUndo, pushHistory, type History } from "./history";
import { createEmptyDoc } from "./model";
import type { AiDiagramPatch, DiagramDoc, Position, SheetKind } from "./schema";

export const GRID_SIZE = 25;

export interface ContextMenuState {
  nodeId: string | null;
  /** Coordenadas em CSS pixels relativas ao host do canvas. */
  x: number;
  y: number;
}

interface DiagramState {
  doc: DiagramDoc;
  history: History;
  activeSheet: SheetKind;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  snapEnabled: boolean;
  contextMenu: ContextMenuState | null;

  dispatch: (command: Command) => void;
  applyAiPatch: (patch: AiDiagramPatch) => void;
  /**
   * Aplica um comando sem gravar no histórico. Usado pela sincronização
   * realtime (#WGL-07 · etapa 3) para reprocessar comandos vindos de outros
   * clientes sem inflar o próprio stack de undo/redo do usuário local.
   */
  applyRemoteCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  setActiveSheet: (sheet: SheetKind) => void;
  setSelection: (nodes: string[], edges?: string[]) => void;
  clearSelection: () => void;
  toggleSnap: () => void;
  openContextMenu: (state: ContextMenuState) => void;
  closeContextMenu: () => void;

  // Mutações de alto nível (despacham comandos reversíveis):
  deleteSelected: () => void;
  rotateNode: (nodeId: string, deltaDeg: number) => void;
  moveSelectedTo: (deltas: Record<string, { from: Position; to: Position }>) => void;

  loadDoc: (doc: DiagramDoc) => void;
  resetDoc: () => void;
}

export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
  return Math.round(value / grid) * grid;
}

export const useDiagramStore = create<DiagramState>()(
  subscribeWithSelector((set, get) => ({
    doc: createEmptyDoc(),
    history: emptyHistory(),
    activeSheet: "unifilar",
    selectedNodeIds: [],
    selectedEdgeIds: [],

    dispatch: (command) => {
      const { doc, history } = get();
      const inverse = invertCommand(doc, command);
      if (!inverse) return;
      const next = applyCommand(doc, command);
      set({
        doc: next,
        history: pushHistory(history, {
          command,
          inverse,
          timestamp: Date.now(),
        }),
      });
    },

    applyAiPatch: (patch) => {
      const { doc } = get();
      get().dispatch(buildAiPatchCommand(doc, patch));
    },

    applyRemoteCommand: (command) => {
      const { doc } = get();
      set({ doc: applyCommand(doc, command) });
    },

    undo: () => {
      const { history, doc } = get();
      const { entry, next } = popUndo(history);
      if (!entry) return;
      set({ doc: applyCommand(doc, entry.inverse), history: next });
    },

    redo: () => {
      const { history, doc } = get();
      const { entry, next } = popRedo(history);
      if (!entry) return;
      set({ doc: applyCommand(doc, entry.command), history: next });
    },

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    snapEnabled: true,
    contextMenu: null,

    setActiveSheet: (sheet) =>
      set({ activeSheet: sheet, selectedNodeIds: [], selectedEdgeIds: [] }),
    setSelection: (nodes, edges = []) => set({ selectedNodeIds: nodes, selectedEdgeIds: edges }),
    clearSelection: () => set({ selectedNodeIds: [], selectedEdgeIds: [] }),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    openContextMenu: (state) => set({ contextMenu: state }),
    closeContextMenu: () => set({ contextMenu: null }),

    deleteSelected: () => {
      const { selectedNodeIds, selectedEdgeIds } = get();
      const commands: Command[] = [];
      for (const id of selectedEdgeIds) commands.push(cmd.removeEdge(id));
      for (const id of selectedNodeIds) commands.push(cmd.removeNode(id));
      if (commands.length === 0) return;
      get().dispatch(commands.length === 1 ? commands[0] : cmd.batch(commands));
      set({ selectedNodeIds: [], selectedEdgeIds: [] });
    },

    rotateNode: (nodeId, deltaDeg) => {
      const node = get().doc.nodes[nodeId];
      if (!node) return;
      const from = node.rotation ?? 0;
      const to = (from + deltaDeg) % 360;
      get().dispatch(cmd.rotate(nodeId, from, to));
    },

    moveSelectedTo: (deltas) => {
      const commands: Command[] = [];
      for (const [nodeId, { from, to }] of Object.entries(deltas)) {
        if (from.x === to.x && from.y === to.y) continue;
        commands.push(cmd.move(nodeId, from, to));
      }
      if (commands.length === 0) return;
      get().dispatch(commands.length === 1 ? commands[0] : cmd.batch(commands));
    },

    loadDoc: (doc) =>
      set({
        doc,
        history: emptyHistory(),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        contextMenu: null,
      }),
    resetDoc: () =>
      set({
        doc: createEmptyDoc(),
        history: emptyHistory(),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        contextMenu: null,
      }),
  })),
);

// selectors prontos para evitar reidentidade
export const selectActiveNodes = (s: DiagramState) =>
  Object.values(s.doc.nodes).filter((n) => n.sheet === s.activeSheet);
export const selectActiveEdges = (s: DiagramState) =>
  Object.values(s.doc.edges).filter((e) => e.sheet === s.activeSheet);
