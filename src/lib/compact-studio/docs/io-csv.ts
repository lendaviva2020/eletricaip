/**
 * Hardened CSV Export & Import for Symbolic I/O Tables.
 * Prevents OWASP CSV/Spreadsheet Formula Injection (=, +, -, @, \t, \r)
 * by reusing sanitizeSpreadsheetFormulaString and bounded parsing limits.
 */
import Papa from "papaparse";
import { sanitizeSpreadsheetFormulaString } from "@/lib/security/safe-xlsx";
import { CompactIoSymbolSchema } from "../domain/schemas";
import type { CompactIoSymbol } from "../domain/types";

const MAX_CSV_BYTES = 512 * 1024;
const MAX_CSV_ROWS = 5000;

export function exportIoSymbolsToCsv(symbols: readonly CompactIoSymbol[]): string {
  const rows = symbols.map((s) => ({
    id: sanitizeSpreadsheetFormulaString(s.id),
    ioKind: sanitizeSpreadsheetFormulaString(s.ioKind),
    address: sanitizeSpreadsheetFormulaString(s.address),
    symbolicName: sanitizeSpreadsheetFormulaString(s.symbolicName),
    signalType: sanitizeSpreadsheetFormulaString(s.signalType),
    retentive: s.retentive ? "true" : "false",
    initialValue: sanitizeSpreadsheetFormulaString(String(s.initialValue)),
    comment: sanitizeSpreadsheetFormulaString(s.comment),
  }));

  return Papa.unparse(rows, {
    quotes: true,
    newline: "\r\n",
  });
}

export interface CsvImportOutcome {
  readonly ok: boolean;
  readonly symbols: readonly CompactIoSymbol[];
  readonly errors: readonly string[];
}

function stripLeadingDanger(val: string): string {
  return val.replace(/^['=+\-@\t\r]+/, (prefix) => {
    if (prefix.startsWith("'") && prefix.length === 1) return "";
    if (/^-\d+(\.\d+)?$/.test(val.trim())) return prefix;
    return "";
  });
}

export function importIoSymbolsFromCsv(csvText: string): CsvImportOutcome {
  if (typeof csvText !== "string") {
    return { ok: false, symbols: [], errors: ["Conteúdo CSV inválido."] };
  }
  if (csvText.length > MAX_CSV_BYTES) {
    return {
      ok: false,
      symbols: [],
      errors: [`Arquivo CSV excede o limite de segurança de ${MAX_CSV_BYTES} bytes.`],
    };
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.data.length > MAX_CSV_ROWS) {
    return {
      ok: false,
      symbols: [],
      errors: [`CSV excede o limite máximo de ${MAX_CSV_ROWS} linhas.`],
    };
  }

  const symbols: CompactIoSymbol[] = [];
  const errors: string[] = [];

  parsed.data.forEach((rawRow, idx) => {
    const lineNum = idx + 2;
    const rawInit = (rawRow.initialValue ?? "").trim();
    const signalType = (rawRow.signalType ?? "BOOL").trim();
    const parsedInitial =
      signalType === "BOOL"
        ? rawInit === "true" || rawInit === "1"
        : signalType === "INT" || signalType === "REAL" || signalType === "TIME"
          ? Number.isFinite(Number(rawInit))
            ? Number(rawInit)
            : 0
          : stripLeadingDanger(rawInit);

    const candidate = {
      id: stripLeadingDanger(String(rawRow.id ?? `sym_csv_${lineNum}`)).trim() || `sym_csv_${lineNum}`,
      ioKind: String(rawRow.ioKind ?? "DI").trim(),
      address: stripLeadingDanger(String(rawRow.address ?? "")).trim(),
      symbolicName: stripLeadingDanger(String(rawRow.symbolicName ?? "")).trim(),
      signalType,
      retentive: String(rawRow.retentive ?? "false").trim().toLowerCase() === "true",
      initialValue: parsedInitial,
      comment: stripLeadingDanger(String(rawRow.comment ?? "")),
    };

    const validated = CompactIoSymbolSchema.safeParse(candidate);
    if (!validated.success) {
      errors.push(
        `Linha ${lineNum}: ${validated.error.issues.map((i) => i.message).join("; ")}`,
      );
      return;
    }
    symbols.push(validated.data);
  });

  return {
    ok: errors.length === 0,
    symbols,
    errors,
  };
}
