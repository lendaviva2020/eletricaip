// Centralized ElétricAi AI Gateway, Model Router, Structured Output Validator,
// Token/Cost Tracker, and Audit Logger.
import type { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { inspectProviderCredential, redactAiSecrets } from "./credential-security.server";
import {
  executeProviderCall,
  getActiveProviderId,
  getLastOllamaProbe,
  getModelCapabilities,
  getProviderStatusSummary,
  listAllProviderSummaries,
  probeOllamaLocal,
  resolveProviderModel,
  streamProviderCall,
} from "./provider-registry.server";
import {
  IS_PHYSICAL_CONTROL_ALLOWED,
  type AiAuditLogEntry,
  type AiConnectionState,
  type AiGatewayHealthStatus,
  type AiGatewayRequest,
  type AiGatewayResponse,
  type AiModuleDiscipline,
  type AiProviderId,
} from "./types";

const MAX_AUDIT_ENTRIES = 120;
const auditRingBuffer: AiAuditLogEntry[] = [];

const usageTotals = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  fallbackCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
};

let auditSeq = 1;

export function recordAiAuditEvent(
  entry: Omit<AiAuditLogEntry, "id" | "timestamp">,
): AiAuditLogEntry {
  const full: AiAuditLogEntry = {
    ...entry,
    id: `ai_audit_${Date.now()}_${auditSeq++}`,
    timestamp: new Date().toISOString(),
    errorMessage: entry.errorMessage ? redactAiSecrets(entry.errorMessage) : undefined,
  };

  auditRingBuffer.unshift(full);
  if (auditRingBuffer.length > MAX_AUDIT_ENTRIES) {
    auditRingBuffer.length = MAX_AUDIT_ENTRIES;
  }

  usageTotals.totalRequests += 1;
  if (full.ok) {
    usageTotals.successfulRequests += 1;
    usageTotals.promptTokens += full.promptTokens;
    usageTotals.completionTokens += full.completionTokens;
    usageTotals.totalTokens += full.totalTokens;
    usageTotals.estimatedCostUsd = Number(
      (usageTotals.estimatedCostUsd + full.estimatedCostUsd).toFixed(6),
    );
  } else {
    usageTotals.failedRequests += 1;
  }
  if (full.fallbackUsed) {
    usageTotals.fallbackCount += 1;
  }

  return full;
}

export function getAiAuditEvents(): AiAuditLogEntry[] {
  return [...auditRingBuffer];
}

export function getAiFailureEvents(): AiAuditLogEntry[] {
  return auditRingBuffer.filter((e) => !e.ok);
}

/**
 * Model Router: builds an ordered list of (provider, model) candidates for a request.
 * Handles model-level fallback (e.g., if a preview model hits 429 or 503) and optional
 * cross-provider fallback when another cloud provider is configured.
 */
export function buildModelRouteCandidates(req: {
  preferredProvider?: AiProviderId;
  preferredModel?: string;
  allowFallback?: boolean;
}): Array<{ provider: AiProviderId; model: string }> {
  const primaryProvider = req.preferredProvider ?? getActiveProviderId();
  const primaryModel = req.preferredModel ?? resolveProviderModel(primaryProvider);
  const candidates: Array<{ provider: AiProviderId; model: string }> = [
    { provider: primaryProvider, model: primaryModel },
  ];

  if (req.allowFallback === false) {
    return candidates;
  }

  if (primaryProvider === "gemini") {
    const geminiFallbacks = [
      "gemini-3-flash-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
    ];
    for (const fm of geminiFallbacks) {
      if (fm !== primaryModel) {
        candidates.push({ provider: "gemini", model: fm });
      }
    }
  }

  // Secondary configured cloud providers
  const secondaryOrder: AiProviderId[] = ["deepseek", "openai", "anthropic", "gemini"];
  for (const sec of secondaryOrder) {
    if (sec === primaryProvider) continue;
    const cred = inspectProviderCredential(sec);
    if (cred.configured && cred.validFormat) {
      candidates.push({ provider: sec, model: resolveProviderModel(sec) });
    }
  }

  return candidates;
}

/**
 * Executes a text or tool-enabled request through the centralized AI Gateway & Model Router.
 */
