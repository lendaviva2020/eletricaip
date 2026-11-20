// "Aplicar e abrir Workspace" do /ai: o snapshot gravado no projeto novo precisa
// passar no SnapshotSchema do servidor e conter o diagrama gerado — antes o
// workspace abria sem projeto e o canvas ficava vazio.
import { beforeEach, describe, expect, it } from "vitest";
import { useDiagramStore } from "@/lib/diagram/store";
import { useProjectStore } from "@/lib/project-store";
import { applyArchitectToStore, type ArchitectResult } from "@/lib/ai-architect-client";
import { buildProjectSnapshot } from "@/lib/use-project-persistence";
import { SnapshotSchema } from "@/lib/projects.functions";

const result: ArchitectResult = {
  title: "Bombeamento",
  rationale: "Partida direta",
  transformer: { kVA: 75, primary_kV: 13.8, secondary_V: 380 },
  ccm: { columns: 1, cells: 1 },
  motors: [{ id: "M1", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" }],
  nodes: [
    {
      id: "Q1",
      kind: "breaker",
      category: "power",
      label: "Q1",
      position: { x: 300, y: 100 },
      params: { in_A: 32, poles: 3 },
    },
    {
      id: "K1",
      kind: "contactor",
      category: "power",
      label: "K1",
      position: { x: 300, y: 220 },
      params: { in_A: 25, coil_V: 24 },
    },
    {
      id: "M1",
      kind: "motor",
      category: "mech",
      label: "M1",
      position: { x: 300, y: 340 },
      params: { power_kW: 7.5, voltage_V: 380 },
    },
  ],
  edges: [
    { source: "Q1", target: "K1", kind: "power" },
    { source: "K1", target: "M1", kind: "power" },
  ],
} as ArchitectResult;

describe("/ai → projeto novo", () => {
  beforeEach(() => {
    useDiagramStore.getState().resetDoc();
    useProjectStore.setState({ nodes: [], edges: [], logs: [] });
  });

  it("snapshot do resultado aplicado é aceito pelo servidor e carrega o diagrama", () => {
    applyArchitectToStore(result, { mode: "replace" });
    const parsed = SnapshotSchema.safeParse(buildProjectSnapshot());
    expect(parsed.success).toBe(true);
    const unifilar = Object.values(useDiagramStore.getState().doc.nodes).filter(
      (n) => n.sheet === "unifilar",
    );
    expect(unifilar.length).toBeGreaterThanOrEqual(3);
    // Valores nominais da IA chegam marcados como não confirmados.
    const motor = unifilar.find((n) => n.params.kind === "motor");
    expect((motor?.params as { unconfirmed?: string[] }).unconfirmed).toContain("power_kW");
  });
});
