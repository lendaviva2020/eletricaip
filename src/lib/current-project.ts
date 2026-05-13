import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, metadata")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("listMyProjects error:", error.message);
    return [];
  }
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    client: (p.metadata as any)?.client ?? null,
  }));
}

export async function createProject(input: {
  name: string;
  client?: string;
  description?: string;
}): Promise<CurrentProject | null> {
  const { data: tid, error: bErr } = await supabase.rpc("bootstrap_personal_tenant_if_missing");
  if (bErr) console.warn("bootstrap_personal_tenant_if_missing:", bErr.message);

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = (profile as any)?.tenant_id ?? tid;

  const payload: any = {
    name: input.name,
    description: input.description ?? null,
    created_by: u.user.id,
    tenant_id: tenantId,
    metadata: input.client ? { client: input.client } : {},
  };
  const { data, error } = await supabase
    .from("projects")
    .insert(payload)
    .select("id, name, metadata")
    .maybeSingle();
  if (error) {
    console.error("createProject error:", error.message);
    return null;
  }
  return data
    ? {
        id: (data as any).id,
        name: (data as any).name,
        client: ((data as any).metadata as any)?.client ?? null,
      }
    : null;
}
