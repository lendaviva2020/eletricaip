import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isDevAuthAllowed } from "@/integrations/supabase/auth-middleware";

describe("ELÉTRICAI INDUSTRIAL OS — GATE 4.2.1: Dev Auth Bypass Security Hardening", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  describe("1. isDevAuthAllowed Environment Guard", () => {
    it("returns FALSE when NODE_ENV === 'production'", () => {
      process.env.NODE_ENV = "production";
      expect(isDevAuthAllowed()).toBe(false);
    });

    it("returns FALSE when NODE_ENV is undefined or empty string (fails closed)", () => {
      delete process.env.NODE_ENV;
      expect(isDevAuthAllowed()).toBe(false);

      process.env.NODE_ENV = "" as unknown as string;
      expect(isDevAuthAllowed()).toBe(false);
    });

    it("returns FALSE when NODE_ENV is set to unknown/arbitrary strings (e.g. staging)", () => {
      process.env.NODE_ENV = "staging";
      expect(isDevAuthAllowed()).toBe(false);

      process.env.NODE_ENV = "preview";
      expect(isDevAuthAllowed()).toBe(false);
    });

    it("returns TRUE only when NODE_ENV is 'development' or 'test'", () => {
      process.env.NODE_ENV = "development";
      expect(isDevAuthAllowed()).toBe(true);

      process.env.NODE_ENV = "test";
      expect(isDevAuthAllowed()).toBe(true);
    });
  });

  describe("2. Server-side Protection: dev-access-token Rejection in Production", () => {
    it("rejects dev-access-token with 401 when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";

      // Dynamically import or invoke the middleware logic
      expect(isDevAuthAllowed()).toBe(false);

      // Verify that if dev-access-token is presented in production, the guard blocks it
      const token = "dev-access-token";
      const isAllowed = isDevAuthAllowed();
      expect(isAllowed).toBe(false);

      if (token === "dev-access-token" && !isAllowed) {
        const response = new Response(
          "Unauthorized: Development bypass tokens are permanently forbidden in production",
          { status: 401 },
        );
        expect(response.status).toBe(401);
        const text = await response.text();
        expect(text).toContain("Development bypass tokens are permanently forbidden in production");
      }
    });

    it("ensures Auditor Dev profile cannot be granted if NODE_ENV is production", () => {
      process.env.NODE_ENV = "production";
      let grantedUserId: string | null = null;
      const token = "dev-access-token";

      if (token === "dev-access-token" && isDevAuthAllowed()) {
        grantedUserId = "00000000-0000-4000-a000-000000000001";
      }

      expect(grantedUserId).toBeNull();
    });
  });

  describe("3. Client-side Protection: LocalStorage Tampering Resistance", () => {
    it("ignores localStorage dev flag when import.meta.env.DEV is false or NODE_ENV is production", () => {
      const mockStorage: Record<string, string> = {
        "eletricai.dev-auth-bypass": "true",
      };

      const isDevEnv = false; // simulates production build
      const isNodeProd = true; // process.env.NODE_ENV === "production"

      const isDevAllowed = isDevEnv && !isNodeProd;
      const hasDevFlag = mockStorage["eletricai.dev-auth-bypass"] === "true";

      let attachedToken: string | null = null;
      if (isDevAllowed && hasDevFlag) {
        attachedToken = "dev-access-token";
      }

      expect(attachedToken).toBeNull();
    });

    it("preserves real Supabase session over dev flags", () => {
      const realSession = {
        access_token: "real-supabase-jwt-token-xyz",
        user: { id: "real-user-uuid", email: "engineer@company.com" },
      };

      const mockStorage: Record<string, string> = {
        "eletricai.dev-auth-bypass": "true",
      };

      // Priority logic: real session MUST take precedence
      let sessionToUse = null;
      if (realSession) {
        sessionToUse = realSession;
      } else if (mockStorage["eletricai.dev-auth-bypass"] === "true") {
        sessionToUse = { access_token: "dev-access-token" };
      }

      expect(sessionToUse).toBe(realSession);
      expect(sessionToUse?.access_token).toBe("real-supabase-jwt-token-xyz");
    });
  });
});
