// AI Chat with streaming via Lovable AI Gateway. Persists to ai_conversations + ai_messages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    // Cascade delete messages first (no FK cascade defined).
    await supabase.from("ai_messages").delete().eq("conversation_id", data.conversationId);
    const { error } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const SYSTEM_PROMPT = `Você é o EletricAI Copilot — um engenheiro elétrico industrial sênior brasileiro.
Responda em PT-BR de forma técnica, objetiva e citando NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3 quando relevante.
Use markdown (listas, tabelas, **negrito**) para clareza.`;

function parseSSEDelta(chunk: string): string[] {
  const out: string[] = [];
  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) out.push(delta);
    } catch {
      /* ignore partial frames */
    }
  }
  return out;
}

export const streamChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        prompt: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async function* ({ data, context }) {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      yield { type: "error" as const, message: "LOVABLE_API_KEY ausente no servidor." };
      return;
    }

    // Quota check.
    const { data: quota, error: qErr } = await supabase.rpc("check_ai_quota");
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

    // Persist the user message.
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
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...((history ?? []) as Array<{ role: string; content: string }>).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
      }),
    });

    if (upstream.status === 429) {
      yield {
        type: "error" as const,
        message: "Limite de requisições atingido. Aguarde alguns segundos.",
      };
      return;
    }
    if (upstream.status === 402) {
      yield {
        type: "error" as const,
        message: "Créditos do gateway de IA esgotados. Adicione créditos no workspace.",
      };
      return;
    }
    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      console.error("AI gateway error:", upstream.status, txt.slice(0, 300));
      yield { type: "error" as const, message: `Falha do gateway (${upstream.status}).` };
      return;
    }

    let buffer = "";
    let accumulated = "";
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lastBreak = buffer.lastIndexOf("\n");
        if (lastBreak === -1) continue;
        const chunk = buffer.slice(0, lastBreak);
        buffer = buffer.slice(lastBreak + 1);
        for (const delta of parseSSEDelta(chunk)) {
          accumulated += delta;
          yield { type: "delta" as const, text: delta };
        }
      }
      if (buffer.trim().length > 0) {
        for (const delta of parseSSEDelta(buffer)) {
          accumulated += delta;
          yield { type: "delta" as const, text: delta };
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }

    // Persist assistant message + estimate tokens (~4 chars/token).
    const tokens = Math.ceil(accumulated.length / 4);
    await supabase.from("ai_messages").insert({
      conversation_id: data.conversationId,
      role: "assistant",
      content: accumulated,
      tokens_used: tokens,
    });
    if (tokens > 0) {
      await supabase.rpc("increment_ai_tokens", { p_tokens: tokens });
    }
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    yield { type: "done" as const, tokens };
  });
