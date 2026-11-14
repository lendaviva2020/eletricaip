// AI Chat with streaming via Google Gemini. Persists to ai_conversations + ai_messages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  requireAiQuota,
  requireBurstLimit,
} from "@/integrations/supabase/ai-rate-limit-middleware";
import { sanitizePromptText } from "@/lib/ai/context-sanitizer";
import { assertProjectTenantAccess, loadProjectAiMemoryContext } from "@/lib/ai/memory.server";
import {
  getGeminiApiKey,
  validateGeminiKey,
} from "@/lib/ai/gemini-client.server";
import { gatewayExecute, gatewayStreamChat } from "@/lib/ai/gateway/ai-gateway.server";
import {
  buildUnifiedEngineeringSystemPrompt,
  extractEngineeringSnapshotFromState,
} from "@/lib/ai/gateway/engineering-context.server";
import {
  ENGINEERING_TOOL_DECLARATIONS,
  executeAuthorizedEngineeringTool,
  type EngineeringToolName,
} from "@/lib/ai/gateway/engineering-tools.server";
import { AI_MODULE_DISCIPLINES, type AiModuleDiscipline } from "@/lib/ai/gateway/types";

export type ChatConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  tokens_used: number | null;
  tool_calls?: Record<string, unknown> | null;
};

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatConversation[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatConversation[];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ title: z.string().min(1).max(120).default("Nova conversa") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ChatConversation> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: userId, title: data.title })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as ChatConversation;
  });

export const getConversationMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ChatMessage[]> => {
    const { supabase, userId } = context;
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id, project_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (conv?.project_id) {
      await assertProjectTenantAccess(supabase, userId, conv.project_id);
    }
    const { data: rows, error } = await supabase
      .from("ai_messages")
      .select("id, conversation_id, role, content, created_at, tokens_used, tool_calls")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatMessage[];
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Ordem importa: mensagens primeiro. Erro aqui aborta antes de tocar
    // na conversa (sem isso, as mensagens ficavam órfãs no banco — a policy
    // de DELETE em ai_messages não existia; ver migration 20261012110000).
    const { error: msgErr } = await supabase
      .from("ai_messages")
      .delete()
      .eq("conversation_id", data.conversationId);
    if (msgErr) throw new Error(msgErr.message);
    const { error } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Recupera ou inicializa a conversa contínua de engenharia vinculada ao projeto.
 * Garante que a memória técnica persista entre abas, recarregamentos e navegação.
 */
export const getOrCreateProjectConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(120).default("Engenharia Industrial ElétricAi"),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      conversation: ChatConversation;
      messages: ChatMessage[];
    }> => {
      const { supabase, userId } = context;

      await assertProjectTenantAccess(supabase, userId, data.projectId);

      // Busca conversa ativa mais recente para este projeto (visível aos membros autorizados)
      const { data: existing, error: searchErr } = await supabase
        .from("ai_conversations")
        .select("id, title, created_at, updated_at")
        .eq("project_id", data.projectId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (searchErr) throw new Error(searchErr.message);

      let conversation = existing?.[0] as ChatConversation | undefined;

      if (!conversation) {
        const { data: created, error: createErr } = await supabase
          .from("ai_conversations")
          .insert({
            user_id: userId,
            project_id: data.projectId,
            title: data.title,
          })
          .select("id, title, created_at, updated_at")
          .single();

        if (createErr) throw new Error(createErr.message);
        conversation = created as ChatConversation;
      }

      // Carrega o histórico completo em ordem cronológica (zero truncamento destrutivo)
      const { data: msgs, error: msgErr } = await supabase
        .from("ai_messages")
        .select("id, conversation_id, role, content, created_at, tokens_used, tool_calls")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (msgErr) throw new Error(msgErr.message);

      return {
        conversation,
        messages: (msgs ?? []) as ChatMessage[],
      };
    },
  );

/**
 * Persiste uma mensagem no histórico da conversa e atualiza o timestamp da conversa.
 */
const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

export const persistChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(64000),
        tokensUsed: z.number().int().optional(),
        toolCalls: z.record(z.string(), JsonValueSchema).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ChatMessage> => {
    const { supabase, userId } = context;

    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id, project_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (conv?.project_id) {
      await assertProjectTenantAccess(supabase, userId, conv.project_id);
    }

    const { data: row, error } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: data.conversationId,
        role: data.role,
        content: data.content,
        tokens_used: data.tokensUsed ?? null,
        tool_calls: data.toolCalls ?? {},
      })
      .select("id, conversation_id, role, content, created_at, tokens_used")
      .single();

    if (error) throw new Error(error.message);

    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return row as ChatMessage;
  });

