/**
 * Exportação de relatórios para Excel (.xlsx) — lista de materiais (BOM).
 *
 * Segurança: todo TEXTO vindo do projeto (part number, descrição, fabricante,
 * referência, observações) passa por `sanitizeSpreadsheetFormulaString`. Sem
 * isso, um item cadastrado como `=HYPERLINK("http://…")` ou `+cmd|…` vira
 * fórmula executável quando o cliente abre a planilha (CSV/Formula Injection,
 * OWASP). Números são gravados como números (não texto) para somas no Excel.
 */
import { sanitizeSpreadsheetFormulaString } from "@/lib/security/safe-xlsx";

export interface BomExportItem {
  part_number: string | null;
  description: string | null;
  manufacturer: string | null;
  quantity: number | string | null;
  unit: string | null;
  reference: string | null;
  notes: string | null;
  unit_price_brl: number | string | null;
  source: string | null;
}

export interface BomExportMeta {
  projectName: string;
  generatedAtIso: string;
  locale: "pt-BR" | "en";
}

const HEADERS: Record<BomExportMeta["locale"], readonly string[]> = {
  "pt-BR": [
    "Item",
    "Part number",
    "Descrição",
    "Fabricante",
    "Qtd.",
    "Unid.",
    "Referência",
    "Preço unit. (R$)",
    "Subtotal (R$)",
    "Origem",
    "Observações",
  ],
  en: [
    "Item",
    "Part number",
    "Description",
    "Manufacturer",
    "Qty",
    "Unit",
    "Reference",
    "Unit price (BRL)",
    "Subtotal (BRL)",
    "Source",
    "Notes",
  ],
};

const MAX_ROWS = 20_000;
const MAX_TEXT = 1_000;

function text(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return sanitizeSpreadsheetFormulaString(String(v).slice(0, MAX_TEXT));
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Linhas (AOA) da planilha — puro, testável sem o pacote xlsx. */
export function buildBomRows(
  items: readonly BomExportItem[],
  meta: BomExportMeta,
): (string | number)[][] {
  if (items.length > MAX_ROWS) throw new Error("bom_too_large_for_export");
  const pt = meta.locale === "pt-BR";
  const rows: (string | number)[][] = [
    [pt ? "Lista de Materiais" : "Bill of Materials", text(meta.projectName)],
    [pt ? "Gerado em" : "Generated at", meta.generatedAtIso],
    [],
    [...HEADERS[meta.locale]],
  ];
  let total = 0;
  items.forEach((it, i) => {
    const qty = num(it.quantity);
    const price = num(it.unit_price_brl);
    const subtotal = Math.round(qty * price * 100) / 100;
    total += subtotal;
    rows.push([
      i + 1,
      text(it.part_number),
      text(it.description),
      text(it.manufacturer),
      qty,
      text(it.unit),
      text(it.reference),
      price,
      subtotal,
      text(it.source),
      text(it.notes),
    ]);
  });
  rows.push([]);
  rows.push(["", "", "", "", "", "", "", pt ? "TOTAL" : "TOTAL", Math.round(total * 100) / 100]);
  return rows;
}

/** Gera o arquivo .xlsx (carrega o pacote de planilhas sob demanda). */
export async function buildBomWorkbook(
  items: readonly BomExportItem[],
  meta: BomExportMeta,
): Promise<Blob> {
  const { XLSX } = await import("@/lib/security/safe-xlsx");
  const rows = buildBomRows(items, meta);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [6, 22, 40, 18, 8, 7, 14, 14, 14, 12, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta.locale === "pt-BR" ? "BOM" : "BOM");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Nome de arquivo seguro: sem separadores de caminho nem caracteres de controle. */
export function safeReportFileName(projectName: string, suffix: string): string {
  const base = projectName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 60);
  return `${base || "projeto"}_${suffix}.xlsx`;
}
