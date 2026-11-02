// Bidirectional Migration & Projection between Legacy Snapshot (v2) and UnifiedProjectDoc (v3)
import { ulid } from "ulid";
import {
  DIAGRAM_DOC_VERSION,
  DiagramDocSchema,
  type DiagramDoc,
  type DiagramEdge,
  type DiagramNode,
  type NodeKind as DiagramNodeKind,
  type NodeParams,
} from "@/lib/diagram/schema";
import type {
  IndustrialEdge,
  IndustrialNode,
  NodeCategory as LegacyNodeCategory,
  NodeKind as LegacyNodeKind,
} from "@/lib/project-store";
import type { EditorTag, FbdEdge, FbdNode } from "@/lib/editor/store";
import { newRung, type LadderRung } from "@/lib/ladder/types";
import {
  createDefaultPlcProject,
  type PlcProgramBlock,
  type PlcProject,
  type PlcVariable,
} from "@/lib/plc/types";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import {
  UNIFIED_SCHEMA_VERSION,
  defaultCategoryForKind,
  defaultPhasesForKind,
  defaultTerminalsForEquipment,
  inferAreaFromAddress,
  type ApplicableStandard,
  type CanonicalEquipment,
  type CanonicalTag,
  type ElectricalConnection,
  type EquipmentSpecs,
  type ModelDiagnostic,
  type ProjectMetadata,
  type ScadaEdgeLayout,
  type ScadaWidgetLayout,
  type TagDataType,
  type UnifiedProjectDoc,
} from "./unified-schema";
import { resolveTerminalCode } from "@/lib/diagram/connection/connection-engine";

export function createEmptyUnifiedDoc(partialMeta?: Partial<ProjectMetadata>): UnifiedProjectDoc {
  const now = new Date().toISOString();
  const defaultPlc = createDefaultPlcProject();
  const ob1 = defaultPlc.programBlocks.find((b) => b.type === "OB") ?? defaultPlc.programBlocks[0];
  if (ob1 && !ob1.ladder) {
    ob1.ladder = { rungs: [newRung(0)] };
  }
  const fc1 =
    defaultPlc.programBlocks.find((b) => b.type === "FC") ??
    defaultPlc.programBlocks[1] ??
    defaultPlc.programBlocks[0];

  const tags: Record<string, CanonicalTag> = {};
  for (const v of defaultPlc.variables) {
    tags[v.id] = {
      id: v.id,
      name: v.name,
      dataType: v.type,
      area: inferAreaFromAddress(v.address, v.name),
      address: v.address,
      initialValue: v.initialValue ?? (v.type === "BOOL" ? false : 0),
      forced: false,
      retentive: v.retentive,
      description: v.comment,
    };
  }

  return {
    schemaVersion: UNIFIED_SCHEMA_VERSION,
    metadata: {
      id: partialMeta?.id ?? `proj_${ulid()}`,
      name: partialMeta?.name ?? "Novo projeto",
      description: partialMeta?.description ?? null,
      client: partialMeta?.client ?? null,
      schemaVersion: UNIFIED_SCHEMA_VERSION,
      applicableStandards: partialMeta?.applicableStandards ?? ["NBR_5410"],
      nominalSystem: partialMeta?.nominalSystem ?? {
        frequencyHz: 60,
        lowVoltageV: 380,
        mediumVoltageKv: 13.8,
        earthingScheme: "TN-S",
      },
      revision: partialMeta?.revision ?? 1,
      updatedAt: partialMeta?.updatedAt ?? now,
    },
    engineering: {
      equipments: {},
      connections: {},
      circuits: {},
      tags,
      controlBindings: {},
      plcChannels: {},
    },
    plc: {
      project: defaultPlc,
      activeLadderBlockId: ob1?.id ?? "pb-1",
      activeFbdBlockId: fc1?.id ?? "pb-2",
    },
    views: {
      diagramDocId: `doc_${ulid()}`,
      sheets: ["unifilar"],
      unifilar: { nodes: {}, edges: {} },
      multifilar: { nodes: {}, edges: {} },
      scada: { widgets: {}, edges: [] },
      twin: { mappings: [], nameplates: {}, modelUrl: null },
    },
    studies: {},
    diagnostics: [],
  };
}

// ── Extract Canonical Specs from DiagramNode Params ─────────────────────────

