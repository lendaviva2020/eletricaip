// Proteção contra surtos (DPS) do unifilar — ABNT NBR 5410 §5.4.2 e §6.3.5.2,
// IEC 61643-11 / IEC 60364-5-53. PURO.
//
// Verifica:
//  • Presença de DPS no ponto de entrada (origem) da instalação. Obrigatório com
//    alimentação aérea ou edificação com SPDA; sem essa informação, é aviso.
//  • Classe I (Iimp ≥ 12,5 kA) quando há SPDA; classe II com In ≥ 5 kA na origem.
//  • Uc ≥ 1,1 × U0 (TN/TT) ou Uc ≥ U entre fases (IT).
//  • Up compatível com a categoria II de suportabilidade a impulso (≤ 1,5 kV em
//    127/220 V; ≤ 2,5 kV em 220/380 V; ≤ 4 kV em 400/690 V).
//  • Proteção contra sobrecorrente própria do DPS (fusível/disjuntor de backup).
//
// Dado não informado no DPS (Uc, Up, In, Iimp) vira pendência — nunca presumido.
import type { DiagramDoc, DiagramEdge, DiagramNode } from "../schema";
import { nodeDisplayName } from "./cable-sizing";

export type SurgeFindingCode =
  | "SPD_MISSING_AT_ORIGIN"
  | "SPD_CLASS_I_REQUIRED"
  | "SPD_IIMP_LOW"
  | "SPD_IN_LOW"
  | "SPD_UC_LOW"
  | "SPD_UP_HIGH"
  | "SPD_DATA_MISSING"
  | "SPD_NO_BACKUP";

export interface SurgeFinding {
  code: SurgeFindingCode;
  severity: "error" | "warning";
  nodeId?: string;
  message: string;
  clause: string;
}

export interface SurgeReport {
  findings: SurgeFinding[];
  /** DPS reconhecidos no ponto de entrada (origem) da instalação. */
  originSpdIds: string[];
}

/** Iimp mínima do DPS classe I por polo (NBR 5410 §6.3.5.2). */
export const MIN_IIMP_KA = 12.5;
/** In mínima do DPS classe II no ponto de entrada (NBR 5410 §6.3.5.2). */
export const MIN_IN_KA = 5;

const SOURCE_KINDS = new Set(["transformer", "generator"]);
const PASS_THROUGH = new Set(["breaker", "disconnector", "fuse", "rcd", "busbar"]);
const BACKUP_KINDS = new Set(["breaker", "fuse"]);
const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

