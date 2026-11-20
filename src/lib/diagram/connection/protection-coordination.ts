// Coordenação das proteções do unifilar — ABNT NBR 5410 / IEC 60947. PURO.
//
// Verifica o que torna um unifilar tecnicamente correto além da ligação:
//  1. Proteção × carga (§5.3.4): In do disjuntor/fusível ≥ Ib a jusante.
//  2. Relé térmico × motor (IEC 60947-4-1): ajuste entre 0,95 e 1,25 × In do
//     motor (abaixo dispara em regime; acima não protege contra sobrecarga).
//  3. Contator × motor (IEC 60947-4-1, AC-3): In do contator ≥ In do motor.
//  4. Seletividade amperimétrica: disjuntor a jusante com In menor que o de
//     montante (igual ou maior = o geral desarma junto/antes do ramal).
//  5. Capacidade de interrupção (§5.3.5 / IEC 60947-2): Icu do disjuntor ≥
//     corrente de curto presumida no barramento (IEC 60909, a partir do trafo).
//
// Nada inventado: corrente de carga desconhecida não gera alerta; a
// impedância do trafo, se não informada, usa o valor típico POR POTÊNCIA e isso
// aparece como premissa no alerta.
import type { DiagramDoc, DiagramEdge, DiagramNode } from "../schema";
import { shortCircuitIEC60909 } from "@/lib/electrical-sim";
import { loadCurrent_A, nodeDisplayName } from "./cable-sizing";

export type CoordinationCode =
  | "PROTECTION_UNDERSIZED"
  | "THERMAL_SETTING_LOW"
  | "THERMAL_SETTING_HIGH"
  | "CONTACTOR_UNDERSIZED"
  | "NO_SELECTIVITY"
  | "BREAKING_CAPACITY_LOW"
  | "BREAKING_CAPACITY_MISSING";

export interface CoordinationFinding {
  code: CoordinationCode;
  severity: "error" | "warning";
  nodeId: string;
  message: string;
  /** Premissas usadas no cálculo (ex.: uk típico do trafo). */
  assumptions?: string[];
}

export interface CoordinationReport {
  findings: CoordinationFinding[];
  /** Curto trifásico presumido no barramento (kA), quando há trafo no diagrama. */
  prospectiveIk_kA?: number;
}

const THERMAL_MIN_RATIO = 0.95;
const THERMAL_MAX_RATIO = 1.25;

/** uk típico de transformador de distribuição por potência (premissa quando não informado). */
export function typicalTransformerUk(kVA: number): number {
  if (kVA <= 150) return 3.5;
  if (kVA <= 300) return 4.5;
  return 5.0;
}

const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

