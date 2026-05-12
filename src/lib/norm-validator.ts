// Validações automáticas contra normas brasileiras e internacionais.
// Pures functions — sem I/O.
// NBR 5410, NBR 14039, NR-10, NR-12, IEC 61131-3, IEC 60617, ISA-18.2.

import type { IndustrialNode, IndustrialEdge } from "./project-store";
import { calcMotor, pickCable_mm2, pickBreaker_A } from "./electrical-calc";

export type NormSeverity = "info" | "warn" | "error";
export interface NormFinding {
  id: string;
  norm: "NBR 5410" | "NBR 14039" | "NR-10" | "NR-12" | "IEC 61131" | "IEC 60617" | "ISA-18.2";
  severity: NormSeverity;
  nodeId?: string;
  title: string;
  detail: string;
  fixHint?: string;
}

function num(v: any, def = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : def;
  }
  return def;
}

export function validateProject(nodes: IndustrialNode[], edges: IndustrialEdge[]): NormFinding[] {
  const f: NormFinding[] = [];
  const motors = nodes.filter((n) => n.kind === "motor");
  const breakers = nodes.filter((n) => n.kind === "breaker");
  const estops = nodes.filter((n) => n.kind === "estop");
  const lightCurtains = nodes.filter((n) => n.kind === "lightcurtain");
  const transformer = nodes.find((n) => n.kind === "transformer");

  // ── NBR 5410 — Dimensionamento de cabo e disjuntor por motor ──
  for (const m of motors) {
    const P = num(m.params.P ?? m.params.power_kW, 0);
    const U = num(m.params.U ?? m.params.voltage_V, 380);
    if (P <= 0) continue;
    const calc = calcMotor({ id: m.id, power_kW: P, voltage_V: U, startMethod: (m.params.startMethod as any) || "DOL" });
    const cable = num(m.params.cable_mm2 ?? m.params.cabo_mm2, 0);
    const brk = num(m.params.breaker_A ?? m.params.disjuntor_A, 0);

    if (cable > 0 && cable < calc.cable_mm2) {
      f.push({
        id: `cable-${m.id}`, norm: "NBR 5410", severity: "error", nodeId: m.id,
        title: `Cabo subdimensionado em ${m.id}`,
        detail: `Bitola declarada ${cable} mm² é menor que a mínima ${calc.cable_mm2} mm² para In=${calc.In_A} A.`,
        fixHint: `Use cabo de ${calc.cable_mm2} mm² (PVC, 3 condutores carregados, 30 °C — IEC 60364).`,
      });
    }
    if (brk > 0 && brk < pickBreaker_A(calc.In_A) * 0.9) {
      f.push({
        id: `brk-${m.id}`, norm: "NBR 5410", severity: "error", nodeId: m.id,
        title: `Disjuntor abaixo da corrente nominal em ${m.id}`,
        detail: `Disjuntor ${brk} A < ${pickBreaker_A(calc.In_A)} A recomendado para In=${calc.In_A} A.`,
        fixHint: `Use disjuntor curva D ≥ ${pickBreaker_A(calc.In_A)} A.`,
      });
    }
    if (brk > 0 && brk > calc.In_A * 4) {
      f.push({
        id: `brk-over-${m.id}`, norm: "NBR 5410", severity: "warn", nodeId: m.id,
        title: `Disjuntor superdimensionado em ${m.id}`,
        detail: `Disjuntor ${brk} A muito acima da In=${calc.In_A} A — pode não proteger o cabo.`,
      });
    }
  }

  // ── NBR 5410 — Proteção diferencial-residual (DR / RCD) ──
  const hasRCD = nodes.some((n) =>
    n.kind === "breaker" &&
    /dr|rcd|residual|diferenc/i.test(JSON.stringify(n.params) + " " + n.label)
  );
  if (motors.length > 0 && !hasRCD) {
    f.push({
      id: "rcd-missing", norm: "NBR 5410", severity: "warn",
      title: "Sem proteção diferencial (DR) no circuito",
      detail: "NBR 5410 §5.1.3.2 exige proteção contra contatos indiretos. Adicione um DR (RCD) de 30 mA em tomadas e 300 mA em circuitos de força.",
      fixHint: "Inclua um disjuntor DR ou RCD na entrada do CCM.",
    });
  }

  // ── NBR 14039 — média tensão / transformador ──
  if (transformer) {
    const kVA = num(transformer.params.kVA ?? transformer.params.S, 0);
    const totalKW = motors.reduce((s, m) => s + num(m.params.P ?? m.params.power_kW, 0), 0);
    const requiredKVA = totalKW / 0.85 / 0.88; // diversidade × cosφ
    if (kVA > 0 && kVA < requiredKVA) {
      f.push({
        id: "trafo-under", norm: "NBR 14039", severity: "error", nodeId: transformer.id,
        title: "Transformador subdimensionado",
        detail: `Trafo ${kVA} kVA insuficiente para carga total ${totalKW.toFixed(0)} kW (mín. ~${requiredKVA.toFixed(0)} kVA).`,
        fixHint: "Aumente o trafo ou divida a carga.",
      });
    }
  }

  // ── NR-10 — Aterramento e identificação ──
  const hasGround = nodes.some((n) => /terra|ground|pe/i.test(n.label + JSON.stringify(n.params)));
  if (motors.length > 0 && !hasGround) {
    f.push({
      id: "nr10-ground", norm: "NR-10", severity: "warn",
      title: "Aterramento (PE) não declarado",
      detail: "NR-10 §10.2.8 exige aterramento elétrico das massas. Declare condutor PE no CCM.",
    });
  }

  // ── NR-12 — Segurança em máquinas ──
  if (motors.length >= 1 && estops.length === 0) {
    f.push({
      id: "nr12-estop", norm: "NR-12", severity: "error",
      title: "Falta dispositivo de parada de emergência (E-STOP)",
      detail: "NR-12 §12.56 exige dispositivo de parada de emergência por máquina. Adicione um E-STOP categoria 0 ou 1.",
      fixHint: "Insira um E-STOP por máquina/área de operação.",
    });
  }
  if (motors.some((m) => /esteira|conveyor|prensa|press/i.test(m.label + JSON.stringify(m.params))) && lightCurtains.length === 0) {
    f.push({
      id: "nr12-curtain", norm: "NR-12", severity: "warn",
      title: "Recomendada cortina de luz em zona de risco",
      detail: "NR-12 §12.42 — proteção optoeletrônica em pontos de operação com risco mecânico.",
    });
  }

  // ── ISA-18.2 — Alarmes ──
  const hasAlarms = nodes.some((n) => n.category === "inst" && /alarm|alarme/i.test(JSON.stringify(n.params)));
  if (motors.length >= 3 && !hasAlarms) {
    f.push({
      id: "isa18-2", norm: "ISA-18.2", severity: "info",
      title: "Sem racionalização de alarmes",
      detail: "Sistemas com múltiplos motores devem definir prioridades e setpoints conforme ISA-18.2 (master alarm DB).",
    });
  }

  // ── IEC 61131 — PLC ──
  const hasPLC = nodes.some((n) => /plc|clp/i.test(n.label));
  if (motors.length >= 2 && !hasPLC) {
    f.push({
      id: "iec61131", norm: "IEC 61131", severity: "info",
      title: "PLC/CLP não identificado",
      detail: "Recomenda-se programar a lógica em LD/FBD/ST conforme IEC 61131-3 e organizar I/O.",
    });
  }

  // ── IEC 60617 — Simbologia ──
  if (breakers.length > 0 && breakers.some((b) => !b.params.curva && !b.params.curve)) {
    f.push({
      id: "iec60617", norm: "IEC 60617", severity: "info",
      title: "Curva do disjuntor não especificada",
      detail: "Defina curva (B/C/D/K/Z) em todos os disjuntores para representação correta IEC 60617.",
    });
  }

  // ── Edges órfãs ──
  for (const e of edges) {
    if (!nodes.find((n) => n.id === e.source) || !nodes.find((n) => n.id === e.target)) {
      f.push({
        id: `edge-${e.id}`, norm: "IEC 60617", severity: "warn",
        title: "Ligação com nó inexistente",
        detail: `Edge ${e.source} → ${e.target} referencia nó ausente.`,
      });
    }
  }

  return f;
}

export function summarize(findings: NormFinding[]) {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warns: findings.filter((f) => f.severity === "warn").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
}
