// Folhas de desenho (páginas) e carimbo da prancha.
//
// Regras:
//  * A folha é só ORGANIZAÇÃO do desenho: a topologia elétrica (cálculos,
//    diagnóstico, reparo, CCM, Ladder) continua sendo um único grafo que
//    atravessa as folhas — como num CAE elétrico de várias páginas.
//  * Ligação entre equipamentos de folhas diferentes vira REFERÊNCIA CRUZADA
//    ("→ Q1 /2.4": equipamento, folha e coluna da zona na outra folha).
//  * Moldura e zonas pelos formatos ABNT NBR 10068 / ISO 5457 (paisagem).
//  * Carimbo (NBR 10582): só o que o usuário informou; campo vazio fica em branco.
import { findPort, getPorts, rotatePort } from "./render/ports";
import type {
  DiagramDoc,
  DiagramEdge,
  DiagramNode,
  DrawingFormat,
  DrawingPage,
  DrawingSetup,
  SheetKind,
  TitleBlock,
} from "./schema";

/** Folha de quem não declarou nenhuma (e de nós sem `page`). */
export const DEFAULT_PAGE_ID = "p1";

/** Escala do desenho na tela: px do canvas por mm da folha. */
export const PX_PER_MM = 4;

/** Formatos em paisagem (mm) e zonas (colunas × linhas, ~50 mm — ISO 5457). */
export const DRAWING_FORMATS: Record<
  DrawingFormat,
  { widthMm: number; heightMm: number; columns: number; rows: number }
> = {
  A4: { widthMm: 297, heightMm: 210, columns: 6, rows: 4 },
  A3: { widthMm: 420, heightMm: 297, columns: 8, rows: 6 },
  A2: { widthMm: 594, heightMm: 420, columns: 12, rows: 8 },
  A1: { widthMm: 841, heightMm: 594, columns: 16, rows: 12 },
};

/** Margens da moldura (mm): 20 à esquerda para encadernação, 10 nas demais (NBR 10068). */
const MARGIN_LEFT_MM = 20;
const MARGIN_MM = 10;
/** Carimbo: 180 × 56 mm no canto inferior direito (NBR 10582: largura ≈ 178 mm). */
export const TITLE_BLOCK_MM = { width: 180, height: 56 };
/** Faixa externa das zonas (mm) onde ficam os números das colunas e as letras das linhas. */
const ZONE_BAND_MM = 5;

export const DEFAULT_DRAWING_SETUP: DrawingSetup = {
  format: "A3",
  showFrame: true,
  pages: [],
  titleBlock: {},
};

export function drawingSetupOf(doc: DiagramDoc): DrawingSetup {
  const d = doc.metadata.drawing;
  if (!d) return DEFAULT_DRAWING_SETUP;
  return {
    format: d.format ?? "A3",
    showFrame: d.showFrame ?? true,
    pages: d.pages ?? [],
    titleBlock: d.titleBlock ?? {},
  };
}

export function pageIdOf(node: Pick<DiagramNode, "page">): string {
  return node.page ?? DEFAULT_PAGE_ID;
}

/**
 * Folhas de um tipo de diagrama, ordenadas por número. Inclui as declaradas e
 * as usadas por nós (o multifilar herda a folha do unifilar de mesmo id).
 * Sempre devolve ao menos a folha 1.
 */
export function listPages(doc: DiagramDoc, sheet: SheetKind): DrawingPage[] {
  const declared = drawingSetupOf(doc).pages;
  const byId = new Map<string, DrawingPage>();
  for (const p of declared) if (p.sheet === sheet) byId.set(p.id, p);

  const used = new Set<string>();
  for (const n of Object.values(doc.nodes)) if (n.sheet === sheet) used.add(pageIdOf(n));
  used.add(DEFAULT_PAGE_ID);

  for (const id of used) {
    if (byId.has(id)) continue;
    const mirror = declared.find((p) => p.id === id);
    byId.set(id, {
      id,
      sheet,
      number: mirror?.number ?? (id === DEFAULT_PAGE_ID ? 1 : nextFreeNumber(byId)),
      title: mirror?.title ?? "",
    });
  }
  return [...byId.values()].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
}

