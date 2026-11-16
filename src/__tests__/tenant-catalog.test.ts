import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOUSER_MAX_PARTS_PER_QUERY,
  SupplierError,
  buildKeywordRequest,
  buildPartNumberRequest,
  normalizeMouserPart,
  normalizeMouserResponse,
  parseStock,
  parseSupplierPrice,
} from "@/lib/catalog/mouser";
import { parseLocaleNumber } from "@/components/catalog/catalog-item-form-dialog";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("preço do distribuidor — sem inventar e sem errar separador", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["$1,234.56", 1234.56],
    ["R$ 0,123", 0.123],
    ["$0.0450", 0.045],
    ["R$ 12,5", 12.5],
    ["$1,234", 1234],
    ["R$ 1.234.567,00", 1234567],
    ["€ 9", 9],
  ])("%s → %d", (raw, expected) => {
    expect(parseSupplierPrice(raw)).toBeCloseTo(expected, 6);
  });

  it.each([[null], [undefined], [""], ["Consultar"], ["-5,00"]])("%s → null", (raw) => {
    expect(parseSupplierPrice(raw as string | null | undefined)).toBeNull();
  });

  it("estoque lido do texto; ausente fica null", () => {
    expect(parseStock(null, "1.234 In Stock")).toBe(1234);
    expect(parseStock("57", null)).toBe(57);
    expect(parseStock(null, "None")).toBeNull();
    expect(parseStock(null, null)).toBeNull();
  });
});

const rawPart = {
  Manufacturer: "Siemens",
  ManufacturerPartNumber: "3RT2016-1BB41",
  MouserPartNumber: "981-3RT20161BB41",
  Description: "Contator 9 A, bobina 24 V CC",
  Category: "Contactors",
  DataSheetUrl: "https://www.mouser.com/datasheet/2/3rt2.pdf",
  ProductDetailUrl: "https://br.mouser.com/ProductDetail/981-3RT20161BB41",
  Availability: "12 Em estoque",
  PriceBreaks: [
    { Quantity: 10, Price: "R$ 300,00", Currency: "BRL" },
    { Quantity: 1, Price: "R$ 321,45", Currency: "BRL" },
  ],
};

describe("normalização da resposta da Mouser", () => {
  it("usa o MENOR degrau de quantidade e a moeda informada (sem conversão)", () => {
    const p = normalizeMouserPart(rawPart);
    expect(p).toMatchObject({
      manufacturer: "Siemens",
      partNumber: "3RT2016-1BB41",
      supplierPartNumber: "981-3RT20161BB41",
      unitPrice: 321.45,
      currency: "BRL",
      priceQuantity: 1,
      stock: 12,
    });
  });

  it("sem fabricante ou código: descarta (não completa com palpite)", () => {
    expect(normalizeMouserPart({ ...rawPart, Manufacturer: "" })).toBeNull();
    expect(normalizeMouserPart({ ...rawPart, ManufacturerPartNumber: undefined })).toBeNull();
    const r = normalizeMouserResponse({
      Errors: [],
      SearchResults: { NumberOfResult: 2, Parts: [rawPart, { Manufacturer: "X" }] },
    });
    expect(r.parts).toHaveLength(1);
    expect(r.discarded).toBe(1);
  });

  it("preço sem moeda válida fica sem preço", () => {
    const p = normalizeMouserPart({
      ...rawPart,
      PriceBreaks: [{ Quantity: 1, Price: "12,00", Currency: "" }],
    });
    expect(p?.unitPrice).toBeNull();
    expect(p?.currency).toBeNull();
  });

  it("URLs não-https são descartadas (datasheet/produto)", () => {
    const p = normalizeMouserPart({
      ...rawPart,
      DataSheetUrl: "javascript:alert(1)",
      ProductDetailUrl: "http://exemplo.com/x",
    });
    expect(p?.datasheetUrl).toBeNull();
    expect(p?.productUrl).toBeNull();
  });

  it("erros da Mouser viram SupplierError (limite → RATE_LIMITED)", () => {
    expect(() => normalizeMouserResponse({ Errors: [{ Message: "Invalid key" }] })).toThrow(
      SupplierError,
    );
    try {
      normalizeMouserResponse({ Errors: [{ Message: "Maximum calls per day exceeded" }] });
    } catch (e) {
      expect((e as SupplierError).code).toBe("RATE_LIMITED");
    }
    expect(() => normalizeMouserResponse("<html>")).toThrow(SupplierError);
  });

  it("requisições: limites de registros e de códigos por consulta", () => {
    const kw = buildKeywordRequest("  contator  ", 999) as {
      SearchByKeywordRequest: { keyword: string; records: number };
    };
    expect(kw.SearchByKeywordRequest.keyword).toBe("contator");
    expect(kw.SearchByKeywordRequest.records).toBe(50);
    const codes = Array.from({ length: 15 }, (_, i) => `A${i}|X`);
    const pn = buildPartNumberRequest(codes) as {
      SearchByPartRequest: { mouserPartNumber: string };
    };
    const sent = pn.SearchByPartRequest.mouserPartNumber.split("|");
    expect(sent).toHaveLength(MOUSER_MAX_PARTS_PER_QUERY);
    expect(sent[0]).toBe("A0X"); // "|" do usuário não injeta códigos extras
  });
});

