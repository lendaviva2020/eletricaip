import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClientStatus = "active" | "prospect" | "inactive";

export interface ClientRow {
  id: string;
  tenant_id: string;
  name: string;
  sector: string;
  contact_name: string;
  email: string;
  phone: string;
  cnpj: string;
  address: string;
  website: string;
  logo_url: string | null;
  status: ClientStatus;
  sla_pct: number;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const ClientPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sector: z.string().trim().max(80).default(""),
  contact_name: z.string().trim().max(120).default(""),
  email: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(40).default(""),
  cnpj: z.string().trim().max(20).default(""),
  address: z.string().trim().max(240).default(""),
  website: z.string().trim().max(200).default(""),
  logo_url: z.string().url().max(500).nullable().optional().default(null),
  status: z.enum(["active", "prospect", "inactive"]).default("active"),
  sla_pct: z.coerce.number().min(0).max(100).default(99.9),
  notes: z.string().trim().max(2000).default(""),
});

async function resolveTenantId(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.tenant_id) return profile.tenant_id as string;

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membership?.tenant_id) return membership.tenant_id as string;
  throw new Error("Nenhuma organização ativa para este usuário.");
}

export const listClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; sector?: string; status?: ClientStatus | "all" }) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        sector: z.string().trim().max(80).optional(),
        status: z.enum(["active", "prospect", "inactive", "all"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.sector) q = q.eq("sector", data.sector);
    if (data.search) {
      // Strip PostgREST-significant chars to prevent filter injection via .or()
      const safe = data.search.replace(/[,.()%*\\]/g, " ").trim();
      if (safe) {
        const s = `%${safe}%`;
        q = q.or(`name.ilike.${s},contact_name.ilike.${s},email.ilike.${s},cnpj.ilike.${s}`);
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { clients: (rows ?? []) as unknown as ClientRow[] };
  });

export const getClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Cliente não encontrado.");

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, status, updated_at")
      .eq("client_id", data.id)
      .order("updated_at", { ascending: false });

    return {
      client: client as unknown as ClientRow,
      projects: (projects ?? []) as Array<{
        id: string;
        name: string;
        status: string | null;
        updated_at: string;
      }>,
    };
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ClientPayloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await resolveTenantId(supabase, userId);
    const { data: inserted, error } = await supabase
      .from("clients")
      .insert({ ...data, tenant_id, created_by: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { client: inserted as unknown as ClientRow };
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string } & Record<string, unknown>) =>
    z.object({ id: z.string().uuid() }).merge(ClientPayloadSchema.partial()).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { data: updated, error } = await supabase
      .from("clients")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { client: updated as unknown as ClientRow };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
