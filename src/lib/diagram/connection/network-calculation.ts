// Cálculo de rede do unifilar — curto-circuito em cada ponto, queda de tensão
// acumulada, proteção contra choque e suportabilidade térmica dos cabos. PURO.
//
// Normas: IEC 60909-0 (curto máximo/mínimo), ABNT NBR 5410 §5.1.2.2.4
// (seccionamento automático), §5.3.5 (k²S² ≥ I²t), §6.2.7 (queda de tensão) e
// Tab. 58 (seção do PE).
//
// Princípios:
//  • Nada inventado. Cabo de campo/alimentador sem seção ou comprimento deixa o
//    ponto a jusante "indeterminado" e vira pendência — nunca um valor presumido.
//  • Toda premissa adotada (uk típico, rede infinita, PE pela Tab. 58, fiação
//    interna desprezada) aparece em `premises` para o memorial de cálculo.
//  • Cálculo por fonte (trafo/gerador); com mais de uma fonte o curto máximo é
//    o maior e o mínimo é o menor (pior caso para cada verificação).
import type { DiagramDoc, DiagramEdge, DiagramNode, NetworkSettings } from "../schema";
import { conductorThermalConstantK, type InsulationType } from "@/lib/electrical-calc";
import { typicalXR, zeroSequenceRatio } from "@/lib/electrical-sim";
import { isFieldCable, nodeDisplayName, sizeDiagramCables } from "./cable-sizing";

/** uk típico de transformador de distribuição por potência (premissa quando não informado). */
export function typicalTransformerUk(kVA: number): number {
  if (kVA <= 150) return 3.5;
  if (kVA <= 300) return 4.5;
  return 5.0;
}

const SQRT3 = Math.sqrt(3);
/** Fatores de tensão IEC 60909-0 Tab. 1 (BT): máximo 1,10; mínimo 0,95. */
const C_MAX = 1.1;
const C_MIN = 0.95;
const RHO20_CU = 0.017241; // Ω·mm²/m
const X_CABLE_OHM_PER_M = 0.08e-3;
/** Reatância subtransitória típica de gerador BT (premissa quando não informada). */
const GENERATOR_XD_PCT = 12;
/** Limite de queda de tensão total a partir dos terminais do trafo/gerador próprio (NBR 5410 §6.2.7.1). */
export const MAX_TOTAL_DROP_PCT = 7;
/** Abaixo disso nem meio ciclo de curto é suportado pelo cabo sem proteção limitadora. */
const MIN_WITHSTAND_S = 0.01;

export type NetworkFindingCode =
  | "EARTHING_UNKNOWN"
  | "AUTO_DISCONNECTION_FAIL"
  | "AUTO_DISCONNECTION_PENDING"
  | "TT_WITHOUT_RCD"
  | "IT_SECOND_FAULT_FAIL"
  | "IT_SECOND_FAULT_PENDING"
  | "IT_IMD_REQUIRED"
  | "CABLE_THERMAL_LIMITING"
  | "VOLTAGE_DROP_TOTAL"
  | "SHORT_CIRCUIT_PENDING";

export interface NetworkFinding {
  code: NetworkFindingCode;
  severity: "error" | "warning";
  nodeId?: string;
  edgeId?: string;
  message: string;
  /** Item da norma que fundamenta a verificação. */
  clause: string;
}

export interface NodeNetworkResult {
  nodeId: string;
  /** Curto trifásico máximo no ponto (kA) — para a capacidade de interrupção. */
  Ik3max_kA?: number;
  /** Curto fase-terra mínimo no ponto (kA) — para o seccionamento automático. */
  Ik1min_kA?: number;
  /** Queda de tensão acumulada desde a fonte (%), quando todos os trechos de campo têm dados. */
  dropTotal_pct?: number;
  /** Ligação (cabo) que impede o cálculo, quando indeterminado. */
  blockedByEdgeId?: string;
}

export interface EdgeNetworkResult {
  edgeId: string;
  /** Tempo máximo que o cabo suporta o curto máximo da origem (s): (k·S/Ik)². */
  withstand_s?: number;
}

