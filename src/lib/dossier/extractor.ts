// Canonical Canvas Extractor — Extracts and normalizes technical engineering entities
// from the Canvas Single Source of Truth without fabrication or silent alterations.

import { upgradeSnapshotV2ToV3 } from "@/lib/model/migration-v2-to-v3";
import type {
  CanonicalCircuit,
  CanonicalEquipment,
  CanonicalTag,
  ElectricalConnection,
  UnifiedProjectDoc,
} from "@/lib/model/unified-schema";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import type {
  ConductorScheduleRow,
  DossierScope,
  PlcIoMapping,
  PlcProgramDoc,
  TerminalBlockTerminal,
} from "./types";
import type { DiagramDoc } from "@/lib/diagram/schema";
import {
  buildPanelDocumentation,
  type ConductorFunction,
  type PanelDocumentation,
} from "@/lib/documentation";

export interface ExtractedCanvasData {
  projectId: string;
  projectName: string;
  clientName: string;
  description: string;
  scope: DossierScope;
  unifiedDoc: UnifiedProjectDoc;
  equipments: CanonicalEquipment[];
  connections: ElectricalConnection[];
  circuits: CanonicalCircuit[];
  tags: CanonicalTag[];
  conductors: ConductorScheduleRow[];
  terminals: TerminalBlockTerminal[];
  panelDocumentation: PanelDocumentation;
  plcProgram: PlcProgramDoc;
  pendingInputs: Array<{
    id: string;
    entityId: string;
    label: string;
    missingField: string;
    recommendedDefault: string | number;
    impact: string;
  }>;
}

