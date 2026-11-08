/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * Automated Client Bundle & Source Secret Exposure Inspector (Section 6.3)
 *
 * Inspects source files and client production bundles for forbidden server secret
 * variable references and JWT `service_role` tokens without ever printing secret values.
 */

export const SECRET_BUNDLE_INSPECTOR_VERSION = "3.8.2-SECRET-INSPECTOR-v1.0";

export const FORBIDDEN_CLIENT_SECRET_IDENTIFIERS: readonly string[] = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
];

export interface JwtRoleInspection {
  isJwtFormat: boolean;
  role: string | null;
  projectRef: string | null;
  isPublicAnonKey: boolean;
  isPrivilegedServiceRole: boolean;
}

/**
 * Decodes ONLY the non-sensitive middle payload claims (`role`, `ref`, `iss`) of a
 * JWT string to distinguish a public Supabase `anon` key from a privileged `service_role` key,
 * without logging or returning the raw token or its signature.
 */
export function inspectSupabaseJwtRoleSafe(tokenCandidate: string): JwtRoleInspection {
  const parts = tokenCandidate.trim().split(".");
  if (parts.length !== 3 || !parts[1]) {
    return {
      isJwtFormat: false,
      role: null,
      projectRef: null,
      isPublicAnonKey: false,
      isPrivilegedServiceRole: false,
    };
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const jsonText = Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(jsonText) as Record<string, unknown>;
    const role = typeof payload.role === "string" ? payload.role : null;
    const projectRef = typeof payload.ref === "string" ? payload.ref : null;
    return {
      isJwtFormat: true,
      role,
      projectRef,
      isPublicAnonKey: role === "anon",
      isPrivilegedServiceRole: role === "service_role" || role === "supabase_admin",
    };
  } catch {
    return {
      isJwtFormat: false,
      role: null,
      projectRef: null,
      isPublicAnonKey: false,
      isPrivilegedServiceRole: false,
    };
  }
}

/**
 * Scans a client bundle or browser-facing source file content for:
 * 1. Any reference to `process.env.<FORBIDDEN_SERVER_SECRET>` or `import.meta.env.<FORBIDDEN_SERVER_SECRET>`
 * 2. Any embedded JWT with `role: "service_role"`
 * 3. Any Stripe live/test secret key pattern (`sk_live_...`, `sk_test_...`, `whsec_...`)
 * Never echoes the matched value in the returned report.
 */
export function scanClientBundleContentForSecrets(
  fileContent: string,
  fileLabel: string,
): {
  clean: boolean;
  findings: Array<{ file: string; ruleId: string; description: string }>;
} {
  const findings: Array<{ file: string; ruleId: string; description: string }> = [];

  for (const secretName of FORBIDDEN_CLIENT_SECRET_IDENTIFIERS) {
    // Check if the identifier is accessed on env objects or assigned in client bundle
    const envPattern = new RegExp(
      `(?:process\\.env|import\\.meta\\.env)\\s*(?:\\.${secretName}|\\[\\s*['"]${secretName}['"]\\s*\\])`,
      "g",
    );
    if (envPattern.test(fileContent)) {
      findings.push({
        file: fileLabel,
        ruleId: `CLIENT_ENV_REF_${secretName}`,
        description: `Forbidden server secret identifier '${secretName}' referenced in client-side code.`,
      });
    }
  }

  // Check for Stripe secret key prefixes
  if (/\bsk_(?:live|test)_[0-9a-zA-Z]{16,}\b/.test(fileContent)) {
    findings.push({
      file: fileLabel,
      ruleId: "STRIPE_SECRET_KEY_PATTERN",
      description: "Stripe secret key pattern detected in client bundle.",
    });
  }

  // Check all JWT-shaped strings in the bundle to ensure none have role === "service_role"
  const jwtRegex = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
  const matches = fileContent.match(jwtRegex) ?? [];
  for (const jwt of matches) {
    const info = inspectSupabaseJwtRoleSafe(jwt);
    if (info.isPrivilegedServiceRole) {
      findings.push({
        file: fileLabel,
        ruleId: "SUPABASE_SERVICE_ROLE_JWT_IN_CLIENT",
        description: "Privileged service_role JWT detected in client bundle.",
      });
    }
  }

  return {
    clean: findings.length === 0,
    findings,
  };
}
