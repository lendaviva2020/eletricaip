// Canonical Unified Project Store (Single Source of Truth — Schema v3)
// Coordinates canonical engineering entities, per-canvas views, study validity,
// and lossless projection to legacy stores during incremental migration.
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { produce } from "immer";
import { ulid } from "ulid";
import type { DiagramDoc, Position } from "@/lib/diagram/schema";
import { useDiagramStore } from "@/lib/diagram/store";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { usePlcStore } from "@/lib/plc/store";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import type { LadderRung } from "@/lib/ladder/types";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import {
  computeEquipmentStudyHash,
  defaultCategoryForKind,
  defaultPhasesForKind,
  defaultTerminalsForEquipment,
  inferAreaFromAddress,
  type CanonicalCircuit,
  type CanonicalEquipment,
  type CanonicalTag,
  type ControlBinding,
  type ElectricalConnection,
  type EngineeringStudyRecord,
  type EquipmentSpecs,
  type ModelDiagnostic,
  type PlcChannelBinding,
  type ProjectMetadata,
  type UnifiedProjectDoc,
} from "./unified-schema";
import {
  createEmptyUnifiedDoc,
  extractSpecsFromDiagramParams,
  mergeSpecsIntoDiagramParams,
  projectLegacyViewsFromV3,
  upgradeSnapshotV2ToV3,
} from "./migration-v2-to-v3";
import { resolveTerminalCode } from "@/lib/diagram/connection/connection-engine";
import { useRuntimeStore } from "./runtime-store";

export interface EquipmentPlacementInput {
  unifilar?: { nodeId?: string; position: Position; rotation?: number; label?: string };
  multifilar?: { nodeId?: string; position: Position; rotation?: number; label?: string };
  scada?: { position: Position; label?: string };
}

export interface UnifiedProjectStoreState {
  doc: UnifiedProjectDoc;
  dirty: boolean;
  lastLoadedRevision: number;
  lastSavedAt: number | null;

  // Hydration & Lifecycle
  loadUnifiedDoc: (doc: UnifiedProjectDoc, opts?: { syncLegacy?: boolean }) => void;
  hydrateFromV2Snapshot: (
    snap: ProjectSnapshot,
    meta?: Partial<ProjectMetadata>,
    opts?: { syncLegacy?: boolean },
  ) => UnifiedProjectDoc;
  resetUnifiedDoc: (meta?: Partial<ProjectMetadata>, opts?: { syncLegacy?: boolean }) => void;
  markSaved: () => void;

  // Canonical Equipment & Connections
  upsertEquipment: (
    equipment: CanonicalEquipment,
    placement?: EquipmentPlacementInput,
  ) => CanonicalEquipment;
  updateEquipmentSpecs: (
    equipmentId: string,
    specsPatch: Partial<EquipmentSpecs>,
    metaPatch?: Partial<Pick<CanonicalEquipment, "tagCode" | "displayName" | "phases">>,
  ) => void;
  updateViewNodePosition: (
    view: "unifilar" | "multifilar" | "scada",
    nodeOrWidgetId: string,
    position: Position,
  ) => void;
  removeEquipment: (equipmentId: string) => void;

  connectTerminals: (
    connection: Omit<ElectricalConnection, "id"> & {
      id?: string;
      unifilarEdgeId?: string;
      multifilarEdge?: { edgeId?: string; sourceNodeId: string; targetNodeId: string };
    },
  ) => ElectricalConnection;
  disconnectTerminals: (connectionId: string) => void;
  upsertCircuit: (circuit: CanonicalCircuit) => void;

  // Canonical Tags, Control Bindings & PLC I/O
  upsertTag: (tag: CanonicalTag) => CanonicalTag;
  removeTag: (tagId: string) => void;
  bindControl: (binding: Omit<ControlBinding, "id"> & { id?: string }) => ControlBinding;
  unbindControl: (bindingId: string) => void;
  bindPlcChannel: (binding: PlcChannelBinding) => { ok: boolean; diagnostic?: ModelDiagnostic };

  // Engineering Studies & Diagnostics
  upsertStudy: (
    study: Omit<EngineeringStudyRecord, "inputSnapshotHash" | "status" | "updatedAt"> & {
      status?: EngineeringStudyRecord["status"];
    },
  ) => EngineeringStudyRecord;
  invalidateDependentStudies: (equipmentIds: string[]) => void;
  recordDiagnostic: (
    diag: Omit<ModelDiagnostic, "id" | "createdAt"> & { id?: string },
  ) => ModelDiagnostic;
  clearDiagnostics: (filter?: { code?: string; entityId?: string }) => void;

  // Sync Bridges
  syncLegacyStores: () => void;
  ingestDiagramDocChange: (diagramDoc: DiagramDoc) => void;
  /** Vincula o editor Ladder/FBD ao bloco de programa indicado (por linguagem). */
  setActiveProgramBlock: (blockId: string) => void;
}

// Reentrancy guard so syncingUnified -> Legacy does not trigger Legacy -> Unified
let isSyncingStores = false;

