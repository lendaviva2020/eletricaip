/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * MCP Session Isolation, OAuth Redirect Sanitization & Access Token Audience Guard
 *
 * Mitigates and enforces regression defenses for:
 * - CVE-2026-104850 (HIGH): @modelcontextprotocol/sdk session / transport vulnerability
 * - CVE-2026-111767 (HIGH): Missing explicit audience (`aud`) validation in verifyAccessToken()
 * - CVE-2026-111768 (HIGH): Cross-session task/message leakage when sharing stateless server instances
 * - CVE-2026-111769 (MEDIUM): Improper session lifecycle validation
 * - CVE-2026-111770 (HIGH): Cross-client task/notification access in @modelcontextprotocol/server
 * - CVE-2026-111771 (MEDIUM): Unvalidated MCP message routing across sessions
 * - GHSA-f897-62hf-6gxq (HIGH): OAuth token / sensitive header leakage on cross-origin 301/302/307/308 redirects
 */

import { IS_PHYSICAL_CONTROL_ALLOWED } from "../observability/types";

export const MCP_SECURITY_GUARD_VERSION = "3.8.2-MCP-GUARD-v1.0";

export interface McpAccessTokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  scope?: string;
  organizationId: string;
  clientId: string;
  signatureVerified: boolean;
}

export interface McpTokenVerificationPolicy {
  expectedIssuer: string;
  expectedAudience: string;
  nowEpochSeconds?: number;
  clockSkewToleranceSeconds?: number;
  requiredScopes?: string[];
}

export interface McpTokenVerificationResult {
  valid: boolean;
  reason?: string;
  claims?: McpAccessTokenClaims;
}

export interface McpIsolatedSession {
  readonly sessionId: string;
  readonly clientId: string;
  readonly organizationId: string;
  readonly serverInstanceId: string;
  readonly createdAtIso: string;
  readonly isPhysicalControlAllowed: false;
  tasks: Map<string, { taskId: string; ownerSessionId: string; payload: unknown }>;
  notifications: Array<{ notificationId: string; targetSessionId: string; message: string }>;
}

const SENSITIVE_AUTH_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-mcp-auth-token",
  "x-api-key",
  "x-supabase-auth",
]);

/**
 * Explicitly validates MCP OAuth / JWT access token claims (`iss`, `aud`, `exp`, `nbf`, signature)
 * preventing tokens issued for another audience/service from authenticating (CVE-2026-111767).
 */
export function verifyMcpAccessToken(
  tokenClaims: McpAccessTokenClaims,
  policy: McpTokenVerificationPolicy,
): McpTokenVerificationResult {
  if (!tokenClaims.signatureVerified) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  if (!tokenClaims.sub || !tokenClaims.clientId || !tokenClaims.organizationId) {
    return { valid: false, reason: "MISSING_SUBJECT_OR_TENANT_IDENTITY" };
  }

  if (tokenClaims.iss !== policy.expectedIssuer) {
    return {
      valid: false,
      reason: `ISSUER_MISMATCH: expected '${policy.expectedIssuer}', got '${tokenClaims.iss}'`,
    };
  }

  // Explicit `aud` check (CVE-2026-111767): must never accept tokens issued for another service
  const audiences = Array.isArray(tokenClaims.aud)
    ? tokenClaims.aud
    : typeof tokenClaims.aud === "string" && tokenClaims.aud.trim().length > 0
      ? [tokenClaims.aud]
      : [];

  if (audiences.length === 0 || !audiences.includes(policy.expectedAudience)) {
    return {
      valid: false,
      reason: `AUDIENCE_MISMATCH: token audience [${audiences.join(", ")}] does not include required '${policy.expectedAudience}'`,
    };
  }

  const now = policy.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const skew = policy.clockSkewToleranceSeconds ?? 30;

  if (typeof tokenClaims.exp !== "number" || tokenClaims.exp + skew <= now) {
    return { valid: false, reason: "TOKEN_EXPIRED" };
  }

  if (typeof tokenClaims.nbf === "number" && tokenClaims.nbf - skew > now) {
    return { valid: false, reason: "TOKEN_NOT_YET_VALID" };
  }

  if (policy.requiredScopes && policy.requiredScopes.length > 0) {
    const granted = new Set((tokenClaims.scope ?? "").split(/\s+/).filter(Boolean));
    for (const reqScope of policy.requiredScopes) {
      if (!granted.has(reqScope)) {
        return { valid: false, reason: `MISSING_REQUIRED_SCOPE:${reqScope}` };
      }
    }
  }

  return { valid: true, claims: tokenClaims };
}

/**
 * Sanitizes outbound HTTP headers on redirects (301, 302, 303, 307, 308).
 * Strips Authorization, Cookie, and MCP OAuth headers whenever the redirect target
 * crosses origin (scheme + hostname + port), preventing GHSA-f897-62hf-6gxq.
 */