export interface NetworkReport {
  nodes: Record<string, NodeNetworkResult>;
  edges: Record<string, EdgeNetworkResult>;
  findings: NetworkFinding[];
  premises: string[];
  earthing?: NetworkSettings["earthing"];
}

interface Z {
  r: number;
  x: number;
}
const add = (a: Z, b: Z): Z => ({ r: a.r + b.r, x: a.x + b.x });
const mag = (z: Z) => Math.hypot(z.r, z.x);
const scale = (z: Z, k: number): Z => ({ r: z.r * k, x: z.x * k });
const ZERO: Z = { r: 0, x: 0 };

interface PathState {
  /** Impedância de sequência positiva até o ponto (curto máximo, cabos a 20 °C). */
  z1Max: Z;
  /** Impedância do laço fase-terra até o ponto (curto mínimo, cabos aquecidos). */
  zLoopMin: Z;
  dropPct?: number;
  blockedBy?: string;
}

const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

function num(n: DiagramNode, key: string): number | undefined {
  const v = (n.params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Seção do condutor de proteção pela NBR 5410 Tab. 58 (mesmo material da fase). */
export function protectiveConductorSection(phase_mm2: number): number {
  if (phase_mm2 <= 16) return phase_mm2;
  if (phase_mm2 <= 35) return 16;
  return phase_mm2 / 2;
}

/** Fator de aquecimento do condutor no fim do curto (IEC 60909-0 §5.3.1): 1 + 0,004·(θe − 20). */
function hotFactor(insulation: InsulationType): number {
  const thetaEnd = insulation === "PVC" ? 160 : 250;
  return 1 + 0.004 * (thetaEnd - 20);
}

/** Corrente de disparo instantâneo garantido (limite superior da faixa IEC 60898). */
export function instantaneousTrip_A(node: DiagramNode): number | undefined {
  if (node.params.kind !== "breaker") return undefined;
  const In = num(node, "in_A");
  if (!In) return undefined;
  const curve = (node.params as { curve?: string }).curve ?? "C";
  const factor = curve === "B" ? 5 : curve === "D" ? 20 : 10;
  return In * factor;
}

interface SourceModel {
  node: DiagramNode;
  U: number;
  z1: Z;
  zLoop: Z;
}

function sourceModels(doc: DiagramDoc, net: NetworkSettings | undefined, premises: Set<string>) {
  const out: SourceModel[] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.sheet !== "unifilar") continue;
    if (n.params.kind === "transformer") {
      const S = num(n, "kVA");
      const U = num(n, "secondary_V");
      if (!S || !U) continue;
      const ukGiven = num(n, "uk_pct");
      const uk = ukGiven ?? typicalTransformerUk(S);
      if (!ukGiven) {
        premises.add(
          `${nodeDisplayName(n)}: uk ${uk}% típico para ${S} kVA (informe o uk de placa no transformador).`,
        );
      }
      const zt = ((uk / 100) * U * U) / (S * 1000);
      const xr = typicalXR(S);
      const rt = zt / Math.sqrt(1 + xr * xr);
      const zT: Z = { r: rt, x: rt * xr };
      let zQ = ZERO;
      if (net?.utilityScc_MVA) {
        // IEC 60909-0 §6.2: ZQ = c·Un²/S"kQ (referida à BT), XQ = 0,995·ZQ, RQ = 0,1·XQ.
        const zq = (C_MAX * U * U) / (net.utilityScc_MVA * 1e6);
        const xq = 0.995 * zq;
        zQ = { r: 0.1 * xq, x: xq };
      } else {
        premises.add(
          'Rede da concessionária tratada como infinita (S"k não informada): curto máximo do lado da segurança; o curto mínimo fica levemente otimista — informe a potência de curto da rede.',
        );
      }
      const k0 = zeroSequenceRatio((n.params as { vector?: string }).vector);
      const z1 = add(zQ, zT);
      // Laço fase-terra no secundário: (2·Z1 + Z0)/3, com Z0 do trafo = k0·ZT (Dyn bloqueia Z0 da rede).
      const zLoop = scale(add(scale(z1, 2), scale(zT, k0)), 1 / 3);
      out.push({ node: n, U, z1, zLoop });
    } else if (n.params.kind === "generator") {
      const S = num(n, "kVA");
      const U = num(n, "voltage_V");
      if (!S || !U) continue;
      premises.add(
        `${nodeDisplayName(n)}: reatância subtransitória X"d ${GENERATOR_XD_PCT}% típica e RG = 0,15·X"d (IEC 60909-0 §6.6.1) — confirme com o fabricante.`,
      );
      const xd = ((GENERATOR_XD_PCT / 100) * U * U) / (S * 1000);
      const z1: Z = { r: 0.15 * xd, x: xd };
      out.push({ node: n, U, z1, zLoop: z1 });
    }
  }
  return out;
}

