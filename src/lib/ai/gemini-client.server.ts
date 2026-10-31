// Centralized Google Gemini client — runs exclusively in server-side runtimes.
// Uses official @google/genai SDK with configurable model identifier.
import { GoogleGenAI } from "@google/genai";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview";

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim();
}

export function validateGeminiKey(key?: string): { ok: boolean; reason?: string } {
  if (!key) {
    return { ok: false, reason: "GEMINI_API_KEY ausente nos secrets do servidor." };
  }
  if (key.length < 15 || /\s/.test(key)) {
    return { ok: false, reason: "GEMINI_API_KEY com formato inesperado." };
  }
  return { ok: true };
}

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | null = null;

export function getGeminiClient(customKey?: string): GoogleGenAI {
  const key = customKey ?? getGeminiApiKey();
  const validation = validateGeminiKey(key);
  if (!validation.ok || !key) {
    throw new Error(validation.reason || "GEMINI_API_KEY inválida.");
  }

  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }

  const client = new GoogleGenAI({ apiKey: key });
  cachedClient = client;
  cachedKey = key;
  return client;
}

export type GeminiStandardError = {
  code:
    | "MISSING_KEY"
    | "INVALID_KEY_FORMAT"
    | "AUTH_401"
    | "RATE_LIMIT_429"
    | "UPSTREAM_5XX"
    | "NETWORK"
    | "BAD_RESPONSE"
    | "SCHEMA_VALIDATION_FAILED";
  message: string;
  status?: number;
};

export function mapGeminiError(err: unknown): GeminiStandardError {
  const status =
    typeof err === "object" && err !== null
      ? ((err as { status?: number; statusCode?: number }).status ??
        (err as { status?: number; statusCode?: number }).statusCode)
      : undefined;

  let msg = "";
  if (err instanceof Error) {
    msg = err.message;
  } else if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    msg = (err as { message: string }).message;
  } else {
    msg = String(err);
  }

  // Check for authentication failure
  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")))
  ) {
    return {
      code: "AUTH_401",
      message:
        "Chave Gemini inválida ou revogada. Atualize GEMINI_API_KEY nos secrets do servidor e obtenha uma chave em aistudio.google.com/app/apikey.",
      status,
    };
  }

  // Check for rate limit / quota exhaustion
  if (
    status === 429 ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota exceeded")
  ) {
    return {
      code: "RATE_LIMIT_429",
      message:
        "Muitas requisições ao Google Gemini (quota/rate limit excedido). Aguarde alguns segundos.",
      status: 429,
    };
  }

  // Check for upstream server error
  if (status && status >= 500) {
    return {
      code: "UPSTREAM_5XX",
      message: "Serviço Google Gemini temporariamente indisponível. Tente novamente.",
      status,
    };
  }

  // Check for network or abort errors
  if (
    err instanceof Error &&
    (err.name === "AbortError" ||
      msg.includes("fetch failed") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("ECONNRESET") ||
      msg.includes("network"))
  ) {
    return {
      code: "NETWORK",
      message: "Falha de rede ao contatar a API do Google Gemini.",
      status,
    };
  }

  return {
    code: "BAD_RESPONSE",
    message: `Erro da API Gemini: ${msg.slice(0, 300)}`,
    status,
  };
}

export type GeminiPingResult = {
  ok: boolean;
  keyConfigured: boolean;
  keyFormatValid: boolean;
  keyFormatReason?: string;
  pingOk: boolean;
  pingStatus?: number;
  pingError?: string;
  provider: "gemini";
  model: string;
  checkedAt: string;
};

export async function pingGemini(): Promise<GeminiPingResult> {
  const key = getGeminiApiKey();
  const v = validateGeminiKey(key);
  const model = getGeminiModel();

  if (!v.ok || !key) {
    return {
      ok: false,
      keyConfigured: Boolean(key),
      keyFormatValid: false,
      keyFormatReason: v.reason,
      pingOk: false,
      provider: "gemini",
      model,
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const ai = getGeminiClient(key);
    const response = await ai.models.generateContent({
      model,
      contents: "ping",
      config: {
        maxOutputTokens: 1,
        temperature: 0,
      },
    });

    const hasText = Boolean(response.text !== undefined);
    return {
      ok: hasText,
      keyConfigured: true,
      keyFormatValid: true,
      pingOk: hasText,
      pingStatus: 200,
      provider: "gemini",
      model,
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    const mapped = mapGeminiError(e);
    return {
      ok: false,
      keyConfigured: true,
      keyFormatValid: true,
      pingOk: false,
      pingStatus: mapped.status,
      pingError: mapped.message,
      provider: "gemini",
      model,
      checkedAt: new Date().toISOString(),
    };
  }
}
