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
    } else {
      topology.outputs.forEach((outCell) => {
        if (!outCell.operand) {
          issues.push({
            rungId: rung.id,
            level: "error",
            code: "OUTPUT_NO_OPERAND",
            message: `Rede ${rungNumStr}: Bobina de saída sem operando atribuído.`,
            fixHint: "Clique na bobina e defina uma tag de saída (ex.: %Q0.0).",
          });
        } else {
          const arr = outputCoils.get(outCell.operand) ?? [];
          arr.push(rung.id);
          outputCoils.set(outCell.operand, arr);
        }

        // Validação de presets em temporizadores e contadores
        if (["TON", "TOF", "TP", "TONR"].includes(outCell.kind)) {
          if (!outCell.preset || outCell.preset <= 0) {
            issues.push({
              rungId: rung.id,
              level: "warn",
              code: "TIMER_NO_PRESET",
              message: `Rede ${rungNumStr}: ${outCell.kind} sem preset (PT) — irá disparar instantaneamente.`,
              fixHint: "Defina o tempo de preset (ex.: T#10s ou 1000ms).",
            });
          }
        }
        if (["CTU", "CTD", "CTUD"].includes(outCell.kind)) {
          if (!outCell.preset || outCell.preset <= 0) {
            issues.push({
              rungId: rung.id,
              level: "warn",
              code: "COUNTER_NO_PRESET",
              message: `Rede ${rungNumStr}: Contador ${outCell.kind} sem preset (PV) — saída nunca ativará.`,
              fixHint: "Defina o valor de contagem PV (ex.: 10).",
            });
          }
        }
      });
    }

    // 2. Validação de Nós e Contatos no Ramo Raiz
    let anyContactOrBlock = false;

    const checkBranch = (branch: typeof topology.rootBranch) => {
      (branch.items ?? []).forEach((item) => {
        const anyItem = item as any;
        const inst: LadderInstruction | undefined = anyItem.instruction ?? (anyItem.kind ? anyItem : undefined);

        if (inst) {
          anyContactOrBlock = true;
          if (!inst.operand && !inst.params?.IN1) {
            issues.push({
              rungId: rung.id,
              elementId: inst.id,
              level: "error",
              code: "CONTACT_NO_OPERAND",
              message: `Rede ${rungNumStr}: Elemento ${inst.kind} sem operando atribuído.`,
              fixHint: "Defina uma tag de entrada (ex.: %I0.0 ou nome de variável).",
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
