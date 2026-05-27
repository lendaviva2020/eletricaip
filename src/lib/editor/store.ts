import { create } from "zustand";
import type { WorkspaceMode } from "@/lib/workspace-data";
import type { LadderRung } from "@/lib/ladder/types";

export type EditorTagType = "BOOL" | "INT" | "REAL" | "STRING";

export interface EditorTag {
  id: string;
  name: string; // ex: %I0.0, K1_CMD, LT_01
  type: EditorTagType;
  value: boolean | number | string;
  forced: boolean;
}

interface EditorState {
  activeMode: WorkspaceMode;
  selectedNodeId: string | null;
  tags: Record<string, EditorTag>;
  rungs: LadderRung[];
  fbdNodes: any[];
  fbdEdges: any[];
  dirty: boolean;

  setActiveMode: (mode: WorkspaceMode) => void;
  setSelectedNode: (id: string | null) => void;

  upsertTag: (tag: EditorTag) => void;
  removeTag: (id: string) => void;
  setTagValue: (id: string, value: EditorTag["value"]) => void;
  forceTagValue: (id: string, value: EditorTag["value"]) => void;
  releaseTag: (id: string) => void;
  setRungs: (rungs: LadderRung[] | ((prev: LadderRung[]) => LadderRung[])) => void;
  setFbdAll: (
    nodes: any[] | ((prev: any[]) => any[]),
    edges: any[] | ((prev: any[]) => any[]),
  ) => void;
  hydrateSnapshot: (snapshot: {
    tags?: Record<string, EditorTag>;
    rungs?: LadderRung[];
    fbdNodes?: any[];
    fbdEdges?: any[];
  }) => void;
  markSaved: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeMode: "unifilar",
  selectedNodeId: null,
  tags: {},
  rungs: [],
  fbdNodes: [],
  fbdEdges: [],
  dirty: false,

  setActiveMode: (mode) => set({ activeMode: mode, selectedNodeId: null }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  upsertTag: (tag) => set((s) => ({ tags: { ...s.tags, [tag.id]: tag }, dirty: true })),
  removeTag: (id) =>
    set((s) => {
      const next = { ...s.tags };
      delete next[id];
      return { tags: next, dirty: true };
    }),
  setTagValue: (id, value) =>
    set((s) => {
      const tag = s.tags[id];
      if (!tag || tag.forced) return s;
      return { tags: { ...s.tags, [id]: { ...tag, value } } };
    }),
  forceTagValue: (id, value) =>
    set((s) => {
      const tag = s.tags[id];
      if (!tag) return s;
      return { tags: { ...s.tags, [id]: { ...tag, value, forced: true } }, dirty: true };
    }),
  releaseTag: (id) =>
    set((s) => {
      const tag = s.tags[id];
      if (!tag) return s;
      return { tags: { ...s.tags, [id]: { ...tag, forced: false } }, dirty: true };
    }),
  setRungs: (rungs) =>
    set((s) => ({ rungs: typeof rungs === "function" ? rungs(s.rungs) : rungs, dirty: true })),
  setFbdAll: (nodes, edges) =>
    set((s) => ({
      fbdNodes: typeof nodes === "function" ? nodes(s.fbdNodes) : nodes,
      fbdEdges: typeof edges === "function" ? edges(s.fbdEdges) : edges,
      dirty: true,
    })),
  hydrateSnapshot: (snapshot) =>
    set({
      tags: snapshot.tags ?? {},
      rungs: snapshot.rungs ?? [],
      fbdNodes: snapshot.fbdNodes ?? [],
      fbdEdges: snapshot.fbdEdges ?? [],
      selectedNodeId: null,
      dirty: false,
    }),
  markSaved: () => set({ dirty: false }),
}));
