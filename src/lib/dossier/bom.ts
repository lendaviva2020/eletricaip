// Lista de materiais do dossiê — SOMENTE o que existe no projeto.
//
// Antes este gerador acrescentava itens que não estavam no diagrama (DPS 40 kA
// ×4, DR 63 A/300 mA, botoeiras, sinaleiros, fonte 24 V, CLP "14 DI/10 DO
// PROFINET", sensores IP67, 150 m de cabo de comando) e completava motores com
// "IR3 Premium IP55 4 polos". Agora cada item é um equipamento do projeto com
// os dados que o engenheiro informou; o que falta aparece como pendência de
// especificação, nunca preenchido.
import type { ExtractedCanvasData } from "./extractor";
import type { BomGroupCategory, BomItem, BomItemSource, BomValidationState } from "./types";
import type { ElectricalCalculationMemory } from "./types";
import type { CanonicalEquipment } from "@/lib/model/unified-schema";

interface KindInfo {
  name: string;
  category: BomGroupCategory;
}

const KIND_INFO: Record<string, KindInfo> = {
  breaker: { name: "Disjuntor", category: "1_protecao_eletrica" },
  rcd: { name: "Dispositivo DR", category: "1_protecao_eletrica" },
  fuse: { name: "Fusível", category: "1_protecao_eletrica" },
  spd: { name: "DPS (protetor contra surtos)", category: "1_protecao_eletrica" },
  thermal_relay: { name: "Relé térmico de sobrecarga", category: "1_protecao_eletrica" },
  disconnector: { name: "Chave seccionadora", category: "2_manobra_comando" },
  contactor: { name: "Contator", category: "2_manobra_comando" },
  relay: { name: "Relé auxiliar", category: "2_manobra_comando" },
  motor: { name: "Motor", category: "3_motores_acionamentos" },
  vfd: { name: "Inversor de frequência", category: "3_motores_acionamentos" },
  softstarter: { name: "Soft-starter", category: "3_motores_acionamentos" },
  plc: { name: "CLP", category: "4_clp_modulos_interfaces" },
  hmi: { name: "IHM", category: "4_clp_modulos_interfaces" },
  psu: { name: "Fonte de alimentação", category: "4_clp_modulos_interfaces" },
  pt100: { name: "Sensor de temperatura PT100", category: "5_sensores_instrumentacao" },
  pressure: { name: "Transmissor de pressão", category: "5_sensores_instrumentacao" },
  flow: { name: "Medidor de vazão", category: "5_sensores_instrumentacao" },
  level: { name: "Sensor de nível", category: "5_sensores_instrumentacao" },
  encoder: { name: "Encoder", category: "5_sensores_instrumentacao" },
  terminal: { name: "Borne", category: "7_bornes_acessorios" },
  busbar: { name: "Barramento", category: "8_paineis_barramentos_montagem" },
  ccm: { name: "CCM", category: "8_paineis_barramentos_montagem" },
  transformer: { name: "Transformador", category: "8_paineis_barramentos_montagem" },
  generator: { name: "Gerador", category: "8_paineis_barramentos_montagem" },
  capacitor_bank: { name: "Banco de capacitores", category: "8_paineis_barramentos_montagem" },
  load: { name: "Carga", category: "8_paineis_barramentos_montagem" },
  lamp: { name: "Luminária", category: "8_paineis_barramentos_montagem" },
  socket: { name: "Tomada", category: "8_paineis_barramentos_montagem" },
  estop: { name: "Botão de emergência", category: "9_dispositivos_seguranca" },
  lightcurtain: { name: "Cortina de luz", category: "9_dispositivos_seguranca" },
};

