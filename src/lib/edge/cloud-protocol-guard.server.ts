// ELÉTRICAI INDUSTRIAL OS — CLOUD PROTOCOL SECURITY GUARD (SERVER-ONLY)
// Enforces Cloud -> Edge Gateway -> OT separation, RBAC, multi-tenant gateway scoping,
// and permanent physical write block (IS_PHYSICAL_CONTROL_ALLOWED = false).
// IMPORTANT: Zero TCP sockets (`node:net`) and zero DNS lookups (`node:dns`) in Cloud.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isDevAuthAllowed } from "@/integrations/supabase/auth-middleware";
import { logSecurityEvent } from "@/lib/security/security-audit-log.server";
import { edgeFleetManager } from "./fleet-manager";
import { ensurePersistentFleetRuntime } from "./fleet-runtime.server";
import {
  IS_PHYSICAL_CONTROL_ALLOWED,
  authorizeCloudToEdgeReadTarget,
  type EdgeExecutionMode,
  type EdgeTargetAuthorizationResult,
} from "./protocol-classification";

export interface ProtocolAuthCtx {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
}

export interface AuthorizedProtocolActor {
  allowed: true;
  userId: string;
  supabase: SupabaseClient<Database>;
  organizationId?: string;
  role: string;
  isPlatformAdmin: boolean;
  isDevBypass: boolean;
}

export interface DeniedProtocolActor {
  allowed: false;
  code: "UNAUTHORIZED" | "FORBIDDEN";
  message: string;
  httpStatus: 401 | 403;
}

const MUTATION_ALLOWED_ROLES = new Set(["owner", "admin", "engineer"]);
const READ_INSPECTION_ROLES = new Set([
  "owner",
  "admin",
  "engineer",
  "plant_admin",
  "operator",
  "edge_operator",
  "auditor",
]);

export async function authorizeProtocolSessionActor(
  context: unknown,
  options: { allowReadOnlyRoles?: boolean; route: string; mode?: EdgeExecutionMode },
): Promise<AuthorizedProtocolActor | DeniedProtocolActor> {
  const ctx = context as Partial<ProtocolAuthCtx> | undefined;
  if (!ctx?.userId || !ctx?.supabase) {
    return {
      allowed: false,
      code: "UNAUTHORIZED",
      message: "Sessão autenticada ausente.",
      httpStatus: 401,
    };
  }

  const { userId, supabase, claims = {} } = ctx;

  if (claims["isDevBypass"] === true && isDevAuthAllowed()) {
    // Dev lab bypass permits SIMULATOR sessions and read-only inspection of seeded SP lab org gateways.
    return {
      allowed: true,
      userId,
      supabase,
      organizationId: "org_sp_industrial",
      role: "auditor",
      isPlatformAdmin: false,
      isDevBypass: true,
    };
  }

  if (claims["platform_role"] === "PLATFORM_ADMIN") {
    return {
      allowed: true,
      userId,
      supabase,
      organizationId:
        typeof claims["tenant_id"] === "string" ? claims["tenant_id"] : "org_platform",
      role: "PLATFORM_ADMIN",
      isPlatformAdmin: true,
      isDevBypass: false,
    };
  }

  const { data: memberships, error: memErr } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId);

  if (memErr) {
    logSecurityEvent({
      category: "AUTH_FAILURE",
      severity: "WARNING",
      route: options.route,
      actorId: userId,
      reason: "Falha ao consultar associações de tenant para controle de protocolo.",
    });
    return {
      allowed: false,
      code: "FORBIDDEN",
      message: "Não foi possível validar permissões de tenant.",
      httpStatus: 403,
    };
  }

  const rows = (memberships ?? []) as Array<{ role?: string; tenant_id?: string }>;
  const roleSet = options.allowReadOnlyRoles ? READ_INSPECTION_ROLES : MUTATION_ALLOWED_ROLES;
  const matching = rows.find((m) => roleSet.has(String(m.role ?? "").toLowerCase()));

  if (!matching) {
    logSecurityEvent({
      category: "RBAC_DENIED",
      severity: "WARNING",
      route: options.route,
      actorId: userId,
      reason: `Papel insuficiente para operação de protocolo (${options.mode ?? "UNKNOWN"}).`,
    });
    return {
      allowed: false,
      code: "FORBIDDEN",
      message: "Permissão insuficiente para operar sessão de protocolo.",
      httpStatus: 403,
    };
  }

  let organizationId = matching.tenant_id;
  if (!organizationId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    organizationId =
      (profile as { tenant_id?: string } | null)?.tenant_id ??
      (typeof claims["tenant_id"] === "string" ? claims["tenant_id"] : undefined);
  }

  return {
    allowed: true,
    userId,
    supabase,
    organizationId,
    role: String(matching.role).toLowerCase(),
    isPlatformAdmin: false,
    isDevBypass: false,
  };
}

