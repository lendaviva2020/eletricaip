// Verificação por simulação do interlock de E-STOP.
// Usa scanRungsPure (núcleo puro do scan-cycle) com tags sintéticas — sem store.
import type { LadderRung } from "./types";
import { isOutputKind } from "./types";
import { scanRungsPure, createScanState, type PureTags } from "./scan-core";
import type { IndustrialNode, IndustrialEdge } from "@/lib/project-store";

export interface LogicFinding {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  detail: string;
  fixHint?: string;
}

const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Candidatos de nome de tag para um nó (params.tag/operand/address, id, label). */
const operandCandidates = (node: IndustrialNode): string[] => {
  const p = (node.params ?? {}) as Record<string, unknown>;
  const raw = [p.tag, p.operand, p.address, p.coil, node.id, node.label]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((v) => norm(v as string));
  return Array.from(new Set(raw));
};

const outputCellOf = (rung: LadderRung) => {
  const row = rung.cells[0] ?? [];
  const cell = row[row.length - 1];
  return cell && isOutputKind(cell.kind) && cell.operand ? cell : undefined;
};

/** Encontra o rung cuja bobina corresponde a um dos candidatos do nó. */
const findCoilRung = (rungs: LadderRung[], candidates: string[]) =>
  rungs.find((r) => {
    const out = outputCellOf(r);
    if (!out) return false;
    const op = norm(out.operand);
    return candidates.some((c) => c.length >= 2 && (op === c || op.includes(c) || c.includes(op)));
  });

/** Simula um rung com todos os XIC em true e o operando do E-STOP no valor dado. */
const simulate = (rung: LadderRung, coilOperand: string, estopOperand: string, estop: boolean) => {
  const tags: PureTags = {};
  for (const row of rung.cells) {
    for (const cell of row) {
      if (cell.kind === "XIC" && cell.operand) tags[cell.operand] = true;
      if (cell.kind === "XIO" && cell.operand) tags[cell.operand] = false;
    }
  }
  if (estopOperand) tags[estopOperand] = estop;
  const { tags: after } = scanRungsPure([rung], tags, createScanState(), 0);
  return Boolean(after[coilOperand]);
};

export function verifyEstopInterlock(
  rungs: LadderRung[],
  nodes: IndustrialNode[],
  edges: IndustrialEdge[],
): LogicFinding[] {
  const findings: LogicFinding[] = [];
  const estops = nodes.filter((n) => n.kind === "estop");
  const motors = nodes.filter((n) => n.kind === "motor");
  if (estops.length === 0 || motors.length === 0) return findings;

  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const estop of estops) {
    // Motores que o E-STOP deveria proteger: alcançáveis pelas edges (1..2 saltos).
    const direct = edges.filter((e) => e.source === estop.id).map((e) => e.target);
    const hop2 = edges.filter((e) => direct.includes(e.source)).map((e) => e.target);
    const reachable = new Set([...direct, ...hop2]);
    const protectedMotors = motors.filter((m) => reachable.has(m.id));
    const targets = protectedMotors.length > 0 ? protectedMotors : motors;

    const estopCandidates = operandCandidates(estop);

    for (const motor of targets) {
      // Contator do motor (edge de potência contator → motor), senão o próprio motor.
      const contactor = edges
        .filter((e) => e.target === motor.id)
        .map((e) => byId.get(e.source))
        .find((n) => n && (n.kind === "contactor" || n.kind === "relay"));
      const coilNode = contactor ?? motor;
      const coilCandidates = operandCandidates(coilNode);

      const rung = findCoilRung(rungs, coilCandidates);
      if (!rung) {
        findings.push({
          id: `logic-estop-missing-${estop.id}-${motor.id}`,
          severity: "error",
          title: `Sem lógica de interlock para ${motor.label || motor.id}`,
          detail: `Não existe rung acionando a bobina de ${coilNode.label || coilNode.id} no plcLogic, portanto o E-STOP ${estop.label || estop.id} não pode ser verificado por simulação.`,
          fixHint: `Emita em plcLogic.rungs um rung com a entrada do E-STOP ${estop.label || estop.id} (contato NF físico, lido com XIC: 1 = íntegra) em série com o comando de partida, energizando a bobina (OTE) de ${coilNode.label || coilNode.id}.`,
        });
        continue;
      }

      const out = outputCellOf(rung)!;
      const coilOperand = out.operand;

      // Descobre qual operando do rung representa o E-STOP.
      const rungOperands = rung.cells.flat().map((c) => c.operand);
      const estopOperand =
        rungOperands.find((op) => {
          const n = norm(op);
          return (
            n.length >= 2 &&
            estopCandidates.some(
              (c) => n === c || n.includes(c) || c.includes(n) || /ESTOP|EMERG/.test(n),
            )
          );
        }) ?? estopCandidates[0];

      // Polaridade do E-STOP lida no próprio rung:
      //  • XIC → convenção fail-safe (contato NF físico, 1 = cadeia íntegra).
      //    Liberado = true; acionado ou fio rompido = false.
      //  • XIO → sinal "1 = acionado" (exige contato NA na botoeira: fio
      //    rompido NÃO para a máquina). Simulado coerentemente, mas avisado.
      const estopCell = rung.cells.flat().find((c) => c.operand === estopOperand);
      const failSafe = estopCell?.kind === "XIC";
      const releasedValue = failSafe;
      const energizedSafe = simulate(rung, coilOperand, estopOperand, releasedValue);
      const energizedTripped = simulate(rung, coilOperand, estopOperand, !releasedValue);

      if (energizedTripped) {
        findings.push({
          id: `logic-estop-nointerlock-${estop.id}-${motor.id}`,
          severity: "error",
          title: `E-STOP não desliga ${motor.label || motor.id}`,
          detail: `Simulação do rung "${rung.label}": com o E-STOP ${estop.label || estop.id} acionado, a bobina ${coilOperand} de ${coilNode.label || coilNode.id} permaneceu energizada.`,
          fixHint: `Coloque o E-STOP (${estopOperand}) em SÉRIE com o comando de partida, na mesma linha que energiza a bobina ${coilOperand}: entrada do contato NF físico lida com XIC (1 = cadeia íntegra).`,
        });
      } else if (!energizedSafe) {
        findings.push({
          id: `logic-estop-nostart-${estop.id}-${motor.id}`,
          severity: "warn",
          title: `Partida de ${motor.label || motor.id} não energiza na simulação`,
          detail: `Simulação do rung "${rung.label}": com o E-STOP liberado e o comando de partida ativo, a bobina ${coilOperand} não energizou.`,
          fixHint: `Revise a lógica do rung: o comando de partida deve energizar a bobina ${coilOperand} quando o E-STOP está liberado.`,
        });
      } else if (!failSafe) {
        findings.push({
          id: `logic-estop-polarity-${estop.id}-${motor.id}`,
          severity: "warn",
          title: `E-STOP de ${motor.label || motor.id} não é à prova de falha`,
          detail: `O rung "${rung.label}" lê o E-STOP com XIO (sinal 1 = acionado), o que exige botoeira NA: fio rompido ou borne solto NÃO param a máquina.`,
          fixHint: `Use o contato NF físico da botoeira (1 = cadeia íntegra) e leia com XIC em série (NR-12 / IEC 60204-1 §9.4.2). A parada de emergência também precisa de circuito físico cabeado — o CLP não a substitui.`,
        });
      }
    }
  }

  return findings;
}
