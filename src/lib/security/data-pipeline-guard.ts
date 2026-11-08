/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * Data Serialization, Static Route Path Normalization, QS & SourceMap Guards
 *
 * Mitigates and enforces regression defenses for:
 * - CVE-2026-116582 & CVE-2026-116583 (seroval >= 1.6.11): RegExp XSS & typed-array constructor execution
 * - CVE-2026-111757 & CVE-2026-118663 (hono >= 4.13.11 & @hono/node-server >= 2.1.3): double percent-decoding middleware bypass
 * - CVE-2026-110816 (qs >= 6.16.1): unhandled exception on malformed array/object coercion
 * - CVE-2026-93749 (source-map-js >= 1.2.2): malformed source map / path traversal
 * - Section 7 (Gate 3.8.1 Privileged Immutability Hardening): External Signed Hash Anchor verification
 *   detecting privileged admin truncation, substitution, and full-chain recomputation.
 */

import { createHmac } from "node:crypto";

export const DATA_PIPELINE_GUARD_VERSION = "3.8.2-DATA-PIPELINE-GUARD-v1.0";

const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);

/**
 * Validates objects before `seroval` serialization to block:
 * - CVE-2026-116582: RegExp instances carrying unescaped HTML/script flags or closing tags
 * - CVE-2026-116583: TypedArray instances with overridden `constructor` or `buffer` properties
 */
export function validateSafeSerializableValue(
  value: unknown,
  depth = 0,
  maxDepth = 32,
): { safe: boolean; reason?: string } {
  if (depth > maxDepth) {
    return { safe: false, reason: "MAX_SERIALIZATION_DEPTH_EXCEEDED" };
  }
  if (value === null || value === undefined) {
    return { safe: true };
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return { safe: false, reason: "NON_SERIALIZABLE_PRIMITIVE" };
  }
  if (typeof value !== "object") {
    return { safe: true };
  }

  // CVE-2026-116582: Check RegExp source for script/HTML breakout sequences
  if (value instanceof RegExp) {
    if (/<\/?\s*script|[\r\n\u2028\u2029]/i.test(value.source)) {
      return {
        safe: false,
        reason: "UNSAFE_REGEXP_SERIALIZATION_PAYLOAD (CVE-2026-116582)",
      };
    }
    return { safe: true };
  }

  // CVE-2026-116583: Check TypedArray / ArrayBuffer for shadowed own `constructor` or `buffer` properties
  if (
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    Object.prototype.isPrototypeOf.call(TypedArrayPrototype, value)
  ) {
    if (
      Object.prototype.hasOwnProperty.call(value, "constructor") ||
      Object.prototype.hasOwnProperty.call(value, "buffer") ||
      Object.prototype.hasOwnProperty.call(value, "__proto__")
    ) {
      return {
        safe: false,
        reason: "TAMPERED_TYPED_ARRAY_CONSTRUCTOR_PROPERTY (CVE-2026-116583)",
      };
    }
    return { safe: true };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const check = validateSafeSerializableValue(item, depth + 1, maxDepth);
      if (!check.safe) return check;
    }
    return { safe: true };
  }

  const record = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(record, "__proto__") ||
    Object.prototype.hasOwnProperty.call(record, "constructor") ||
    Object.prototype.hasOwnProperty.call(record, "prototype")
  ) {
    return { safe: false, reason: "PROTOTYPE_POLLUTION_KEY_DETECTED" };
  }

  for (const key of Object.keys(record)) {
    const check = validateSafeSerializableValue(record[key], depth + 1, maxDepth);
    if (!check.safe) return check;
  }

  return { safe: true };
}

/**
 * Normalizes and validates HTTP request paths for static asset & protected routes,
 * blocking percent-encoded path traversal (`%2e%2e`, `%252e%252e`), null bytes,
 * backslashes, and double-decoding middleware bypasses (CVE-2026-118663 & CVE-2026-111757).
 */
export function normalizeAndValidateRoutePath(rawPath: string): {
  safe: boolean;
  normalizedPath: string;
  reason?: string;
} {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/")) {
    return { safe: false, normalizedPath: "/", reason: "INVALID_PATH_PREFIX" };
  }
  if (rawPath.length > 2048) {
    return { safe: false, normalizedPath: "/", reason: "PATH_TOO_LONG" };
  }

  // Block null bytes and backslashes before and after decoding
  if (rawPath.includes("\0") || rawPath.includes("\\") || /%00|%5c/i.test(rawPath)) {
    return {
      safe: false,
      normalizedPath: "/",
      reason: "FORBIDDEN_ENCODED_SEPARATOR_OR_NULL_BYTE",
    };
  }

  // Detect double-encoding sequences (%252e, %252f, %255c) used in CVE-2026-118663
  if (/%25(?:2e|2f|5c|00)/i.test(rawPath)) {
    return {
      safe: false,
      normalizedPath: "/",
      reason: "DOUBLE_PERCENT_ENCODING_BYPASS_ATTEMPT (CVE-2026-118663)",
    };
  }

  let decodedOnce: string;
  let decodedTwice: string;
  try {
    decodedOnce = decodeURIComponent(rawPath);
    decodedTwice = decodeURIComponent(decodedOnce);
  } catch {
    return { safe: false, normalizedPath: "/", reason: "MALFORMED_URI_ENCODING" };
  }

  if (decodedOnce !== decodedTwice) {
    return {
      safe: false,
      normalizedPath: "/",
      reason: "MULTI_LAYER_PERCENT_ENCODING_REJECTED (CVE-2026-118663)",
    };
  }

  const segments = decodedOnce.split("/");
  const cleanSegments: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." || seg.includes("..")) {
      return {
        safe: false,
        normalizedPath: "/",
        reason: "PATH_TRAVERSAL_DETECTED",
      };
    }
    cleanSegments.push(seg);
  }

  return {
    safe: true,
    normalizedPath: "/" + cleanSegments.join("/"),
  };
}

