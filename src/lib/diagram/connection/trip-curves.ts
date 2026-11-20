// Curvas tempo × corrente das proteções do unifilar e seletividade por curva. PURO.
//
// Modelos (bandas normativas, não curvas de fabricante — premissa declarada):
//  • Disjuntor IEC 60898-1: não dispara em 1,13·In (1 h); dispara em 1,45·In
//    (< 1 h); em 2,55·In entre 1 s e 60 s (In ≤ 32 A) ou 120 s (In > 32 A);
//    disparo magnético instantâneo entre 3–5 (B), 5–10 (C) e 10–20 (D) × In,
//    em até 0,1 s.
//  • Relé térmico IEC 60947-4-1 Tab. 3: não dispara em 1,05·Ir (2 h); dispara
//    em 1,2·Ir (< 2 h); em 7,2·Ir dentro da janela da classe (10A: 2–10 s,
//    10: 4–10 s, 20: 6–20 s, 30: 9–30 s).
//  • Cabo (NBR 5410 §5.3.5): dano adiabático t = (k·S/I)², válido até 5 s.
//
// Seletividade: o dispositivo a jusante precisa abrir ANTES de o de montante
// poder abrir, para toda corrente até o curto do seu ponto. Com bandas, o
// limite é a menor corrente em que a banda de montante (tempo mínimo) encosta
// na de jusante (tempo máximo). Tabelas de seletividade de fabricante (por
// energia) podem garantir mais — por isso o resultado é "conservador".
import type { DiagramDoc, DiagramEdge, DiagramNode } from "../schema";
import { conductorThermalConstantK } from "@/lib/electrical-calc";
import { loadCurrent_A, nodeDisplayName } from "./cable-sizing";

export const T_MIN_S = 0.01;
export const T_MAX_S = 10_000;
const INSTANT_MAX_S = 0.1;

export type CurveKind = "breaker" | "thermal_relay" | "cable";

/** Banda tempo × corrente: `tMin` (pode disparar a partir) e `tMax` (certamente disparou). */
export interface TripBand {
  id: string;
  kind: CurveKind;
  label: string;
  /** Tempo mínimo de atuação (s) para a corrente I (A); Infinity = não atua. */
  tMin(I: number): number;
  /** Tempo máximo de atuação (s); Infinity = pode não atuar. */
  tMax(I: number): number;
  /** Faixa de corrente útil para desenhar (A). */
  range: [number, number];
}

const MAG: Record<string, [number, number]> = { B: [3, 5], C: [5, 10], D: [10, 20] };

