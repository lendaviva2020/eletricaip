// Energia incidente de arco elétrico por quadro do unifilar — IEEE 1584-2002
// (modelo empírico para BT) + categoria de EPI da NFPA 70E / exigência da NR-10. PURO.
//
// Para cada barramento/CCM:
//  • Ibf = curto trifásico MÁXIMO no ponto (cálculo de rede, IEC 60909);
//  • tensão = secundário do trafo/gerador que o alimenta;
//  • tempo de eliminação = tempo MÁXIMO da faixa da norma do disjuntor de
//    montante (IEC 60898-1) na corrente de arco — e também em 85 % dela (IEEE
//    1584-2002 §9.10.4: corrente menor pode atrasar o disparo); vale o pior caso;
//  • gap, distância de trabalho e expoente: valores TÍPICOS da Tab. 3/4 da
//    IEEE 1584-2002 por tipo de quadro — declarados como premissa.
// Sem curto, tensão ou disjuntor de montante com dados → pendência (nada presumido).
import type { DiagramDoc, DiagramEdge, DiagramNode } from "../schema";
import { nodeDisplayName } from "./cable-sizing";
import type { NetworkReport } from "./network-calculation";
import { breakerBand } from "./trip-curves";
import {
  ARC_EQUIPMENT_TYPICAL,
  arcFlashIEEE1584,
  arcingCurrentIEEE1584,
  ppeFromEnergy,
  type ArcEquipmentClass,
} from "@/lib/electrical-sim";

/** IEEE 1584-2002 §B.1.2: tempo máximo de exposição quando a pessoa pode se afastar. */
export const MAX_ARC_DURATION_S = 2;
/** Acima de 40 cal/cm² não há EPI de categoria NFPA 70E: trabalho energizado não é admissível. */
export const ARC_DANGER_CAL_CM2 = 40;
/** Quadros a partir desta corrente nominal são tratados como "switchgear" (gap 32 mm, 610 mm). */
const SWITCHGEAR_MIN_A = 630;

const BOARD_KINDS = new Set(["busbar", "ccm"]);
const SOURCE_KINDS = new Set(["transformer", "generator"]);
const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

export type ArcFlashStatus = "ok" | "high" | "danger" | "pending";

export interface BoardArcFlash {
  boardId: string;
  name: string;
  equipment: ArcEquipmentClass;
  status: ArcFlashStatus;
  /** Motivo da pendência. */
  pendingReason?: string;
  Ibf_kA?: number;
  voltage_V?: number;
  arcingCurrent_kA?: number;
  clearingTime_s?: number;
  /** Disjuntor de montante que elimina o arco. */
  protectiveId?: string;
  incidentEnergy_cal_cm2?: number;
  ppe_category?: 0 | 1 | 2 | 3 | 4;
  arcBoundary_mm?: number;
  workingDistance_mm: number;
  gap_mm: number;
  /** Tempo limitado a 2 s (disjuntor não garante disparo na corrente de arco). */
  durationCapped?: boolean;
  withinModelRange?: boolean;
}

export interface ArcFlashFinding {
  code: "ARC_FLASH_DANGER" | "ARC_FLASH_HIGH" | "ARC_FLASH_PENDING" | "ARC_FLASH_OUT_OF_RANGE";
  severity: "error" | "warning";
  nodeId: string;
  message: string;
  clause: string;
}

export interface ArcFlashReport {
  boards: BoardArcFlash[];
  findings: ArcFlashFinding[];
  premises: string[];
}

