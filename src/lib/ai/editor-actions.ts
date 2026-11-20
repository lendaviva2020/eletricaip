// Ações que a IA assistente pode executar em cada editor — PURO.
//
// A saída do modelo é DADO NÃO CONFIÁVEL: toda ação passa por este schema Zod
// (operandos restritos, tamanhos limitados, tipos de instrução da lista branca)
// antes de chegar a qualquer store. Ações do Ladder viram redes completas e
// válidas; nada escreve em equipamento real (regra 21) — "definir tag" só muda o
// valor simulado no editor.
import { z } from "zod";
import { emptyCell, type LadderCell, type LadderRung } from "@/lib/ladder/types";
import {
  NodeParamsSchema,
  type DiagramDoc,
  type DiagramNode,
  type NetworkSettings,
} from "@/lib/diagram/schema";
import type { Command } from "@/lib/diagram/commands";
import { markChangedUnconfirmed } from "@/lib/diagram/unconfirmed-params";

const Operand = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[A-Za-z_%][A-Za-z0-9_.%]*$/, "operando inválido");

const Contact = z.object({ kind: z.enum(["XIC", "XIO"]), operand: Operand });

const LadderOutput = z.object({
  kind: z.enum(["OTE", "OTL", "OTU", "TON", "TOF", "TP", "CTU"]),
  operand: Operand,
  preset: z.number().int().min(1).max(86_400_000).optional(),
});

export const EditorActionSchema = z.discriminatedUnion("type", [
  /** Unifilar/multifilar: mudança estrutural executada pelo motor de patch (com reparo). */
  z.object({ type: z.literal("diagram_change"), instruction: z.string().min(3).max(2000) }),
  /** Unifilar: ajusta parâmetros de UM equipamento pela tag (ex.: in_A do relé térmico). */
  z.object({
    type: z.literal("diagram_set_params"),
    tag: z.string().trim().min(1).max(40),
    params: z
      .record(
        z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/),
        z.union([z.number().finite(), z.string().max(40), z.boolean()]),
      )
      .refine((p) => Object.keys(p).length > 0 && Object.keys(p).length <= 12, "1 a 12 parâmetros")
      .refine(
        (p) => !("kind" in p) && !("unconfirmed" in p),
        "não pode trocar tipo nem confirmar valores",
      ),
  }),
  /** Unifilar: dados da rede INFORMADOS pelo usuário na conversa. */
  z.object({
    type: z.literal("diagram_set_network"),
    earthing: z.enum(["TN-S", "TN-C", "TN-C-S", "TT", "IT"]).optional(),
    utilityScc_MVA: z.number().positive().max(100_000).optional(),
    ambientTemp_C: z.number().min(10).max(80).optional(),
    overheadSupply: z.boolean().optional(),
    lightningProtection: z.boolean().optional(),
  }),
  /** Unifilar: dimensionamento determinístico NBR 5410 de todos os cabos. */
  z.object({ type: z.literal("diagram_dimension_cables") }),
  /** Ladder: valor SIMULADO de uma tag de entrada (ex.: rearmar térmico na simulação). */
  z.object({
    type: z.literal("ladder_set_tag"),
    name: Operand,
    value: z.union([z.boolean(), z.number().finite()]),
  }),
  /** Ladder: cria ou substitui uma rede (série + selo opcional + saída). */
  z.object({
    type: z.literal("ladder_upsert_rung"),
    id: z.string().max(128).optional(),
    label: z.string().min(1).max(120),
    comment: z.string().max(300).optional(),
    series: z.array(Contact).min(1).max(10),
    sealOperand: Operand.optional(),
    sealIndex: z.number().int().min(0).max(9).optional(),
    output: LadderOutput,
  }),
  z.object({ type: z.literal("ladder_remove_rung"), id: z.string().min(1).max(128) }),
  /** Ladder/Studio: volta a gerar a lógica a partir do unifilar. */
  z.object({ type: z.literal("ladder_resync_unifilar") }),
  z.object({ type: z.literal("studio_regenerate_from_unifilar") }),
  /** Abre outro editor (ex.: "o problema está no unifilar"). */
  z.object({
    type: z.literal("open_editor"),
    mode: z.enum([
      "unifilar",
      "multifilar",
      "ladder",
      "compactStudio",
      "scada",
      "plc",
      "sim",
      "alarms",
    ]),
  }),
]);