function num(n: DiagramNode, key: string): number | undefined {
  const v = (n.params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Nível de proteção máximo pela categoria II de suportabilidade (NBR 5410 Tab. 31). */
export function maxUpForPhaseVoltage(U0: number): number {
  if (U0 <= 150) return 1.5;
  if (U0 <= 300) return 2.5;
  return 4;
}

export function analyzeSurgeProtection(doc: DiagramDoc): SurgeReport {
  const findings: SurgeFinding[] = [];
  const net = doc.metadata.network;
  const out = new Map<string, DiagramEdge[]>();
  const inn = new Map<string, DiagramEdge[]>();
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }

  const nodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  const sources = nodes.filter((n) => SOURCE_KINDS.has(n.params.kind));
  const spds = nodes.filter((n) => n.params.kind === "spd");
  if (sources.length === 0 && spds.length === 0) return { findings, originSpdIds: [] };

  // Origem: fonte → proteção/seccionamento geral → primeiro barramento (ou ponto de derivação).
  const origin = new Set<string>();
  for (const src of sources) {
    let cur: DiagramNode | undefined = src;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      origin.add(cur.id);
      if (cur.params.kind === "busbar") break;
      const outs: DiagramEdge[] = (out.get(cur.id) ?? []).filter(
        (e) => doc.nodes[e.target]?.params.kind !== "spd",
      );
      if (outs.length !== 1) break; // ponto de derivação: a origem termina aqui
      const next: DiagramNode | undefined = doc.nodes[outs[0].target];
      if (!next || !PASS_THROUGH.has(next.params.kind)) break;
      cur = next;
    }
  }

  // Para cada DPS: sobe pela alimentação atravessando o backup até o ponto de ligação.
  const originSpdIds: string[] = [];
  const voltage = (() => {
    for (const s of sources) {
      const U = num(s, "secondary_V") ?? num(s, "voltage_V");
      if (U) return U;
    }
    return undefined;
  })();
  const U0 = voltage ? voltage / Math.sqrt(3) : undefined;

  for (const spd of spds) {
    let cur = spd.id;
    let backup: DiagramNode | undefined;
    const seen = new Set<string>([cur]);
    let attach: DiagramNode | undefined;
    for (let i = 0; i < 6; i++) {
      const e = (inn.get(cur) ?? [])[0];
      const up = e ? doc.nodes[e.source] : undefined;
      if (!up || seen.has(up.id)) break;
      seen.add(up.id);
      if (!backup && BACKUP_KINDS.has(up.params.kind) && !origin.has(up.id)) {
        backup = up;
        cur = up.id;
        continue;
      }
      attach = up;
      break;
    }
    const atOrigin = attach ? origin.has(attach.id) : false;
    if (atOrigin) originSpdIds.push(spd.id);

    const name = nodeDisplayName(spd);
    const p = spd.params as {
      spd_class?: string;
      uc_V?: number;
      up_kV?: number;
      in_kA?: number;
      iimp_kA?: number;
    };
    const cls = p.spd_class ?? "II";

    if (attach && !backup) {
      findings.push({
        code: "SPD_NO_BACKUP",
        severity: "warning",
        nodeId: spd.id,
        message: `${name}: ligado direto em ${nodeDisplayName(attach)} sem fusível/disjuntor próprio — o DPS precisa de proteção contra sobrecorrente conforme o fabricante (desligamento seguro no fim de vida).`,
        clause: "NBR 5410 §6.3.5.2",
      });
    }

    const missing: string[] = [];
    if (p.uc_V === undefined) missing.push("Uc");
    if (p.up_kV === undefined) missing.push("Up");
    if (cls === "I" && p.iimp_kA === undefined) missing.push("Iimp");
    if (cls !== "I" && p.in_kA === undefined) missing.push("In");
    if (missing.length) {
      findings.push({
        code: "SPD_DATA_MISSING",
        severity: "warning",
        nodeId: spd.id,
        message: `${name}: informe ${missing.join(", ")} do catálogo do DPS para verificar a coordenação.`,
        clause: "IEC 61643-11",
      });
    }

    if (U0 !== undefined && p.uc_V !== undefined) {
      const isIT = net?.earthing === "IT";
      const minUc = isIT ? voltage! : 1.1 * U0;
      if (p.uc_V < minUc) {
        findings.push({
          code: "SPD_UC_LOW",
          severity: "error",
          nodeId: spd.id,
          message: `${name}: Uc ${p.uc_V} V abaixo do mínimo ${Math.ceil(minUc)} V (${isIT ? "tensão entre fases no esquema IT" : "1,1 × U0"}) — o DPS conduz em regime e se destrói.`,
          clause: "NBR 5410 §6.3.5.2",
        });
      }
    }

    if (atOrigin && U0 !== undefined && p.up_kV !== undefined) {
      const maxUp = maxUpForPhaseVoltage(U0);
      if (p.up_kV > maxUp) {
        findings.push({
          code: "SPD_UP_HIGH",
          severity: "error",
          nodeId: spd.id,
          message: `${name}: nível de proteção Up ${p.up_kV} kV acima de ${maxUp} kV (categoria II de suportabilidade a impulso para U0 ≈ ${Math.round(U0)} V).`,
          clause: "NBR 5410 §6.3.5.2",
        });
      }
    }

    if (atOrigin && cls === "I" && p.iimp_kA !== undefined && p.iimp_kA < MIN_IIMP_KA) {
      findings.push({
        code: "SPD_IIMP_LOW",
        severity: "error",
        nodeId: spd.id,
        message: `${name}: Iimp ${p.iimp_kA} kA abaixo de ${MIN_IIMP_KA} kA por polo exigidos para o DPS classe I no ponto de entrada.`,
        clause: "NBR 5410 §6.3.5.2",
      });
    }
    if (atOrigin && cls === "II" && p.in_kA !== undefined && p.in_kA < MIN_IN_KA) {
      findings.push({
        code: "SPD_IN_LOW",
        severity: "error",
        nodeId: spd.id,
        message: `${name}: In ${p.in_kA} kA abaixo de ${MIN_IN_KA} kA exigidos para o DPS no ponto de entrada.`,
        clause: "NBR 5410 §6.3.5.2",
      });
    }
  }

  if (sources.length > 0) {
    const required = net?.overheadSupply === true || net?.lightningProtection === true;
    const known = net?.overheadSupply !== undefined || net?.lightningProtection !== undefined;
    if (originSpdIds.length === 0) {
      findings.push({
        code: "SPD_MISSING_AT_ORIGIN",
        severity: required ? "error" : "warning",
        nodeId: sources[0].id,
        message: required
          ? "Sem DPS no ponto de entrada da instalação: obrigatório com alimentação aérea ou edificação com SPDA (para-raios)."
          : known
            ? "Sem DPS no ponto de entrada da instalação: recomendado para proteger os equipamentos contra surtos de manobra e descargas indiretas."
            : "Sem DPS no ponto de entrada: informe nos dados da rede se a alimentação é aérea e se há SPDA — nesses casos o DPS é obrigatório.",
        clause: "NBR 5410 §5.4.2",
      });
    } else if (
      net?.lightningProtection === true &&
      !originSpdIds.some(
        (id) => (doc.nodes[id]?.params as { spd_class?: string }).spd_class === "I",
      )
    ) {
      findings.push({
        code: "SPD_CLASS_I_REQUIRED",
        severity: "error",
        nodeId: originSpdIds[0],
        message:
          "Edificação com SPDA: o DPS do ponto de entrada precisa ser classe I (corrente de impulso 10/350 µs).",
        clause: "NBR 5410 §6.3.5.2",
      });
    }
  }

  return { findings, originSpdIds };
}
