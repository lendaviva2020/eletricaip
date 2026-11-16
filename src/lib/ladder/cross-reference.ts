/**
 * Referência cruzada do Ladder por OPERANDO (tag/endereço): onde cada bobina é
 * escrita e onde seus contatos NA/NF são lidos — a "imagem de contatos" que o
 * eletricista procura ao depurar um programa.
 *
 * Verificações (sem inventar intenção do usuário):
 *  - erro: bobina dupla (OTE do mesmo operando em 2+ lugares — a última vence
 *    a cada varredura e a primeira fica sem efeito);
 *  - aviso: contato lido mas nunca escrito, quando NÃO é entrada física
 *    (%I…, I0.0 ou tag declarada como entrada) — normalmente esquecimento;
 *  - aviso: SET sem RESET (retenção que nunca é desligada);
 *  - info: bobina escrita e nunca lida (pode ser saída física — só informa).
 */
import { extractLadderUsages, type LogicUsage } from "@/lib/documentation/cross-reference";

export interface LadderXrefRow {
  readonly operand: string;
  readonly coils: readonly string[];
  readonly sets: readonly string[];
  readonly resets: readonly string[];
  readonly contactsNo: readonly string[];
  readonly contactsNc: readonly string[];
}

export type LadderXrefIssueKind =
  "double_coil" | "read_never_written" | "set_without_reset" | "written_never_read";

export interface LadderXrefIssue {
  readonly kind: LadderXrefIssueKind;
  readonly severity: "error" | "warning" | "info";
  readonly operand: string;
  readonly message: string;
}

export interface LadderXref {
  readonly rows: readonly LadderXrefRow[];
  readonly issues: readonly LadderXrefIssue[];
}

const INPUT_ADDRESS_RE = /^%?I[XWBD]?\d/i;

function isPhysicalInput(operand: string, inputTags: ReadonlySet<string>): boolean {
  return INPUT_ADDRESS_RE.test(operand) || inputTags.has(operand.toUpperCase());
}

function uniqueSorted(list: string[]): string[] {
  return [...new Set(list)].sort((a, b) => {
    const na = Number(/\d+/.exec(a)?.[0] ?? 0);
    const nb = Number(/\d+/.exec(b)?.[0] ?? 0);
    return na - nb || a.localeCompare(b);
  });
}

export function buildLadderXrefFromUsages(
  usages: readonly LogicUsage[],
  opts: { readonly inputTags?: ReadonlySet<string> } = {},
): LadderXref {
  const inputTags = opts.inputTags ?? new Set<string>();
  const byOperand = new Map<
    string,
    { label: string; coil: string[]; set: string[]; reset: string[]; no: string[]; nc: string[] }
  >();
  for (const u of usages) {
    const key = u.operand.trim().toUpperCase();
    if (!key) continue;
    const entry = byOperand.get(key) ?? {
      label: u.operand.trim(),
      coil: [],
      set: [],
      reset: [],
      no: [],
      nc: [],
    };
    entry[u.role].push(u.location);
    byOperand.set(key, entry);
  }

  const rows: LadderXrefRow[] = [];
  const issues: LadderXrefIssue[] = [];
  for (const e of [...byOperand.values()].sort((a, b) => a.label.localeCompare(b.label))) {
    const row: LadderXrefRow = {
      operand: e.label,
      coils: uniqueSorted(e.coil),
      sets: uniqueSorted(e.set),
      resets: uniqueSorted(e.reset),
      contactsNo: uniqueSorted(e.no),
      contactsNc: uniqueSorted(e.nc),
    };
    rows.push(row);
    const writes = e.coil.length + e.set.length + e.reset.length;
    const reads = e.no.length + e.nc.length;
    // Conta REDES distintas: a mesma bobina aparece duas vezes na estrutura de
    // uma rede (grade de células + topologia), o que não é bobina dupla.
    if (row.coils.length > 1) {
      issues.push({
        kind: "double_coil",
        severity: "error",
        operand: e.label,
        message: `Bobina dupla: ${e.label} é escrita em ${row.coils.join(", ")} — só a última vale a cada varredura.`,
      });
    }
    if (reads > 0 && writes === 0 && !isPhysicalInput(e.label, inputTags)) {
      issues.push({
        kind: "read_never_written",
        severity: "warning",
        operand: e.label,
        message: `${e.label} é lido (contato) mas nenhuma bobina o escreve. Se for botão/sensor, declare-o como entrada (%I) na tabela de tags.`,
      });
    }
    if (e.set.length > 0 && e.reset.length === 0) {
      issues.push({
        kind: "set_without_reset",
        severity: "warning",
        operand: e.label,
        message: `${e.label} é retido (SET em ${row.sets.join(", ")}) e nunca é desligado (sem RESET).`,
      });
    }
    if (writes > 0 && reads === 0) {
      issues.push({
        kind: "written_never_read",
        severity: "info",
        operand: e.label,
        message: `${e.label} é escrito e não é lido no programa (normal se for saída física).`,
      });
    }
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.operand.localeCompare(b.operand),
  );
  return { rows, issues };
}

export function buildLadderXref(
  rungs: readonly unknown[],
  opts: { readonly inputTags?: ReadonlySet<string> } = {},
): LadderXref {
  return buildLadderXrefFromUsages(extractLadderUsages(rungs), opts);
}
