import { create } from "zustand";
import type { PlcVariable, PlcModule, PlcProgramBlock, PlcProject } from "./types";
import { createDefaultPlcProject } from "./types";

interface PlcStore {
  project: PlcProject;
  activeTab: "dashboard" | "hardware" | "variables" | "blocks";
  activeBlockId: string | null;
  setActiveTab: (tab: PlcStore["activeTab"]) => void;
  setActiveBlock: (id: string | null) => void;
  setProject: (project: PlcProject) => void;
  addModule: (
    catalogKey: string,
    label: string,
    category: PlcModule["category"],
    channels: number,
  ) => void;
  removeModule: (id: string) => void;
  addVariable: (v: PlcVariable) => void;
  updateVariable: (id: string, data: Partial<PlcVariable>) => void;
  removeVariable: (id: string) => void;
  addBlock: (b: PlcProgramBlock) => void;
  updateBlock: (id: string, data: Partial<PlcProgramBlock>) => void;
  removeBlock: (id: string) => void;
}

// Bloco 12 — IDs únicos e colisão-livres. `crypto.randomUUID()` é nativo em
// todos os runtimes modernos (browser + Workers), mas mantemos um fallback
// determinístico (timestamp + counter + random) para qualquer ambiente legado
// onde `crypto` ou `randomUUID` não estejam disponíveis.
let modCounter = 0;
function genId(prefix: string): string {
  try {
    const c = typeof crypto !== "undefined" ? crypto : undefined;
    if (c && typeof c.randomUUID === "function") {
      return `${prefix}-${c.randomUUID()}`;
    }
  } catch {
    // ignore — usa fallback abaixo
  }
  modCounter++;
  return `${prefix}-${Date.now()}-${modCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePlcStore = create<PlcStore>((set) => ({
  project: createDefaultPlcProject(),
  activeTab: "dashboard",
  activeBlockId: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveBlock: (id) => set({ activeBlockId: id }),

  setProject: (project) => set({ project }),

  addModule: (catalogKey, label, category, channels) =>
    set((s) => {
      const mod: PlcModule = {
        id: genId("mod"),
        catalogKey,
        category,
        label,
        description: `${label} · Slot ${s.project.rack.modules.length + 1}`,
        slot: s.project.rack.modules.length + 1,
        channels,
        params: {},
      };
      return {
        project: {
          ...s.project,
          rack: { ...s.project.rack, modules: [...s.project.rack.modules, mod] },
        },
      };
    }),

  removeModule: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        rack: { ...s.project.rack, modules: s.project.rack.modules.filter((m) => m.id !== id) },
      },
    })),

  addVariable: (v) =>
    set((s) => ({ project: { ...s.project, variables: [...s.project.variables, v] } })),

  updateVariable: (id, data) =>
    set((s) => ({
      project: {
        ...s.project,
        variables: s.project.variables.map((v) => (v.id === id ? { ...v, ...data } : v)),
      },
    })),

  removeVariable: (id) =>
    set((s) => ({
      project: { ...s.project, variables: s.project.variables.filter((v) => v.id !== id) },
    })),

  addBlock: (b) =>
    set((s) => ({ project: { ...s.project, programBlocks: [...s.project.programBlocks, b] } })),

  updateBlock: (id, data) =>
    set((s) => ({
      project: {
        ...s.project,
        programBlocks: s.project.programBlocks.map((b) => (b.id === id ? { ...b, ...data } : b)),
      },
    })),

  removeBlock: (id) =>
    set((s) => ({
      project: { ...s.project, programBlocks: s.project.programBlocks.filter((b) => b.id !== id) },
    })),
}));