/**
 * Calcula a rede inteira do unifilar a partir das fontes do próprio diagrama.
 * Sem trafo/gerador no diagrama não há curto calculável (nada é presumido).
 */
export function analyzeNetwork(doc: DiagramDoc): NetworkReport {
  const net = doc.metadata.network;
  const premisesSet = new Set<string>();
  const findings: NetworkFinding[] = [];
  const nodes: Record<string, NodeNetworkResult> = {};
  const edgeResults: Record<string, EdgeNetworkResult> = {};

  const out = new Map<string, DiagramEdge[]>();
  const inn = new Map<string, DiagramEdge[]>();
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }

  const cableRows = new Map(sizeDiagramCables(doc).rows.map((r) => [r.edgeId, r]));
  const sources = sourceModels(doc, net, premisesSet);
  let neglectedInternal = false;
  let usedPeTable = false;

  for (const src of sources) {
    // BFS a jusante: uma única vez por nó por fonte (o grafo pode ter laço).
    const state = new Map<string, PathState>();
    state.set(src.node.id, { z1Max: src.z1, zLoopMin: src.zLoop, dropPct: 0 });
    const queue = [src.node.id];
    while (queue.length) {
      const id = queue.shift()!;
      const cur = state.get(id)!;
      for (const e of out.get(id) ?? []) {
        if (state.has(e.target)) continue;
        const field = isFieldCable(doc, e);
        const S = e.cable?.section_mm2;
        const L = e.cable?.length_m;
        let next: PathState;
        if (cur.blockedBy) {
          next = { ...cur };
        } else if (field && (!S || !L)) {
          next = { ...cur, blockedBy: e.id, dropPct: undefined };
        } else if (field && S && L) {
          const insulation: InsulationType = e.cable?.insulation ?? "PVC";
          const r20 = (RHO20_CU * L) / S;
          const xc = X_CABLE_OHM_PER_M * L;
          const pe = protectiveConductorSection(S);
          if (pe !== S) usedPeTable = true;
          const hot = hotFactor(insulation);
          const rPe = ((RHO20_CU * L) / pe) * hot;
          const zCable: Z = { r: r20, x: xc };
          const zLoopCable: Z = { r: r20 * hot + rPe, x: 2 * xc };
          const row = cableRows.get(e.id);
          next = {
            z1Max: add(cur.z1Max, zCable),
            zLoopMin: add(cur.zLoopMin, zLoopCable),
            dropPct:
              cur.dropPct !== undefined && row?.drop_pct !== undefined
                ? cur.dropPct + row.drop_pct
                : undefined,
          };
        } else {
          // Fiação interna do painel: impedância desprezada.
          neglectedInternal = true;
          next = { ...cur };
        }
        state.set(e.target, next);
        queue.push(e.target);
      }
    }

    for (const [id, st] of state) {
      const prev = nodes[id] ?? { nodeId: id };
      if (st.blockedBy) {
        if (prev.Ik3max_kA === undefined) prev.blockedByEdgeId ??= st.blockedBy;
        nodes[id] = prev;
        continue;
      }
      const ik3 = (C_MAX * src.U) / (SQRT3 * mag(st.z1Max)) / 1000;
      const ik1 = (C_MIN * (src.U / SQRT3)) / mag(st.zLoopMin) / 1000;
      prev.Ik3max_kA = round2(Math.max(prev.Ik3max_kA ?? 0, ik3));
      prev.Ik1min_kA = round2(prev.Ik1min_kA === undefined ? ik1 : Math.min(prev.Ik1min_kA, ik1));
      if (st.dropPct !== undefined) {
        prev.dropTotal_pct = round2(Math.max(prev.dropTotal_pct ?? 0, st.dropPct));
      }
      delete prev.blockedByEdgeId;
      nodes[id] = prev;
    }
  }

  if (neglectedInternal) {
    premisesSet.add(
      "Fiação interna do painel (entre dispositivos do mesmo quadro) com impedância desprezada.",
    );
  }
  if (usedPeTable) {
    premisesSet.add(
      "Condutor de proteção (PE) dimensionado pela NBR 5410 Tab. 58 quando não informado.",
    );
  }
  if (sources.length > 0) {
    premisesSet.add(
      "Curto máximo com c = 1,10 e cabos a 20 °C; curto mínimo fase-terra com c = 0,95 e cabos na temperatura final do curto (IEC 60909-0).",
    );
  }

  // ---- Suportabilidade térmica dos cabos (k²S² ≥ I²t) ----
  // Abaixo de meio ciclo (10 ms) o cabo só fica protegido se o disjuntor for
  // limitador: a confirmação depende da energia de passagem (I²t) de catálogo,
  // que o diagrama não tem. Um único aviso agregado — não um por cabo.
  const limiting: DiagramEdge[] = [];
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e) || !e.cable?.section_mm2) continue;
    const ik = nodes[e.source]?.Ik3max_kA;
    if (!ik) continue;
    const S = e.cable.section_mm2;
    const k = conductorThermalConstantK("copper", e.cable.insulation ?? "PVC", S);
    const withstand = Math.pow((k * S) / (ik * 1000), 2);
    edgeResults[e.id] = { edgeId: e.id, withstand_s: Math.round(withstand * 10000) / 10000 };
    if (withstand < MIN_WITHSTAND_S) limiting.push(e);
  }
  if (limiting.length > 0) {
    findings.push({
      code: "CABLE_THERMAL_LIMITING",
      severity: "warning",
      edgeId: limiting[0].id,
      message: `${limiting.length} cabo(s) suportam o curto do seu ponto por menos de 10 ms (${limiting
        .slice(0, 3)
        .map(
          (e) =>
            `${cableLabel(doc, e)} ${e.cable?.section_mm2} mm²: ${Math.round((edgeResults[e.id].withstand_s ?? 0) * 10000) / 10} ms`,
        )
        .join(
          "; ",
        )}${limiting.length > 3 ? "…" : ""}): confirme que a energia de passagem (I²t) do disjuntor no catálogo é menor que k²S², ou aumente a seção.`,
      clause: "NBR 5410 §5.3.5.5",
    });
  }

  // ---- Queda de tensão total ----
  for (const n of Object.values(doc.nodes)) {
    const r = nodes[n.id];
    if (!r?.dropTotal_pct || !isLoad(n)) continue;
    if (r.dropTotal_pct > MAX_TOTAL_DROP_PCT) {
      findings.push({
        code: "VOLTAGE_DROP_TOTAL",
        severity: "error",
        nodeId: n.id,
        message: `${nodeDisplayName(n)}: queda de tensão total de ${r.dropTotal_pct}% desde a fonte, acima de ${MAX_TOTAL_DROP_PCT}%.`,
        clause: "NBR 5410 §6.2.7.1",
      });
    }
  }

  // ---- Proteção contra choque: seccionamento automático ----
  const earthing = net?.earthing;
  if (sources.length > 0) {
    if (!earthing) {
      findings.push({
        code: "EARTHING_UNKNOWN",
        severity: "warning",
        message:
          "Esquema de aterramento não informado: a proteção contra choque foi verificada como TN. Informe TN-S, TN-C-S, TT ou IT nos dados da rede.",
        clause: "NBR 5410 §4.2.2.2",
      });
    }
    if (earthing === "TT") {
      checkTtRcd(doc, out, inn, findings);
    } else if (earthing !== "IT") {
      checkTnDisconnection(doc, out, nodes, findings, earthing !== undefined);
    } else {
      checkItSecondFault(doc, out, nodes, findings);
      premisesSet.add(
        "Esquema IT: massas interligadas por condutor de proteção comum e neutro distribuído (U' = U0, caso mais desfavorável). Com massas aterradas individualmente, vale a regra do TT (DR por grupo).",
      );
      premisesSet.add(
        "Esquema IT: impedância do laço da segunda falta Zs = c·U0/Ik1mín (inclui a impedância da fonte — lado da segurança); corrente de dupla falta I = U'/(2·Zs).",
      );
    }

    const pendingCount = Object.values(nodes).filter((r) => r.blockedByEdgeId).length;
    if (pendingCount > 0) {
      const edges = [
        ...new Set(
          Object.values(nodes)
            .map((r) => r.blockedByEdgeId)
            .filter(Boolean) as string[],
        ),
      ];
      findings.push({
        code: "SHORT_CIRCUIT_PENDING",
        severity: "warning",
        edgeId: edges[0],
        message: `Curto-circuito não calculável em ${pendingCount} ponto(s): faltam seção e/ou comprimento em ${edges
          .slice(0, 4)
          .map((id) => cableLabel(doc, doc.edges[id]))
          .join(", ")}${edges.length > 4 ? "…" : ""}.`,
        clause: "IEC 60909-0",
      });
    }
  }

  return {
    nodes,
    edges: edgeResults,
    findings,
    premises: [...premisesSet],
    earthing,
  };
}

