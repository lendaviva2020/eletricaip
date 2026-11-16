/**
 * Structured Text (IEC 61131-3) do programa do FB Electric Studio.
 *
 * Usa o mesmo caminho de execução da simulação: `compileCompactProgram`
 * (modelo → FbdDocument) e o gerador de ST do motor. Com `pageId`, gera só
 * uma página — usado pelos blocos FBD do editor de CLP, em que cada bloco
 * corresponde a uma página do Studio.
 */
import { generateStructuredText } from "@/lib/fbd/engine";
import type { CompactProgramModel } from "../domain/types";
import { compileCompactProgram } from "./compact-compiler";
import { getCompactStudioRegistry } from "./compact-blocks";

export interface StudioStResult {
  readonly code: string;
  readonly blockCount: number;
  readonly diagnostics: readonly string[];
}

function sanitizeProgramName(raw: string): string {
  // "Página 1" → "Pagina_1" (translitera acentos antes de trocar o resto por "_").
  const s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(s) ? s : `P_${s}`;
}

/** Recorta o modelo para uma página (nós, ligações e a própria página). */
export function restrictModelToPage(
  model: CompactProgramModel,
  pageId: string,
): CompactProgramModel {
  return {
    ...model,
    pages: model.pages.filter((p) => p.id === pageId),
    nodes: model.nodes.filter((n) => n.pageId === pageId),
    connections: model.connections.filter((c) => c.pageId === pageId),
  };
}

export function studioToStructuredText(
  model: CompactProgramModel,
  opts: { readonly pageId?: string; readonly programName?: string } = {},
): StudioStResult {
  const scoped = opts.pageId ? restrictModelToPage(model, opts.pageId) : model;
  const { fbdDocument, compileResult } = compileCompactProgram(scoped);
  const named = { ...fbdDocument, name: sanitizeProgramName(opts.programName ?? fbdDocument.name) };
  // Registry do Studio (IEC + blocos de CLP compacto); o padrão do gerador só tem IEC.
  const st = generateStructuredText(named, getCompactStudioRegistry());
  const diagnostics = compileResult.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.message);
  return { code: st.code, blockCount: scoped.nodes.length, diagnostics };
}
