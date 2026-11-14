// Extensible AI Provider Registry and Multi-Provider Adapter Engine.
// Supports Google Gemini, DeepSeek, OpenAI, Anthropic, Ollama (local), and OpenAI-Compatible APIs.
import { Type } from "@google/genai";
import { getGeminiClient, mapGeminiError } from "../gemini-client.server";
import {
  inspectProviderCredential,
  redactAiSecrets,
  resolveServerProviderKey,
} from "./credential-security.server";
import type {
  AiChatMessageTurn,
  AiConnectionState,
  AiGatewayRequest,
  AiGatewayResponse,
  AiModelCapabilities,
  AiProviderId,
  AiProviderStatusSummary,
  AiToolCallInvocation,
  AiToolDeclaration,
  OllamaLocalStatus,
} from "./types";

interface RuntimeProviderOverride {
  activeProvider?: AiProviderId;
  providerModels: Partial<Record<AiProviderId, string>>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

const runtimeConfig: RuntimeProviderOverride = {
  providerModels: {},
};

interface CachedVerification {
  state: AiConnectionState;
  verifiedAt: string;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
  modelVerified?: string;
}

const verificationCache = new Map<AiProviderId, CachedVerification>();
let lastOllamaProbe: OllamaLocalStatus | null = null;

export const PROVIDER_CATALOG: Record<
  AiProviderId,
  {
    label: string;
    defaultModel: string;
    availableModels: string[];
    defaultEndpoint: string;
    rateLimitPerMinute: number;
    costPer1kTokensUsd: number;
  }
> = {
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-3-flash-preview",
    availableModels: [
      "gemini-3-flash-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-4-hydrogen",
      "gemini-flash-lite-latest",
      "gemini-3.1-pro-preview",
    ],
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    rateLimitPerMinute: 60,
    costPer1kTokensUsd: 0.00035,
  },
  deepseek: {
    label: "DeepSeek Industrial",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner"],
    defaultEndpoint: "https://api.deepseek.com/v1",
    rateLimitPerMinute: 60,
    costPer1kTokensUsd: 0.00028,
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    availableModels: ["gpt-4o-mini", "gpt-4o", "o3-mini"],
    defaultEndpoint: "https://api.openai.com/v1",
    rateLimitPerMinute: 60,
    costPer1kTokensUsd: 0.0006,
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-3-5-sonnet-latest",
    availableModels: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    defaultEndpoint: "https://api.anthropic.com/v1",
    rateLimitPerMinute: 50,
    costPer1kTokensUsd: 0.003,
  },
  ollama: {
    label: "Ollama (Execução Local)",
    defaultModel: "qwen2.5-coder:7b",
    availableModels: ["qwen2.5-coder:7b", "llama3.1:8b", "deepseek-r1:8b", "mistral:7b"],
    defaultEndpoint: "http://127.0.0.1:11434",
    rateLimitPerMinute: 120,
    costPer1kTokensUsd: 0,
  },
  "openai-compatible": {
    label: "OpenAI-Compatible Endpoint",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    availableModels: ["meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct"],
    defaultEndpoint: "https://api.example-llm-provider.com/v1",
    rateLimitPerMinute: 60,
    costPer1kTokensUsd: 0.0005,
  },
};

export function getModelCapabilities(provider: AiProviderId, model: string): AiModelCapabilities {
  const m = model.toLowerCase();
  switch (provider) {
    case "gemini": {
      const isThinking = m.includes("3-flash") || m.includes("4-") || m.includes("pro");
      return {
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: true,
        maxContextTokens: 1_000_000,
        maxOutputTokens: 8192,
        isLocalOnly: false,
        thinkingModel: isThinking,
      };
    }
    case "deepseek":
      return {
        streaming: true,
        structuredOutput: true,
        toolCalling: !m.includes("reasoner"),
        vision: false,
        maxContextTokens: 64_000,
        maxOutputTokens: 8192,
        isLocalOnly: false,
        thinkingModel: m.includes("reasoner"),
      };
    case "openai":
      return {
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: m.includes("4o"),
        maxContextTokens: 128_000,
        maxOutputTokens: 8192,
        isLocalOnly: false,
        thinkingModel: m.startsWith("o"),
      };
    case "anthropic":
      return {
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: true,
        maxContextTokens: 200_000,
        maxOutputTokens: 8192,
        isLocalOnly: false,
      };
    case "ollama":
      return {
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: m.includes("llava") || m.includes("vision"),
        maxContextTokens: 32_768,
        maxOutputTokens: 4096,
        isLocalOnly: true,
      };
    case "openai-compatible":
      return {
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: false,
        maxContextTokens: 64_000,
        maxOutputTokens: 4096,
        isLocalOnly: false,
      };
  }
}

