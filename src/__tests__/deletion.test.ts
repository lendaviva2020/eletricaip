// Testes de exclusão (LGPD Art. 18, VI) — Supabase mocado, nenhum dado real.
// Cobre: ordem mensagens→conversa, gate owner/admin antes de mutação,
// propagação de erro por etapa e gate platform-admin na eliminação de conta.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const passthrough = {
    middleware: (..._args: unknown[]) => passthrough,
    inputValidator: (..._args: unknown[]) => passthrough,
    handler: <T>(fn: T): T => fn,
  };
  return {
    createServerFn: (_opts?: unknown) => ({
      middleware: (..._args: unknown[]) => passthrough,
      inputValidator: (..._args: unknown[]) => passthrough,
      handler: <T>(fn: T): T => fn,
    }),
    createMiddleware: (_opts?: unknown) => {
      const m = {
        middleware: (..._args: unknown[]) => m,
        server: <T>(fn: T): T => fn,
      };
      return m;
    },
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => undefined,
}));

type DbResult = { data?: unknown; error: { message: string } | null };

interface FakeProgram {
  selects: Array<{ data: unknown }>;
  errors: Record<string, string | null>;
  isAdmin?: boolean;
}

function makeNode(table: string, log: string[], prog: FakeProgram) {
  const run = async (): Promise<DbResult> => {
    const key = `${node.op}:${table}`;
    log.push(key);
    const msg = prog.errors[key] ?? null;
    if (node.op === "select") {
      const next = prog.selects.shift();
      return { data: next ? next.data : null, error: msg ? { message: msg } : null };
    }
    return { error: msg ? { message: msg } : null };
  };
  const node = {
    op: "",
    select: () => {
      node.op = "select";
      return node;
    },
    delete: () => {
      node.op = "delete";
      return node;
    },
    update: () => {
      node.op = "update";
      return node;
    },
    insert: () => {
      node.op = "insert";
      return node;
    },
    eq: (_c?: unknown, _v?: unknown) => node,
    in: (_c?: unknown, _v?: unknown) => node,
    order: (_c?: unknown, _o?: unknown) => node,
    maybeSingle: () => run(),
    single: () => run(),
    then: <TResult1, TResult2>(
      onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null | undefined,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
    ): PromiseLike<TResult1 | TResult2> => run().then(onfulfilled, onrejected),
  };
  return node;
}

function makeUserDb(log: string[], prog: FakeProgram) {
  return {
    from: (table: string) => makeNode(table, log, prog),
    rpc: async (fn: string) => {
      log.push(`rpc:${fn}`);
      return { data: prog.isAdmin ?? false, error: null };
    },
  };
}

const adminState = vi.hoisted(() => ({
  log: [] as string[],
  prog: { selects: [], errors: {}, isAdmin: true } as FakeProgram,
  deleteUserError: null as string | null,
  deletedUsers: [] as string[],
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => makeNode(table, adminState.log, adminState.prog),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          adminState.log.push(`auth.deleteUser:${id}`);
          adminState.deletedUsers.push(id);
          return {
            error: adminState.deleteUserError ? { message: adminState.deleteUserError } : null,
          };
        },
      },
    },
  },
}));

import { deleteConversation } from "@/lib/ai-chat.functions";
import { deleteProject } from "@/lib/projects.functions";
import { requestAccountDeletion, eraseUserData } from "@/lib/account-deletion.functions";

type Handler = (args: {
  data: unknown;
  context: { supabase: unknown; userId: string };
}) => Promise<unknown>;

const call = (fn: unknown, data: unknown, supabase: unknown, userId = "user-1") =>
  (fn as Handler)({ data, context: { supabase, userId } });

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  adminState.log.length = 0;
  adminState.prog.selects.length = 0;
  adminState.prog.errors = {};
  adminState.prog.isAdmin = true;
  adminState.deleteUserError = null;
  adminState.deletedUsers.length = 0;
});

describe("deleteConversation", () => {
  it("apaga mensagens antes da conversa", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, { selects: [], errors: {} });
    const res = (await call(deleteConversation, { conversationId: CONV_ID }, db)) as {
      ok: boolean;
    };
    expect(res.ok).toBe(true);
    expect(log).toEqual(["delete:ai_messages", "delete:ai_conversations"]);
  });

  it("aborta sem tocar na conversa se o delete das mensagens falha (RLS)", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, {
      selects: [],
      errors: { "delete:ai_messages": "new row violates row-level security" },
    });
    await expect(call(deleteConversation, { conversationId: CONV_ID }, db)).rejects.toThrow(
      /row-level security/,
    );
    expect(log).toEqual(["delete:ai_messages"]);
  });
});

