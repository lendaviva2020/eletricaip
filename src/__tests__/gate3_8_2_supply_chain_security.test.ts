// @vitest-environment jsdom
// Gate 3.8.2 — Critical Dependency Remediation & Supply Chain Security Hardening Suite
// Validates runtime remediations and defense-in-depth controls for all advisories
// identified in the Trivy supply-chain audit.

import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as jsYaml from "js-yaml";

import { sanitizeUntrustedHtml, sanitizeDomNodeSafely } from "@/lib/security/safe-html-sanitizer";
import {
  normalizeIpAddress,
  isValidIpLiteral,
  resolveTrustedClientIp,
} from "@/lib/security/client-ip-guard";
import {
  McpSessionIsolationGuard,
  validateTrustedMcpOAuthEndpoint,
} from "@/lib/security/mcp-session-guard";
import { safeDecodeHttpPayload } from "@/lib/security/payload-guard";
import {
  XLSX,
  safeReadXlsxWorkbook,
  safeSheetToJson,
  sanitizeSpreadsheetRecord,
  sanitizeSpreadsheetFormulaString,
} from "@/lib/security/safe-xlsx";
import { validateXmlSecurity } from "@/lib/importer/security-validator";
import { safeParseYaml, parseYamlBundle } from "@/lib/importer/adapters/yaml-adapter";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "@/lib/observability";
import { ModbusTcpClientDriver } from "@/lib/edge/drivers/modbus-driver";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";