export function resolveProviderEndpoint(provider: AiProviderId): string {
  switch (provider) {
    case "gemini":
      return PROVIDER_CATALOG.gemini.defaultEndpoint;
    case "deepseek":
      return (process.env.DEEPSEEK_BASE_URL || PROVIDER_CATALOG.deepseek.defaultEndpoint).replace(
        /\/+$/,
        "",
      );
    case "openai":
      return (process.env.OPENAI_BASE_URL || PROVIDER_CATALOG.openai.defaultEndpoint).replace(
        /\/+$/,
        "",
      );
    case "anthropic":
      return (process.env.ANTHROPIC_BASE_URL || PROVIDER_CATALOG.anthropic.defaultEndpoint).replace(
        /\/+$/,
        "",
      );
    case "ollama":
      return (process.env.OLLAMA_BASE_URL || PROVIDER_CATALOG.ollama.defaultEndpoint).replace(
        /\/+$/,
        "",
      );
    case "openai-compatible":
      return (
        process.env.AI_COMPATIBLE_BASE_URL || PROVIDER_CATALOG["openai-compatible"].defaultEndpoint
      ).replace(/\/+$/, "");
  }
}

export function resolveProviderModel(provider: AiProviderId): string {
  const override = runtimeConfig.providerModels[provider];
  if (override) return override;

  switch (provider) {
    case "gemini": {
      const envModel = process.env.AI_MODEL?.trim() || process.env.GEMINI_MODEL?.trim();
      // Automatically migrate legacy unquoted gemini-3.1-pro-preview default to live gemini-3-flash-preview
      if (!envModel || envModel === "gemini-3.1-pro-preview") {
        return PROVIDER_CATALOG.gemini.defaultModel;
      }
      return envModel;
    }
    case "deepseek":
      return process.env.DEEPSEEK_MODEL?.trim() || PROVIDER_CATALOG.deepseek.defaultModel;
    case "openai":
      return process.env.OPENAI_MODEL?.trim() || PROVIDER_CATALOG.openai.defaultModel;
    case "anthropic":
      return process.env.ANTHROPIC_MODEL?.trim() || PROVIDER_CATALOG.anthropic.defaultModel;
    case "ollama":
      return process.env.OLLAMA_MODEL?.trim() || PROVIDER_CATALOG.ollama.defaultModel;
    case "openai-compatible":
      return (
        process.env.AI_COMPATIBLE_MODEL?.trim() ||
        PROVIDER_CATALOG["openai-compatible"].defaultModel
      );
  }
}

export function getActiveProviderId(): AiProviderId {
  if (runtimeConfig.activeProvider) return runtimeConfig.activeProvider;
  const envProvider = process.env.AI_PROVIDER?.trim().toLowerCase() as AiProviderId | undefined;
  if (envProvider && envProvider in PROVIDER_CATALOG) {
    return envProvider;
  }
  // Auto-detect first configured cloud provider
  const candidates: AiProviderId[] = [
    "gemini",
    "deepseek",
    "openai",
    "anthropic",
    "openai-compatible",
  ];
  for (const p of candidates) {
    const cred = inspectProviderCredential(p);
    if (cred.configured && cred.validFormat) return p;
  }
  return "gemini";
}

