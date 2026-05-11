import { supabase } from "@/integrations/supabase/client";
import { useProjectStore, type IndustrialNode, type IndustrialEdge, type NodeKind, type NodeCategory } from "@/lib/project-store";

export interface ArchitectResult {
  title: string;
  rationale: string;
  transformer: { kVA: number; primary_kV: number; secondary_V: number };
  ccm: { columns: number; cells: number };
  motors: Array<{ id: string; power_kW: number; voltage_V?: number; startMethod?: "DOL" | "SOFT" | "VFD"; role?: string }>;
  nodes: Array<{ id: string; kind: string; category: string; label: string; params?: Record<string, any>; position: { x: number; y: number } }>;
  edges: Array<{ source: string; target: string; kind: "power" | "signal" | "pipe" }>;
}

export async function callArchitect(prompt: string, includeContext = true): Promise<ArchitectResult> {
  const context = includeContext
    ? { nodes: useProjectStore.getState().nodes, edges: useProjectStore.getState().edges }
    : undefined;

  const { data, error } = await supabase.functions.invoke("ai-industrial-architect", {
    body: { prompt, context },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "Falha desconhecida");
  return data.system as ArchitectResult;
}

export function applyArchitectToStore(result: ArchitectResult, opts: { mode: "replace" | "merge" } = { mode: "replace" }) {
  const store = useProjectStore.getState();

  const nodes: IndustrialNode[] = result.nodes.map((n) => ({
    id: n.id,
    kind: (n.kind as NodeKind) || "motor",
    category: (n.category as NodeCategory) || "mech",
    label: n.label || n.id,
    position: n.position,
    params: (n.params as any) ?? {},
    energized: n.category === "power" || n.category === "mech",
  }));

  const edges: IndustrialEdge[] = result.edges.map((e, i) => ({
    id: `ai-${Date.now()}-${i}`,
    source: e.source,
    target: e.target,
    kind: e.kind,
  }));

  // Push directly into the store (bypassing addNode to preserve AI-given ids/positions)
  useProjectStore.setState((s) => ({
    nodes: opts.mode === "replace" ? nodes : [...s.nodes, ...nodes.filter(n => !s.nodes.find(x => x.id === n.id))],
    edges: opts.mode === "replace" ? edges : [...s.edges, ...edges],
    selectedId: nodes[0]?.id ?? null,
    logs: [
      { t: new Date().toISOString(), tag: "AI", msg: `Sistema gerado: ${result.title} · ${nodes.length} nós · ${edges.length} ligações`, lvl: "ok", channel: "IA" },
      ...s.logs,
    ].slice(0, 200),
  }));

  return { nodes: nodes.length, edges: edges.length };
}
