/**
 * Camada única de provedores de IA (somente servidor). A plataforma paga as
 * chaves (DEEPSEEK_API_KEY, GEMINI_API_KEY); o usuário só escolhe o provedor
 * pelo chat (`provider-switch.ts`).
 *
 * Padrão: DeepSeek. Se o provedor preferido falhar por falta de chave,
 * autenticação, modelo inexistente, limite ou indisponibilidade, a chamada
 * cai para o outro automaticamente — a IA não fica fora do ar por um só
 * fornecedor. A mensagem ao usuário nunca cita nome de variável de ambiente.
 */
import {
  getGeminiApiKey,
  getGeminiClient,
  getGeminiModel,
  mapGeminiError,
  validateGeminiKey,
  type GeminiTask,
} from "./gemini-client.server";
import { AI_PROVIDERS, isAiProviderId, type AiProviderId } from "./provider-switch";

export type AiTask = GeminiTask;

export interface AiCallError {
  readonly code:
    | "MISSING_KEY"
    | "AUTH_401"
    | "RATE_LIMIT_429"
    | "UPSTREAM_5XX"
    | "NETWORK"
    | "BAD_RESPONSE"
    | "MODEL_NOT_FOUND";
  readonly message: string;
  readonly provider: AiProviderId;
  readonly status?: number;
}

export class AiProviderError extends Error {
  constructor(readonly detail: AiCallError) {
    super(detail.message);
    this.name = "AiProviderError";
  }
}

export interface AiTextResult {
  readonly text: string;
  readonly tokensUsed: number;
  readonly provider: AiProviderId;
  readonly model: string;
}

export interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

const DEEPSEEK_BASE = "https://api.deepseek.com";
/** Nome do modelo configurável: a DeepSeek renomeia modelos com frequência. */
export function getDeepSeekModel(task: AiTask = "fast"): string {
  const env = task === "architect" ? process.env.DEEPSEEK_MODEL_ARCHITECT : undefined;
  return (env || process.env.DEEPSEEK_MODEL || "deepseek-chat").trim();
}

function deepSeekKey(): string | undefined {
  const k = process.env.DEEPSEEK_API_KEY?.trim();
  return k && k.length >= 20 ? k : undefined;
}

/** Provedores com chave configurada, na ordem padrão (DeepSeek primeiro). */
export function availableProviders(): AiProviderId[] {
  const out: AiProviderId[] = [];
  if (deepSeekKey()) out.push("deepseek");
  if (validateGeminiKey(getGeminiApiKey()).ok) out.push("gemini");
  return out;
}

/** Ordem de tentativa: preferido (se tiver chave) e depois os demais. */
export function providerOrder(preferred?: AiProviderId | null): AiProviderId[] {
  const avail = availableProviders();
  const first = preferred && avail.includes(preferred) ? [preferred] : [];
  return [...first, ...AI_PROVIDERS.filter((p) => avail.includes(p) && !first.includes(p))];
}

/** Erros que justificam tentar o outro provedor. */
function shouldFallback(e: AiCallError): boolean {
  return e.code !== "BAD_RESPONSE";
}

function mapHttpError(provider: AiProviderId, status: number, body: string): AiCallError {
  if (status === 401 || status === 403) {
    return {
      code: "AUTH_401",
      message: "Provedor de IA recusou a autenticação.",
      provider,
      status,
    };
  }
  if (status === 402 || status === 429) {
    return {
      code: "RATE_LIMIT_429",
      message: "Provedor de IA sobrecarregado. Tentando de novo.",
      provider,
      status,
    };
  }
  if (status === 404 || /model.*(not exist|not found)/i.test(body)) {
    return { code: "MODEL_NOT_FOUND", message: "Modelo de IA indisponível.", provider, status };
  }
  if (status >= 500) {
    return {
      code: "UPSTREAM_5XX",
      message: "Provedor de IA temporariamente indisponível.",
      provider,
      status,
    };
  }
  return {
    code: "BAD_RESPONSE",
    message: "Pedido recusado pelo provedor de IA.",
    provider,
    status,
  };
}