export function syncLegacyStoresFromUnifiedDoc(doc: UnifiedProjectDoc): void {
  if (isSyncingStores) return;
  isSyncingStores = true;
  try {
    const projected = projectLegacyViewsFromV3(doc);
    useDiagramStore.getState().loadDoc(projected.diagramDoc);
    useProjectStore
      .getState()
      .hydrateSnapshot(projected.projectNodes, projected.projectEdges, projected.projectTags);
    useEditorStore.getState().hydrateSnapshot({
      editorTags: projected.editorTags,
      rungs: projected.rungs,
      fbdNodes: projected.fbdNodes,
      fbdEdges: projected.fbdEdges,
      fbdSim: useRuntimeStore.getState().fbdSim,
    });
    usePlcStore.getState().setProject(projected.plcProject);

    // Sync Digital Twin nameplates & mappings
    const twinStore = useDigitalTwinStore.getState();
    if (doc.views.twin.mappings.length > 0) {
      twinStore.setMappings(doc.views.twin.mappings, { isDemo: false });
    }
    for (const np of Object.values(doc.views.twin.nameplates)) {
      twinStore.upsertNameplate(np);
    }

    // Seed RuntimeStore with canonical tags
    useRuntimeStore.getState().seedFromCanonicalTags(
      Object.values(doc.engineering.tags).map((t) => ({
        id: t.id,
        name: t.name,
        initialValue: t.initialValue,
        forced: t.forced,
      })),
    );
    lastEditorSignature = designSignature(useEditorStore.getState());
    lastPlcSignature = JSON.stringify(usePlcStore.getState().project);
  } finally {
    isSyncingStores = false;
  }
}

function invalidateStudiesInDraft(doc: UnifiedProjectDoc, changedEquipmentIds: string[]): void {
  const changedSet = new Set(changedEquipmentIds);
  for (const study of Object.values(doc.studies)) {
    const touchesChanged = study.inputEquipmentIds.some((id) => changedSet.has(id));
    if (!touchesChanged) continue;
    const nextHash = computeEquipmentStudyHash(doc, study.inputEquipmentIds);
    if (nextHash !== study.inputSnapshotHash) {
      study.status = "stale";
      study.updatedAt = new Date().toISOString();
    }
  }
}