/**
 * Recupera o resumo da memória de engenharia de um projeto (decisões técnicas acumuladas).
 */
export const getProjectEngineeringMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      totalConversations: number;
      totalMessages: number;
      recentFixes: Array<{ role: string; content: string; created_at: string }>;
      summaryBlock: string;
    }> => {
      const { supabase, userId } = context;
      const mem = await loadProjectAiMemoryContext(supabase, userId, {
        projectId: data.projectId,
      });

      return {
        totalConversations: mem.totalConversations,
        totalMessages: mem.totalMessages,
        recentFixes: mem.recentFixes,
        summaryBlock: mem.summaryBlock,
      };
    },
  );

export function getChatSystemPrompt(locale: "pt-BR" | "en" = "pt-BR"): string {
  if (locale === "en") {
    return `You are the EletricAI Copilot — a senior industrial electrical engineer.
Respond in English in a technical, objective manner, citing IEC 60364, IEC 60909, NFPA 70E, ISO 13849, and IEC 61131-3 when relevant.
Use markdown (lists, tables, **bold**) for clarity.
Keep technical identifiers (e.g., QF1, KM1, M1, %I0.0, %Q0.0, TON, TOF) strictly invariant.`;
  }
  return `Você é o EletricAI Copilot — um engenheiro elétrico industrial sênior brasileiro.
Responda em PT-BR de forma técnica, objetiva e citando NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3 quando relevante.
Use markdown (listas, tabelas, **negrito**) para clareza.
Mantenha identificadores técnicos (ex.: QF1, KM1, M1, %I0.0, %Q0.0, TON, TOF) estritamente invariantes.`;
}

export const SYSTEM_PROMPT = getChatSystemPrompt("pt-BR");

export const streamChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        projectId: z.string().uuid().optional(),
        prompt: z.string().min(1).max(32000),
        locale: z.enum(["pt-BR", "en"]).default("pt-BR"),
        module: z.enum(AI_MODULE_DISCIPLINES).optional(),
        projectContext: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context;
    const apiKey = getGeminiApiKey();
    const keyValidation = validateGeminiKey(apiKey);
    if (!keyValidation.ok) {
      yield {
        type: "error" as const,
        message: !apiKey
          ? "GEMINI_API_KEY ausente nos secrets do servidor."
          : "GEMINI_API_KEY com formato inesperado.",
      };
      return;
    }

    // Quota check.
    const { data: quota, error: qErr } = await supabaseAdmin.rpc("check_ai_quota_for_user", {
      p_user_id: userId,
    });
    if (qErr) {
      yield { type: "error" as const, message: "Não foi possível verificar a cota." };
      return;
    }
    const q = (Array.isArray(quota) ? quota[0] : quota) as {
      allowed: boolean;
      used: number;
      max_tokens: number;
      plan: string;
    } | null;
    if (q && q.allowed === false) {
      yield {
        type: "error" as const,
        message: `Cota mensal de IA atingida (${q.used}/${q.max_tokens} tokens — plano ${q.plan}).`,
      };
      return;
    }

    // Persist the user message (store original, sanitize for LLM).
    await supabase.from("ai_messages").insert({
      conversation_id: data.conversationId,
      role: "user",
      content: data.prompt,
    });

    // Load newest chronological window + condensed engineering summary for long conversations (>24 turns).
    const mem = await loadProjectAiMemoryContext(supabase, userId, {
      conversationId: data.conversationId,
      projectId: data.projectId,
      recentLimit: 24,
    });

    const gatewayMessages: Array<{ role: "user" | "assistant"; content: string }> = mem.recentTurns.map(
      (t) => ({
        role: t.role === "model" ? ("assistant" as const) : ("user" as const),
        content: t.parts.map((p) => p.text).join("\n"),
      }),
    );
    const sanitizedLatestPrompt = sanitizePromptText(data.prompt, 2000);
    if (
      gatewayMessages.length === 0 ||
      gatewayMessages[gatewayMessages.length - 1].role !== "user"
    ) {
      gatewayMessages.push({
        role: "user" as const,
        content: sanitizedLatestPrompt,
      });
    }

    const activeModule: AiModuleDiscipline = data.module ?? "general";
    const snapshot = extractEngineeringSnapshotFromState(
      activeModule,
      data.projectContext ?? null,
      mem.summaryBlock,
    );
    const baseInstruction = getChatSystemPrompt(data.locale ?? "pt-BR");
    const unifiedInstruction = buildUnifiedEngineeringSystemPrompt({
      module: activeModule,
      locale: data.locale ?? "pt-BR",
      snapshot,
      memorySummaryBlock: mem.summaryBlock,
    });
    const systemInstruction = `${baseInstruction}\n\n${unifiedInstruction}`;

    let accumulated = "";
    let totalTokens = 0;
    let usedProvider = "gemini";
    let usedModel = "gemini-3-flash-preview";

    for await (const ev of gatewayStreamChat({
      operation: "stream_chat",
      module: activeModule,
      systemPrompt: systemInstruction,
      messages: gatewayMessages,
      temperature: 0.3,
      projectId: data.projectId,
      conversationId: data.conversationId,
    })) {
      if (ev.type === "delta") {
        accumulated += ev.text;
        yield { type: "delta" as const, text: ev.text };
      } else if (ev.type === "done") {
        totalTokens = ev.tokens;
        usedProvider = ev.provider;
        usedModel = ev.model;
      } else if (ev.type === "error") {
        yield { type: "error" as const, message: ev.message };
        return;
      }
    }

    // Persist assistant message + real or estimated tokens + provider/model metadata
    const tokens = totalTokens > 0 ? totalTokens : Math.ceil(accumulated.length / 4);
    await supabase.from("ai_messages").insert({
      conversation_id: data.conversationId,
      role: "assistant",
      content: accumulated,
      tokens_used: tokens,
      tool_calls: {
        provider: usedProvider,
        model: usedModel,
        module: activeModule,
        executedAt: new Date().toISOString(),
      },
    });
    if (tokens > 0) {
      await supabaseAdmin.rpc("increment_ai_tokens_for_user", {
        p_user_id: userId,
        p_tokens: tokens,
      });
    }
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    yield {
      type: "done" as const,
      tokens,
      provider: usedProvider,
      model: usedModel,
    };
  });