export function extractSpecsFromDiagramParams(params: NodeParams): EquipmentSpecs {
  const specs: EquipmentSpecs = {};
  switch (params.kind) {
    case "breaker":
      specs.nominalCurrentA = params.in_A;
      specs.tripCurve = params.curve;
      specs.poles = params.poles;
      if (params.icc_kA !== undefined) specs.breakingCapacityKa = params.icc_kA;
      break;
    case "rcd":
      specs.nominalCurrentA = params.in_A;
      specs.rcdSensitivityMa = params.sensitivity_mA;
      specs.poles = params.poles;
      break;
    case "contactor":
      specs.nominalCurrentA = params.in_A;
      specs.coilVoltageV = params.coil_V;
      break;
    case "relay":
      specs.coilVoltageV = params.coil_V;
      break;
    case "fuse":
    case "disconnector":
      specs.nominalCurrentA = params.in_A;
      break;
    case "transformer":
      specs.apparentPowerKva = params.kVA;
      specs.primaryV = params.primary_V;
      specs.secondaryV = params.secondary_V;
      break;
    case "psu":
      specs.voltageV = params.output_V;
      specs.nominalCurrentA = params.output_A;
      break;
    case "vfd":
      specs.powerKw = params.power_kW;
      specs.voltageV = params.voltage_V;
      break;
    case "softstarter":
      specs.powerKw = params.power_kW;
      break;
    case "busbar":
      specs.nominalCurrentA = params.current_A;
      specs.voltageV = params.voltage_V;
      break;
    case "motor":
      specs.powerKw = params.power_kW;
      specs.voltageV = params.voltage_V;
      if (params.fla_A !== undefined) specs.nominalCurrentA = params.fla_A;
      specs.startingMethod = params.startMethod;
      break;
    case "load":
      specs.powerW = params.power_W;
      specs.voltageV = params.voltage_V;
      specs.powerFactor = params.fp;
      break;
    case "lamp":
      specs.powerW = params.power_W;
      specs.voltageV = params.voltage_V;
      break;
    case "socket":
      specs.nominalCurrentA = params.current_A;
      specs.voltageV = params.voltage_V;
      break;
  }
  return specs;
}

export function mergeSpecsIntoDiagramParams(
  baseParams: NodeParams | undefined,
  catalogType: string,
  specs: EquipmentSpecs,
  tagCode?: string,
): NodeParams {
  const kind = (baseParams?.kind ?? catalogType) as DiagramNodeKind;
  const tag = tagCode ?? baseParams?.tag;

  switch (kind) {
    case "breaker":
      return {
        kind: "breaker",
        tag,
        notes: baseParams?.notes,
        in_A:
          specs.nominalCurrentA ??
          (baseParams?.kind === "breaker" && baseParams.in_A ? baseParams.in_A : 32),
        curve:
          specs.tripCurve === "B" || specs.tripCurve === "C" || specs.tripCurve === "D"
            ? specs.tripCurve
            : baseParams?.kind === "breaker"
              ? baseParams.curve
              : "C",
        poles: specs.poles ?? (baseParams?.kind === "breaker" ? baseParams.poles : 3),
        icc_kA:
          specs.breakingCapacityKa ??
          (baseParams?.kind === "breaker" ? baseParams.icc_kA : undefined),
      };
    case "rcd":
      return {
        kind: "rcd",
        tag,
        notes: baseParams?.notes,
        in_A:
          specs.nominalCurrentA ??
          (baseParams?.kind === "rcd" && baseParams.in_A ? baseParams.in_A : 40),
        sensitivity_mA:
          specs.rcdSensitivityMa ?? (baseParams?.kind === "rcd" ? baseParams.sensitivity_mA : 30),
        poles: specs.poles ?? (baseParams?.kind === "rcd" ? baseParams.poles : 4),
      };
    case "contactor":
      return {
        kind: "contactor",
        tag,
        notes: baseParams?.notes,
        in_A:
          specs.nominalCurrentA ??
          (baseParams?.kind === "contactor" && baseParams.in_A ? baseParams.in_A : 32),
        coil_V:
          specs.coilVoltageV ??
          (baseParams?.kind === "contactor" && baseParams.coil_V ? baseParams.coil_V : 24),
      };
    case "relay":
      return {
        kind: "relay",
        tag,
        notes: baseParams?.notes,
        coil_V: specs.coilVoltageV ?? (baseParams?.kind === "relay" ? baseParams.coil_V : 24),
        contacts: baseParams?.kind === "relay" ? baseParams.contacts : 2,
      };
    case "fuse":
      return {
        kind: "fuse",
        tag,
        notes: baseParams?.notes,
        in_A:
          specs.nominalCurrentA ??
          (baseParams?.kind === "fuse" && baseParams.in_A ? baseParams.in_A : 16),
      };
    case "disconnector":
      return {
        kind: "disconnector",
        tag,
        notes: baseParams?.notes,
        in_A:
          specs.nominalCurrentA ??
          (baseParams?.kind === "disconnector" && baseParams.in_A ? baseParams.in_A : 63),
      };
    case "transformer":
      return {
        kind: "transformer",
        tag,
        notes: baseParams?.notes,
        kVA: specs.apparentPowerKva ?? (baseParams?.kind === "transformer" ? baseParams.kVA : 500),
        primary_V:
          specs.primaryV ?? (baseParams?.kind === "transformer" ? baseParams.primary_V : 13800),
        secondary_V:
          specs.secondaryV ?? (baseParams?.kind === "transformer" ? baseParams.secondary_V : 380),
        vector: baseParams?.kind === "transformer" ? baseParams.vector : "Dyn11",
      };
    case "psu":
      return {
        kind: "psu",
        tag,
        notes: baseParams?.notes,
        output_V: specs.voltageV ?? (baseParams?.kind === "psu" ? baseParams.output_V : 24),
        output_A: specs.nominalCurrentA ?? (baseParams?.kind === "psu" ? baseParams.output_A : 10),
      };
    case "vfd":
      return {
        kind: "vfd",
        tag,
        notes: baseParams?.notes,
        power_kW: specs.powerKw ?? (baseParams?.kind === "vfd" ? baseParams.power_kW : 7.5),
        voltage_V: specs.voltageV ?? (baseParams?.kind === "vfd" ? baseParams.voltage_V : 380),
      };
    case "softstarter":
      return {
        kind: "softstarter",
        tag,
        notes: baseParams?.notes,
        power_kW: specs.powerKw ?? (baseParams?.kind === "softstarter" ? baseParams.power_kW : 11),
      };
    case "busbar":
      return {
        kind: "busbar",
        tag,
        notes: baseParams?.notes,
        current_A:
          specs.nominalCurrentA ??
          (baseParams?.kind === "busbar" && baseParams.current_A ? baseParams.current_A : 250),
        voltage_V:
          specs.voltageV ??
          (baseParams?.kind === "busbar" && baseParams.voltage_V ? baseParams.voltage_V : 380),
      };
    case "ccm":
      return {
        kind: "ccm",
        tag,
        notes: baseParams?.notes,
        columns: baseParams?.kind === "ccm" ? baseParams.columns : 4,
        cells: baseParams?.kind === "ccm" ? baseParams.cells : 6,
      };
    case "motor":
      return {
        kind: "motor",
        tag,
        notes: baseParams?.notes,
        power_kW: specs.powerKw ?? (baseParams?.kind === "motor" ? baseParams.power_kW : 7.5),
        voltage_V: specs.voltageV ?? (baseParams?.kind === "motor" ? baseParams.voltage_V : 380),
        fla_A:
          specs.nominalCurrentA ?? (baseParams?.kind === "motor" ? baseParams.fla_A : undefined),
        startMethod:
          specs.startingMethod === "DOL" ||
          specs.startingMethod === "SOFT" ||
          specs.startingMethod === "VFD"
            ? specs.startingMethod
            : baseParams?.kind === "motor"
              ? baseParams.startMethod
              : "DOL",
      };
    case "load":
      return {
        kind: "load",
        tag,
        notes: baseParams?.notes,
        power_W: specs.powerW ?? (baseParams?.kind === "load" ? baseParams.power_W : 1000),
        voltage_V: specs.voltageV ?? (baseParams?.kind === "load" ? baseParams.voltage_V : 220),
        fp: specs.powerFactor ?? (baseParams?.kind === "load" ? baseParams.fp : 0.92),
      };
    case "lamp":
      return {
        kind: "lamp",
        tag,
        notes: baseParams?.notes,
        power_W: specs.powerW ?? (baseParams?.kind === "lamp" ? baseParams.power_W : 15),
        voltage_V: specs.voltageV ?? (baseParams?.kind === "lamp" ? baseParams.voltage_V : 220),
      };
    case "socket":
      return {
        kind: "socket",
        tag,
        notes: baseParams?.notes,
        current_A:
          specs.nominalCurrentA ?? (baseParams?.kind === "socket" ? baseParams.current_A : 10),
        voltage_V: specs.voltageV ?? (baseParams?.kind === "socket" ? baseParams.voltage_V : 220),
      };
    default:
      if (baseParams) return { ...baseParams, tag };
      return { kind: "terminal", tag };
  }
}