export type EditorAction = z.infer<typeof EditorActionSchema>;

export const AssistantReplySchema = z.object({
  reply: z.string().min(1).max(6000),
  actions: z.array(z.unknown()).max(20).default([]),
});

/** Valida cada ação isoladamente: inválidas são descartadas e contadas. */
export function parseActions(raw: readonly unknown[]): {
  actions: EditorAction[];
  rejected: number;
} {
  const actions: EditorAction[] = [];
  let rejected = 0;
  for (const a of raw) {
    const r = EditorActionSchema.safeParse(a);
    if (r.success) actions.push(r.data);
    else rejected++;
  }
  return { actions, rejected };
}

/** Ações permitidas em cada editor (o resto é recusado). */
export const ACTIONS_BY_EDITOR: Record<string, ReadonlySet<EditorAction["type"]>> = {
  unifilar: new Set([
    "diagram_change",
    "diagram_set_params",
    "diagram_set_network",
    "diagram_dimension_cables",
    "open_editor",
  ]),
  multifilar: new Set([
    "diagram_change",
    "diagram_set_params",
    "diagram_set_network",
    "diagram_dimension_cables",
    "open_editor",
  ]),
  ladder: new Set([
    "ladder_set_tag",
    "ladder_upsert_rung",
    "ladder_remove_rung",
    "ladder_resync_unifilar",
    "open_editor",
  ]),
  studio: new Set(["studio_regenerate_from_unifilar", "open_editor"]),
  scada: new Set(["open_editor"]),
  plc: new Set(["open_editor"]),
  sim: new Set(["open_editor"]),
  alarms: new Set(["open_editor"]),
  iec: new Set(["open_editor"]),
};

export function actionsForEditor(editor: string, actions: readonly EditorAction[]): EditorAction[] {
  const allowed = ACTIONS_BY_EDITOR[editor] ?? new Set();
  return actions.filter((a) => allowed.has(a.type));
}

// ─── Aplicação no Ladder ───────────────────────────────────────────────────

export interface LadderApplyResult {
  rungs: LadderRung[];
  tagValues: Array<{ name: string; value: boolean | number }>;
  notes: string[];
}

function buildRung(
  a: Extract<EditorAction, { type: "ladder_upsert_rung" }>,
  id: string,
): LadderRung {
  const cols = Math.max(3, a.series.length + 1);
  const row0: LadderCell[] = Array.from({ length: cols }, emptyCell);
  a.series.forEach((c, i) => (row0[i] = { kind: c.kind, operand: c.operand }));
  row0[cols - 1] = {
    kind: a.output.kind,
    operand: a.output.operand,
    ...(a.output.preset !== undefined ? { preset: a.output.preset } : {}),
  };
  const cells: LadderCell[][] = [row0];
  if (a.sealOperand) {
    const row1: LadderCell[] = Array.from({ length: cols }, emptyCell);
    const at = Math.min(a.sealIndex ?? a.series.length - 1, a.series.length - 1);
    row1[at] = { kind: "XIC", operand: a.sealOperand };
    cells.push(row1);
  }
  return { id, label: a.label, ...(a.comment ? { comment: a.comment } : {}), cols, cells };
}

/**
 * Aplica as ações do Ladder sobre as redes atuais. Rede gerada do unifilar que a
 * IA altera passa a ser do engenheiro (perde o vínculo `source`) — a
 * sincronização não a sobrescreve.
 */
