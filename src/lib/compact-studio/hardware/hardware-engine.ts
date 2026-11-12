/**
 * Hardware Rack Engineering Engine for Compact Studio:
 * - Slot assembly & removal
 * - Voltage & family compatibility validation
 * - Deterministic I/O auto-addressing (I1..I24, Q1..Q20, AI1..AI8, AQ1..AQ8)
 * - Program capacity vs Hardware validation & BOM export
 */
import type {
  CompactDiagnostic,
  CompactHardwareArchitecture,
  CompactModuleSlotSpec,
  CompactProgramModel,
} from "../domain/types";
import {
  findCatalogItemById,
  getCompactHardwareCatalog,
  type CompactCatalogItem,
} from "./catalog-loader";

export interface RackAddressAllocation {
  readonly slotIndex: number;
  readonly partCode: string;
  readonly diRange: string | null;
  readonly doRange: string | null;
  readonly aiRange: string | null;
  readonly aqRange: string | null;
}

export interface RackBomItem {
  readonly catalogId: string;
  readonly partCode: string;
  readonly description: string;
  readonly quantity: number;
  readonly family: CompactCatalogItem["family"];
  readonly verified: boolean;
  readonly sourceRef: string;
}

export interface RackEngineeringReport {
  readonly totalDi: number;
  readonly totalDo: number;
  readonly totalAi: number;
  readonly totalAq: number;
  readonly allocations: readonly RackAddressAllocation[];
  readonly diagnostics: readonly CompactDiagnostic[];
  readonly bom: readonly RackBomItem[];
  readonly widthModulesTotal: number;
}

function isVoltageCompatible(base: CompactCatalogItem, expansion: CompactCatalogItem): boolean {
  if (
    expansion.family === "POWER_SUPPLY" ||
    expansion.family === "COMM_MODULE" ||
    expansion.family === "ACCESSORY"
  ) {
    return true;
  }
  if (expansion.family === "EXPANSION_AI" || expansion.family === "EXPANSION_AO") {
    // Analog expansions require 24VDC (allowed on 24V classes or when powered by 24V rail)
    return expansion.supplyVoltage === "24VDC";
  }
  const baseIsAc = base.supplyVoltage.includes("230");
  const expIsAc = expansion.supplyVoltage.includes("230");
  return baseIsAc === expIsAc;
}

/**
 * Rebuilds hardware architecture metrics + adds/removes modules on the canonical model.
 */
export function selectBaseController(
  model: CompactProgramModel,
  baseCatalogId: string,
): CompactProgramModel {
  const base = findCatalogItemById(baseCatalogId);
  if (!base || base.family !== "BASE_COMPACT") return model;

  const existingExpansions = model.hardware.slots.filter((s) => s.slotIndex > 0);
  const baseSlot: CompactModuleSlotSpec = {
    slotIndex: 0,
    catalogId: base.id,
    partCode: base.partCode,
    family: "BASE_COMPACT",
    digitalInputs: base.digitalInputs,
    digitalOutputs: base.digitalOutputs,
    analogInputs: base.analogInputs,
    analogOutputs: base.analogOutputs,
  };

  const nextHardware: CompactHardwareArchitecture = {
    ...model.hardware,
    baseCatalogId: base.id,
    basePartCode: base.partCode,
    maxBlocks: base.maxBlocks ?? 400,
    retentiveMemoryBytes: base.retentiveMemoryBytes ?? 850,
    maxDigitalInputs: base.maxDigitalInputsTotal ?? 24,
    maxDigitalOutputs: base.maxDigitalOutputsTotal ?? 20,
    maxAnalogInputs: base.maxAnalogInputsTotal ?? 8,
    maxAnalogOutputs: base.maxAnalogOutputsTotal ?? 8,
    slots: [baseSlot, ...existingExpansions],
  };

  return { ...model, hardware: nextHardware };
}

export function addExpansionModule(
  model: CompactProgramModel,
  catalogId: string,
): CompactProgramModel {
  const item = findCatalogItemById(catalogId);
  if (!item || item.family === "BASE_COMPACT") return model;

  const nextSlotIndex =
    model.hardware.slots.length === 0
      ? 1
      : Math.max(...model.hardware.slots.map((s) => s.slotIndex)) + 1;

  const newSlot: CompactModuleSlotSpec = {
    slotIndex: nextSlotIndex,
    catalogId: item.id,
    partCode: item.partCode,
    family: item.family,
    digitalInputs: item.digitalInputs,
    digitalOutputs: item.digitalOutputs,
    analogInputs: item.analogInputs,
    analogOutputs: item.analogOutputs,
  };

  return {
    ...model,
    hardware: {
      ...model.hardware,
      hasExternalDisplay: model.hardware.hasExternalDisplay || item.id === "elc-acc-tde-panel",
      supplyCatalogId: item.family === "POWER_SUPPLY" ? item.id : model.hardware.supplyCatalogId,
      slots: [...model.hardware.slots, newSlot],
    },
  };
}

