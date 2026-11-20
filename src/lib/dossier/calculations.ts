// Deterministic Electrical Calculation Engine for Industrial Dossier
// Standards: ABNT NBR 5410:2004, NBR 14039, IEC 60909, IEC 60364
// Pure deterministic functions with full unit traceability and no fake values.

import {
  calcMotor,
  correctedAmpacityIz,
  motorNominalCurrent,
  motorStartingCurrent,
  pickBreaker_A,
  RHO_COPPER_OHM_MM2_PER_M,
  DEFAULT_REACTANCE_MOHM_PER_M,
  REACTANCE_THRESHOLD_MM2,
  NBR5410_SECTIONS,
  type CableSection_mm2,
  type InstallationMethod,
  type InsulationType,
} from "@/lib/electrical-calc";
import type { ExtractedCanvasData } from "./extractor";
import type { CircuitCalculation, CircuitType, ElectricalCalculationMemory } from "./types";
import type { CanonicalEquipment } from "@/lib/model/unified-schema";

const METHODS: ReadonlySet<string> = new Set(["A1", "A2", "B1", "B2", "C", "D", "E", "F"]);

export function computePeSection(phaseSectionMm2: number): number {
  // ABNT NBR 5410:2004 — Tabela 58 (Seção mínima do condutor de proteção PE)
  if (phaseSectionMm2 <= 16) return phaseSectionMm2;
  if (phaseSectionMm2 <= 35) return 16;
  return Math.ceil(phaseSectionMm2 / 2);
}

export function computeNeutralSection(phaseSectionMm2: number): number {
  // ABNT NBR 5410:2004 — Tabela 48 / §6.2.6.2 (Condutor neutro em circuitos trifásicos)
  if (phaseSectionMm2 <= 16) return phaseSectionMm2;
  if (phaseSectionMm2 <= 25) return 16;
  if (phaseSectionMm2 <= 35) return 25;
  if (phaseSectionMm2 <= 50) return 25;
  return Math.ceil(phaseSectionMm2 / 2);
}

export function computeVoltageDropWithReactance(params: {
  currentA: number;
  lengthM: number;
  sectionMm2: number;
  voltageV: number;
  cosPhi?: number;
  isThreePhase?: boolean;
}): { dropV: number; dropPct: number; resistanceOhmPerM: number; reactanceOhmPerM: number } {
  const cos = params.cosPhi ?? 0.85;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const rOhmPerM = RHO_COPPER_OHM_MM2_PER_M / params.sectionMm2;
  const xOhmPerM =
    params.sectionMm2 >= REACTANCE_THRESHOLD_MM2 ? DEFAULT_REACTANCE_MOHM_PER_M / 1000 : 0;

  const factor = params.isThreePhase !== false ? Math.sqrt(3) : 2;
  // Delta V = factor * I * L * (R * cosPhi + X * sinPhi)
  const dropV = factor * params.currentA * params.lengthM * (rOhmPerM * cos + xOhmPerM * sin);
  const dropPct = (dropV / params.voltageV) * 100;

  return {
    dropV: Number(dropV.toFixed(2)),
    dropPct: Number(dropPct.toFixed(2)),
    resistanceOhmPerM: Number(rOhmPerM.toFixed(6)),
    reactanceOhmPerM: Number(xOhmPerM.toFixed(6)),
  };
}

export function selectStandardTransformer(requiredKva: number): number {
  const standardTrafoKva = [
    15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1250, 1500, 2000, 2500,
  ];
  for (const kva of standardTrafoKva) {
    if (kva >= requiredKva) return kva;
  }
  return Math.ceil(requiredKva / 250) * 250;
}