export function configureProviderRuntime(input: {
  provider: AiProviderId;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): { activeProvider: AiProviderId; activeModel: string } {
  runtimeConfig.activeProvider = input.provider;
  if (input.model && input.model.trim().length > 0) {
    runtimeConfig.providerModels[input.provider] = input.model.trim();
  }
  if (input.temperature !== undefined) {
    runtimeConfig.temperature = Math.max(0, Math.min(2, input.temperature));
  }
  if (input.maxOutputTokens !== undefined) {
    runtimeConfig.maxOutputTokens = Math.max(64, Math.min(16384, input.maxOutputTokens));
  }
  if (input.timeoutMs !== undefined) {
    runtimeConfig.timeoutMs = Math.max(3000, Math.min(120000, input.timeoutMs));
  }
  return {
    activeProvider: input.provider,
    activeModel: resolveProviderModel(input.provider),
  };
}

export function getGatewayRuntimeTuning(): {
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
} {
  return {
    temperature: runtimeConfig.temperature ?? (Number(process.env.AI_TEMPERATURE) || 0.2),
    maxOutputTokens:
      runtimeConfig.maxOutputTokens ?? (Number(process.env.AI_MAX_OUTPUT_TOKENS) || 4096),
    timeoutMs: runtimeConfig.timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 45000),
  };
}

/**
 * Probes local Ollama availability on the backend. Never assumes cloud availability.
 */
export async function probeOllamaLocal(): Promise<OllamaLocalStatus> {
  const endpoint = resolveProviderEndpoint("ollama");
  const isProductionCloud =
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) &&
    /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(endpoint);

  if (isProductionCloud) {
    const status: OllamaLocalStatus = {
      reachable: false,
      endpoint,
      installedModels: [],
      checkedAt: new Date().toISOString(),
      error:
        "Endpoint localhost do Ollama não é acessível a partir de ambiente serverless em nuvem. Configure um endpoint remoto autenticado.",
    };
    lastOllamaProbe = status;
    verificationCache.set("ollama", {
      state: "DISCONNECTED",
      verifiedAt: status.checkedAt,
      error: status.error,
    });
    return status;
  }

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const status: OllamaLocalStatus = {
        reachable: false,
        endpoint,
        installedModels: [],
        checkedAt: new Date().toISOString(),
        latencyMs,
        error: `Ollama respondeu HTTP ${res.status}`,
      };
      lastOllamaProbe = status;
      verificationCache.set("ollama", {
        state: "ERROR",
        verifiedAt: status.checkedAt,
        latencyMs,
        httpStatus: res.status,
        error: status.error,
      });
      return status;
    }

    const json = (await res.json()) as { models?: Array<{ name?: string }> };
    const installedModels = (json.models ?? [])
      .map((m) => m.name || "")
      .filter((n) => n.length > 0);
    const status: OllamaLocalStatus = {
      reachable: true,
      endpoint,
      installedModels,
      checkedAt: new Date().toISOString(),
      latencyMs,
    };
    lastOllamaProbe = status;
    verificationCache.set("ollama", {
      state: installedModels.length > 0 ? "CONNECTED" : "DEGRADED",
      verifiedAt: status.checkedAt,
      latencyMs,
      httpStatus: 200,
      error:
        installedModels.length === 0
          ? "Ollama online, porém nenhum modelo instalado (execute `ollama pull qwen2.5-coder:7b`)."
          : undefined,
    });
    return status;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status: OllamaLocalStatus = {
      reachable: false,
      endpoint,
      installedModels: [],
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      error: `Serviço Ollama local inacessível em ${endpoint} (${redactAiSecrets(msg).slice(0, 120)}).`,
    };
    lastOllamaProbe = status;
    verificationCache.set("ollama", {
      state: "DISCONNECTED",
      verifiedAt: status.checkedAt,
      latencyMs: status.latencyMs,
      error: status.error,
    });
    return status;
  } finally {
    clearTimeout(timer);
  }
}

export function getLastOllamaProbe(): OllamaLocalStatus {
  return (
    lastOllamaProbe ?? {
      reachable: false,
      endpoint: resolveProviderEndpoint("ollama"),
      installedModels: [],
      checkedAt: new Date().toISOString(),
      error: "Ainda não verificado nesta sessão.",
    }
  );
}

