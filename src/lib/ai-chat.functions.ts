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
import { AiProviderError, availableProviders, streamText } from "@/lib/ai/ai-provider.server";
import {
  detectProviderIntent,
  switchConfirmation,
  whichProviderAnswer,
} from "@/lib/ai/provider-switch";
import { loadUserAiProvider, saveUserAiProvider } from "@/lib/ai-preference.functions";

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
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("ai_messages")
      .select("id, conversation_id, role, content, created_at, tokens_used")
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

      // Busca conversa ativa mais recente para este projeto
      const { data: existing, error: searchErr } = await supabase
        .from("ai_conversations")
        .select("id, title, created_at, updated_at")
        .eq("project_id", data.projectId)
        .eq("user_id", userId)
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

      // Carrega o histórico completo de mensagens
      const { data: msgs, error: msgErr } = await supabase
        .from("ai_messages")
        .select("id, conversation_id, role, content, created_at, tokens_used")
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
export const persistChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1),
        tokensUsed: z.number().int().optional(),
        toolCalls: z.record(z.string(), z.any()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ChatMessage> => {
    const { supabase } = context;

    const { data: row, error } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: data.conversationId,
        role: data.role,
        content: data.content,
        tokens_used: data.tokensUsed ?? null,
        tool_calls: (data.toolCalls as any) ?? {},
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
    }> => {
      const { supabase, userId } = context;

      const { count: convCount } = await supabase
        .from("ai_conversations")
        .select("id", { count: "exact", head: true })
        .eq("project_id", data.projectId)
        .eq("user_id", userId);

      const { data: convs } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("project_id", data.projectId)
        .eq("user_id", userId)
        .limit(10);

      const convIds = (convs ?? []).map((c) => c.id);

      if (convIds.length === 0) {
        return { totalConversations: 0, totalMessages: 0, recentFixes: [] };
      }

      const { count: msgCount } = await supabase
        .from("ai_messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convIds);

      const { data: recentMsgs } = await supabase
        .from("ai_messages")
        .select("role, content, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(5);

      return {
        totalConversations: convCount ?? 0,
        totalMessages: msgCount ?? 0,
        recentFixes: (recentMsgs ?? []).reverse(),
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
        prompt: z.string().min(1).max(32000),
        locale: z.enum(["pt-BR", "en"]).default("pt-BR"),
      })
      .parse(input),
  )
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context;

    // Troca de IA conversando: responde direto, sem chamar modelo nem gastar crédito.
    const intent = detectProviderIntent(data.prompt);
    if (intent) {
      const available = availableProviders();
      let reply: string;
      if (intent.kind === "switch") {
        const saved = await saveUserAiProvider(supabase, userId, intent.provider);
        reply = saved
          ? switchConfirmation(intent.provider, available)
          : "Não consegui salvar sua preferência agora. Tente de novo em instantes.";
      } else {
        reply = whichProviderAnswer(await loadUserAiProvider(supabase, userId), available);
      }
      await supabase.from("ai_messages").insert([
        { conversation_id: data.conversationId, role: "user", content: data.prompt },
        { conversation_id: data.conversationId, role: "assistant", content: reply, tokens_used: 0 },
      ]);
      yield { type: "delta" as const, text: reply };
      yield { type: "done" as const, tokens: 0 };
      return;
    }

    if (availableProviders().length === 0) {
      yield { type: "error" as const, message: "IA temporariamente indisponível." };
      return;
    }
    const preferred = await loadUserAiProvider(supabase, userId);

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

    // Load full history for context.
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    const turns: Array<{ role: "user" | "assistant"; content: string }> = (
      (history ?? []) as Array<{ role: string; content: string }>
    ).map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: sanitizePromptText(m.content, 2000),
    }));
    if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
      turns.push({ role: "user", content: sanitizePromptText(data.prompt, 2000) });
    }

    let accumulated = "";
    let totalTokens = 0;
    try {
      for await (const part of streamText({
        system: getChatSystemPrompt(data.locale ?? "pt-BR"),
        turns,
        preferred,
        temperature: 0.4,
      })) {
        if (part.type === "delta") {
          accumulated += part.text;
          yield { type: "delta" as const, text: part.text };
        } else if (part.type === "usage") {
          totalTokens = part.tokens;
        }
      }
    } catch (err) {
      const message =
        err instanceof AiProviderError ? err.detail.message : "Falha ao consultar a IA.";
      yield { type: "error" as const, message };
      return;
    }

    // Persist assistant message + real or estimated tokens
    const tokens = totalTokens > 0 ? totalTokens : Math.ceil(accumulated.length / 4);
    await supabase.from("ai_messages").insert({
      conversation_id: data.conversationId,
      role: "assistant",
      content: accumulated,
      tokens_used: tokens,
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

    yield { type: "done" as const, tokens };
  });