function nextFreeNumber(pages: Map<string, DrawingPage>): number {
  const taken = new Set([...pages.values()].map((p) => p.number));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/** Id novo, sem colidir com as folhas existentes de qualquer tipo. */
export function newPageId(doc: DiagramDoc): string {
  const ids = new Set<string>([DEFAULT_PAGE_ID]);
  for (const p of drawingSetupOf(doc).pages) ids.add(p.id);
  for (const n of Object.values(doc.nodes)) if (n.page) ids.add(n.page);
  let i = 2;
  while (ids.has(`p${i}`)) i++;
  return `p${i}`;
}

/**
 * Setup em que todas as folhas listadas do tipo ficam declaradas (número e
 * título estáveis), ou null se já estão todas declaradas.
 */
export function withDeclaredPages(doc: DiagramDoc, sheet: SheetKind): DrawingSetup | null {
  const setup = drawingSetupOf(doc);
  const declared = new Set(setup.pages.filter((p) => p.sheet === sheet).map((p) => p.id));
  const missing = listPages(doc, sheet).filter((p) => !declared.has(p.id));
  return missing.length === 0 ? null : { ...setup, pages: [...setup.pages, ...missing] };
}

/** Setup com a folha adicionada (número = maior + 1). */
export function withAddedPage(
  doc: DiagramDoc,
  sheet: SheetKind,
  title: string,
): { setup: DrawingSetup; page: DrawingPage } {
  const setup = drawingSetupOf(doc);
  const existing = listPages(doc, sheet);
  const page: DrawingPage = {
    id: newPageId(doc),
    sheet,
    number: Math.max(0, ...existing.map((p) => p.number)) + 1,
    title: title.trim().slice(0, 80),
  };
  // Folhas implícitas (só usadas por nós) passam a ser declaradas, para numeração estável.
  const declared = new Map(setup.pages.map((p) => [`${p.sheet}|${p.id}`, p]));
  for (const p of existing)
    if (!declared.has(`${sheet}|${p.id}`)) declared.set(`${sheet}|${p.id}`, p);
  declared.set(`${sheet}|${page.id}`, page);
  return { setup: { ...setup, pages: [...declared.values()] }, page };
}

export function withRenamedPage(
  doc: DiagramDoc,
  sheet: SheetKind,
  pageId: string,
  title: string,
): DrawingSetup {
  const setup = drawingSetupOf(doc);
  const current = listPages(doc, sheet).find((p) => p.id === pageId);
  if (!current) return setup;
  const next: DrawingPage = { ...current, title: title.trim().slice(0, 80) };
  const others = setup.pages.filter((p) => !(p.sheet === sheet && p.id === pageId));
  return { ...setup, pages: [...others, next] };
}

/** Só folha vazia (e nunca a última) pode ser excluída — nada some do projeto. */
export function canRemovePage(doc: DiagramDoc, sheet: SheetKind, pageId: string): boolean {
  if (listPages(doc, sheet).length <= 1) return false;
  return !Object.values(doc.nodes).some((n) => n.sheet === sheet && pageIdOf(n) === pageId);
}

/** Remove a folha e renumera as restantes do tipo em sequência (1, 2, 3…). */
export function withRemovedPage(doc: DiagramDoc, sheet: SheetKind, pageId: string): DrawingSetup {
  const setup = drawingSetupOf(doc);
  const remaining = listPages(doc, sheet).filter((p) => p.id !== pageId);
  const renumbered = remaining.map((p, i) => ({ ...p, number: i + 1 }));
  const others = setup.pages.filter((p) => p.sheet !== sheet);
  return { ...setup, pages: [...others, ...renumbered] };
}

/**
 * Recorte do documento para desenhar UMA folha. Com uma folha só devolve o
 * próprio doc (mesma referência: nenhum custo nem mudança de comportamento).
 */
export function docForPage(doc: DiagramDoc, sheet: SheetKind, pageId: string): DiagramDoc {
  const pages = listPages(doc, sheet);
  if (pages.length <= 1 && pageId === pages[0]?.id) return doc;
  const nodes: DiagramDoc["nodes"] = {};
  for (const [id, n] of Object.entries(doc.nodes)) {
    if (n.sheet !== sheet || pageIdOf(n) === pageId) nodes[id] = n;
  }
  const edges: DiagramDoc["edges"] = {};
  for (const [id, e] of Object.entries(doc.edges)) {
    if (e.sheet !== sheet) {
      edges[id] = e;
      continue;
    }
    if (nodes[e.source] && nodes[e.target]) edges[id] = e;
  }
  return { ...doc, nodes, edges };
}

// ===== Moldura e zonas =====

export interface DrawingFrame {
  format: DrawingFormat;
  /** Canto superior esquerdo da FOLHA (coordenadas do mundo). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Área útil dentro da margem. */
  inner: { x: number; y: number; width: number; height: number };
  columns: number;
  rows: number;
  titleBlock: { x: number; y: number; width: number; height: number };
}

function boundsOf(nodes: ReadonlyArray<DiagramNode>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x);
    maxY = Math.max(maxY, n.position.y);
  }
  return { minX, minY, maxX, maxY };
}

