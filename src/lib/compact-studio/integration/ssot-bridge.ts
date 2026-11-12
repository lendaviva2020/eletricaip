/**
 * SSOT Bridge: Integrates eletric Studio symbols, live runtime frames, SCADA/Unifilar tags,
 * and tenant RBAC permissions over UnifiedProjectStore + useRuntimeStore without duplication.
 */
import type { CanonicalTag, UnifiedProjectDoc } from "@/lib/model/unified-schema";
import { inferAreaFromAddress } from "@/lib/model/unified-schema";
import { useRuntimeStore } from "@/lib/model/runtime-store";
import type { CompactIoSymbol, CompactProgramModel } from "../domain/types";
import type { CompactRuntimeFrame } from "../runtime/compact-execution-engine";

export type CompactStudioRole = "viewer" | "operator" | "engineer" | "admin" | "owner" | "auditor";
export type CompactStudioAction =
  | "view_program"
  | "run_simulation"
  | "force_runtime_tag"
  | "edit_program"
  | "edit_hardware"
  | "manage_udfs"
  | "read_field_device"
  | "write_field_device";

export function checkCompactStudioPermission(
  role: CompactStudioRole,
  action: CompactStudioAction,
): boolean {
  if (action === "view_program") return true;
  if (action === "run_simulation") {
    return role !== "auditor";
  }
  if (action === "force_runtime_tag") {
    return role === "operator" || role === "engineer" || role === "admin" || role === "owner";
  }
  if (action === "edit_program" || action === "edit_hardware" || action === "manage_udfs") {
    return role === "engineer" || role === "admin" || role === "owner";
  }
  if (action === "read_field_device") {
    return role === "operator" || role === "engineer" || role === "admin" || role === "owner";
  }
  if (action === "write_field_device") {
    return role === "admin" || role === "owner";
  }
  return false;
}

export interface SymbolTagReconcileConflict {
  readonly kind: "DUPLICATE_ADDRESS" | "DUPLICATE_SYMBOL_NAME";
  readonly symbolId: string;
  readonly existingTagId: string;
  readonly message: string;
}

export interface SsotReconcileResult {
  readonly model: CompactProgramModel;
  readonly updatedTags: Record<string, CanonicalTag>;
  readonly conflicts: readonly SymbolTagReconcileConflict[];
}

function toCanonicalDataType(sig: CompactIoSymbol["signalType"]): CanonicalTag["dataType"] {
  switch (sig) {
    case "INT":
    case "REAL":
    case "TIME":
    case "BYTE":
    case "WORD":
    case "STRING":
    case "BOOL":
      return sig;
    default:
      return "BOOL";
  }
}

/**
 * Synchronizes CompactIoSymbol entries with UnifiedProjectDoc.engineering.tags
 * preserving persistent UUID identity (`canonicalTagId`) across renames.
 */
export function reconcileCompactSymbolsWithUnifiedTags(
  model: CompactProgramModel,
  doc: UnifiedProjectDoc,
): SsotReconcileResult {
  const tags: Record<string, CanonicalTag> = { ...doc.engineering.tags };
  const conflicts: SymbolTagReconcileConflict[] = [];
  const seenAddress = new Map<string, string>(); // address -> tagId
  const seenName = new Map<string, string>(); // symbolicName -> tagId

  // Index existing non-compact tags first so conflicts are detected deterministically
  for (const tag of Object.values(tags)) {
    if (tag.address) seenAddress.set(tag.address.toUpperCase(), tag.id);
    if (tag.name) seenName.set(tag.name.toUpperCase(), tag.id);
  }

  const nextSymbols: CompactIoSymbol[] = model.ioSymbols.map((sym) => {
    const tagId = sym.canonicalTagId || `cs_tag_${sym.id}`;
    const addrKey = sym.address.toUpperCase();
    const nameKey = sym.symbolicName.toUpperCase();

    const ownerByAddr = seenAddress.get(addrKey);
    if (ownerByAddr && ownerByAddr !== tagId) {
      conflicts.push({
        kind: "DUPLICATE_ADDRESS",
        symbolId: sym.id,
        existingTagId: ownerByAddr,
        message: `Endereço '${sym.address}' já associado ao tag UUID '${ownerByAddr}'.`,
      });
    } else {
      seenAddress.set(addrKey, tagId);
    }

    const ownerByName = seenName.get(nameKey);
    if (ownerByName && ownerByName !== tagId) {
      conflicts.push({
        kind: "DUPLICATE_SYMBOL_NAME",
        symbolId: sym.id,
        existingTagId: ownerByName,
        message: `Símbolo '${sym.symbolicName}' já existe no tag UUID '${ownerByName}'.`,
      });
    } else {
      seenName.set(nameKey, tagId);
    }

    const prevTag = tags[tagId];
    tags[tagId] = {
      id: tagId,
      name: sym.symbolicName,
      dataType: toCanonicalDataType(sym.signalType),
      area: inferAreaFromAddress(sym.address, sym.symbolicName),
      address: sym.address,
      unit: prevTag?.unit,
      scaleMin: prevTag?.scaleMin,
      scaleMax: prevTag?.scaleMax,
      initialValue: sym.initialValue,
      forced: prevTag?.forced ?? false,
      retentive: sym.retentive,
      description: sym.comment,
      linkedEquipmentId: prevTag?.linkedEquipmentId,
      linkedTerminalId: prevTag?.linkedTerminalId,
      plcChannelId: prevTag?.plcChannelId,
    };

    return {
      ...sym,
      canonicalTagId: tagId,
    };
  });

  // Propagate renamed symbols back onto bound CompactNodes cleanly
  const symById = new Map(nextSymbols.map((s) => [s.id, s]));
  const nextNodes = model.nodes.map((node) => {
    if (!node.ioSymbolId) return node;
    const sym = symById.get(node.ioSymbolId);
    if (!sym) return node;
    return {
      ...node,
      instanceName: sym.symbolicName,
      params: {
        ...node.params,
        address: sym.address,
      },
    };
  });

  return {
    model: {
      ...model,
      ioSymbols: nextSymbols,
      nodes: nextNodes,
    },
    updatedTags: tags,
    conflicts,
  };
}

/**
 * Streams live simulation output values into the ephemeral RuntimeStore (SCADA/Unifilar live overlay)
 * without mutating UnifiedProjectDoc or marking the project dirty.
 */
export function publishCompactFrameToRuntimeStore(
  model: CompactProgramModel,
  frame: CompactRuntimeFrame,
): void {
  const tagValuesById: Record<string, boolean | number | string> = {};
  const tagValuesByName: Record<string, boolean | number | string> = {};

  for (const sym of model.ioSymbols) {
    const val = frame.variables[sym.symbolicName] ?? frame.variables[sym.address];
    if (val === undefined) continue;
    const tagId = sym.canonicalTagId || `cs_tag_${sym.id}`;
    tagValuesById[tagId] = val;
    tagValuesByName[sym.symbolicName] = val;
  }

  for (const [k, v] of Object.entries(frame.variables)) {
    if (!(k in tagValuesByName)) {
      tagValuesByName[k] = v;
    }
  }

  useRuntimeStore.getState().applyRuntimeFrame({
    ts: frame.clockEpochMs,
    cycleMs: model.cycleTimeMs,
    tagValuesById,
    tagValuesByName,
  });
}
