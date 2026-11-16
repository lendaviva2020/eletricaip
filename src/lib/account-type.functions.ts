/**
 * Perfil da conta (empresa × autônomo) gravado na organização.
 *
 * Usa o cliente Supabase DO USUÁRIO: só o owner consegue atualizar
 * `tenants.name/settings` (grant de coluna + RLS). O servidor confere o papel
 * antes para responder 403 claro.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";
import {
  AccountTypeSchema,
  CompanyNameSchema,
  organizationNameFor,
  type AccountType,
} from "@/lib/account-type";

interface OwnedTenant {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  role: string;
}

async function loadTenant(ctx: AuthContext): Promise<OwnedTenant | null> {
  const { data: profile, error: pErr } = await ctx.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (pErr) throw new Response("Falha ao identificar a organização.", { status: 500 });
  if (!profile?.tenant_id) return null;

  const [{ data: membership }, { data: tenant, error: tErr }] = await Promise.all([
    ctx.supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", profile.tenant_id)
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    ctx.supabase
      .from("tenants")
      .select("id, name, settings")
      .eq("id", profile.tenant_id)
      .maybeSingle(),
  ]);
  if (tErr || !tenant) return null;
  const settings =
    tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings)
      ? (tenant.settings as Record<string, unknown>)
      : {};
  return { id: tenant.id, name: tenant.name, settings, role: membership?.role ?? "" };
}

function readType(settings: Record<string, unknown>): AccountType | null {
  const parsed = AccountTypeSchema.safeParse(settings.account_type);
  return parsed.success ? parsed.data : null;
}

export const getAccountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await loadTenant(context as unknown as AuthContext);
    return {
      accountType: tenant ? readType(tenant.settings) : null,
      organizationName: tenant?.name ?? null,
      canEdit: tenant?.role === "owner",
    };
  });

const ApplySchema = z.object({
  accountType: AccountTypeSchema,
  companyName: CompanyNameSchema.optional().nullable(),
  fullName: z.string().trim().max(120).optional().nullable(),
  /** "initial": só grava se ainda não houver tipo (primeiro login). "change": troca explícita. */
  mode: z.enum(["initial", "change"]),
});

export const applyAccountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplySchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const tenant = await loadTenant(ctx);
    if (!tenant) throw new Response("Organização ainda não criada.", { status: 409 });
    if (tenant.role !== "owner") {
      throw new Response("Forbidden: só o owner altera o perfil da conta.", { status: 403 });
    }
    const current = readType(tenant.settings);
    if (data.mode === "initial" && current) {
      return { accountType: current, organizationName: tenant.name, changed: false };
    }

    // Troca explícita para empresa com nome informado: o nome da empresa vale.
    const explicitCompany =
      data.mode === "change" && data.accountType === "empresa" && data.companyName
        ? data.companyName
        : null;
    const name =
      explicitCompany ??
      organizationNameFor({
        type: data.accountType,
        fullName: data.fullName,
        companyName: data.companyName,
        currentName: tenant.name,
      });
    const settings = { ...tenant.settings, account_type: data.accountType };
    const { data: updated, error } = await ctx.supabase
      .from("tenants")
      .update({ name, settings })
      .eq("id", tenant.id)
      .select("id");
    if (error) throw new Response(error.message, { status: 500 });
    // RLS que bloqueia UPDATE não dá erro: devolve 0 linhas. Não fingir sucesso.
    if (!updated || updated.length === 0) {
      throw new Response("A organização não aceitou a alteração (permissão).", { status: 403 });
    }
    return { accountType: data.accountType, organizationName: name, changed: true };
  });
