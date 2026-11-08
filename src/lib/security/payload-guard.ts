// HTTP Payload & Compressed Stream Guard — Gate 3.8.2
// Mitigates CVE-2026-111181 (HIGH): DoS via unhandled decompression stream error in body-parser.

import { gunzipSync, inflateSync } from "node:zlib";

export interface PayloadGuardOptions {
  maxCompressedBytes?: number;
  maxDecompressedBytes?: number;
  allowedEncodings?: readonly string[];
}

const DEFAULT_MAX_COMPRESSED_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_ALLOWED_ENCODINGS = ["identity", "gzip", "deflate"] as const;

export interface SafePayloadResult {
  ok: boolean;
  bodyText?: string;
  statusCode: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Decodifica e descomprime um payload HTTP com limites estritos de memória
 * (`maxOutputLength`) e captura determinística de erros de stream/zlib,
 * impedindo crashes por streams gzip/deflate corrompidos ou zip bombs (CVE-2026-111181).
 */
export function safeDecodeHttpPayload(
  rawBytes: Uint8Array,
  contentEncodingHeader: string | null | undefined,
  options: PayloadGuardOptions = {},
): SafePayloadResult {
  const maxCompressed = options.maxCompressedBytes ?? DEFAULT_MAX_COMPRESSED_BYTES;
  const maxDecompressed = options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
  const allowedEncodings = options.allowedEncodings ?? DEFAULT_ALLOWED_ENCODINGS;

  if (rawBytes.byteLength > maxCompressed) {
    return {
      ok: false,
      statusCode: 413,
      errorCode: "PAYLOAD_TOO_LARGE",
      errorMessage: `Payload comprimido (${rawBytes.byteLength} bytes) excede o limite de ${maxCompressed} bytes.`,
    };
  }

  const encoding = (contentEncodingHeader ?? "identity").trim().toLowerCase();
  if (!allowedEncodings.includes(encoding)) {
    return {
      ok: false,
      statusCode: 415,
      errorCode: "UNSUPPORTED_CONTENT_ENCODING",
      errorMessage: `Content-Encoding "${encoding}" não suportado.`,
    };
  }

  try {
    let decodedBytes: Uint8Array;
    if (encoding === "identity" || encoding === "") {
      if (rawBytes.byteLength > maxDecompressed) {
        return {
          ok: false,
          statusCode: 413,
          errorCode: "PAYLOAD_TOO_LARGE",
          errorMessage: `Payload excede o limite de ${maxDecompressed} bytes.`,
        };
      }
      decodedBytes = rawBytes;
    } else if (encoding === "gzip") {
      decodedBytes = gunzipSync(rawBytes, { maxOutputLength: maxDecompressed });
      if (decodedBytes.byteLength > maxDecompressed) {
        return {
          ok: false,
          statusCode: 413,
          errorCode: "DECOMPRESSION_LIMIT_EXCEEDED",
          errorMessage:
            "Payload descomprimido excede o limite de segurança (proteção contra Zip Bomb).",
        };
      }
    } else if (encoding === "deflate") {
      decodedBytes = inflateSync(rawBytes, { maxOutputLength: maxDecompressed });
      if (decodedBytes.byteLength > maxDecompressed) {
        return {
          ok: false,
          statusCode: 413,
          errorCode: "DECOMPRESSION_LIMIT_EXCEEDED",
          errorMessage:
            "Payload descomprimido excede o limite de segurança (proteção contra Zip Bomb).",
        };
      }
    } else {
      return {
        ok: false,
        statusCode: 415,
        errorCode: "UNSUPPORTED_CONTENT_ENCODING",
        errorMessage: `Content-Encoding "${encoding}" não permitido.`,
      };
    }

    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(decodedBytes);
    return {
      ok: true,
      statusCode: 200,
      bodyText,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code ?? "";
    const isRangeErr =
      err instanceof RangeError ||
      code === "ERR_BUFFER_TOO_LARGE" ||
      /maxOutputLength|buffer length|too large|exceeded|out of memory/i.test(msg);
    return {
      ok: false,
      statusCode: isRangeErr ? 413 : 400,
      errorCode: isRangeErr ? "DECOMPRESSION_LIMIT_EXCEEDED" : "MALFORMED_COMPRESSED_STREAM",
      errorMessage: isRangeErr
        ? "Payload descomprimido excede o limite de segurança (proteção contra Zip Bomb)."
        : "Stream comprimido malformado ou corrompido rejeitado com segurança.",
    };
  }
}
