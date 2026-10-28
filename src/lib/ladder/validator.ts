// Static validation of ladder rungs — IEC 61131-3 rules and diagnostics.
// Highlights issues, syntax errors, type mismatches, and double-coil hazards.
import type { LadderRung, LadderInstruction } from "./types";
import { isOutputKind, ensureRungTopology } from "./types";

export type LadderIssueLevel = "error" | "warn" | "info";

export interface LadderIssue {
  rungId: string;
  level: LadderIssueLevel;
  code: string;
  message: string;
  fixHint?: string;
  elementId?: string;
}

export const validateRungs = (
  rungs: LadderRung[],
  tags?: Record<string, { type?: string; name?: string }>,
): LadderIssue[] => {
  const issues: LadderIssue[] = [];
  const outputCoils = new Map<string, string[]>(); // operand -> rungIds

  rungs.forEach((rung, rungIdx) => {
    const topology = ensureRungTopology(rung);
    const rungNumStr = String(rungIdx + 1).padStart(4, "0");

    // 1. Validação das Bobinas e Saídas (suporta saídas paralelas)
    if (topology.outputs.length === 0 || !topology.outputs[0]?.operand) {
      issues.push({
        rungId: rung.id,
        level: "warn",
        code: "NO_OUTPUT",
        message: `Rede ${rungNumStr} sem bobina de saída — não terá efeito no scan.`,
        fixHint: "Adicione uma bobina (OTE, OTL) ou bloco temporizador/contador.",
      });
    }

    const checkInstruction = (inst: LadderInstruction, isOutput = false) => {
      if (!isOutput) anyContactOrBlock = true;
      if (!inst.operand && !inst.params?.IN1 && !inst.params?.IN && !inst.params?.OUT) {
        issues.push({
          rungId: rung.id,
          elementId: inst.id,
          level: "error",
          code: isOutput ? "OUTPUT_NO_OPERAND" : "CONTACT_NO_OPERAND",
          message: `Rede ${rungNumStr}: Elemento ${inst.kind} sem operando atribuído.`,
          fixHint: "Defina uma tag de saída/entrada (ex.: %Q0.0 ou nome de variável).",
        });
      }

      // Validação de presets em temporizadores e contadores
      if (["TON", "TOF", "TP", "TONR"].includes(inst.kind)) {
        if (!inst.preset || inst.preset <= 0) {
          issues.push({
            rungId: rung.id,
            level: "warn",
            code: "TIMER_NO_PRESET",
            message: `Rede ${rungNumStr}: ${inst.kind} sem preset (PT) — irá disparar instantaneamente.`,
            fixHint: "Defina o tempo de preset (ex.: T#10s ou 1000ms).",
          });
        }
      }
      if (["CTU", "CTD", "CTUD"].includes(inst.kind)) {
        if (!inst.preset || inst.preset <= 0) {
          issues.push({
            rungId: rung.id,
            level: "warn",
            code: "COUNTER_NO_PRESET",
            message: `Rede ${rungNumStr}: Contador ${inst.kind} sem preset (PV) — saída nunca ativará.`,
            fixHint: "Defina o valor de contagem PV (ex.: 10).",
          });
        }
      }

      // Validação de operandos obrigatórios em blocos lógicos
      if (["AND", "OR", "XOR"].includes(inst.kind)) {
        if (!inst.params?.IN1 || !inst.params?.IN2) {
          issues.push({
            rungId: rung.id,
            elementId: inst.id,
            level: "warn",
            code: "LOGIC_MISSING_OPERAND",
            message: `Rede ${rungNumStr}: Bloco ${inst.kind} requer operandos configurados em IN1 e IN2.`,
            fixHint: "Configure os operandos de entrada no painel de propriedades.",
          });
        }
      }

      // Validação de erros estáticos matemáticos (Divisão por zero, raiz negativa)
      if (inst.kind === "DIV" && inst.params?.IN2 !== undefined && Number(inst.params?.IN2) === 0) {
        issues.push({
          rungId: rung.id,
          elementId: inst.id,
          level: "error",
          code: "DIV_BY_ZERO",
          message: `Rede ${rungNumStr}: Divisão por zero detectada no divisor do bloco DIV.`,
          fixHint: "Altere o divisor para um valor diferente de zero.",
        });
      }
      if (inst.kind === "MOD" && inst.params?.IN2 !== undefined && Number(inst.params?.IN2) === 0) {
        issues.push({
          rungId: rung.id,
          elementId: inst.id,
          level: "error",
          code: "MOD_BY_ZERO",
          message: `Rede ${rungNumStr}: Módulo por zero detectado no divisor do bloco MOD.`,
          fixHint: "Altere o divisor para um valor diferente de zero.",
        });
      }
      if (inst.kind === "SQRT" && inst.params?.IN1 !== undefined && Number(inst.params?.IN1) < 0) {
        issues.push({
          rungId: rung.id,
          elementId: inst.id,
          level: "error",
          code: "SQRT_NEGATIVE",
          message: `Rede ${rungNumStr}: Raiz quadrada de operando negativo no bloco SQRT.`,
          fixHint: "Certifique-se de que o radicando seja maior ou igual a zero.",
        });
      }

      // Verificação de tipos incompatíveis em comparadores
      if (inst.kind.startsWith("CMP_") || ["GT", "LT", "GE", "LE", "EQ", "NE"].includes(inst.kind)) {
        const in1 = String(inst.params?.IN1 ?? inst.operand ?? "");
        const in2 = String(inst.params?.IN2 ?? "");
        if (tags && in1 && in2) {
          const t1 = tags[in1]?.type;
          const t2 = tags[in2]?.type;
          if (t1 && t2 && t1 !== t2) {
            issues.push({
              rungId: rung.id,
              elementId: inst.id,
              level: "warn",
              code: "TYPE_MISMATCH",
              message: `Aviso na Rede ${rungNumStr}: Comparador ${inst.operand || inst.id} usando tipos de dados diferentes (${t1} e ${t2}).`,
              fixHint: `Alinhe os tipos ou converta uma das variáveis para que ambas sejam compatíveis.`,
            });
          }
        }
      }
    };

    topology.outputs.forEach((outCell) => {
      if (outCell.operand) {
        const arr = outputCoils.get(outCell.operand) ?? [];
        arr.push(rung.id);
        outputCoils.set(outCell.operand, arr);
      }
      checkInstruction(outCell, true);
    });

    // 2. Validação de Nós e Contatos no Ramo Raiz
    let anyContactOrBlock = false;

    const checkBranch = (branch: typeof topology.rootBranch) => {
      (branch.items ?? []).forEach((item) => {
        const anyItem = item as any;
        const inst: LadderInstruction | undefined = anyItem.instruction ?? (anyItem.kind ? anyItem : undefined);

        if (inst) {
          checkInstruction(inst, false);
        } else if (anyItem.branches) {
          anyItem.branches.forEach(checkBranch);
        } else if (anyItem.items) {
          checkBranch(anyItem);
        }
      });
    };

    checkBranch(topology.rootBranch);

    if (!anyContactOrBlock && topology.outputs.length > 0 && topology.outputs[0]?.operand) {
      issues.push({
        rungId: rung.id,
        level: "warn",
        code: "NO_INPUT",
        message: `Rede ${rungNumStr} sem contatos de comando — energização ligada direto ao trilho.`,
      });
    }
  });

  // 3. Detecção de bobina duplicada (Double-Coil Hazard)
  outputCoils.forEach((rungIds, operand) => {
    if (rungIds.length > 1) {
      rungIds.forEach((id) =>
        issues.push({
          rungId: id,
          level: "warn",
          code: "DUPLICATE_COIL",
          message: `Operando "${operand}" é escrito em ${rungIds.length} redes — risco de sobrescrita (double-coil).`,
          fixHint: "Utilize contatos em paralelo (OR/selo) na mesma rede ou bobinas OTL/OTU.",
        }),
      );
    }
  });

  return issues;
};
