import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_FBD_PAGE_ID,
  LEGACY_FBD_PAGE_ID,
  importLegacyFbdIntoStudio,
} from "@/lib/compact-studio/conversion/legacy-fbd-import";
import { createEmptyCompactProgramModel } from "@/lib/compact-studio/domain/migrations";
import { studioToStructuredText } from "@/lib/compact-studio/runtime/structured-text";
import { compileCompactProgram } from "@/lib/compact-studio/runtime/compact-compiler";
import {
  groupStudioLibrary,
  searchStudioLibrary,
  studioLibraryEntries,
} from "@/lib/compact-studio/editor/library";
import {
  ensurePlcBlockPage,
  plcBlockPageId,
} from "@/lib/compact-studio/integration/plc-block-pages";
import { migrateLegacyFbdIntoStudio } from "@/lib/compact-studio/integration/legacy-fbd-migration";
import { PRODUCT_NAME } from "@/lib/compact-studio/branding";
import { MODES } from "@/lib/workspace-data";
import { useEditorStore } from "@/lib/editor/store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { createDefaultRegistry } from "@/lib/fbd/engine";

/** Programa salvo pelo ANTIGO editor FBD (formato React Flow). */
const legacyNodes = [
  {
    id: "AND_1",
    type: "fbdBlock",
    position: { x: 100, y: 150 },
    data: {
      label: "AND_1",
      type: "AND",
      inputs: [
        { id: "in1", label: "IN1", type: "BOOL" },
        { id: "in2", label: "IN2", type: "BOOL" },
      ],
      outputs: [{ id: "out", label: "OUT", type: "BOOL" }],
    },
  },
  {
    id: "TON_1",
    type: "fbdBlock",
    position: { x: 340, y: 150 },
    data: {
      label: "TON_1",
      type: "TON",
      inputs: [
        { id: "in", label: "IN", type: "BOOL" },
        { id: "pt", label: "PT", type: "INT" },
      ],
      outputs: [
        { id: "q", label: "Q", type: "BOOL" },
        { id: "et", label: "ET", type: "INT" },
      ],
      params: { PT: "T#5s" },
    },
  },
];
const legacyEdges = [
  { id: "e1", source: "AND_1", target: "TON_1", sourceHandle: "out", targetHandle: "in" },
];

const empty = () => createEmptyCompactProgramModel({ nowIso: "2026-11-16T00:00:00.000Z" });

describe("FB Electric Studio — um único editor de blocos", () => {
  it("nome do produto e uma só aba de blocos funcionais no workspace", () => {
    expect(PRODUCT_NAME).toBe("FB Electric Studio");
    expect(MODES.some((m) => m.id === "fbd")).toBe(false);
    expect(MODES.find((m) => m.id === "compactStudio")?.label).toBe("FB Electric Studio");
  });

  it("modo 'fbd' antigo redireciona para o FB Electric Studio", () => {
    useEditorStore.getState().setActiveMode("fbd");
    expect(useEditorStore.getState().activeMode).toBe("compactStudio");
  });

  it("o editor antigo foi removido (sem código duplicado)", () => {
    for (const p of [
      "../components/canvases/fbd-canvas.tsx",
      "../components/editor/sidebars/editor-fbd-sidebar.tsx",
      "../hooks/use-fbd-engine.ts",
      "../lib/fbd/editor-bridge.ts",
    ]) {
      expect(existsSync(resolve(__dirname, p)), p).toBe(false);
    }
  });
});