function num(n: DiagramNode | undefined, key: string): number | undefined {
  const v = n ? (n.params as Record<string, unknown>)[key] : undefined;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

function equipmentClass(board: DiagramNode): ArcEquipmentClass {
  if (board.params.kind === "ccm") return "panel";
  const In = num(board, "current_A");
  return In !== undefined && In >= SWITCHGEAR_MIN_A ? "switchgear" : "panel";
}

/** Sobe pela alimentação: primeiro disjuntor de montante e a tensão da fonte. */
function upstreamOf(
  doc: DiagramDoc,
  inn: Map<string, DiagramEdge[]>,
  boardId: string,
): { breaker?: DiagramNode; voltage_V?: number; viaFuse?: boolean } {
  let breaker: DiagramNode | undefined;
  let viaFuse = false;
  const seen = new Set<string>([boardId]);
  let frontier = [boardId];
  for (let depth = 0; depth < 30 && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of inn.get(id) ?? []) {
        const up = doc.nodes[e.source];
        if (!up || seen.has(up.id)) continue;
        seen.add(up.id);
        if (!breaker && !viaFuse) {
          if (up.params.kind === "breaker") breaker = up;
          else if (up.params.kind === "fuse") viaFuse = true;
        }
        if (SOURCE_KINDS.has(up.params.kind)) {
          const V = num(up, "secondary_V") ?? num(up, "voltage_V");
          return { breaker, voltage_V: V, viaFuse };
        }
        next.push(up.id);
      }
    }
    frontier = next;
  }
  return { breaker, viaFuse };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function analyzeArcFlash(doc: DiagramDoc, network: NetworkReport): ArcFlashReport {
  const inn = new Map<string, DiagramEdge[]>();
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e)) continue;
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  const grounded = network.earthing !== "IT";
  const boards: BoardArcFlash[] = [];
  const findings: ArcFlashFinding[] = [];
  const premises = new Set<string>();

  for (const board of Object.values(doc.nodes)) {
    if (board.sheet !== "unifilar" || !BOARD_KINDS.has(board.params.kind)) continue;
    const equipment = equipmentClass(board);
    const typ = ARC_EQUIPMENT_TYPICAL[equipment];
    const name = nodeDisplayName(board);
    const base: BoardArcFlash = {
      boardId: board.id,
      name,
      equipment,
      status: "pending",
      workingDistance_mm: typ.workingDistance_mm,
      gap_mm: typ.gap_mm,
    };
    const Ibf = network.nodes[board.id]?.Ik3max_kA;
    const up = upstreamOf(doc, inn, board.id);
    const band = up.breaker ? breakerBand(up.breaker) : null;

    let pendingReason: string | undefined;
    if (Ibf === undefined) pendingReason = "curto-circuito no ponto não calculado";
    else if (!up.voltage_V) pendingReason = "tensão da fonte não informada";
    else if (up.viaFuse) pendingReason = "proteção a montante por fusível (curva do fabricante)";
    else if (!up.breaker)
      pendingReason = "sem disjuntor a montante (proteção do primário do trafo)";
    else if (!band)
      pendingReason = `corrente nominal de ${nodeDisplayName(up.breaker)} não informada`;
    if (pendingReason || Ibf === undefined || !up.voltage_V || !band || !up.breaker) {
      boards.push({ ...base, pendingReason, ...(Ibf !== undefined ? { Ibf_kA: Ibf } : {}) });
      findings.push({
        code: "ARC_FLASH_PENDING",
        severity: "warning",
        nodeId: board.id,
        message: `${name}: energia de arco não calculável — ${pendingReason}.`,
        clause: "NR-10 §10.2.4 / IEEE 1584",
      });
      continue;
    }

    const V_kV = up.voltage_V / 1000;
    const Ia = arcingCurrentIEEE1584(Ibf, V_kV, typ.gap_mm, typ.box);
    // Pior caso entre 100 % e 85 % da corrente de arco.
    let worst: (ReturnType<typeof arcFlashIEEE1584> & { capped: boolean }) | null = null;
    for (const factor of [1, 0.85]) {
      const tRaw = band.tMax(Ia * factor * 1000);
      const capped = !Number.isFinite(tRaw) || tRaw > MAX_ARC_DURATION_S;
      const t = capped ? MAX_ARC_DURATION_S : tRaw;
      // A energia escala com a corrente de arco; a variante de 85 % usa Ibf equivalente.
      const r = arcFlashIEEE1584(Ibf, {
        voltage_kV: V_kV,
        equipment,
        clearingTime_s: t,
        grounded,
      });
      const scaled =
        factor === 1
          ? r
          : {
              ...r,
              incidentEnergy_cal_cm2: round2(r.incidentEnergy_cal_cm2 * Math.pow(0.85, 1.081)),
              incidentEnergy_J_cm2: round2(r.incidentEnergy_J_cm2 * Math.pow(0.85, 1.081)),
            };
      if (!worst || scaled.incidentEnergy_cal_cm2 > worst.incidentEnergy_cal_cm2) {
        worst = { ...scaled, capped };
      }
    }
    const w = worst!;
    const E = w.incidentEnergy_cal_cm2;
    const ppe = ppeFromEnergy(E);
    const status: ArcFlashStatus = E > ARC_DANGER_CAL_CM2 ? "danger" : ppe >= 3 ? "high" : "ok";
    const boundary = Math.round(w.workingDistance_mm * Math.pow(E / 1.2, 1 / typ.distanceExponent));
    boards.push({
      ...base,
      status,
      Ibf_kA: Ibf,
      voltage_V: up.voltage_V,
      arcingCurrent_kA: round2(Ia),
      clearingTime_s: round2(w.clearingTime_s),
      protectiveId: up.breaker.id,
      incidentEnergy_cal_cm2: E,
      ppe_category: ppe,
      arcBoundary_mm: boundary,
      durationCapped: w.capped,
      withinModelRange: w.withinModelRange,
    });
    if (w.capped) {
      premises.add(
        `Tempo de arco limitado a ${MAX_ARC_DURATION_S} s onde a faixa do disjuntor não garante disparo na corrente de arco (IEEE 1584-2002 §B.1.2: pessoa capaz de se afastar).`,
      );
    }
    if (!w.withinModelRange) {
      findings.push({
        code: "ARC_FLASH_OUT_OF_RANGE",
        severity: "warning",
        nodeId: board.id,
        message: `${name}: curto de ${Ibf} kA a ${up.voltage_V} V fora da faixa de validade do modelo (0,7–106 kA; 208 V–1 kV) — resultado indicativo.`,
        clause: "IEEE 1584-2002 §4",
      });
    }
    if (status === "danger") {
      findings.push({
        code: "ARC_FLASH_DANGER",
        severity: "error",
        nodeId: board.id,
        message: `${name}: energia incidente de ${E} cal/cm² acima de ${ARC_DANGER_CAL_CM2} cal/cm² — não há EPI adequado; trabalho energizado não é admissível. Reduza o tempo de eliminação (disparo instantâneo, proteção diferencial de barra, modo manutenção) ou o curto.`,
        clause: "NR-10 §10.2.4 / NFPA 70E §130.7",
      });
    } else if (status === "high") {
      findings.push({
        code: "ARC_FLASH_HIGH",
        severity: "warning",
        nodeId: board.id,
        message: `${name}: ${E} cal/cm² exige EPI categoria ${ppe} — avalie reduzir o tempo de eliminação de ${round2(w.clearingTime_s)} s do disjuntor ${nodeDisplayName(up.breaker)}.`,
        clause: "NR-10 §10.2.4 / NFPA 70E Tab. 130.7(C)(15)(c)",
      });
    }
  }

  if (boards.length > 0) {
    premises.add(
      "Arco elétrico: modelo empírico IEEE 1584-2002 (BT), Cf = 1,5; gap, distância de trabalho e expoente típicos da Tab. 3/4 por tipo de quadro (painel/CCM: 25 mm, 455 mm; quadro geral ≥ 630 A: 32 mm, 610 mm). Tempo pela faixa MÁXIMA da norma do disjuntor de montante (não pela curva do fabricante). Para emissão de etiquetas oficiais, faça o estudo de arco formal.",
    );
  }
  return { boards, findings, premises: [...premises] };
}
