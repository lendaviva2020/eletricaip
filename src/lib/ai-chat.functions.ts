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
import {
  getGeminiClient,
  getGeminiModel,
  getGeminiApiKey,
  validateGeminiKey,
  mapGeminiError,
} from "@/lib/ai/gemini-client.server";

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

    // Load full history for context.
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    const rawMessages = [
      ...((history ?? []) as Array<{ role: string; content: string }>).map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        text: sanitizePromptText(m.content, 2000),
      })),
    ];
    if (rawMessages.length === 0 || rawMessages[rawMessages.length - 1].role !== "user") {
      rawMessages.push({
        role: "user" as const,
        text: sanitizePromptText(data.prompt, 2000),
      });
    }

    // Consolidate adjacent turns of the same role for strict Gemini adherence
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
    for (const msg of rawMessages) {
      if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
        contents[contents.length - 1].parts.push({ text: msg.text });
      } else {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
    }

    let streamResponse;
    try {
      const ai = getGeminiClient();
      const model = getGeminiModel();
      streamResponse = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: getChatSystemPrompt(data.locale ?? "pt-BR"),
          temperature: 0.4,
        },
      });
    } catch (e) {
      const mapped = mapGeminiError(e);
      yield { type: "error" as const, message: mapped.message };
      return;
    }

    let accumulated = "";
    let totalTokens = 0;
    try {
      for await (const chunk of streamResponse) {
        const delta = chunk.text || "";
        if (delta) {
          accumulated += delta;
          yield { type: "delta" as const, text: delta };
        }
        if (chunk.usageMetadata?.totalTokenCount) {
          totalTokens = chunk.usageMetadata.totalTokenCount;
        }
      }
    } catch (err) {
      const mapped = mapGeminiError(err);
      yield { type: "error" as const, message: mapped.message };
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
