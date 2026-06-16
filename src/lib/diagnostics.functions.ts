// Server-side diagnostics: pings Supabase auth + key RPCs to surface
// permission/grant issues that would otherwise show up as 500/503 in clients.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

export interface DiagnosticsResult {
  ts: number;
  userId: string;
  checks: DiagnosticCheck[];
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<DiagnosticCheck> {
  const started = Date.now();
  try {
    const value = await fn();
    return {
      name,
      ok: true,
      detail: typeof value === "string" ? value : "OK",
      durationMs: Date.now() - started,
    };
  } catch (e: any) {
    return {
      name,
      ok: false,
      detail: e?.message ?? String(e),
      durationMs: Date.now() - started,
    };
  }
}

export const getDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const checks: DiagnosticCheck[] = [];

    checks.push(
      await timed("auth.getUser", async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        return data.user?.email ?? "no-email";
      }),
    );

    checks.push(
      await timed("rpc: get_ai_credits_remaining", async () => {
        const { data, error } = await supabase.rpc("get_ai_credits_remaining");
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        return `plan=${row?.plan ?? "?"} remaining=${row?.remaining ?? "?"}`;
      }),
    );

    checks.push(
      await timed("rpc: check_ai_quota", async () => {
        const { data, error } = await supabase.rpc("check_ai_quota");
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        return `allowed=${row?.allowed} used=${row?.used}/${row?.max_tokens}`;
      }),
    );

    checks.push(
      await timed("rpc: is_platform_admin", async () => {
        const { data, error } = await supabase.rpc("is_platform_admin");
        if (error) throw new Error(error.message);
        return `is_admin=${!!data}`;
      }),
    );

    checks.push(
      await timed("rpc: tenant_has_feature", async () => {
        const { data, error } = await supabase.rpc("tenant_has_feature", {
          p_feature: "basic_diagrams",
        });
        if (error) throw new Error(error.message);
        return `has=${!!data}`;
      }),
    );

    checks.push(
      await timed("select: profiles (RLS)", async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, tenant_id, role")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("no profile row visible");
        return `tenant=${data.tenant_id?.slice(0, 8) ?? "?"} role=${data.role}`;
      }),
    );

    checks.push(
      await timed("select: tenant_memberships (RLS)", async () => {
        const { data, error } = await supabase
          .from("tenant_memberships")
          .select("tenant_id, role")
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
        return `memberships=${data?.length ?? 0}`;
      }),
    );

    return {
      ts: Date.now(),
      userId,
      checks,
    } satisfies DiagnosticsResult;
  });
