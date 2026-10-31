// Contrato 2 — Equipamentos elétricos → associações de controle (Ladder/FBD).
//
// Lê o modelo canônico (UnifiedProjectDoc), percorre o grafo de potência a
// partir de cada carga motora e só gera vínculos quando a topologia do ramo é
// inequívoca. Lacunas e ambiguidades viram `ModelDiagnostic` com
// `requiresUserIntervention: true` — nunca inventamos contatores, tags
// de campo ou endereços.
import type { IndustrialEdge, IndustrialNode, NodeCategory, NodeKind } from "@/lib/project-store";
import {
  analyzeUnifilarForLadder,
  type BridgeResult,
} from "@/lib/simulation/unifilar-ladder-bridge";
import type { CanonicalEquipment, ModelDiagnostic, UnifiedProjectDoc } from "./unified-schema";
import { useUnifiedProjectStore } from "./unified-store";

export type BridgeDiagnostic = Omit<ModelDiagnostic, "id" | "createdAt">;

export const CONTROL_BRIDGE_DIAGNOSTIC_CODES = [
  "CONTROL_BRIDGE_MISSING_CONTACTOR",
  "CONTROL_BRIDGE_MISSING_PROTECTION",
  "CONTROL_BRIDGE_AMBIGUOUS_STARTER_TOPOLOGY",
] as const;

export interface ControlBridgeAnalysis {
  result: BridgeResult;
  diagnostics: BridgeDiagnostic[];
  /** Ramo de cada carga motora (equipmentIds), para vínculos e testes. */
  branches: Record<string, BranchInfo>;
}

export interface BranchInfo {
  loadId: string;
  contactors: string[];
  switching: string[];
  protections: string[];
  overloadRelays: string[];
}

/** Nós que delimitam o ramo: não atravessamos fontes nem outras cargas. */
const BRANCH_STOP_KINDS: ReadonlySet<string> = new Set([
  "busbar",
  "transformer",
  "ccm",
  "psu",
  "motor",
  "load",
  "lamp",
  "socket",
]);

const categoryFor = (eq: CanonicalEquipment): NodeCategory => {
  switch (eq.category) {
    case "source":
    case "protection":
    case "switching":
    case "drive":
      return "power";
    case "load":
      return "mech";
    case "instrumentation":
    case "safety":
      return "inst";
    default:
      return "logic";
  }
};

/** Converte o modelo canônico no formato de entrada do analisador existente. */
export function unifiedDocToBridgeInput(doc: UnifiedProjectDoc): {
  nodes: IndustrialNode[];
  edges: IndustrialEdge[];
} {
  const nodes: IndustrialNode[] = Object.values(doc.engineering.equipments).map((eq) => ({
    id: eq.id,
    kind: eq.catalogType as NodeKind,
    category: categoryFor(eq),
    label: eq.displayName || eq.tagCode,
    position: { x: 0, y: 0 },
    params: {},
  }));
  const edges: IndustrialEdge[] = Object.values(doc.engineering.connections)
    .filter((c) => c.kind === "power" || c.kind === "signal" || c.kind === "pipe")
    .map((c) => ({
      id: c.id,
      source: c.fromEquipmentId,
      target: c.toEquipmentId,
      kind: c.kind as IndustrialEdge["kind"],
    }));
  return { nodes, edges };
}

