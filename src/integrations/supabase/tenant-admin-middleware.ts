// Middleware que exige papel owner/admin no tenant do usuário autenticado.
// Reaproveita requireSupabaseAuth (valida o Bearer e injeta supabase/userId).
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export const requireTenantAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Response(profileError.message, { status: 500 });

    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Response("Forbidden: no tenant", { status: 403 });

    const { data: membership, error: membershipError } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw new Response(membershipError.message, { status: 500 });

    const role = membership?.role;
    if (role !== "owner" && role !== "admin") {
      throw new Response("Forbidden: owner/admin required", { status: 403 });
    }

    return next({ context: { tenantId, tenantRole: role } });
  });