function toCallError(provider: AiProviderId, err: unknown): AiCallError {
  if (err instanceof AiProviderError) return err.detail;
  if (provider === "gemini") {
    const m = mapGeminiError(err);
    const code: AiCallError["code"] =
      m.code === "INVALID_KEY_FORMAT"
        ? "MISSING_KEY"
        : m.code === "SCHEMA_VALIDATION_FAILED"
          ? "BAD_RESPONSE"
          : m.code;
    return { code, message: "Falha ao consultar o Google Gemini.", provider, status: m.status };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort|timeout|fetch failed|ENOTFOUND|ECONNRESET|network/i.test(msg)) {
    return { code: "NETWORK", message: "Falha de rede ao consultar a IA.", provider };
  }
  return { code: "BAD_RESPONSE", message: "Resposta inesperada da IA.", provider };
}

// ─── DeepSeek (API compatível com OpenAI) ───────────────────────────────────

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function deepSeekRequest(body: Record<string, unknown>, timeoutMs: number) {
  const key = deepSeekKey();
  if (!key) {
    throw new AiProviderError({
      code: "MISSING_KEY",
      message: "DeepSeek não configurada.",
      provider: "deepseek",
    });
  }
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[ai.deepseek] HTTP", res.status, text.slice(0, 300));
    throw new AiProviderError(mapHttpError("deepseek", res.status, text));
  }
  return res;
}

async function deepSeekJson(
  task: AiTask,
  system: string,
  turns: readonly ChatTurn[],
  jsonSchema: unknown,
  temperature: number,
): Promise<AiTextResult> {
  const model = getDeepSeekModel(task);
  // O modo JSON da DeepSeek exige pedir JSON no prompt; o esquema vai junto.
  const schemaNote = `\n\nResponda SOMENTE com um objeto JSON válido que siga este JSON Schema:\n${JSON.stringify(jsonSchema)}`;
  const messages: DeepSeekMessage[] = [
    { role: "system", content: system + schemaNote },
    ...turns.map((t) => ({ role: t.role, content: t.content })),
  ];
  const res = await deepSeekRequest(
    {
      model,
      messages,
      temperature,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      stream: false,
    },
    120_000,
  );
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new AiProviderError({
      code: "BAD_RESPONSE",
      message: "A IA não devolveu conteúdo.",
      provider: "deepseek",
    });
  }
  return { text, tokensUsed: Number(json.usage?.total_tokens) || 0, provider: "deepseek", model };
}

async function* deepSeekStream(
  system: string,
  turns: readonly ChatTurn[],
  temperature: number,
): AsyncGenerator<{ delta?: string; tokens?: number }> {
  const res = await deepSeekRequest(
    {
      model: getDeepSeekModel("fast"),
      messages: [{ role: "system", content: system }, ...turns],
      temperature,
      stream: true,
      stream_options: { include_usage: true },
    },
    120_000,
  );
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (chunk.usage?.total_tokens) yield { tokens: chunk.usage.total_tokens };
      } catch {
        // linha parcial ou keep-alive: ignora
      }
    }
  }
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

async function geminiJson(
  task: AiTask,
  system: string,
  turns: readonly ChatTurn[],
  jsonSchema: unknown,
  temperature: number,
): Promise<AiTextResult> {
  if (!validateGeminiKey(getGeminiApiKey()).ok) {
    throw new AiProviderError({
      code: "MISSING_KEY",
      message: "Gemini não configurado.",
      provider: "gemini",
    });
  }
  const ai = getGeminiClient();
  const model = getGeminiModel(task);
  const response = await ai.models.generateContent({
    model,
    contents: turns.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    config: {
      systemInstruction: system,
      temperature,
      responseMimeType: "application/json",
      responseSchema: jsonSchema as Record<string, unknown>,
    },
  });
  const text = response.text?.trim() ?? "";
  if (!text) {
    throw new AiProviderError({
      code: "BAD_RESPONSE",
      message: "A IA não devolveu conteúdo.",
      provider: "gemini",
    });
  }
  return {
    text,
    tokensUsed: Number(response.usageMetadata?.totalTokenCount) || 0,
    provider: "gemini",
    model,
  };
}

