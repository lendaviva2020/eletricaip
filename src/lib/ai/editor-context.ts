// Contexto do editor para a IA assistente — PURO.
//
// Cada editor tem a sua conversa e o seu contexto: a IA recebe o estado REAL do
// que o engenheiro está vendo (diagnósticos, redes, tags, alarmes) em texto
// compacto e limitado, e responde/age sobre ELE. Nada aqui é inventado: sem
// dado, o contexto diz "não informado".
import type { DiagramDoc } from "@/lib/diagram/schema";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { nodeDisplayName } from "@/lib/diagram/connection/cable-sizing";
import type { LadderCell, LadderRung } from "@/lib/ladder/types";
import { isOutputKind, rungCols } from "@/lib/ladder/types";
import type { EditorTag } from "@/lib/editor/store";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import { validateCompactProgram } from "@/lib/compact-studio/domain/validation";

export type AssistantEditor =
  "unifilar" | "multifilar" | "ladder" | "studio" | "scada" | "plc" | "sim" | "alarms" | "iec";

export const ASSISTANT_EDITORS: readonly AssistantEditor[] = [
  "unifilar",
  "multifilar",
  "ladder",
  "studio",
  "scada",
  "plc",
  "sim",
  "alarms",
  "iec",
];

/** Modo do workspace → conversa do assistente (FBD é o FB Electric Studio). */
export function editorKeyFromMode(mode: string): AssistantEditor {
  switch (mode) {
    case "unifilar":
    case "multifilar":
    case "ladder":
    case "scada":
    case "plc":
    case "sim":
    case "alarms":
      return mode;
    case "fbd":
    case "compactStudio":
      return "studio";
    default:
      return "iec";
  }
}

export interface EditorIssue {
  severity: "error" | "warning";
  text: string;
}

export interface EditorContext {
  editor: AssistantEditor;
  /** Texto enviado à IA (limitado a MAX_CONTEXT_CHARS). */
  summary: string;
  /** Problemas atuais do editor (exibidos no chat e enviados à IA). */
  issues: EditorIssue[];
}

export const MAX_CONTEXT_CHARS = 18_000;