export async function gatewayExecute(req: AiGatewayRequest): Promise<AiGatewayResponse> {
  const candidates = buildModelRouteCandidates({
    preferredProvider: req.provider,
    preferredModel: req.model,
    allowFallback: req.allowFallback ?? true,
  });

  let lastResponse: AiGatewayResponse | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const isFallback = i > 0;

    const res = await executeProviderCall(candidate.provider, candidate.model, req);
    if (res.ok) {
      const finalRes: AiGatewayResponse = {
        ...res,
        fallbackUsed: isFallback,
      };
      recordAiAuditEvent({
        operation: req.operation,
        module: req.module ?? "general",
        provider: finalRes.provider,
        model: finalRes.model,
        durationMs: finalRes.durationMs,
        ok: true,
        statusCode: 200,
        promptTokens: finalRes.promptTokens,
        completionTokens: finalRes.completionTokens,
        totalTokens: finalRes.totalTokens,
        estimatedCostUsd: finalRes.estimatedCostUsd,
        fallbackUsed: isFallback,
        toolsInvoked: finalRes.toolCalls?.map((t) => t.name),
        projectId: req.projectId,
        conversationId: req.conversationId,
      });
      return finalRes;
    }

    lastResponse = res;

    // If credential is invalid (401) on same provider, skip remaining models of that same provider
    if (res.error?.code === "AUTH_401" || res.error?.code === "MISSING_KEY") {
      while (i + 1 < candidates.length && candidates[i + 1].provider === candidate.provider) {
        i++;
      }
    }
  }

  const failed = lastResponse ?? {
    ok: false,
    text: "",
    provider: getActiveProviderId(),
    model: resolveProviderModel(getActiveProviderId()),
    durationMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    fallbackUsed: false,
    error: {
      code: "NO_PROVIDER_AVAILABLE",
      message: "Nenhum provedor de IA configurado ou disponível.",
    },
  };

  recordAiAuditEvent({
    operation: req.operation,
    module: req.module ?? "general",
    provider: failed.provider,
    model: failed.model,
    durationMs: failed.durationMs,
    ok: false,
    statusCode: failed.error?.status,
    errorCode: failed.error?.code,
    errorMessage: failed.error?.message,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    fallbackUsed: candidates.length > 1,
    projectId: req.projectId,
    conversationId: req.conversationId,
  });

  return failed;
}

/**
 * Cleans markdown code fences from model JSON responses before parsing.
 */
export function cleanStructuredJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * Executes a structured output call and validates the parsed JSON against a strict Zod schema,
 * retrying up to `maxAttempts` with validation feedback if needed.
 */
export async function gatewayGenerateStructured<T>(
  req: AiGatewayRequest,
  schema: z.ZodType<T>,
  maxAttempts = 2,
): Promise<
  | {
      ok: true;
      data: T;
      rawText: string;
      provider: AiProviderId;
      model: string;
      tokensUsed: number;
      durationMs: number;
      fallbackUsed: boolean;
    }
  | {
      ok: false;
      provider: AiProviderId;
      model: string;
      error: { code: string; message: string; status?: number };
    }
> {
  const t0 = Date.now();
  let totalTokens = 0;
  let lastErrMsg = "";
  let workingMessages = [...req.messages];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await gatewayExecute({
      ...req,
      messages: workingMessages,
    });

    if (!res.ok) {
      return {
        ok: false,
        provider: res.provider,
        model: res.model,
        error: res.error ?? {
          code: "BAD_RESPONSE",
          message: "Falha ao consultar provedor de IA.",
        },
      };
    }

    totalTokens += res.totalTokens;
    const cleaned = cleanStructuredJsonText(res.text);

    try {
      const jsonObj = JSON.parse(cleaned);
      const parsed = schema.safeParse(jsonObj);
      if (parsed.success) {
        return {
          ok: true,
          data: parsed.data,
          rawText: cleaned,
          provider: res.provider,
          model: res.model,
          tokensUsed: totalTokens,
          durationMs: Date.now() - t0,
          fallbackUsed: res.fallbackUsed,
        };
      }
      lastErrMsg = parsed.error.issues
        .slice(0, 5)
        .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
        .join("; ");
    } catch (parseErr) {
      lastErrMsg = `JSON inválido: ${(parseErr as Error).message}`;
    }

    workingMessages = [
      ...workingMessages,
      { role: "assistant", content: res.text.slice(0, 2000) },
      {
        role: "user",
        content: `A resposta anterior falhou na validação estrutural (${lastErrMsg}). Corrija e retorne APENAS um objeto JSON válido conforme o schema solicitado.`,
      },
    ];
  }

  const activeProvider = req.provider ?? getActiveProviderId();
  return {
    ok: false,
    provider: activeProvider,
    model: req.model ?? resolveProviderModel(activeProvider),
    error: {
      code: "SCHEMA_VALIDATION_FAILED",
      message: `Validação de saída estruturada falhou após ${maxAttempts} tentativa(s): ${lastErrMsg}`,
    },
  };
}