const FRAME_ANCHOR = 100;

/**
 * Moldura da folha posicionada pelo conteúdo: canto ancorado numa grade de
 * 100 px a ~40 mm acima/à esquerda do primeiro equipamento (estável durante a edição).
 */
export function frameForPage(
  doc: DiagramDoc,
  sheet: SheetKind,
  pageId: string,
  format: DrawingFormat = drawingSetupOf(doc).format,
): DrawingFrame {
  const f = DRAWING_FORMATS[format];
  const width = f.widthMm * PX_PER_MM;
  const height = f.heightMm * PX_PER_MM;
  const nodes = Object.values(doc.nodes).filter((n) => n.sheet === sheet && pageIdOf(n) === pageId);
  const b = boundsOf(nodes);
  const lead = (MARGIN_LEFT_MM + 30) * PX_PER_MM;
  const x = b ? Math.floor((b.minX - lead) / FRAME_ANCHOR) * FRAME_ANCHOR : 1500;
  const y = b
    ? Math.floor((b.minY - (MARGIN_MM + 30) * PX_PER_MM) / FRAME_ANCHOR) * FRAME_ANCHOR
    : 1500;
  const inner = {
    x: x + MARGIN_LEFT_MM * PX_PER_MM,
    y: y + MARGIN_MM * PX_PER_MM,
    width: width - (MARGIN_LEFT_MM + MARGIN_MM) * PX_PER_MM,
    height: height - 2 * MARGIN_MM * PX_PER_MM,
  };
  const tbW = TITLE_BLOCK_MM.width * PX_PER_MM;
  const tbH = TITLE_BLOCK_MM.height * PX_PER_MM;
  return {
    format,
    x,
    y,
    width,
    height,
    inner,
    columns: f.columns,
    rows: f.rows,
    titleBlock: {
      x: inner.x + inner.width - tbW,
      y: inner.y + inner.height - tbH,
      width: tbW,
      height: tbH,
    },
  };
}

/** Zona (coluna 1…n, linha A…) de um ponto na moldura; fora dela, a borda mais próxima. */
export function zoneOf(
  frame: DrawingFrame,
  p: { x: number; y: number },
): { column: number; row: string } {
  const band = ZONE_BAND_MM * PX_PER_MM;
  const zx = frame.inner.x + band;
  const zy = frame.inner.y + band;
  const zw = frame.inner.width - 2 * band;
  const zh = frame.inner.height - 2 * band;
  const col = Math.min(
    frame.columns,
    Math.max(1, Math.floor(((p.x - zx) / zw) * frame.columns) + 1),
  );
  const rowIdx = Math.min(frame.rows - 1, Math.max(0, Math.floor(((p.y - zy) / zh) * frame.rows)));
  return { column: col, row: String.fromCharCode(65 + rowIdx) };
}

export interface ZoneMark {
  kind: "column" | "row";
  label: string;
  x: number;
  y: number;
}

/** Números das colunas (em cima e embaixo) e letras das linhas (nas laterais). */
export function zoneMarks(frame: DrawingFrame): ZoneMark[] {
  const band = ZONE_BAND_MM * PX_PER_MM;
  const zx = frame.inner.x + band;
  const zy = frame.inner.y + band;
  const zw = frame.inner.width - 2 * band;
  const zh = frame.inner.height - 2 * band;
  const marks: ZoneMark[] = [];
  for (let c = 0; c < frame.columns; c++) {
    const x = zx + ((c + 0.5) * zw) / frame.columns;
    marks.push({ kind: "column", label: String(c + 1), x, y: frame.inner.y + band / 2 });
    marks.push({
      kind: "column",
      label: String(c + 1),
      x,
      y: frame.inner.y + frame.inner.height - band / 2,
    });
  }
  for (let r = 0; r < frame.rows; r++) {
    const y = zy + ((r + 0.5) * zh) / frame.rows;
    const label = String.fromCharCode(65 + r);
    marks.push({ kind: "row", label, x: frame.inner.x + band / 2, y });
    marks.push({ kind: "row", label, x: frame.inner.x + frame.inner.width - band / 2, y });
  }
  return marks;
}