function num(n: DiagramNode, key: string): number | undefined {
  const v = (n.params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Ajuste a·(m − 1)^(−p) por dois pontos (m1, t1) e (m2, t2). */
function powerFit(m1: number, t1: number, m2: number, t2: number) {
  const p = Math.log(t1 / t2) / Math.log((m2 - 1) / (m1 - 1));
  const a = t2 * Math.pow(m2 - 1, p);
  return (m: number) => (m <= 1 ? Infinity : a / Math.pow(m - 1, p));
}

export function breakerBand(node: DiagramNode): TripBand | null {
  if (node.params.kind !== "breaker") return null;
  const In = num(node, "in_A");
  if (!In) return null;
  const curve = (node.params as { curve?: string }).curve ?? "C";
  const [magMinX, magMaxX] = MAG[curve] ?? MAG.C;
  const tAt255 = In <= 32 ? 60 : 120;
  const lower = powerFit(1.13, 3600, 2.55, 1);
  const upper = powerFit(1.45, 3600, 2.55, tAt255);
  return {
    id: node.id,
    kind: "breaker",
    label: `${nodeDisplayName(node)} ${curve}${In}`,
    tMin(I) {
      const m = I / In;
      if (m <= 1.13) return Infinity;
      if (m >= magMinX) return T_MIN_S;
      // IEC 60898-1: abaixo do limite inferior magnético NÃO dispara em menos de 0,1 s.
      return Math.max(INSTANT_MAX_S, lower(m));
    },
    tMax(I) {
      const m = I / In;
      if (m < 1.45) return Infinity;
      if (m >= magMaxX) return INSTANT_MAX_S;
      return Math.max(INSTANT_MAX_S, upper(m));
    },
    range: [In * 1.05, In * magMaxX * 4],
  };
}

const RELAY_CLASS: Record<string, [number, number]> = {
  "10A": [2, 10],
  "10": [4, 10],
  "20": [6, 20],
  "30": [9, 30],
};

export function thermalRelayBand(node: DiagramNode): TripBand | null {
  if (node.params.kind !== "thermal_relay") return null;
  const Ir = num(node, "in_A");
  if (!Ir) return null;
  const cls = String((node.params as { trip_class?: string }).trip_class ?? "10A").toUpperCase();
  const [tlo, thi] = RELAY_CLASS[cls] ?? RELAY_CLASS["10A"];
  const lower = powerFit(1.05, 7200, 7.2, tlo);
  const upper = powerFit(1.2, 7200, 7.2, thi);
  return {
    id: node.id,
    kind: "thermal_relay",
    label: `${nodeDisplayName(node)} classe ${cls} ${Ir} A`,
    tMin: (I) => (I / Ir <= 1.05 ? Infinity : Math.max(T_MIN_S, lower(I / Ir))),
    tMax: (I) => (I / Ir <= 1.2 ? Infinity : Math.max(T_MIN_S, upper(I / Ir))),
    range: [Ir * 1.05, Ir * 15],
  };
}

/** Curva de dano do cabo: tempo máximo que suporta a corrente I (s). */
export function cableDamageTime(edge: DiagramEdge, I: number): number | undefined {
  const S = edge.cable?.section_mm2;
  if (!S || I <= 0) return undefined;
  const k = conductorThermalConstantK("copper", edge.cable?.insulation ?? "PVC", S);
  return Math.pow((k * S) / I, 2);
}

/** Correntes em escala logarítmica, inclusive as extremidades. */
export function logSpace(from: number, to: number, n = 80): number[] {
  if (!(from > 0) || !(to > from)) return [];
  const a = Math.log10(from);
  const b = Math.log10(to);
  return Array.from({ length: n }, (_, i) => Math.pow(10, a + ((b - a) * i) / (n - 1)));
}

export interface SelectivityByCurve {
  upstreamId: string;
  downstreamId: string;
  /** Corrente até a qual a seletividade é garantida pelas bandas (A); undefined = sem sobreposição até `upTo_A`. */
  limit_A?: number;
  /** Corrente máxima examinada: curto no ponto do dispositivo a jusante (A), quando conhecido. */
  upTo_A?: number;
  verdict: "total" | "parcial" | "nenhuma" | "indeterminada";
  /** In(montante) / In(jusante). Abaixo de 1,6 a sobrecarga pode desligar os dois. */
  overloadRatio?: number;
}

/** Relação mínima de correntes nominais para seletividade na região de sobrecarga (prática usual). */
export const OVERLOAD_RATIO = 1.6;

/**
 * Seletividade amperimétrica entre dois disjuntores em cascata (método usual
 * dos guias de coordenação): na sobrecarga exige In(montante) ≥ 1,6 × In(jusante);
 * no curto, é garantida até o disparo magnético MÍNIMO do disjuntor de montante.
 * As bandas da norma (`breakerBand`) são limites extremos e se sobrepõem na
 * sobrecarga mesmo em pares seletivos na prática — por isso não decidem aqui.
 */
export function selectivityByCurves(
  up: DiagramNode,
  down: DiagramNode,
  ikDown_A?: number,
): SelectivityByCurve | null {
  const inUp = num(up, "in_A");
  const inDown = num(down, "in_A");
  if (up.params.kind !== "breaker" || down.params.kind !== "breaker" || !inUp || !inDown) {
    return null;
  }
  const curveUp = (up.params as { curve?: string }).curve ?? "C";
  const magMinUp = inUp * (MAG[curveUp] ?? MAG.C)[0];
  const base = { upstreamId: up.id, downstreamId: down.id };
  if (inUp <= inDown) {
    return { ...base, limit_A: Math.round(inUp), verdict: "nenhuma", overloadRatio: inUp / inDown };
  }
  const ratio = inUp / inDown;
  const upTo = ikDown_A !== undefined ? Math.round(ikDown_A) : undefined;
  let verdict: SelectivityByCurve["verdict"];
  if (ikDown_A === undefined) verdict = "indeterminada";
  else verdict = ikDown_A <= magMinUp ? "total" : "parcial";
  return {
    ...base,
    limit_A: Math.round(magMinUp),
    upTo_A: upTo,
    verdict,
    overloadRatio: Math.round(ratio * 100) / 100,
  };
}

// ---------------- Cadeia de proteção de uma carga ----------------

export interface ProtectionChain {
  loadId: string;
  /** Dispositivos de montante para jusante (disjuntores e relés térmicos). */
  devices: DiagramNode[];
  /** Cabos com seção, de montante para jusante. */
  cables: DiagramEdge[];
}

const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

/** Sobe pela alimentação da carga até a fonte, coletando proteções e cabos. */
export function protectionChain(doc: DiagramDoc, loadId: string): ProtectionChain {
  const inn = new Map<string, DiagramEdge>();
  for (const e of Object.values(doc.edges)) {
    if (isPower(e) && !inn.has(e.target)) inn.set(e.target, e);
  }
  const devices: DiagramNode[] = [];
  const cables: DiagramEdge[] = [];
  const seen = new Set<string>();
  let cur = loadId;
  while (!seen.has(cur)) {
    seen.add(cur);
    const e = inn.get(cur);
    if (!e) break;
    if (e.cable?.section_mm2) cables.unshift(e);
    const src = doc.nodes[e.source];
    if (!src) break;
    if (src.params.kind === "breaker" || src.params.kind === "thermal_relay") devices.unshift(src);
    cur = src.id;
  }
  return { loadId, devices, cables };
}

export function bandFor(node: DiagramNode): TripBand | null {
  return breakerBand(node) ?? thermalRelayBand(node);
}

// ---------------- Partida de motor × disparo magnético ----------------

export interface MotorStartCheck {
  motorId: string;
  breakerId: string;
  start_A: number;
  magMin_A: number;
  verdict: "dispara" | "risco_pico" | "ok";
}

/**
 * Partida direta/estrela-triângulo × disparo instantâneo do disjuntor do ramal.
 * A corrente eficaz de partida acima do mínimo magnético desarma na partida;
 * o pico assimétrico do 1º meio ciclo (≈ 2 × eficaz, premissa) acima dele é risco.
 */
export function motorStartChecks(doc: DiagramDoc): MotorStartCheck[] {
  const out: MotorStartCheck[] = [];
  for (const m of Object.values(doc.nodes)) {
    if (m.sheet !== "unifilar" || m.params.kind !== "motor") continue;
    const method = (m.params as { startMethod?: string }).startMethod ?? "DOL";
    if (method === "VFD" || method === "SOFT") continue;
    const In = loadCurrent_A(m);
    if (!In) continue;
    // Sobe até o primeiro disjuntor; inversor/soft no caminho elimina a corrente de partida.
    const chain = protectionChainWithKinds(doc, m.id);
    if (chain.hasSoftStart || !chain.breaker) continue;
    const band = breakerBand(chain.breaker);
    if (!band) continue;
    const breakerIn = num(chain.breaker, "in_A")!;
    const curve = (chain.breaker.params as { curve?: string }).curve ?? "C";
    const magMin = breakerIn * (MAG[curve] ?? MAG.C)[0];
    const start = In * (method === "STAR_DELTA" ? 7 / 3 : 7);
    const verdict = start >= magMin ? "dispara" : 2 * start >= magMin ? "risco_pico" : "ok";
    out.push({
      motorId: m.id,
      breakerId: chain.breaker.id,
      start_A: Math.round(start),
      magMin_A: Math.round(magMin),
      verdict,
    });
  }
  return out;
}

function protectionChainWithKinds(doc: DiagramDoc, loadId: string) {
  const inn = new Map<string, DiagramEdge>();
  for (const e of Object.values(doc.edges)) {
    if (isPower(e) && !inn.has(e.target)) inn.set(e.target, e);
  }
  let hasSoftStart = false;
  let breaker: DiagramNode | undefined;
  const seen = new Set<string>();
  let cur = loadId;
  while (!seen.has(cur)) {
    seen.add(cur);
    const e = inn.get(cur);
    const src = e ? doc.nodes[e.source] : undefined;
    if (!src) break;
    if (src.params.kind === "vfd" || src.params.kind === "softstarter") hasSoftStart = true;
    if (src.params.kind === "breaker") {
      breaker = src;
      break;
    }
    cur = src.id;
  }
  return { breaker, hasSoftStart };
}