/**
 * Executes a non-streaming Engineering Agent chat turn with authorized tool calling support.
 */
export const sendEngineeringAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        prompt: z.string().min(1).max(32000),
        module: z.enum(AI_MODULE_DISCIPLINES).default("general"),
        projectContext: z.record(z.string(), z.unknown()).optional(),
        enableTools: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.projectId) {
      await assertProjectTenantAccess(supabase, userId, data.projectId);
    }

    const mem =
      data.projectId || data.conversationId
        ? await loadProjectAiMemoryContext(supabase, userId, {
            conversationId: data.conversationId,
            projectId: data.projectId,
            recentLimit: 16,
          })
        : { recentTurns: [], summaryBlock: "" };

    const snapshot = extractEngineeringSnapshotFromState(
      data.module,
      data.projectContext ?? null,
      mem.summaryBlock,
    );
    const systemPrompt = buildUnifiedEngineeringSystemPrompt({
      module: data.module,
      snapshot,
      memorySummaryBlock: mem.summaryBlock,
    });

    const messages = [
      ...mem.recentTurns.map((t) => ({
        role: t.role === "model" ? ("assistant" as const) : ("user" as const),
        content: t.parts.map((p) => p.text).join("\n"),
      })),
      { role: "user" as const, content: sanitizePromptText(data.prompt, 4000) },
    ];

    const res = await gatewayExecute({
      operation: "engineering_agent_turn",
      module: data.module,
      systemPrompt,
      messages,
      tools: data.enableTools ? ENGINEERING_TOOL_DECLARATIONS : undefined,
      projectId: data.projectId,
      conversationId: data.conversationId,
    });

    const executedTools: Array<{
      name: string;
      ok: boolean;
      result?: Record<string, unknown>;
      error?: string;
    }> = [];

    if (res.ok && res.toolCalls && res.toolCalls.length > 0) {
      for (const tc of res.toolCalls) {
        const toolRes = await executeAuthorizedEngineeringTool(
          tc.name as EngineeringToolName,
          {
            ...tc.arguments,
            ...(data.projectId ? { projectId: data.projectId } : {}),
            ...(data.projectContext?.doc ? { doc: data.projectContext.doc } : {}),
          },
        );
        executedTools.push({
          name: tc.name,
          ok: toolRes.ok,
          result: toolRes.result,
          error: toolRes.error?.message,
        });
      }
    }

    if (data.conversationId && res.ok) {
      await supabase.from("ai_messages").insert([
        {
          conversation_id: data.conversationId,
          role: "user",
          content: data.prompt,
        },
        {
          conversation_id: data.conversationId,
          role: "assistant",
          content: res.text || `Ferramentas executadas: ${executedTools.map((t) => t.name).join(", ")}`,
          tokens_used: res.totalTokens,
          tool_calls: {
            provider: res.provider,
            model: res.model,
            module: data.module,
            executedTools,
          },
        },
      ]);
    }

    return {
      ok: res.ok,
      text: res.text,
      provider: res.provider,
      model: res.model,
      tokensUsed: res.totalTokens,
      durationMs: res.durationMs,
      executedTools,
      error: res.error,
    };
  });