/** Referências do desenho, sem item de compra. */
const NOT_A_PRODUCT = new Set(["ground", "neutral"]);

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Dados nominais que o engenheiro informou no equipamento (nada completado). */
function ratings(eq: CanonicalEquipment): {
  parts: string[];
  item: Partial<BomItem>;
  missing: string[];
} {
  const p = (eq.diagramParams ?? {}) as Record<string, unknown>;
  const s = eq.specs;
  const parts: string[] = [];
  const item: Partial<BomItem> = {};
  const missing: string[] = [];
  const In = s.nominalCurrentA ?? num(p.in_A);
  const kW = s.powerKw ?? num(p.power_kW);
  const W = s.powerW ?? num(p.power_W);
  const kVA = s.apparentPowerKva ?? num(p.kVA);
  const V = s.voltageV ?? num(p.voltage_V) ?? num(p.secondary_V);
  const curve = s.tripCurve ?? text(p.curve);
  const poles = s.poles ?? num(p.poles);
  const icu = s.breakingCapacityKa ?? num(p.icc_kA);

  if (In) {
    parts.push(`In ${In} A`);
    item.nominalCurrent = `${In} A`;
  }
  if (curve) {
    parts.push(`curva ${curve}`);
    item.tripCurve = curve;
  }
  if (poles) {
    parts.push(`${poles} polos`);
    item.poles = poles;
  }
  if (icu) {
    parts.push(`Icu ${icu} kA`);
    item.breakingCapacityKa = icu;
  }
  if (kW) {
    parts.push(`${kW} kW`);
    item.nominalPower = `${kW} kW`;
  } else if (W) {
    parts.push(`${W} W`);
    item.nominalPower = `${W} W`;
  }
  if (kVA) {
    parts.push(`${kVA} kVA`);
    item.nominalPower = `${kVA} kVA`;
  }
  if (V) {
    parts.push(`${V} V`);
    item.nominalVoltage = `${V} V`;
  }
  const sens = s.rcdSensitivityMa ?? num(p.sensitivity_mA);
  if (sens) parts.push(`IΔn ${sens} mA`);
  const coil = s.coilVoltageV ?? num(p.coil_V);
  if (coil) item.controlVoltage = `${coil} V`;
  const trip = text(p.trip_class);
  if (trip) parts.push(`classe ${trip}`);
  if (eq.catalogType === "spd") {
    const cls = text(p.spd_class);
    if (cls) parts.push(`classe ${cls}`);
    if (num(p.uc_V)) parts.push(`Uc ${num(p.uc_V)} V`);
    if (num(p.up_kV)) parts.push(`Up ${num(p.up_kV)} kV`);
    if (num(p.in_kA)) parts.push(`In ${num(p.in_kA)} kA`);
    if (num(p.iimp_kA)) parts.push(`Iimp ${num(p.iimp_kA)} kA`);
  }

  const needsCurrent = ["breaker", "rcd", "fuse", "contactor", "thermal_relay", "disconnector"];
  if (needsCurrent.includes(eq.catalogType) && !In) missing.push("corrente nominal");
  if (eq.catalogType === "breaker" && !icu) missing.push("capacidade de interrupção (Icu)");
  if (["motor", "vfd", "softstarter"].includes(eq.catalogType) && !kW) missing.push("potência");
  return { parts, item, missing };
}

