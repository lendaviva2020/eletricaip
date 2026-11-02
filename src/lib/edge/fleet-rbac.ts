// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET MULTI-TENANT RBAC ENGINE
// Standards: IEC 62443-4-2, NIST SP 800-82 Rev. 3, ISO 27001

import type { FleetRole, FleetUserContext, FleetGatewaySummary, RegisteredGatewayRecord } from "./types";

export type FleetAction =
  | "VIEW_FLEET"
  | "VIEW_TELEMETRY"
  | "VIEW_AUDIT"
  | "PROPOSE_CONFIG"
  | "APPROVE_CONFIG"
  | "ROLLBACK_CONFIG"
  | "REQUEST_CERT_RENEWAL"
  | "REVOKE_CERTIFICATE"
  | "TRIGGER_UPDATE"
  | "ABORT_UPDATE"
  | "REBOOT_GATEWAY";

export class FleetAuthorizationError extends Error {
  public statusCode: number;
  public action: FleetAction;
  public requiredRoles: FleetRole[];

  constructor(message: string, action: FleetAction, requiredRoles: FleetRole[], statusCode: number = 403) {
    super(message);
    this.name = "FleetAuthorizationError";
    this.action = action;
    this.requiredRoles = requiredRoles;
    this.statusCode = statusCode;
  }
}

const ACTION_ROLE_MATRIX: Record<FleetAction, FleetRole[]> = {
  VIEW_FLEET: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN", "EDGE_OPERATOR", "ENGINEER", "AUDITOR", "VIEWER"],
  VIEW_TELEMETRY: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN", "EDGE_OPERATOR", "ENGINEER", "AUDITOR", "VIEWER"],
  VIEW_AUDIT: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN", "AUDITOR"],
  PROPOSE_CONFIG: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN", "ENGINEER"],
  APPROVE_CONFIG: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN"],
  ROLLBACK_CONFIG: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN", "ENGINEER"],
  REQUEST_CERT_RENEWAL: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN"],
  REVOKE_CERTIFICATE: ["PLATFORM_ADMIN", "TENANT_ADMIN"],
  TRIGGER_UPDATE: ["PLATFORM_ADMIN", "TENANT_ADMIN"],
  ABORT_UPDATE: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN"],
  REBOOT_GATEWAY: ["PLATFORM_ADMIN", "TENANT_ADMIN", "PLANT_ADMIN"],
};

export class FleetRbacEngine {
  /**
   * Asserts whether a user has permission to execute an action on a target gateway.
   * Enforces strict organization isolation and plant boundaries.
   */
  public assertCanPerformAction(
    user: FleetUserContext,
    action: FleetAction,
    targetGateway?: Pick<FleetGatewaySummary | RegisteredGatewayRecord, "organizationId" | "plantId" | "gatewayId">,
  ): boolean {
    // 1. Role Capability Check
    const allowedRoles = ACTION_ROLE_MATRIX[action];
    if (!allowedRoles.includes(user.role)) {
      throw new FleetAuthorizationError(
        `RBAC_DENIED: O papel '${user.role}' não possui autorização para executar '${action}'.`,
        action,
        allowedRoles,
        403,
      );
    }

    // 2. Multi-Tenant Organization Boundary Check
    if (user.role !== "PLATFORM_ADMIN" && targetGateway) {
      if (user.organizationId !== targetGateway.organizationId) {
        throw new FleetAuthorizationError(
          `CROSS_TENANT_DENIED: Tentativa de acesso à organização '${targetGateway.organizationId}' não autorizada para o usuário da organização '${user.organizationId}'.`,
          action,
          allowedRoles,
          403,
        );
      }

      // 3. Plant Boundary Check for Plant Admins
      if (user.role === "PLANT_ADMIN" && !user.authorizedPlantIds.includes(targetGateway.plantId)) {
        throw new FleetAuthorizationError(
          `CROSS_PLANT_DENIED: O administrador de planta não possui permissão sobre a planta '${targetGateway.plantId}'.`,
          action,
          allowedRoles,
          403,
        );
      }
    }

    return true;
  }

  /**
   * Filters a list of gateways according to the user's tenant and plant boundaries.
   */
  public filterGatewaysForUser<T extends { organizationId: string; plantId: string }>(
    gateways: T[],
    user: FleetUserContext,
  ): T[] {
    if (user.role === "PLATFORM_ADMIN") {
      return gateways;
    }

    let filtered = gateways.filter((g) => g.organizationId === user.organizationId);

    if (user.role === "PLANT_ADMIN") {
      filtered = filtered.filter((g) => user.authorizedPlantIds.includes(g.plantId));
    }

    return filtered;
  }
}

export const fleetRbacEngine = new FleetRbacEngine();
