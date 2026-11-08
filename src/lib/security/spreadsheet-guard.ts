/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * Spreadsheet (XLSX/CSV) Safe Parser & Prototype Pollution / ReDoS Guard
 *
 * Uses @e965/xlsx@0.20.3 (maintained SheetJS CE 0.20.3 npm distribution)
 * Mitigates and enforces regression defenses for:
 * - CVE-2023-30533 (HIGH): Prototype Pollution in SheetJS < 0.19.3
 * - CVE-2024-22363 (HIGH): Regular Expression Denial of Service (ReDoS) in SheetJS < 0.20.2
 */

import * as XLSX from "@e965/xlsx";

export const SPREADSHEET_GUARD_VERSION = "3.8.2-XLSX-GUARD-v1.0";

export interface SafeSpreadsheetOptions {
  maxBytes?: number;
  maxRows?: number;
  maxColumns?: number;
  maxCellLength?: number;
  maxProcessingTimeMs?: number;
}

const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/**
 * Deeply sanitizes a record or array of records parsed from a spreadsheet or CSV,
 * stripping `__proto__`, `constructor`, and `prototype` keys and enforcing bounds
 * on column count and cell string length.
 */
export function sanitizeSpreadsheetRecords(
  rawRecords: readonly Record<string, unknown>[],
  options: SafeSpreadsheetOptions = {},
): Array<Record<string, unknown>> {
  const maxRows = options.maxRows ?? 10_000;
  const maxColumns = options.maxColumns ?? 100;
  const maxCellLength = options.maxCellLength ?? 4_096;

  if (rawRecords.length > maxRows) {
    throw new RangeError(
      `Spreadsheet row count (${rawRecords.length}) exceeds maximum allowed (${maxRows}).`,
    );
  }

  const sanitizedRows: Array<Record<string, unknown>> = [];

  for (const row of rawRecords) {
    if (!row || typeof row !== "object") continue;
    const keys = Object.keys(row);
    if (keys.length > maxColumns) {
      throw new RangeError(
        `Spreadsheet column count (${keys.length}) exceeds maximum allowed (${maxColumns}).`,
      );
    }

    const cleanRow: Record<string, unknown> = Object.create(null);
    for (const rawKey of keys) {
      const trimmedKey = rawKey.trim();
      if (!trimmedKey || FORBIDDEN_PROTOTYPE_KEYS.has(trimmedKey)) {
        continue;
      }

      const rawVal = row[rawKey];
      if (typeof rawVal === "string") {
        if (rawVal.length > maxCellLength) {
          throw new RangeError(
            `Cell value in column '${trimmedKey}' exceeds maximum length (${maxCellLength}).`,
          );
        }
        cleanRow[trimmedKey] = rawVal;
      } else if (
        typeof rawVal === "number" ||
        typeof rawVal === "boolean" ||
        rawVal === null ||
        rawVal === undefined
      ) {
        cleanRow[trimmedKey] = rawVal ?? "";
      } else {
        cleanRow[trimmedKey] = String(rawVal).slice(0, maxCellLength);
      }
    }

    // Return a standard object whose own properties cannot pollute Object.prototype
    sanitizedRows.push({ ...cleanRow });
  }

  return sanitizedRows;
}

/**
 * Parses an untrusted XLSX/XLS binary buffer with strict limits on file size,
 * rows, columns, cell length, and processing time.
 */
export function parseSafeSpreadsheetBuffer(
  buffer: ArrayBuffer | Uint8Array,
  options: SafeSpreadsheetOptions = {},
): Array<Record<string, unknown>> {
  const startMs = performance.now();
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024; // 5 MB default
  const maxRows = options.maxRows ?? 10_000;
  const maxProcessingTimeMs = options.maxProcessingTimeMs ?? 2_000;

  const byteLength = buffer.byteLength;
  if (byteLength === 0) {
    throw new Error("Spreadsheet file is empty.");
  }
  if (byteLength > maxBytes) {
    throw new RangeError(
      `Spreadsheet file size (${byteLength} bytes) exceeds maximum (${maxBytes} bytes).`,
    );
  }

  const wb = XLSX.read(buffer, {
    type: "array",
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    sheetRows: maxRows + 2, // +1 for header, +1 to detect overflow
  });

  if (performance.now() - startMs > maxProcessingTimeMs) {
    throw new Error(`Spreadsheet parsing exceeded time budget (${maxProcessingTimeMs} ms).`);
  }

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Planilha vazia");
  }

  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error("Planilha vazia");
  }

  const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  const result = sanitizeSpreadsheetRecords(rawRecords, options);

  if (performance.now() - startMs > maxProcessingTimeMs) {
    throw new Error(
      `Spreadsheet post-processing exceeded time budget (${maxProcessingTimeMs} ms).`,
    );
  }

  return result;
}

export { XLSX };
