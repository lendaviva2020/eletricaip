/**
 * ELÉTRICAI INDUSTRIAL OS — STRUCTURED SECURITY AUDIT LOGGER
 * Sanitizes credentials, JWTs, API keys, and query tokens before emitting
 * structured security telemetry for SIEM/log aggregation.
 */

export type SecurityEventCategory =
  | "AUTH_FAILURE"
  | "RBAC_DENIED"
  | "CROSS_TENANT_DENIED"
  | "GATEWAY_AUTH_FAILURE"
  | "WEBHOOK_SIGNATURE_FAILURE"
  | "SSRF_BLOCKED"
  | "PATH_TRAVERSAL_BLOCKED"
  | "RATE_LIMIT_TRIGGERED"
  | "PHYSICAL_CONTROL_BLOCKED";

export interface StructuredSecurityEvent {
  timestamp: string;
  category: SecurityEventCategory;
  severity: "INFO" | "WARNING" | "CRITICAL";
  route: string;
  actorId?: string;
  tenantId?: string;
  reason: string;
  metadata?: Record<string, string | number | boolean>;
}

const SECRET_VALUE_RE =
  /(Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*|sbp_[A-Za-z0-9_-]+|sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+)/gi;

export function redactSensitiveString(input: string): string {
  return input.replace(SECRET_VALUE_RE, "[REDACTED]");
}

const recentSecurityEvents: StructuredSecurityEvent[] = [];

export function logSecurityEvent(
  event: Omit<StructuredSecurityEvent, "timestamp">,
): StructuredSecurityEvent {
  const sanitizedMetadata: Record<string, string | number | boolean> = {};
  if (event.metadata) {
    for (const [k, v] of Object.entries(event.metadata)) {
      if (/token|secret|password|key|signature|authorization/i.test(k) && typeof v === "string") {
        sanitizedMetadata[k] = "[REDACTED]";
      } else if (typeof v === "string") {
        sanitizedMetadata[k] = redactSensitiveString(v).slice(0, 200);
      } else {
        sanitizedMetadata[k] = v;
      }
    }
  }

  const record: StructuredSecurityEvent = {
    timestamp: new Date().toISOString(),
    category: event.category,
    severity: event.severity,
    route: event.route,
    actorId: event.actorId,
    tenantId: event.tenantId,
    reason: redactSensitiveString(event.reason).slice(0, 300),
    metadata: Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : undefined,
  };

  recentSecurityEvents.push(record);
  if (recentSecurityEvents.length > 500) {
    recentSecurityEvents.splice(0, recentSecurityEvents.length - 500);
  }

  console.warn(JSON.stringify({ level: "security_audit", ...record }));
  return record;
}

export function getRecentSecurityEvents(limit = 50): StructuredSecurityEvent[] {
  return recentSecurityEvents.slice(-Math.max(1, Math.min(limit, 500)));
}