export function getProviderStatusSummary(provider: AiProviderId): AiProviderStatusSummary {
  const cat = PROVIDER_CATALOG[provider];
  const model = resolveProviderModel(provider);
  const endpoint = resolveProviderEndpoint(provider);
  const cred = inspectProviderCredential(provider);
  const tuning = getGatewayRuntimeTuning();
  const cached = verificationCache.get(provider);

  let connectionState: AiConnectionState = "NOT_CONFIGURED";
  if (provider === "ollama") {
    connectionState = cached?.state ?? "DISCONNECTED";
  } else if (!cred.configured || !cred.validFormat) {
    connectionState = "NOT_CONFIGURED";
  } else if (cached) {
    connectionState = cached.state;
  } else {
    connectionState = "CONFIGURING";
  }

  const availableModels =
    provider === "ollama" && lastOllamaProbe && lastOllamaProbe.installedModels.length > 0
      ? lastOllamaProbe.installedModels
      : cat.availableModels;

  return {
    provider,
    label: cat.label,
    model,
    availableModels,
    endpoint,
    credentialEnvVar: cred.envVar,
    credentialConfigured: cred.configured,
    credentialValidFormat: cred.validFormat,
    credentialMaskedPreview: cred.maskedPreview,
    credentialGuidance: cred.guidance,
    maxOutputTokens: tuning.maxOutputTokens,
    timeoutMs: tuning.timeoutMs,
    temperature: tuning.temperature,
    rateLimitPerMinute: cat.rateLimitPerMinute,
    capabilities: getModelCapabilities(provider, model),
    connectionState,
    lastVerifiedAt: cached?.verifiedAt ?? null,
    lastLatencyMs: cached?.latencyMs,
    lastHttpStatus: cached?.httpStatus,
    lastError: cached?.error ?? cred.reason,
  };
}

export function listAllProviderSummaries(): AiProviderStatusSummary[] {
  return (Object.keys(PROVIDER_CATALOG) as AiProviderId[]).map((id) =>
    getProviderStatusSummary(id),
  );
}

export function updateProviderVerificationCache(
  provider: AiProviderId,
  update: CachedVerification,
): void {
  verificationCache.set(provider, update);
}

/**
 * Executes a single provider call (without cross-model failover; failover is managed by Model Router).
 */
