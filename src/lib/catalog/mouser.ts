/**
 * Integração com a API de busca da Mouser (gratuita, chave pessoal em
 * https://www.mouser.com/api-search/; limite da Mouser: 30 chamadas/min e
 * 1000/dia). Módulo PURO: monta requisições e normaliza respostas. A chamada
 * HTTP fica em `mouser-client.server.ts` (a chave nunca vai ao navegador).
 *
 * Regras de dado real:
 *  - preço e moeda são os informados pela Mouser; nada é convertido;
 *  - campo ausente/ilegível vira `null`, nunca um valor presumido;
 *  - URLs só https (datasheet/produto), demais são descartadas.
 */
import { z } from "zod";

export const MOUSER_HOST = "api.mouser.com";
export const MOUSER_KEYWORD_PATH = "/api/v1/search/keyword";
export const MOUSER_PARTNUMBER_PATH = "/api/v1/search/partnumber";
/** A Mouser aceita até 10 códigos por consulta, separados por "|". */
export const MOUSER_MAX_PARTS_PER_QUERY = 10;
export const MOUSER_MAX_RECORDS = 50;

const PriceBreakSchema = z
  .object({
    Quantity: z.union([z.number(), z.string()]).optional().nullable(),
    Price: z.string().optional().nullable(),
    Currency: z.string().optional().nullable(),
  })
  .passthrough();

const PartSchema = z
  .object({
    Manufacturer: z.string().optional().nullable(),
    ManufacturerPartNumber: z.string().optional().nullable(),
    MouserPartNumber: z.string().optional().nullable(),
    Description: z.string().optional().nullable(),
    Category: z.string().optional().nullable(),
    DataSheetUrl: z.string().optional().nullable(),
    ProductDetailUrl: z.string().optional().nullable(),
    Availability: z.string().optional().nullable(),
    AvailabilityInStock: z.union([z.string(), z.number()]).optional().nullable(),
    PriceBreaks: z.array(PriceBreakSchema).optional().nullable(),
  })
  .passthrough();