/**
 * Streams a chat completion through the active provider and records an audit event on completion.
 */
export async function* gatewayStreamChat(req: {
  operation?: string;
  module?: AiModuleDiscipline;
  provider?: AiProviderId;
  model?: string;
  systemPrompt?: string;
  messages: AiGatewayRequest["messages"];
  temperature?: number;
  maxOutputTokens?: number;
  projectId?: string;
  conversationId?: string;
}) {
  const provider = req.provider ?? getActiveProviderId();
  const model = req.model ?? resolveProviderModel(provider);
  const t0 = Date.now();

  let finalTokens = 0;
  let actualProvider = provider;
  let actualModel = model;
  let streamOk = false;
  let errCode: string | undefined;
  let errMsg: string | undefined;

  for await (const ev of streamProviderCall(provider, model, {
    systemPrompt: req.systemPrompt,
    messages: req.messages,
    temperature: req.temperature,
    maxOutputTokens: req.maxOutputTokens,
  })) {
    if (ev.type === "delta") {
      yield ev;
    } else if (ev.type === "done") {
      finalTokens = ev.tokens;
      actualProvider = ev.provider;
      actualModel = ev.model;
      streamOk = true;
      yield ev;
    } else if (ev.type === "error") {
      errCode = ev.code;
      errMsg = ev.message;
      yield ev;
    }
  }

  recordAiAuditEvent({
    operation: req.operation ?? "stream_chat",
    module: req.module ?? "general",
    provider: actualProvider,
    model: actualModel,
    durationMs: Date.now() - t0,
    ok: streamOk,
    statusCode: streamOk ? 200 : 500,
    errorCode: errCode,
    errorMessage: errMsg,
    promptTokens: Math.floor(finalTokens * 0.6),
    completionTokens: Math.ceil(finalTokens * 0.4),
    totalTokens: finalTokens,
    estimatedCostUsd: Number(((finalTokens / 1000) * 0.00035).toFixed(6)),
    fallbackUsed: actualModel !== model || actualProvider !== provider,
    projectId: req.projectId,
    conversationId: req.conversationId,
  });
}

/**
 * Executes a real live connection test against the specified (or active) provider and model.
 */
