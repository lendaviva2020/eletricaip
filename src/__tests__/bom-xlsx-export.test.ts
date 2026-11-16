import { describe, expect, it } from "vitest";
import {
  buildBomRows,
  buildBomWorkbook,
  safeReportFileName,
  type BomExportItem,
} from "@/lib/reports/xlsx-export";
import { XLSX } from "@/lib/security/safe-xlsx";

const item = (over: Partial<BomExportItem>): BomExportItem => ({
  part_number: "3RT2026",
  description: "Contator 25 A",
  manufacturer: "Siemens",
  quantity: 2,
  unit: "pç",
  reference: "K1",
  notes: null,
  unit_price_brl: 150.5,
  source: "canvas",
  ...over,
});
const meta = {
  projectName: "Linha 03",
  generatedAtIso: "2026-11-16T10:00:00.000Z",
  locale: "pt-BR" as const,
};

describe("Exportação Excel do BOM", () => {
  it("monta cabeçalho, linhas numéricas e total", () => {
    const rows = buildBomRows(
      [item({}), item({ part_number: "X", quantity: "3", unit_price_brl: "10" })],
      meta,
    );
    expect(rows[3][2]).toBe("Descrição");
    expect(rows[4]).toEqual([
      1,
      "3RT2026",
      "Contator 25 A",
      "Siemens",
      2,
      "pç",
      "K1",
      150.5,
      301,
      "canvas",
      "",
    ]);
    expect(rows[5][4]).toBe(3); // texto numérico vira número
    expect(rows.at(-1)?.[8]).toBe(331);
  });

  it("neutraliza injeção de fórmula em TODOS os campos de texto", () => {
    const evil = item({
      part_number: '=HYPERLINK("http://evil","x")',
      description: "+cmd|' /C calc'!A0",
      manufacturer: "@SUM(1+1)",
      notes: "-2+3+cmd|' /C calc'!A0",
      reference: "\t=1+1",
    });
    const row = buildBomRows([evil], meta)[4];
    for (const idx of [1, 2, 3, 6, 10]) {
      expect(String(row[idx]).startsWith("'")).toBe(true);
    }
    // nome do projeto também é saneado
    expect(buildBomRows([], { ...meta, projectName: "=1+1" })[0][1]).toBe("'=1+1");
  });

  it("valores inválidos viram 0 (sem NaN na planilha)", () => {
    const row = buildBomRows([item({ quantity: "abc", unit_price_brl: null })], meta)[4];
    expect(row[4]).toBe(0);
    expect(row[8]).toBe(0);
  });

  it("gera .xlsx válido que reabre com os mesmos dados e sem fórmulas", async () => {
    const blob = await buildBomWorkbook([item({ part_number: "=1+1" })], meta);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws.B5.v).toBe("'=1+1");
    expect(ws.B5.f).toBeUndefined();
    expect(ws.I5.v).toBe(301);
  });

  it("nome de arquivo sem caminho nem caracteres perigosos", () => {
    expect(safeReportFileName("../../etc/Planta São Paulo", "BOM")).toBe(
      "etc_Planta_Sao_Paulo_BOM.xlsx",
    );
    expect(safeReportFileName("", "BOM")).toBe("projeto_BOM.xlsx");
  });

  it("recusa BOM acima do limite (proteção de memória)", () => {
    expect(() => buildBomRows(new Array(20_001).fill(item({})), meta)).toThrow();
  });
});
