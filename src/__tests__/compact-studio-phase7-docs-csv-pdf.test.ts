import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import type { CompactProgramModel } from "../lib/compact-studio/domain/types";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import { evaluateRackEngineering } from "../lib/compact-studio/hardware";
import {
  buildCompactProgramPdf,
  buildCrossReferenceIndex,
  exportCompactToPlcOpenXml,
  exportIoSymbolsToCsv,
  importIoSymbolsFromCsv,
} from "../lib/compact-studio/docs";

describe("Fase 7 — Documentação, Referências Cruzadas, CSV Seguro, PDF Multipágina & PLCopen", () => {
  it("neutralizes Spreadsheet/CSV Formula Injection on export & import and blocks oversized files", () => {
    const csv = exportIoSymbolsToCsv([
      {
        id: "sym_1",
        ioKind: "DI",
        address: "I1",
        symbolicName: "=cmd|'/C calc'!A0",
        signalType: "BOOL",
        retentive: false,
        initialValue: false,
        comment: "+SUM(1,2) @evil\t=HACK",
      },
    ]);

    // OWASP neutralizer prepends single quote before dangerous leading formula chars
    expect(csv).toContain("'=cmd|");
    expect(csv).toContain("'+SUM(1,2)");

    const imported = importIoSymbolsFromCsv(csv);
    expect(imported.ok).toBe(true);
    expect(imported.symbols[0].symbolicName.startsWith("=")).toBe(false);
    expect(imported.symbols[0].comment.startsWith("+")).toBe(false);

    const oversized = "a,".repeat(300_000);
    const rejected = importIoSymbolsFromCsv(oversized);
    expect(rejected.ok).toBe(false);
    expect(rejected.errors[0]).toMatch(/excede o limite/);
  });

  it("builds cross-reference index across multiple pages and exports valid PLCopen XML & multi-page PDF", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_docs", name: "Projeto Documentado" });
    const p1 = base.pages[0];
    const p2 = {
      id: "page-2",
      name: "Página 2",
      order: 1,
      description: "Alarmes",
      gridCols: 24,
      gridRows: 20,
    };

    const i1 = createCompactBlockNode({
      id: "n_i1",
      pageId: p1.id,
      blockType: "INPUT_DI",
      instanceName: "I1",
    });
    const pout = createCompactBlockNode({
      id: "n_po",
      pageId: p1.id,
      blockType: "PAGE_OUT",
      instanceName: "SIG_OK",
      params: { connectorKey: "SIG_OK" },
    });
    const pin = createCompactBlockNode({
      id: "n_pi",
      pageId: p2.id,
      blockType: "PAGE_IN",
      instanceName: "SIG_OK",
      params: { connectorKey: "SIG_OK" },
    });
    const q1 = createCompactBlockNode({
      id: "n_q1",
      pageId: p2.id,
      blockType: "OUTPUT_QO",
      instanceName: "Q1",
    });

    const model: CompactProgramModel = {
      ...base,
      pages: [p1, p2],
      ioSymbols: [
        {
          id: "s1",
          ioKind: "DI",
          address: "I1",
          symbolicName: "PARTIDA",
          signalType: "BOOL",
          retentive: false,
          initialValue: false,
          comment: "Botão NA",
        },
      ],
      nodes: [i1, pout, pin, q1],
      connections: [
        {
          id: "c1",
          pageId: p1.id,
          fromNodeId: "n_i1",
          fromPortId: "out",
          toNodeId: "n_po",
          toPortId: "in",
          signalType: "BOOL",
        },
        {
          id: "c2",
          pageId: p2.id,
          fromNodeId: "n_pi",
          fromPortId: "out",
          toNodeId: "n_q1",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const crossRefs = buildCrossReferenceIndex(model);
    const sigRef = crossRefs.find((r) => r.kind === "connector" && r.key === "SIG_OK");
    expect(sigRef?.totalHits).toBe(2);
    expect(sigRef?.hits.map((h) => h.role).sort()).toEqual(["page_in", "page_out"]);

    const rackReport = evaluateRackEngineering(model);
    const pdf = buildCompactProgramPdf(model, rackReport, crossRefs);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(4); // cover + syms + p1 + p2

    const xml = exportCompactToPlcOpenXml(model);
    expect(xml).toContain('xmlns="http://www.plcopen.org/xml/tc6_0201"');
    expect(xml).toContain("PARTIDA");
  });
});