export function resolveCloudToEdgeTarget(input: {
  protocol: "MODBUS_TCP" | "OPC_UA";
  mode: EdgeExecutionMode;
  target: string;
  port?: number;
  gatewayId?: string;
  actor: AuthorizedProtocolActor;
  route: string;
  fleetManagerOverride?: typeof edgeFleetManager;
}): EdgeTargetAuthorizationResult {
  if (!input.fleetManagerOverride) {
    ensurePersistentFleetRuntime();
  }
  const gateway = input.gatewayId
    ? (input.fleetManagerOverride ?? edgeFleetManager).getGateway(input.gatewayId)
    : undefined;

  const decision = authorizeCloudToEdgeReadTarget({
    protocol: input.protocol,
    mode: input.mode,
    target: input.target,
    port: input.port,
    gateway: gateway
      ? {
          gatewayId: gateway.gatewayId,
          organizationId: gateway.organizationId,
          plantId: gateway.plantId,
          operationalState: gateway.operationalState,
          connectivityState: gateway.connectivityState,
          authorizedEndpoints: gateway.authorizedEndpoints,
        }
      : undefined,
    actorOrganizationId: input.actor.organizationId,
    isPlatformAdmin: input.actor.isPlatformAdmin,
  });

  if (!decision.allowed) {
    const category =
      decision.code === "SSRF_POLICY_BLOCKED"
        ? "SSRF_BLOCKED"
        : decision.code === "TENANT_FORBIDDEN" || decision.code === "PLANT_FORBIDDEN"
          ? "CROSS_TENANT_DENIED"
          : "RBAC_DENIED";

    logSecurityEvent({
      category,
      severity: decision.code === "SSRF_POLICY_BLOCKED" ? "CRITICAL" : "WARNING",
      route: input.route,
      actorId: input.actor.userId,
      tenantId: input.actor.organizationId,
      reason: decision.message,
      metadata: {
        protocol: input.protocol,
        mode: input.mode,
        code: decision.code,
        gatewayId: input.gatewayId ?? "none",
      },
    });
  }

  return decision;
}

export function guardProtocolWriteAttempt(input: {
  mode: EdgeExecutionMode;
  route: string;
  userId: string;
  tenantId?: string;
  targetDescription: string;
}): { allowed: true } | { allowed: false; code: "PHYSICAL_CONTROL_BLOCKED"; message: string } {
  // Architectural invariant check (IS_PHYSICAL_CONTROL_ALLOWED must always remain false).
  if (IS_PHYSICAL_CONTROL_ALLOWED) {
    throw new Error("CRITICAL_SAFETY_VIOLATION: IS_PHYSICAL_CONTROL_ALLOWED cannot be true.");
  }

  if (input.mode !== "SIMULATOR") {
    logSecurityEvent({
      category: "PHYSICAL_CONTROL_BLOCKED",
      severity: "CRITICAL",
      route: input.route,
      actorId: input.userId,
      tenantId: input.tenantId,
      reason: `Tentativa bloqueada de escrita física em sessão ${input.mode} (${input.targetDescription}).`,
    });
    return {
      allowed: false,
      code: "PHYSICAL_CONTROL_BLOCKED",
      message:
        "PHYSICAL_CONTROL_BLOCKED: Controle físico remoto e escrita em CLPs são permanentemente bloqueados (IS_PHYSICAL_CONTROL_ALLOWED = false). Apenas sessões em modo SIMULATOR aceitam escrita virtual em memória.",
    };
  }

  return { allowed: true };
}
