/**
 * Importação do antigo editor FBD (nós/arestas React Flow em `editor.fbdNodes`)
 * para o modelo único do FB Electric Studio (`CompactProgramModel`).
 *
 * Os dois editores sempre executaram no MESMO motor (`@/lib/fbd/engine`) e na
 * mesma biblioteca de blocos; só o formato salvo era diferente. Esta função
 * leva a lógica antiga para uma página própria do Studio, sem perder blocos,
 * parâmetros, ligações nem posições.
 *
 * Idempotente: a página de destino é SUBSTITUÍDA por inteiro (nós, ligações e
 * layout dessa página), então reimportar o mesmo conteúdo não duplica nada.
 * Blocos desconhecidos e ligações com pino inexistente não são inventados:
 * entram no relatório `skipped`.
 */
import { z } from "zod";
import type {
  CompactConnection,
  CompactNode,
  CompactProgramModel,
  CompactVisualNodeLayout,
} from "../domain/types";
import { createCompactBlockNode } from "../editor/clipboard-and-layout";
import { getCompactStudioRegistry } from "../runtime/compact-blocks";

export const LEGACY_FBD_PAGE_ID = "page-fbd-importado" as const;
export const AI_FBD_PAGE_ID = "page-fbd-ia" as const;

const LegacyPinSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  type: z.string().optional(),
});

const LegacyNodeSchema = z.object({
  id: z.string().min(1),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  data: z.object({
    type: z.string().min(1),
    label: z.string().optional(),
    inputs: z.array(LegacyPinSchema).default([]),
    outputs: z.array(LegacyPinSchema).default([]),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
});

const LegacyEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export interface LegacyFbdImportReport {
  readonly importedNodes: number;
  readonly importedConnections: number;
  readonly skipped: readonly string[];
}

export interface LegacyFbdImportResult {
  readonly model: CompactProgramModel;
  readonly report: LegacyFbdImportReport;
}

/** Valor digitado no editor antigo → literal (número, BOOL ou texto como T#5s). */
function parseLegacyParam(v: string | number | boolean): string | number | boolean {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (t !== "" && /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
  return t;
}

function safeIdPart(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}

/** Pino do editor antigo (handle = id do pino) → nome IEC do pino. */
function pinName(
  pins: readonly z.infer<typeof LegacyPinSchema>[],
  handle: string | null | undefined,
): string {
  const pin = pins.find((p) => p.id === handle);
  return (pin?.label ?? handle ?? "").toUpperCase();
}

export function hasLegacyFbdContent(nodes: readonly unknown[] | undefined): boolean {
  return Array.isArray(nodes) && nodes.length > 0;
}

/**
 * Converte nós/arestas do editor antigo para uma página do Studio.
 */
export function importLegacyFbdIntoStudio(
  model: CompactProgramModel,
  rawNodes: readonly unknown[],
  rawEdges: readonly unknown[],
  opts: { readonly pageId?: string; readonly pageName?: string } = {},
): LegacyFbdImportResult {
  const pageId = opts.pageId ?? LEGACY_FBD_PAGE_ID;
  const pageName = opts.pageName ?? "FBD importado";
  const registry = getCompactStudioRegistry();
  const skipped: string[] = [];
  const prefix = `${safeIdPart(pageId)}__`;

  const legacyById = new Map<string, z.infer<typeof LegacyNodeSchema>>();
  const newNodes: CompactNode[] = [];
  const layouts: Record<string, CompactVisualNodeLayout> = {};

  for (const raw of rawNodes) {
    const parsed = LegacyNodeSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push("nó com formato inválido");
      continue;
    }
    const n = parsed.data;
    if (!registry.get(n.data.type)) {
      skipped.push(`bloco ${n.data.type} (${n.id}) não existe na biblioteca`);
      continue;
    }
    const id = `${prefix}${safeIdPart(n.id)}`;
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(n.data.params ?? {}))
      params[k.toUpperCase()] = parseLegacyParam(v);
    const node = createCompactBlockNode({
      id,
      pageId,
      blockType: n.data.type,
      instanceName: safeIdPart(n.data.label || n.id),
      params,
    });
    newNodes.push(node);
    legacyById.set(n.id, n);
    layouts[id] = { x: n.position?.x ?? 80, y: n.position?.y ?? 80 };
  }

  const nodeById = new Map(newNodes.map((n) => [n.id, n]));
  const newConnections: CompactConnection[] = [];
  for (const raw of rawEdges) {
    const parsed = LegacyEdgeSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push("ligação com formato inválido");
      continue;
    }
    const e = parsed.data;
    const src = legacyById.get(e.source);
    const dst = legacyById.get(e.target);
    const from = nodeById.get(`${prefix}${safeIdPart(e.source)}`);
    const to = nodeById.get(`${prefix}${safeIdPart(e.target)}`);
    if (!src || !dst || !from || !to) {
      skipped.push(`ligação ${e.id}: bloco de origem/destino ausente`);
      continue;
    }
    const outName = pinName(src.data.outputs, e.sourceHandle);
    const inName = pinName(dst.data.inputs, e.targetHandle);
    const outPort = from.outputs.find((p) => p.name.toUpperCase() === outName);
    const inPort = to.inputs.find((p) => p.name.toUpperCase() === inName);
    if (!outPort || !inPort) {
      skipped.push(`ligação ${e.id}: pino ${outName || "?"} → ${inName || "?"} inexistente`);
      continue;
    }
    newConnections.push({
      id: `${prefix}${safeIdPart(e.id)}`,
      pageId,
      fromNodeId: from.id,
      fromPortId: outPort.id,
      toNodeId: to.id,
      toPortId: inPort.id,
      signalType: outPort.signalType,
    });
  }

  // Substitui a página de destino por inteiro (idempotência).
  const keptNodes = model.nodes.filter((n) => n.pageId !== pageId);
  const keptNodeIds = new Set(keptNodes.map((n) => n.id));
  const removedIds = model.nodes.filter((n) => n.pageId === pageId).map((n) => n.id);
  const keptConnections = model.connections.filter((c) => c.pageId !== pageId);
  const fbdLayout = { ...model.layout.fbd };
  const ladLayout = { ...model.layout.lad };
  for (const id of removedIds) {
    delete fbdLayout[id];
    delete ladLayout[id];
  }
  const hasPage = model.pages.some((p) => p.id === pageId);
  const pages = hasPage
    ? model.pages
    : [
        ...model.pages,
        {
          id: pageId,
          name: pageName,
          order: model.pages.reduce((m, p) => Math.max(m, p.order), -1) + 1,
          description: "Lógica trazida do antigo editor FBD",
          gridCols: 24,
          gridRows: 16,
        },
      ];

  return {
    model: {
      ...model,
      pages,
      nodes: [...keptNodes, ...newNodes.filter((n) => !keptNodeIds.has(n.id))],
      connections: [...keptConnections, ...newConnections],
      layout: { ...model.layout, fbd: { ...fbdLayout, ...layouts }, lad: ladLayout },
    },
    report: {
      importedNodes: newNodes.length,
      importedConnections: newConnections.length,
      skipped,
    },
  };
}