const LOAD_KINDS = new Set(["motor", "load", "lamp", "socket", "capacitor_bank"]);
const isLoad = (n: DiagramNode) => LOAD_KINDS.has(n.params.kind);

function cableLabel(doc: DiagramDoc, e: DiagramEdge | undefined): string {
  if (!e) return "?";
  return `${nodeDisplayName(doc.nodes[e.source])} → ${nodeDisplayName(doc.nodes[e.target])}`;
}

/** Nós protegidos por um dispositivo: a jusante até a próxima proteção contra curto (exclusive). */
function protectedZone(id: string, out: Map<string, DiagramEdge[]>, doc: DiagramDoc): string[] {
  const zone: string[] = [];
  const seen = new Set<string>([id]);
  const stack = (out.get(id) ?? []).map((e) => e.target);
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = doc.nodes[cur];
    if (!n) continue;
    if (n.params.kind === "breaker" || n.params.kind === "fuse") continue;
    zone.push(cur);
    stack.push(...(out.get(cur) ?? []).map((e) => e.target));
  }
  return zone;
}

function checkTnDisconnection(
  doc: DiagramDoc,
  out: Map<string, DiagramEdge[]>,
  nodes: Record<string, NodeNetworkResult>,
  findings: NetworkFinding[],
  earthingKnown: boolean,
) {
  for (const dev of Object.values(doc.nodes)) {
    if (dev.sheet !== "unifilar") continue;
    if (dev.params.kind !== "breaker") continue;
    const zone = protectedZone(dev.id, out, doc);
    if (zone.length === 0) continue;
    const Ia = instantaneousTrip_A(dev);
    if (!Ia) continue;
    let worst: { id: string; ik: number } | null = null;
    let blocked = false;
    for (const id of zone) {
      const r = nodes[id];
      if (r?.blockedByEdgeId) blocked = true;
      if (r?.Ik1min_kA === undefined) continue;
      if (!worst || r.Ik1min_kA < worst.ik) worst = { id, ik: r.Ik1min_kA };
    }
    if (worst && worst.ik * 1000 < Ia) {
      findings.push({
        code: "AUTO_DISCONNECTION_FAIL",
        severity: earthingKnown ? "error" : "warning",
        nodeId: dev.id,
        message: `${nodeDisplayName(dev)}: curto fase-terra mínimo de ${worst.ik} kA em ${nodeDisplayName(doc.nodes[worst.id])} não alcança o disparo instantâneo (${round2(Ia / 1000)} kA) — o seccionamento automático no tempo da norma não é garantido. Reduza o comprimento, aumente a seção/PE, troque a curva ou use DR.`,
        clause: "NBR 5410 §5.1.2.2.4",
      });
    } else if (blocked) {
      // O ponto mais distante (o que decide) está sem dados: não declara "OK".
      findings.push({
        code: "AUTO_DISCONNECTION_PENDING",
        severity: "warning",
        nodeId: dev.id,
        message: `${nodeDisplayName(dev)}: proteção contra choque não verificável — informe seção e comprimento dos cabos do circuito.`,
        clause: "NBR 5410 §5.1.2.2.4",
      });
    }
  }
}