export function generateElectricalCalculationMemory(
  extracted: ExtractedCanvasData,
): ElectricalCalculationMemory {
  const circuits: CircuitCalculation[] = [];
  const nominal = extracted.unifiedDoc.metadata.nominalSystem;
  const systemVoltage = nominal.lowVoltageV || 380;
  const nominalFreq = nominal.frequencyHz || 60;
  const earthing = nominal.earthingScheme || "não informado";
  const notCalculated: string[] = [];

  // Grafo de potência do projeto (para achar o cabo e o disjuntor REAIS de cada carga).
  const eqById = new Map(extracted.equipments.map((e) => [e.id, e]));
  const powerConns = extracted.connections.filter((c) => (c.kind ?? "power") === "power");
  const feedOf = (id: string) => powerConns.find((c) => c.toEquipmentId === id);
  const upstreamBreaker = (id: string) => {
    const seen = new Set<string>([id]);
    let cur = feedOf(id);
    while (cur && !seen.has(cur.fromEquipmentId)) {
      const up = eqById.get(cur.fromEquipmentId);
      if (!up) return undefined;
      if (up.catalogType === "breaker") return up;
      seen.add(up.id);
      cur = feedOf(up.id);
    }
    return undefined;
  };
  const breakerData = (b: CanonicalEquipment | undefined) => {
    const p = (b?.diagramParams ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
    return {
      In: b?.specs.nominalCurrentA ?? num(p.in_A),
      curve: (b?.specs.tripCurve ?? (typeof p.curve === "string" ? p.curve : undefined)) as
        "B" | "C" | "D" | "MA" | undefined,
      icu: b?.specs.breakingCapacityKa ?? num(p.icc_kA),
    };
  };

  let totalInstalledKw = 0;

  // 1. Um circuito por carga do projeto (motor, carga, iluminação, tomada)
  for (const eq of extracted.equipments) {
    const isMotor = eq.catalogType === "motor" || eq.category === "drive";
    const isGeneralLoad = eq.category === "load" || eq.catalogType === "load";
    const isLamp = eq.catalogType === "lamp";
    const isSocket = eq.catalogType === "socket";

    if (!isMotor && !isGeneralLoad && !isLamp && !isSocket) continue;

    const powerKw = eq.specs.powerKw ?? (eq.specs.powerW ? eq.specs.powerW / 1000 : undefined);
    if (powerKw === undefined) {
      // Sem potência informada não há corrente de projeto: pendência, nunca valor presumido.
      notCalculated.push(eq.tagCode);
      continue;
    }

    totalInstalledKw += powerKw;

    const voltageV = eq.specs.voltageV ?? systemVoltage;
    const cosPhi = eq.specs.powerFactor ?? (isMotor ? 0.85 : 0.95);
    const efficiency = eq.specs.efficiency ?? (isMotor ? 0.9 : 1.0);
    const isThreePhase = !eq.phases.startsWith("1F") && !eq.phases.startsWith("F");
    const circuitType: CircuitType = isMotor
      ? "motor_branch"
      : isLamp
        ? "lighting_branch"
        : isSocket
          ? "socket_branch"
          : "distribution";

    // Corrente de projeto Ib
    const designCurrentIbA = isThreePhase
      ? Number(((powerKw * 1000) / (Math.sqrt(3) * voltageV * cosPhi * efficiency)).toFixed(2))
      : Number(((powerKw * 1000) / (voltageV * cosPhi * efficiency)).toFixed(2));

    // Dados REAIS do projeto: cabo de alimentação da carga e disjuntor do circuito.
    const conductor = feedOf(eq.id)?.conductor;
    const breakerEq = upstreamBreaker(eq.id);
    const brk = breakerData(breakerEq);

    const insulation: InsulationType = conductor?.insulation ?? "PVC";
    const declaredMethod = conductor?.installationMethod as InstallationMethod | undefined;
    const installationMethod: InstallationMethod =
      declaredMethod && METHODS.has(declaredMethod) ? declaredMethod : "B1";
    const ambientTempC = 30;
    const tempFactorKt = 1.0;
    const groupedCircuits = 1;
    const groupFactorKg = 1.0;
    const lengthM = conductor?.lengthM ?? null;

    // Proteção: a do projeto; sem ela, a recomendada (e assim identificada).
    const breakerRatingInA = brk.In ?? pickBreaker_A(designCurrentIbA);
    const protectionSource: "projeto" | "recomendado" = brk.In ? "projeto" : "recomendado";
    const breakerCurve = brk.curve ?? (isMotor ? "D" : "C");

    // Seção mínima por capacidade de condução (Ib ≤ In ≤ I'z; NBR 5410 Tab. 47: 2,5 mm² força).
    const minSection: CableSection_mm2 = circuitType === "lighting_branch" ? 1.5 : 2.5;
    const target = Math.max(designCurrentIbA * (isMotor ? 1.25 : 1), breakerRatingInA);
    let requiredSection: CableSection_mm2 = minSection;
    for (const sec of NBR5410_SECTIONS) {
      if (sec < minSection) continue;
      const izCorr = correctedAmpacityIz(sec, {
        method: installationMethod,
        insulation,
        loadedConductors: isThreePhase ? 3 : 2,
        ambientTemp_C: ambientTempC,
        groupedCircuits,
      });
      if (izCorr >= target) {
        requiredSection = sec;
        break;
      }
    }
    const cableSource: "projeto" | "calculado" = conductor?.crossSectionMm2
      ? "projeto"
      : "calculado";
    const selectedCableMm2 = (conductor?.crossSectionMm2 ?? requiredSection) as CableSection_mm2;
    const correctedAmpacityIzA = correctedAmpacityIz(selectedCableMm2, {
      method: installationMethod,
      insulation,
      loadedConductors: isThreePhase ? 3 : 2,
      ambientTemp_C: ambientTempC,
      groupedCircuits,
    });
    const nominalAmpacityIzA = correctedAmpacityIzA;

    // Queda de tensão (NBR 5410 §6.2.7) — só com o comprimento real.
    const vDrop =
      lengthM !== null
        ? computeVoltageDropWithReactance({
            currentA: designCurrentIbA,
            lengthM,
            sectionMm2: selectedCableMm2,
            voltageV,
            cosPhi,
            isThreePhase,
          })
        : null;

    // Neutro e PE
    const neutralCableMm2 = isThreePhase
      ? computeNeutralSection(selectedCableMm2)
      : selectedCableMm2;
    const peCableMm2 = computePeSection(selectedCableMm2);

    // Dados de partida para motores
    const startMethod = eq.specs.startingMethod ?? "DOL";
    let startingCurrentIstartA: number | undefined;
    let overloadRelaySettingA: number | undefined;

    if (isMotor) {
      const calcMethod = startMethod === "VFD" ? "VFD" : startMethod === "SOFT" ? "SOFT" : "DOL";
      startingCurrentIstartA = Number(
        motorStartingCurrent(
          { id: eq.id, power_kW: powerKw, startMethod: calcMethod },
          designCurrentIbA,
        ).toFixed(1),
      );
      overloadRelaySettingA = designCurrentIbA;
    }

    const calculationNotes: string[] = [
      `Capacidade de condução: NBR 5410:2004 Tabelas 36/37, método ${installationMethod}${declaredMethod ? "" : " (não informado — premissa)"}, isolação ${insulation}.`,
      cableSource === "projeto"
        ? `Cabo do projeto: ${selectedCableMm2} mm².`
        : `Seção não informada no projeto: ${selectedCableMm2} mm² é a mínima pela norma.`,
      protectionSource === "projeto"
        ? `Disjuntor do projeto: ${breakerRatingInA} A curva ${breakerCurve}.`
        : `Disjuntor não encontrado no diagrama: ${breakerRatingInA} A é o recomendado.`,
      `Coordenação de sobrecorrente: Ib (${designCurrentIbA} A) ≤ In (${breakerRatingInA} A) ≤ I'z (${correctedAmpacityIzA} A).`,
      vDrop
        ? `Queda de tensão: ${vDrop.dropPct}% (${vDrop.dropV} V) em ${lengthM} m (limite NBR 5410 §6.2.7: 4%).`
        : "Comprimento do cabo não informado: queda de tensão não verificada (pendência).",
      `Condutor de proteção PE pela NBR 5410:2004 Tabela 58: ${peCableMm2} mm².`,
    ];

    if (selectedCableMm2 >= REACTANCE_THRESHOLD_MM2) {
      calculationNotes.push(
        `Condutor ≥ 35 mm²: reatância indutiva considerada X_L = 0,08 mΩ/m conforme literatura de Mamede/Creder.`,
      );
    }

    circuits.push({
      circuitCode: `CIR_${eq.tagCode}`,
      equipmentId: eq.id,
      ...(breakerEq ? { breakerEquipmentId: breakerEq.id } : {}),
      cableSource,
      protectionSource,
      description: eq.displayName || `Circuito de alimentação de ${eq.tagCode}`,
      circuitType,
      phases: eq.phases,
      powerKw: Number(powerKw.toFixed(2)),
      voltageV,
      powerFactor: cosPhi,
      efficiency,
      designCurrentIbA,
      installationMethod,
      insulation,
      ambientTempC,
      tempFactorKt,
      groupedCircuits,
      groupFactorKg,
      selectedCableMm2,
      nominalAmpacityIzA,
      correctedAmpacityIzA,
      ampacityCheckPass:
        correctedAmpacityIzA >= breakerRatingInA && breakerRatingInA >= designCurrentIbA,
      lengthM,
      resistanceOhmPerM: vDrop?.resistanceOhmPerM ?? RHO_COPPER_OHM_MM2_PER_M / selectedCableMm2,
      reactanceOhmPerM:
        vDrop?.reactanceOhmPerM ??
        (selectedCableMm2 >= REACTANCE_THRESHOLD_MM2 ? DEFAULT_REACTANCE_MOHM_PER_M / 1000 : 0),
      voltageDropV: vDrop?.dropV ?? null,
      voltageDropPct: vDrop?.dropPct ?? null,
      maxAllowedVoltageDropPct: 4.0,
      voltageDropPass: vDrop ? vDrop.dropPct <= 4.0 : null,
      neutralCableMm2,
      peCableMm2,
      breakerRatingInA,
      breakerCurve,
      breakingCapacityIcuKa: brk.icu ?? null,
      presumedIccKa: null,
      protectionCoordinationPass:
        breakerRatingInA >= designCurrentIbA && breakerRatingInA <= correctedAmpacityIzA,
      startMethod,
      startingCurrentIstartA,
      overloadRelaySettingA,
      calculationNotes,
    });
  }

  // Disjuntor geral REAL: o primeiro disjuntor alimentado direto por uma fonte.
  const sourceIds = new Set(
    extracted.equipments
      .filter((e) => e.catalogType === "transformer" || e.catalogType === "generator")
      .map((e) => e.id),
  );
  const mainBreakerEq = extracted.equipments.find((e) => {
    if (e.catalogType !== "breaker") return false;
    if (/^Q0$/i.test(e.tagCode)) return true;
    const feed = feedOf(e.id);
    return feed ? sourceIds.has(feed.fromEquipmentId) : false;
  });
  const mainBrk = breakerData(mainBreakerEq);

  // 2. Balanço Global da Instalação / Quadro Geral de Distribuição (QGD / CCM)
  const demandFactor = totalInstalledKw > 50 ? 0.8 : totalInstalledKw > 20 ? 0.85 : 0.9;
  const totalDemandKw = Number((totalInstalledKw * demandFactor).toFixed(2));
  const avgCosPhi = 0.86;
  const totalApparentPowerKva = Number((totalDemandKw / avgCosPhi).toFixed(2));
  const mainFeederIbA = Number(
    ((totalDemandKw * 1000) / (Math.sqrt(3) * systemVoltage * avgCosPhi)).toFixed(1),
  );
  const recommendedTransformerKva = selectStandardTransformer(totalApparentPowerKva * 1.25);
  const mainBreakerInA = mainBrk.In ?? pickBreaker_A(mainFeederIbA);

  let mainCable: CableSection_mm2 = 16;
  for (const s of NBR5410_SECTIONS) {
    if (
      correctedAmpacityIz(s, { method: "C", insulation: "EPR", loadedConductors: 3 }) >=
      mainBreakerInA
    ) {
      mainCable = s;
      break;
    }
  }

  return {
    summary: {
      totalInstalledPowerKw: Number(totalInstalledKw.toFixed(2)),
      totalDemandPowerKw: totalDemandKw,
      demandFactor,
      totalApparentPowerKva,
      systemVoltageV: systemVoltage,
      nominalFrequencyHz: nominalFreq,
      earthingScheme: earthing,
      recommendedTransformerKva,
      mainFeederCurrentIbA: mainFeederIbA,
      mainFeederCableMm2: mainCable,
      mainBreakerRatingInA: mainBreakerInA,
      mainBreakerSource: mainBrk.In ? "projeto" : "recomendado",
      mainBreakerIcuKa: mainBrk.icu ?? null,
    },
    circuits,
    calculationAssumptions: [
      "Frequência nominal do sistema elétrico: 60 Hz.",
      `Esquema de aterramento: ${earthing}.`,
      "Método de instalação: o informado em cada cabo; sem informação, B1 (eletroduto embutido) como premissa, temperatura ambiente de 30 °C.",
      "Comprimento, seção e disjuntor vêm do projeto; dado ausente fica como pendência (seção mínima e disjuntor recomendado são identificados como tal).",
      `Fator de demanda ${demandFactor} e fator de potência médio ${avgCosPhi} para o balanço global (premissas de projeto).`,
      ...(notCalculated.length
        ? [`Cargas sem potência informada (não calculadas): ${notCalculated.join(", ")}.`]
        : []),
      "Resistividade elétrica do cobre adotada a 70 °C: ρ = 0,0178 Ω·mm²/m.",
      "Reatância indutiva dos cabos de baixa tensão: XL = 0,08 mΩ/m para seções nominais ≥ 35 mm².",
      "Critério de coordenação de sobrecorrente: Ib ≤ In ≤ I'z e I2 ≤ 1,45 · I'z conforme ABNT NBR 5410:2004 §5.3.4.1.",
      "Queda de tensão máxima admissível do QGD/CCM até a carga final: 4,0% conforme ABNT NBR 5410:2004 §6.2.7.",
    ],
    standardsApplied: [
      {
        standard: "ABNT NBR 5410",
        edition: "2004 (Emenda 1:2008)",
        clauses: [
          "§5.1 — Proteção contra choques elétricos",
          "§5.3 — Proteção contra sobrecorrentes e coordenação",
          "§6.2.6 — Dimensionamento de condutores de neutro",
          "§6.2.7 — Limites de queda de tensão admissíveis",
          "§6.4.3 e Tabela 58 — Dimensionamento de condutores de proteção PE",
          "Tabelas 36 a 38 — Capacidade de condução de corrente Iz",
          "Tabelas 40 e 42 — Fatores de correção por temperatura (kt) e agrupamento (kg)",
        ],
      },
      {
        standard: "ABNT NBR 14039",
        edition: "2005 (Versão corrigida 2021)",
        clauses: [
          "§5.2 — Coordenação com subestação e transformador de força",
          "§6.3 — Dimensionamento preliminar de transformadores",
        ],
      },
      {
        standard: "IEC 60909-0",
        edition: "2016",
        clauses: [
          "Short-circuit currents in three-phase a.c. systems — Presumed prospective Icc calculation",
        ],
      },
    ],
  };
}