describe("cadastro manual — número local", () => {
  it("vírgula decimal, vazio e inválido", () => {
    expect(parseLocaleNumber("1.234,50")).toBe(1234.5);
    expect(parseLocaleNumber("9.5")).toBe(9.5);
    expect(parseLocaleNumber("")).toBeNull();
    expect(parseLocaleNumber("abc")).toBeUndefined();
    expect(parseLocaleNumber("-3")).toBeUndefined();
  });
});

describe("segurança do catálogo da empresa", () => {
  const migration = read("../../supabase/migrations/20261116140000_tenant_catalog_items.sql");
  const fns = read("../lib/tenant-catalog.functions.ts");
  const client = read("../lib/catalog/mouser-client.server.ts");

  it("RLS: leitura por membro, escrita só owner/admin/engineer, anon sem acesso", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.tenant_catalog_items FROM anon");
    for (const cmd of ["INSERT", "UPDATE", "DELETE"]) {
      const block = migration.split(`FOR ${cmd} TO authenticated`)[1] ?? "";
      expect(block.slice(0, 700)).toContain("tm.role IN ('owner', 'admin', 'engineer')");
    }
    expect(migration).toContain("(SELECT auth.uid())");
  });

  it("catálogo começa vazio: a migration não insere itens", () => {
    expect(migration).not.toMatch(/INSERT INTO public\.tenant_catalog_items/i);
  });

  it("chave da Mouser só no servidor, host fixo, sem redirecionamento", () => {
    expect(client).toContain("process.env.MOUSER_API_KEY");
    expect(client).toContain('redirect: "error"');
    expect(client).toMatch(/https:\/\/\$\{MOUSER_HOST\}/);
    expect(fns).not.toContain("MOUSER_API_KEY");
  });

  it("importação do distribuidor reconsulta o preço no servidor e tem rate limit", () => {
    const importFn = fns.slice(fns.indexOf("export const importSupplierParts"));
    expect(importFn).toContain("fetchMouserParts");
    expect(importFn).toContain("enforceSupplierRateLimit");
    // a entrada só aceita códigos, nunca preço
    const schema = fns.slice(fns.indexOf("const SupplierCodesSchema"), fns.indexOf("/** Importa"));
    expect(schema).not.toMatch(/price/i);
  });

  it("toda escrita exige papel de escrita e filtra pelo tenant", () => {
    for (const name of [
      "saveTenantCatalogItem",
      "deleteTenantCatalogItems",
      "importTenantCatalogRows",
      "importSupplierParts",
      "refreshSupplierPrices",
    ]) {
      const start = fns.indexOf(`export const ${name}`);
      const body = fns.slice(
        start,
        fns.indexOf("export const", start + 10) > 0
          ? fns.indexOf("export const", start + 10)
          : undefined,
      );
      expect(body, name).toContain("requireWrite(access)");
      expect(body, name).toContain("requireSupabaseAuth");
    }
  });
});
