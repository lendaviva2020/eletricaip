/**
 * Documentação EletricAI: pacote de documentação de painel derivado do
 * modelo canônico: identificação de equipamentos, referência cruzada,
 * numeração de fios, régua de bornes, lista de cabos e verificação.
 */
import type { UnifiedProjectDoc } from "@/lib/model/unified-schema";
import { designateDevices, type DesignationOptions } from "./device-designation";
import { buildWiring } from "./wiring";
import { buildCrossReference, extractLadderUsages } from "./cross-reference";

export * from "./device-designation";
export * from "./wiring";
export * from "./cross-reference";

export interface DocumentationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  ref: string;
  message: string;
}

export function buildPanelDocumentation(
  doc: UnifiedProjectDoc,
  options: DesignationOptions & { ladderRungs?: readonly unknown[] } = {},
) {
  const equipmentsById = doc.engineering.equipments;
  const equipments = Object.values(equipmentsById);
  const connections = Object.values(doc.engineering.connections);

  const { devices, issues: designationIssues } = designateDevices(equipments, options);
  const wiring = buildWiring(equipmentsById, connections, devices);

  const powered = new Set<string>();
  for (const c of connections) {
    if (c.kind !== "power") continue;
    powered.add(c.fromEquipmentId);
    powered.add(c.toEquipmentId);
  }
  const rungs = [
    ...(options.ladderRungs ?? []),
    ...(doc.plc.project.programBlocks ?? []).map(
      (b) => (b as { ladder?: { rungs?: unknown[] } }).ladder?.rungs ?? [],
    ),
  ];
  const crossRef = buildCrossReference({
    equipmentsById,
    devices,
    usages: extractLadderUsages(rungs),
    tags: Object.values(doc.engineering.tags),
    poweredEquipmentIds: powered,
  });

  const issues: DocumentationIssue[] = [
    ...designationIssues.map((i) => ({
      code: i.code,
      severity: i.severity,
      ref: i.equipmentIds.join(", "),
      message: i.message,
    })),
    ...wiring.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      ref: i.connectionId,
      message: i.message,
    })),
    ...crossRef.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      ref: i.equipmentId,
      message: i.message,
    })),
  ];
  const rank = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));

  return {
    devices,
    wires: wiring.wires,
    terminals: wiring.terminals,
    cables: wiring.cables,
    crossReference: crossRef.rows,
    issues,
  };
}

export type PanelDocumentation = ReturnType<typeof buildPanelDocumentation>;