export function applyLadderActions(
  rungs: readonly LadderRung[],
  actions: readonly EditorAction[],
  newId: () => string,
): LadderApplyResult {
  let next = [...rungs];
  const tagValues: LadderApplyResult["tagValues"] = [];
  const notes: string[] = [];
  for (const a of actions) {
    if (a.type === "ladder_set_tag") {
      tagValues.push({ name: a.name, value: a.value });
      notes.push(`${a.name} = ${String(a.value)} (simulação)`);
    } else if (a.type === "ladder_upsert_rung") {
      const idx = a.id ? next.findIndex((r) => r.id === a.id) : -1;
      const rung = buildRung(a, idx >= 0 ? next[idx].id : newId());
      if (idx >= 0) {
        next[idx] = rung;
        notes.push(`Rede "${a.label}" atualizada`);
      } else {
        next = [...next, rung];
        notes.push(`Rede "${a.label}" criada`);
      }
    } else if (a.type === "ladder_remove_rung") {
      const before = next.length;
      next = next.filter((r) => r.id !== a.id);
      if (next.length < before) notes.push(`Rede ${a.id} removida`);
    }
  }
  return { rungs: next, tagValues, notes };
}

// ─── Aplicação no diagrama (valores) ───────────────────────────────────────

export interface DiagramValueResult {
  /** Um único comando reversível (Ctrl+Z / "Desfazer"), ou null se nada mudou. */
  command: Command | null;
  notes: string[];
  errors: string[];
}

function findByTag(doc: DiagramDoc, tag: string): DiagramNode | undefined {
  const want = tag.trim().toUpperCase();
  return Object.values(doc.nodes).find(
    (n) =>
      n.sheet === "unifilar" &&
      [n.params.tag, n.label, n.id].some(
        (v) => typeof v === "string" && v.trim().toUpperCase() === want,
      ),
  );
}

/**
 * Ajuste de valores pela IA: cada parâmetro passa pelo schema do tipo do
 * equipamento; o que a IA mudou fica NÃO CONFIRMADO até o engenheiro conferir.
 */
export function buildDiagramValueCommand(
  doc: DiagramDoc,
  actions: readonly EditorAction[],
): DiagramValueResult {
  const commands: Command[] = [];
  const notes: string[] = [];
  const errors: string[] = [];
  for (const a of actions) {
    if (a.type === "diagram_set_params") {
      const node = findByTag(doc, a.tag);
      if (!node) {
        errors.push(`Equipamento "${a.tag}" não encontrado`);
        continue;
      }
      const merged = markChangedUnconfirmed(node.params as Record<string, unknown>, {
        ...(node.params as Record<string, unknown>),
        ...a.params,
      });
      const parsed = NodeParamsSchema.safeParse(merged);
      if (!parsed.success) {
        errors.push(`${a.tag}: ${parsed.error.issues[0]?.message ?? "valor inválido"}`);
        continue;
      }
      commands.push({
        type: "UpdateNodeParams",
        nodeId: node.id,
        from: node.params,
        to: parsed.data,
      });
      notes.push(
        `${a.tag}: ${Object.entries(a.params)
          .map(([k, v]) => `${k} = ${String(v)}`)
          .join(", ")} (a conferir)`,
      );
    } else if (a.type === "diagram_set_network") {
      const { type: _t, ...patch } = a;
      const from = doc.metadata.network;
      const to: NetworkSettings = { ...(from ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) (to as Record<string, unknown>)[k] = v;
      }
      commands.push({ type: "UpdateNetworkSettings", from, to });
      notes.push(
        `Dados da rede: ${Object.entries(patch)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k} = ${String(v)}`)
          .join(", ")}`,
      );
    }
  }
  return {
    command:
      commands.length === 0
        ? null
        : commands.length === 1
          ? commands[0]
          : { type: "Batch", commands },
    notes,
    errors,
  };
}