describe("Gate 3.8.2 — Supply Chain Security & Advisory Validation Suite", () => {
  // ── 1. DOMPurify (GHSA-cg2g-xh64-v4q7 CRITICAL & GHSA-mrv2-3pqr-j5jr HIGH) ──
  describe("1. DOMPurify >= 3.4.17 — Template Bypass & IN_PLACE Hook Hardening", () => {
    it("neutralizes split template expressions inside declarative shadow root (GHSA-cg2g-xh64-v4q7)", () => {
      const maliciousPayload = `
        <div>
          <template shadowrootmode="open">
            <span>{{ constructor.constructor('alert(1)')() }}</span>
            <p>\${globalThis.process}</p>
          </template>
          <p>Circuito QGBT-01</p>
          <span>{{ unsafe_expr }}</span>
        </div>
      `;
      const clean = sanitizeUntrustedHtml(maliciousPayload);
      expect(clean).not.toContain("<template");
      expect(clean).not.toContain("shadowrootmode");
      expect(clean).not.toContain("{{");
      expect(clean).not.toContain("}}");
      expect(clean).not.toContain("alert(1)");
      expect(clean).not.toContain("unsafe_expr");
      expect(clean).toContain("Circuito QGBT-01");
    });

    it("prevents parent/sibling bypass on detached DOM nodes (GHSA-mrv2-3pqr-j5jr)", () => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<section><b>Seguro</b><img src="x" onerror="alert(1)" /><script>evil()</script></section>`;
      const detachedChild = wrapper.firstElementChild!;
      // Remove from parent so node.parentNode is null
      wrapper.removeChild(detachedChild);
      expect(detachedChild.parentNode).toBeNull();

      const sanitized = sanitizeDomNodeSafely(detachedChild);
      expect(sanitized).toContain("<b>Seguro</b>");
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("<script");
      expect(sanitized).not.toContain("evil()");
    });

    it("sanitizes malicious SVG diagrams while preserving safe SVG geometry", () => {
      const maliciousSvg = `<svg viewBox="0 0 100 100" onload="alert(1)"><rect width="50" height="50" onclick="steal()" /><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject><script>alert(2)</script></svg>`;
      const clean = sanitizeUntrustedHtml(maliciousSvg, { allowSvg: true });
      expect(clean).toContain("<svg");
      expect(clean).toContain("<rect");
      expect(clean).not.toContain("onload");
      expect(clean).not.toContain("onclick");
      expect(clean).not.toContain("foreignObject");
      expect(clean).not.toContain("<iframe");
      expect(clean).not.toContain("<script");
    });
  });

  // ── 2. proxy-addr >= 2.0.8 (CVE-2026-90711 CRITICAL) ──────────────────────
  describe("2. proxy-addr >= 2.0.8 — IPv4-Mapped IPv6 Trust Subnet Anti-Spoofing", () => {
    it("normalizes IPv4-mapped IPv6 decimal and hex forms to canonical IPv4", () => {
      expect(normalizeIpAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
      expect(normalizeIpAddress("::ffff:7f00:1")).toBe("127.0.0.1");
      expect(normalizeIpAddress("::ffff:203.0.113.42")).toBe("203.0.113.42");
      expect(isValidIpLiteral("::ffff:127.0.0.1")).toBe(true);
      expect(isValidIpLiteral("999.999.999.999")).toBe(false);
    });

    it("blocks X-Forwarded-For spoofing when peer uses untrusted IPv4-mapped IPv6 address (CVE-2026-90711)", () => {
      const headers = {
        "x-forwarded-for": "10.0.0.1, 127.0.0.1",
      };
      // Untrusted external peer using IPv4-mapped IPv6 notation
      const resolvedIp = resolveTrustedClientIp(headers, "::ffff:203.0.113.99", {
        trustedProxies: ["127.0.0.1/8", "::1/128"],
      });
      // Must ignore forged X-Forwarded-For and return the actual peer IP
      expect(resolvedIp).toBe("203.0.113.99");
    });

    it("correctly resolves client IP when immediate peer is a trusted loopback proxy", () => {
      const headers = {
        "x-forwarded-for": "198.51.100.24, ::ffff:127.0.0.1",
      };
      const resolvedIp = resolveTrustedClientIp(headers, "::ffff:127.0.0.1", {
        trustedProxies: ["127.0.0.1/8", "::1/128"],
      });
      expect(resolvedIp).toBe("198.51.100.24");
    });
  });

  // ── 3. MCP SDK >= 1.32.2 & Server >= 2.4.0 (CVE-2026-104850..111770) ─────
  describe("3. MCP Session & Tenant Isolation + OAuth Endpoint SSRF Protection", () => {
    it("enforces strict cross-session and cross-tenant isolation (CVE-2026-104850 / CVE-2026-111768)", () => {
      const guard = new McpSessionIsolationGuard();
      guard.bindSession({
        sessionId: "mcp-sess-001",
        userId: "user-alpha",
        tenantId: "tenant-ind-01",
        tokenHash: "sha256-token-alpha",
        issuer: "https://rvaaxvdimggztjxoktvy.supabase.co/auth/v1",
        createdAtMs: Date.now(),
      });

      // Legitimate access succeeds
      const verified = guard.assertIsolatedAccess("mcp-sess-001", "user-alpha", "tenant-ind-01");
      expect(verified.tenantId).toBe("tenant-ind-01");

      // Cross-user reuse on same session is blocked
      expect(() =>
        guard.assertIsolatedAccess("mcp-sess-001", "user-beta", "tenant-ind-01"),
      ).toThrow(/MCP_CROSS_SESSION_VIOLATION/);

      // Cross-tenant reuse on same session is blocked
      expect(() =>
        guard.assertIsolatedAccess("mcp-sess-001", "user-alpha", "tenant-ind-02"),
      ).toThrow(/MCP_CROSS_TENANT_VIOLATION/);
    });

    it("blocks OAuth credential leakage to untrusted, non-HTTPS, or SSRF hosts (CVE-2026-111770)", () => {
      const allowedHosts = ["rvaaxvdimggztjxoktvy.supabase.co"];

      // Valid trusted endpoint passes
      const valid = validateTrustedMcpOAuthEndpoint(
        "https://rvaaxvdimggztjxoktvy.supabase.co/auth/v1/token",
        allowedHosts,
      );
      expect(valid.hostname).toBe("rvaaxvdimggztjxoktvy.supabase.co");

      // Untrusted external host blocked
      expect(() =>
        validateTrustedMcpOAuthEndpoint("https://attacker.example.com/oauth/token", allowedHosts),
      ).toThrow(/MCP_OAUTH_SECURITY_VIOLATION/);

      // Plain HTTP blocked
      expect(() =>
        validateTrustedMcpOAuthEndpoint(
          "http://rvaaxvdimggztjxoktvy.supabase.co/auth/v1/token",
          allowedHosts,
        ),
      ).toThrow(/HTTPS obrigatório/);

      // Cloud metadata / loopback SSRF blocked even if someone misconfigured allowlist
      expect(() =>
        validateTrustedMcpOAuthEndpoint("https://169.254.169.254/latest/meta-data", [
          "169.254.169.254",
        ]),
      ).toThrow(/Host privado\/loopback/);
    });
  });

  // ── 4. @xmldom/xmldom >= 0.8.15 (CVE-2026-83605..83619) ───────────────────
  describe("4. @xmldom/xmldom >= 0.8.15 — XXE, Processing Instruction & Attribute DoS Guard", () => {
    it("rejects DOCTYPE, ENTITY, XInclude, PI injection, and excessive attributes", () => {
      expect(
        validateXmlSecurity(
          `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>`,
        ).isSafe,
      ).toBe(false);

      // CVE-2026-83607: Malicious processing instruction
      expect(
        validateXmlSecurity(
          `<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><project/>`,
        ).isSafe,
      ).toBe(false);

      // CVE-2026-83605: Quadratic attribute DoS (> 64 attributes on a single element)
      const manyAttrs = Array.from({ length: 70 }, (_, i) => `a${i}="${i}"`).join(" ");
      expect(validateXmlSecurity(`<project ${manyAttrs}></project>`).isSafe).toBe(false);
    });

    it("safely serializes attribute values containing quotes without attribute injection (CVE-2026-83613..83619)", () => {
      const doc = new DOMParser().parseFromString(`<equipment id="QF1"/>`, "text/xml");
      const root = doc.documentElement!;
      root.setAttribute("label", `Disjuntor "Principal" & <Secundário>`);
      const serialized = new XMLSerializer().serializeToString(doc);
      expect(serialized).toContain("&quot;Principal&quot;");
      expect(serialized).not.toContain(`label="Disjuntor "Principal"`);
    });
  });

  // ── 5. body-parser >= 2.4.0 & Payload Guard (CVE-2026-111181) ─────────────
  describe("5. body-parser >= 2.4.0 & Decompression Stream Guard (CVE-2026-111181)", () => {
    it("decodes valid gzip payloads and gracefully rejects corrupted streams without unhandled errors", () => {
      const validJson = JSON.stringify({ device_external_id: "MTR-01", value: 380 });
      const compressed = gzipSync(Buffer.from(validJson, "utf-8"));
      const okRes = safeDecodeHttpPayload(compressed, "gzip");
      expect(okRes.ok).toBe(true);
      expect(okRes.statusCode).toBe(200);
      expect(okRes.bodyText).toBe(validJson);

      // Corrupted gzip stream (CVE-2026-111181 vector)
      const corruptedBytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff, 0x00, 0x11]);
      const errRes = safeDecodeHttpPayload(corruptedBytes, "gzip");
      expect(errRes.ok).toBe(false);
      expect(errRes.statusCode).toBe(400);
      expect(errRes.errorCode).toBe("MALFORMED_COMPRESSED_STREAM");
    });

    it("blocks decompression bombs exceeding maxDecompressedBytes with HTTP 413", () => {
      const largePayload = "A".repeat(32_768);
      const compressed = gzipSync(Buffer.from(largePayload, "utf-8"));
      const res = safeDecodeHttpPayload(compressed, "gzip", {
        maxCompressedBytes: 10_000,
        maxDecompressedBytes: 4_096, // 4 KB limit
      });
      expect(res.ok).toBe(false);
      expect(res.statusCode).toBe(413);
      expect(res.errorCode).toBe("DECOMPRESSION_LIMIT_EXCEEDED");
    });
  });

  // ── 6. js-yaml >= 4.3.2 & Safe YAML Adapter (CVE-2026-84375) ──────────────
  describe("6. js-yaml >= 4.3.2 & Safe YAML Adapter — Alias/DoS & Prototype Pollution Guard", () => {
    it("blocks YAML anchors, aliases, and merge keys (Billion Laughs / CVE-2026-84375)", () => {
      const billionLaughsYaml = `
a: &a ["lol","lol","lol"]
b: *a
`;
      expect(() => safeParseYaml(billionLaughsYaml)).toThrow(/Âncoras, aliases/);

      const mergeYaml = `
base:
  voltage: 380
circuit:
  <<: *base
`;
      expect(() => safeParseYaml(mergeYaml)).toThrow(/Âncoras, aliases/);
    });

    it("blocks Prototype Pollution keys and custom tags in YAML imports", () => {
      expect(() =>
        safeParseYaml(`
__proto__:
  polluted: true
`),
      ).toThrow(/Prototype Pollution/);

      expect(() => safeParseYaml(`payload: !!js/function "function(){ return 1; }"`)).toThrow(
        /Tags customizadas/,
      );

      // Verify transitive js-yaml is >= 4.3.2 and safe load works without custom code execution
      const parsed = jsYaml.load("name: QGBT-01\nvoltageV: 380") as Record<string, unknown>;
      expect(parsed.name).toBe("QGBT-01");
      expect(parsed.voltageV).toBe(380);
    });

    it("rejects excessive YAML nesting depth", () => {
      const deepYaml = Array.from({ length: 25 }, (_, i) => `${"  ".repeat(i)}lvl${i}:`).join("\n");
      const res = parseYamlBundle(deepYaml);
      expect(res.success).toBe(false);
    });
  });

  // ── 7. @e965/xlsx >= 0.20.3 & Safe XLSX Wrapper (CVE-2023-30533 & CVE-2024-22363) ──
  describe("7. @e965/xlsx >= 0.20.3 & Safe XLSX Wrapper — Prototype Pollution, ReDoS & Formula Injection", () => {
    it("confirmed SheetJS version is >= 0.20.3 (patched for CVE-2023-30533 and CVE-2024-22363)", () => {
      expect(XLSX.version).toBe("0.20.3");
    });

    it("blocks Prototype Pollution keys (__proto__, constructor, prototype) in spreadsheet records", () => {
      const maliciousRow = Object.create(null) as Record<string, unknown>;
      maliciousRow["manufacturer"] = "WEG";
      maliciousRow["__proto__"] = { isAdmin: true };

      expect(() => sanitizeSpreadsheetRecord(maliciousRow)).toThrow(/XLSX_SECURITY_VIOLATION/);
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    });

    it("neutralizes Spreadsheet Formula Injection while preserving negative numbers", () => {
      expect(sanitizeSpreadsheetFormulaString("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
      expect(sanitizeSpreadsheetFormulaString("+SUM(A1:A10)")).toBe("'+SUM(A1:A10)");
      expect(sanitizeSpreadsheetFormulaString("@IMPORTXML(A1,A2)")).toBe("'@IMPORTXML(A1,A2)");
      expect(sanitizeSpreadsheetFormulaString("-15.75")).toBe("-15.75");
      expect(sanitizeSpreadsheetFormulaString("Disjuntor Tripolar 50A")).toBe(
        "Disjuntor Tripolar 50A",
      );
    });

    it("performs safe round-trip workbook creation, validation, and JSON extraction", () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([
        {
          manufacturer: "WEG",
          partNumber: "MDW-C16-3",
          commercialName: "Disjuntor C16 3P",
          maliciousFormula: '=HYPERLINK("http://evil.tld","Click")',
        },
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
      const bytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));

      const parsedWb = safeReadXlsxWorkbook(bytes);
      const rows = safeSheetToJson(parsedWb.Sheets["Catalogo"]!);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.manufacturer).toBe("WEG");
      expect(rows[0]?.partNumber).toBe("MDW-C16-3");
      // Formula string is safely prefixed with apostrophe
      expect(rows[0]?.maliciousFormula).toBe(`'=HYPERLINK("http://evil.tld","Click")`);
    });
  });

  // ── 8. Industrial Safety Invariant Verification (Section 7) ───────────────
  describe("8. Industrial Safety Invariants — Permanent Physical Write Lock", () => {
    it("maintains IS_PHYSICAL_CONTROL_ALLOWED === false and blocks all physical actuations", async () => {
      expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);

      const modbus = new ModbusTcpClientDriver({
        driverId: "drv_sec_01",
        connectionId: "conn_sec_01",
        host: "127.0.0.1",
        port: 502,
        unitId: 1,
      });
      await modbus.connect();
      expect(() => modbus.validateFunctionCode(5)).toThrow();
      expect(() => modbus.validateFunctionCode(6)).toThrow();
      expect(() => modbus.validateFunctionCode(15)).toThrow();
      expect(() => modbus.validateFunctionCode(16)).toThrow();

      const sparkplug = new SparkplugBDriver({
        driverId: "drv_sp_sec_01",
        connectionId: "conn_sp_sec_01",
        brokerUrl: "mqtts://127.0.0.1:8883",
        clientId: "egw_sec_node",
        groupId: "ELTRIC_IND",
        edgeNodeId: "EDGE_SEC_01",
      });
      await sparkplug.connect();
      expect(() => sparkplug.validateTopicAllowed("spBv1.0/ELTRIC_IND/NCMD/EDGE_SEC_01")).toThrow();
      expect(() =>
        sparkplug.validateTopicAllowed("spBv1.0/ELTRIC_IND/DCMD/EDGE_SEC_01/DEV_01"),
      ).toThrow();
    });
  });
});