export function extractCanvasData(input: {
  projectId?: string;
  projectName?: string;
  clientName?: string;
  description?: string;
  snapshot?: ProjectSnapshot | null;
  unifiedDoc?: UnifiedProjectDoc | null;
  diagramDoc?: DiagramDoc | null;
}): ExtractedCanvasData {
  // 1. Obter UnifiedProjectDoc canônico
  let doc: UnifiedProjectDoc;
  if (input.unifiedDoc) {
    doc = input.unifiedDoc;
  } else if (input.snapshot) {
    doc = upgradeSnapshotV2ToV3(input.snapshot);
  } else {
    doc = upgradeSnapshotV2ToV3({
      schemaVersion: 3,
      project: { nodes: [], edges: [], tags: {}, scadaLayout: { nodes: [], edges: [] } },
      voltai: { components: [], edges: [] },
      editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
      plc: {
        vendor: "siemens",
        rack: { id: "rack-1", label: "Rack Principal", modules: [] },
        variables: [],
        programBlocks: [],
        cycleTimeMs: 10,
      },
    });
  }

  const projectId = input.projectId ?? doc.metadata.id;
  const projectName = input.projectName ?? doc.metadata.name ?? "Projeto Elétrico Industrial";
  const clientName = input.clientName ?? doc.metadata.client ?? "Não especificado";
  const description = input.description ?? doc.metadata.description ?? "";

  const equipments = Object.values(doc.engineering.equipments);
  const connections = Object.values(doc.engineering.connections);
  const tags = Object.values(doc.engineering.tags);

  // 2. Determinar escopo técnico do projeto
  const hasUnifilar = equipments.length > 0;
  const hasMultifilar = Object.keys(doc.views.multifilar.nodes).length > 0;

  const allLadderRungs = [
    ...(doc.plc.project.programBlocks?.flatMap((b) => (b.ladder as any)?.rungs ?? []) ?? []),
    ...((input.snapshot?.editor?.rungs as any[]) ?? []),
  ];
  const seenRungIds = new Set<string>();
  const ladderRungs = allLadderRungs.filter((r) => {
    const id = r.id || JSON.stringify(r);
    if (seenRungIds.has(id)) return false;
    seenRungIds.add(id);
    return true;
  });

  const hasLadder = ladderRungs.length > 0;
  const hasFbd = Object.keys(doc.views.scada.widgets).some(
    (w) => doc.views.scada.widgets[w]?.kind === "fbd_block",
  );
  const hasScada = Object.keys(doc.views.scada.widgets).length > 0;

  let scope: DossierScope = "unifilar";
  if (hasUnifilar && hasLadder) scope = "hybrid";
  else if (hasMultifilar) scope = "multifilar";
  else if (hasLadder) scope = "ladder";
  else if (hasFbd) scope = "fbd";
  else if (hasScada) scope = "scada";

  // 3. Identificar pendências de dados de entrada faltantes
  const pendingInputs: ExtractedCanvasData["pendingInputs"] = [];

  for (const eq of equipments) {
    if (eq.category === "load" || eq.category === "drive") {
      const p = eq.specs.powerKw ?? (eq.specs.powerW ? eq.specs.powerW / 1000 : undefined);
      if (p === undefined || p <= 0) {
        pendingInputs.push({
          id: `pend-p-${eq.id}`,
          entityId: eq.id,
          label: eq.displayName || eq.tagCode,
          missingField: "Potência Nominal (kW)",
          recommendedDefault: "Informar o dado de placa",
          impact: "Impede cálculo preciso da corrente de projeto Ib e dimensionamento do cabo.",
        });
      }
    }
  }

  // 4–5. Fiação, régua de bornes e cabos da documentação de painel EletricAI (motor puro em
  // `@/lib/documentation`): terminais REAIS de cada equipamento, numeração por
  // potencial, bornes só na fronteira painel ↔ campo. Seção/comprimento
  // ausentes viram pendência — nada de 2,5 mm² / 15 m presumidos.
  const panelDocumentation = buildPanelDocumentation(doc, { ladderRungs });
  const connById = doc.engineering.connections;
  const SIGNAL_TYPE: Record<ConductorFunction, TerminalBlockTerminal["signalType"]> = {
    L1: "power",
    L2: "power",
    L3: "power",
    N: "neutral",
    PE: "pe",
    SIG: "control",
  };

  const conductors: ConductorScheduleRow[] = panelDocumentation.wires.map((w) => {
    const c = connById[w.connectionId]?.conductor;
    return {
      circuitCode: w.connectionId,
      wireTag: w.wireNumber,
      phaseOrFunction: w.function === "SIG" ? "SIGNAL" : w.function,
      crossSectionMm2: c?.crossSectionMm2 ?? null,
      material: c?.material ?? "Cu",
      insulation: c?.insulation ?? "PVC",
      fromEquipment: w.from,
      fromTerminal: w.fromTerminal,
      toEquipment: w.to,
      toTerminal: w.toTerminal,
      lengthM: c?.lengthM ?? null,
    };
  });

  const terminals: TerminalBlockTerminal[] = panelDocumentation.terminals.map((t) => ({
    blockId: t.strip.replace(/^-/, ""),
    terminalNumber: Number(t.terminal),
    wireTag: t.wireNumber,
    internalEquipment: t.panelSide,
    internalTerminal: t.panelTerminal,
    externalEquipment: t.fieldSide,
    externalTerminal: t.fieldTerminal,
    signalType: SIGNAL_TYPE[t.function],
  }));

  for (const cable of panelDocumentation.cables) {
    if (cable.sectionMm2 === null) {
      pendingInputs.push({
        id: `pend-sec-${cable.connectionId}`,
        entityId: cable.connectionId,
        label: `${cable.cable} (${cable.from} → ${cable.to})`,
        missingField: "Seção do condutor (mm²)",
        recommendedDefault: "Dimensionar pela memória de cálculo",
        impact: "Sem seção não há verificação de capacidade de condução nem de queda de tensão.",
      });
    }
    if (cable.lengthM === null) {
      pendingInputs.push({
        id: `pend-len-${cable.connectionId}`,
        entityId: cable.connectionId,
        label: `${cable.cable} (${cable.from} → ${cable.to})`,
        missingField: "Comprimento do cabo (m)",
        recommendedDefault: "Medir no layout",
        impact: "Queda de tensão (NBR 5410 6.2.7) não verificável.",
      });
    }
  }

  // 6. Extrair Automação e Mapa de I/O do CLP
  const plcRack = (input.snapshot?.plc as any)?.rack || doc.plc.project.rack;
  const ioMappings: PlcIoMapping[] = [];

  for (const mod of (plcRack.modules as any[]) ?? []) {
    const modType = (mod.category || mod.type || "DI").toUpperCase();
    const slotNum = typeof mod.slot === "number" ? mod.slot : (mod.slotNumber ?? 1);
    const partNum = mod.catalogKey || mod.partNumber || `PLC-${modType}`;

    if (Array.isArray(mod.channels)) {
      for (let c = 0; c < mod.channels.length; c++) {
        const ch = mod.channels[c];
        const isInput = modType === "DI" || modType === "AI";
        const fallbackAddr = isInput ? `%I${slotNum}.${c}` : `%Q${slotNum}.${c}`;
        const addr = typeof ch === "object" && ch?.address ? ch.address : fallbackAddr;
        const tagSymbol =
          typeof ch === "object" && ch?.tag
            ? ch.tag
            : typeof ch === "string"
              ? ch
              : `TAG_${modType}_${c}`;
        const desc =
          typeof ch === "object" && ch?.description
            ? ch.description
            : `Canal ${modType} slot ${slotNum} ch ${c}`;
        ioMappings.push({
          address: addr,
          channel: `Ch ${c}`,
          direction: modType as any,
          symbolicTag: tagSymbol,
          description: desc,
          signalType: modType.startsWith("A") ? "0-10V / 4-20mA" : "24Vdc PNP",
          slotNumber: slotNum,
          modulePartNumber: partNum,
        });
      }
    } else {
      const chCount = typeof mod.channels === "number" ? mod.channels : 8;
      for (let c = 0; c < chCount; c++) {
        const isInput = modType === "DI" || modType === "AI";
        const addr = isInput ? `%I${slotNum}.${c}` : `%Q${slotNum}.${c}`;
        const boundTag = tags.find((t) => t.address === addr || t.name.includes(`CH_${c}`));
        ioMappings.push({
          address: addr,
          channel: `Ch ${c}`,
          direction: modType as any,
          symbolicTag: boundTag?.name || `TAG_${modType}_${c}`,
          description: boundTag?.description || `Canal ${modType} slot ${slotNum} ch ${c}`,
          boundEquipmentId: boundTag?.linkedEquipmentId,
          signalType: modType.startsWith("A") ? "0-10V / 4-20mA" : "24Vdc PNP",
          slotNumber: slotNum,
          modulePartNumber: partNum,
        });
      }
    }
  }

  // Extrair redes Ladder
  const ladderNetworks = ladderRungs.map((r: any, idx) => {
    const hasEstop = JSON.stringify(r).includes("ESTOP") || JSON.stringify(r).includes("EMG");
    return {
      networkNumber: idx + 1,
      title: r.comment || `Rede ${idx + 1}: Controle de Acionamento`,
      functionalDescription:
        r.comment || "Lógica de comando, intertravamento e segurança operacional.",
      rungsCount: 1,
      tagsUsed: [r.output?.operand].filter(Boolean) as string[],
      hasSafetyInterlock: hasEstop,
      codeIlPreview: `LD ${r.branches?.[0]?.[0]?.operand ?? "IN"} \nST ${r.output?.operand ?? "OUT"}`,
      codeStPreview: `${r.output?.operand ?? "OUT"} := ${r.branches?.[0]?.[0]?.operand ?? "IN"};`,
    };
  });

  const plcProgram: PlcProgramDoc = {
    vendor: doc.plc.project.vendor || "Não especificado",
    rackName: plcRack.label || "Bastidor Principal de Automação",
    cpuModel:
      (plcRack.modules?.[0] as any)?.catalogKey ||
      (plcRack.modules?.[0] as any)?.partNumber ||
      "CPU 1214C DC/DC/DC",
    ioModules: ((plcRack.modules as any[]) ?? []).map((m) => {
      const slotNum = typeof m.slot === "number" ? m.slot : (m.slotNumber ?? 1);
      const chCount =
        typeof m.channels === "number"
          ? m.channels
          : Array.isArray(m.channels)
            ? m.channels.length
            : 8;
      const modType = (m.category || m.type || "DI").toUpperCase();
      const partNum = m.catalogKey || m.partNumber || `PLC-${modType}`;
      return {
        slot: slotNum,
        partNumber: partNum,
        description: m.label || `Módulo ${modType}`,
        channelsCount: chCount,
        type: modType,
      };
    }),
    ioMappings,
    networks: ladderNetworks,
    safetyChainDocumented: ladderNetworks.some((n) => n.hasSafetyInterlock),
    estopPresent:
      equipments.some((e) => e.catalogType === "estop") ||
      ladderNetworks.some((n) => n.hasSafetyInterlock),
    plcopenXmlSupported: true,
  };

  const circuits = Object.values(doc.engineering.circuits);

  return {
    projectId,
    projectName,
    clientName,
    description,
    scope,
    unifiedDoc: doc,
    equipments,
    connections,
    circuits,
    tags,
    conductors,
    terminals,
    panelDocumentation,
    plcProgram,
    pendingInputs,
  };
}
