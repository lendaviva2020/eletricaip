/**
 * Perfil do próprio usuário. Usa o cliente Supabase DO USUÁRIO (RLS: só a
 * própria linha). Antes a tela gravava o cargo em `profiles.role` (papel de
 * segurança): o trigger desfazia e a UI dizia "salvo".
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";
import { normalizeLocale } from "@/lib/i18n/types";
import type { Json } from "@/integrations/supabase/types";
import {
  ProfileUpdateSchema,
  mergePreferences,
  normalizeAvatarUrl,
  readJobTitle,
  readProviderAvatar,
  type MyProfile,
} from "@/lib/profile";

interface ProfileRow {
  full_name: string | null;
  locale: string | null;
  avatar_url: string | null;
  preferences: unknown;
  tenant_id: string | null;
}

async function loadRow(ctx: AuthContext): Promise<ProfileRow | null> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("full_name, locale, avatar_url, preferences, tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) {
    console.error("[profile] leitura:", error.code);
    throw new Response("Não foi possível carregar o perfil.", { status: 500 });
  }
  return (data as ProfileRow | null) ?? null;
}

async function loadOrganization(
  ctx: AuthContext,
  tenantId: string | null,
): Promise<MyProfile["organization"]> {
  if (!tenantId) return null;
  const [{ data: tenant }, { data: membership }] = await Promise.all([
    ctx.supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    ctx.supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);
  if (!tenant) return null;
  return { name: tenant.name, role: membership?.role ?? "" };
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfile> => {
    const { data: userData } = await context.supabase.auth.getUser(context.token);
    const user = userData?.user ?? null;
    let row = await loadRow(context);

    // Conta antiga sem linha em `profiles`: cria (policy "insert own").
    if (!row) {
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const fullName =
        typeof meta.full_name === "string" ? meta.full_name.trim().slice(0, 120) : "";
      const { error } = await context.supabase
        .from("profiles")
        .insert({ id: context.userId, full_name: fullName });
      if (error) console.error("[profile] criação:", error.code);
      row = await loadRow(context);
    }

    return {
      email: user?.email ?? "",
      createdAt: user?.created_at ?? null,
      fullName: row?.full_name ?? "",
      jobTitle: readJobTitle(row?.preferences),
      locale: normalizeLocale(row?.locale),
      avatarUrl: row?.avatar_url ? (normalizeAvatarUrl(row.avatar_url) ?? "") : "",
      providerAvatarUrl: readProviderAvatar(user?.user_metadata),
      organization: await loadOrganization(context, row?.tenant_id ?? null),
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const row = await loadRow(context);
    if (!row) throw new Response("Perfil não encontrado.", { status: 404 });

    const { data: updated, error } = await context.supabase
      .from("profiles")
      .update({
        full_name: data.fullName,
        locale: data.locale,
        avatar_url: normalizeAvatarUrl(data.avatarUrl),
        preferences: mergePreferences(row.preferences, data.jobTitle) as Json,
      })
      .eq("id", context.userId)
      .select("id");
    if (error) {
      console.error("[profile] gravação:", error.code);
      throw new Response("Não foi possível salvar o perfil.", { status: 500 });
    }
    // RLS que bloqueia devolve 0 linhas sem erro: não é sucesso.
    if (!updated || updated.length === 0) {
      throw new Response("Não foi possível salvar o perfil.", { status: 403 });
    }
    return { saved: true as const };
  });
