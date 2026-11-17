// SCADA SUPERVISÓRIO — Canonical Equipment & Tag Bridge (Single Source of Truth)
// Standards: IEC 61131-3, ISA-101, IEC 60617
// Bridges CanonicalEngineeringModel (UnifiedProjectDoc) with ScadaStore

import type {
  CanonicalEquipment,
  CanonicalTag,
  UnifiedProjectDoc,
} from "@/lib/model/unified-schema";
import { canonicalIndustrialDataService } from "@/lib/industrial/canonical-data-service";
import type { EquipmentTelemetry, ScadaTagDefinition } from "./types";
import { useScadaStore } from "./scada-store";

/**
 * Maps a CanonicalEquipment from the unified engineering schema (v3) to SCADA telemetry.
 * Retains 100% stable equipment identity (`id`) across all views.
 */
const SENSOR_TYPES = new Set(["pt100", "pressure", "flow", "level", "encoder", "sensor"]);

/** Categoria pelo tipo real do equipamento (antes todo motor/carga virava "PUMP"). */
export function scadaCategoryOf(eq: CanonicalEquipment): EquipmentTelemetry["category"] {
  const t = (eq.catalogType || "").toLowerCase();
  if (t === "motor") return "MOTOR";
  if (t === "pump") return "PUMP";
  if (t === "transformer") return "TRANSFORMER";
  if (t === "plc" || eq.category === "plc_module") return "PLC";
  if (SENSOR_TYPES.has(t) || eq.category === "instrumentation") return "SENSOR";
  if (t === "valve") return "VALVE";
  return "PANEL";
}

export function canonicalToScadaTelemetry(
  eq: CanonicalEquipment,
  linkedTags: CanonicalTag[] = [],
): EquipmentTelemetry {
  const specs = eq.specs || {};
  const powerKw = specs.powerKw ?? (specs.powerW ? specs.powerW / 1000 : 0);
  const nominalVoltage = specs.voltageV ?? 0;
  const nominalCurrent = specs.nominalCurrentA ?? 0;

  return {
    id: eq.id,
    tag: eq.tagCode || eq.id,
    name: eq.displayName || `${eq.catalogType || "Equipamento"} ${eq.tagCode || eq.id}`,
    category: scadaCategoryOf(eq),
    status: "STANDBY",
    mode: "AUTO",
    // Telemetria: zero até uma fonte publicar. Parâmetros de projeto (tensão,
    // fator de potência) não são exibidos como se fossem medidos.
    voltageV: 0,
    currentA: 0,
    powerKw,
    powerFactor: 0,
    frequencyHz: 0,
    runningHours: 0,
    startsCount: 0,
    lastMaintenance: "—",
    nominal: {
      voltageV: nominalVoltage || undefined,
      currentA: nominalCurrent || undefined,
      powerFactor: specs.powerFactor,
    },
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
    // Sem fonte publicando ainda: não é leitura boa.
    quality: "NOT_CONNECTED",
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

  // Ensure canonical industrial data model stays synchronized with UnifiedProjectDoc
  try {
    const plantId = `plant_${doc.metadata.id || "default"}`;
    canonicalIndustrialDataService.registerOrganization({
      id: tenantId,
      name: `Tenant ${tenantId}`,
      slug: tenantId.toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
    });
    canonicalIndustrialDataService.registerPlant({
      id: plantId,
      tenantId,
      name: doc.metadata.name || "Planta Principal",
      code: (doc.metadata.id || "PLT01").slice(0, 16),
    });
    canonicalIndustrialDataService.syncFromUnifiedProjectDoc(doc, {
      tenantId,
      plantId,
      actor: "scada-canonical-bridge",
    });
  } catch {
    // Non-blocking if custom tenant/plant identifiers in legacy tests do not match strict slugs
  }
}
