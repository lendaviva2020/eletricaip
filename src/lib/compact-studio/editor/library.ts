/**
 * Biblioteca completa de blocos do FB Electric Studio: toda a biblioteca IEC
 * 61131-3 do motor (antes só acessível pelo antigo editor FBD) + os blocos de
 * CLP compacto + E/S e conectores de página do Studio.
 */
import { getCompactStudioRegistry } from "../runtime/compact-blocks";
import type { CompactProgramModel } from "../domain/types";

export interface StudioLibraryEntry {
  readonly type: string;
  readonly label: string;
  readonly category: string;
  readonly description: string;
}

/** Blocos do Studio que não são definições do registry (E/S físicas e conectores). */
const STUDIO_IO_ENTRIES: readonly StudioLibraryEntry[] = [
  {
    type: "INPUT_DI",
    label: "I (DI)",
    category: "Entradas/Saídas",
    description: "Entrada digital",
  },
  { type: "INPUT_AI", label: "AI", category: "Entradas/Saídas", description: "Entrada analógica" },
  { type: "OUTPUT_QO", label: "Q (DO)", category: "Entradas/Saídas", description: "Saída digital" },
  { type: "OUTPUT_AO", label: "AQ", category: "Entradas/Saídas", description: "Saída analógica" },
  {
    type: "FLAG_M",
    label: "M",
    category: "Entradas/Saídas",
    description: "Marcador (memória) digital",
  },
  { type: "FLAG_AM", label: "AM", category: "Entradas/Saídas", description: "Marcador analógico" },
  {
    type: "PAGE_OUT",
    label: "→ Página",
    category: "Conectores",
    description: "Conector de saída para outra página",
  },
  {
    type: "PAGE_IN",
    label: "Página →",
    category: "Conectores",
    description: "Conector de entrada de outra página",
  },
];

let cache: readonly StudioLibraryEntry[] | null = null;

export function studioLibraryEntries(): readonly StudioLibraryEntry[] {
  if (cache) return cache;
  const reg = getCompactStudioRegistry();
  const fromRegistry = reg
    .list()
    .filter((d) => d.namespace !== "SYSTEM")
    .map((d) => ({
      type: d.type,
      label: d.type,
      category: String(d.category),
      description: d.description ?? "",
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.type.localeCompare(b.type));
  cache = [...STUDIO_IO_ENTRIES, ...fromRegistry];
  return cache;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Busca sem acento/caixa por tipo, rótulo, categoria ou descrição. */
export function searchStudioLibrary(query: string, limit = 40): readonly StudioLibraryEntry[] {
  const q = normalize(query.trim());
  if (!q) return [];
  return studioLibraryEntries()
    .filter((e) => normalize(`${e.type} ${e.label} ${e.category} ${e.description}`).includes(q))
    .slice(0, limit);
}

/** Entradas agrupadas por categoria (para o seletor da biblioteca). */
export function groupStudioLibrary(): ReadonlyArray<
  readonly [string, readonly StudioLibraryEntry[]]
> {
  const groups = new Map<string, StudioLibraryEntry[]>();
  for (const e of studioLibraryEntries()) {
    const g = groups.get(e.category) ?? [];
    g.push(e);
    groups.set(e.category, g);
  }
  return [...groups.entries()];
}

/**
 * Nome de instância único no programa inteiro. Antes a contagem era por tipo
 * com prefixo genérico "B": GT e TON viravam ambos "B1" (instância duplicada).
 */
export function nextUniqueInstanceName(
  model: Pick<CompactProgramModel, "nodes">,
  prefix: string,
  start: number,
): string {
  const used = new Set(model.nodes.map((n) => n.instanceName.toUpperCase()));
  let n = Math.max(1, start);
  while (used.has(`${prefix}${n}`.toUpperCase())) n++;
  return `${prefix}${n}`;
}
