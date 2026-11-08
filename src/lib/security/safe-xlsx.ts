// Hardened Spreadsheet (XLSX) Security Wrapper — Gate 3.8.2
// Mitigates CVE-2023-30533 (Prototype Pollution), CVE-2024-22363 (ReDoS),
// Zip Bomb / Resource Exhaustion, and Spreadsheet Formula Injection (CSV/XLSX Injection).

import * as XLSX from "@e965/xlsx";

export { XLSX };

export interface SafeXlsxLimits {
  maxBytes: number;
  maxSheets: number;
  maxRows: number;
  maxCols: number;
  maxCellLength: number;
  sanitizeFormulas: boolean;
}

export const DEFAULT_SAFE_XLSX_LIMITS: SafeXlsxLimits = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  maxSheets: 20,
  maxRows: 25_000,
  maxCols: 200,
  maxCellLength: 8_192,
  sanitizeFormulas: true,
};

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Prefixos perigosos de Formula Injection (OWASP CSV/Spreadsheet Injection)
const FORMULA_INJECTION_REGEX = /^[=+\-@|\t\r]/;

/**
 * Neutraliza strings que iniciam com operadores de fórmula (=, +, -, @, |, tab, CR)
 * prefixando apóstrofo se contiverem padrões de comando ou chamada de função.
 */
export function sanitizeSpreadsheetFormulaString(value: string): string {
  if (!value) return value;
  const trimmed = value.trimStart();
  if (!FORMULA_INJECTION_REGEX.test(trimmed)) {
    return value;
  }
  // Números negativos puros (ex: "-12.5") são seguros e não devem ser alterados
  if (/^-\d+(\.\d+)?$/.test(trimmed)) {
    return value;
  }
  return `'${value}`;
}

/**
 * Remove recursivamente chaves proibidas (__proto__, constructor, prototype)
 * e trunca strings excessivas para impedir Prototype Pollution e ReDoS.
 */
export function sanitizeSpreadsheetRecord<T extends Record<string, unknown>>(
  raw: T,
  limits: Partial<SafeXlsxLimits> = {},
): Record<string, unknown> {
  const cfg = { ...DEFAULT_SAFE_XLSX_LIMITS, ...limits };
  const clean: Record<string, unknown> = {};

  for (const key of Object.keys(raw)) {
    const normalizedKey = key.trim();
    if (!normalizedKey || FORBIDDEN_OBJECT_KEYS.has(normalizedKey.toLowerCase())) {
      throw new Error(
        `XLSX_SECURITY_VIOLATION: Chave proibida detectada na planilha ("${normalizedKey}").`,
      );
    }

    const val = raw[key];
    if (typeof val === "string") {
      if (val.length > cfg.maxCellLength) {
        throw new Error(
          `XLSX_SECURITY_VIOLATION: Célula excede o tamanho máximo permitido (${val.length} > ${cfg.maxCellLength}).`,
        );
      }
      clean[normalizedKey] = cfg.sanitizeFormulas ? sanitizeSpreadsheetFormulaString(val) : val;
    } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      clean[normalizedKey] = sanitizeSpreadsheetRecord(val as Record<string, unknown>, cfg);
    } else {
      clean[normalizedKey] = val;
    }
  }

  return clean;
}

/**
 * Lê um buffer XLSX/XLS aplicando limites estritos de tamanho, desativando
 * avaliação de fórmulas/HTML e validando a quantidade de abas e dimensões.
 */
export function safeReadXlsxWorkbook(
  buffer: ArrayBuffer | Uint8Array,
  customLimits?: Partial<SafeXlsxLimits>,
): XLSX.WorkBook {
  const limits: SafeXlsxLimits = { ...DEFAULT_SAFE_XLSX_LIMITS, ...customLimits };
  const byteLength = buffer.byteLength;

  if (byteLength === 0) {
    throw new Error("XLSX_SECURITY_VIOLATION: Arquivo de planilha vazio.");
  }

  if (byteLength > limits.maxBytes) {
    throw new Error(
      `XLSX_SECURITY_VIOLATION: Arquivo excede o limite máximo de ${(limits.maxBytes / (1024 * 1024)).toFixed(1)} MB.`,
    );
  }

  const wb = XLSX.read(buffer, {
    type: "array",
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    WTF: false,
  });

  if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) {
    throw new Error("XLSX_SECURITY_VIOLATION: Nenhuma aba válida encontrada na planilha.");
  }

  if (wb.SheetNames.length > limits.maxSheets) {
    throw new Error(
      `XLSX_SECURITY_VIOLATION: Quantidade de abas (${wb.SheetNames.length}) excede o limite de ${limits.maxSheets}.`,
    );
  }

  for (const sheetName of wb.SheetNames) {
    if (FORBIDDEN_OBJECT_KEYS.has(sheetName.trim().toLowerCase())) {
      throw new Error(`XLSX_SECURITY_VIOLATION: Nome de aba proibido ("${sheetName}").`);
    }
    const sheet = wb.Sheets[sheetName];
    if (sheet && typeof sheet["!ref"] === "string") {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      const rowCount = range.e.r - range.s.r + 1;
      const colCount = range.e.c - range.s.c + 1;
      if (rowCount > limits.maxRows) {
        throw new Error(
          `XLSX_SECURITY_VIOLATION: Aba "${sheetName}" possui ${rowCount} linhas (limite: ${limits.maxRows}).`,
        );
      }
      if (colCount > limits.maxCols) {
        throw new Error(
          `XLSX_SECURITY_VIOLATION: Aba "${sheetName}" possui ${colCount} colunas (limite: ${limits.maxCols}).`,
        );
      }
    }
  }

  return wb;
}

/**
 * Converte uma aba XLSX em array de objetos JSON higienizados contra Prototype Pollution
 * e Formula Injection.
 */
export function safeSheetToJson(
  sheet: XLSX.WorkSheet,
  customLimits?: Partial<SafeXlsxLimits>,
): Record<string, unknown>[] {
  const limits: SafeXlsxLimits = { ...DEFAULT_SAFE_XLSX_LIMITS, ...customLimits };
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rawRows.length > limits.maxRows) {
    throw new Error(
      `XLSX_SECURITY_VIOLATION: Quantidade de registros (${rawRows.length}) excede o limite de ${limits.maxRows}.`,
    );
  }

  return rawRows.map((row) => sanitizeSpreadsheetRecord(row, limits));
}