async function* geminiStream(
  system: string,
  turns: readonly ChatTurn[],
  temperature: number,
): AsyncGenerator<{ delta?: string; tokens?: number }> {
  if (!validateGeminiKey(getGeminiApiKey()).ok) {
    throw new AiProviderError({
      code: "MISSING_KEY",
      message: "Gemini não configurado.",
      provider: "gemini",
    });
  }
  // Gemini exige alternância estrita de papéis: junta turnos consecutivos.
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const t of turns) {
    const role = t.role === "assistant" ? ("model" as const) : ("user" as const);
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push({ text: t.content });
    else contents.push({ role, parts: [{ text: t.content }] });
  }
  const stream = await getGeminiClient().models.generateContentStream({
    model: getGeminiModel(),
    contents,
    config: { systemInstruction: system, temperature },
  });
  for await (const chunk of stream) {
    if (chunk.text) yield { delta: chunk.text };
    if (chunk.usageMetadata?.totalTokenCount) yield { tokens: chunk.usageMetadata.totalTokenCount };
  }
}

// ─── API pública ────────────────────────────────────────────────────────────

/** Geração estruturada (JSON) com queda automática para o outro provedor. */
export async function generateJson(opts: {
  task: AiTask;
  system: string;
  turns: readonly ChatTurn[];
  jsonSchema: unknown;
  preferred?: AiProviderId | null;
  temperature?: number;
}): Promise<AiTextResult> {
  const order = providerOrder(opts.preferred);
  if (order.length === 0) {
    throw new AiProviderError({
      code: "MISSING_KEY",
      message: "IA temporariamente indisponível.",
      provider: opts.preferred ?? "deepseek",
    });
  }
  let last: AiCallError | null = null;
  for (const p of order) {
    try {
      return p === "deepseek"
        ? await deepSeekJson(
            opts.task,
            opts.system,
            opts.turns,
            opts.jsonSchema,
            opts.temperature ?? 0.2,
          )
        : await geminiJson(
            opts.task,
            opts.system,
            opts.turns,
            opts.jsonSchema,
            opts.temperature ?? 0.2,
          );
    } catch (err) {
      last = toCallError(p, err);
      console.error(`[ai.${p}] generateJson falhou:`, last.code, last.status ?? "");
      if (!shouldFallback(last)) break;
    }
  }
  throw new AiProviderError(last!);
}

/**
 * Streaming de texto com queda automática — só antes do primeiro trecho;
 * depois de começar a responder, um erro encerra a resposta.
 */
export async function* streamText(opts: {
  system: string;
  turns: readonly ChatTurn[];
  preferred?: AiProviderId | null;
  temperature?: number;
}): AsyncGenerator<
  | { type: "provider"; provider: AiProviderId }
  | { type: "delta"; text: string }
  | { type: "usage"; tokens: number }
> {
  const order = providerOrder(opts.preferred);
  if (order.length === 0) {
    throw new AiProviderError({
      code: "MISSING_KEY",
      message: "IA temporariamente indisponível.",
      provider: opts.preferred ?? "deepseek",
    });
  }
  let last: AiCallError | null = null;
  for (const p of order) {
    let started = false;
    try {
      const gen =
        p === "deepseek"
          ? deepSeekStream(opts.system, opts.turns, opts.temperature ?? 0.4)
          : geminiStream(opts.system, opts.turns, opts.temperature ?? 0.4);
      for await (const part of gen) {
        if (!started) {
          started = true;
          yield { type: "provider", provider: p };
        }
        if (part.delta) yield { type: "delta", text: part.delta };
        if (part.tokens) yield { type: "usage", tokens: part.tokens };
      }
      if (!started) yield { type: "provider", provider: p };
      return;
    } catch (err) {
      last = toCallError(p, err);
      console.error(`[ai.${p}] streamText falhou:`, last.code, last.status ?? "");
      if (started || !shouldFallback(last)) break;
    }
  }
  throw new AiProviderError(last!);
}

/** Teste barato de disponibilidade (banner do editor). Não consome créditos do usuário. */
export async function pingAi(preferred?: AiProviderId | null): Promise<{
  ok: boolean;
  provider: AiProviderId | null;
  available: AiProviderId[];
}> {
  const available = availableProviders();
  return { ok: available.length > 0, provider: providerOrder(preferred)[0] ?? null, available };
}

export function parseStoredProvider(preferences: unknown): AiProviderId {
  if (preferences && typeof preferences === "object") {
    const v = (preferences as Record<string, unknown>).ai_provider;
    if (isAiProviderId(v)) return v;
  }
  return "deepseek";
}