describe("migração do FBD antigo para o Studio", () => {
  it("preserva blocos, parâmetros, ligações e posições", () => {
    const { model, report } = importLegacyFbdIntoStudio(empty(), legacyNodes, legacyEdges);
    expect(report).toMatchObject({ importedNodes: 2, importedConnections: 1, skipped: [] });
    const page = model.pages.find((p) => p.id === LEGACY_FBD_PAGE_ID);
    expect(page).toBeTruthy();
    const ton = model.nodes.find((n) => n.blockType === "TON");
    expect(ton?.params.PT).toBe("T#5s");
    expect(model.layout.fbd[ton!.id]).toEqual({ x: 340, y: 150 });
    const conn = model.connections[0];
    expect(conn.fromPortId).toBe("out");
    expect(conn.toPortId).toBe("in");
  });

  it("o programa migrado compila no motor sem erro", () => {
    const { model } = importLegacyFbdIntoStudio(empty(), legacyNodes, legacyEdges);
    const { compileResult } = compileCompactProgram(model);
    expect(compileResult.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("idempotente: importar duas vezes não duplica", () => {
    const once = importLegacyFbdIntoStudio(empty(), legacyNodes, legacyEdges).model;
    const twice = importLegacyFbdIntoStudio(once, legacyNodes, legacyEdges).model;
    expect(twice.nodes).toHaveLength(2);
    expect(twice.connections).toHaveLength(1);
    expect(twice.pages.filter((p) => p.id === LEGACY_FBD_PAGE_ID)).toHaveLength(1);
  });

  it("bloco inexistente e pino inválido vão para o relatório, nada é inventado", () => {
    const { model, report } = importLegacyFbdIntoStudio(
      empty(),
      [...legacyNodes, { id: "X", data: { type: "NAO_EXISTE", inputs: [], outputs: [] } }],
      [
        ...legacyEdges,
        { id: "e2", source: "AND_1", target: "TON_1", sourceHandle: "out", targetHandle: "zz" },
      ],
    );
    expect(model.nodes).toHaveLength(2);
    expect(report.skipped.join(" ")).toMatch(/NAO_EXISTE/);
    expect(report.skipped.join(" ")).toMatch(/inexistente/);
  });

  it("não toca nas outras páginas do Studio", () => {
    const base = importLegacyFbdIntoStudio(empty(), legacyNodes, legacyEdges, {
      pageId: AI_FBD_PAGE_ID,
    }).model;
    const next = importLegacyFbdIntoStudio(base, legacyNodes.slice(0, 1), []).model;
    expect(next.nodes.filter((n) => n.pageId === AI_FBD_PAGE_ID)).toHaveLength(2);
    expect(next.nodes.filter((n) => n.pageId === LEGACY_FBD_PAGE_ID)).toHaveLength(1);
  });

  describe("no carregamento do projeto", () => {
    beforeEach(() => {
      useUnifiedProjectStore.getState().setCompactStudioProgram(undefined);
      useEditorStore.getState().setFbdAll([], []);
    });

    it("leva o FBD salvo para o Studio e só então limpa o formato antigo", () => {
      useEditorStore.getState().setFbdAll(legacyNodes as never, legacyEdges as never);
      const report = migrateLegacyFbdIntoStudio();
      expect(report?.importedNodes).toBe(2);
      expect(useEditorStore.getState().fbdNodes).toHaveLength(0);
      const studio = useUnifiedProjectStore.getState().doc.compactStudio;
      expect(studio?.nodes.filter((n) => n.pageId === LEGACY_FBD_PAGE_ID)).toHaveLength(2);
    });

    it("página já migrada nunca é sobrescrita por cópia antiga", () => {
      useEditorStore.getState().setFbdAll(legacyNodes as never, legacyEdges as never);
      migrateLegacyFbdIntoStudio();
      // usuário apaga um bloco da página migrada
      const edited = useUnifiedProjectStore.getState().doc.compactStudio!;
      const removedId = edited.nodes[0].id;
      useUnifiedProjectStore.getState().setCompactStudioProgram({
        ...edited,
        nodes: edited.nodes.filter((n) => n.id !== removedId),
        connections: [],
      });
      // cópia antiga reaparece no editor
      useEditorStore.getState().setFbdAll(legacyNodes as never, legacyEdges as never);
      expect(migrateLegacyFbdIntoStudio()).toBeNull();
      const after = useUnifiedProjectStore.getState().doc.compactStudio!;
      expect(after.nodes.some((n) => n.id === removedId)).toBe(false);
      expect(useEditorStore.getState().fbdNodes).toHaveLength(0);
    });
  });
});

describe("biblioteca completa no Studio", () => {
  it("toda a biblioteca IEC do motor está disponível (antes só no editor FBD antigo)", () => {
    const types = new Set(studioLibraryEntries().map((e) => e.type));
    for (const def of createDefaultRegistry().list()) {
      if (def.namespace !== "SYSTEM") expect(types.has(def.type), def.type).toBe(true);
    }
    // e os blocos de CLP compacto e E/S
    for (const t of ["PI_CONTROLLER", "WEEKLY_TIMER", "INPUT_DI", "OUTPUT_QO", "PAGE_IN"]) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it("busca sem acento/caixa", () => {
    expect(searchStudioLibrary("ton").some((e) => e.type === "TON")).toBe(true);
    expect(searchStudioLibrary("saida").some((e) => e.type === "OUTPUT_QO")).toBe(true);
    expect(searchStudioLibrary("")).toEqual([]);
  });

  it("agrupada por categoria", () => {
    const groups = groupStudioLibrary();
    expect(groups.length).toBeGreaterThan(3);
    expect(groups.flatMap(([, e]) => e).length).toBe(studioLibraryEntries().length);
  });
});

describe("Structured Text e blocos FBD do CLP", () => {
  it("gera ST da página com os blocos e a instância do temporizador", () => {
    const { model } = importLegacyFbdIntoStudio(empty(), legacyNodes, legacyEdges);
    const st = studioToStructuredText(model, {
      pageId: LEGACY_FBD_PAGE_ID,
      programName: "Partida M1",
    });
    expect(st.code).toMatch(/PROGRAM Partida_M1/);
    expect(st.code).toMatch(/TON/);
    expect(st.blockCount).toBe(2);
    expect(st.diagnostics).toEqual([]);
  });

  it("ST de uma página ignora as outras", () => {
    const a = importLegacyFbdIntoStudio(empty(), legacyNodes, legacyEdges).model;
    const b = importLegacyFbdIntoStudio(a, legacyNodes.slice(0, 1), [], {
      pageId: AI_FBD_PAGE_ID,
    }).model;
    expect(studioToStructuredText(b, { pageId: AI_FBD_PAGE_ID }).blockCount).toBe(1);
  });

  it("bloco FBD do CLP vira página própria; snapshot antigo é importado uma vez", () => {
    const block = {
      id: "b1",
      type: "FC" as const,
      number: 10,
      name: "Intertravamento",
      fbd: { nodes: legacyNodes, edges: legacyEdges },
    };
    const first = ensurePlcBlockPage(empty(), block);
    expect(first.pageId).toBe(plcBlockPageId("b1"));
    expect(first.importedLegacy).toBe(true);
    expect(first.model.pages.find((p) => p.id === first.pageId)?.name).toBe(
      "FC10 · Intertravamento",
    );
    expect(first.model.nodes).toHaveLength(2);
    const again = ensurePlcBlockPage(first.model, block);
    expect(again.changed).toBe(false);
    expect(again.importedLegacy).toBe(false);
  });

  it("bloco FBD novo do CLP ganha página vazia", () => {
    const res = ensurePlcBlockPage(empty(), { id: "b2", type: "FB", number: 1, name: "Nova" });
    expect(res.changed).toBe(true);
    expect(res.model.nodes).toHaveLength(0);
    expect(res.model.pages.some((p) => p.id === res.pageId)).toBe(true);
  });

  it("CLP compila FBD pelo Studio (não pelo formato antigo)", () => {
    const plc = readFileSync(resolve(__dirname, "../components/canvases/plc-canvas.tsx"), "utf8");
    expect(plc).toContain("studioToStructuredText");
    expect(plc).not.toContain("compileFbdNodesToSt");
    expect(plc).not.toContain('setActiveMode("fbd")');
  });

  it("IA grava a lógica FBD no Studio", () => {
    const ai = readFileSync(resolve(__dirname, "../lib/ai-architect-client.ts"), "utf8");
    expect(ai).toContain("importLegacyFbdIntoStudio");
    expect(ai).not.toContain("setFbdAll(fbdNodes, fbdEdges)");
  });
});

describe("correções encontradas no teste de navegador", () => {
  it("instâncias de tipos diferentes não colidem (GT e TON viravam ambos B1)", async () => {
    const { nextUniqueInstanceName } = await import("@/lib/compact-studio/editor/library");
    const model = { nodes: [{ instanceName: "TON1" }, { instanceName: "ton2" }] } as never;
    expect(nextUniqueInstanceName(model, "TON", 1)).toBe("TON3");
    expect(nextUniqueInstanceName(model, "GT", 1)).toBe("GT1");
  });

  it("nome do programa ST translitera acentos (Página 1 → Pagina_1)", () => {
    const st = studioToStructuredText(empty(), { programName: "Página 1" });
    expect(st.code).toMatch(/PROGRAM Pagina_1/);
  });
});