/** Segunda falta no esquema IT com massas interligadas (NBR 5410 §5.1.2.2.4.4 / IEC 60364-4-41 §411.6.4). */
function checkItSecondFault(
  doc: DiagramDoc,
  out: Map<string, DiagramEdge[]>,
  nodes: Record<string, NodeNetworkResult>,
  findings: NetworkFinding[],
) {
  findings.push({
    code: "IT_IMD_REQUIRED",
    severity: "warning",
    message:
      "Esquema IT: a primeira falta à terra não desliga o circuito — é obrigatório um dispositivo supervisor de isolamento (DSI) com alarme, e a falta deve ser localizada e eliminada o mais rápido possível. O diagrama não representa o DSI: confira no projeto.",
    clause: "NBR 5410 §5.1.2.2.4.4",
  });
  for (const dev of Object.values(doc.nodes)) {
    if (dev.sheet !== "unifilar" || dev.params.kind !== "breaker") continue;
    const zone = protectedZone(dev.id, out, doc);
    if (zone.length === 0) continue;
    const Ia = instantaneousTrip_A(dev);
    if (!Ia) continue;
    let worst: { id: string; ik: number } | null = null;
    let blocked = false;
    for (const id of zone) {
      const r = nodes[id];
      if (r?.blockedByEdgeId) blocked = true;
      if (r?.Ik1min_kA === undefined) continue;
      if (!worst || r.Ik1min_kA < worst.ik) worst = { id, ik: r.Ik1min_kA };
    }
    // Neutro distribuído (U' = U0): I_dupla = U0 / (2·Zs) = Ik1mín / 2.
    const doubleFault_kA = worst ? worst.ik / 2 : undefined;
    if (worst && doubleFault_kA !== undefined && doubleFault_kA * 1000 < Ia) {
      findings.push({
        code: "IT_SECOND_FAULT_FAIL",
        severity: "error",
        nodeId: dev.id,
        message: `${nodeDisplayName(dev)}: na segunda falta (dupla falta em fases diferentes) a corrente estimada de ${round2(doubleFault_kA)} kA em ${nodeDisplayName(doc.nodes[worst.id])} não alcança o disparo instantâneo (${round2(Ia / 1000)} kA). Reduza o comprimento, aumente a seção/PE, troque a curva ou use DR.`,
        clause: "NBR 5410 §5.1.2.2.4.4",
      });
    } else if (blocked) {
      findings.push({
        code: "IT_SECOND_FAULT_PENDING",
        severity: "warning",
        nodeId: dev.id,
        message: `${nodeDisplayName(dev)}: segunda falta no esquema IT não verificável — informe seção e comprimento dos cabos do circuito.`,
        clause: "NBR 5410 §5.1.2.2.4.4",
      });
    }
  }
}

function checkTtRcd(
  doc: DiagramDoc,
  out: Map<string, DiagramEdge[]>,
  inn: Map<string, DiagramEdge[]>,
  findings: NetworkFinding[],
) {
  for (const n of Object.values(doc.nodes)) {
    if (n.sheet !== "unifilar" || !isLoad(n)) continue;
    // Sobe pela alimentação procurando um DR.
    const seen = new Set<string>([n.id]);
    const queue = [...(inn.get(n.id) ?? []).map((e) => e.source)];
    let hasRcd = false;
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (doc.nodes[cur]?.params.kind === "rcd") {
        hasRcd = true;
        break;
      }
      queue.push(...(inn.get(cur) ?? []).map((e) => e.source));
    }
    if (!hasRcd) {
      findings.push({
        code: "TT_WITHOUT_RCD",
        severity: "error",
        nodeId: n.id,
        message: `${nodeDisplayName(n)}: no esquema TT o seccionamento automático exige dispositivo DR a montante — nenhum encontrado.`,
        clause: "NBR 5410 §5.1.2.2.4.3",
      });
    }
  }
  void out;
}
