import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import { isDevAuthAllowed } from "@/integrations/supabase/auth-middleware";
import type { FleetRole, FleetUserContext } from "./types";

const DEV_AUDITOR_PLANTS = [
  "plant_ete_central",
  "plant_subestacao_138kv",
  "plant_usina_rj",
  "plant_subestacao_sp",
];

function mapTenantRoleToFleetRole(role: string | null | undefined): FleetRole {
  switch ((role ?? "").toLowerCase()) {
    case "owner":
    case "admin":
      return "TENANT_ADMIN";
    case "plant_admin":
      return "PLANT_ADMIN";
    case "engineer":
    case "member":
      return "ENGINEER";
    case "operator":
    case "edge_operator":
      return "EDGE_OPERATOR";
    case "auditor":
      return "AUDITOR";
    default:
      return "VIEWER";
  }
}

/**
 * Derives authoritative Fleet/Observability user identity, tenant scope, and RBAC role
 * strictly from verified server session context — NEVER from client request payload.
 */
export async function resolveAuthenticatedFleetContext(
  context: unknown,
): Promise<FleetUserContext> {
  const authCtx = context as AuthContext | undefined;
  if (!authCtx?.userId || !authCtx?.supabase) {
    throw new Response("Unauthorized: Sessão autenticada ausente.", { status: 401 });
  }

  const { supabase, userId, claims } = authCtx;

  // Local dev/E2E bypass: exclusively read-only AUDITOR role scoped to demo lab org.
  if (claims?.["isDevBypass"] === true && isDevAuthAllowed()) {
    return {
      userId,
      email: typeof claims["email"] === "string" ? claims["email"] : "auditor@eletricai.local",
      role: "AUDITOR",
      organizationId: "org_sp_industrial",
      authorizedPlantIds: DEV_AUDITOR_PLANTS,
    };
  }

  const email =
    typeof claims?.["email"] === "string" ? claims["email"] : `${userId}@authenticated.local`;

  // Platform Admin elevation ONLY from server-signed JWT app_metadata claim
  if (claims?.["platform_role"] === "PLATFORM_ADMIN") {
    return {
      userId,
      email,
      role: "PLATFORM_ADMIN",
      organizationId:
        typeof claims["tenant_id"] === "string" ? claims["tenant_id"] : "org_platform",
      authorizedPlantIds: [],
    };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    throw new Response("Erro ao resolver perfil organizacional.", { status: 500 });
  }

  const tenantId = profile?.tenant_id;
  if (!tenantId) {
    throw new Response("Forbidden: Usuário sem organização ativa associada.", { status: 403 });
  }

  const { data: membership, error: membershipErr } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipErr || !membership?.role) {
    throw new Response("Forbidden: Associação de tenant não autorizada.", { status: 403 });
  }

  const fleetRole = mapTenantRoleToFleetRole(membership.role);
  const authorizedPlantIds = Array.isArray(claims?.["authorized_plant_ids"])
    ? claims["authorized_plant_ids"].filter((p): p is string => typeof p === "string")
    : [];

  return {
    userId,
    email,
    role: fleetRole,
    organizationId: tenantId,
    authorizedPlantIds,
  };
}