export const useUnifiedProjectStore = create<UnifiedProjectStoreState>()(
  subscribeWithSelector((set, get) => ({
    doc: createEmptyUnifiedDoc(),
    dirty: false,
    lastLoadedRevision: 1,
    lastSavedAt: null,

    loadUnifiedDoc: (doc, opts = { syncLegacy: true }) => {
      set({
        doc,
        dirty: false,
        lastLoadedRevision: doc.metadata.revision,
      });
      if (opts.syncLegacy !== false) {
        syncLegacyStoresFromUnifiedDoc(doc);
      }
    },

    hydrateFromV2Snapshot: (snap, meta, opts = { syncLegacy: true }) => {
      const upgraded = upgradeSnapshotV2ToV3(snap, meta);
      set({
        doc: upgraded,
        dirty: false,
        lastLoadedRevision: upgraded.metadata.revision,
      });
      if (opts.syncLegacy !== false) {
        syncLegacyStoresFromUnifiedDoc(upgraded);
      }
      return upgraded;
    },

    resetUnifiedDoc: (meta, opts = { syncLegacy: true }) => {
      const empty = createEmptyUnifiedDoc(meta);
      set({
        doc: empty,
        dirty: false,
        lastLoadedRevision: empty.metadata.revision,
        lastSavedAt: null,
      });
      useRuntimeStore.getState().resetRuntime();
      if (opts.syncLegacy !== false) {
        syncLegacyStoresFromUnifiedDoc(empty);
      }
    },

    markSaved: () =>
      set((s) => ({
        dirty: false,
        lastLoadedRevision: s.doc.metadata.revision,
        lastSavedAt: Date.now(),
      })),

    upsertEquipment: (equipment, placement) => {
      const normalized: CanonicalEquipment = {
        ...equipment,
        terminals:
          equipment.terminals && equipment.terminals.length > 0
            ? equipment.terminals
            : defaultTerminalsForEquipment(equipment.id, equipment.catalogType),
        diagramParams: mergeSpecsIntoDiagramParams(
          equipment.diagramParams,
          equipment.catalogType,
          equipment.specs,
          equipment.tagCode,
        ),
      };

      const nextDoc = produce(get().doc, (d) => {
        d.engineering.equipments[normalized.id] = normalized;
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();

        if (placement?.unifilar) {
          const nodeId = placement.unifilar.nodeId ?? normalized.id;
          d.views.unifilar.nodes[nodeId] = {
            nodeId,
            equipmentId: normalized.id,
            position: { ...placement.unifilar.position },
            rotation: placement.unifilar.rotation ?? 0,
            label: placement.unifilar.label ?? normalized.displayName,
            ui: { equipmentId: normalized.id },
          };
        }
        if (placement?.multifilar) {
          if (!d.views.sheets.includes("multifilar")) {
            d.views.sheets.push("multifilar");
          }
          const nodeId = placement.multifilar.nodeId ?? `mf_${normalized.id}`;
          d.views.multifilar.nodes[nodeId] = {
            nodeId,
            equipmentId: normalized.id,
            position: { ...placement.multifilar.position },
            rotation: placement.multifilar.rotation ?? 0,
            label: placement.multifilar.label ?? normalized.displayName,
            ui: { equipmentId: normalized.id },
          };
        }
        if (placement?.scada) {
          d.views.scada.widgets[normalized.id] = {
            id: normalized.id,
            kind: normalized.catalogType,
            category:
              normalized.category === "load"
                ? "mech"
                : normalized.category === "instrumentation" || normalized.category === "safety"
                  ? "inst"
                  : "power",
            label: placement.scada.label ?? normalized.displayName,
            position: { ...placement.scada.position },
            boundTagId: null,
            boundEquipmentId: normalized.id,
            params: {},
          };
        }

        // Auto-populate Digital Twin nameplate for motors
        if (normalized.catalogType === "motor") {
          const existingNp = d.views.twin.nameplates[normalized.id];
          d.views.twin.nameplates[normalized.id] = {
            equipmentId: normalized.id,
            potenciaKw: normalized.specs.powerKw ?? existingNp?.potenciaKw ?? 7.5,
            tensaoV: normalized.specs.voltageV ?? existingNp?.tensaoV ?? 380,
            correnteNominalA:
              normalized.specs.nominalCurrentA ?? existingNp?.correnteNominalA ?? 16,
            rpm: existingNp?.rpm ?? 1750,
            eficiencia: normalized.specs.efficiency ?? existingNp?.eficiencia ?? 0.92,
            fatorPotencia: normalized.specs.powerFactor ?? existingNp?.fatorPotencia ?? 0.85,
            fatorServico: existingNp?.fatorServico ?? 1.15,
          };
        }

        invalidateStudiesInDraft(d, [normalized.id]);
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
      return normalized;
    },

    updateEquipmentSpecs: (equipmentId, specsPatch, metaPatch) => {
      const current = get().doc.engineering.equipments[equipmentId];
      if (!current) return;

      const nextDoc = produce(get().doc, (d) => {
        const eq = d.engineering.equipments[equipmentId];
        if (!eq) return;
        eq.specs = { ...eq.specs, ...specsPatch };
        if (metaPatch?.tagCode !== undefined) eq.tagCode = metaPatch.tagCode;
        if (metaPatch?.displayName !== undefined) eq.displayName = metaPatch.displayName;
        if (metaPatch?.phases !== undefined) eq.phases = metaPatch.phases;
        eq.diagramParams = mergeSpecsIntoDiagramParams(
          eq.diagramParams,
          eq.catalogType,
          eq.specs,
          eq.tagCode,
        );

        // Update labels in Unifilar/Multifilar views if displayName changed, preserving (x,y)!
        if (metaPatch?.displayName !== undefined) {
          for (const un of Object.values(d.views.unifilar.nodes)) {
            if (un.equipmentId === equipmentId) un.label = metaPatch.displayName;
          }
          for (const mn of Object.values(d.views.multifilar.nodes)) {
            if (mn.equipmentId === equipmentId) mn.label = metaPatch.displayName;
          }
        }

        // Sync Twin Nameplate if present or motor
        const np = d.views.twin.nameplates[equipmentId];
        if (np || eq.catalogType === "motor") {
          d.views.twin.nameplates[equipmentId] = {
            equipmentId,
            potenciaKw: eq.specs.powerKw ?? np?.potenciaKw ?? 7.5,
            tensaoV: eq.specs.voltageV ?? np?.tensaoV ?? 380,
            correnteNominalA: eq.specs.nominalCurrentA ?? np?.correnteNominalA ?? 16,
            rpm: np?.rpm ?? 1750,
            eficiencia: eq.specs.efficiency ?? np?.eficiencia ?? 0.92,
            fatorPotencia: eq.specs.powerFactor ?? np?.fatorPotencia ?? 0.85,
            fatorServico: np?.fatorServico ?? 1.15,
          };
        }

        invalidateStudiesInDraft(d, [equipmentId]);
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
    },

    updateViewNodePosition: (view, nodeOrWidgetId, position) => {
      const nextDoc = produce(get().doc, (d) => {
        if (view === "unifilar" && d.views.unifilar.nodes[nodeOrWidgetId]) {
          d.views.unifilar.nodes[nodeOrWidgetId].position = { ...position };
        } else if (view === "multifilar" && d.views.multifilar.nodes[nodeOrWidgetId]) {
          d.views.multifilar.nodes[nodeOrWidgetId].position = { ...position };
        } else if (view === "scada" && d.views.scada.widgets[nodeOrWidgetId]) {
          d.views.scada.widgets[nodeOrWidgetId].position = { ...position };
        }
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });
      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
    },

    removeEquipment: (equipmentId) => {
      const nextDoc = produce(get().doc, (d) => {
        invalidateStudiesInDraft(d, [equipmentId]);
        delete d.engineering.equipments[equipmentId];
        delete d.views.twin.nameplates[equipmentId];
        d.views.twin.mappings = d.views.twin.mappings.filter((m) => m.equipmentId !== equipmentId);

        // Remove connections touching equipment
        const removedConnIds = new Set<string>();
        for (const [cid, conn] of Object.entries(d.engineering.connections)) {
          if (conn.fromEquipmentId === equipmentId || conn.toEquipmentId === equipmentId) {
            removedConnIds.add(cid);
            delete d.engineering.connections[cid];
          }
        }

        // Remove unifilar & multifilar nodes/edges
        for (const [nid, n] of Object.entries(d.views.unifilar.nodes)) {
          if (n.equipmentId === equipmentId) delete d.views.unifilar.nodes[nid];
        }
        for (const [eid, e] of Object.entries(d.views.unifilar.edges)) {
          if (removedConnIds.has(e.connectionId)) delete d.views.unifilar.edges[eid];
        }
        for (const [nid, n] of Object.entries(d.views.multifilar.nodes)) {
          if (n.equipmentId === equipmentId) delete d.views.multifilar.nodes[nid];
        }
        for (const [eid, e] of Object.entries(d.views.multifilar.edges)) {
          if (removedConnIds.has(e.connectionId)) delete d.views.multifilar.edges[eid];
        }

        // Remove control bindings
        for (const [bid, b] of Object.entries(d.engineering.controlBindings)) {
          if (b.equipmentId === equipmentId) delete d.engineering.controlBindings[bid];
        }

        // Check SCADA orphan equipment bindings
        for (const w of Object.values(d.views.scada.widgets)) {
          if (w.boundEquipmentId === equipmentId) {
            w.boundEquipmentId = null;
            d.diagnostics.push({
              id: `diag_${ulid()}`,
              severity: "warning",
              code: "SCADA_ORPHAN_EQUIPMENT_BINDING",
              message: `Widget SCADA '${w.label || w.id}' perdeu vínculo com o equipamento removido '${equipmentId}'.`,
              messageParams: { widgetId: w.id, equipmentId },
              sourceRepresentation: "unifilar",
              targetRepresentation: "scada",
              entityIds: [w.id, equipmentId],
              requiresUserIntervention: true,
              createdAt: new Date().toISOString(),
            });
          }
        }

        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
    },

    connectTerminals: (input) => {
      const id = input.id ?? `conn_${ulid()}`;
      const conn: ElectricalConnection = {
        id,
        fromEquipmentId: input.fromEquipmentId,
        fromTerminalId: input.fromTerminalId,
        toEquipmentId: input.toEquipmentId,
        toTerminalId: input.toTerminalId,
        kind: input.kind ?? "power",
        circuitConfig: input.circuitConfig,
        conductor: input.conductor,
      };

      const nextDoc = produce(get().doc, (d) => {
        d.engineering.connections[id] = conn;
        const uniEdgeId = input.unifilarEdgeId ?? id;
        d.views.unifilar.edges[uniEdgeId] = {
          edgeId: uniEdgeId,
          connectionId: id,
        };
        if (input.multifilarEdge) {
          const mfEdgeId = input.multifilarEdge.edgeId ?? `mf_${id}`;
          d.views.multifilar.edges[mfEdgeId] = {
            edgeId: mfEdgeId,
            connectionId: id,
            sourceNodeId: input.multifilarEdge.sourceNodeId,
            targetNodeId: input.multifilarEdge.targetNodeId,
            circuitConfig: input.circuitConfig,
          };
        }
        invalidateStudiesInDraft(d, [conn.fromEquipmentId, conn.toEquipmentId]);
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
      return conn;
    },

    disconnectTerminals: (connectionId) => {
      const existing = get().doc.engineering.connections[connectionId];
      if (!existing) return;

      const nextDoc = produce(get().doc, (d) => {
        invalidateStudiesInDraft(d, [existing.fromEquipmentId, existing.toEquipmentId]);
        delete d.engineering.connections[connectionId];
        for (const [eid, e] of Object.entries(d.views.unifilar.edges)) {
          if (e.connectionId === connectionId) delete d.views.unifilar.edges[eid];
        }
        for (const [eid, e] of Object.entries(d.views.multifilar.edges)) {
          if (e.connectionId === connectionId) delete d.views.multifilar.edges[eid];
        }
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
    },

    upsertCircuit: (circuit) => {
      const nextDoc = produce(get().doc, (d) => {
        d.engineering.circuits[circuit.id] = circuit;
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });
      set({ doc: nextDoc, dirty: true });
    },

    upsertTag: (tag) => {
      const prevTag = get().doc.engineering.tags[tag.id];
      const oldName = prevTag?.name;

      const nextDoc = produce(get().doc, (d) => {
        d.engineering.tags[tag.id] = tag;

        // Propagate symbolic name change across Ladder rungs, FBD nodes, SCADA widgets, and Twin hotspots
        if (oldName && oldName !== tag.name) {
          for (const block of d.plc.project.programBlocks) {
            if (block.ladder?.rungs) {
              const rungs = block.ladder.rungs as LadderRung[];
              for (const r of rungs) {
                for (const row of r.cells) {
                  for (const cell of row) {
                    if (cell.operand === oldName) {
                      cell.operand = tag.name;
                    }
                  }
                }
              }
            }
            if (block.fbd?.nodes) {
              for (const fn of block.fbd.nodes as Array<{ data?: Record<string, unknown> }>) {
                if (fn.data?.tag === oldName) fn.data.tag = tag.name;
                if (fn.data?.label === oldName) fn.data.label = tag.name;
              }
            }
          }
          for (const w of Object.values(d.views.scada.widgets)) {
            if (w.boundTagId === tag.id || w.params.tag === oldName) {
              w.boundTagId = tag.id;
              w.params.tag = tag.name;
            }
          }
          for (const m of d.views.twin.mappings) {
            for (const h of m.hotspots) {
              if (h.tag === oldName) h.tag = tag.name;
            }
          }
        }

        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
      return tag;
    },

    removeTag: (tagId) => {
      const existing = get().doc.engineering.tags[tagId];
      if (!existing) return;

      const nextDoc = produce(get().doc, (d) => {
        delete d.engineering.tags[tagId];
        for (const [bid, b] of Object.entries(d.engineering.controlBindings)) {
          if (b.tagId === tagId) delete d.engineering.controlBindings[bid];
        }
        for (const ch of Object.values(d.engineering.plcChannels)) {
          if (ch.tagId === tagId) ch.tagId = null;
        }
        for (const w of Object.values(d.views.scada.widgets)) {
          if (w.boundTagId === tagId || w.params.tag === existing.name) {
            w.boundTagId = null;
            d.diagnostics.push({
              id: `diag_${ulid()}`,
              severity: "warning",
              code: "SCADA_ORPHAN_TAG_BINDING",
              message: `Widget SCADA '${w.label || w.id}' referencia a tag removida '${existing.name}'.`,
              messageParams: { widgetId: w.id, tagId, tagName: existing.name },
              sourceRepresentation: "plc",
              targetRepresentation: "scada",
              entityIds: [w.id, tagId],
              requiresUserIntervention: true,
              createdAt: new Date().toISOString(),
            });
          }
        }
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
    },

    bindControl: (input) => {
      const id = input.id ?? `cb_${ulid()}`;
      const binding: ControlBinding = {
        id,
        equipmentId: input.equipmentId,
        role: input.role,
        tagId: input.tagId,
        terminalIds: input.terminalIds ?? [],
      };
      const nextDoc = produce(get().doc, (d) => {
        d.engineering.controlBindings[id] = binding;
        const tag = d.engineering.tags[input.tagId];
        if (tag && !tag.linkedEquipmentId) {
          tag.linkedEquipmentId = input.equipmentId;
        }
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });
      set({ doc: nextDoc, dirty: true });
      return binding;
    },

    unbindControl: (bindingId) => {
      const nextDoc = produce(get().doc, (d) => {
        delete d.engineering.controlBindings[bindingId];
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });
      set({ doc: nextDoc, dirty: true });
    },

    bindPlcChannel: (binding) => {
      const curDoc = get().doc;
      const collision = Object.values(curDoc.engineering.plcChannels).find(
        (ch) =>
          ch.channelId !== binding.channelId &&
          ((ch.slotNumber === binding.slotNumber && ch.channelIndex === binding.channelIndex) ||
            ch.address.toUpperCase() === binding.address.toUpperCase()) &&
          ch.tagId !== null &&
          binding.tagId !== null &&
          ch.tagId !== binding.tagId,
      );

      if (collision) {
        const diag: ModelDiagnostic = {
          id: `diag_${ulid()}`,
          severity: "error",
          code: "PLC_IO_ADDRESS_COLLISION",
          message: `Colisão de endereço PLC em '${binding.address}' (Slot ${binding.slotNumber}, Canal ${binding.channelIndex}).`,
          messageParams: {
            address: binding.address,
            slot: binding.slotNumber,
            channel: binding.channelIndex,
          },
          sourceRepresentation: "plc",
          entityIds: [binding.channelId, collision.channelId],
          requiresUserIntervention: true,
          createdAt: new Date().toISOString(),
        };
        const nextDoc = produce(curDoc, (d) => {
          d.diagnostics.push(diag);
        });
        set({ doc: nextDoc });
        return { ok: false, diagnostic: diag };
      }

      const nextDoc = produce(curDoc, (d) => {
        d.engineering.plcChannels[binding.channelId] = binding;
        if (binding.tagId && d.engineering.tags[binding.tagId]) {
          d.engineering.tags[binding.tagId].address = binding.address;
          d.engineering.tags[binding.tagId].plcChannelId = binding.channelId;
        }
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });
      set({ doc: nextDoc, dirty: true });
      syncLegacyStoresFromUnifiedDoc(nextDoc);
      return { ok: true };
    },

    upsertStudy: (input) => {
      const curDoc = get().doc;
      const hash = computeEquipmentStudyHash(curDoc, input.inputEquipmentIds);
      const record: EngineeringStudyRecord = {
        id: input.id,
        studyType: input.studyType,
        title: input.title,
        inputEquipmentIds: [...input.inputEquipmentIds],
        inputSnapshotHash: hash,
        status: input.status ?? "valid",
        parameters: { ...input.parameters },
        results: { ...input.results },
        updatedAt: new Date().toISOString(),
      };
      const nextDoc = produce(curDoc, (d) => {
        d.studies[record.id] = record;
        d.metadata.revision += 1;
        d.metadata.updatedAt = record.updatedAt;
      });
      set({ doc: nextDoc, dirty: true });
      return record;
    },

    invalidateDependentStudies: (equipmentIds) => {
      const nextDoc = produce(get().doc, (d) => {
        invalidateStudiesInDraft(d, equipmentIds);
      });
      set({ doc: nextDoc, dirty: true });
    },

    recordDiagnostic: (input) => {
      const diag: ModelDiagnostic = {
        id: input.id ?? `diag_${ulid()}`,
        severity: input.severity,
        code: input.code,
        message: input.message,
        messageParams: input.messageParams ?? {},
        sourceRepresentation: input.sourceRepresentation,
        targetRepresentation: input.targetRepresentation,
        entityIds: input.entityIds ?? [],
        requiresUserIntervention: input.requiresUserIntervention ?? false,
        createdAt: new Date().toISOString(),
      };
      const nextDoc = produce(get().doc, (d) => {
        d.diagnostics.push(diag);
      });
      set({ doc: nextDoc });
      return diag;
    },

    clearDiagnostics: (filter) => {
      const nextDoc = produce(get().doc, (d) => {
        if (!filter) {
          d.diagnostics = [];
          return;
        }
        d.diagnostics = d.diagnostics.filter((diag) => {
          if (filter.code && diag.code === filter.code) return false;
          if (filter.entityId && diag.entityIds.includes(filter.entityId)) return false;
          return true;
        });
      });
      set({ doc: nextDoc });
    },

    syncLegacyStores: () => {
      syncLegacyStoresFromUnifiedDoc(get().doc);
    },

    setActiveProgramBlock: (blockId) => {
      const block = get().doc.plc.project.programBlocks.find((b) => b.id === blockId);
      if (!block) return;
      if (block.language !== "ladder" && block.language !== "fbd") return;
      const nextDoc = produce(get().doc, (d) => {
        if (block.language === "ladder") d.plc.activeLadderBlockId = blockId;
        else d.plc.activeFbdBlockId = blockId;
      });
      set({ doc: nextDoc });
    },

    ingestDiagramDocChange: (diagramDoc) => {
      if (isSyncingStores) return;
      const nextDoc = produce(get().doc, (d) => {
        d.views.diagramDocId = diagramDoc.id;
        d.views.sheets = [...diagramDoc.sheets];

        const prevDiagramEquipmentIds = new Set<string>([
          ...Object.values(d.views.unifilar.nodes).map((n) => n.equipmentId),
          ...Object.values(d.views.multifilar.nodes).map((n) => n.equipmentId),
        ]);
        const prevUnifilarConnectionIds = new Set<string>(
          Object.values(d.views.unifilar.edges).map((e) => e.connectionId),
        );
        const seenEquipmentIds = new Set<string>();
        const nextUniNodes: typeof d.views.unifilar.nodes = {};
        const nextMultiNodes: typeof d.views.multifilar.nodes = {};

        for (const n of Object.values(diagramDoc.nodes)) {
          const explicitEqId =
            typeof n.ui?.equipmentId === "string" && n.ui.equipmentId.length > 0
              ? n.ui.equipmentId
              : n.id;

          if (n.sheet === "unifilar") {
            seenEquipmentIds.add(explicitEqId);
            const specs = extractSpecsFromDiagramParams(n.params);
            const existingEq = d.engineering.equipments[explicitEqId];
            d.engineering.equipments[explicitEqId] = {
              id: explicitEqId,
              tagCode: n.params.tag || existingEq?.tagCode || n.label || n.id,
              displayName: n.label || existingEq?.displayName || n.id,
              catalogType: n.params.kind,
              category: defaultCategoryForKind(n.params.kind),
              phases: defaultPhasesForKind(n.params.kind, specs.poles),
              terminals:
                existingEq?.terminals ?? defaultTerminalsForEquipment(explicitEqId, n.params.kind),
              specs: { ...(existingEq?.specs ?? {}), ...specs },
              diagramParams: n.params,
              circuitId: existingEq?.circuitId,
            };
            nextUniNodes[n.id] = {
              nodeId: n.id,
              equipmentId: explicitEqId,
              position: { ...n.position },
              rotation: n.rotation ?? 0,
              label: n.label ?? "",
              ui: { ...(n.ui ?? {}), equipmentId: explicitEqId },
            };
            invalidateStudiesInDraft(d, [explicitEqId]);
          } else if (n.sheet === "multifilar") {
            seenEquipmentIds.add(explicitEqId);
            nextMultiNodes[n.id] = {
              nodeId: n.id,
              equipmentId: explicitEqId,
              position: { ...n.position },
              rotation: n.rotation ?? 0,
              label: n.label ?? "",
              ui: { ...(n.ui ?? {}), equipmentId: explicitEqId },
            };
          }
        }

        d.views.unifilar.nodes = nextUniNodes;
        d.views.multifilar.nodes = nextMultiNodes;

        const nextUniEdges: typeof d.views.unifilar.edges = {};
        const nextMultiEdges: typeof d.views.multifilar.edges = {};

        for (const e of Object.values(diagramDoc.edges)) {
          if (e.sheet === "unifilar") {
            const fromEq = nextUniNodes[e.source]?.equipmentId ?? e.source;
            const toEq = nextUniNodes[e.target]?.equipmentId ?? e.target;
            const srcNode = diagramDoc.nodes[e.source];
            const tgtNode = diagramDoc.nodes[e.target];
            const fromCode = srcNode
              ? resolveTerminalCode(srcNode, e.sourcePort, "source")
              : (e.sourcePort || "out");
            const toCode = tgtNode
              ? resolveTerminalCode(tgtNode, e.targetPort, "target")
              : (e.targetPort || "in");

            d.engineering.connections[e.id] = {
              id: e.id,
              fromEquipmentId: fromEq,
              fromTerminalId: `${fromEq}:${fromCode}`,
              toEquipmentId: toEq,
              toTerminalId: `${toEq}:${toCode}`,
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
            nextUniEdges[e.id] = {
              edgeId: e.id,
              connectionId: e.id,
              waypoints: e.waypoints,
            };
          } else if (e.sheet === "multifilar") {
            const fromEq = nextMultiNodes[e.source]?.equipmentId ?? e.source;
            const toEq = nextMultiNodes[e.target]?.equipmentId ?? e.target;
            const matchingConn = Object.values(d.engineering.connections).find(
              (c) => c.fromEquipmentId === fromEq && c.toEquipmentId === toEq,
            );
            const connId = matchingConn?.id ?? e.id;
            nextMultiEdges[e.id] = {
              edgeId: e.id,
              connectionId: connId,
              sourceNodeId: e.source,
              targetNodeId: e.target,
              circuitConfig: e.circuitConfig,
              waypoints: e.waypoints,
            };
          }
        }

        // Poda: o que veio do diagrama e sumiu dele deixa de existir no modelo.
        for (const eqId of prevDiagramEquipmentIds) {
          if (seenEquipmentIds.has(eqId)) continue;
          delete d.engineering.equipments[eqId];
          for (const [bid, b] of Object.entries(d.engineering.controlBindings)) {
            if (b.equipmentId === eqId) delete d.engineering.controlBindings[bid];
          }
        }
        for (const connId of prevUnifilarConnectionIds) {
          if (!nextUniEdges[connId]) delete d.engineering.connections[connId];
        }

        d.views.unifilar.edges = nextUniEdges;
        d.views.multifilar.edges = nextMultiEdges;
        d.metadata.revision += 1;
        d.metadata.updatedAt = new Date().toISOString();
      });

      set({ doc: nextDoc, dirty: true });
      // Mantém o ProjectStore (usado pela Ponte/SCADA) atualizado quando o
      // WebglCanvas edita o diagrama — sem apagar widgets SCADA nem tags.
      mergeEquipmentsIntoProjectStore(nextDoc);
    },
  })),
);

/** Alias para compatibilidade reversa com referências legado/Vite */
export const useUnifiedStore = useUnifiedProjectStore;

// ── Ponte não destrutiva Diagrama → ProjectStore ────────────────────────────

let knownEquipmentNodeIds = new Set<string>();
let knownConnectionIds = new Set<string>();

/**
 * Atualiza no ProjectStore apenas o que deriva de equipamentos/conexões
 * canônicos. Widgets SCADA, tags e demais nós já presentes são preservados.
 */
function mergeEquipmentsIntoProjectStore(doc: UnifiedProjectDoc): void {
  if (isSyncingStores) return;
  try {
    const projected = projectLegacyViewsFromV3(doc);
    const ps = useProjectStore.getState();

    const eqNodes = projected.projectNodes.filter((n) => doc.engineering.equipments[n.id]);
    const eqEdges = projected.projectEdges.filter((e) => doc.engineering.connections[e.id]);
    const keptNodes = ps.nodes.filter(
      (n) => !doc.engineering.equipments[n.id] && !knownEquipmentNodeIds.has(n.id),
    );
    const keptEdges = ps.edges.filter(
      (e) => !doc.engineering.connections[e.id] && !knownConnectionIds.has(e.id),
    );
    knownEquipmentNodeIds = new Set(eqNodes.map((n) => n.id));
    knownConnectionIds = new Set(eqEdges.map((e) => e.id));

    useProjectStore.setState({
      nodes: [...keptNodes, ...eqNodes],
      edges: [...keptEdges, ...eqEdges],
    });
  } catch (err) {
    console.warn("[unified-store] falha ao projetar equipamentos no ProjectStore:", err);
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Assinatura estrutural: ignora campos puramente de runtime. */
function designSignature(es: ReturnType<typeof useEditorStore.getState>): string {
  const rungs = es.rungs.map((r) => ({
    ...r,
    poweredOut: undefined,
    cells: r.cells.map((row) => row.map((c) => ({ ...c, energized: undefined }))),
  }));
  const tags = Object.values(es.editorTags).map((t) => [t.id, t.name, t.type]);
  return JSON.stringify([rungs, es.fbdNodes, es.fbdEdges, tags]);
}

let lastEditorSignature = "";

/** Editor (Ladder/FBD/tags) → bloco PLC ativo do modelo canônico. */
export function ingestEditorChange(): void {
  if (isSyncingStores) return;
  const es = useEditorStore.getState();
  const sig = designSignature(es);
  if (sig === lastEditorSignature) return;
  lastEditorSignature = sig;

  const rungs = clone(es.rungs);
  const fbdNodes = clone(es.fbdNodes);
  const fbdEdges = clone(es.fbdEdges);

  const nextDoc = produce(useUnifiedProjectStore.getState().doc, (d) => {
    const lb = d.plc.project.programBlocks.find(
      (b) => b.id === d.plc.activeLadderBlockId && b.language === "ladder",
    );
    if (lb) lb.ladder = { rungs };
    const fb = d.plc.project.programBlocks.find(
      (b) => b.id === d.plc.activeFbdBlockId && b.language === "fbd",
    );
    if (fb && (fbdNodes.length > 0 || fbdEdges.length > 0 || fb.fbd)) {
      fb.fbd = { nodes: fbdNodes, edges: fbdEdges };
    }

    for (const t of Object.values(es.editorTags)) {
      const byId = d.engineering.tags[t.id];
      const byName = Object.values(d.engineering.tags).find((x) => x.name === t.name);
      if (byId) {
        byId.name = t.name;
        byId.forced = t.forced;
      } else if (!byName) {
        d.engineering.tags[t.id] = {
          id: t.id,
          name: t.name,
          dataType: t.type === "STRING" ? "STRING" : t.type,
          area: inferAreaFromAddress(undefined, t.name),
          initialValue: t.value,
          forced: t.forced,
          retentive: false,
          description: "",
        };
      }
    }
    d.metadata.revision += 1;
    d.metadata.updatedAt = new Date().toISOString();
  });

  useUnifiedProjectStore.setState({ doc: nextDoc, dirty: true });

  // Espelha no PlcStore (sem reentrada) para que o PlcCanvas nunca veja um
  // bloco defasado em relação ao editor.
  isSyncingStores = true;
  try {
    const plc = usePlcStore.getState();
    const activeLadder = nextDoc.plc.activeLadderBlockId;
    const activeFbd = nextDoc.plc.activeFbdBlockId;
    const lb = plc.project.programBlocks.find((b) => b.id === activeLadder);
    if (lb?.language === "ladder") plc.updateBlock(lb.id, { ladder: { rungs } });
    const fb = plc.project.programBlocks.find((b) => b.id === activeFbd);
    if (fb?.language === "fbd" && (fbdNodes.length > 0 || fbdEdges.length > 0 || fb.fbd)) {
      plc.updateBlock(fb.id, { fbd: { nodes: fbdNodes, edges: fbdEdges } });
    }
  } finally {
    isSyncingStores = false;
  }
}

let lastPlcSignature = "";

/** PlcStore (variáveis, rack, blocos) → modelo canônico. */
export function ingestPlcProjectChange(): void {
  if (isSyncingStores) return;
  const project = usePlcStore.getState().project;
  const sig = JSON.stringify(project);
  if (sig === lastPlcSignature) return;
  lastPlcSignature = sig;

  const nextProject = clone(project);
  const nextDoc = produce(useUnifiedProjectStore.getState().doc, (d) => {
    const prevVarIds = new Set(d.plc.project.variables.map((v) => v.id));
    const nextVarIds = new Set(nextProject.variables.map((v) => v.id));

    d.plc.project = nextProject;

    for (const v of nextProject.variables) {
      const prev = d.engineering.tags[v.id];
      d.engineering.tags[v.id] = {
        id: v.id,
        name: v.name,
        dataType: v.type,
        area: inferAreaFromAddress(v.address, v.name),
        address: v.address,
        unit: prev?.unit,
        scaleMin: prev?.scaleMin,
        scaleMax: prev?.scaleMax,
        initialValue: v.initialValue ?? prev?.initialValue ?? (v.type === "BOOL" ? false : 0),
        forced: prev?.forced ?? false,
        retentive: v.retentive,
        description: v.comment,
        linkedEquipmentId: prev?.linkedEquipmentId,
        linkedTerminalId: prev?.linkedTerminalId,
        plcChannelId: prev?.plcChannelId,
      };
    }
    for (const id of prevVarIds) {
      if (!nextVarIds.has(id)) delete d.engineering.tags[id];
    }
    d.metadata.revision += 1;
    d.metadata.updatedAt = new Date().toISOString();
  });
  useUnifiedProjectStore.setState({ doc: nextDoc, dirty: true });
}

// Automatically subscribe to DiagramStore dispatches so WebglCanvas edits
// immediately populate UnifiedProjectStore and ProjectStore!
useDiagramStore.subscribe(
  (s) => s.doc,
  (doc, prevDoc) => {
    if (isSyncingStores || doc === prevDoc) return;
    useUnifiedProjectStore.getState().ingestDiagramDocChange(doc);
  },
);

lastEditorSignature = designSignature(useEditorStore.getState());
lastPlcSignature = JSON.stringify(usePlcStore.getState().project);

useEditorStore.subscribe((s, prev) => {
  if (isSyncingStores) return;
  if (
    s.rungs === prev.rungs &&
    s.fbdNodes === prev.fbdNodes &&
    s.fbdEdges === prev.fbdEdges &&
    s.editorTags === prev.editorTags
  ) {
    return;
  }
  ingestEditorChange();
});

usePlcStore.subscribe((s, prev) => {
  if (isSyncingStores || s.project === prev.project) return;
  ingestPlcProjectChange();
});