export async function executeProviderCall(
  provider: AiProviderId,
  model: string,
  req: AiGatewayRequest,
): Promise<AiGatewayResponse> {
  const t0 = Date.now();
  const tuning = getGatewayRuntimeTuning();
  const timeoutMs = req.timeoutMs ?? tuning.timeoutMs;
  const maxOutputTokens = req.maxOutputTokens ?? tuning.maxOutputTokens;
  const temperature = req.temperature ?? tuning.temperature;
  const costRate = PROVIDER_CATALOG[provider]?.costPer1kTokensUsd ?? 0.0005;

  if (provider !== "ollama") {
    const cred = inspectProviderCredential(provider);
    if (!cred.configured || !cred.validFormat) {
      return {
        ok: false,
        text: "",
        provider,
        model,
        durationMs: Date.now() - t0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        fallbackUsed: false,
        error: {
          code: "MISSING_KEY",
          message: cred.reason || `${cred.envVar} não configurada no servidor.`,
          status: 401,
        },
      };
    }
  }

  if (provider === "gemini") {
    try {
      const ai = getGeminiClient(resolveServerProviderKey("gemini"));
      const systemMsg = req.messages.find((m) => m.role === "system")?.content ?? req.systemPrompt;
      const nonSystem = req.messages.filter((m) => m.role !== "system");
      const contents =
        nonSystem.length > 0
          ? nonSystem.map((m) => ({
              role: m.role === "assistant" ? ("model" as const) : ("user" as const),
              parts: [{ text: m.content }],
            }))
          : [{ role: "user" as const, parts: [{ text: "ping" }] }];

      const functionDeclarations = req.tools?.map((t: AiToolDeclaration) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: Type.OBJECT,
          properties: (t.parametersJsonSchema.properties ?? {}) as Record<string, unknown>,
          required: (t.parametersJsonSchema.required ?? []) as string[],
        },
      }));

      const effectiveMaxTokens = getModelCapabilities("gemini", model).thinkingModel
        ? Math.max(maxOutputTokens, 2048)
        : maxOutputTokens;

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...(systemMsg ? { systemInstruction: systemMsg } : {}),
          temperature,
          maxOutputTokens: effectiveMaxTokens,
          ...(req.responseJsonSchema
            ? {
                responseMimeType: "application/json",
                responseSchema: req.responseJsonSchema as any,
              }
            : {}),
          ...(functionDeclarations && functionDeclarations.length > 0
            ? { tools: [{ functionDeclarations: functionDeclarations as any }] }
            : {}),
        },
      });

      const durationMs = Date.now() - t0;
      const text = response.text ?? "";
      const promptTokens =
        response.usageMetadata?.promptTokenCount ??
        Math.ceil(JSON.stringify(contents).length / 4);
      const completionTokens =
        response.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
      const totalTokens =
        response.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;

      const rawFnCalls = (response as any).functionCalls as
        | Array<{ id?: string; name?: string; args?: Record<string, unknown> }>
        | undefined;
      const toolCalls: AiToolCallInvocation[] | undefined =
        rawFnCalls && rawFnCalls.length > 0
          ? rawFnCalls.map((fc, idx) => ({
              id: fc.id || `call_${idx + 1}`,
              name: fc.name || "unknown",
              arguments: fc.args ?? {},
            }))
          : undefined;

      updateProviderVerificationCache("gemini", {
        state: "CONNECTED",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        httpStatus: 200,
        modelVerified: model,
      });

      return {
        ok: true,
        text,
        provider: "gemini",
        model,
        durationMs,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: Number(((totalTokens / 1000) * costRate).toFixed(6)),
        fallbackUsed: false,
        toolCalls,
      };
    } catch (err) {
      const mapped = mapGeminiError(err);
      const durationMs = Date.now() - t0;
      updateProviderVerificationCache("gemini", {
        state: mapped.code === "RATE_LIMIT_429" ? "DEGRADED" : "ERROR",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        httpStatus: mapped.status,
        error: redactAiSecrets(mapped.message),
      });
      return {
        ok: false,
        text: "",
        provider: "gemini",
        model,
        durationMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        fallbackUsed: false,
        error: {
          code: mapped.code,
          message: redactAiSecrets(mapped.message),
          status: mapped.status,
        },
      };
    }
  }

  if (provider === "ollama") {
    const endpoint = resolveProviderEndpoint("ollama");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (req.systemPrompt) {
        messages.push({ role: "system", content: req.systemPrompt });
      }
      for (const m of req.messages) {
        messages.push({
          role: m.role === "tool" ? "user" : m.role,
          content: m.content,
        });
      }

      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          ...(req.responseJsonSchema ? { format: "json" } : {}),
          options: {
            temperature,
            num_predict: maxOutputTokens,
          },
          messages,
        }),
        signal: controller.signal,
      });

      const durationMs = Date.now() - t0;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const safeErr = redactAiSecrets(
          `Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`,
        );
        updateProviderVerificationCache("ollama", {
          state: "ERROR",
          verifiedAt: new Date().toISOString(),
          latencyMs: durationMs,
          httpStatus: res.status,
          error: safeErr,
        });
        return {
          ok: false,
          text: "",
          provider: "ollama",
          model,
          durationMs,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          fallbackUsed: false,
          error: { code: `HTTP_${res.status}`, message: safeErr, status: res.status },
        };
      }

      const json = (await res.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const text = json.message?.content ?? "";
      const promptTokens = json.prompt_eval_count ?? Math.ceil(JSON.stringify(messages).length / 4);
      const completionTokens = json.eval_count ?? Math.ceil(text.length / 4);
      const totalTokens = promptTokens + completionTokens;

      updateProviderVerificationCache("ollama", {
        state: "CONNECTED",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        httpStatus: 200,
        modelVerified: model,
      });

      return {
        ok: true,
        text,
        provider: "ollama",
        model,
        durationMs,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: 0,
        fallbackUsed: false,
      };
    } catch (err) {
      const durationMs = Date.now() - t0;
      const safeErr = redactAiSecrets(err instanceof Error ? err.message : String(err));
      updateProviderVerificationCache("ollama", {
        state: "DISCONNECTED",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        error: safeErr,
      });
      return {
        ok: false,
        text: "",
        provider: "ollama",
        model,
        durationMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        fallbackUsed: false,
        error: { code: "NETWORK", message: safeErr },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  if (provider === "anthropic") {
    const endpoint = resolveProviderEndpoint("anthropic");
    const apiKey = resolveServerProviderKey("anthropic")!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const systemMsg =
        req.messages.find((m) => m.role === "system")?.content ?? req.systemPrompt ?? "";
      const messages = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));

      const res = await fetch(`${endpoint}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxOutputTokens,
          temperature,
          ...(systemMsg ? { system: systemMsg } : {}),
          messages,
        }),
        signal: controller.signal,
      });
      const durationMs = Date.now() - t0;
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        const safeErr = redactAiSecrets(`Anthropic HTTP ${res.status}: ${errBody.slice(0, 200)}`);
        updateProviderVerificationCache("anthropic", {
          state: res.status === 429 ? "DEGRADED" : "ERROR",
          verifiedAt: new Date().toISOString(),
          latencyMs: durationMs,
          httpStatus: res.status,
          error: safeErr,
        });
        return {
          ok: false,
          text: "",
          provider: "anthropic",
          model,
          durationMs,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          fallbackUsed: false,
          error: {
            code: res.status === 401 ? "AUTH_401" : `HTTP_${res.status}`,
            message: safeErr,
            status: res.status,
          },
        };
      }

      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (json.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("");
      const promptTokens = json.usage?.input_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
      const completionTokens = json.usage?.output_tokens ?? Math.ceil(text.length / 4);
      const totalTokens = promptTokens + completionTokens;

      updateProviderVerificationCache("anthropic", {
        state: "CONNECTED",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        httpStatus: 200,
        modelVerified: model,
      });

      return {
        ok: true,
        text,
        provider: "anthropic",
        model,
        durationMs,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: Number(((totalTokens / 1000) * costRate).toFixed(6)),
        fallbackUsed: false,
      };
    } catch (err) {
      const durationMs = Date.now() - t0;
      const safeErr = redactAiSecrets(err instanceof Error ? err.message : String(err));
      updateProviderVerificationCache("anthropic", {
        state: "ERROR",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        error: safeErr,
      });
      return {
        ok: false,
        text: "",
        provider: "anthropic",
        model,
        durationMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        fallbackUsed: false,
        error: { code: "NETWORK", message: safeErr },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // OpenAI, DeepSeek, and OpenAI-Compatible adapters share standard /chat/completions protocol
  const endpoint = resolveProviderEndpoint(provider);
  const apiKey = resolveServerProviderKey(provider)!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt && !req.messages.some((m) => m.role === "system")) {
      messages.push({ role: "system", content: req.systemPrompt });
    }
    for (const m of req.messages) {
      messages.push({
        role: m.role === "tool" ? "user" : m.role,
        content: m.content,
      });
    }

    const toolsPayload =
      req.tools && req.tools.length > 0
        ? req.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parametersJsonSchema,
            },
          }))
        : undefined;

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxOutputTokens,
        ...(req.responseJsonSchema ? { response_format: { type: "json_object" } } : {}),
        ...(toolsPayload ? { tools: toolsPayload } : {}),
        messages,
      }),
      signal: controller.signal,
    });

    const durationMs = Date.now() - t0;
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const safeErr = redactAiSecrets(`${provider} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      updateProviderVerificationCache(provider, {
        state: res.status === 429 ? "DEGRADED" : "ERROR",
        verifiedAt: new Date().toISOString(),
        latencyMs: durationMs,
        httpStatus: res.status,
        error: safeErr,
      });
      return {
        ok: false,
        text: "",
        provider,
        model,
        durationMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        fallbackUsed: false,
        error: {
          code: res.status === 401 ? "AUTH_401" : res.status === 429 ? "RATE_LIMIT_429" : `HTTP_${res.status}`,
          message: safeErr,
          status: res.status,
        },
      };
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const msg = json.choices?.[0]?.message;
    const text = msg?.content ?? "";
    const promptTokens = json.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
    const completionTokens = json.usage?.completion_tokens ?? Math.ceil(text.length / 4);
    const totalTokens = json.usage?.total_tokens ?? promptTokens + completionTokens;

    const toolCalls: AiToolCallInvocation[] | undefined =
      msg?.tool_calls && msg.tool_calls.length > 0
        ? msg.tool_calls.map((tc, idx) => {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              parsedArgs = {};
            }
            return {
              id: tc.id || `call_${idx + 1}`,
              name: tc.function?.name || "unknown",
              arguments: parsedArgs,
            };
          })
        : undefined;

    updateProviderVerificationCache(provider, {
      state: "CONNECTED",
      verifiedAt: new Date().toISOString(),
      latencyMs: durationMs,
      httpStatus: 200,
      modelVerified: model,
    });

    return {
      ok: true,
      text,
      provider,
      model,
      durationMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: Number(((totalTokens / 1000) * costRate).toFixed(6)),
      fallbackUsed: false,
      toolCalls,
    };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const safeErr = redactAiSecrets(err instanceof Error ? err.message : String(err));
    updateProviderVerificationCache(provider, {
      state: "ERROR",
      verifiedAt: new Date().toISOString(),
      latencyMs: durationMs,
      error: safeErr,
    });
    return {
      ok: false,
      text: "",
      provider,
      model,
      durationMs,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      fallbackUsed: false,
      error: { code: "NETWORK", message: safeErr },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function* streamProviderCall(
  provider: AiProviderId,
  model: string,
  req: {
    systemPrompt?: string;
    messages: AiChatMessageTurn[];
    temperature?: number;
    maxOutputTokens?: number;
  },
): AsyncGenerator<
  | { type: "delta"; text: string }
  | { type: "done"; tokens: number; provider: AiProviderId; model: string }
  | { type: "error"; message: string; code?: string }
> {
  if (provider === "gemini") {
    const cred = inspectProviderCredential("gemini");
    if (!cred.configured || !cred.validFormat) {
      yield {
        type: "error",
        code: "MISSING_KEY",
        message: cred.reason || "GEMINI_API_KEY ausente nos secrets do servidor.",
      };
      return;
    }

    const candidates = Array.from(
      new Set([
        model,
        "gemini-3-flash-preview",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
      ]),
    );

    const ai = getGeminiClient(resolveServerProviderKey("gemini"));
    const contents = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

    let lastErr: { code: string; message: string } | null = null;
    for (const candidateModel of candidates) {
      try {
        const t0 = Date.now();
        const streamResponse = await ai.models.generateContentStream({
          model: candidateModel,
          contents,
          config: {
            ...(req.systemPrompt ? { systemInstruction: req.systemPrompt } : {}),
            temperature: req.temperature ?? 0.3,
            maxOutputTokens: req.maxOutputTokens ?? 4096,
          },
        });

        let accumulated = "";
        let totalTokens = 0;
        for await (const chunk of streamResponse) {
          const delta = chunk.text || "";
          if (delta) {
            accumulated += delta;
            yield { type: "delta", text: delta };
          }
          if (chunk.usageMetadata?.totalTokenCount) {
            totalTokens = chunk.usageMetadata.totalTokenCount;
          }
        }

        const finalTokens = totalTokens > 0 ? totalTokens : Math.ceil(accumulated.length / 4);
        updateProviderVerificationCache("gemini", {
          state: "CONNECTED",
          verifiedAt: new Date().toISOString(),
          latencyMs: Date.now() - t0,
          httpStatus: 200,
          modelVerified: candidateModel,
        });
        yield {
          type: "done",
          tokens: finalTokens,
          provider: "gemini",
          model: candidateModel,
        };
        return;
      } catch (err) {
        const mapped = mapGeminiError(err);
        lastErr = { code: mapped.code, message: redactAiSecrets(mapped.message) };
        if (mapped.code === "AUTH_401" || mapped.code === "MISSING_KEY") {
          break;
        }
      }
    }

    yield {
      type: "error",
      code: lastErr?.code ?? "UPSTREAM_5XX",
      message: lastErr?.message ?? "Falha ao transmitir resposta do modelo.",
    };
    return;
  }

  // Non-Gemini providers: execute via gateway call and emit delta + done
  const res = await executeProviderCall(provider, model, {
    operation: "chat_stream",
    systemPrompt: req.systemPrompt,
    messages: req.messages,
    temperature: req.temperature,
    maxOutputTokens: req.maxOutputTokens,
  });
  if (!res.ok) {
    yield {
      type: "error",
      code: res.error?.code,
      message: res.error?.message || "Erro ao consultar provedor de IA.",
    };
    return;
  }
  if (res.text) {
    yield { type: "delta", text: res.text };
  }
  yield {
    type: "done",
    tokens: res.totalTokens,
    provider: res.provider,
    model: res.model,
  };
}
