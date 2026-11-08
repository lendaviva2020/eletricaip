// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import createDOMPurify from "dompurify";

import {
  sanitizeIndustrialHtml,
  validateDomPurifyConfig,
  scrubTemplateExpressionsRecursive,
  parseAndNormalizeIp,
  isIpInTrustedCidr,
  resolveTrustedClientIp,
  verifyMcpAccessToken,
  sanitizeRedirectHeaders,
  IsolatedMcpSessionRegistry,
  parseSafeIndustrialXml,
  parseSafeSpreadsheetBuffer,
  sanitizeSpreadsheetRecords,
  XLSX,
  validateSafeSerializableValue,
  normalizeAndValidateRoutePath,
  parseSafeQueryString,
  validateSafeSourceMap,
  createExternalHashAnchor,
  verifyLedgerAgainstExternalAnchors,
  inspectSupabaseJwtRoleSafe,
  scanClientBundleContentForSecrets,
  type LedgerEventNode,
} from "@/lib/security";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "@/lib/observability";

describe("ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2 FULL SECURITY REMEDIATION SUITE", () => {
  // ── SECTION 3.1: DOMPurify (5 Advisories) ──────────────────────────────────
  describe("Section 3.1 — DOMPurify 3.4.17 & Industrial HTML Sanitization Guard", () => {
    it("verifies installed DOMPurify version is >= 3.4.17", () => {
      const purifier =
        typeof createDOMPurify.sanitize === "function"
          ? createDOMPurify
          : createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
      expect(purifier.version).toBe("3.4.17");
    });

    it("rejects unsafe DOMPurify configurations (IN_PLACE, RETURN_DOM, application/xhtml+xml)", () => {
      expect(validateDomPurifyConfig({ IN_PLACE: true }).valid).toBe(false);
      expect(validateDomPurifyConfig({ RETURN_DOM: true }).valid).toBe(false);
      expect(validateDomPurifyConfig({ RETURN_DOM_FRAGMENT: true }).valid).toBe(false);
      expect(validateDomPurifyConfig({ PARSER_MEDIA_TYPE: "application/xhtml+xml" }).valid).toBe(
        false,
      );
      expect(
        validateDomPurifyConfig({ PARSER_MEDIA_TYPE: "text/html", IN_PLACE: false }).valid,
      ).toBe(true);
    });

    it("neutralizes split template expressions across removed elements (GHSA-cg2g-xh64-v4q7)", () => {
      // Attack payload splits ${alert(document.domain)} across <object> so per-node regex fails before element removal
      const splitPayload = `<div>$<object></object>{alert(document.domain)} e {{user<script>evil()</script>.secret}}</div>`;
      const sanitized = sanitizeIndustrialHtml(splitPayload);
      expect(sanitized).not.toContain("${");
      expect(sanitized).not.toContain("alert(document.domain)");
      expect(sanitized).not.toContain("{{");
      expect(sanitized).not.toContain("}}");
      expect(scrubTemplateExpressionsRecursive("${a${b}c}")).toBe("");
    });

    it("neutralizes detached parent/sibling event handlers in DOMPurify 3.4.17 IN_PLACE hooks (GHSA-mrv2-3pqr-j5jr & GHSA-p98j-92pf-mc4p)", () => {
      const purifier =
        typeof createDOMPurify.sanitize === "function"
          ? createDOMPurify
          : createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

      for (const mode of ["self", "parent", "nextSibling"] as const) {
        const root = document.createElement("div");
        root.innerHTML =
          '<figure><img class="bad" src="a.png"><img id="evil" src="x" onerror="alert(1)"></figure><p>ok</p>';
        const evilImg = root.querySelector("#evil")!;

        purifier.addHook("afterSanitizeAttributes", (node) => {
          if (node.getAttribute && node.getAttribute("class") === "bad") {
            if (mode === "self") node.remove();
            if (mode === "parent") node.parentElement?.remove();
            if (mode === "nextSibling") node.nextElementSibling?.remove();
          }
        });

        purifier.sanitize(root, { IN_PLACE: true });
        purifier.removeAllHooks();

        // In 3.4.17, detached sibling/parent subtrees have their event handlers stripped
        expect(evilImg.getAttribute("onerror")).toBeNull();
      }
    });

    it("prevents force-removed rawtext <style> root from retaining executable markup (GHSA-6688-9rhm-gjv2)", () => {
      const rawStyleMarkup = `<style onclick="alert(1)"></style><img src="x" onerror="alert(1)"></style>`;
      const sanitized = sanitizeIndustrialHtml(rawStyleMarkup);
      expect(sanitized).not.toContain("<style");
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("onclick");
    });

    it("blocks SVG SMIL <animate attributeName='href'> XSS vector (GHSA-c6gr-qvv4-5v3f)", () => {
      const smilPayload = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><a id="q"><animate attributeName="href" values="x;javascript:alert(1)" dur="0.01s" fill="freeze"/><text x="10" y="40">click</text></a></svg>`;
      const sanitized = sanitizeIndustrialHtml(smilPayload);
      expect(sanitized).not.toContain("<animate");
      expect(sanitized).not.toContain("attributeName");
      expect(sanitized).not.toContain("javascript:alert(1)");
    });
  });

  // ── SECTION 3.2: proxy-addr & ip-address ───────────────────────────────────
  describe("Section 3.2 & 4.4 — proxy-addr >= 2.0.8 & ip-address >= 10.7.4 Anti-Spoofing", () => {
    it("rejects IPv6 addresses with percent (%) zone identifiers or excessive length (CVE-2026-111997)", () => {
      expect(() => parseAndNormalizeIp("fe80::1%eth0")).toThrow(/CVE-2026-111997/);
      expect(() => parseAndNormalizeIp("fe80::1" + "%25".repeat(50))).toThrow(/CVE-2026-111997/);
      expect(() => parseAndNormalizeIp("a".repeat(60))).toThrow(/exceeds strict maximum/);
    });

    it("normalizes IPv4-mapped IPv6 addresses to IPv4 so CIDR checks cannot be bypassed across families (CVE-2026-101912)", () => {
      const mapped = parseAndNormalizeIp("::ffff:10.20.30.40");
      expect(mapped.family).toBe("IPv4");
      expect(mapped.canonicalIp).toBe("10.20.30.40");
      expect(mapped.wasIpv4Mapped).toBe(true);
      expect(isIpInTrustedCidr("::ffff:10.20.30.40", "10.0.0.0/8")).toBe(true);
      expect(isIpInTrustedCidr("::ffff:203.0.113.5", "10.0.0.0/8")).toBe(false);
    });

    it("prevents external clients from spoofing their IP via X-Forwarded-For when connecting directly (CVE-2026-90711)", () => {
      const res = resolveTrustedClientIp("203.0.113.55", "10.0.0.1, 192.168.1.1", [
        "10.0.0.0/8",
        "127.0.0.0/8",
      ]);
      expect(res.clientIp).toBe("203.0.113.55");
      expect(res.trustedProxyUsed).toBe(false);
      expect(res.ignoredSpoofedHeaders).toBe(true);
    });

    it("walks X-Forwarded-For right-to-left and stops at the first untrusted hop", () => {
      // Attacker sends "1.1.1.1" in XFF, connects to edge proxy 10.0.0.10 via client 198.51.100.88
      const res = resolveTrustedClientIp("::ffff:10.0.0.10", "1.1.1.1, 198.51.100.88, 10.0.0.5", [
        "10.0.0.0/8",
        "127.0.0.0/8",
      ]);
      expect(res.clientIp).toBe("198.51.100.88");
      expect(res.trustedProxyUsed).toBe(true);
      expect(res.ignoredSpoofedHeaders).toBe(true);
    });
  });

  // ── SECTION 4.1: MCP Session Isolation, Token Audience & Redirects ─────────
  describe("Section 4.1 — MCP Session Isolation, verifyMcpAccessToken & Cross-Origin Redirects", () => {
    const policy = {
      expectedIssuer: "https://auth.eletricai.industrial",
      expectedAudience: "mcp://eletricai-industrial-os",
      nowEpochSeconds: 1_760_000_000,
      requiredScopes: ["mcp:tools:read"],
    };

    it("rejects access tokens issued for another service audience (CVE-2026-111767)", () => {
      const wrongAudienceToken = verifyMcpAccessToken(
        {
          sub: "usr-01",
          iss: "https://auth.eletricai.industrial",
          aud: "https://other-service.example.com",
          exp: 1_760_003_600,
          scope: "mcp:tools:read",
          organizationId: "org-01",
          clientId: "client-01",
          signatureVerified: true,
        },
        policy,
      );
      expect(wrongAudienceToken.valid).toBe(false);
      expect(wrongAudienceToken.reason).toContain("AUDIENCE_MISMATCH");

      const validToken = verifyMcpAccessToken(
        {
          sub: "usr-01",
          iss: "https://auth.eletricai.industrial",
          aud: ["mcp://eletricai-industrial-os"],
          exp: 1_760_003_600,
          scope: "mcp:tools:read mcp:resources:read",
          organizationId: "org-01",
          clientId: "client-01",
          signatureVerified: true,
        },
        policy,
      );
      expect(validToken.valid).toBe(true);
    });

    it("strips Authorization and OAuth headers on 307/308 cross-origin redirects (GHSA-f897-62hf-6gxq)", () => {
      const redirect307 = sanitizeRedirectHeaders(
        "https://mcp.eletricai.industrial/v1/session",
        "https://evil-collector.example.org/hook",
        307,
        {
          Authorization: "Bearer secret-oauth-token",
          Cookie: "session=xyz",
          "X-MCP-Auth-Token": "mcp-secret",
          Accept: "application/json",
        },
      );
      expect(redirect307.isCrossOrigin).toBe(true);
      expect(redirect307.sanitizedHeaders.Authorization).toBeUndefined();
      expect(redirect307.sanitizedHeaders.Cookie).toBeUndefined();
      expect(redirect307.sanitizedHeaders["X-MCP-Auth-Token"]).toBeUndefined();
      expect(redirect307.sanitizedHeaders.Accept).toBe("application/json");
      expect(redirect307.strippedHeaders).toEqual(["Authorization", "Cookie", "X-MCP-Auth-Token"]);

      const redirect308SameOrigin = sanitizeRedirectHeaders(
        "https://mcp.eletricai.industrial/v1/session",
        "https://mcp.eletricai.industrial/v2/session",
        308,
        {
          Authorization: "Bearer secret-oauth-token",
          Accept: "application/json",
        },
      );
      expect(redirect308SameOrigin.isCrossOrigin).toBe(false);
      expect(redirect308SameOrigin.sanitizedHeaders.Authorization).toBe(
        "Bearer secret-oauth-token",
      );
    });

    it("enforces per-session server instance isolation and blocks cross-session task access (CVE-2026-111768 & CVE-2026-111770)", () => {
      const registry = new IsolatedMcpSessionRegistry();
      const s1 = registry.createSession({
        sessionId: "sess-alpha",
        clientId: "client-A",
        organizationId: "org-1",
      });
      const s2 = registry.createSession({
        sessionId: "sess-beta",
        clientId: "client-B",
        organizationId: "org-2",
      });

      expect(s1.serverInstanceId).not.toBe(s2.serverInstanceId);
      expect(s1.isPhysicalControlAllowed).toBe(false);

      registry.registerTask("sess-alpha", "client-A", "org-1", "task-101", {
        diagnosticRun: "QGBT-01",
      });
      registry.enqueueNotification("sess-alpha", "notif-1", "Analysis complete");

      // Session B cannot read Session A's task
      expect(() => registry.getTask("sess-beta", "client-B", "org-2", "task-101")).toThrow(
        /CROSS_SESSION_TASK_ACCESS_DENIED/,
      );

      // Session B cannot hijack Session A's ID
      expect(() => registry.getTask("sess-alpha", "client-B", "org-2", "task-101")).toThrow(
        /MCP_SESSION_HIJACK_BLOCKED/,
      );

      // Session B receives 0 notifications meant for Session A
      expect(registry.drainNotifications("sess-beta", "client-B", "org-2")).toHaveLength(0);
      expect(registry.drainNotifications("sess-alpha", "client-A", "org-1")).toHaveLength(1);
    });
  });

  // ── SECTION 4.2: @xmldom/xmldom >= 0.8.15 ──────────────────────────────────
  describe("Section 4.2 — @xmldom/xmldom >= 0.8.15 Safe XML Guard", () => {
    it("parses well-formed industrial XML and enforces depth, node count, DOCTYPE, and PI limits", () => {
      const validRes = parseSafeIndustrialXml(
        `<?xml version="1.0"?><SCL><Header id="substation-01"/><Substation name="SE-01"/></SCL>`,
      );
      expect(validRes.rootTagName).toBe("SCL");
      expect(validRes.nodeCount).toBe(3);

      // Reject DOCTYPE / XXE
      expect(() =>
        parseSafeIndustrialXml(
          `<!DOCTYPE scl [<!ENTITY ext SYSTEM "file:///etc/passwd">]><SCL>&ext;</SCL>`,
        ),
      ).toThrow(/DOCTYPE, ENTITY/);

      // Reject Processing Instructions
      expect(() =>
        parseSafeIndustrialXml(`<?xml version="1.0"?><?target evil="true"?><SCL/>`),
      ).toThrow(/processing instructions/i);

      // Reject excessive nesting depth
      const deepXml =
        Array.from({ length: 12 }, (_, i) => `<n${i}>`).join("") +
        Array.from({ length: 12 }, (_, i) => `</n${11 - i}>`).join("");
      expect(() => parseSafeIndustrialXml(deepXml, { maxDepth: 8 })).toThrow(/nesting depth/);

      // Reject excessive node count
      const wideXml = `<root>${Array.from({ length: 50 }, (_, i) => `<item id="${i}"/>`).join("")}</root>`;
      expect(() => parseSafeIndustrialXml(wideXml, { maxNodes: 20 })).toThrow(/node count/);
    });
  });

  // ── SECTION 4.3: @e965/xlsx >= 0.20.3 ──────────────────────────────────────
  describe("Section 4.3 — @e965/xlsx >= 0.20.3 Safe Spreadsheet Guard", () => {
    it("enforces file size, row count, column count limits and strips prototype pollution keys", () => {
      expect(XLSX.version).toBe("0.20.3");

      const pollutedInput = [
        JSON.parse(
          `{"manufacturer":"Schneider","partNumber":"LC1D09","__proto__":{"polluted":true},"constructor":{"bad":true}}`,
        ) as Record<string, unknown>,
      ];
      const cleaned = sanitizeSpreadsheetRecords(pollutedInput);
      expect(cleaned).toHaveLength(1);
      expect(cleaned[0]?.manufacturer).toBe("Schneider");
      expect(Object.prototype.hasOwnProperty.call(cleaned[0], "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(cleaned[0], "constructor")).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();

      // Row limit check
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(
        Array.from({ length: 15 }, (_, i) => ({ partNumber: `PN-${i}` })),
      );
      XLSX.utils.book_append_sheet(wb, ws, "Items");
      const bytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));

      expect(() => parseSafeSpreadsheetBuffer(bytes, { maxRows: 5 })).toThrow(/row count/);
      expect(parseSafeSpreadsheetBuffer(bytes, { maxRows: 20 })).toHaveLength(15);
    });
  });

  // ── SECTION 4.4: Serialization, Hono Path Guard, QS & SourceMap ────────────
  describe("Section 4.4 — seroval, hono/node-server, qs, and source-map-js Guards", () => {
    it("blocks unsafe RegExp and tampered TypedArray constructors before serialization (CVE-2026-116582 & CVE-2026-116583)", () => {
      expect(validateSafeSerializableValue({ tag: "PT-101", value: 42.5 }).safe).toBe(true);
      expect(validateSafeSerializableValue(/<\/script><script>alert(1)/).safe).toBe(false);

      const tamperedArray = new Uint8Array([1, 2, 3]);
      Object.defineProperty(tamperedArray, "constructor", {
        value: Function,
        enumerable: true,
      });
      const res = validateSafeSerializableValue(tamperedArray);
      expect(res.safe).toBe(false);
      expect(res.reason).toContain("CVE-2026-116583");
    });

    it("blocks double percent-encoded path traversal on protected static routes (CVE-2026-118663 & CVE-2026-111757)", () => {
      expect(normalizeAndValidateRoutePath("/assets/app.js")).toEqual({
        safe: true,
        normalizedPath: "/assets/app.js",
      });
      expect(normalizeAndValidateRoutePath("/static/%2e%2e/admin/secrets").safe).toBe(false);
      expect(normalizeAndValidateRoutePath("/static/%252e%252e/admin/secrets").safe).toBe(false);
      expect(normalizeAndValidateRoutePath("/static/..%5cadmin").safe).toBe(false);
    });

    it("safely parses query strings and rejects parameter flooding (CVE-2026-110816)", () => {
      const parsed = parseSafeQueryString(
        "?tag=VFD-01&tag=VFD-02&__proto__=polluted&constructor=bad",
      );
      expect(parsed.tag).toEqual(["VFD-01", "VFD-02"]);
      expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(false);

      expect(() => parseSafeQueryString("?a=1&b=2&c=3&d=4", { maxParams: 2 })).toThrow(
        /exceeds maximum/,
      );
    });

    it("validates source maps and blocks path traversal in sources array (CVE-2026-93749)", () => {
      expect(
        validateSafeSourceMap(
          JSON.stringify({
            version: 3,
            sources: ["src/index.ts", "src/App.tsx"],
            mappings: "AAAA",
          }),
        ).valid,
      ).toBe(true);

      expect(
        validateSafeSourceMap(
          JSON.stringify({
            version: 3,
            sources: ["../../etc/passwd"],
            mappings: "AAAA",
          }),
        ).valid,
      ).toBe(false);
    });
  });

  // ── SECTION 6: Secret Protection & Bundle Inspection ───────────────────────
  describe("Section 6 — Secret Protection, Ephemeral Auth State & Client Bundle Scanner", () => {
    it("confirms eletricai-demo-video/auth-state.json contains zero static credentials", () => {
      const authStatePath = resolve(process.cwd(), "..", "eletricai-demo-video", "auth-state.json");
      if (existsSync(authStatePath)) {
        const raw = readFileSync(authStatePath, "utf-8");
        const parsed = JSON.parse(raw) as { cookies?: unknown[]; origins?: unknown[] };
        expect(parsed.cookies ?? []).toHaveLength(0);
        expect(parsed.origins ?? []).toHaveLength(0);
        expect(raw).not.toContain("access_token");
        expect(raw).not.toContain("refresh_token");
      }
    });

    it("verifies SUPABASE_PUBLISHABLE_KEY_FALLBACK is strictly an 'anon' public key and never 'service_role'", () => {
      const envTsPath = resolve(process.cwd(), "src", "integrations", "supabase", "env.ts");
      const envTsContent = readFileSync(envTsPath, "utf-8");

      // Must pass client bundle secret scan
      const scanResult = scanClientBundleContentForSecrets(
        envTsContent,
        "src/integrations/supabase/env.ts",
      );
      expect(scanResult.clean).toBe(true);

      // Extract the fallback JWT and verify its role is "anon"
      const jwtMatch = envTsContent.match(
        /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
      );
      expect(jwtMatch).not.toBeNull();
      const roleInfo = inspectSupabaseJwtRoleSafe(jwtMatch![0]);
      expect(roleInfo.isJwtFormat).toBe(true);
      expect(roleInfo.role).toBe("anon");
      expect(roleInfo.isPublicAnonKey).toBe(true);
      expect(roleInfo.isPrivilegedServiceRole).toBe(false);
    });

    it("detects if a service_role JWT or server secret env reference is ever injected into a client bundle", () => {
      const fakeServiceRolePayload = Buffer.from(
        JSON.stringify({ role: "service_role", ref: "testproj" }),
      ).toString("base64url");
      const fakeServiceRoleJwt = `eyJhbGciOiJIUzI1NiJ9.${fakeServiceRolePayload}.fakesignature123456`;

      const detection = scanClientBundleContentForSecrets(
        `const key = "${fakeServiceRoleJwt}"; const s = process.env.SUPABASE_SERVICE_ROLE_KEY;`,
        "dist/client.js",
      );
      expect(detection.clean).toBe(false);
      expect(detection.findings.map((f) => f.ruleId)).toContain(
        "SUPABASE_SERVICE_ROLE_JWT_IN_CLIENT",
      );
      expect(detection.findings.map((f) => f.ruleId)).toContain(
        "CLIENT_ENV_REF_SUPABASE_SERVICE_ROLE_KEY",
      );
    });
  });

  // ── SECTION 7: Privileged Immutability & External Hash Anchoring ───────────
  describe("Section 7 — Privileged Admin Tamper Detection via External Signed Hash Anchors", () => {
    const computeHash = (node: Omit<LedgerEventNode, "eventHash">): string =>
      createHash("sha256")
        .update(
          `${node.sequenceNumber}|${node.eventId}|${node.payloadCanonical}|${node.prevEventHash ?? "GENESIS"}`,
        )
        .digest("hex");

    const buildValidChain = (): LedgerEventNode[] => {
      const e1Base = {
        sequenceNumber: 1,
        eventId: "ev-001",
        payloadCanonical: '{"type":"GATEWAY_ONLINE","gw":"gw-01"}',
        prevEventHash: null,
      };
      const e1: LedgerEventNode = { ...e1Base, eventHash: computeHash(e1Base) };

      const e2Base = {
        sequenceNumber: 2,
        eventId: "ev-002",
        payloadCanonical: '{"type":"ALARM_TRIP","tag":"QF-01"}',
        prevEventHash: e1.eventHash,
      };
      const e2: LedgerEventNode = { ...e2Base, eventHash: computeHash(e2Base) };

      const e3Base = {
        sequenceNumber: 3,
        eventId: "ev-003",
        payloadCanonical: '{"type":"INCIDENT_OPENED","inc":"inc-01"}',
        prevEventHash: e2.eventHash,
      };
      const e3: LedgerEventNode = { ...e3Base, eventHash: computeHash(e3Base) };

      return [e1, e2, e3];
    };

    it("detects when a privileged DB admin modifies an historical event AND recomputes the entire SHA-256 hash chain", () => {
      const witnessSecret = "external-hsm-witness-custody-key-2026";
      const originalChain = buildValidChain();
      const anchor = createExternalHashAnchor(originalChain, witnessSecret);

      // Verify intact ledger passes
      expect(
        verifyLedgerAgainstExternalAnchors(originalChain, [anchor], witnessSecret, computeHash)
          .intact,
      ).toBe(true);

      // Privileged DB superuser disables triggers, alters event #2 payload, and recomputes hashes for #2 and #3
      const recomputedChain = buildValidChain();
      const tamperedE2Base = {
        sequenceNumber: 2,
        eventId: "ev-002",
        payloadCanonical: '{"type":"NORMAL_OPERATION","tag":"QF-01"}',
        prevEventHash: recomputedChain[0]!.eventHash,
      };
      recomputedChain[1] = {
        ...tamperedE2Base,
        eventHash: computeHash(tamperedE2Base),
      };
      const recomputedE3Base = {
        sequenceNumber: 3,
        eventId: "ev-003",
        payloadCanonical: recomputedChain[2]!.payloadCanonical,
        prevEventHash: recomputedChain[1]!.eventHash,
      };
      recomputedChain[2] = {
        ...recomputedE3Base,
        eventHash: computeHash(recomputedE3Base),
      };

      // Local chain alone looks internally valid, but external anchor catches the privileged recomputation!
      const auditResult = verifyLedgerAgainstExternalAnchors(
        recomputedChain,
        [anchor],
        witnessSecret,
        computeHash,
      );
      expect(auditResult.intact).toBe(false);
      expect(auditResult.compromiseType).toBe("PRIVILEGED_RECOMPUTATION_OR_SUBSTITUTION_DETECTED");
    });

    it("detects when a privileged DB admin truncates tail events from the ledger", () => {
      const witnessSecret = "external-hsm-witness-custody-key-2026";
      const originalChain = buildValidChain();
      const anchor = createExternalHashAnchor(originalChain, witnessSecret);

      const truncatedChain = originalChain.slice(0, 2);
      const auditResult = verifyLedgerAgainstExternalAnchors(
        truncatedChain,
        [anchor],
        witnessSecret,
        computeHash,
      );
      expect(auditResult.intact).toBe(false);
      expect(auditResult.compromiseType).toBe("PRIVILEGED_TRUNCATION_DETECTED");
    });

    it("preserves IS_PHYSICAL_CONTROL_ALLOWED = false invariant", () => {
      expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
    });
  });
});
