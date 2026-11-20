// Dimensionamento determinístico dos condutores do unifilar — ABNT NBR 5410.
// PURO: não acessa rede, store nem relógio.
//
// O que faz, ligação de potência por ligação de potência:
//  • Ib (corrente de projeto) = soma das cargas a jusante (motor: In de placa
//    calculada; carga: P/(√3·U·fp) ou P/(U·fp); tomada: corrente nominal).
//  • In (proteção) = primeiro dispositivo de proteção contra sobrecarga a
//    montante (relé térmico ou disjuntor).
//  • Seção = sizeConductorNBR5410(Ib, { breaker_A: In, … }): garante
//    Ib ≤ In ≤ I'z (§5.3.4.1) e, se houver comprimento, queda ≤ 4 % (§6.2.7).
//  • Ramal de um único motor: I'z ≥ 1,25·In do motor (§6.5.1.3.1).
//
// Regras de integridade (AGENTS.md, "nada inventado"):
//  • NUNCA preenche comprimento — é dado de obra. Cabo de campo/alimentador sem
//    comprimento vira pendência nominal ("informe o comprimento de F2 → M1").
//  • Seção informada pelo usuário só é trocada se NÃO coordenar com a proteção
//    (subdimensionada) — e a troca é relatada.
//  • Premissas (método de instalação, temperatura, isolação) são declaradas no
//    relatório e gravadas no próprio cabo (`installation`), nunca ocultas.
import type { DiagramDoc, DiagramEdge, DiagramNode } from "../schema";
import {
  motorNominalCurrent,
  sizeConductorNBR5410,
  voltageDrop_pct,
  type InstallationMethod,
  type InsulationType,
} from "@/lib/electrical-calc";

export type CableSpec = NonNullable<DiagramEdge["cable"]>;

/** Equipamentos de campo: o cabo sai do painel até eles (mesma regra da Documentação EletricAI). */
export const FIELD_KINDS: ReadonlySet<string> = new Set([
  "motor",
  "load",
  "lamp",
  "socket",
  "pt100",
  "pressure",
  "flow",
  "level",
  "encoder",
  "estop",
  "lightcurtain",
]);
/** Fontes externas ao painel: o alimentador chega por cabo. */
export const EXTERNAL_SOURCE_KINDS: ReadonlySet<string> = new Set(["transformer", "generator"]);

const METHODS: ReadonlySet<string> = new Set(["A1", "A2", "B1", "B2", "C", "D", "E", "F"]);
/** Método de referência quando o usuário não informou (eletroduto embutido em alvenaria). */
export const DEFAULT_INSTALLATION_METHOD: InstallationMethod = "B1";
const MAX_DROP_PCT = 4; // mesmo valor de MAX_CABLE_DROP_PCT (declarado abaixo do tipo)

const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

/** Cabo de campo (painel → carga) ou alimentador (fonte externa → painel). */
export function isFieldCable(doc: DiagramDoc, e: DiagramEdge): boolean {
  const src = doc.nodes[e.source];
  const tgt = doc.nodes[e.target];
  return (
    (!!tgt && FIELD_KINDS.has(tgt.params.kind)) ||
    (!!src && EXTERNAL_SOURCE_KINDS.has(src.params.kind))
  );
}