function mapNormStringsToStandards(norms?: string[]): ApplicableStandard[] {
  if (!norms || norms.length === 0) return ["NBR_5410"];
  const out = new Set<ApplicableStandard>();
  for (const n of norms) {
    const u = n.toUpperCase();
    if (u.includes("5410")) out.add("NBR_5410");
    else if (u.includes("14039")) out.add("NBR_14039");
    else if (u.includes("NR-10") || u.includes("NR 10")) out.add("NR_10");
    else if (u.includes("NR-12") || u.includes("NR 12")) out.add("NR_12");
    else if (u.includes("60909")) out.add("IEC_60909");
    else if (u.includes("61131")) out.add("IEC_61131_3");
    else if (u.includes("60617")) out.add("IEC_60617");
    else if (u.includes("18.2")) out.add("ISA_18_2");
  }
  return out.size > 0 ? Array.from(out) : ["NBR_5410"];
}

// ── Upgrade Snapshot v2 -> UnifiedProjectDoc v3 ─────────────────────────────

export function upgradeSnapshotV2ToV3(
  snap: ProjectSnapshot,
  meta?: Partial<ProjectMetadata>,
): UnifiedProjectDoc {
  // If the snapshot already carries an embedded `unifiedDoc` v3, return it hydrated with meta.
  const embedded = (snap as Record<string, unknown>).unifiedDoc as UnifiedProjectDoc | undefined;
  if (embedded && embedded.schemaVersion === UNIFIED_SCHEMA_VERSION) {
    return {
      ...embedded,
      metadata: {
        ...embedded.metadata,
        ...meta,
        schemaVersion: UNIFIED_SCHEMA_VERSION,
      },
    };
  }

  const rawDiagram = snap.diagram as DiagramDoc | undefined;
  const base = createEmptyUnifiedDoc({
    ...meta,
    name: meta?.name ?? rawDiagram?.metadata?.title ?? "Novo projeto",
    client: meta?.client ?? rawDiagram?.metadata?.client ?? null,
    applicableStandards:
      meta?.applicableStandards ?? mapNormStringsToStandards(rawDiagram?.metadata?.norms),
  });

  const diagnostics: ModelDiagnostic[] = [];
  const now = new Date().toISOString();

  // 1. Reconcile DiagramDoc (WebGL Unifilar + Multifilar)
  if (rawDiagram && rawDiagram.nodes) {
    base.views.diagramDocId = rawDiagram.id || base.views.diagramDocId;
    base.views.sheets =
      rawDiagram.sheets && rawDiagram.sheets.length > 0 ? [...rawDiagram.sheets] : ["unifilar"];

    const diagramNodes = Object.values(rawDiagram.nodes);
    const unifilarNodes = diagramNodes.filter((n) => n.sheet === "unifilar");
    const multifilarNodes = diagramNodes.filter((n) => n.sheet === "multifilar");

    for (const n of unifilarNodes) {
      const specs = extractSpecsFromDiagramParams(n.params);
      const tagCode = n.params.tag || n.label || n.id;
      const equipmentId =
        typeof n.ui?.equipmentId === "string" && n.ui.equipmentId.length > 0
          ? n.ui.equipmentId
          : n.id;

      const eq: CanonicalEquipment = {
        id: equipmentId,
        tagCode,
        displayName: n.label || tagCode,
        catalogType: n.params.kind,
        category: defaultCategoryForKind(n.params.kind),
        phases: defaultPhasesForKind(n.params.kind, specs.poles),
        terminals: defaultTerminalsForEquipment(equipmentId, n.params.kind),
        specs,
        diagramParams: n.params,
      };
      base.engineering.equipments[equipmentId] = eq;
      base.views.unifilar.nodes[n.id] = {
        nodeId: n.id,
        equipmentId,
        position: { ...n.position },
        rotation: n.rotation ?? 0,
        label: n.label ?? "",
        ui: n.ui ? { ...n.ui, equipmentId } : { equipmentId },
      };
    }

    // Reconcile Multifilar nodes to Unifilar canonical equipments
    const multifilarNodeToEquipment = new Map<string, string>();
    for (const mn of multifilarNodes) {
      const explicitEqId =
        typeof mn.ui?.equipmentId === "string" && mn.ui.equipmentId.length > 0
          ? mn.ui.equipmentId
          : undefined;

      let matchedEquipmentId: string | undefined =
        explicitEqId && base.engineering.equipments[explicitEqId] ? explicitEqId : undefined;

      if (!matchedEquipmentId) {
        const candidates = Object.values(base.engineering.equipments).filter(
          (eq) =>
            eq.catalogType === mn.params.kind &&
            (eq.displayName === mn.label || eq.tagCode === (mn.params.tag || mn.label)),
        );
        if (candidates.length === 1) {
          matchedEquipmentId = candidates[0].id;
        } else if (candidates.length > 1) {
          diagnostics.push({
            id: `diag_${ulid()}`,
            severity: "warning",
            code: "MIGRATION_AMBIGUOUS_MULTIFILAR_NODE",
            message: `Nó multifilar '${mn.label || mn.id}' possui múltiplos candidatos no unifilar.`,
            messageParams: { nodeId: mn.id, label: mn.label || mn.id },
            sourceRepresentation: "multifilar",
            targetRepresentation: "unifilar",
            entityIds: [mn.id, ...candidates.map((c) => c.id)],
            requiresUserIntervention: true,
            createdAt: now,
          });
          matchedEquipmentId = candidates[0].id;
        }
      }

      if (!matchedEquipmentId) {
        // Standalone multifilar node without unifilar counterpart: preserve it as its own equipment
        matchedEquipmentId = mn.id;
        const specs = extractSpecsFromDiagramParams(mn.params);
        base.engineering.equipments[matchedEquipmentId] = {
          id: matchedEquipmentId,
          tagCode: mn.params.tag || mn.label || mn.id,
          displayName: mn.label || mn.id,
          catalogType: mn.params.kind,
          category: defaultCategoryForKind(mn.params.kind),
          phases: defaultPhasesForKind(mn.params.kind, specs.poles),
          terminals: defaultTerminalsForEquipment(matchedEquipmentId, mn.params.kind),
          specs,
          diagramParams: mn.params,
        };
        if (unifilarNodes.length > 0) {
          diagnostics.push({
            id: `diag_${ulid()}`,
            severity: "info",
            code: "MIGRATION_UNLINKED_MULTIFILAR_NODE",
            message: `Nó multifilar '${mn.label || mn.id}' preservado sem par direto no unifilar.`,
            messageParams: { nodeId: mn.id, label: mn.label || mn.id },
            sourceRepresentation: "multifilar",
            entityIds: [mn.id],
            requiresUserIntervention: false,
            createdAt: now,
          });
        }
      }

      multifilarNodeToEquipment.set(mn.id, matchedEquipmentId);
      base.views.multifilar.nodes[mn.id] = {
        nodeId: mn.id,
        equipmentId: matchedEquipmentId,
        position: { ...mn.position },
        rotation: mn.rotation ?? 0,
        label: mn.label ?? "",
        ui: mn.ui
          ? { ...mn.ui, equipmentId: matchedEquipmentId }
          : { equipmentId: matchedEquipmentId },
      };
    }

    // Reconcile DiagramEdges
    const diagramEdges = Object.values(rawDiagram.edges ?? {});
    for (const e of diagramEdges) {
      if (e.sheet === "unifilar") {
        const fromEqId = base.views.unifilar.nodes[e.source]?.equipmentId ?? e.source;
        const toEqId = base.views.unifilar.nodes[e.target]?.equipmentId ?? e.target;
        const srcNode = rawDiagram.nodes[e.source];
        const tgtNode = rawDiagram.nodes[e.target];
        const fromCode = srcNode
          ? resolveTerminalCode(srcNode, e.sourcePort, "source")
          : (e.sourcePort || "out");
        const toCode = tgtNode
          ? resolveTerminalCode(tgtNode, e.targetPort, "target")
          : (e.targetPort || "in");

        const conn: ElectricalConnection = {
          id: e.id,
          fromEquipmentId: fromEqId,
          fromTerminalId: `${fromEqId}:${fromCode}`,
          toEquipmentId: toEqId,
          toTerminalId: `${toEqId}:${toCode}`,
          kind: e.kind,
          circuitConfig: e.circuitConfig,
          conductor: e.cable
            ? {
                crossSectionMm2: e.cable.section_mm2 ?? 2.5,
                material: "Cu",
                insulation: e.cable.insulation ?? "PVC",
                lengthM: e.cable.length_m ?? 10,
                installationMethod: e.cable.installation ?? "B1",
              }
            : undefined,
        };
        base.engineering.connections[conn.id] = conn;
        base.views.unifilar.edges[e.id] = {
          edgeId: e.id,
          connectionId: conn.id,
          waypoints: e.waypoints,
        };
      } else if (e.sheet === "multifilar") {
        const fromEqId = multifilarNodeToEquipment.get(e.source) ?? e.source;
        const toEqId = multifilarNodeToEquipment.get(e.target) ?? e.target;
        const existingConn = Object.values(base.engineering.connections).find(
          (c) => c.fromEquipmentId === fromEqId && c.toEquipmentId === toEqId,
        );
        const connId = existingConn?.id ?? e.id;
        if (!existingConn) {
          base.engineering.connections[connId] = {
            id: connId,
            fromEquipmentId: fromEqId,
            fromTerminalId: e.sourcePort || `${fromEqId}:out`,
            toEquipmentId: toEqId,
            toTerminalId: e.targetPort || `${toEqId}:in`,
            kind: e.kind,
            circuitConfig: e.circuitConfig,
            conductor: e.cable
              ? {
                  crossSectionMm2: e.cable.section_mm2 ?? 2.5,
                  material: "Cu",
                  insulation: e.cable.insulation ?? "PVC",
                  lengthM: e.cable.length_m ?? 10,
                  installationMethod: e.cable.installation ?? "B1",
                }
              : undefined,
          };
        }
        base.views.multifilar.edges[e.id] = {
          edgeId: e.id,
          connectionId: connId,
          sourceNodeId: e.source,
          targetNodeId: e.target,
          circuitConfig: e.circuitConfig,
          waypoints: e.waypoints,
        };
      }
    }
  }

  // 2. Reconcile Tags from PLC variables, Editor tags, and Project tags
  const tagNameToId = new Map<string, string>();
  const unifiedTags: Record<string, CanonicalTag> = {};

  if (snap.plc && Array.isArray(snap.plc.variables)) {
    base.plc.project = snap.plc as PlcProject;
    const ob = base.plc.project.programBlocks.find((b) => b.type === "OB");
    const fc = base.plc.project.programBlocks.find((b) => b.type === "FC");
    if (ob) base.plc.activeLadderBlockId = ob.id;
    if (fc) base.plc.activeFbdBlockId = fc.id;

    for (const pv of base.plc.project.variables) {
      const id = pv.id || `tag_${ulid()}`;
      unifiedTags[id] = {
        id,
        name: pv.name,
        dataType: pv.type,
        area: inferAreaFromAddress(pv.address, pv.name),
        address: pv.address,
        initialValue: pv.initialValue ?? (pv.type === "BOOL" ? false : 0),
        forced: false,
        retentive: Boolean(pv.retentive),
        description: pv.comment ?? "",
      };
      tagNameToId.set(pv.name.toUpperCase(), id);
    }
  } else {
    for (const t of Object.values(base.engineering.tags)) {
      unifiedTags[t.id] = t;
      tagNameToId.set(t.name.toUpperCase(), t.id);
    }
  }

  if (snap.editor?.tags) {
    for (const [rawKey, rawVal] of Object.entries(snap.editor.tags)) {
      const et = rawVal as EditorTag;
      if (!et || typeof et !== "object") continue;
      const existingId =
        unifiedTags[et.id]?.id ?? (et.name ? tagNameToId.get(et.name.toUpperCase()) : undefined);
      const id = existingId ?? et.id ?? rawKey;
      const prev = unifiedTags[id];
      unifiedTags[id] = {
        id,
        name: et.name || prev?.name || id,
        dataType: (et.type as TagDataType) || prev?.dataType || "BOOL",
        area: prev?.area ?? inferAreaFromAddress(prev?.address, et.name),
        address: prev?.address,
        initialValue: et.value !== undefined ? et.value : (prev?.initialValue ?? false),
        forced: Boolean(et.forced ?? prev?.forced),
        retentive: Boolean(prev?.retentive),
        description: prev?.description ?? "",
      };
      tagNameToId.set(unifiedTags[id].name.toUpperCase(), id);
    }
  }

  if (snap.project?.tags) {
    for (const [tagName, tagVal] of Object.entries(snap.project.tags)) {
      const existingId = tagNameToId.get(tagName.toUpperCase());
      if (existingId && unifiedTags[existingId]) {
        unifiedTags[existingId] = {
          ...unifiedTags[existingId],
          initialValue: tagVal,
        };
      } else {
        const id = `tag_${tagName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        const inferredType: TagDataType =
          typeof tagVal === "boolean"
            ? "BOOL"
            : typeof tagVal === "number"
              ? Number.isInteger(tagVal)
                ? "INT"
                : "REAL"
              : "STRING";
        unifiedTags[id] = {
          id,
          name: tagName,
          dataType: inferredType,
          area: inferAreaFromAddress(undefined, tagName),
          initialValue: tagVal,
          forced: false,
          retentive: false,
          description: "",
        };
        tagNameToId.set(tagName.toUpperCase(), id);
      }
    }
  }
  base.engineering.tags = unifiedTags;

  // 3. Reconcile ProjectStore nodes & SCADA layout
  const projectNodes = (snap.project?.nodes ?? []) as IndustrialNode[];
  const scadaNodes = (snap.project?.scadaLayout?.nodes ?? []) as IndustrialNode[];
  const combinedLegacyNodes = new Map<string, IndustrialNode>();
  for (const n of projectNodes) combinedLegacyNodes.set(n.id, n);
  for (const n of scadaNodes) combinedLegacyNodes.set(n.id, n);

  for (const n of combinedLegacyNodes.values()) {
    const isHmiWidget =
      n.kind === "gauge" ||
      n.kind === "display" ||
      n.kind === "trend" ||
      n.kind === "button" ||
      n.kind === "switch" ||
      n.kind === "slider" ||
      n.kind === "input" ||
      n.kind === "alarm_banner" ||
      n.kind === "alarm_table" ||
      n.kind === "label";

    if (!isHmiWidget && !base.engineering.equipments[n.id]) {
      const powerKw =
        typeof n.params?.P === "number"
          ? n.params.P
          : typeof n.params?.P === "string"
            ? parseFloat(n.params.P) || undefined
            : undefined;
      const voltageV =
        typeof n.params?.U === "number"
          ? n.params.U
          : typeof n.params?.secondary_V === "number"
            ? n.params.secondary_V
            : undefined;
      const nominalCurrentA =
        typeof n.params?.In === "number"
          ? n.params.In
          : typeof n.params?.IN === "number"
            ? n.params.IN
            : undefined;

      base.engineering.equipments[n.id] = {
        id: n.id,
        tagCode: n.id,
        displayName: n.label || n.id,
        catalogType: n.kind,
        category: defaultCategoryForKind(n.kind),
        phases: defaultPhasesForKind(n.kind),
        terminals: defaultTerminalsForEquipment(n.id, n.kind),
        specs: {
          powerKw,
          voltageV,
          nominalCurrentA,
          apparentPowerKva: typeof n.params?.kVA === "number" ? n.params.kVA : undefined,
          custom: { ...(n.params ?? {}) },
        },
      };
    }

    const rawTagRef = typeof n.params?.tag === "string" ? n.params.tag : undefined;
    const boundTagId = rawTagRef ? (tagNameToId.get(rawTagRef.toUpperCase()) ?? null) : null;
    const boundEquipmentId = !isHmiWidget ? n.id : null;

    base.views.scada.widgets[n.id] = {
      id: n.id,
      kind: n.kind,
      category: n.category,
      label: n.label,
      position: { ...n.position },
      boundTagId,
      boundEquipmentId,
      params: { ...(n.params ?? {}) },
    };
  }

  const projectEdges = (snap.project?.edges ?? []) as IndustrialEdge[];
  const scadaEdges: ScadaEdgeLayout[] = [];
  for (const e of projectEdges) {
    scadaEdges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind,
    });
    if (!base.engineering.connections[e.id] && e.kind === "power") {
      base.engineering.connections[e.id] = {
        id: e.id,
        fromEquipmentId: e.source,
        fromTerminalId: `${e.source}:out`,
        toEquipmentId: e.target,
        toTerminalId: `${e.target}:in`,
        kind: "power",
      };
    }
  }
  base.views.scada.edges = scadaEdges;

  // 4. Reconcile Editor Rungs & FBD into PLC Program Blocks
  const editorRungs = (snap.editor?.rungs ?? []) as LadderRung[];
  const editorFbdNodes = (snap.editor?.fbdNodes ?? []) as FbdNode[];
  const editorFbdEdges = (snap.editor?.fbdEdges ?? []) as FbdEdge[];

  const ladderBlockIdx = base.plc.project.programBlocks.findIndex(
    (b) => b.id === base.plc.activeLadderBlockId || b.language === "ladder",
  );
  if (ladderBlockIdx >= 0 && editorRungs.length > 0) {
    base.plc.project.programBlocks[ladderBlockIdx] = {
      ...base.plc.project.programBlocks[ladderBlockIdx],
      ladder: { rungs: editorRungs },
    };
  }

  if (editorFbdNodes.length > 0 || editorFbdEdges.length > 0) {
    const fbdBlockIdx = base.plc.project.programBlocks.findIndex(
      (b) => b.id === base.plc.activeFbdBlockId || b.language === "fbd",
    );
    if (fbdBlockIdx >= 0) {
      base.plc.project.programBlocks[fbdBlockIdx] = {
        ...base.plc.project.programBlocks[fbdBlockIdx],
        fbd: { nodes: editorFbdNodes, edges: editorFbdEdges },
      };
    } else {
      const fbdBlock: PlcProgramBlock = {
        id: "pb-fbd-main",
        name: "FBD_Main",
        type: "FC",
        number: 2,
        language: "fbd",
        code: "",
        comment: "Bloco FBD principal",
        fbd: { nodes: editorFbdNodes, edges: editorFbdEdges },
      };
      base.plc.project.programBlocks.push(fbdBlock);
      base.plc.activeFbdBlockId = fbdBlock.id;
    }
  }

  base.diagnostics = diagnostics;
  return base;
}

// ── Project Legacy Views from UnifiedProjectDoc v3 ──────────────────────────

export interface LegacyStoreProjection {
  diagramDoc: DiagramDoc;
  projectNodes: IndustrialNode[];
  projectEdges: IndustrialEdge[];
  projectTags: Record<string, number | boolean | string>;
  editorTags: Record<string, EditorTag>;
  rungs: LadderRung[];
  fbdNodes: FbdNode[];
  fbdEdges: FbdEdge[];
  plcProject: PlcProject;
}

function mapEquipmentCategoryToLegacy(cat: CanonicalEquipment["category"]): LegacyNodeCategory {
  switch (cat) {
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
}

export function projectLegacyViewsFromV3(doc: UnifiedProjectDoc): LegacyStoreProjection {
  // 1. Project DiagramDoc (Unifilar + Multifilar nodes synced with CanonicalEquipment)
  const diagramNodes: Record<string, DiagramNode> = {};
  const diagramEdges: Record<string, DiagramEdge> = {};

  for (const layout of Object.values(doc.views.unifilar.nodes)) {
    const eq = doc.engineering.equipments[layout.equipmentId];
    if (!eq) continue;
    const params = mergeSpecsIntoDiagramParams(
      eq.diagramParams,
      eq.catalogType,
      eq.specs,
      eq.tagCode,
    );
    diagramNodes[layout.nodeId] = {
      id: layout.nodeId,
      sheet: "unifilar",
      position: { ...layout.position },
      rotation: layout.rotation,
      label: eq.displayName || layout.label || eq.tagCode,
      params,
      ui: { ...(layout.ui ?? {}), equipmentId: eq.id },
    };
  }

  for (const layout of Object.values(doc.views.multifilar.nodes)) {
    const eq = doc.engineering.equipments[layout.equipmentId];
    if (!eq) continue;
    const params = mergeSpecsIntoDiagramParams(
      eq.diagramParams,
      eq.catalogType,
      eq.specs,
      eq.tagCode,
    );
    diagramNodes[layout.nodeId] = {
      id: layout.nodeId,
      sheet: "multifilar",
      position: { ...layout.position },
      rotation: layout.rotation,
      label: eq.displayName || layout.label || eq.tagCode,
      params,
      ui: { ...(layout.ui ?? {}), equipmentId: eq.id },
    };
  }

  for (const edgeLayout of Object.values(doc.views.unifilar.edges)) {
    const conn = doc.engineering.connections[edgeLayout.connectionId];
    if (!conn) continue;
    // Find unifilar nodeIds for fromEquipmentId and toEquipmentId
    const srcNode =
      doc.views.unifilar.nodes[conn.fromEquipmentId]?.nodeId ??
      Object.values(doc.views.unifilar.nodes).find((n) => n.equipmentId === conn.fromEquipmentId)
        ?.nodeId ??
      conn.fromEquipmentId;
    const tgtNode =
      doc.views.unifilar.nodes[conn.toEquipmentId]?.nodeId ??
      Object.values(doc.views.unifilar.nodes).find((n) => n.equipmentId === conn.toEquipmentId)
        ?.nodeId ??
      conn.toEquipmentId;

    diagramEdges[edgeLayout.edgeId] = {
      id: edgeLayout.edgeId,
      sheet: "unifilar",
      source: srcNode,
      target: tgtNode,
      sourcePort: conn.fromTerminalId,
      targetPort: conn.toTerminalId,
      kind: conn.kind,
      circuitConfig: conn.circuitConfig,
      cable: conn.conductor
        ? {
            section_mm2: conn.conductor.crossSectionMm2,
            length_m: conn.conductor.lengthM,
            insulation: conn.conductor.insulation,
            installation: conn.conductor.installationMethod,
          }
        : undefined,
      waypoints: edgeLayout.waypoints,
    };
  }

  for (const edgeLayout of Object.values(doc.views.multifilar.edges)) {
    const conn = doc.engineering.connections[edgeLayout.connectionId];
    diagramEdges[edgeLayout.edgeId] = {
      id: edgeLayout.edgeId,
      sheet: "multifilar",
      source: edgeLayout.sourceNodeId,
      target: edgeLayout.targetNodeId,
      sourcePort: conn?.fromTerminalId,
      targetPort: conn?.toTerminalId,
      kind: conn?.kind ?? "power",
      circuitConfig: edgeLayout.circuitConfig ?? conn?.circuitConfig,
      cable: conn?.conductor
        ? {
            section_mm2: conn.conductor.crossSectionMm2,
            length_m: conn.conductor.lengthM,
            insulation: conn.conductor.insulation,
            installation: conn.conductor.installationMethod,
          }
        : undefined,
      waypoints: edgeLayout.waypoints,
    };
  }

  const diagramDoc: DiagramDoc = DiagramDocSchema.parse({
    version: DIAGRAM_DOC_VERSION,
    id: doc.views.diagramDocId,
    metadata: {
      title: doc.metadata.name,
      client: doc.metadata.client ?? undefined,
      norms: doc.metadata.applicableStandards.map((s) => s.replace("_", " ")),
      updatedAt: doc.metadata.updatedAt,
    },
    sheets: doc.views.sheets.length > 0 ? doc.views.sheets : ["unifilar"],
    nodes: diagramNodes,
    edges: diagramEdges,
  });

  // 2. Project ProjectStore nodes & edges (combining SCADA widgets + Canonical Equipments)
  const projectNodesMap = new Map<string, IndustrialNode>();

  for (const eq of Object.values(doc.engineering.equipments)) {
    const unifilarLayout = Object.values(doc.views.unifilar.nodes).find(
      (n) => n.equipmentId === eq.id,
    );
    const scadaWidget = doc.views.scada.widgets[eq.id];
    const params: Record<string, string | number | boolean> = {
      ...(eq.specs.custom ?? {}),
      ...(scadaWidget?.params ?? {}),
    };
    if (eq.specs.powerKw !== undefined) params.P = eq.specs.powerKw;
    if (eq.specs.voltageV !== undefined) params.U = eq.specs.voltageV;
    if (eq.specs.nominalCurrentA !== undefined) params.In = eq.specs.nominalCurrentA;
    if (eq.specs.apparentPowerKva !== undefined) params.kVA = eq.specs.apparentPowerKva;
    if (eq.specs.tripCurve !== undefined) params.curva = eq.specs.tripCurve;
    if (eq.specs.startingMethod !== undefined) params.startMethod = eq.specs.startingMethod;

    projectNodesMap.set(eq.id, {
      id: eq.id,
      kind: eq.catalogType as LegacyNodeKind,
      category: scadaWidget?.category ?? mapEquipmentCategoryToLegacy(eq.category),
      label: eq.displayName || eq.tagCode,
      position: scadaWidget?.position ?? unifilarLayout?.position ?? { x: 100, y: 100 },
      params,
      energized: true,
    });
  }

  for (const w of Object.values(doc.views.scada.widgets)) {
    if (projectNodesMap.has(w.id)) continue;
    const boundTag = w.boundTagId ? doc.engineering.tags[w.boundTagId] : undefined;
    const params: Record<string, string | number | boolean> = {
      ...w.params,
      ...(boundTag ? { tag: boundTag.name } : {}),
    };
    projectNodesMap.set(w.id, {
      id: w.id,
      kind: w.kind as LegacyNodeKind,
      category: w.category,
      label: w.label,
      position: { ...w.position },
      params,
    });
  }

  const projectEdgesMap = new Map<string, IndustrialEdge>();
  for (const conn of Object.values(doc.engineering.connections)) {
    projectEdgesMap.set(conn.id, {
      id: conn.id,
      source: conn.fromEquipmentId,
      target: conn.toEquipmentId,
      kind: conn.kind === "ground" ? "power" : conn.kind,
    });
  }
  for (const se of doc.views.scada.edges) {
    if (!projectEdgesMap.has(se.id)) {
      projectEdgesMap.set(se.id, {
        id: se.id,
        source: se.source,
        target: se.target,
        kind: se.kind,
      });
    }
  }

  // 3. Project Canonical Tags to ProjectStore, EditorStore, and PlcStore
  const projectTags: Record<string, number | boolean | string> = {};
  const editorTags: Record<string, EditorTag> = {};
  const plcVariables: PlcVariable[] = [];

  for (const t of Object.values(doc.engineering.tags)) {
    projectTags[t.name] = t.initialValue;
    const editorType: EditorTag["type"] =
      t.dataType === "BOOL"
        ? "BOOL"
        : t.dataType === "REAL"
          ? "REAL"
          : t.dataType === "STRING" || t.dataType === "TIME"
            ? "STRING"
            : "INT";
    editorTags[t.id] = {
      id: t.id,
      name: t.name,
      type: editorType,
      value: t.initialValue,
      forced: t.forced,
    };
    plcVariables.push({
      id: t.id,
      name: t.name,
      address: t.address || `%${t.area}0.0`,
      type: t.dataType,
      initialValue: t.initialValue,
      comment: t.description,
      retentive: t.retentive,
    });
  }

  // 4. Project Active Ladder Rungs & FBD Graph from PLC Program Blocks
  const ladderBlock =
    doc.plc.project.programBlocks.find((b) => b.id === doc.plc.activeLadderBlockId) ??
    doc.plc.project.programBlocks.find((b) => b.language === "ladder");
  const fbdBlock =
    doc.plc.project.programBlocks.find((b) => b.id === doc.plc.activeFbdBlockId) ??
    doc.plc.project.programBlocks.find((b) => b.language === "fbd");

  const rungs = ((ladderBlock?.ladder?.rungs ?? []) as LadderRung[]).map((r) => ({ ...r }));
  const fbdNodes = ((fbdBlock?.fbd?.nodes ?? []) as FbdNode[]).map((n) => ({ ...n }));
  const fbdEdges = ((fbdBlock?.fbd?.edges ?? []) as FbdEdge[]).map((e) => ({ ...e }));

  const plcProject: PlcProject = {
    ...doc.plc.project,
    variables: plcVariables,
  };

  return {
    diagramDoc,
    projectNodes: Array.from(projectNodesMap.values()),
    projectEdges: Array.from(projectEdgesMap.values()),
    projectTags,
    editorTags,
    rungs,
    fbdNodes,
    fbdEdges,
    plcProject,
  };
}
