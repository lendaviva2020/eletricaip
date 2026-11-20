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
import { analyzeNetwork, typicalTransformerUk } from "./network-calculation";
import { OVERLOAD_RATIO, motorStartChecks, selectivityByCurves } from "./trip-curves";

const CURVE_PREMISE =
  "Seletividade amperimétrica (IEC 60898-1 / 60947-2): limite = disparo magnético mínimo do disjuntor de montante (B 3×, C 5×, D 10× In). Tabelas de seletividade do fabricante podem garantir valores maiores.";

export type CoordinationCode =
  | "PROTECTION_UNDERSIZED"
  | "THERMAL_SETTING_LOW"
  | "THERMAL_SETTING_HIGH"
  | "CONTACTOR_UNDERSIZED"
  | "NO_SELECTIVITY"
  | "PARTIAL_SELECTIVITY"
  | "LOW_OVERLOAD_RATIO"
  | "BREAKER_TRIPS_ON_START"
  | "START_INRUSH_RISK"
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

export { typicalTransformerUk };

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
  }

  // 4. Seletividade POR CURVA entre disjuntores em cascata (IEC 60898 / 60947-2),
  //    examinada até o curto no ponto do disjuntor de jusante.
  const networkForSel = analyzeNetwork(doc);
  const partial: Array<{ down: DiagramNode; up: DiagramNode; limit: number; ik: number }> = [];
  const lowRatio: Array<{ down: DiagramNode; up: DiagramNode; ratio: number }> = [];
  for (const n of nodes) {
    if (n.params.kind !== "breaker") continue;
    const up = firstUpstream(n.id, new Set(["breaker"]));
    if (!up) continue;
    const ikLocal = networkForSel.nodes[n.id]?.Ik3max_kA;
    const sel = selectivityByCurves(up, n, ikLocal ? ikLocal * 1000 : undefined);
    if (!sel) continue;
    if (sel.verdict === "nenhuma") {
      findings.push({
        code: "NO_SELECTIVITY",
        severity: "error",
        nodeId: n.id,
        message: `${name(n)} (${num(n, "in_A")} A) não é menor que ${name(up)} (${num(up, "in_A")} A) a montante: sem seletividade — uma falta no ramal desarma o alimentador.`,
        assumptions: [CURVE_PREMISE],
      });
      continue;
    }
    if (sel.overloadRatio !== undefined && sel.overloadRatio < OVERLOAD_RATIO) {
      lowRatio.push({ down: n, up, ratio: sel.overloadRatio });
    }
    if (sel.verdict === "parcial" && sel.limit_A && ikLocal) {
      partial.push({ down: n, up, limit: sel.limit_A, ik: ikLocal });
    }
  }
  if (lowRatio.length > 0) {
    findings.push({
      code: "LOW_OVERLOAD_RATIO",
      severity: "warning",
      nodeId: lowRatio[0].down.id,
      message: `Relação de correntes nominais abaixo de ${OVERLOAD_RATIO} em ${lowRatio.length} par(es) (${lowRatio
        .slice(0, 3)
        .map((p) => `${name(p.up)}/${name(p.down)} = ${p.ratio}`)
        .join("; ")}): em sobrecarga os dois disjuntores podem atuar juntos.`,
      assumptions: [CURVE_PREMISE],
    });
  }
  if (partial.length > 0) {
    const ex = partial
      .slice(0, 3)
      .map(
        (p) =>
          `${name(p.down)}/${name(p.up)} até ${round1(p.limit / 1000)} kA (curto ${round1(p.ik)} kA)`,
      )
      .join("; ");
    findings.push({
      code: "PARTIAL_SELECTIVITY",
      severity: "warning",
      nodeId: partial[0].down.id,
      message: `Seletividade parcial em ${partial.length} par(es) de disjuntores: ${ex}${partial.length > 3 ? "…" : ""}. Acima desse valor os dois podem abrir — confirme na tabela de seletividade do fabricante ou veja as curvas.`,
      assumptions: [CURVE_PREMISE],
    });
  }

  // 4b. Partida do motor × disparo magnético do disjuntor do ramal
  for (const c of motorStartChecks(doc)) {
    const motor = doc.nodes[c.motorId];
    const brk = doc.nodes[c.breakerId];
    if (!motor || !brk) continue;
    if (c.verdict === "dispara") {
      findings.push({
        code: "BREAKER_TRIPS_ON_START",
        severity: "error",
        nodeId: brk.id,
        message: `${name(brk)}: a corrente de partida de ${name(motor)} (≈ ${c.start_A} A) passa do disparo magnético mínimo (${c.magMin_A} A) — o disjuntor desarma na partida. Use curva D, disjuntor-motor ou partida suave.`,
        assumptions: ["Partida direta ≈ 7 × In do motor (estrela-triângulo ≈ 7/3 × In)."],
      });
    } else if (c.verdict === "risco_pico") {
      findings.push({
        code: "START_INRUSH_RISK",
        severity: "warning",
        nodeId: brk.id,
        message: `${name(brk)}: o pico do primeiro meio ciclo da partida de ${name(motor)} (≈ ${2 * c.start_A} A) pode alcançar o disparo magnético mínimo (${c.magMin_A} A). Confirme com a curva do fabricante ou use curva D / disjuntor-motor.`,
        assumptions: ["Pico assimétrico ≈ 2 × corrente eficaz de partida (premissa)."],
      });
    }
  }

  // 5. Capacidade de interrupção × curto presumido NO PONTO de cada disjuntor
  //    (IEC 60909 com a impedância dos cabos a montante). Onde o curto local não é
  //    calculável (cabo sem dados), usa o curto do secundário do trafo — maior,
  //    portanto do lado da segurança — e declara isso como premissa.
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
      const network = networkForSel;
      const assumptions = [
        `Curto IEC 60909 a partir de ${name(trafo)} (${kVA} kVA, ${U} V, uk ${uk}%${ukGiven ? "" : " típico — informe o uk de placa"}), somando a impedância dos cabos a montante de cada disjuntor.`,
        ...network.premises.filter((p) => p.includes("concessionária")),
      ];
      const missing: DiagramNode[] = [];
      let maxLocal = 0;
      for (const b of nodes) {
        if (b.params.kind !== "breaker") continue;
        const local = network.nodes[b.id]?.Ik3max_kA;
        const ikAt = local !== undefined ? round1(local) : prospectiveIk_kA;
        maxLocal = Math.max(maxLocal, ikAt);
        const icu = num(b, "icc_kA");
        if (icu === undefined) {
          missing.push(b);
        } else if (icu < ikAt) {
          findings.push({
            code: "BREAKING_CAPACITY_LOW",
            severity: "error",
            nodeId: b.id,
            message: `${name(b)}: capacidade de interrupção ${icu} kA menor que o curto presumido no seu ponto de instalação, ${ikAt} kA${local === undefined ? " (curto do secundário — cabos a montante sem dados)" : ""} (NBR 5410 §5.3.5 / IEC 60947-2).`,
            assumptions,
          });
        }
      }
      if (missing.length > 0) {
        findings.push({
          code: "BREAKING_CAPACITY_MISSING",
          severity: "warning",
          nodeId: missing[0].id,
          message: `${missing.length} disjuntor(es) sem capacidade de interrupção (Icu) informada: curto presumido de até ${round1(maxLocal || prospectiveIk_kA)} kA nos pontos de instalação — escolha disjuntores com Icu ≥ o curto do seu ponto (veja a tabela da rede).`,
          assumptions,
        });
      }
    }
  }

  return { findings, prospectiveIk_kA };
}