function num(params: DiagramNode["params"], key: string): number | undefined {
  const v = (params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Corrente de projeto de UMA carga, ou undefined quando o tipo não consome potência conhecida. */
export function loadCurrent_A(node: DiagramNode): number | undefined {
  const p = node.params;
  const U = num(p, "voltage_V");
  switch (p.kind) {
    case "motor": {
      const plate = num(p, "current_A") ?? num(p, "fla_A");
      if (plate) return plate;
      const kW = num(p, "power_kW");
      if (!kW) return undefined;
      const I = motorNominalCurrent({ id: node.id, power_kW: kW, voltage_V: U ?? 380 });
      return I > 0 ? I : undefined;
    }
    case "load": {
      const P = num(p, "power_W");
      if (!P) return undefined;
      const V = U ?? 220;
      const fp = num(p, "fp") ?? 0.92;
      return V >= 300 ? P / (Math.sqrt(3) * V * fp) : P / (V * fp);
    }
    case "lamp": {
      const P = num(p, "power_W");
      return P ? P / (U ?? 220) : undefined;
    }
    case "socket":
      return num(p, "current_A");
    default:
      return undefined;
  }
}

interface Adjacency {
  out: Map<string, DiagramEdge[]>;
  in: Map<string, DiagramEdge[]>;
}

function buildAdjacency(doc: DiagramDoc): Adjacency {
  const out = new Map<string, DiagramEdge[]>();
  const inn = new Map<string, DiagramEdge[]>();
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  return { out, in: inn };
}

/** Cargas alimentadas a jusante de `startId` (inclusive), sem repetir nó (grafo pode ter laço). */
function downstreamLoads(doc: DiagramDoc, adj: Adjacency, startId: string): DiagramNode[] {
  const seen = new Set<string>();
  const loads: DiagramNode[] = [];
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = doc.nodes[id];
    if (n && loadCurrent_A(n) !== undefined) loads.push(n);
    for (const e of adj.out.get(id) ?? []) stack.push(e.target);
  }
  return loads;
}

/**
 * Proteção contra sobrecarga do trecho: sobe a partir da origem da ligação até
 * o primeiro relé térmico ou disjuntor. Inversor/soft fazem proteção eletrônica
 * do motor — nesse caso o trecho é dimensionado só pela carga (1,25·In).
 */
function upstreamProtection_A(
  doc: DiagramDoc,
  adj: Adjacency,
  fromId: string,
): { in_A: number; deviceId: string } | null {
  const seen = new Set<string>();
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = doc.nodes[id];
    if (n) {
      const k = n.params.kind;
      if (k === "thermal_relay" || k === "breaker") {
        const In = num(n.params, "in_A");
        if (In) return { in_A: In, deviceId: n.id };
      }
      if (k === "vfd" || k === "softstarter") return null;
    }
    for (const e of adj.in.get(id) ?? []) queue.push(e.source);
  }
  return null;
}

export interface CableSizingChange {
  edgeId: string;
  from?: CableSpec;
  to: CableSpec;
  reason: "missing" | "undersized";
  Ib_A: number;
  protection_A?: number;
}

export interface PendingCableLength {
  edgeId: string;
  /** "Q2 → M1" — tags (ou rótulos) para o usuário saber qual cabo medir. */
  name: string;
}

export interface CableSizingReport {
  doc: DiagramDoc;
  changes: CableSizingChange[];
  /** Cabos de campo/alimentador sem comprimento: só o usuário pode informar. */
  pendingLength: PendingCableLength[];
  /** Ligações sem carga nem proteção conhecidas: não dá para dimensionar sem chutar. */
  notSizable: string[];
  premises: string[];
  /** Uma linha por condutor de potência (estado ATUAL do diagrama) para a tabela NBR 5410. */
  rows: CableRow[];
}

export type CableRowStatus =
  | "ok"
  | "sem_secao"
  | "subdimensionada"
  | "sem_comprimento"
  | "queda_excedida"
  | "nao_dimensionavel";

export interface CableRow {
  edgeId: string;
  name: string;
  /** Cabo de campo ou alimentador (precisa de comprimento medido). */
  field: boolean;
  /** Corrente de projeto (soma das cargas a jusante); 0 se desconhecida. */
  Ib_A: number;
  /** In do 1º relé térmico/disjuntor a montante. */
  protection_A?: number;
  /** Seção gravada no cabo (do usuário ou dimensionada). */
  section_mm2?: number;
  /** Seção mínima pela NBR 5410 para Ib/In (e queda, se houver comprimento). */
  required_mm2?: number;
  length_m?: number;
  installation: string;
  threePhase: boolean;
  /** Queda de tensão no trecho (%), só com seção e comprimento informados. */
  drop_pct?: number;
  status: CableRowStatus;
}

/** Limite de queda usado na verificação dos trechos (NBR 5410 §6.2.7, circuito terminal). */
export const MAX_CABLE_DROP_PCT = 4;

export function nodeDisplayName(n: DiagramNode | undefined): string {
  if (!n) return "?";
  const tag = typeof n.params.tag === "string" && n.params.tag.trim() ? n.params.tag.trim() : "";
  return tag || n.label || n.id;
}

export function cableName(doc: DiagramDoc, e: DiagramEdge): string {
  return `${nodeDisplayName(doc.nodes[e.source])} → ${nodeDisplayName(doc.nodes[e.target])}`;
}