export const MouserResponseSchema = z
  .object({
    Errors: z
      .array(z.object({ Message: z.string().optional().nullable() }).passthrough())
      .optional()
      .nullable(),
    SearchResults: z
      .object({
        NumberOfResult: z.number().optional().nullable(),
        Parts: z.array(z.unknown()).optional().nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough();

export interface SupplierPart {
  provider: "mouser";
  /** Código do distribuidor (chave para atualizar preço depois). */
  supplierPartNumber: string;
  manufacturer: string;
  partNumber: string;
  description: string | null;
  category: string | null;
  /** Preço unitário do primeiro degrau de quantidade, na moeda informada. */
  unitPrice: number | null;
  currency: string | null;
  /** Quantidade mínima do degrau de preço usado. */
  priceQuantity: number | null;
  stock: number | null;
  datasheetUrl: string | null;
  productUrl: string | null;
}

export interface SupplierSearchResult {
  parts: SupplierPart[];
  total: number;
  /** Partes recebidas mas descartadas por faltar fabricante/código. */
  discarded: number;
}

export class SupplierError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_CONFIGURED" | "UPSTREAM" | "BAD_RESPONSE" | "RATE_LIMITED",
  ) {
    super(message);
    this.name = "SupplierError";
  }
}

/** Corpo da busca por palavra-chave. */
export function buildKeywordRequest(keyword: string, records = 20): unknown {
  return {
    SearchByKeywordRequest: {
      keyword: keyword.trim().slice(0, 100),
      records: Math.min(Math.max(1, Math.trunc(records)), MOUSER_MAX_RECORDS),
      startingRecord: 0,
      searchOptions: "",
      searchWithYourSignUpLanguage: "",
    },
  };
}

/** Corpo da busca por código (até 10 códigos). */
export function buildPartNumberRequest(partNumbers: readonly string[]): unknown {
  const clean = partNumbers
    .map((p) => p.replace(/\|/g, "").trim())
    .filter(Boolean)
    .slice(0, MOUSER_MAX_PARTS_PER_QUERY);
  return {
    SearchByPartRequest: { mouserPartNumber: clean.join("|"), partSearchOptions: "Exact" },
  };
}

/**
 * Converte preço formatado ("R$ 1.234,56", "$1,234.56", "R$ 0,123") em número.
 * Regras do separador decimal:
 *  - "." e "," presentes → o ÚLTIMO dos dois é o decimal;
 *  - um só tipo, repetido ("1.234.567") → milhar;
 *  - um só tipo, uma vez → decimal, exceto 3 dígitos após ele com parte
 *    inteira diferente de "0" ("1,234" = mil duzentos e trinta e quatro).
 */
export function parseSupplierPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  if (raw.includes("-")) return null;
  const s = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const occurrences = s.split(sep).length - 1;
    const at = s.lastIndexOf(sep);
    const intPart = s.slice(0, at);
    const fraction = s.slice(at + 1);
    const looksThousands = fraction.length === 3 && intPart !== "0" && intPart !== "";
    if (occurrences === 1 && !looksThousands) decimalAt = at;
  }

  const normalized =
    decimalAt >= 0
      ? `${s.slice(0, decimalAt).replace(/[.,]/g, "")}.${s.slice(decimalAt + 1)}`
      : s.replace(/[.,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Estoque: "1.234 In Stock" → 1234; "None"/vazio → null. */
export function parseStock(
  inStock: string | number | null | undefined,
  availability: string | null | undefined,
): number | null {
  if (typeof inStock === "number") return Number.isFinite(inStock) && inStock >= 0 ? inStock : null;
  const src = (inStock ?? availability ?? "").toString();
  const m = /(\d[\d.,]*)/.exec(src);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function httpsOrNull(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function textOrNull(v: string | null | undefined, max: number): string | null {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

export function normalizeMouserPart(raw: unknown): SupplierPart | null {
  const parsed = PartSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const manufacturer = textOrNull(p.Manufacturer, 120);
  const partNumber = textOrNull(p.ManufacturerPartNumber, 120);
  const supplierPartNumber = textOrNull(p.MouserPartNumber, 120);
  if (!manufacturer || !partNumber || !supplierPartNumber) return null;

  const breaks = (p.PriceBreaks ?? [])
    .map((b) => ({
      qty: Number(b.Quantity),
      price: parseSupplierPrice(b.Price),
      currency: (b.Currency ?? "").trim().toUpperCase(),
    }))
    .filter((b) => b.price !== null && Number.isFinite(b.qty) && b.qty > 0)
    .sort((a, b) => a.qty - b.qty);
  // Preço sem moeda identificável não é dado utilizável: descarta os dois.
  const first = breaks.find((b) => /^[A-Z]{3}$/.test(b.currency));

  return {
    provider: "mouser",
    supplierPartNumber,
    manufacturer,
    partNumber,
    description: textOrNull(p.Description, 1000),
    category: textOrNull(p.Category, 120),
    unitPrice: first?.price ?? null,
    currency: first?.currency ?? null,
    priceQuantity: first?.qty ?? null,
    stock: parseStock(p.AvailabilityInStock, p.Availability),
    datasheetUrl: httpsOrNull(p.DataSheetUrl),
    productUrl: httpsOrNull(p.ProductDetailUrl),
  };
}

/** Valida e normaliza a resposta completa; erros da Mouser viram SupplierError. */
export function normalizeMouserResponse(body: unknown): SupplierSearchResult {
  const parsed = MouserResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new SupplierError("Resposta inesperada do distribuidor.", "BAD_RESPONSE");
  const errors = (parsed.data.Errors ?? []).map((e) => (e.Message ?? "").trim()).filter(Boolean);
  if (errors.length) {
    const msg = errors.join("; ").slice(0, 300);
    throw new SupplierError(
      `Distribuidor recusou a consulta: ${msg}`,
      /limit|exceed|too many/i.test(msg) ? "RATE_LIMITED" : "UPSTREAM",
    );
  }
  const rawParts = parsed.data.SearchResults?.Parts ?? [];
  const parts: SupplierPart[] = [];
  let discarded = 0;
  for (const r of rawParts) {
    const n = normalizeMouserPart(r);
    if (n) parts.push(n);
    else discarded++;
  }
  return {
    parts,
    total: parsed.data.SearchResults?.NumberOfResult ?? parts.length,
    discarded,
  };
}