export function sanitizeRedirectHeaders(
  requestUrl: string,
  redirectLocationUrl: string,
  redirectStatus: number,
  headers: Record<string, string>,
): {
  allowedRedirect: boolean;
  isCrossOrigin: boolean;
  sanitizedHeaders: Record<string, string>;
  strippedHeaders: string[];
} {
  const originUrl = new URL(requestUrl);
  const targetUrl = new URL(redirectLocationUrl, originUrl);

  const isCrossOrigin =
    originUrl.protocol !== targetUrl.protocol ||
    originUrl.hostname.toLowerCase() !== targetUrl.hostname.toLowerCase() ||
    originUrl.port !== targetUrl.port;

  // Reject downgrade from HTTPS to HTTP on any redirect
  if (originUrl.protocol === "https:" && targetUrl.protocol === "http:") {
    return {
      allowedRedirect: false,
      isCrossOrigin: true,
      sanitizedHeaders: {},
      strippedHeaders: Object.keys(headers),
    };
  }

  const sanitizedHeaders: Record<string, string> = {};
  const strippedHeaders: string[] = [];

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      isCrossOrigin &&
      (SENSITIVE_AUTH_HEADERS.has(lower) ||
        lower.startsWith("x-mcp-") ||
        lower.startsWith("x-auth-"))
    ) {
      strippedHeaders.push(key);
      continue;
    }
    sanitizedHeaders[key] = value;
  }

  return {
    allowedRedirect: [301, 302, 303, 307, 308].includes(redirectStatus),
    isCrossOrigin,
    sanitizedHeaders,
    strippedHeaders,
  };
}

/**
 * Enforces strict per-session isolation for HTTP MCP transports (CVE-2026-111768, CVE-2026-111770).
 * Never shares a stateless server instance across distinct client sessions; binds every
 * session, task, and notification queue to a dedicated serverInstanceId + clientId + organizationId.
 */
export class IsolatedMcpSessionRegistry {
  private readonly sessions = new Map<string, McpIsolatedSession>();

  createSession(params: {
    sessionId: string;
    clientId: string;
    organizationId: string;
  }): McpIsolatedSession {
    if (!params.sessionId || !params.clientId || !params.organizationId) {
      throw new Error("sessionId, clientId, and organizationId are mandatory.");
    }
    if (this.sessions.has(params.sessionId)) {
      throw new Error(`Duplicate MCP sessionId rejected: ${params.sessionId}`);
    }

    const session: McpIsolatedSession = {
      sessionId: params.sessionId,
      clientId: params.clientId,
      organizationId: params.organizationId,
      serverInstanceId: `mcp-srv-${params.sessionId}-${params.clientId}`,
      createdAtIso: new Date().toISOString(),
      isPhysicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
      tasks: new Map(),
      notifications: [],
    };
    this.sessions.set(params.sessionId, session);
    return session;
  }

  registerTask(
    sessionId: string,
    clientId: string,
    organizationId: string,
    taskId: string,
    payload: unknown,
  ): void {
    const session = this.assertSessionOwnership(sessionId, clientId, organizationId);
    session.tasks.set(taskId, {
      taskId,
      ownerSessionId: session.sessionId,
      payload,
    });
  }

  getTask(
    requestingSessionId: string,
    requestingClientId: string,
    requestingOrgId: string,
    taskId: string,
  ): { taskId: string; ownerSessionId: string; payload: unknown } {
    const session = this.assertSessionOwnership(
      requestingSessionId,
      requestingClientId,
      requestingOrgId,
    );
    const task = session.tasks.get(taskId);
    if (!task || task.ownerSessionId !== requestingSessionId) {
      throw new Error(
        `CROSS_SESSION_TASK_ACCESS_DENIED: task '${taskId}' is not accessible by session '${requestingSessionId}'.`,
      );
    }
    return task;
  }

  enqueueNotification(targetSessionId: string, notificationId: string, message: string): void {
    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Unknown target MCP session: ${targetSessionId}`);
    }
    session.notifications.push({
      notificationId,
      targetSessionId,
      message,
    });
  }

  drainNotifications(
    requestingSessionId: string,
    requestingClientId: string,
    requestingOrgId: string,
  ): Array<{ notificationId: string; targetSessionId: string; message: string }> {
    const session = this.assertSessionOwnership(
      requestingSessionId,
      requestingClientId,
      requestingOrgId,
    );
    const owned = session.notifications.filter((n) => n.targetSessionId === requestingSessionId);
    session.notifications = [];
    return owned;
  }

  private assertSessionOwnership(
    sessionId: string,
    clientId: string,
    organizationId: string,
  ): McpIsolatedSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`MCP session not found: ${sessionId}`);
    }
    if (session.clientId !== clientId || session.organizationId !== organizationId) {
      throw new Error(
        `MCP_SESSION_HIJACK_BLOCKED: session '${sessionId}' belongs to another client or tenant.`,
      );
    }
    return session;
  }
}
