// Multi-tenant server functions: list/switch tenants, manage members and invites.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  isActive: boolean;
};

export type MemberSummary = {
  user_id: string;
  role: string;
  full_name: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type InviteSummary = {
  id: string;
  email: string;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export const listMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantSummary[]> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const activeId = profile?.tenant_id;

    const { data: memberships, error } = await supabase
      .from("tenant_memberships")
      .select("role, tenant_id, tenants(id, name, slug, plan)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (
      (memberships ?? []) as Array<{
        role: string;
        tenant_id: string;
        tenants: { id: string; name: string; slug: string; plan: string } | null;
      }>
    )
      .filter((m) => m.tenants)
      .map((m) => ({
        id: m.tenants!.id,
        name: m.tenants!.name,
        slug: m.tenants!.slug,
        plan: m.tenants!.plan,
        role: m.role,
        isActive: m.tenants!.id === activeId,
      }));
  });

export const switchActiveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Membership check (RLS would also block but we want a clean error).
    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!membership) throw new Error("Você não é membro deste workspace.");

    const { error } = await supabase
      .from("profiles")
      .update({ tenant_id: data.tenantId })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, tenantId: data.tenantId };
  });

export const listTenantMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberSummary[]> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from("tenant_memberships")
      .select("user_id, role, accepted_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      user_id: string;
      role: string;
      accepted_at: string | null;
      created_at: string;
    }>;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const nameById = new Map(
      ((profs ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name,
      ]),
    );
    return rows.map((r) => ({
      user_id: r.user_id,
      role: r.role,
      accepted_at: r.accepted_at,
      created_at: r.created_at,
      full_name: nameById.get(r.user_id) ?? null,
    }));
  });

export const listTenantInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InviteSummary[]> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("invites")
      .select("id, email, role, token, created_at, expires_at, accepted_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as InviteSummary[];
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(255),
        role: z.enum(["admin", "engineer", "operator", "viewer"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenantAdmin(supabase, userId);

    const { data: invite, error } = await supabase
      .from("invites")
      .insert({
        tenant_id: tenantId,
        email: data.email.toLowerCase(),
        role: data.role,
      })
      .select("id, token, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return invite;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ inviteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("invites").delete().eq("id", data.inviteId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("Você não pode remover a si mesmo.");
    const tenantId = await requireTenantAdmin(supabase, userId);
    const { error } = await supabase
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "engineer", "operator", "viewer"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenantAdmin(supabase, userId);
    const { error } = await supabase
      .from("tenant_memberships")
      .update({ role: data.role })
      .eq("tenant_id", tenantId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Resolve o tenant ativo do usuário a partir de `profiles.tenant_id` e
 * confirma que ele tem papel `admin`/`owner` em `tenant_memberships` para
 * esse tenant. Fonte de verdade do RBAC = `tenant_memberships`, nunca
 * `profiles.role` (que pode divergir).
 */
async function requireTenantAdmin(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth.client>>["context"] extends infer _ ? any : never,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId) throw new Error("Workspace não encontrado.");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const role = membership?.role as string | undefined;
  if (!role || !["owner", "admin"].includes(role)) {
    throw new Error("Apenas administradores do workspace podem executar esta ação.");
  }
  return tenantId;
}

export const acceptInviteByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = String(claims.email ?? "").toLowerCase();
    if (!email) throw new Error("user_not_found");

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invites")
      .select("id, tenant_id, email, role, accepted_at, expires_at")
      .eq("token", data.token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (inviteError) throw new Error(inviteError.message);
    if (!invite) throw new Error("invalid_or_expired_invite");
    if (invite.email.toLowerCase() !== email) throw new Error("email_mismatch");

    const { error: membershipError } = await supabaseAdmin.from("tenant_memberships").upsert(
      {
        tenant_id: invite.tenant_id,
        user_id: userId,
        role: invite.role,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (membershipError) throw new Error(membershipError.message);

    const acceptedAt = new Date().toISOString();
    const { error: updateInviteError } = await supabaseAdmin
      .from("invites")
      .update({ accepted_at: acceptedAt })
      .eq("id", invite.id);
    if (updateInviteError) throw new Error(updateInviteError.message);

    const r = { tenant_id: invite.tenant_id, role: invite.role };
    if (r?.tenant_id) {
      // Auto-switch active tenant to the one just accepted.
      await supabase.from("profiles").update({ tenant_id: r.tenant_id }).eq("id", userId);
    }
    return r;
  });
