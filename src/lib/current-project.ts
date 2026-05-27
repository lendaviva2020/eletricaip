import { create } from "zustand";
import {
  createProject as createProjectOnServer,
  listProjects as listProjectsOnServer,
} from "@/lib/projects.functions";

export interface CurrentProject {
  id: string;
  name: string;
  client?: string | null;
}

interface State {
  project: CurrentProject | null;
  setProject: (p: CurrentProject | null) => void;
  hydrateFromStorage: () => void;
}

const KEY = "eletricai.currentProject";
const EMPTY_PROJECT_SNAPSHOT = {
  schemaVersion: 2,
  project: { nodes: [], edges: [], tags: {} },
  voltai: { components: [], edges: [] },
  editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
};

export const useCurrentProject = create<State>((set) => ({
  project: null,
  setProject: (p) => {
    set({ project: p });
    if (typeof window !== "undefined") {
      if (p) localStorage.setItem(KEY, JSON.stringify(p));
      else localStorage.removeItem(KEY);
    }
  },
  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) set({ project: JSON.parse(raw) });
    } catch {
      localStorage.removeItem(KEY);
    }
  },
}));

export async function listMyProjects(): Promise<CurrentProject[]> {
  try {
    const result = await listProjectsOnServer();
    return (result.projects ?? []).map((p: { id: string; name: string; client?: string | null }) => ({
      id: p.id,
      name: p.name,
      client: p.client ?? null,
    }));
  } catch (error) {
    console.warn("listMyProjects error:", (error as Error).message);
    return [];
  }
}

export async function createProject(input: {
  name: string;
  client?: string;
  description?: string;
}): Promise<CurrentProject | null> {
  try {
    const project = await createProjectOnServer({
      data: {
        name: input.name,
        description: input.description,
        client: input.client,
      },
    });
    return {
      id: project.id,
      name: project.name,
      client: project.client ?? null,
    };
  } catch (error) {
    console.error("createProject error:", (error as Error).message);
    return null;
  }
<<<<<<< HEAD
  if (data?.id) {
    const { error: diagramError } = await supabase.from("diagrams").insert({
      project_id: (data as any).id,
      name: "main",
      canvas_data: EMPTY_PROJECT_SNAPSHOT,
    });
    if (diagramError) console.warn("createProject diagram insert:", diagramError.message);
  }
  return data
    ? {
        id: (data as any).id,
        name: (data as any).name,
        client: ((data as any).metadata as any)?.client ?? null,
      }
    : null;
=======
>>>>>>> 416116de870f9ca29975d2009f4054162864a6f9
}