describe("deleteProject", () => {
  const adminSelects = () => [
    { data: { id: PROJECT_ID, tenant_id: "tenant-1" } },
    { data: { role: "admin", tenant_id: "tenant-1" } },
  ];

  it("nega engineer antes de qualquer mutação", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, {
      selects: [
        { data: { id: PROJECT_ID, tenant_id: "tenant-1" } },
        { data: { role: "engineer", tenant_id: "tenant-1" } },
      ],
      errors: {},
    });
    await expect(call(deleteProject, { projectId: PROJECT_ID }, db)).rejects.toThrow(/forbidden/);
    expect(log).toEqual(["select:projects", "select:tenant_memberships"]);
  });

  it("nega projeto inexistente sem mutação", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, { selects: [{ data: null }], errors: {} });
    await expect(call(deleteProject, { projectId: PROJECT_ID }, db)).rejects.toThrow(
      /not_found_or_forbidden/,
    );
    expect(log).toEqual(["select:projects"]);
  });

  it("admin apaga filhas e por último a linha do projeto", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, { selects: adminSelects(), errors: {} });
    const res = (await call(deleteProject, { projectId: PROJECT_ID }, db)) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(log.slice(0, 2)).toEqual(["select:projects", "select:tenant_memberships"]);
    expect(log[log.length - 1]).toBe("delete:projects");
    for (const t of [
      "diagrams",
      "project_versions",
      "project_bom_items",
      "alarm_configs",
      "alarm_history",
      "simulations",
      "simulation_tags",
      "trend_configs",
      "calculations",
      "files",
      "function_block_instances",
    ]) {
      expect(log).toContain(`delete:${t}`);
    }
  });

  it("falha nomeando a tabela quando uma etapa filha erra", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, {
      selects: adminSelects(),
      errors: { "delete:project_bom_items": "boom" },
    });
    await expect(call(deleteProject, { projectId: PROJECT_ID }, db)).rejects.toThrow(
      /delete_project_bom_items_failed/,
    );
    expect(log).not.toContain("delete:projects");
  });
});

describe("requestAccountDeletion", () => {
  it("retorna duplicada sem reinserir quando já há pedido pendente", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, { selects: [{ data: { id: "req-1" } }], errors: {} });
    const res = (await call(requestAccountDeletion, { reason: "sair" }, db)) as {
      ok: boolean;
      duplicate: boolean;
    };
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(true);
    expect(log).toEqual(["select:deletion_requests"]);
  });
});

describe("eraseUserData", () => {
  it("nega chamador não-admin sem tocar em nada", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, { selects: [], errors: {}, isAdmin: false });
    await expect(call(eraseUserData, { targetUserId: TARGET_ID }, db)).rejects.toThrow(
      /platform admin/,
    );
    expect(adminState.log).toEqual([]);
    expect(adminState.deletedUsers).toEqual([]);
  });

  it("admin apaga identidade completa com relatório por etapa", async () => {
    const log: string[] = [];
    const db = makeUserDb(log, { selects: [], errors: {}, isAdmin: true });
    adminState.prog.selects.push({ data: [{ id: "c1" }, { id: "c2" }] });
    const res = (await call(eraseUserData, { targetUserId: TARGET_ID }, db)) as {
      ok: boolean;
      report: Array<{ step: string; ok: boolean }>;
    };
    expect(res.ok).toBe(true);
    expect(res.report.map((r) => r.step)).toEqual([
      "mark_processing",
      "ai_data",
      "api_keys",
      "memberships",
      "profile",
      "auth_user",
    ]);
    expect(res.report.every((r) => r.ok)).toBe(true);
    expect(adminState.deletedUsers).toEqual([TARGET_ID]);
    // mensagens apagadas antes das conversas
    const msgIdx = adminState.log.indexOf("delete:ai_messages");
    const convIdx = adminState.log.indexOf("delete:ai_conversations");
    expect(msgIdx).toBeGreaterThanOrEqual(0);
    expect(convIdx).toBeGreaterThan(msgIdx);
  });
});