function branchOf(doc: UnifiedProjectDoc, loadId: string): BranchInfo {
  const adj = new Map<string, string[]>();
  for (const c of Object.values(doc.engineering.connections)) {
    if (c.kind !== "power") continue;
    (adj.get(c.fromEquipmentId) ?? adj.set(c.fromEquipmentId, []).get(c.fromEquipmentId)!).push(
      c.toEquipmentId,
    );
    (adj.get(c.toEquipmentId) ?? adj.set(c.toEquipmentId, []).get(c.toEquipmentId)!).push(
      c.fromEquipmentId,
    );
  }

  const info: BranchInfo = {
    loadId,
    contactors: [],
    switching: [],
    protections: [],
    overloadRelays: [],
  };
  const seen = new Set<string>([loadId]);
  const queue = [...(adj.get(loadId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const eq = doc.engineering.equipments[id];
    if (!eq) continue;
    if (BRANCH_STOP_KINDS.has(eq.catalogType)) continue;
    switch (eq.catalogType) {
      case "contactor":
        info.contactors.push(id);
        info.switching.push(id);
        break;
      case "vfd":
      case "softstarter":
        info.switching.push(id);
        break;
      case "breaker":
      case "fuse":
      case "rcd":
      case "disconnector":
        info.protections.push(id);
        break;
      case "relay":
        info.overloadRelays.push(id);
        break;
    }
    queue.push(...(adj.get(id) ?? []));
  }
  return info;
}

const diag = (
  d: Omit<BridgeDiagnostic, "sourceRepresentation" | "targetRepresentation" | "message"> & {
    message: string;
  },
): BridgeDiagnostic => ({
  ...d,
  sourceRepresentation: "unifilar",
  targetRepresentation: "ladder",
});

/** Analisa o modelo canônico. Função pura. */
export function analyzeControlBridge(doc: UnifiedProjectDoc): ControlBridgeAnalysis {
  const { nodes, edges } = unifiedDocToBridgeInput(doc);
  const result = analyzeUnifilarForLadder(nodes, edges);

  const diagnostics: BridgeDiagnostic[] = [];
  const branches: Record<string, BranchInfo> = {};

  for (const eq of Object.values(doc.engineering.equipments)) {
    if (eq.catalogType !== "motor") continue;
    const branch = branchOf(doc, eq.id);
    branches[eq.id] = branch;
    const label = eq.tagCode || eq.displayName || eq.id;
    const dol = (eq.specs.startingMethod ?? "DOL") === "DOL";

    if (branch.contactors.length > 1) {
      diagnostics.push(
        diag({
          severity: "error",
          code: "CONTROL_BRIDGE_AMBIGUOUS_STARTER_TOPOLOGY",
          message: `Motor ${label}: ${branch.contactors.length} contatores no mesmo ramo — confirme se é reversora, estrela-triângulo ou outra topologia.`,
          messageParams: { motor: label, contactors: branch.contactors.length },
          entityIds: [eq.id, ...branch.contactors],
          requiresUserIntervention: true,
        }),
      );
    } else if (dol && branch.switching.length === 0) {
      diagnostics.push(
        diag({
          severity: "warning",
          code: "CONTROL_BRIDGE_MISSING_CONTACTOR",
          message: `Motor ${label} (partida direta) não possui contator no ramo. Insira o contator no unifilar ou cancele a geração para este ramo.`,
          messageParams: { motor: label },
          entityIds: [eq.id],
          requiresUserIntervention: true,
        }),
      );
    }

    if (branch.protections.length === 0) {
      diagnostics.push(
        diag({
          severity: "warning",
          code: "CONTROL_BRIDGE_MISSING_PROTECTION",
          message: `Motor ${label} não possui dispositivo de proteção no ramo.`,
          messageParams: { motor: label },
          entityIds: [eq.id],
          requiresUserIntervention: true,
        }),
      );
    }
  }

  return { result, diagnostics, branches };
}

export interface ApplyControlBridgeSummary {
  tagsUpserted: number;
  bindingsCreated: number;
  diagnosticsRecorded: number;
}

/**
 * Materializa a análise no modelo canônico: tags e `ControlBinding` apenas
 * para ramos inequívocos; todas as lacunas são registradas como diagnóstico.
 * Idempotente (ids determinísticos; diagnósticos anteriores do contrato são
 * substituídos).
 */
export function applyControlBridgeToModel(
  analysis: ControlBridgeAnalysis,
): ApplyControlBridgeSummary {
  const store = useUnifiedProjectStore.getState();
  let tagsUpserted = 0;
  let bindingsCreated = 0;

  for (const code of CONTROL_BRIDGE_DIAGNOSTIC_CODES) store.clearDiagnostics({ code });

  const ensureTag = (
    name: string,
    area: "I" | "Q",
    linkedEquipmentId: string,
    description: string,
  ): string => {
    const existing = Object.values(useUnifiedProjectStore.getState().doc.engineering.tags).find(
      (t) => t.name === name,
    );
    const id = existing?.id ?? `tag_${name}`;
    useUnifiedProjectStore.getState().upsertTag({
      id,
      name,
      dataType: "BOOL",
      area,
      address: existing?.address,
      initialValue: existing?.initialValue ?? false,
      forced: existing?.forced ?? false,
      retentive: existing?.retentive ?? false,
      description: existing?.description || description,
      linkedEquipmentId,
      plcChannelId: existing?.plcChannelId,
    });
    tagsUpserted += 1;
    return id;
  };

  const doc = useUnifiedProjectStore.getState().doc;
  for (const m of analysis.result.mappings) {
    if (m.mappingType !== "command" || m.equipmentType !== "motor") continue;
    const branch = analysis.branches[m.unifilarNodeId];
    if (!branch) continue;

    // Só vincula ao contator quando ele é único (equivalência inequívoca).
    if (branch.contactors.length === 1) {
      const contactorId = branch.contactors[0];
      const tagId = ensureTag(
        m.ladderTagName,
        "Q",
        contactorId,
        `Bobina do contator (${doc.engineering.equipments[contactorId]?.tagCode ?? contactorId})`,
      );
      useUnifiedProjectStore.getState().bindControl({
        id: `cb_${contactorId}_main_contactor_coil`,
        equipmentId: contactorId,
        role: "main_contactor_coil",
        tagId,
        terminalIds: [`${contactorId}:A1`, `${contactorId}:A2`],
      });
      bindingsCreated += 1;

      if (branch.overloadRelays.length === 1) {
        const relayId = branch.overloadRelays[0];
        const olTagId = ensureTag(
          `${m.ladderTagName.replace(/_CMD$/, "")}_OL`,
          "I",
          relayId,
          "Contato NF do relé de sobrecarga",
        );
        useUnifiedProjectStore.getState().bindControl({
          id: `cb_${relayId}_overload_trip_nc`,
          equipmentId: relayId,
          role: "overload_trip_nc",
          tagId: olTagId,
          terminalIds: [`${relayId}:95`, `${relayId}:96`],
        });
        bindingsCreated += 1;
      }
    }
  }

  let diagnosticsRecorded = 0;
  for (const d of analysis.diagnostics) {
    useUnifiedProjectStore.getState().recordDiagnostic(d);
    diagnosticsRecorded += 1;
  }

  return { tagsUpserted, bindingsCreated, diagnosticsRecorded };
}