/**
 * Safely parses query strings with strict bounds on parameter count, array index limit,
 * and depth, preventing `qs` unhandled exceptions on invalid array/object coercion (CVE-2026-110816).
 */
export function parseSafeQueryString(
  rawQuery: string,
  options: { maxLength?: number; maxParams?: number } = {},
): Record<string, string | string[]> {
  const maxLength = options.maxLength ?? 4096;
  const maxParams = options.maxParams ?? 64;

  if (typeof rawQuery !== "string") {
    throw new TypeError("Query string must be a string.");
  }
  if (rawQuery.length > maxLength) {
    throw new RangeError(`Query string exceeds maximum length (${maxLength}).`);
  }

  const trimmed = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  if (!trimmed) return {};

  const searchParams = new URLSearchParams(trimmed);
  const result: Record<string, string | string[]> = Object.create(null);
  let count = 0;

  for (const [rawKey, value] of searchParams.entries()) {
    count++;
    if (count > maxParams) {
      throw new RangeError(`Query parameter count exceeds maximum (${maxParams}).`);
    }
    const cleanKey = rawKey.replace(/\[.*?\]/g, "").trim();
    if (
      !cleanKey ||
      cleanKey === "__proto__" ||
      cleanKey === "constructor" ||
      cleanKey === "prototype"
    ) {
      continue;
    }
    const existing = result[cleanKey];
    if (existing === undefined) {
      result[cleanKey] = value;
    } else if (Array.isArray(existing)) {
      if (existing.length >= 32) {
        throw new RangeError(`Query array parameter '${cleanKey}' exceeds max items (32).`);
      }
      existing.push(value);
    } else {
      result[cleanKey] = [existing, value];
    }
  }

  return { ...result };
}

/**
 * Validates a SourceMap JSON payload against CVE-2026-93749 (malformed source map / path traversal).
 */
export function validateSafeSourceMap(rawSourceMapJson: string): {
  valid: boolean;
  reason?: string;
} {
  if (typeof rawSourceMapJson !== "string" || rawSourceMapJson.length > 2 * 1024 * 1024) {
    return { valid: false, reason: "SOURCEMAP_SIZE_EXCEEDED" };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawSourceMapJson) as Record<string, unknown>;
  } catch {
    return { valid: false, reason: "MALFORMED_SOURCEMAP_JSON" };
  }

  if (parsed.version !== 3) {
    return { valid: false, reason: "UNSUPPORTED_SOURCEMAP_VERSION" };
  }
  if (typeof parsed.mappings !== "string") {
    return { valid: false, reason: "INVALID_SOURCEMAP_MAPPINGS" };
  }
  if (!Array.isArray(parsed.sources) || parsed.sources.length > 5000) {
    return { valid: false, reason: "INVALID_SOURCEMAP_SOURCES_ARRAY" };
  }
  for (const src of parsed.sources) {
    if (typeof src !== "string") {
      return { valid: false, reason: "NON_STRING_SOURCEMAP_ENTRY" };
    }
    if (src.includes("..") || src.includes("\0") || /^[a-zA-Z]:\\/.test(src)) {
      return {
        valid: false,
        reason: "SOURCEMAP_PATH_TRAVERSAL_DETECTED (CVE-2026-93749)",
      };
    }
  }
  return { valid: true };
}

/**
 * Section 7 — Privileged Admin Tamper Detection via External Signed Hash Anchors.
 *
 * A local SHA-256 hash chain and PostgreSQL BEFORE UPDATE/DELETE triggers protect against
 * application-role mutations, but a database superuser (`postgres` / `service_role` with DDL)
 * could theoretically disable triggers, delete/modify rows, and recompute `event_hash` + `prev_event_hash`.
 *
 * To detect privileged recomputation, truncation, or substitution, an out-of-band Witness Service
 * periodically signs checkpoints (`sequenceNumber`, `eventId`, `eventHash`, `chainLength`) using a
 * separate custody HMAC/signing key not stored in the database.
 */
export interface LedgerEventNode {
  sequenceNumber: number;
  eventId: string;
  payloadCanonical: string;
  prevEventHash: string | null;
  eventHash: string;
}

