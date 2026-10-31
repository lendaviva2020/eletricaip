import { DEFAULT_IMPORTER_LIMITS, type ImporterLimits } from "./types";

// Zero Trust Security Engine for External Project Importation
// Defends against Prototype Pollution, XSS, DoS/ReDoS, Code Injection, and XXE.
// Strict bounds, no eval, no Function, no remote resource resolution.

export const MAX_PAYLOAD_BYTES = DEFAULT_IMPORTER_LIMITS.maxPayloadBytes; // 25 MB
export const MAX_OBJECT_DEPTH = DEFAULT_IMPORTER_LIMITS.maxObjectDepth; // 15
export const MAX_TOTAL_KEYS = DEFAULT_IMPORTER_LIMITS.maxTotalKeys; // 150000

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const DANGEROUS_STRING_PATTERNS = [
  /<script\b/i,
  /<\/script>/i,
  /javascript:/i,
  /data:text\/html/i,
  /vbscript:/i,
  /\bonerror\s*=/i,
  /\bonload\s*=/i,
  /\bonclick\s*=/i,
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bsetTimeout\s*\(/i,
  /\bsetInterval\s*\(/i,
];

export interface SecurityCheckResult {
  isSafe: boolean;
  safe: boolean;
  violations: string[];
  issues: { id: string; message: string }[];
}

export function validatePayloadSize(
  raw: string | ArrayBuffer,
  customLimits?: Partial<ImporterLimits>,
): SecurityCheckResult {
  const limits: ImporterLimits = { ...DEFAULT_IMPORTER_LIMITS, ...customLimits };
  const size = typeof raw === "string" ? new Blob([raw]).size : raw.byteLength;

  if (size > limits.maxPayloadBytes) {
    const limitMb = (limits.maxPayloadBytes / (1024 * 1024)).toFixed(1);
    const actualMb = (size / (1024 * 1024)).toFixed(2);
    const msg = `Tamanho da carga útil (${actualMb} MB) excede o limite máximo permitido de ${limitMb} MB.`;
    return {
      isSafe: false,
      safe: false,
      violations: [msg],
      issues: [{ id: "payload-too-large", message: msg }],
    };
  }

  if (typeof raw === "string") {
    const lineCount = raw.split(/\r?\n/).length;
    if (lineCount > limits.maxLines) {
      const msg = `Quantidade de linhas (${lineCount.toLocaleString()}) excede o limite configurado de ${limits.maxLines.toLocaleString()} linhas.`;
      return {
        isSafe: false,
        safe: false,
        violations: [msg],
        issues: [{ id: "line-count-exceeded", message: msg }],
      };
    }
  }

  return { isSafe: true, safe: true, violations: [], issues: [] };
}

export function scanObjectForSecurityViolations(
  obj: unknown,
  currentDepth = 0,
  keyCountRef = { count: 0 },
  customLimits?: Partial<ImporterLimits>,
): SecurityCheckResult {
  const limits: ImporterLimits = { ...DEFAULT_IMPORTER_LIMITS, ...customLimits };
  const violations: string[] = [];
  const issues: { id: string; message: string }[] = [];

  if (currentDepth > limits.maxObjectDepth) {
    const msg = `Profundidade excessiva da estrutura (${currentDepth} níveis). Limite: ${limits.maxObjectDepth}.`;
    return {
      isSafe: false,
      safe: false,
      violations: [msg],
      issues: [{ id: "depth-exceeded", message: msg }],
    };
  }

  if (obj === null || obj === undefined) {
    return { isSafe: true, safe: true, violations: [], issues: [] };
  }

  if (typeof obj === "string") {
    if (obj.length > limits.maxPropertyLength) {
      const msg = `Propriedade de texto com tamanho excessivo (${obj.length.toLocaleString()} caracteres). Limite: ${limits.maxPropertyLength.toLocaleString()}.`;
      violations.push(msg);
      issues.push({ id: "property-length-exceeded", message: msg });
    }
    for (const pat of DANGEROUS_STRING_PATTERNS) {
      if (pat.test(obj)) {
        const msg = `Tentativa de injeção de script ou código executável detectada: "${obj.slice(0, 60)}..."`;
        violations.push(msg);
        issues.push({ id: "script-injection", message: msg });
        break;
      }
    }
    const isSafe = violations.length === 0;
    return { isSafe, safe: isSafe, violations, issues };
  }

  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) {
      const msg = `Valor numérico inválido ou infinito encontrado (${obj}).`;
      violations.push(msg);
      issues.push({ id: "invalid-number", message: msg });
    }
    const isSafe = violations.length === 0;
    return { isSafe, safe: isSafe, violations, issues };
  }

  if (typeof obj === "function" || typeof obj === "symbol") {
    const msg = "Funções e símbolos JavaScript não são permitidos em cargas externas.";
    violations.push(msg);
    issues.push({ id: "prohibited-type", message: msg });
    return { isSafe: false, safe: false, violations, issues };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      keyCountRef.count++;
      if (keyCountRef.count > limits.maxTotalKeys) {
        const msg = `Quantidade excessiva de elementos na estrutura (${keyCountRef.count.toLocaleString()}). Limite: ${limits.maxTotalKeys.toLocaleString()}.`;
        return {
          isSafe: false,
          safe: false,
          violations: [msg],
          issues: [{ id: "too-many-keys", message: msg }],
        };
      }
      const childRes = scanObjectForSecurityViolations(
        obj[i],
        currentDepth + 1,
        keyCountRef,
        customLimits,
      );
      if (!childRes.isSafe) {
        violations.push(...childRes.violations);
        issues.push(...childRes.issues);
      }
    }
    const isSafe = violations.length === 0;
    return { isSafe, safe: isSafe, violations, issues };
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>);
    for (const k of keys) {
      keyCountRef.count++;
      if (keyCountRef.count > limits.maxTotalKeys) {
        const msg = `Quantidade excessiva de propriedades no objeto (${keyCountRef.count.toLocaleString()}). Limite: ${limits.maxTotalKeys.toLocaleString()}.`;
        return {
          isSafe: false,
          safe: false,
          violations: [msg],
          issues: [{ id: "too-many-keys", message: msg }],
        };
      }

      // ── Defesa contra Prototype Pollution ─────────────────────────────────
      if (DANGEROUS_KEYS.has(k.toLowerCase().trim())) {
        const msg = `Tentativa de Prototype Pollution detectada através da propriedade proibida "${k}".`;
        violations.push(msg);
        issues.push({ id: "prototype-pollution", message: msg });
        return { isSafe: false, safe: false, violations, issues };
      }

      // Checa a chave em si contra scripts
      for (const pat of DANGEROUS_STRING_PATTERNS) {
        if (pat.test(k)) {
          const msg = `Nome de propriedade malicioso detectado: "${k}".`;
          violations.push(msg);
          issues.push({ id: "script-injection", message: msg });
          break;
        }
      }

      const val = (obj as Record<string, unknown>)[k];
      const childRes = scanObjectForSecurityViolations(
        val,
        currentDepth + 1,
        keyCountRef,
        customLimits,
      );
      if (!childRes.isSafe) {
        violations.push(...childRes.violations);
        issues.push(...childRes.issues);
      }
    }
  }

  const isSafe = violations.length === 0;
  return { isSafe, safe: isSafe, violations, issues };
}

