# SECURITY INCIDENT RESPONSE RUNBOOK — ELÉTRICAI INDUSTRIAL OS (GATE 4.3)

**Scope:** Multi-tenant SaaS Web App, Supabase Auth/DB/Edge Functions, Payment Webhooks (Stripe / Mercado Pago), Edge Gateway Fleet, AI Services  
**Physical Control Safety Rule:** `IS_PHYSICAL_CONTROL_ALLOWED = false` (cloud layer has zero physical actuator capability; containment focuses on tenant data, gateway credentials, billing, and API/AI quota).

---

## 1. Severity Classification & SLA Targets

| Severity | Definition | Initial Triage SLA | Containment Target |
|---|---|---|---|
| **SEV-1 (Critical)** | Suspected cross-tenant data access, leaked `SERVICE_ROLE_KEY` / Stripe / Mercado Pago / gateway signing secret, authentication bypass, unauthorized payment state mutation | **15 min** | **< 1 hour** |
| **SEV-2 (High)** | Single-tenant privilege escalation, leaked single-gateway token, webhook replay/failure spike, active DoS against `/api/public/iot/ingest` | **30 min** | **< 4 hours** |
| **SEV-3 (Medium)** | Repeated 401/403 security audit alerts, CSP violation reports, non-exploited dependency advisory | **4 hours** | **Next business release** |

---

## 2. Specific Compromise Playbooks

### Playbook A: Compromised Supabase PAT (`sbp_*`), Service Role Key, or Gemini API Key
> Note: During Gate 4.3 local workspace `.env` inspection, an active unkeyed Supabase PAT (`sbp_fc...bec2`) and `GEMINI_API_KEY` (`AQ.Ab8...ErsQ`) exist on developer workstation disk (gitignored, not in Git history). Rotate any exposed or shared workstation credentials per step 1–4.

1. **Revoke Immediately at Provider Console:**
   - Supabase PAT (`sbp_*`): Supabase Dashboard -> Account -> Access Tokens -> Revoke token.
   - Supabase `SERVICE_ROLE_KEY` / `JWT_SECRET`: Project Settings -> API -> Rotate keys (note: rotating `JWT_SECRET` invalidates all active user sessions immediately).
   - `GEMINI_API_KEY`: Google AI Studio / GCP Console -> Credentials -> Restrict/Disable & regenerate key with API restrictions (`Generative Language API` only).
2. **Update Deployment Secrets:**
   - Update Vercel Environment Variables (`vercel env`) and Supabase Edge Function Secrets (`supabase secrets set`).
   - Trigger clean redeploy (`main` branch CI) and re-run `trivy fs --scanners secret .` + bundle grep check on `.vercel/output/static/`.
3. **Audit Logs:**
   - Inspect Supabase Auth audit logs, PostgreSQL query stats, and GCP Gemini usage spike logs across the exposure window.

### Playbook B: Compromised Edge Gateway Credential or Signing Key
1. **Immediate Revocation:**
   - Revoke gateway certificate/session via `revokeGatewayCertificateFn` (authenticated `PLATFORM_ADMIN` or `TENANT_ADMIN`), setting `isRevoked = true` and `operationalState = "REVOKED"`.
   - Rotate `ELETRICAI_RELEASE_SIGNING_SECRET` / `ELETRICAI_REMOTE_CONFIG_SIGNING_SECRET` in server environment (previously signed invalid configs/manifests immediately fail closed HMAC verification).
2. **Evidence Preservation:**
   - Export Fleet Audit Chain (`getFleetAuditLogsFn`) and verify cryptographic hash integrity (`verifyAuditChainIntegrity()`).

### Playbook C: Cross-Tenant Access / IDOR / RLS Policy Incident
1. **Contain Entry Point:**
   - Disable impacted Vercel deployment route or Supabase Edge Function (`supabase functions delete` / feature kill switch) while preparing patch.
2. **Verify Tenant Boundary Integrity:**
   - Query `supabase` logs for anomalous cross-tenant `tenant_id` access in Edge Functions (`ai-electrical-generator`, `ai-fix-diagnostics`) and storage buckets (`digital-twins`).
   - Apply verified RLS migration (`20261111120000_gate4_3_security_hardening_rls.sql` baseline pattern) via controlled `supabase db push` ONLY after peer review & staging test.

### Playbook D: Payment Webhook Tampering / Duplicate Event Anomaly
1. **Containment:**
   - Verify `STRIPE_WEBHOOK_SECRET` and `MP_WEBHOOK_SECRET` are intact and unexposed (ensure `?secret=` query parameters are disabled per `mp.webhook.ts` hardening).
   - Inspect `stripe_webhook_events`, `mp_webhook_processed`, and `invoices` / `tenants` for discrepant `amount` units (cents) or missed `pending -> approved` transitions.
2. **Reconciliation:**
   - Replay legitimate webhook deliveries from Stripe Dashboard or Mercado Pago notification panel (new idempotency logic deletes failed locks on 500 error so retries self-heal cleanly).

### Playbook E: Abuse of Public Ingestion / Rate-Limit Bypass (`/api/public/iot/ingest`)
1. Check `RATE_LIMIT_TRIGGERED` events in structured security logs (`security-audit-log.server.ts`).
2. Confirm Upstash Redis health (`rate-limiter.server.ts` fails closed when unavailable).
3. Block offending source IP CIDR at Vercel Firewall / Cloudflare WAF and revoke compromised `api_keys` hash rows for the affected tenant.

---

## 3. Forensic Evidence & Communication Checklist

- Preserve redacted logs (`redactSensitiveString` ensures no `Bearer`, `eyJ...`, `sbp_`, `sk_`, or `whsec_` strings are written to tickets).
- Never commit `.env`, `.vercel/output`, or raw telemetry dumps into Git.
- Notify affected Tenant Owners/Admins if cross-tenant PII, project blueprints, or billing records were accessed inside verified audit windows (LGPD Art. 48 compliance).