export interface ExternalSignedAnchor {
  anchorId: string;
  anchoredAtIso: string;
  sequenceNumber: number;
  eventId: string;
  eventHash: string;
  chainLength: number;
  witnessHmacSignature: string;
}

export function createExternalHashAnchor(
  ledgerEvents: readonly LedgerEventNode[],
  witnessCustodySecret: string,
): ExternalSignedAnchor {
  if (ledgerEvents.length === 0) {
    throw new Error("Cannot anchor an empty ledger.");
  }
  if (!witnessCustodySecret || witnessCustodySecret.length < 16) {
    throw new Error("Witness custody secret must be at least 16 characters.");
  }
  const tip = ledgerEvents[ledgerEvents.length - 1]!;
  const canonicalAnchorPayload = `${tip.sequenceNumber}|${tip.eventId}|${tip.eventHash}|${ledgerEvents.length}`;
  const signature = createHmac("sha256", witnessCustodySecret)
    .update(canonicalAnchorPayload)
    .digest("hex");

  return {
    anchorId: `anchor-${tip.sequenceNumber}-${tip.eventId}`,
    anchoredAtIso: new Date().toISOString(),
    sequenceNumber: tip.sequenceNumber,
    eventId: tip.eventId,
    eventHash: tip.eventHash,
    chainLength: ledgerEvents.length,
    witnessHmacSignature: signature,
  };
}

export function verifyLedgerAgainstExternalAnchors(
  ledgerEvents: readonly LedgerEventNode[],
  anchors: readonly ExternalSignedAnchor[],
  witnessCustodySecret: string,
  computeNodeHash: (node: Omit<LedgerEventNode, "eventHash">) => string,
): {
  intact: boolean;
  compromiseType?:
    | "ANCHOR_SIGNATURE_FORGED"
    | "PRIVILEGED_TRUNCATION_DETECTED"
    | "PRIVILEGED_RECOMPUTATION_OR_SUBSTITUTION_DETECTED"
    | "LOCAL_HASH_CHAIN_BROKEN";
  details?: string;
} {
  // 1. Verify internal hash chain consistency first
  for (let i = 0; i < ledgerEvents.length; i++) {
    const ev = ledgerEvents[i]!;
    const expectedPrev = i === 0 ? null : ledgerEvents[i - 1]!.eventHash;
    if (ev.prevEventHash !== expectedPrev) {
      return {
        intact: false,
        compromiseType: "LOCAL_HASH_CHAIN_BROKEN",
        details: `prevEventHash mismatch at sequence ${ev.sequenceNumber}`,
      };
    }
    const recomputed = computeNodeHash({
      sequenceNumber: ev.sequenceNumber,
      eventId: ev.eventId,
      payloadCanonical: ev.payloadCanonical,
      prevEventHash: ev.prevEventHash,
    });
    if (recomputed !== ev.eventHash) {
      return {
        intact: false,
        compromiseType: "LOCAL_HASH_CHAIN_BROKEN",
        details: `eventHash mismatch at sequence ${ev.sequenceNumber}`,
      };
    }
  }

  // 2. Verify against external signed anchors (detects privileged DB recomputation & truncation)
  const bySequence = new Map<number, LedgerEventNode>();
  for (const ev of ledgerEvents) {
    bySequence.set(ev.sequenceNumber, ev);
  }

  for (const anchor of anchors) {
    const canonicalAnchorPayload = `${anchor.sequenceNumber}|${anchor.eventId}|${anchor.eventHash}|${anchor.chainLength}`;
    const expectedSig = createHmac("sha256", witnessCustodySecret)
      .update(canonicalAnchorPayload)
      .digest("hex");

    if (expectedSig !== anchor.witnessHmacSignature) {
      return {
        intact: false,
        compromiseType: "ANCHOR_SIGNATURE_FORGED",
        details: `Witness signature invalid for anchor '${anchor.anchorId}'`,
      };
    }

    if (ledgerEvents.length < anchor.chainLength) {
      return {
        intact: false,
        compromiseType: "PRIVILEGED_TRUNCATION_DETECTED",
        details: `Ledger length (${ledgerEvents.length}) is shorter than anchored checkpoint length (${anchor.chainLength})`,
      };
    }

    const matchingEvent = bySequence.get(anchor.sequenceNumber);
    if (!matchingEvent) {
      return {
        intact: false,
        compromiseType: "PRIVILEGED_TRUNCATION_DETECTED",
        details: `Anchored sequence ${anchor.sequenceNumber} ('${anchor.eventId}') is missing from ledger`,
      };
    }

    if (
      matchingEvent.eventId !== anchor.eventId ||
      matchingEvent.eventHash !== anchor.eventHash
    ) {
      return {
        intact: false,
        compromiseType: "PRIVILEGED_RECOMPUTATION_OR_SUBSTITUTION_DETECTED",
        details: `Ledger event at sequence ${anchor.sequenceNumber} has hash '${matchingEvent.eventHash}', which contradicts external witness anchor '${anchor.eventHash}'`,
      };
    }
  }

  return { intact: true };
}
