import { create } from "zustand";
import type { WorkspaceMode } from "@/lib/workspace-data";

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

  setActiveMode: (mode: WorkspaceMode) => void;
  setSelectedNode: (id: string | null) => void;

  upsertTag: (tag: EditorTag) => void;
  removeTag: (id: string) => void;
  setTagValue: (id: string, value: EditorTag["value"]) => void;
  forceTagValue: (id: string, value: EditorTag["value"]) => void;
  releaseTag: (id: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeMode: "unifilar",
  selectedNodeId: null,
  tags: {},

  setActiveMode: (mode) => set({ activeMode: mode, selectedNodeId: null }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  upsertTag: (tag) => set((s) => ({ tags: { ...s.tags, [tag.id]: tag } })),
  removeTag: (id) =>
    set((s) => {
      const next = { ...s.tags };
      delete next[id];
      return { tags: next };
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
      return { tags: { ...s.tags, [id]: { ...tag, value, forced: true } } };
    }),
  releaseTag: (id) =>
    set((s) => {
      const tag = s.tags[id];
      if (!tag) return s;
      return { tags: { ...s.tags, [id]: { ...tag, forced: false } } };
    }),
}));
