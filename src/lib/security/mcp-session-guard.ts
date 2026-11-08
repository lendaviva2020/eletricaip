// MCP Session, Tenant Isolation & OAuth Origin Guard — Gate 3.8.2
// Mitigates:
// - CVE-2026-104850: Cross-session response leakage via shared transport reuse
// - CVE-2026-111767: Unhandled error DoS in StreamableHTTPServerTransport
// - CVE-2026-111768 / GHSA-f897-62hf-6gxq: Cross-client/session leakage via shared server instance
// - CVE-2026-111770: Client credentials sent to untrusted servers via OAuth metadata URL

export interface McpSessionContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly tokenHash: string;
  readonly issuer: string;
  readonly createdAtMs: number;
}

/**
 * Registro imutável de vínculo de sessão MCP para impedir reutilização
 * cross-session ou cross-tenant de transportes ou instâncias.
 */
export class McpSessionIsolationGuard {
  private readonly bindings = new Map<string, McpSessionContext>();

  public bindSession(ctx: McpSessionContext): McpSessionContext {
    if (!ctx.sessionId || !ctx.userId || !ctx.tenantId || !ctx.tokenHash) {
      throw new Error("MCP_SECURITY_VIOLATION: Contexto de sessão MCP incompleto.");
    }

    const existing = this.bindings.get(ctx.sessionId);
    if (existing) {
      if (existing.userId !== ctx.userId) {
        throw new Error(
          `MCP_CROSS_SESSION_VIOLATION: Tentativa de reutilizar sessão "${ctx.sessionId}" por usuário distinto.`,
        );
      }
      if (existing.tenantId !== ctx.tenantId) {
        throw new Error(
          `MCP_CROSS_TENANT_VIOLATION: Tentativa de acesso cross-tenant na sessão "${ctx.sessionId}".`,
        );
      }
      if (existing.tokenHash !== ctx.tokenHash) {
        throw new Error(
          `MCP_TOKEN_MISMATCH_VIOLATION: Token OAuth divergente na sessão "${ctx.sessionId}".`,
        );
      }
      return existing;
    }

    const frozen = Object.freeze({ ...ctx });
    this.bindings.set(ctx.sessionId, frozen);
    return frozen;
  }

  public assertIsolatedAccess(
    sessionId: string,
    requestUserId: string,
    requestTenantId: string,
  ): McpSessionContext {
    const bound = this.bindings.get(sessionId);
    if (!bound) {
      throw new Error(`MCP_SESSION_NOT_FOUND: Sessão "${sessionId}" não registrada.`);
    }
    if (bound.userId !== requestUserId) {
      throw new Error(
        `MCP_CROSS_SESSION_VIOLATION: Isolamento violado entre usuários na sessão "${sessionId}".`,
      );
    }
    if (bound.tenantId !== requestTenantId) {
      throw new Error(
        `MCP_CROSS_TENANT_VIOLATION: Isolamento violado entre tenants na sessão "${sessionId}".`,
      );
    }
    return bound;
  }

  public releaseSession(sessionId: string): void {
    this.bindings.delete(sessionId);
  }
}

/**
 * Valida URLs de metadados OAuth / token endpoints antes de enviar credenciais
 * (mitigação para CVE-2026-111770).
 * Exige HTTPS estrito, bloqueia endereços loopback/privados/link-local (SSRF)
 * e exige que o host pertença à allowlist confiável.
 */
export function validateTrustedMcpOAuthEndpoint(
  endpointUrl: string,
  allowedHosts: readonly string[],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    throw new Error("MCP_OAUTH_SECURITY_VIOLATION: URL de endpoint OAuth inválida.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `MCP_OAUTH_SECURITY_VIOLATION: Protocolo inseguro "${parsed.protocol}" rejeitado (HTTPS obrigatório).`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      "MCP_OAUTH_SECURITY_VIOLATION: Credenciais embutidas na URL OAuth são proibidas.",
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "::1" ||
    host === "[::1]" ||
    host.includes("::ffff:")
  ) {
    throw new Error(
      `MCP_OAUTH_SECURITY_VIOLATION: Host privado/loopback "${host}" bloqueado contra SSRF e vazamento de credenciais.`,
    );
  }

  const normalizedAllowlist = new Set(allowedHosts.map((h) => h.toLowerCase().trim()));
  if (!normalizedAllowlist.has(host)) {
    throw new Error(
      `MCP_OAUTH_SECURITY_VIOLATION: Host "${host}" não pertence à allowlist de servidores OAuth confiáveis.`,
    );
  }

  return parsed;
}