function isThreePhase(e: DiagramEdge, src?: DiagramNode, tgt?: DiagramNode): boolean {
  if (e.circuitConfig) return e.circuitConfig.startsWith("3F");
  const V = (tgt && num(tgt.params, "voltage_V")) ?? (src && num(src.params, "voltage_V"));
  return V === undefined ? true : V >= 300;
}

/**
 * Tensão de linha do sistema: secundário do trafo ou tensão do gerador do
 * diagrama (a primeira fonte encontrada). Sem fonte com tensão: undefined.
 */
export function systemLineVoltage(doc: DiagramDoc): number | undefined {
  for (const n of Object.values(doc.nodes)) {
    if (n.sheet !== "unifilar") continue;
    if (n.params.kind === "transformer") {
      const V = num(n.params, "secondary_V");
      if (V) return V;
    }
    if (n.params.kind === "generator") {
      const V = num(n.params, "voltage_V");
      if (V) return V;
    }
  }
  return undefined;
}

/** Tensão para queda/dimensionamento: linha (trifásico) ou fase-neutro (monofásico). */
function circuitVoltage(lineV: number, three: boolean): number {
  return three ? lineV : Math.round(lineV / Math.sqrt(3));
}

export function sizeDiagramCables(doc: DiagramDoc): CableSizingReport {
  const adj = buildAdjacency(doc);
  const sourceV = systemLineVoltage(doc);
  const lineV = sourceV ?? 380;
  const nextEdges: Record<string, DiagramEdge> = { ...doc.edges };
  const changes: CableSizingChange[] = [];
  const pendingLength: PendingCableLength[] = [];
  const notSizable: string[] = [];
  const rows: CableRow[] = [];
  let usedDefaultMethod = false;

  const edges = Object.values(doc.edges)
    .filter(isPower)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const e of edges) {
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;

    // Condutores de ligação do DPS: não conduzem corrente de carga — a seção é a
    // mínima da norma (4 mm² Cu; 16 mm² com DPS classe I), nunca pelo In a montante.
    if (tgt.params.kind === "spd") {
      const cls = (tgt.params as { spd_class?: string }).spd_class ?? "II";
      const required = cls === "I" ? 16 : 4;
      const cur = e.cable;
      const status: CableRowStatus = !cur?.section_mm2
        ? "sem_secao"
        : cur.section_mm2 < required
          ? "subdimensionada"
          : "ok";
      rows.push({
        edgeId: e.id,
        name: cableName(doc, e),
        field: false,
        Ib_A: 0,
        section_mm2: cur?.section_mm2,
        required_mm2: required,
        length_m: cur?.length_m,
        installation: cur?.installation ?? DEFAULT_INSTALLATION_METHOD,
        threePhase: isThreePhase(e, src, tgt),
        status,
      });
      if (status !== "ok") {
        const to: CableSpec = {
          ...(cur ?? {}),
          insulation: cur?.insulation ?? "PVC",
          section_mm2: required,
        };
        nextEdges[e.id] = { ...e, cable: to };
        changes.push({
          edgeId: e.id,
          from: cur,
          to,
          reason: cur?.section_mm2 ? "undersized" : "missing",
          Ib_A: 0,
        });
      }
      continue;
    }

    const loads = downstreamLoads(doc, adj, e.target);
    const Ib = loads.reduce((s, n) => s + (loadCurrent_A(n) ?? 0), 0);
    const protection = upstreamProtection_A(doc, adj, e.source);
    const field = isFieldCable(doc, e);
    if (Ib <= 0 && !protection) {
      notSizable.push(e.id);
      rows.push({
        edgeId: e.id,
        name: cableName(doc, e),
        field,
        Ib_A: 0,
        section_mm2: e.cable?.section_mm2,
        length_m: e.cable?.length_m,
        installation: e.cable?.installation ?? DEFAULT_INSTALLATION_METHOD,
        threePhase: isThreePhase(e, src, tgt),
        status: "nao_dimensionavel",
      });
      continue;
    }
    const designIb = Ib > 0 ? Ib : (protection?.in_A ?? 0);
    const singleMotor = loads.length === 1 && loads[0].params.kind === "motor";

    const cur = e.cable;
    const method: InstallationMethod =
      cur?.installation && METHODS.has(cur.installation)
        ? (cur.installation as InstallationMethod)
        : DEFAULT_INSTALLATION_METHOD;
    if (!(cur?.installation && METHODS.has(cur.installation))) usedDefaultMethod = true;
    const insulation: InsulationType = cur?.insulation ?? "PVC";
    const three = isThreePhase(e, src, tgt);

    const sizing = sizeConductorNBR5410(designIb, {
      method,
      insulation,
      loadedConductors: three ? 3 : 2,
      safetyFactor: singleMotor ? 1.25 : 1,
      breaker_A: protection?.in_A,
      ambientTemp_C: doc.metadata.network?.ambientTemp_C,
      groupedCircuits: cur?.groupedCircuits,
      length_m: cur?.length_m,
      voltage_V: circuitVoltage(lineV, three),
      maxVoltageDrop_pct: MAX_DROP_PCT,
    });
    const required = sizing.section_mm2;

    if (field && !cur?.length_m) {
      pendingLength.push({ edgeId: e.id, name: cableName(doc, e) });
    }

    // Linha da tabela no ESTADO ATUAL (antes da correção desta passada).
    const V = circuitVoltage(lineV, three);
    const drop =
      cur?.section_mm2 && cur?.length_m
        ? Math.round(voltageDrop_pct(designIb, cur.length_m, cur.section_mm2, V, 0.86) * 100) / 100
        : undefined;
    let status: CableRowStatus = "ok";
    if (!cur?.section_mm2) status = "sem_secao";
    else if (cur.section_mm2 < required) status = "subdimensionada";
    else if (field && !cur?.length_m) status = "sem_comprimento";
    else if (drop !== undefined && drop > MAX_DROP_PCT) status = "queda_excedida";
    rows.push({
      edgeId: e.id,
      name: cableName(doc, e),
      field,
      Ib_A: Math.round(designIb * 10) / 10,
      protection_A: protection?.in_A,
      section_mm2: cur?.section_mm2,
      required_mm2: required,
      length_m: cur?.length_m,
      installation: method,
      threePhase: three,
      drop_pct: drop,
      status,
    });

    let reason: CableSizingChange["reason"] | null = null;
    if (!cur?.section_mm2) reason = "missing";
    else if (cur.section_mm2 < required) reason = "undersized";
    if (!reason) continue;

    const to: CableSpec = {
      ...(cur ?? {}),
      insulation,
      installation: method,
      section_mm2: required,
    };
    nextEdges[e.id] = { ...e, cable: to };
    changes.push({
      edgeId: e.id,
      from: cur,
      to,
      reason,
      Ib_A: Math.round(designIb * 10) / 10,
      protection_A: protection?.in_A,
    });
  }

  const premises: string[] = [
    `Condutor de cobre, isolação conforme o cabo (padrão PVC 70 °C), temperatura ambiente ${doc.metadata.network?.ambientTemp_C ?? 30} °C${doc.metadata.network?.ambientTemp_C === undefined ? " (padrão — informe nos dados da rede)" : ""}; agrupamento conforme cada cabo (padrão: um circuito por conduto, NBR 5410 Tab. 42).`,
    "Ib = soma das cargas a jusante; ramal de motor único com I'z ≥ 1,25·In (NBR 5410 §6.5.1.3.1).",
    "Coordenação Ib ≤ In ≤ I'z com a proteção a montante (NBR 5410 §5.3.4.1).",
    "Condutores de ligação de DPS: seção mínima 4 mm² (16 mm² com DPS classe I), independente da corrente de carga (NBR 5410 §6.3.5.2).",
  ];
  premises.push(
    sourceV
      ? `Queda de tensão com ${sourceV} V entre fases (fonte do diagrama) e ${circuitVoltage(sourceV, false)} V fase-neutro; cos φ 0,86.`
      : "Fonte do diagrama sem tensão informada: queda de tensão calculada com 380/220 V — informe a tensão do trafo ou do gerador; cos φ 0,86.",
  );
  if (usedDefaultMethod) {
    premises.unshift(
      `Método de instalação não informado: adotado ${DEFAULT_INSTALLATION_METHOD} (eletroduto embutido) — confirme ou altere no cabo.`,
    );
  }

  return { doc: { ...doc, edges: nextEdges }, changes, pendingLength, notSizable, premises, rows };
}
