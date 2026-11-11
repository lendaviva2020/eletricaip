# THREAT MODEL — ELÉTRICAI INDUSTRIAL OS (GATE 4.3)

**Assessment Classification:** AI-Assisted Automated Security Threat Modeling & Attack Surface Analysis  
**Baseline Commit:** `229b03ebbc6647e4f5b94f50f97aeb7e6ac6f0df`  
**Audit Branch:** `gate-4.3-redteam-security-hardening`  
**Standards Alignment:** OWASP ASVS 5.0.0 (L2 + L3 critical controls), OWASP API Security Top 10 (2023), STRIDE, IEC 62443-4-2, NIST SP 800-82 Rev. 3  

---

## 1. System Overview & Core Security Invariants

ElétricAi Industrial OS is a multi-tenant industrial electrical engineering, PLC studio (IEC 61131-3), SCADA monitoring, Edge Gateway fleet operations, and SaaS billing platform built with TanStack Start (Vite + React + SSR), Supabase (PostgreSQL + Auth + Storage + Deno Edge Functions), Vercel Serverless Hosting, Stripe, Mercado Pago, Upstash Redis, and Google Gemini / DeepSeek AI services.

### Non-Negotiable Physical Safety Invariant
- `IS_PHYSICAL_CONTROL_ALLOWED = false as const` and `isPhysicalControlAllowed = false as const`
- **Hard Rule:** No cloud service, API endpoint, Edge Gateway config, remote update, MCP tool, SCADA screen, or AI assistant may issue actuator writes, breaker trips, coil writes, or holding-register writes to physical OT equipment (`DANGEROUS_CONFIG_REJECTED`, permanently monitor/read-only + simulated sandbox only).

---

## 2. Trust Boundaries

| Boundary ID | From Zone | To Zone | Mechanism | Critical Controls Required |
|---|---|---|---|---|
| **TB-1** | Untrusted Internet / Browser | Vercel SSR / TanStack Start Routes | HTTPS / TLS 1.3 + CSP + Headers | Strict open-redirect validation, CSRF/Origin checks, HSTS, non-wildcard CSP |
| **TB-2** | Browser Client / DevTools | TanStack `createServerFn` (`/_serverFn/*`) | Supabase JWT Bearer (`requireSupabaseAuth` / `requireActiveSession`) | Verify JWT `iss`, `aud="authenticated"`, `alg`, `exp`; server-derived `userId`, `tenantId`, `role`; reject spoofed client payload identities |
| **TB-3** | Public Webhook & IoT Callers | `/api/public/*` Routes | HMAC-SHA256 Signatures / API Key SHA-256 + Rate Limit | Timing-safe HMAC verification (Stripe / Mercado Pago `x-signature`), no query secrets, IP + key rate limiting |
| **TB-4** | Server / Browser Caller | Supabase Edge Functions (`/functions/v1/*`) | Supabase Auth `getUser()` + Ownership Check | Caller-scoped RLS OR explicit creator/membership verification (`tenant_memberships`), `x-goog-api-key` headers (never URL `?key=`), allowlisted CORS |
| **TB-5** | Authenticated SSR / RPC | PostgreSQL (`public.*`) & Storage (`digital-twins`) | Supabase RLS Policies (`auth.uid()`, `tenant_memberships`) | Strict tenant isolation, block `viewer` writes, protect `invites`/`api_keys`, canonical storage paths (anti-`..`) |
| **TB-6** | Edge Gateway Daemon | Cloud Ingestion & Fleet RPCs | Provisioned Gateway Credential (SHA-256) + HMAC/Ed25519 Signed Payloads | Fail-closed auth (`constantTimeEqual`), cryptographic verification on OTA manifests & remote config, plant-scoped RBAC |
| **TB-7** | Server Runtime | OT Protocols (Modbus TCP / OPC-UA Tests) | `isHostAllowed` / `isOpcuaEndpointAllowed` SSRF Filter | Block `169.254.x.x` IMDS, `127.0.0.0/8`, `localhost`, `::1`, DNS rebinding, exact `"simulation"` literal match |
| **TB-8** | Client-Submitted Prompt / Context | External LLM Providers (Gemini / DeepSeek) | `context-sanitizer.ts` + Zod `.strict()` + Server Quota RPC | Prompt injection defense, quota consumption before LLM execution, no client secret leakage |

---

## 3. High-Value Assets

1. **Multi-Tenant Industrial Projects & SCADA/Historian Telemetry** (`projects`, `diagrams`, `tag_samples`, `industrial_*`, `alarm_configs`, `alarm_history`)
2. **Edge Gateway Fleet Credentials, mTLS Certificates & Signed Config/OTA Pipelines** (`CloudGatewayRegistry`, `SignedUpdateManager`, `RemoteConfigManager`, `FleetCertificateManager`)
3. **Authentication Sessions, Admin Privileges & Invites** (Supabase JWTs, `profiles`, `tenant_memberships`, `invites`, `api_keys`, `platform_admins`)
4. **SaaS Subscription & Payment State** (`tenants.plan`, `tenants.subscription_status`, `invoices`, `stripe_webhook_events`, `mp_webhook_processed`)
5. **Cloud Infrastructure Secrets & Credentials** (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `MP_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`)
6. **Physical Safety Interlock (`IS_PHYSICAL_CONTROL_ALLOWED = false`)**

