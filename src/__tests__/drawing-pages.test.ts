import { describe, expect, it } from "vitest";
import { applyCommand, invertCommand, type Command } from "@/lib/diagram/commands";
import { createEmptyDoc, makeEdge, makeNode } from "@/lib/diagram/model";
import {
  DiagramDocSchema,
  NodeParamsSchema,
  type DiagramDoc,
  type NodeParams,
} from "@/lib/diagram/schema";
import {
  DEFAULT_PAGE_ID,
  canRemovePage,
  docForPage,
  drawingSetupOf,
  frameForPage,
  groupPageReferences,
  listPages,
  nodesOutsideFrame,
  pageReferences,
  titleBlockCells,
  withAddedPage,
  withDeclaredPages,
  withRemovedPage,
  withRenamedPage,
  zoneOf,
} from "@/lib/diagram/pages";
import { buildMultifilarCommands, syncMultifilarCommands } from "@/lib/diagram/multifilar";
import { diagramToSvg } from "@/lib/diagram/export-svg";

const EXTRA: Record<string, Record<string, unknown>> = {
  breaker: { in_A: 20, curve: "C", poles: 3 },
  motor: { power_kW: 5, voltage_V: 380, startMethod: "DOL" },
};
const params = (kind: string, tag: string): NodeParams =>
  NodeParamsSchema.parse({ kind, tag, ...EXTRA[kind] }) as NodeParams;

function baseDoc(): DiagramDoc {
  const doc = createEmptyDoc();
  const q0 = makeNode({
    id: "q0",
    sheet: "unifilar",
    params: params("breaker", "Q0"),
    position: { x: 2000, y: 2000 },
  });
  const q1 = makeNode({
    id: "q1",
    sheet: "unifilar",
    params: params("breaker", "Q1"),
    position: { x: 2000, y: 2200 },
  });
  const m1 = makeNode({
    id: "m1",
    sheet: "unifilar",
    params: params("motor", "M1"),
    position: { x: 2000, y: 2400 },
  });
  doc.nodes = { q0, q1, m1 };
  doc.edges = {
    e1: makeEdge({ id: "e1", sheet: "unifilar", source: "q0", target: "q1", kind: "power" }),
    e2: makeEdge({ id: "e2", sheet: "unifilar", source: "q1", target: "m1", kind: "power" }),
  };
  return doc;
}

const run = (doc: DiagramDoc, c: Command) => applyCommand(doc, c);
const withMeta = (doc: DiagramDoc, meta: Partial<DiagramDoc["metadata"]>): DiagramDoc => ({
  ...doc,
  metadata: { ...doc.metadata, ...meta },
});

/** Cria a folha 2 e move Q1 e M1 para ela. */
function twoPageDoc(): { doc: DiagramDoc; p2: string } {
  let doc = baseDoc();
  const { setup, page } = withAddedPage(doc, "unifilar", "Motores");
  doc = run(doc, { type: "UpdateDrawingSetup", from: doc.metadata.drawing, to: setup });
  doc = run(doc, { type: "SetNodePage", nodeId: "q1", to: page.id });
  doc = run(doc, { type: "SetNodePage", nodeId: "m1", to: page.id });
  return { doc, p2: page.id };
}

