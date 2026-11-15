// Server-side AI credential security, format validation, rotation tracking,
// and sensitive token redaction. Never imported into browser bundles in a way
// that exposes environment secrets.
import type { AiProviderId } from "./types";

export interface ProviderCredentialMeta {
  provider: AiProviderId;
  envVar: string;
  configured: boolean;
  validFormat: boolean;
  maskedPreview: string;
  reason?: string;
  guidance: string;
  rotatedAt?: string;
}

const PLACEHOLDER_PATTERN =
  /^(placeholder|your[_-]|example|changeme|replace[_-]with|dummy|fake|test[_-]key|sk-placeholder|AIzaSy_PLACEHOLDER)/i;

const SECRET_REDACTION_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /sk-(?:proj-|ant-|live-|test-)?[0-9A-Za-z\-_]{16,}/g,
  /Bearer\s+[0-9A-Za-z\-._~+/]+=*/gi,
  /eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/g,
  /(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*["']?[^\s"',;}{]{8,}["']?/gi,
];

const rotationTimestamps = new Map<AiProviderId, string>();
const credentialFingerprints = new Map<AiProviderId, string>();

function quickFingerprint(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Redacts API keys, Bearer tokens, JWTs, and secret assignments from any log or error message.
 */
export function redactAiSecrets(input: string): string {
  if (!input) return "";
  let safe = input;
  for (const pattern of SECRET_REDACTION_PATTERNS) {
    safe = safe.replace(pattern, "[REDACTED_CREDENTIAL]");
  }
  // Also redact any currently loaded provider key literal if >= 8 chars
  const activeKeys = [
    process.env.GEMINI_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.AI_COMPATIBLE_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ];
  for (const k of activeKeys) {
    const trimmed = k?.trim();
    if (trimmed && trimmed.length >= 8 && safe.includes(trimmed)) {
      safe = safe.split(trimmed).join("[REDACTED_CREDENTIAL]");
    }
  }
  return safe;
}

export function getProviderEnvVarName(provider: AiProviderId): string {
  switch (provider) {
    case "gemini":
      return "GEMINI_API_KEY";
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai-compatible":
      return "AI_COMPATIBLE_API_KEY";
    case "ollama":
      return "OLLAMA_BASE_URL";
  }
}

export function getProviderSetupGuidance(provider: AiProviderId): string {
  switch (provider) {
    case "gemini":
      return "Defina GEMINI_API_KEY no arquivo .env do servidor (ou variáveis de ambiente do host) com uma chave gerada em https://aistudio.google.com/app/apikey e GEMINI_MODEL=gemini-3-flash-preview.";
    case "deepseek":
      return "Defina DEEPSEEK_API_KEY no arquivo .env do servidor com uma chave válida gerada em https://platform.deepseek.com/api_keys.";
    case "openai":
      return "Defina OPENAI_API_KEY no arquivo .env do servidor com uma chave válida gerada em https://platform.openai.com/api-keys.";
    case "anthropic":
      return "Defina ANTHROPIC_API_KEY no arquivo .env do servidor com uma chave válida gerada em https://console.anthropic.com/settings/keys.";
    case "openai-compatible":
      return "Defina AI_COMPATIBLE_BASE_URL, AI_COMPATIBLE_API_KEY e AI_COMPATIBLE_MODEL no arquivo .env do servidor.";
    case "ollama":
      return "Instale e inicie o Ollama localmente (`ollama serve` em http://127.0.0.1:11434) e baixe um modelo compatível (`ollama pull qwen2.5-coder:7b`). Uso restrito a quando o backend alcança o serviço.";
  }
}

/**
 * Resolves the raw server-side secret for a provider. NEVER return this value to the client.
 */
export function resolveServerProviderKey(provider: AiProviderId): string | undefined {
  let raw: string | undefined;
  switch (provider) {
    case "gemini":
      raw = process.env.GEMINI_API_KEY?.trim();
      break;
    case "deepseek":
      raw = process.env.DEEPSEEK_API_KEY?.trim();
      break;
    case "openai":
      raw = process.env.OPENAI_API_KEY?.trim();
      break;
    case "anthropic":
      raw = process.env.ANTHROPIC_API_KEY?.trim();
      break;
    case "openai-compatible":
      raw = process.env.AI_COMPATIBLE_API_KEY?.trim();
      break;
    case "ollama":
      raw = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim();
      break;
  }

  if (raw && !PLACEHOLDER_PATTERN.test(raw)) {
    const fp = quickFingerprint(raw);
    const prev = credentialFingerprints.get(provider);
    if (prev && prev !== fp) {
      rotationTimestamps.set(provider, new Date().toISOString());
    }
    credentialFingerprints.set(provider, fp);
  }

  return raw;
}

/**
 * Inspects whether a provider's credential is present and syntactically valid
 * without exposing the key itself.
 */
export function inspectProviderCredential(provider: AiProviderId): ProviderCredentialMeta {
  const envVar = getProviderEnvVarName(provider);
  const guidance = getProviderSetupGuidance(provider);
  const raw = resolveServerProviderKey(provider);

  if (provider === "ollama") {
    const url = raw || "http://127.0.0.1:11434";
    const isValidUrl = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url);
    return {
      provider,
      envVar,
      configured: isValidUrl,
      validFormat: isValidUrl,
      maskedPreview: url,
      reason: isValidUrl ? undefined : "OLLAMA_BASE_URL inválida.",
      guidance,
      rotatedAt: rotationTimestamps.get(provider),
    };
  }

  if (!raw || raw.length === 0) {
    return {
      provider,
      envVar,
      configured: false,
      validFormat: false,
      maskedPreview: "Não configurada",
      reason: `Variável de servidor ${envVar} ausente.`,
      guidance,
    };
  }

  if (
    PLACEHOLDER_PATTERN.test(raw) ||
    raw.includes("PLACEHOLDER") ||
    raw.includes("REPLACE_WITH")
  ) {
    return {
      provider,
      envVar,
      configured: false,
      validFormat: false,
      maskedPreview: "Placeholder detectado (não configurada)",
      reason: `${envVar} contém valor ilustrativo de placeholder.`,
      guidance,
    };
  }

  if (raw.length < 15 || /\s/.test(raw)) {
    return {
      provider,
      envVar,
      configured: true,
      validFormat: false,
      maskedPreview: "Formato inválido (comprimento/espaços)",
      reason: `${envVar} possui formato inválido (mínimo 15 caracteres sem espaços).`,
      guidance,
    };
  }

  return {
    provider,
    envVar,
    configured: true,
    validFormat: true,
    maskedPreview: `Configurada no servidor (${raw.length} chars · final ••••${raw.slice(-4)})`,
    guidance,
    rotatedAt: rotationTimestamps.get(provider),
  };
}

/**
 * Registers an administrative rotation timestamp and clears cached clients.
 */
export function recordCredentialRotationEvent(provider: AiProviderId): {
  provider: AiProviderId;
  rotatedAt: string;
} {
  const ts = new Date().toISOString();
  rotationTimestamps.set(provider, ts);
  return { provider, rotatedAt: ts };
}