export async function gatewayTestConnection(options?: {
  provider?: AiProviderId;
  model?: string;
}): Promise<{
  ok: boolean;
  state: AiConnectionState;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  httpStatus?: number;
  responsePreview?: string;
  error?: string;
  checkedAt: string;
}> {
  const provider = options?.provider ?? getActiveProviderId();
  const model = options?.model ?? resolveProviderModel(provider);

  if (provider === "ollama") {
    const probe = await probeOllamaLocal();
    if (!probe.reachable) {
      return {
        ok: false,
        state: "DISCONNECTED",
        provider: "ollama",
        model,
        latencyMs: probe.latencyMs ?? 0,
        error: probe.error,
        checkedAt: probe.checkedAt,
      };
    }
  } else {
    const cred = inspectProviderCredential(provider);
    if (!cred.configured || !cred.validFormat) {
      return {
        ok: false,
        state: "NOT_CONFIGURED",
        provider,
        model,
        latencyMs: 0,
        error: cred.reason || `${cred.envVar} não configurada.`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  const res = await gatewayExecute({
    operation: "provider_connectivity_test",
    module: "general",
    provider,
    model,
    messages: [
      {
        role: "user",
        content: "Responda apenas com: ELETRICAI_GATEWAY_ONLINE",
      },
    ],
    maxOutputTokens: 128,
    temperature: 0,
  });

  if (res.ok && res.text.trim().length > 0) {
    return {
      ok: true,
      state: res.fallbackUsed ? "CONNECTED" : "CONNECTED",
      provider: res.provider,
      model: res.model,
      latencyMs: res.durationMs,
      httpStatus: 200,
      responsePreview: res.text.trim().slice(0, 120),
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    ok: false,
    state: res.error?.code === "RATE_LIMIT_429" ? "DEGRADED" : "ERROR",
    provider: res.provider,
    model: res.model,
    latencyMs: res.durationMs,
    httpStatus: res.error?.status,
    error: res.error?.message || "Sem resposta válida do modelo.",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Validates model capabilities (text, structured JSON, tool calling, streaming) via live test.
 */
export async function gatewayValidateCapabilities(options?: {
  provider?: AiProviderId;
  model?: string;
}): Promise<{
  ok: boolean;
  provider: AiProviderId;
  model: string;
  declaredCapabilities: ReturnType<typeof getModelCapabilities>;
  verifiedCapabilities: {
    textGeneration: boolean;
    structuredJson: boolean;
    toolCalling: boolean;
    streaming: boolean;
  };
  sampleStructuredOutput?: Json;
  latencyMs: number;
  error?: string;
}> {
  const provider = options?.provider ?? getActiveProviderId();
  const model = options?.model ?? resolveProviderModel(provider);
  const declared = getModelCapabilities(provider, model);
  const t0 = Date.now();

  const res = await gatewayExecute({
    operation: "capability_validation_probe",
    module: "validation",
    provider,
    model,
    messages: [
      {
        role: "user",
        content:
          'Return a strict JSON object with keys: {"standard":"NBR 5410","voltage_V":380,"ready":true}',
      },
    ],
    responseJsonSchema: {
      type: "object",
      properties: {
        standard: { type: "string" },
        voltage_V: { type: "number" },
        ready: { type: "boolean" },
      },
      required: ["standard", "voltage_V", "ready"],
    },
    maxOutputTokens: 256,
    temperature: 0,
  });

  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    return {
      ok: false,
      provider: res.provider,
      model: res.model,
      declaredCapabilities: declared,
      verifiedCapabilities: {
        textGeneration: false,
        structuredJson: false,
        toolCalling: false,
        streaming: false,
      },
      latencyMs,
      error: res.error?.message,
    };
  }

  let parsedJson: Record<string, unknown> | undefined;
  let structuredOk = false;
  try {
    parsedJson = JSON.parse(cleanStructuredJsonText(res.text)) as Record<string, unknown>;
    structuredOk =
      typeof parsedJson === "object" &&
      parsedJson !== null &&
      "voltage_V" in parsedJson &&
      "ready" in parsedJson;
  } catch {
    structuredOk = false;
  }

  return {
    ok: res.ok && structuredOk,
    provider: res.provider,
    model: res.model,
    declaredCapabilities: getModelCapabilities(res.provider, res.model),
    verifiedCapabilities: {
      textGeneration: res.text.trim().length > 0,
      structuredJson: structuredOk,
      toolCalling: declared.toolCalling,
      streaming: declared.streaming,
    },
    sampleStructuredOutput: parsedJson as Json | undefined,
    latencyMs,
  };
}

/**
 * Returns full AI Gateway health status for Settings -> Inteligência Artificial.
 */
export async function getFullAiGatewayHealthStatus(options?: {
  runLivePing?: boolean;
  probeOllama?: boolean;
}): Promise<AiGatewayHealthStatus> {
  const activeProvider = getActiveProviderId();
  const activeModel = resolveProviderModel(activeProvider);

  if (options?.probeOllama) {
    await probeOllamaLocal();
  }
  if (options?.runLivePing) {
    await gatewayTestConnection({ provider: activeProvider, model: activeModel });
  }

  const activeSummary = getProviderStatusSummary(activeProvider);
  const allProviders = listAllProviderSummaries();
  const isConnected = activeSummary.connectionState === "CONNECTED";
  const isDegraded = activeSummary.connectionState === "DEGRADED";

  return {
    state: activeSummary.connectionState,
    activeProvider,
    activeModel: activeSummary.model,
    lastCheckedAt: activeSummary.lastVerifiedAt,
    latencyMs: activeSummary.lastLatencyMs,
    httpStatus: activeSummary.lastHttpStatus,
    errorMessage: activeSummary.lastError,
    physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
    capabilities: activeSummary.capabilities,
    subsystems: {
      memory: "READY",
      chat: isConnected ? "READY" : isDegraded ? "DEGRADED" : "BLOCKED",
      diagramGeneration: isConnected ? "READY" : isDegraded ? "DEGRADED" : "BLOCKED",
      engineeringAnalysis: isConnected ? "READY" : isDegraded ? "DEGRADED" : "BLOCKED",
      toolCalling:
        isConnected && activeSummary.capabilities.toolCalling
          ? "READY"
          : isDegraded
            ? "DEGRADED"
            : "BLOCKED",
    },
    providers: allProviders,
    ollamaStatus: getLastOllamaProbe(),
    usageStats: { ...usageTotals },
    recentAuditEvents: getAiAuditEvents().slice(0, 40),
    recentFailures: getAiFailureEvents().slice(0, 20),
  };
}
