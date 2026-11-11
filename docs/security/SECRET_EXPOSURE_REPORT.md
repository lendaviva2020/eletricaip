# SECRET, BUNDLE & GIT HISTORY EXPOSURE REPORT — GATE 4.3

> **Strict Redaction Guarantee:** No full secret, PAT, API key, JWT, service role key, or webhook secret is printed in this report. Workspace `.env` findings are identified strictly by variable name / line number and masked fingerprints (`prefix...suffix`).

**Repository:** `lendaviva2020/eletricaip`  
**Branch:** `gate-4.3-redteam-security-hardening`  
**Tools Executed:** `trivy fs --scanners vuln,secret,misconfig`, Git full-history forensic scanner (`1,182` commits), local `.vercel/output/static/**` bundle scanner (`279` files, `0` sourcemaps).

---

## 1. Executive Summary of Secret Audit (Before vs. After Gate 4.3)

| Target Area | Pre-Fix Finding | Classification | Remediation Executed | Post-Fix Verification |
|---|---|---|---|---|
| **Client Bundle (`.vercel/output/static/`)** | `egw_token_lab_ete_secret_123` emitted into client asset `scada-layout-ByDpkcpV.js` via `CloudGatewayRegistry` transitive import from `@/lib/scada/canonical-bridge.ts` | **CRITICAL SECRET LEAK (P0-04)** | Removed hardcoded fallback gateway token literal from `CloudGatewayRegistry`; moved default token registration strictly to optional server env var (`ELETRICAI_LAB_GATEWAY_TOKEN` / `_HASH`) stored as SHA-256 digest | **FIXED_AND_RETESTED:** Fresh `vite build` scanned (`279` static files, `0` `.map` files): **`secretHits: []`** |
| **Hardcoded Signing Keys in Edge Engines** | Fallback private signing literals (`"SECRET_ELETRICAI_PRIVATE_RELEASE_SIGNER"`, `"ELETRICAI_REMOTE_CONFIG_SIGNING_KEY"`) in `signed-updates.ts` & `remote-config.ts` | **HIGH (P1-10)** | Removed hardcoded signing key literals; constructors read explicit argument or server env (`ELETRICAI_RELEASE_SIGNING_SECRET`, `ELETRICAI_REMOTE_CONFIG_SIGNING_SECRET`) and fail closed when absent | **FIXED_AND_RETESTED:** `signReleaseManifest` throws `SIGNING_SECRET_UNCONFIGURED` when keyless; `verifyManifestSignature` / `verifyConfigSignature` fail closed |
| **External LLM Key Transport** | `GEMINI_API_KEY` passed via URL query parameter (`?key=...`) in `ai-electrical-generator` & `ai-industrial-architect` Edge Functions | **HIGH (P1-07)** | Migrated Gemini requests in both Edge Functions to HTTP request header `"x-goog-api-key"` (keeping secret out of proxy/CDN URLs & access logs) | **FIXED_AND_RETESTED:** Static scan & test assertions confirm zero `?key=` query strings remain |
| **Local `.env` Workstation File** | `.env` (gitignored) line 19 `SUPABASE_SERVICE_ROLE_KEY`; line 21 unkeyed token `CHAVE SBP:sbp_fc...bec2` (Supabase PAT, len 44); line 25 `GEMINI_API_KEY=AQ.Ab8...ErsQ` (len 53) | **WORKSTATION SECRET HYGIENE (Rotate Recommended)** | `.env` confirmed gitignored (`git ls-files .env` empty); no `.env` values modified or tested externally; rotation instructions documented in `INCIDENT_RESPONSE_RUNBOOK.md` | **CONFIRMED_MITIGATED_LOCALLY** (never pushed or bundled; human rotation recommended before production cutover) |
| **Public Fallback Key (`env.ts` & client chunk)** | Trivy flags JWT fallback in `src/integrations/supabase/env.ts` line 15 (`SUPABASE_PUBLISHABLE_KEY_FALLBACK`) | **PUBLIC_BY_DESIGN (`role: "anon"`)** | Decoded payload contains exclusively `"role":"anon"`, `"ref":"rvaaxvdimggztjxoktvy"` (subject to PostgreSQL RLS); decoupled hardcoded expected ref when `SUPABASE_PROJECT_REF` / `VITE_SUPABASE_PROJECT_REF` is provided | **VERIFIED_BENIGN** |
| **Git Commit History (`1,182` commits)** | 17 pattern matches across full history (`git log --all`) | **NO_REAL_SERVER_SECRET_COMMITTED** | Audited all 17 matches: exclusively synthetic test fixtures in `src/__tests__/` or public `role: "anon"` JWTs; zero real `service_role`, Stripe, Mercado Pago, or Supabase PAT secrets in any commit | **VERIFIED_CLEAN** |
| **Client Sourcemaps (`.vercel/output/static`)** | `0` `.map` files across `279` emitted assets | **SECURE** | Verified before and after production rebuild | **VERIFIED_CLEAN** |

---

## 2. Trivy Scanner Verification (`vuln,secret,misconfig`)

- **Pre-fix (`trivy_gate43.json`):** `0` package vulnerabilities, `0` misconfigurations, `4` secret hits (`.env` local `service_role` + public `anon` JWT fallback across `src/integrations/supabase/env.ts`, client bundle, and SSR chunk).
- **Post-fix (`trivy_gate43_after.json`):** `0` package vulnerabilities, `0` misconfigurations, `4` expected targets (`.env` local gitignored file + public `anon` fallback across `env.ts`, client chunk `index-BKLkT7y0.js`, and SSR chunk `env-Cvd9OsuP.mjs`).
- **CI/CD Prevention Gate Added:** `.github/workflows/ci.yml` now runs post-build secret scanning on `.vercel/output/static/` rejecting any occurrence of `egw_token_lab_ete_secret_123`, `SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, or `MP_ACCESS_TOKEN`.

---

## 3. Rotation Action Items for Project Owner

1. Rotate the workstation Supabase Personal Access Token (`sbp_fc...bec2`) recorded on line 21 of local `.env` in Supabase Account -> Access Tokens, and delete the unkeyed `CHAVE SBP:...` line from `.env`.
2. Rotate `GEMINI_API_KEY` (`AQ.Ab8...ErsQ`) in Google AI Studio / GCP Console and apply API key HTTP referrer/service restrictions (`Generative Language API`).
3. Ensure Vercel and Supabase production secret stores define distinct `STRIPE_WEBHOOK_SECRET`, `MP_WEBHOOK_SECRET` (using `X-Signature` / `X-Webhook-Secret` headers only), `ELETRICAI_RELEASE_SIGNING_SECRET`, `ELETRICAI_REMOTE_CONFIG_SIGNING_SECRET`, and `PUBLIC_APP_URL`.
