/**
 * Open Industrial Protocol Telemetry Gateway Bridge + Hard Safety Lock Enforcement.
 * - Gated strictly behind secondary feature flag `fieldDeviceComms` (default: false)
 * - Strictly validates endpoints against SSRF (blocks link-local metadata 169.254.0.0/16)
 * - Unconditionally honors IS_PHYSICAL_CONTROL_ALLOWED = false on Cloud
 * - Appends structured audit events for every allow/deny operation
 */
import { z } from "zod";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "@/lib/studio/canonical/types";
import type { CompactStudioFeatureFlags } from "../feature-flags";
import { checkCompactStudioPermission, type CompactStudioRole } from "../integration/ssot-bridge";

export const OpenProtocolEndpointSchema = z.object({
  protocol: z.enum(["MODBUS_TCP", "OPC_UA", "MQTT"]),
  host: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (h) => {
        const lower = h.trim().toLowerCase();
        if (lower.startsWith("169.254.")) return false; // Block AWS/GCP/Azure metadata SSRF
        if (lower.includes("metadata.google") || lower.includes("169.254.169.254")) return false;
        return /^[a-zA-Z0-9._-]+$/.test(lower);
      },
      { message: "Host bloqueado por política anti-SSRF ou formato inválido." },
    ),
  port: z.number().int().min(1).max(65535),
  unitIdOrTopic: z.string().min(1).max(128),
});

export type OpenProtocolEndpoint = z.infer<typeof OpenProtocolEndpointSchema>;

export interface DeviceAuditEntry {
  readonly timestampIso: string;
  readonly actorUserId: string;
  readonly role: CompactStudioRole;
  readonly action: "READ_TELEMETRY" | "WRITE_PHYSICAL_DEVICE";
  readonly protocol: string;
  readonly endpoint: string;
  readonly outcome:
    "ALLOWED_READ_OBSERVATIONAL" | "DENIED_FLAG_DISABLED" | "DENIED_RBAC" | "DENIED_SAFETY_LOCK";
  readonly reason: string;
}

export class CompactDeviceCommsGateway {
  private readonly auditLog: DeviceAuditEntry[] = [];

  public getAuditLog(): readonly DeviceAuditEntry[] {
    return [...this.auditLog];
  }

  public readObservationalSnapshot(opts: {
    readonly flags: CompactStudioFeatureFlags;
    readonly actorUserId: string;
    readonly role: CompactStudioRole;
    readonly endpoint: unknown;
    readonly nowIso?: string;
  }): {
    readonly ok: boolean;
    readonly status: DeviceAuditEntry["outcome"];
    readonly error?: string;
  } {
    const parsed = OpenProtocolEndpointSchema.parse(opts.endpoint);
    const epStr = `${parsed.protocol}://${parsed.host}:${parsed.port}/${parsed.unitIdOrTopic}`;
    const ts = opts.nowIso ?? new Date().toISOString();

    if (!opts.flags.fieldDeviceComms) {
      this.auditLog.push({
        timestampIso: ts,
        actorUserId: opts.actorUserId,
        role: opts.role,
        action: "READ_TELEMETRY",
        protocol: parsed.protocol,
        endpoint: epStr,
        outcome: "DENIED_FLAG_DISABLED",
        reason: "Feature flag fieldDeviceComms desativada neste tenant.",
      });
      return {
        ok: false,
        status: "DENIED_FLAG_DISABLED",
        error: "Ponte de campo desativada no tenant.",
      };
    }

    if (!checkCompactStudioPermission(opts.role, "read_field_device")) {
      this.auditLog.push({
        timestampIso: ts,
        actorUserId: opts.actorUserId,
        role: opts.role,
        action: "READ_TELEMETRY",
        protocol: parsed.protocol,
        endpoint: epStr,
        outcome: "DENIED_RBAC",
        reason: `Papel '${opts.role}' sem permissão de leitura em campo.`,
      });
      return { ok: false, status: "DENIED_RBAC", error: "Acesso negado por RBAC." };
    }

    this.auditLog.push({
      timestampIso: ts,
      actorUserId: opts.actorUserId,
      role: opts.role,
      action: "READ_TELEMETRY",
      protocol: parsed.protocol,
      endpoint: epStr,
      outcome: "ALLOWED_READ_OBSERVATIONAL",
      reason: "Leitura observacional autorizada via protocolo aberto.",
    });

    return { ok: true, status: "ALLOWED_READ_OBSERVATIONAL" };
  }

  public requestPhysicalDeviceWrite(opts: {
    readonly flags: CompactStudioFeatureFlags;
    readonly actorUserId: string;
    readonly role: CompactStudioRole;
    readonly endpoint: unknown;
    readonly dualConfirmationToken: string;
    readonly nowIso?: string;
  }): {
    readonly allowed: false;
    readonly outcome: "DENIED_SAFETY_LOCK";
    readonly message: string;
  } {
    const parsed = OpenProtocolEndpointSchema.parse(opts.endpoint);
    const epStr = `${parsed.protocol}://${parsed.host}:${parsed.port}/${parsed.unitIdOrTopic}`;
    const ts = opts.nowIso ?? new Date().toISOString();

    // Unconditional enforcement of IS_PHYSICAL_CONTROL_ALLOWED = false on Cloud
    if (!IS_PHYSICAL_CONTROL_ALLOWED) {
      this.auditLog.push({
        timestampIso: ts,
        actorUserId: opts.actorUserId,
        role: opts.role,
        action: "WRITE_PHYSICAL_DEVICE",
        protocol: parsed.protocol,
        endpoint: epStr,
        outcome: "DENIED_SAFETY_LOCK",
        reason: `IS_PHYSICAL_CONTROL_ALLOWED=false (${opts.dualConfirmationToken ? "token fornecido" : "sem token"}): comandos físicos remotos bloqueados no Cloud.`,
      });
      return {
        allowed: false,
        outcome: "DENIED_SAFETY_LOCK",
        message:
          "Operação bloqueada pela trava de segurança operacional (IS_PHYSICAL_CONTROL_ALLOWED = false).",
      };
    }

    // Unreachable while IS_PHYSICAL_CONTROL_ALLOWED is `false as const`, required by exhaustive TS narrowing
    throw new Error("Physical writes blocked");
  }
}