/** Equipamentos fora da área útil (ou sobre o carimbo) da folha. */
export function nodesOutsideFrame(
  doc: DiagramDoc,
  sheet: SheetKind,
  pageId: string,
  frame: DrawingFrame,
): string[] {
  const band = ZONE_BAND_MM * PX_PER_MM;
  const half = 28;
  const out: string[] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.sheet !== sheet || pageIdOf(n) !== pageId) continue;
    const { x, y } = n.position;
    const inside =
      x - half >= frame.inner.x + band &&
      x + half <= frame.inner.x + frame.inner.width - band &&
      y - half >= frame.inner.y + band &&
      y + half <= frame.inner.y + frame.inner.height - band;
    const tb = frame.titleBlock;
    const onTitleBlock =
      x + half > tb.x &&
      x - half < tb.x + tb.width &&
      y + half > tb.y &&
      y - half < tb.y + tb.height;
    if (!inside || onTitleBlock) out.push(n.id);
  }
  return out;
}

// ===== Referências cruzadas entre folhas =====

export interface PageReference {
  edgeId: string;
  /** Equipamento desta folha onde a ligação "sai". */
  localNodeId: string;
  /** Ponto de saída (porta) no mundo. */
  x: number;
  y: number;
  /** Direção de saída (para fora do equipamento): a seta e o texto seguem por ela. */
  dir: "up" | "down" | "left" | "right";
  remoteNodeId: string;
  remoteTag: string;
  remotePageId: string;
  remotePageNumber: number;
  remoteColumn: number;
  remoteRow: string;
  /** Texto pronto: "→ Q1 /2.4". */
  label: string;
}

function portWorld(node: DiagramNode, portId: string | undefined): { x: number; y: number } {
  const kind = node.params.kind as Parameters<typeof getPorts>[0];
  const port = findPort(kind, portId) ?? getPorts(kind)[0];
  if (!port) return { ...node.position };
  const local = rotatePort(port, node.rotation ?? 0);
  return { x: node.position.x + local.x, y: node.position.y + local.y };
}

export function nodeDisplayTag(node: DiagramNode): string {
  const tag = (node.params as { tag?: unknown }).tag;
  if (typeof tag === "string" && tag.trim()) return tag.trim();
  return node.label?.trim() || node.id;
}

/** Ligações desta folha cujo outro lado está em outra folha do mesmo tipo. */
export function pageReferences(doc: DiagramDoc, sheet: SheetKind, pageId: string): PageReference[] {
  const pages = listPages(doc, sheet);
  if (pages.length <= 1) return [];
  const numberOf = new Map(pages.map((p) => [p.id, p.number]));
  const frames = new Map<string, DrawingFrame>();
  const frameOf = (id: string) => {
    let f = frames.get(id);
    if (!f) {
      f = frameForPage(doc, sheet, id);
      frames.set(id, f);
    }
    return f;
  };
  const refs: PageReference[] = [];
  for (const e of Object.values(doc.edges) as DiagramEdge[]) {
    if (e.sheet !== sheet) continue;
    const a = doc.nodes[e.source];
    const b = doc.nodes[e.target];
    if (!a || !b) continue;
    const pa = pageIdOf(a);
    const pb = pageIdOf(b);
    if (pa === pb) continue;
    const pairs: Array<[DiagramNode, string | undefined, DiagramNode]> = [];
    if (pa === pageId) pairs.push([a, e.sourcePort, b]);
    if (pb === pageId) pairs.push([b, e.targetPort, a]);
    for (const [local, port, remote] of pairs) {
      const remotePage = pageIdOf(remote);
      const zone = zoneOf(frameOf(remotePage), remote.position);
      const number = numberOf.get(remotePage) ?? 0;
      const tag = nodeDisplayTag(remote);
      const at = portWorld(local, port);
      const dx = at.x - local.position.x;
      const dy = at.y - local.position.y;
      const dir: PageReference["dir"] =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      refs.push({
        dir,
        edgeId: e.id,
        localNodeId: local.id,
        x: at.x,
        y: at.y,
        remoteNodeId: remote.id,
        remoteTag: tag,
        remotePageId: remotePage,
        remotePageNumber: number,
        remoteColumn: zone.column,
        remoteRow: zone.row,
        label: `→ ${tag} /${number}.${zone.column}`,
      });
    }
  }
  return refs.sort((x, y) => x.edgeId.localeCompare(y.edgeId));
}

