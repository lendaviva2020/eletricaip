// SCADA SUPERVISÓRIO — Canonical Equipment & Tag Bridge (Single Source of Truth)
// Standards: IEC 61131-3, ISA-101, IEC 60617
// Bridges CanonicalEngineeringModel (UnifiedProjectDoc) with ScadaStore

import type {
  CanonicalEquipment,
  CanonicalTag,
  UnifiedProjectDoc,
} from "@/lib/model/unified-schema";
import type { EquipmentTelemetry, ScadaTagDefinition } from "./types";
import { useScadaStore } from "./scada-store";

/**
 * Maps a CanonicalEquipment from the unified engineering schema (v3) to SCADA telemetry.
 * Retains 100% stable equipment identity (`id`) across all views.
 */
export function canonicalToScadaTelemetry(
  eq: CanonicalEquipment,
  linkedTags: CanonicalTag[] = [],
): EquipmentTelemetry {
  const categoryMap: Record<string, EquipmentTelemetry["category"]> = {
    drive: "PUMP",
    load: "PUMP",
    source: "TRANSFORMER",
    protection: "PANEL",
    switching: "PANEL",
    instrumentation: "SENSOR",
    safety: "PANEL",
    plc_module: "PLC",
    passive: "PANEL",
    reference: "PANEL",
  };

  const specs = eq.specs || {};
  const powerKw = specs.powerKw ?? (specs.powerW ? specs.powerW / 1000 : 0);
  const nominalVoltage = specs.voltageV ?? 380;
  const nominalCurrent =
    specs.nominalCurrentA ??
    (powerKw > 0
      ? Number(
          (
            (powerKw * 1000) /
            (Math.sqrt(3) * nominalVoltage * (specs.powerFactor ?? 0.88))
          ).toFixed(1),
        )
      : 0);

  return {
    id: eq.id,
    tag: eq.tagCode || eq.id,
    name: eq.displayName || `${eq.catalogType || "Equipamento"} ${eq.tagCode || eq.id}`,
    category: categoryMap[eq.category] || "PANEL",
    status: "STANDBY",
    mode: "AUTO",
    voltageV: nominalVoltage,
    currentA: nominalCurrent,
    powerKw,
    powerFactor: specs.powerFactor ?? 0.92,
    frequencyHz: 60.0,
    runningHours: 0,
    startsCount: 0,
    lastMaintenance: new Date().toLocaleDateString("pt-BR"),
    alarmsCount: 0,
    linkedTags: linkedTags.filter((t) => t && t.name).map((t) => t.name),
  };
}

/**
 * Maps a CanonicalTag from unified schema to ScadaTagDefinition.
 */
export function canonicalToScadaTag(tag: CanonicalTag): ScadaTagDefinition {
  const dataTypeMap: Record<string, ScadaTagDefinition["dataType"]> = {
    BOOL: "BOOL",
    BYTE: "INT",
    WORD: "INT",
    DWORD: "INT",
    INT: "INT",
    DINT: "INT",
    REAL: "REAL",
    TIME: "TIME",
    STRING: "STRING",
  };

  return {
    id: tag.id,
    name: tag.name,
    description: tag.description || `TAG Canônica ${tag.name}`,
    dataType: dataTypeMap[tag.dataType] || "REAL",
    unit: tag.unit || "",
    scaleMin: tag.scaleMin ?? 0,
    scaleMax: tag.scaleMax ?? 100,
    value: tag.initialValue,
    quality: "GOOD",
    driver: "INTERNAL_RUNTIME",
    scanRateMs: 100,
    lastUpdated: Date.now(),
    forced: tag.forced || false,
    sourceAddress: tag.address || `${tag.area}`,
    linkedEquipmentId: tag.linkedEquipmentId,
    isSimulated: false,
  };
}

/**
 * Synchronizes a UnifiedProjectDoc with the ScadaStore, projecting canonical equipment
 * and tags into the supervisory runtime without creating duplicates.
 */
export function syncUnifiedDocToScada(
  doc: UnifiedProjectDoc,
  tenantId: string = "default-tenant",
): void {
  const equipments: Record<string, EquipmentTelemetry> = {};
  const tags: Record<string, ScadaTagDefinition> = {};

  const allTagsList = Object.values(doc.engineering?.tags || {}).filter((t): t is CanonicalTag =>
    Boolean(t && t.name),
  );

  // Project canonical tags
  for (const tag of allTagsList) {
    tags[tag.name] = canonicalToScadaTag(tag);
  }

  // Project canonical equipments
  for (const eq of Object.values(doc.engineering?.equipments || {}).filter(
    (e): e is CanonicalEquipment => Boolean(e && e.id),
  )) {
    const linked = allTagsList.filter((t) => t.linkedEquipmentId === eq.id);
    equipments[eq.id] = canonicalToScadaTelemetry(eq, linked);
  }

  useScadaStore.getState().setProjectContext({
    projectId: doc.metadata.id,
    tenantId,
    projectName: doc.metadata.name,
    isDemo: false,
    equipments,
    tags,
  });
}
