// Auditoria Fase 0 / F0.11 — a claim JWT `platform_role` sozinha não pode conceder
// PLATFORM_ADMIN na frota: o papel precisa ser confirmado no banco (is_platform_admin).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/security/security-audit-log.server", () => ({ logSecurityEvent: vi.fn() }));

import { resolveAuthenticatedFleetContext } from "@/lib/edge/fleet-auth-context.server";

const TENANT = "11111111-1111-4111-8111-111111111111";

function makeCtx(isPlatformAdminInDb: boolean | "rpc-error") {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    claims: { email: "x@example.test", platform_role: "PLATFORM_ADMIN", tenant_id: "org_x" },
    supabase: {
      rpc: async (fn: string) => {
        if (fn !== "is_platform_admin") return { data: null, error: { message: "unexpected" } };
        if (isPlatformAdminInDb === "rpc-error") return { data: null, error: { message: "boom" } };
        return { data: isPlatformAdminInDb, error: null };
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { tenant_id: TENANT }, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { role: "viewer" }, error: null }) }),
            }),
          }),
        };
      },
    },
  };
}

describe("F0.11 — PLATFORM_ADMIN da frota exige confirmação no banco", () => {
  it("claim platform_role forjada sem registro em platform_admins NÃO concede PLATFORM_ADMIN", async () => {
    const actor = await resolveAuthenticatedFleetContext(makeCtx(false));
    expect(actor.role).not.toBe("PLATFORM_ADMIN");
    expect(actor.organizationId).toBe(TENANT);
  });

  it("falha da RPC é tratada como não-admin (fail closed)", async () => {
    const actor = await resolveAuthenticatedFleetContext(makeCtx("rpc-error"));
    expect(actor.role).not.toBe("PLATFORM_ADMIN");
  });

  it("claim + confirmação no banco concede PLATFORM_ADMIN", async () => {
    const actor = await resolveAuthenticatedFleetContext(makeCtx(true));
    expect(actor.role).toBe("PLATFORM_ADMIN");
  });
});