export function removeHardwareSlot(
  model: CompactProgramModel,
  slotIndex: number,
): CompactProgramModel {
  if (slotIndex === 0) return model; // Base CPU cannot be removed empty
  const remaining = model.hardware.slots
    .filter((s) => s.slotIndex !== slotIndex)
    .map((s, idx) => (idx === 0 ? s : { ...s, slotIndex: idx }));

  return {
    ...model,
    hardware: {
      ...model.hardware,
      hasExternalDisplay: remaining.some((s) => s.catalogId === "elc-acc-tde-panel"),
      slots: remaining,
    },
  };
}

/**
 * Evaluates full I/O auto-addressing, physical/electrical compatibility rules,
 * program usage vs hardware capacity, and generates a consolidated BOM.
 */
export function evaluateRackEngineering(model: CompactProgramModel): RackEngineeringReport {
  const catalog = getCompactHardwareCatalog();
  const baseItem =
    catalog.items.find((i) => i.id === model.hardware.baseCatalogId) ??
    catalog.items.find((i) => i.family === "BASE_COMPACT")!;

  let diCursor = 1;
  let doCursor = 1;
  let aiCursor = 1;
  let aqCursor = 1;
  let widthModulesTotal = 0;

  const allocations: RackAddressAllocation[] = [];
  const diagnostics: CompactDiagnostic[] = [];
  const bomCount = new Map<string, { item: CompactCatalogItem; qty: number }>();

  const sortedSlots = [...model.hardware.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  let expansionCount = 0;

  for (const slot of sortedSlots) {
    const item = findCatalogItemById(slot.catalogId);
    if (!item) {
      diagnostics.push({
        id: `hw_unknown_${slot.slotIndex}`,
        severity: "error",
        code: "HW_UNKNOWN_CATALOG_ITEM",
        messageKey: "compactStudio.diag.hwUnknownItem",
        message: `Módulo '${slot.partCode}' no slot ${slot.slotIndex} não encontrado no catálogo verificado.`,
      });
      continue;
    }

    const prevEntry = bomCount.get(item.id);
    bomCount.set(item.id, { item, qty: (prevEntry?.qty ?? 0) + 1 });
    widthModulesTotal += item.widthModules;

    if (slot.slotIndex > 0) {
      expansionCount += 1;
      if (!isVoltageCompatible(baseItem, item)) {
        diagnostics.push({
          id: `hw_volt_${slot.slotIndex}`,
          severity: "error",
          code: "HW_VOLTAGE_MISMATCH",
          messageKey: "compactStudio.diag.hwVoltageMismatch",
          message: `Incompatibilidade de tensão entre CPU '${baseItem.partCode}' (${baseItem.supplyVoltage}) e '${item.partCode}' (${item.supplyVoltage}) no slot ${slot.slotIndex}.`,
        });
      }
      if (item.family === "EXPANSION_AI" && baseItem.supplyVoltage.includes("230")) {
        diagnostics.push({
          id: `hw_24v_ai_${slot.slotIndex}`,
          severity: "warning",
          code: "HW_ANALOG_REQUIRES_24V_PSU",
          messageKey: "compactStudio.diag.hwAnalog24vPsu",
          message: `Módulo analógico '${item.partCode}' requer fonte auxiliar 24VDC quando acoplado à linha 115/230VAC.`,
        });
      }
    }

    const fmtRange = (prefix: string, start: number, count: number): string | null =>
      count > 0
        ? count === 1
          ? `${prefix}${start}`
          : `${prefix}${start}..${prefix}${start + count - 1}`
        : null;

    allocations.push({
      slotIndex: slot.slotIndex,
      partCode: slot.partCode,
      diRange: fmtRange("I", diCursor, slot.digitalInputs),
      doRange: fmtRange("Q", doCursor, slot.digitalOutputs),
      aiRange: fmtRange("AI", aiCursor, slot.analogInputs),
      aqRange: fmtRange("AQ", aqCursor, slot.analogOutputs),
    });

    diCursor += slot.digitalInputs;
    doCursor += slot.digitalOutputs;
    aiCursor += slot.analogInputs;
    aqCursor += slot.analogOutputs;
  }

  const totalDi = diCursor - 1;
  const totalDo = doCursor - 1;
  const totalAi = aiCursor - 1;
  const totalAq = aqCursor - 1;

  const maxExpSlots = baseItem.maxExpansionSlots ?? 5;
  if (expansionCount > maxExpSlots) {
    diagnostics.push({
      id: "hw_max_slots",
      severity: "error",
      code: "HW_MAX_EXPANSION_SLOTS",
      messageKey: "compactStudio.diag.hwMaxSlots",
      message: `Rack possui ${expansionCount} módulos adicionais, excedendo o máximo de ${maxExpSlots} para '${baseItem.partCode}'.`,
    });
  }

  if (totalDi > model.hardware.maxDigitalInputs) {
    diagnostics.push({
      id: "hw_max_di",
      severity: "error",
      code: "IO_CAPACITY_EXCEEDED",
      messageKey: "compactStudio.diag.hwMaxDi",
      message: `Total de DI alocadas (${totalDi}) excede o limite de plataforma (${model.hardware.maxDigitalInputs}).`,
    });
  }
  if (totalDo > model.hardware.maxDigitalOutputs) {
    diagnostics.push({
      id: "hw_max_do",
      severity: "error",
      code: "IO_CAPACITY_EXCEEDED",
      messageKey: "compactStudio.diag.hwMaxDo",
      message: `Total de DO alocadas (${totalDo}) excede o limite de plataforma (${model.hardware.maxDigitalOutputs}).`,
    });
  }
  if (totalAi > model.hardware.maxAnalogInputs) {
    diagnostics.push({
      id: "hw_max_ai",
      severity: "error",
      code: "IO_CAPACITY_EXCEEDED",
      messageKey: "compactStudio.diag.hwMaxAi",
      message: `Total de AI alocadas (${totalAi}) excede o limite de plataforma (${model.hardware.maxAnalogInputs}).`,
    });
  }
  if (totalAq > model.hardware.maxAnalogOutputs) {
    diagnostics.push({
      id: "hw_max_aq",
      severity: "error",
      code: "IO_CAPACITY_EXCEEDED",
      messageKey: "compactStudio.diag.hwMaxAq",
      message: `Total de AQ alocadas (${totalAq}) excede o limite de plataforma (${model.hardware.maxAnalogOutputs}).`,
    });
  }

  if (model.nodes.length > model.hardware.maxBlocks) {
    diagnostics.push({
      id: "hw_blocks_limit",
      severity: "error",
      code: "HARDWARE_BLOCK_LIMIT_EXCEEDED",
      messageKey: "compactStudio.diag.hwBlockLimit",
      message: `Programa usa ${model.nodes.length} blocos, acima da capacidade de ${model.hardware.maxBlocks} blocos de '${baseItem.partCode}'.`,
    });
  }

  // Check if program uses symbolic/node addresses not present in hardware
  for (const sym of model.ioSymbols) {
    const match = /^(I|Q|AI|AQ)(\d+)$/i.exec(sym.address.trim());
    if (!match) continue;
    const prefix = match[1].toUpperCase();
    const num = Number.parseInt(match[2], 10);
    const avail =
      prefix === "I" ? totalDi : prefix === "Q" ? totalDo : prefix === "AI" ? totalAi : totalAq;
    if (num > avail) {
      diagnostics.push({
        id: `hw_unmapped_${sym.id}`,
        severity: "error",
        code: "HW_IO_ADDRESS_UNAVAILABLE",
        messageKey: "compactStudio.diag.hwIoAddressUnavailable",
        message: `Endereço '${sym.address}' (${sym.symbolicName}) excede o hardware configurado (máx ${prefix}${avail}). Insira módulo de expansão.`,
      });
    }
  }

  const bom: RackBomItem[] = Array.from(bomCount.values()).map(({ item, qty }) => ({
    catalogId: item.id,
    partCode: item.partCode,
    description: item.name,
    quantity: qty,
    family: item.family,
    verified: item.verified,
    sourceRef: item.sourceRef,
  }));

  return {
    totalDi,
    totalDo,
    totalAi,
    totalAq,
    allocations,
    diagnostics,
    bom,
    widthModulesTotal,
  };
}