describe("folhas de desenho", () => {
  it("projeto antigo tem uma folha e o recorte é o próprio documento", () => {
    const doc = baseDoc();
    expect(listPages(doc, "unifilar").map((p) => [p.id, p.number])).toEqual([[DEFAULT_PAGE_ID, 1]]);
    expect(docForPage(doc, "unifilar", DEFAULT_PAGE_ID)).toBe(doc);
    expect(pageReferences(doc, "unifilar", DEFAULT_PAGE_ID)).toEqual([]);
  });

  it("schema aceita documento antigo e preserva folha e carimbo", () => {
    const base = twoPageDoc().doc;
    const doc = withMeta(base, {
      drawing: { ...drawingSetupOf(base), titleBlock: { company: "ACME" } },
    });
    const parsed = DiagramDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed.nodes.q1.page).toBe(twoPageDoc().p2);
    expect(parsed.metadata.drawing?.titleBlock.company).toBe("ACME");
    const old = DiagramDocSchema.parse(JSON.parse(JSON.stringify(baseDoc())));
    expect(old.metadata.drawing).toBeUndefined();
    expect(old.nodes.q0.page).toBeUndefined();
  });

  it("recorta a folha e gera referência cruzada dos dois lados", () => {
    const { doc, p2 } = twoPageDoc();
    const pages = listPages(doc, "unifilar");
    expect(pages.map((p) => [p.number, p.title])).toEqual([
      [1, ""],
      [2, "Motores"],
    ]);

    const page1 = docForPage(doc, "unifilar", DEFAULT_PAGE_ID);
    expect(Object.keys(page1.nodes)).toEqual(["q0"]);
    expect(Object.keys(page1.edges)).toEqual([]);
    const page2 = docForPage(doc, "unifilar", p2);
    expect(Object.keys(page2.nodes).sort()).toEqual(["m1", "q1"]);
    expect(Object.keys(page2.edges)).toEqual(["e2"]);

    const r1 = pageReferences(doc, "unifilar", DEFAULT_PAGE_ID);
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ localNodeId: "q0", remoteTag: "Q1", remotePageNumber: 2 });
    expect(r1[0].label).toMatch(/^→ Q1 \/2\.\d+$/);
    const r2 = pageReferences(doc, "unifilar", p2);
    expect(r2[0]).toMatchObject({ localNodeId: "q1", remoteTag: "Q0", remotePageNumber: 1 });
  });

  it("topologia elétrica não muda: as ligações continuam no documento", () => {
    const { doc } = twoPageDoc();
    expect(Object.keys(doc.edges).sort()).toEqual(["e1", "e2"]);
  });

  it("comandos de folha são reversíveis", () => {
    const doc = baseDoc();
    const cmd: Command = { type: "SetNodePage", nodeId: "m1", from: undefined, to: "p2" };
    const inv = invertCommand(doc, cmd);
    const moved = applyCommand(doc, cmd);
    expect(moved.nodes.m1.page).toBe("p2");
    expect(applyCommand(moved, inv as Command).nodes.m1.page).toBeUndefined();

    const { setup } = withAddedPage(doc, "unifilar", "X");
    const set: Command = { type: "UpdateDrawingSetup", from: undefined, to: setup };
    const after = applyCommand(doc, set);
    expect(after.metadata.drawing?.pages.length).toBe(2);
    expect(
      applyCommand(after, invertCommand(doc, set) as Command).metadata.drawing,
    ).toBeUndefined();
  });

  it("só exclui folha vazia e renumera as restantes", () => {
    const { doc, p2 } = twoPageDoc();
    expect(canRemovePage(doc, "unifilar", p2)).toBe(false);
    expect(canRemovePage(doc, "unifilar", DEFAULT_PAGE_ID)).toBe(false);

    let d = doc;
    const { setup, page: p3 } = withAddedPage(d, "unifilar", "Comando");
    d = run(d, { type: "UpdateDrawingSetup", from: d.metadata.drawing, to: setup });
    // Esvazia a folha 2 movendo tudo para a 3.
    d = run(d, { type: "SetNodePage", nodeId: "q1", from: p2, to: p3.id });
    d = run(d, { type: "SetNodePage", nodeId: "m1", from: p2, to: p3.id });
    expect(canRemovePage(d, "unifilar", p2)).toBe(true);
    d = run(d, {
      type: "UpdateDrawingSetup",
      from: d.metadata.drawing,
      to: withRemovedPage(d, "unifilar", p2),
    });
    expect(listPages(d, "unifilar").map((p) => [p.title, p.number])).toEqual([
      ["", 1],
      ["Comando", 2],
    ]);
  });

  it("renomeia e declara folhas implícitas sem duplicar", () => {
    let doc = baseDoc();
    doc = run(doc, { type: "SetNodePage", nodeId: "m1", to: "p7" });
    const declared = withDeclaredPages(doc, "unifilar");
    expect(declared?.pages.map((p) => p.id).sort()).toEqual(["p1", "p7"]);
    doc = run(doc, { type: "UpdateDrawingSetup", to: declared as NonNullable<typeof declared> });
    expect(withDeclaredPages(doc, "unifilar")).toBeNull();
    const renamed = withRenamedPage(doc, "unifilar", "p7", "  Bombas  ");
    expect(renamed.pages.filter((p) => p.id === "p7")).toEqual([
      { id: "p7", sheet: "unifilar", number: 2, title: "Bombas" },
    ]);
  });

  it("multifilar herda e acompanha a folha do unifilar", () => {
    const { doc, p2 } = twoPageDoc();
    const withMf = buildMultifilarCommands(doc).reduce(applyCommand, doc);
    const mfM1 = Object.values(withMf.nodes).find(
      (n) => n.sheet === "multifilar" && n.ui?.equipmentId === "m1",
    );
    expect(mfM1?.page).toBe(p2);
    expect(listPages(withMf, "multifilar").map((p) => p.title)).toEqual(["", "Motores"]);

    const back = run(withMf, { type: "SetNodePage", nodeId: "m1", from: p2, to: undefined });
    const synced = syncMultifilarCommands(back).reduce(applyCommand, back);
    const mfAfter = Object.values(synced.nodes).find(
      (n) => n.sheet === "multifilar" && n.ui?.equipmentId === "m1",
    );
    expect(mfAfter?.page).toBeUndefined();
  });

  it("carimbo só mostra dados informados e calcula a numeração", () => {
    const { doc: base, p2 } = twoPageDoc();
    const doc = withMeta(base, { title: "Planta X" });
    const blank = titleBlockCells(doc, "unifilar", p2, {});
    const byLabel = Object.fromEntries(blank.map((c) => [c.label, c.value]));
    expect(byLabel["Empresa"]).toBe("");
    expect(byLabel["Responsável técnico"]).toBe("");
    expect(byLabel["Revisão"]).toBe("");
    expect(byLabel["Projeto"]).toBe("Planta X");
    expect(byLabel["Título da folha"]).toBe("Motores");
    expect(byLabel["Folha"]).toBe("2 de 2");

    const filled = titleBlockCells(doc, "unifilar", p2, {
      company: "Empresa\u0007 Real",
      responsible: "Fulano",
      registration: "CREA 123",
    });
    const f = Object.fromEntries(filled.map((c) => [c.label, c.value]));
    expect(f["Empresa"]).toBe("Empresa  Real");
    expect(f["Responsável técnico"]).toBe("Fulano — CREA 123");
  });

  it("moldura: zonas e equipamento fora da área útil", () => {
    const doc = baseDoc();
    const frame = frameForPage(doc, "unifilar", DEFAULT_PAGE_ID, "A3");
    expect(frame.width).toBe(420 * 4);
    expect(frame.columns).toBe(8);
    expect(nodesOutsideFrame(doc, "unifilar", DEFAULT_PAGE_ID, frame)).toEqual([]);
    const z = zoneOf(frame, doc.nodes.q0.position);
    expect(z.column).toBeGreaterThanOrEqual(1);
    expect(z.row).toMatch(/^[A-F]$/);

    const far = run(doc, {
      type: "MoveNode",
      nodeId: "m1",
      from: doc.nodes.m1.position,
      to: { x: 9000, y: 2400 },
    });
    expect(nodesOutsideFrame(far, "unifilar", DEFAULT_PAGE_ID, frame)).toEqual(["m1"]);
  });

  it("SVG da folha: carimbo escapado, referências e sem selo fictício", () => {
    const { doc: base, p2 } = twoPageDoc();
    const doc = withMeta(base, {
      title: "Planta <script>",
      drawing: { ...drawingSetupOf(base), titleBlock: { company: "A & B <x>" } },
    });
    const svg = diagramToSvg(doc, "unifilar", p2);
    expect(svg).toContain('id="title-block"');
    expect(svg).toContain("A &amp; B &lt;x&gt;");
    expect(svg).toContain("Planta &lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("CAD Elétrico");
    expect(svg).toMatch(/→ Q0 \/1\.\d+/);
    expect(svg).toContain("2 de 2");
  });

  it("referências que saem do mesmo ponto viram uma etiqueta", () => {
    let doc = baseDoc();
    const m2 = makeNode({
      id: "m2",
      sheet: "unifilar",
      params: params("motor", "M2"),
      position: { x: 2200, y: 2400 },
    });
    doc = run(doc, { type: "AddNode", node: m2 });
    doc = run(doc, {
      type: "AddEdge",
      edge: makeEdge({ id: "e3", sheet: "unifilar", source: "q1", target: "m2", kind: "power" }),
    });
    doc = run(doc, { type: "SetNodePage", nodeId: "m1", to: "p2" });
    doc = run(doc, { type: "SetNodePage", nodeId: "m2", to: "p2" });
    const refs = pageReferences(doc, "unifilar", DEFAULT_PAGE_ID);
    expect(refs).toHaveLength(2);
    const marks = groupPageReferences(refs);
    expect(marks).toHaveLength(1);
    expect(marks[0].count).toBe(2);
    expect(marks[0].label).toMatch(/^→ M1 \/2\.\d+ · M2 \/2\.\d+$/);
  });
});
