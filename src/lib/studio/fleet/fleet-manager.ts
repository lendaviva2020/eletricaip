/**
 * ElétricAi Industrial OS — Controller Fleet Management & Controller Shadow Engine
 * Paridade com as capacidades do CODESYS Automation Server:
 * Inventário de controladores, sincronismo de estado runtime (Shadow),
 * detecção de desvio de versão (Drift) e controle de acesso granular (RBAC).
 */

import {
  Controller,
  ControllerShadowState,
  UserRole,
  RBACPermission,
  IndustrialProject,
} from "../canonical/types";

export interface FleetNodeStatus {
  controllerId: string;
  name: string;
  ipAddress: string;
  firmwareVersion: string;
  status: "ONLINE" | "OFFLINE" | "DRIFT_DETECTED" | "FAULT";
  cpuUsagePct: number;
  memoryUsagePct: number;
  runtimeChecksum: string;
  isShadowInSync: boolean;
  lastSyncTimestamp: string;
}

export type RBACAction = "READ" | "WRITE" | "SIMULATE" | "FORCE";
export type RBACResourceType =
  "PROJECT" | "CONTROLLER" | "POU" | "TAG" | "ALARM" | "RECIPE" | "CERTIFICATE";

export class ControllerFleetManager {
  private controllers: Map<string, Controller> = new Map();
  private shadowStates: Map<string, ControllerShadowState> = new Map();

  constructor(controllers: Controller[] = [], shadows: ControllerShadowState[] = []) {
    for (const c of controllers) this.controllers.set(c.id, c);
    for (const s of shadows) this.shadowStates.set(s.deviceId, s);
  }

  public registerController(controller: Controller): void {
    this.controllers.set(controller.id, controller);
  }

  public updateControllerShadow(shadow: ControllerShadowState): void {
    this.shadowStates.set(shadow.deviceId, shadow);
  }

  /**
   * Avalia a integridade da frota e detecta desvios de versão entre o projeto e o runtime
   */
  public getFleetHealth(projectCompiledChecksum: string): FleetNodeStatus[] {
    const report: FleetNodeStatus[] = [];

    for (const [id, ctrl] of this.controllers.entries()) {
      const shadow = this.shadowStates.get(id);
      const runtimeChecksum = String(shadow?.observedState?.checksum || "UNKNOWN");
      const isShadowInSync = runtimeChecksum === projectCompiledChecksum;

      let status: "ONLINE" | "OFFLINE" | "DRIFT_DETECTED" | "FAULT" = "ONLINE";
      if (!ctrl.connected) {
        status = "OFFLINE";
      } else if (!isShadowInSync) {
        status = "DRIFT_DETECTED";
      }

      report.push({
        controllerId: ctrl.id,
        name: ctrl.name,
        ipAddress: ctrl.ipAddress,
        firmwareVersion: ctrl.firmwareVersion,
        status,
        cpuUsagePct: shadow
          ? typeof (shadow.observedState as any)?.cpuUsagePct === "number"
            ? (shadow.observedState as any).cpuUsagePct
            : 24.5
          : 0,
        memoryUsagePct: shadow
          ? typeof (shadow.observedState as any)?.memoryUsagePct === "number"
            ? (shadow.observedState as any).memoryUsagePct
            : 42.5
          : 0,
        runtimeChecksum,
        isShadowInSync,
        lastSyncTimestamp: shadow?.lastSyncTimestamp || new Date().toISOString(),
      });
    }

    return report;
  }

  /**
   * Verificação de Autorização e RBAC
   */
  public static checkPermission(
    userRole: UserRole,
    resourceType: RBACResourceType,
    action: RBACAction,
  ): boolean {
    if (userRole === "ADMIN" || userRole === "LEAD_ENGINEER") return true;

    if (userRole === "OPERATOR") {
      if (action === "READ" || action === "SIMULATE") return true;
      if (action === "WRITE" && (resourceType === "ALARM" || resourceType === "RECIPE"))
        return true;
      return false;
    }

    if (userRole === "MAINTENANCE") {
      if (action === "READ" || action === "SIMULATE") return true;
      if (action === "FORCE") return true;
      return false;
    }

    if (userRole === "AUDITOR") {
      return action === "READ";
    }

    return false;
  }
}