function num(n: DiagramNode, key: string): number | undefined {
  const v = (n.params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function analyzeProtectionCoordination(doc: DiagramDoc): CoordinationReport {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e.target);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e.source);
  }

  /** Cargas a jusante de um nó (exclusive), sem repetir (o grafo pode ter laço). */
  const loadsBelow = (id: string): DiagramNode[] => {
    const seen = new Set<string>([id]);
    const stack = [...(out.get(id) ?? [])];
    const loads: DiagramNode[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const n = doc.nodes[cur];
      if (n && loadCurrent_A(n) !== undefined) loads.push(n);
      stack.push(...(out.get(cur) ?? []));
    }
    return loads;
  };

  /** Primeiro nó a montante do tipo pedido (busca em largura pela alimentação). */
  const firstUpstream = (id: string, kinds: ReadonlySet<string>): DiagramNode | undefined => {
    const seen = new Set<string>([id]);
    const queue = [...(inn.get(id) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const n = doc.nodes[cur];
      if (n && kinds.has(n.params.kind)) return n;
      queue.push(...(inn.get(cur) ?? []));
    }
    return undefined;
  };

  const findings: CoordinationFinding[] = [];
  const nodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  const name = (n: DiagramNode) => nodeDisplayName(n);

  for (const n of nodes) {
    const kind = n.params.kind;
    const In = num(n, "in_A");

    // 1. Proteção × carga
    if ((kind === "breaker" || kind === "fuse") && In) {
      const Ib = loadsBelow(n.id).reduce((s, l) => s + (loadCurrent_A(l) ?? 0), 0);
      if (Ib > 0 && In < Ib) {
        findings.push({
          code: "PROTECTION_UNDERSIZED",
          severity: "error",
          nodeId: n.id,
          message: `${name(n)}: In ${In} A menor que a corrente de projeto a jusante (Ib ${round1(Ib)} A) — dispara em operação normal (NBR 5410 §5.3.4).`,
        });
      }
    }

    // 2/3. Relé térmico e contator × motor alimentado
    if ((kind === "thermal_relay" || kind === "contactor") && In) {
      const motors = loadsBelow(n.id).filter((l) => l.params.kind === "motor");
      if (motors.length === 1) {
        const Im = loadCurrent_A(motors[0]);
        if (Im && kind === "thermal_relay") {
          if (In < THERMAL_MIN_RATIO * Im) {
            findings.push({
              code: "THERMAL_SETTING_LOW",
              severity: "warning",
              nodeId: n.id,
              message: `${name(n)}: ajuste ${In} A abaixo do In de ${name(motors[0])} (${round1(Im)} A) — dispara em regime (IEC 60947-4-1).`,
            });
          } else if (In > THERMAL_MAX_RATIO * Im) {
            findings.push({
              code: "THERMAL_SETTING_HIGH",
              severity: "warning",
              nodeId: n.id,
              message: `${name(n)}: ajuste ${In} A acima de 1,25 × In de ${name(motors[0])} (${round1(Im)} A) — não protege o motor contra sobrecarga.`,
            });
          }
        }
        if (Im && kind === "contactor" && In < Im) {
          findings.push({
            code: "CONTACTOR_UNDERSIZED",
            severity: "error",
            nodeId: n.id,
            message: `${name(n)}: In ${In} A menor que o In de ${name(motors[0])} (${round1(Im)} A) em AC-3 (IEC 60947-4-1).`,
          });
        }
      }
    }

    // 4. Seletividade amperimétrica entre disjuntores em cascata
    if (kind === "breaker" && In) {
      const up = firstUpstream(n.id, new Set(["breaker"]));
      const upIn = up ? num(up, "in_A") : undefined;
      if (up && upIn && In >= upIn) {
        findings.push({
          code: "NO_SELECTIVITY",
          severity: "error",
          nodeId: n.id,
          message: `${name(n)} (${In} A) não é menor que ${name(up)} (${upIn} A) a montante: sem seletividade — uma falta no ramal desarma o alimentador.`,
        });
      }
    }
  }

  // 5. Capacidade de interrupção × curto presumido no barramento
  let prospectiveIk_kA: number | undefined;
  const trafo = nodes.find((n) => n.params.kind === "transformer");
  const kVA = trafo ? num(trafo, "kVA") : undefined;
  const U = trafo ? num(trafo, "secondary_V") : undefined;
  if (trafo && kVA && U) {
    const ukGiven = num(trafo, "uk_pct");
    const uk = ukGiven ?? typicalTransformerUk(kVA);
    const vector = (trafo.params as Record<string, unknown>).vector;
    try {
      const sc = shortCircuitIEC60909({
        power_kVA: kVA,
        secondary_V: U,
        impedance_pct: uk,
        vector_group: typeof vector === "string" ? vector : undefined,
      });
      prospectiveIk_kA = round1(sc.Ik3ph_kA);
    } catch {
      prospectiveIk_kA = undefined;
    }
    if (prospectiveIk_kA !== undefined) {
      const assumptions = [
        `Curto IEC 60909 no secundário de ${name(trafo)} (${kVA} kVA, ${U} V, uk ${uk}%${ukGiven ? "" : " típico — informe o uk de placa"}); impedância da rede a montante e dos cabos desprezada (lado da segurança).`,
      ];
      const missing: DiagramNode[] = [];
      for (const b of nodes) {
        if (b.params.kind !== "breaker") continue;
        const icu = num(b, "icc_kA");
        if (icu === undefined) {
          missing.push(b);
        } else if (icu < prospectiveIk_kA) {
          findings.push({
            code: "BREAKING_CAPACITY_LOW",
            severity: "error",
            nodeId: b.id,
            message: `${name(b)}: capacidade de interrupção ${icu} kA menor que o curto presumido ${prospectiveIk_kA} kA (NBR 5410 §5.3.5 / IEC 60947-2).`,
            assumptions,
          });
        }
      }
      if (missing.length > 0) {
        findings.push({
          code: "BREAKING_CAPACITY_MISSING",
          severity: "warning",
          nodeId: missing[0].id,
          message: `${missing.length} disjuntor(es) sem capacidade de interrupção (Icu) informada: curto presumido no barramento ≈ ${prospectiveIk_kA} kA — escolha disjuntores com Icu ≥ esse valor.`,
          assumptions,
        });
      }
    }
  }

  return { findings, prospectiveIk_kA };
}