function clip(text: string): string {
  return text.length > MAX_CONTEXT_CHARS
    ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n[… contexto truncado]`
    : text;
}

function fmtParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([k, v]) => k !== "kind" && k !== "tag" && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(",")}]` : String(v)}`)
    .join(" ");
}

// ─── Unifilar / multifilar ─────────────────────────────────────────────────

export function buildDiagramContext(
  doc: DiagramDoc,
  sheet: "unifilar" | "multifilar",
): EditorContext {
  const issues: EditorIssue[] = [];
  let diag: ReturnType<typeof runDiagramDiagnostics> = [];
  try {
    diag = runDiagramDiagnostics(doc);
  } catch {
    diag = [];
  }
  for (const d of diag) {
    if (d.type === "ERRO") issues.push({ severity: "error", text: d.message });
    else if (d.type === "AVISO") issues.push({ severity: "warning", text: d.message });
  }
  const nodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  const lines: string[] = [];
  lines.push(`EDITOR: ${sheet === "unifilar" ? "Diagrama unifilar" : "Diagrama multifilar"}`);
  const net = doc.metadata.network;
  lines.push(
    `Dados da rede: aterramento=${net?.earthing ?? "não informado"}; Scc concessionária=${net?.utilityScc_MVA ?? "não informado"} MVA; temperatura=${net?.ambientTemp_C ?? "não informada"} °C; alimentação aérea=${net?.overheadSupply ?? "não informado"}; SPDA=${net?.lightningProtection ?? "não informado"}`,
  );
  lines.push(`Equipamentos (${nodes.length}):`);
  for (const n of nodes.slice(0, 120)) {
    lines.push(
      `- id=${n.id} tag=${nodeDisplayName(n)} tipo=${n.params.kind} ${fmtParams(n.params as Record<string, unknown>)}`,
    );
  }
  const edges = Object.values(doc.edges).filter((e) => e.sheet === "unifilar");
  lines.push(`Ligações (${edges.length}):`);
  for (const e of edges.slice(0, 160)) {
    const c = e.cable;
    lines.push(
      `- ${nodeDisplayName(doc.nodes[e.source])} → ${nodeDisplayName(doc.nodes[e.target])} [${e.kind}]${c ? ` cabo ${c.section_mm2 ?? "?"} mm² ${c.length_m ?? "?"} m ${c.installation ?? ""}` : ""}`,
    );
  }
  lines.push(`Diagnóstico (${issues.length}):`);
  for (const i of issues.slice(0, 80))
    lines.push(`- [${i.severity === "error" ? "ERRO" : "AVISO"}] ${i.text}`);
  return { editor: sheet, summary: clip(lines.join("\n")), issues };
}

// ─── Ladder ────────────────────────────────────────────────────────────────

function tagValue(
  tags: Record<string, EditorTag>,
  name: string,
): boolean | number | string | undefined {
  const t = tags[name] ?? Object.values(tags).find((x) => x.name === name);
  return t?.value;
}

function cellText(c: LadderCell): string {
  if (c.kind === "EMPTY") return "";
  return `${c.kind} ${c.operand}${c.preset !== undefined ? ` (${c.preset} ms)` : ""}`;
}

/** Contato que bloqueia a passagem com os valores atuais das tags. */
function blocking(c: LadderCell, tags: Record<string, EditorTag>): string | null {
  if (c.kind !== "XIC" && c.kind !== "XIO") return null;
  const v = Boolean(tagValue(tags, c.operand));
  if (c.kind === "XIC" && !v) return `${c.operand}=0 (contato NA aberto)`;
  if (c.kind === "XIO" && v) return `${c.operand}=1 (contato NF aberto)`;
  return null;
}

export function buildLadderContext(
  rungs: readonly LadderRung[],
  tags: Record<string, EditorTag>,
  syncWarnings: readonly string[] = [],
): EditorContext {
  const issues: EditorIssue[] = [];
  const lines: string[] = ["EDITOR: Ladder (IEC 61131-3 LD)", `Redes (${rungs.length}):`];
  for (const r of rungs.slice(0, 80)) {
    const cols = rungCols(r);
    const series = (r.cells[0] ?? [])
      .slice(0, cols - 1)
      .map(cellText)
      .filter(Boolean);
    const parallel = r.cells
      .slice(1)
      .map((row) =>
        row
          .slice(0, cols - 1)
          .map(cellText)
          .filter(Boolean)
          .join(" "),
      )
      .filter(Boolean);
    const outs = r.cells
      .map((row) => row[cols - 1])
      .filter((c): c is LadderCell => !!c && isOutputKind(c.kind) && !!c.operand);
    const origin = r.source?.kind === "unifilar" ? " (gerada do unifilar)" : "";
    lines.push(
      `- id=${r.id}${origin} "${r.label}": série [${series.join(" | ")}]${parallel.length ? ` paralelo [${parallel.join(" ; ")}]` : ""} → ${outs.map(cellText).join(", ") || "sem saída"}`,
    );
    // Por que a saída está desligada (com os valores atuais das tags)?
    const blockers = (r.cells[0] ?? [])
      .slice(0, cols - 1)
      .map((c) => blocking(c, tags))
      .filter((b): b is string => !!b);
    for (const o of outs) {
      const on = Boolean(tagValue(tags, o.operand));
      if (/_FALHA$/i.test(o.operand) && on) {
        issues.push({
          severity: "error",
          text: `${o.operand} ativo — proteção atuada (${(r.cells.map((row) => row[0]).filter(Boolean) as LadderCell[]).map((c) => `${c.operand}=${tagValue(tags, c.operand) ? 1 : 0}`).join(", ")}).`,
        });
      }
    }
    if (blockers.length && outs.some((o) => o.kind === "OTE" && !/_FALHA$/i.test(o.operand))) {
      lines.push(`  bloqueada agora por: ${blockers.join(", ")}`);
    }
  }
  const tagList = Object.values(tags);
  lines.push(`Tags (${tagList.length}):`);
  for (const t of tagList.slice(0, 200)) {
    lines.push(
      `- ${t.name} ${t.type}${t.direction ? ` ${t.direction}` : ""} = ${String(t.value)}${t.forced ? " (forçada)" : ""}`,
    );
  }
  for (const w of syncWarnings) issues.push({ severity: "warning", text: w });
  if (issues.length) {
    lines.push(`Problemas (${issues.length}):`);
    for (const i of issues) lines.push(`- ${i.text}`);
  }
  return { editor: "ladder", summary: clip(lines.join("\n")), issues };
}

// ─── FB Electric Studio ───────────────────────────────────────────────────

export function buildStudioContext(program: CompactProgramModel | undefined): EditorContext {
  if (!program) {
    return { editor: "studio", summary: "EDITOR: FB Electric Studio\nPrograma vazio.", issues: [] };
  }
  const issues: EditorIssue[] = [];
  try {
    for (const d of validateCompactProgram(program).diagnostics) {
      issues.push({ severity: d.severity === "error" ? "error" : "warning", text: d.message });
    }
  } catch {
    /* validação indisponível: segue sem diagnóstico */
  }
  const lines = ["EDITOR: FB Electric Studio (FBD/LAD IEC 61131-3)"];
  for (const p of program.pages) {
    const nodes = program.nodes.filter((n) => n.pageId === p.id);
    lines.push(`Página "${p.name}" (id=${p.id}, ${nodes.length} blocos):`);
    for (const n of nodes.slice(0, 60)) lines.push(`- ${n.instanceName} ${n.blockType}`);
  }
  lines.push(`Símbolos (${program.ioSymbols.length}):`);
  for (const s of program.ioSymbols.slice(0, 150)) {
    lines.push(`- ${s.symbolicName} ${s.ioKind} ${s.address}${s.comment ? ` — ${s.comment}` : ""}`);
  }
  lines.push(`Diagnóstico (${issues.length}):`);
  for (const i of issues.slice(0, 60)) lines.push(`- [${i.severity}] ${i.text}`);
  return { editor: "studio", summary: clip(lines.join("\n")), issues };
}

// ─── SCADA / alarmes ─────────────────────────────────────────────────────

export interface AlarmLike {
  id: string;
  message?: string;
  priority?: string | number;
  state?: string;
  category?: string;
}

export function buildAlarmsContext(
  editor: "scada" | "alarms" | "sim",
  alarms: readonly AlarmLike[],
  extra: readonly string[] = [],
): EditorContext {
  const issues: EditorIssue[] = alarms.slice(0, 60).map((a) => ({
    severity: "error" as const,
    text: `${a.id}${a.message ? ` — ${a.message}` : ""}${a.state ? ` [${a.state}]` : ""}`,
  }));
  const lines = [
    `EDITOR: ${editor === "scada" ? "SCADA/HMI supervisório" : editor === "alarms" ? "Alarmes (ISA-18.2)" : "Simulação"}`,
    `Alarmes ativos (${alarms.length}):`,
    ...issues.map((i) => `- ${i.text}`),
    ...extra,
  ];
  return { editor, summary: clip(lines.join("\n")), issues };
}

export function buildGenericContext(
  editor: AssistantEditor,
  extra: readonly string[],
): EditorContext {
  return { editor, summary: clip([`EDITOR: ${editor}`, ...extra].join("\n")), issues: [] };
}