export function generateIndustrialBom(
  extracted: ExtractedCanvasData,
  _calculations?: ElectricalCalculationMemory,
): BomItem[] {
  const items: BomItem[] = [];
  let counter = 1;

  // ── Equipamentos do projeto ──────────────────────────────────────────────
  const equipments = [...extracted.equipments].sort((a, b) =>
    a.tagCode.localeCompare(b.tagCode, "pt-BR", { numeric: true }),
  );
  for (const eq of equipments) {
    if (NOT_A_PRODUCT.has(eq.catalogType)) continue;
    const info = KIND_INFO[eq.catalogType] ?? {
      name: eq.catalogType,
      category: "8_paineis_barramentos_montagem" as BomGroupCategory,
    };
    const p = (eq.diagramParams ?? {}) as Record<string, unknown>;
    const manufacturer = text(p.manufacturer);
    const model = text(p.model);
    const { parts, item, missing } = ratings(eq);
    const hasCatalog = Boolean(manufacturer && model);

    let sourceKind: BomItemSource = "canvas_identified";
    let validationStatus: BomValidationState = hasCatalog
      ? "validated"
      : "pending_catalog_selection";
    if (missing.length > 0) {
      sourceKind = "incomplete_specification";
      validationStatus = "requires_review";
    }
    const notes: string[] = [];
    if (missing.length) notes.push(`Falta informar: ${missing.join(", ")}.`);
    if (!hasCatalog) notes.push("Fabricante/modelo não definidos (seleção comercial pendente).");

    items.push({
      id: `bom-${eq.id}-${counter++}`,
      tag: eq.tagCode,
      description: [
        info.name,
        eq.displayName && eq.displayName !== eq.tagCode ? eq.displayName : "",
        parts.join(", "),
      ]
        .filter(Boolean)
        .join(" — "),
      category: info.category,
      quantity: 1,
      unit: "un",
      ...(manufacturer ? { manufacturer } : {}),
      ...(model ? { modelOrCatalog: model } : {}),
      ...item,
      sourceEquipmentId: eq.id,
      sourceKind,
      validationStatus,
      ...(notes.length ? { notes: notes.join(" ") } : {}),
    });
  }

  // ── Cabos: soma dos comprimentos INFORMADOS por seção ────────────────────
  interface CableGroup {
    section: number;
    insulation: string;
    material: "Cu" | "Al";
    lengthM: number;
    runs: number;
    runsWithoutLength: number;
  }
  const groups = new Map<string, CableGroup>();
  let withoutSection = 0;
  for (const c of extracted.connections) {
    if ((c.kind ?? "power") !== "power") continue;
    const cond = c.conductor;
    if (!cond?.crossSectionMm2) {
      withoutSection += 1;
      continue;
    }
    const key = `${cond.crossSectionMm2}|${cond.insulation}|${cond.material}`;
    const g = groups.get(key) ?? {
      section: cond.crossSectionMm2,
      insulation: cond.insulation,
      material: cond.material,
      lengthM: 0,
      runs: 0,
      runsWithoutLength: 0,
    };
    g.runs += 1;
    if (cond.lengthM) g.lengthM += cond.lengthM;
    else g.runsWithoutLength += 1;
    groups.set(key, g);
  }
  for (const g of [...groups.values()].sort((a, b) => a.section - b.section)) {
    const incomplete = g.runsWithoutLength > 0;
    items.push({
      id: `bom-cable-${g.section}-${g.insulation}-${counter++}`,
      tag: `W ${g.section} mm²`,
      description: `Cabo de ${g.material === "Cu" ? "cobre" : "alumínio"} ${g.section} mm² isolação ${g.insulation} — ${g.runs} trecho(s) do unifilar`,
      category: "6_cabos_condutores",
      quantity: Math.round(g.lengthM * 10) / 10,
      unit: "m (rota)",
      conductorSectionMm2: g.section,
      conductorLengthM: Math.round(g.lengthM * 10) / 10,
      conductorMaterial: g.material,
      insulationType: g.insulation as BomItem["insulationType"],
      sourceKind: incomplete ? "incomplete_specification" : "canvas_identified",
      validationStatus: incomplete ? "requires_review" : "pending_catalog_selection",
      notes: [
        "Comprimento de rota do unifilar; multiplicar pelo número de condutores do circuito (fases, N, PE) e somar as sobras de montagem.",
        incomplete
          ? `${g.runsWithoutLength} trecho(s) sem comprimento informado — quantidade incompleta.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  if (withoutSection > 0) {
    items.push({
      id: `bom-cable-pending-${counter++}`,
      tag: "W ?",
      description: `${withoutSection} trecho(s) de potência sem seção definida`,
      category: "6_cabos_condutores",
      quantity: withoutSection,
      unit: "trecho",
      sourceKind: "incomplete_specification",
      validationStatus: "requires_review",
      notes: "Dimensione os cabos na aba Cálculos NBR 5410 do unifilar.",
    });
  }

  return items;
}