/**
 * Validação rigorosa contra XML External Entity (XXE) e DTD Injection.
 */
export function validateXmlSecurity(xmlString: string): SecurityCheckResult {
  const violations: string[] = [];
  const issues: { id: string; message: string }[] = [];

  if (/<!DOCTYPE\b/i.test(xmlString)) {
    const msg =
      "Declaração <!DOCTYPE proibida por motivos de segurança (proteção contra XXE/Billion Laughs).";
    violations.push(msg);
    issues.push({ id: "xxe-doctype-prohibited", message: msg });
  }

  if (/<!ENTITY\b/i.test(xmlString)) {
    const msg = "Declaração <!ENTITY proibida (proteção contra injeção de entidades XML externas).";
    violations.push(msg);
    issues.push({ id: "xxe-entity-prohibited", message: msg });
  }

  if (/\bSYSTEM\b/i.test(xmlString) || /\bPUBLIC\b/i.test(xmlString)) {
    if (/<!(DOCTYPE|ENTITY)/i.test(xmlString)) {
      const msg = "Uso de SYSTEM ou PUBLIC em entidades XML é estritamente proibido.";
      violations.push(msg);
      issues.push({ id: "xxe-system-prohibited", message: msg });
    }
  }

  if (/xmlns:xi\b/i.test(xmlString) || /<xi:include\b/i.test(xmlString)) {
    const msg = "XInclude não é suportado por motivos de segurança.";
    violations.push(msg);
    issues.push({ id: "xxe-xinclude-prohibited", message: msg });
  }

  const isSafe = violations.length === 0;
  return { isSafe, safe: isSafe, violations, issues };
}

export function scanPayloadSecurity(
  raw: string,
  customLimits?: Partial<ImporterLimits>,
): SecurityCheckResult {
  const sizeCheck = validatePayloadSize(raw, customLimits);
  if (!sizeCheck.isSafe) return sizeCheck;

  // XML XXE/DTD check
  if (raw.startsWith("<") || raw.startsWith("<?xml") || /<[a-zA-Z]/i.test(raw)) {
    const xmlCheck = validateXmlSecurity(raw);
    if (!xmlCheck.isSafe) return xmlCheck;
  }

  // Raw prototype pollution search
  if (/(["'])?(?:__proto__|constructor|prototype)\1\s*:/i.test(raw)) {
    const msg = "Tentativa de Prototype Pollution detectada na carga bruta.";
    return {
      isSafe: false,
      safe: false,
      violations: [msg],
      issues: [{ id: "prototype-pollution", message: msg }],
    };
  }

  // Dangerous string patterns in raw text
  for (const pattern of DANGEROUS_STRING_PATTERNS) {
    if (pattern.test(raw)) {
      const msg = `Padrão inseguro detectado no texto: ${pattern}`;
      return {
        isSafe: false,
        safe: false,
        violations: [msg],
        issues: [{ id: "script-injection", message: msg }],
      };
    }
  }

  // JSON deep parse check if applicable
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return scanObjectForSecurityViolations(parsed, 0, { count: 0 }, customLimits);
    } catch {
      // Syntax error handled in parser adapter
    }
  }

  return { isSafe: true, safe: true, violations: [], issues: [] };
}