---

## 4. STRIDE Threat Matrix Across Attack Surface

| STRIDE Category | Concrete Attack Vector Observed Pre-Fix | Pre-Fix Severity | Gate 4.3 Remediation / Control |
|---|---|---|---|
| **Spoofing** | `fleet.functions.ts` accepted optional `data.user` and defaulted to `DefaultPlatformAdminUser`; `observability.functions.ts` trusted client `user: UserContextSchema` (`role: PLATFORM_ADMIN`); `CloudGatewayRegistry` permitted missing credentials & certificate fingerprint bypass. | **CRITICAL** (CVSS 9.8 / 9.1) | Added `requireSupabaseAuth` + server-derived `resolveAuthenticatedFleetContext`; deleted `DefaultPlatformAdminUser`; fail-closed gateway credential SHA-256 verification with `constantTimeEqual`. |
| **Tampering** | `SignedUpdateManager` & `RemoteConfigManager` & `FleetCertificateManager` accepted non-cryptographic >=16-char strings as valid signatures; `observability_slo_definitions` lacked RLS; `viewer` members could mutate canonical `industrial_*` & `diagrams`/`tag_samples`. | **HIGH / CRITICAL** | Implemented fail-closed HMAC-SHA256 verification (`SignedUpdateManager`, `RemoteConfigManager`) & Ed25519/HMAC PoP verification (`FleetCertificateManager`); enforced write role exclusions in RPCs + corrective SQL migration. |
| **Repudiation** | Missing auth/actor derivation on `fleet.functions.ts` & `observability.functions.ts` meant any caller could spoof `actor.email` and `actor.id` in audit chains (`fleetAuditManager`, `transitionIncidentStatus`). | **HIGH** | Audit actors now derive exclusively from verified server JWT/session context; structured `logSecurityEvent` redacts credentials cleanly. |
| **Information Disclosure** | `"egw_token_lab_ete_secret_123"` leaked into production client bundle (`scada-layout-*.js`); Gemini API key passed via URL query `?key=`; `ai-electrical-generator` read arbitrary `project_id` with `SERVICE_ROLE_KEY`; `ai-fix-diagnostics` read arbitrary projects (IDOR); `iot.functions`/`catalog.functions` exposed PostgREST `.or()` injection; raw DB/socket error details returned. | **CRITICAL** | Removed hardcoded token from source & rebuilt bundle cleanly; moved Gemini key to `x-goog-api-key` header; enforced caller auth + tenant/creator ownership in Edge Functions & RPCs; sanitized `.or()` filters & external error messages. |
| **Denial of Service / Abuse** | Unauthenticated `ai-electrical-generator` allowed unbounded LLM credit abuse; `iot.ingest.ts` rate-limited solely by `sha256(apiKey)` allowing brute-force key rotation bypass; `pingArchitect` lacked burst rate limiting; `zod@3.25.76` advisory. | **HIGH** | Required JWT + `tenant_memberships` + `consume_ai_credits_for_user` in Edge Function; added pre-auth IP rate limiting in `iot.ingest.ts`; added `requireBurstLimit` to `pingArchitect`; documented dependency advisories. |
| **Elevation of Privilege** | `catalog-import.functions.ts` granted global `supabaseAdmin` writes to any tenant owner (`requireTenantAdmin`); `observability.functions.ts` only blocked `"VIEWER"` on `transitionIncidentStatusFn` and trusted client `role`; `clients.functions.ts` accepted `javascript:` URLs. | **HIGH / CRITICAL** | Restricted global catalog import/check to explicit `is_platform_admin` + `requireActiveSession`; enforced server-derived RBAC across `fleet` & `observability` (blocking `AUDITOR`/`VIEWER` mutations); restricted client URLs to `http:`/`https:`. |
| **External Navigation / SSRF** | `isSafeRedirect("/\t/evil.com?x")` bypassed `^\/[\\/]` check (open redirect); `modbus-server` & `opcua-server` `.includes("simulation")` allowed `169.254.169.254.simulation` IMDS bypass & `127.0.0.1`; `mp.webhook` built API URL from unvalidated `paymentId`; `mcp.ts` trusted `X-Forwarded-Host`. | **CRITICAL / HIGH** | Canonicalized & blocked control/percent-encoded chars + WHATWG origin verification in `isSafeRedirect`; restricted `simulation` match to exact literal & removed `127.x`/localhost in `opcua-server`; validated `/^\d{1,32}$/` `paymentId`; disabled `trustForwardedHost`. |
