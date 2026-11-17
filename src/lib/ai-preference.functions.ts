/**
 * Preferência de provedor de IA por usuário (DeepSeek ou Gemini), escolhida
 * conversando no chat. Fica em `profiles.preferences.ai_provider` — o próprio
 * usuário só altera a própria linha (RLS). Nenhuma chave é do usuário.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { availableProviders, parseStoredProvider } from "@/lib/ai/ai-provider.server";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/provider-switch";

type Db = SupabaseClient;

export async function loadUserAiProvider(db: unknown, userId: string): Promise<AiProviderId> {
  const { data } = await (db as Db)
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  return parseStoredProvider((data as { preferences?: unknown } | null)?.preferences);
}

export async function saveUserAiProvider(
  db: unknown,
  userId: string,
  provider: AiProviderId,
): Promise<boolean> {
  const client = db as Db;
  const { data } = await client
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  const current = (data as { preferences?: unknown } | null)?.preferences;
  const base = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  const { data: updated, error } = await client
    .from("profiles")
    .update({ preferences: { ...base, ai_provider: provider } })
    .eq("id", userId)
    .select("id");
  if (error) {
    console.error("[ai-preference] falha ao salvar:", error.code);
    return false;
  }
  // RLS que bloqueia devolve 0 linhas sem erro: não é sucesso.
  return Array.isArray(updated) && updated.length > 0;
}

export const getAiProviderPreference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const preferred = await loadUserAiProvider(context.supabase, context.userId);
    return { preferred, available: availableProviders() };
  });

export const setAiProviderPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: z.enum(AI_PROVIDERS) }).parse(input))
  .handler(async ({ data, context }) => {
    const saved = await saveUserAiProvider(context.supabase, context.userId, data.provider);
    return { saved, preferred: data.provider, available: availableProviders() };
  });
