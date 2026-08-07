// Verificação combinada do projeto gerado pela IA:
// Etapa 1 — normativa (validateProject) · Etapa 2 — simulação do interlock de E-STOP.
import type { IndustrialNode, IndustrialEdge } from "@/lib/project-store";
import { validateProject } from "@/lib/norm-validator";
import { fromAiRungSpecs } from "@/lib/ladder/from-ai-spec";
import { verifyEstopInterlock } from "@/lib/ladder/verify-estop";
import type { VerificationFinding } from "@/lib/ai/verification-types";

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function toIndustrialGraph(
  nodes: any[],
  edges: any[],
): { nodes: IndustrialNode[]; edges: IndustrialEdge[] } {
  return {
    nodes: nodes.map((n) => ({
      id: String(n?.id ?? ""),
      kind: (n?.kind ?? "motor") as IndustrialNode["kind"],
      category: (n?.category ?? "mech") as IndustrialNode["category"],
      label: String(n?.label ?? n?.id ?? ""),
      position: { x: Number(n?.position?.x) || 0, y: Number(n?.position?.y) || 0 },
      params: (n?.params ?? {}) as IndustrialNode["params"],
    })),
    edges: edges.map((e, i) => ({
      id: `ai-${i}`,
      source: String(e?.source ?? ""),
      target: String(e?.target ?? ""),
      kind: (e?.kind ?? "power") as IndustrialEdge["kind"],
    })),
  };
}

export function runVerification(parsed: unknown): VerificationFinding[] {
  const p = parsed as any;
  const graph = toIndustrialGraph(arr(p?.nodes), arr(p?.edges));
  const norms: VerificationFinding[] = validateProject(graph.nodes, graph.edges).map((f) => ({
    ...f,
    kind: "norm" as const,
  }));
  let logic: VerificationFinding[] = [];
  try {
    const rungs = fromAiRungSpecs(p?.plcLogic?.rungs);
    logic = verifyEstopInterlock(rungs, graph.nodes, graph.edges).map((f) => ({
      ...f,
      kind: "logic" as const,
    }));
  } catch (e) {
    console.warn("[architect] verifyEstopInterlock falhou:", (e as Error).message);
  }
  return [...norms, ...logic];
}