/** Marca desenhada: referências que saem do mesmo ponto viram uma só etiqueta. */
export interface PageReferenceMark {
  x: number;
  y: number;
  dir: PageReference["dir"];
  label: string;
  count: number;
}

export function groupPageReferences(refs: ReadonlyArray<PageReference>): PageReferenceMark[] {
  const groups = new Map<string, PageReference[]>();
  for (const r of refs) {
    const key = `${Math.round(r.x)}|${Math.round(r.y)}|${r.dir}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const marks: PageReferenceMark[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    const parts = list.map((r) => `${r.remoteTag} /${r.remotePageNumber}.${r.remoteColumn}`);
    marks.push({
      x: first.x,
      y: first.y,
      dir: first.dir,
      label: `→ ${parts.join(" · ")}`,
      count: list.length,
    });
  }
  return marks;
}

// ===== Carimbo =====

export interface TitleBlockCell {
  label: string;
  value: string;
  /** Posição relativa no carimbo (fração 0..1) e largura relativa. */
  col: number;
  row: number;
  span: number;
  emphasis?: boolean;
}

export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  unifilar: "Diagrama unifilar",
  multifilar: "Diagrama multifilar",
  ladder: "Ladder",
};

/** Remove caracteres de controle (texto do usuário vai para o desenho e o SVG). */
const clean = (v: string | undefined): string =>
  Array.from(v ?? "")
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c < 32 || c === 127 ? " " : ch;
    })
    .join("")
    .trim();

/**
 * Células do carimbo (4 linhas × 4 colunas). Só dados informados; o título do
 * projeto vem do próprio projeto e a numeração "folha x de n" é calculada.
 */
export function titleBlockCells(
  doc: DiagramDoc,
  sheet: SheetKind,
  pageId: string,
  tb: TitleBlock = drawingSetupOf(doc).titleBlock,
): TitleBlockCell[] {
  const pages = listPages(doc, sheet);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const pageTitle = clean(page?.title) || SHEET_KIND_LABEL[sheet];
  const responsible = [clean(tb.responsible), clean(tb.registration)].filter(Boolean).join(" — ");
  return [
    { label: "Empresa", value: clean(tb.company), col: 0, row: 0, span: 2, emphasis: true },
    { label: "Cliente", value: clean(tb.client), col: 2, row: 0, span: 2 },
    { label: "Projeto", value: clean(doc.metadata.title), col: 0, row: 1, span: 2, emphasis: true },
    { label: "Local / instalação", value: clean(tb.site), col: 2, row: 1, span: 2 },
    { label: "Título da folha", value: pageTitle, col: 0, row: 2, span: 2, emphasis: true },
    { label: "Desenho nº", value: clean(tb.drawingNumber), col: 2, row: 2, span: 1 },
    { label: "Revisão", value: clean(tb.revision), col: 3, row: 2, span: 1 },
    { label: "Desenho", value: clean(tb.drawnBy), col: 0, row: 3, span: 1 },
    { label: "Verificação", value: clean(tb.checkedBy), col: 1, row: 3, span: 1 },
    { label: "Aprovação", value: clean(tb.approvedBy), col: 2, row: 3, span: 1 },
    {
      label: "Folha",
      value: `${page?.number ?? 1} de ${pages.length}`,
      col: 3,
      row: 3,
      span: 1,
    },
    { label: "Responsável técnico", value: responsible, col: 0, row: 4, span: 2 },
    { label: "Data", value: clean(tb.date), col: 2, row: 4, span: 1 },
    {
      label: "Formato / escala",
      value: `${drawingSetupOf(doc).format} · sem escala`,
      col: 3,
      row: 4,
      span: 1,
    },
  ];
}

export const TITLE_BLOCK_ROWS = 5;
export const TITLE_BLOCK_COLS = 4;
