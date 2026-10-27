// Exclusão de conta (LGPD Art. 18, VI) — fluxo em duas etapas:
//   1) requestAccountDeletion: o próprio usuário abre um pedido (fila auditável).
//   2) eraseUserData: platform admin executa a eliminação com service role.
//
// Escopo do apagamento (identidade + dados pessoais do usuário):
//   ai_messages + ai_conversations, api_keys, tenant_memberships, profiles,
//   auth.users. O conteúdo compartilhado do tenant (projetos, BOM, alarmes)
//   permanece sob a controladoria do tenant (contrato); após a remoção do
//   profile, os created_by restantes viram UUIDs órfãos sem identidade
//   vinculável (as colunas são NOT NULL — anonimização total exigiria
//   migration alterando nulabilidade; registrado como follow-up).
// Pendente (documentado): objetos no Storage e telemetria tag_samples —
// limpeza via rotina de expurgo com service role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, requireActiveSession } from "@/integrations/supabase/auth-middleware";
import type { AuthContext } from "@/integrations/supabase/auth-middleware";




export interface EraseStep {
  step: string;
  ok: boolean;
  detail: string;
}

export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z.object({ reason: z.string().trim().max(1000).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as AuthContext;
    const db = supabase;

    const { data: existing, error: existErr } = await db
      .from("deletion_requests")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existErr) throw new Error(existErr.message);
    if (existing)
      return { ok: true as const, requestId: existing.id as string, duplicate: true as const };

    const { data: row, error } = await db
      .from("deletion_requests")
      .insert({ user_id: userId, reason: data.reason ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, requestId: row.id as string, duplicate: false as const };
  });

export interface DeletionRequestSummary {
  id: string;
  status: string;
  requested_at: string;
  processed_at: string | null;
}

export const listMyDeletionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ requests: DeletionRequestSummary[] }> => {
    const { supabase, userId } = context as unknown as AuthContext;
    const { data, error } = await supabase
      .from("deletion_requests")
      .select("id, status, requested_at, processed_at")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: (data ?? []) as DeletionRequestSummary[] };
  });

export const eraseUserData = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ targetUserId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; report: EraseStep[] }> => {
    const { supabase, userId } = context as unknown as AuthContext;
    const report: EraseStep[] = [];
    const push = (step: string, ok: boolean, detail: string) => {
      report.push({ step, ok, detail });
    };

    // Gate: só platform admin executa eliminação (a identidade do chamador
    // vem do JWT — a RPC roda com auth.uid() do chamador, não service role).
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_platform_admin");
    if (adminErr || !isAdmin) {
      throw new Error("forbidden: platform admin required");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    const target = data.targetUserId;

    const run = async (step: string, fn: () => Promise<string>) => {
      try {
        push(step, true, await fn());
      } catch (e) {
        push(step, false, e instanceof Error ? e.message : String(e));
      }
    };

    await run("mark_processing", async () => {
      const { error } = await admin
        .from("deletion_requests")
        .update({ status: "processing" })
        .eq("user_id", target)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
      return "pending→processing";
    });

    await run("ai_data", async () => {
      const { data: convs, error: listErr } = await admin
        .from("ai_conversations")
        .select("id")
        .eq("user_id", target);
      if (listErr) throw new Error(listErr.message);
      const ids = ((convs ?? []) as Array<{ id: string }>).map((c) => c.id);
      if (ids.length > 0) {
        const { error: msgErr } = await admin
          .from("ai_messages")
          .delete()
          .in("conversation_id", ids);
        if (msgErr) throw new Error(msgErr.message);
      }
      const { error: convErr } = await admin
        .from("ai_conversations")
        .delete()
        .eq("user_id", target);
      if (convErr) throw new Error(convErr.message);
      return `${ids.length} conversations + messages removed`;
    });

    await run("api_keys", async () => {
      const { error } = await admin.from("api_keys").delete().eq("user_id", target);
      if (error) throw new Error(error.message);
      return "user api keys removed";
    });

    await run("memberships", async () => {
      const { error } = await admin.from("tenant_memberships").delete().eq("user_id", target);
      if (error) throw new Error(error.message);
      return "memberships removed";
    });

    await run("profile", async () => {
      const { error } = await admin.from("profiles").delete().eq("id", target);
      if (error) throw new Error(error.message);
      return "profile removed";
    });

    await run("auth_user", async () => {
      const { error } = await (
        supabaseAdmin as unknown as {
          auth: {
            admin: { deleteUser: (id: string) => Promise<{ error: { message: string } | null }> };
          };
        }
      ).auth.admin.deleteUser(target);
      if (error) throw new Error(error.message);
      return "auth.users removed";
    });

    const failed = report.some((r) => !r.ok);
    await admin
      .from("deletion_requests")
      .update({
        status: failed ? "pending" : "completed",
        processed_at: new Date().toISOString(),
        processed_by: userId,
      })
      .eq("user_id", target)
      .eq("status", "processing");

    return { ok: !failed, report };
  });
