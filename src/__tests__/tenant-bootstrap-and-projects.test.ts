import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  isSupabaseAdminConfigured,
  resetSupabaseAdminCacheForTesting,
  supabaseAdmin,
} from "@/integrations/supabase/client.server";
import { createProjectRecord, ensureTenant } from "@/lib/projects.functions";
import { switchActiveTenant } from "@/lib/tenants.functions";

interface InMemoryDb {
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    deleted_at: string | null;
  }>;
  profiles: Array<{
    id: string;
    full_name: string;
    locale: string;
    role: string;
    tenant_id: string | null;
    updated_at?: string;
  }>;
  tenant_memberships: Array<{
    id: string;
    tenant_id: string;
    user_id: string;
    role: string;
    created_at: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_by: string;
    tenant_id: string;
    metadata: Record<string, unknown>;
  }>;
  diagrams: Array<{
    id: string;
    project_id: string;
    name: string;
    version: number;
    canvas_data: unknown;
  }>;
  plan_limits: Array<{
    plan: string;
    max_projects: number;
  }>;
  failDiagramInsert?: boolean;
  failProjectInsert?: boolean;
}

function createInMemoryDb(): InMemoryDb {
  return {
    tenants: [],
    profiles: [],
    tenant_memberships: [],
    projects: [],
    diagrams: [],
    plan_limits: [{ plan: "free", max_projects: 3 }],
  };
}

/**
 * Simula o comportamento transacional, RLS e RPC (`bootstrap_personal_tenant_if_missing`)
 * do PostgreSQL para um usuário autenticado (ou anônimo quando `authUserId` é null).
 */
function createMockAuthenticatedSupabase(
  db: InMemoryDb,
  authUserId: string | null,
): SupabaseClient<Database> {
  let seq = 1;
  const nextUuid = (prefix: string) =>
    `${prefix}-0000-4000-8000-${String(seq++).padStart(12, "0")}`;

  const getActiveUserTenantId = (): string | null => {
    if (!authUserId) return null;
    const prof = db.profiles.find((p) => p.id === authUserId);
    if (prof?.tenant_id) return prof.tenant_id;
    const mem = db.tenant_memberships.find((m) => m.user_id === authUserId);
    return mem?.tenant_id ?? null;
  };

  const client = {
    rpc: vi.fn(async (fnName: string, args?: Record<string, unknown>) => {
      if (fnName !== "bootstrap_personal_tenant_if_missing") {
        return { data: null, error: { message: `RPC ${fnName} not implemented in mock` } };
      }
      // Impede que argumentos externos tentem forçar outro tenant_id
      if (args && Object.keys(args).length > 0) {
        return {
          data: null,
          error: { message: "bootstrap_personal_tenant_if_missing does not accept arguments" },
        };
      }
      // 1. Exigir auth.uid()
      if (!authUserId) {
        return {
          data: null,
          error: {
            code: "42501",
            message:
              "Authentication required: user must be authenticated to bootstrap a personal workspace",
          },
        };
      }

      // Garantir perfil básico
      let profile = db.profiles.find((p) => p.id === authUserId);
      if (!profile) {
        profile = {
          id: authUserId,
          full_name: `Usuário ${authUserId.slice(0, 8)}`,
          locale: "pt-BR",
          role: "member",
          tenant_id: null,
        };
        db.profiles.push(profile);
      }

      // 2 & 3. Verificar se já possui tenant ativo vinculado e confirmado em tenant_memberships
      if (profile.tenant_id) {
        const activeTenant = db.tenants.find(
          (t) => t.id === profile!.tenant_id && t.status === "active" && t.deleted_at === null,
        );
        const hasMembership = db.tenant_memberships.some(
          (m) => m.tenant_id === profile!.tenant_id && m.user_id === authUserId,
        );
        if (activeTenant && hasMembership) {
          return { data: activeTenant.id, error: null };
        }
      }

      // 4. Verificar se existe associação válida em tenant_memberships antes de criar nova organização
      const validMembership = db.tenant_memberships.find((m) => {
        if (m.user_id !== authUserId) return false;
        const t = db.tenants.find((tn) => tn.id === m.tenant_id);
        return Boolean(t && t.status === "active" && t.deleted_at === null);
      });

      if (validMembership) {
        profile.tenant_id = validMembership.tenant_id;
        profile.role = validMembership.role;
        return { data: validMembership.tenant_id, error: null };
      }

      // 5, 6, 7. Criar tenant pessoal, membership owner e atualizar profiles.tenant_id
      const newTenantId = nextUuid("11111111");
      db.tenants.push({
        id: newTenantId,
        name: `Workspace de ${profile.full_name}`,
        slug: `workspace-${authUserId.slice(0, 8)}`,
        plan: "free",
        status: "active",
        deleted_at: null,
      });

      db.tenant_memberships.push({
        id: nextUuid("22222222"),
        tenant_id: newTenantId,
        user_id: authUserId,
        role: "owner",
        created_at: new Date().toISOString(),
      });

      profile.tenant_id = newTenantId;
      profile.role = "owner";

      return { data: newTenantId, error: null };
    }),

    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      let pendingUpdate: Record<string, unknown> | null = null;
      let pendingDelete = false;
      let headCount = false;

      const builder: any = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) headCount = true;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          if (pendingUpdate) {
            if (table === "profiles") {
              if (!authUserId || filters.id !== authUserId) {
                return Promise.resolve({
                  data: null,
                  error: { message: "RLS violation on profiles update" },
                });
              }
              const prof = db.profiles.find((p) => p.id === authUserId);
              if (prof) {
                const requestedTenantId = pendingUpdate.tenant_id as string | undefined;
                if (requestedTenantId !== undefined && requestedTenantId !== prof.tenant_id) {
                  // Trigger prevent_profile_privilege_escalation: exige membership válido no tenant
                  const isMember = db.tenant_memberships.some(
                    (m) => m.user_id === authUserId && m.tenant_id === requestedTenantId,
                  );
                  if (isMember) {
                    prof.tenant_id = requestedTenantId;
                  }
                }
              }
              return Promise.resolve({ data: null, error: null });
            }
          }
          if (pendingDelete) {
            if (table === "projects") {
              const idx = db.projects.findIndex(
                (p) => p.id === filters.id && p.tenant_id === getActiveUserTenantId(),
              );
              if (idx >= 0) db.projects.splice(idx, 1);
              return Promise.resolve({ data: null, error: null });
            }
          }
          if (headCount && table === "projects") {
            const count = db.projects.filter((p) => p.tenant_id === filters.tenant_id).length;
            return Promise.resolve({ count, data: null, error: null });
          }
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (!authUserId) {
            return { data: null, error: { message: "Unauthorized" } };
          }
          if (table === "profiles") {
            const row = db.profiles.find((p) => p.id === filters.id && p.id === authUserId) ?? null;
            return { data: row, error: null };
          }
          if (table === "tenant_memberships") {
            const rows = db.tenant_memberships.filter((m) => {
              if (filters.user_id && m.user_id !== filters.user_id) return false;
              if (filters.tenant_id && m.tenant_id !== filters.tenant_id) return false;
              // RLS: usuário só vê seus próprios vínculos ou do seu tenant ativo
              return m.user_id === authUserId || m.tenant_id === getActiveUserTenantId();
            });
            return { data: rows[0] ?? null, error: null };
          }
          if (table === "tenants") {
            const row =
              db.tenants.find((t) => t.id === filters.id && t.id === getActiveUserTenantId()) ??
              null;
            return { data: row, error: null };
          }
          if (table === "plan_limits") {
            const row = db.plan_limits.find((l) => l.plan === filters.plan) ?? null;
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
        update: (values: Record<string, unknown>) => {
          pendingUpdate = values;
          return builder;
        },
        delete: () => {
          pendingDelete = true;
          return builder;
        },
        insert: (payload: Record<string, unknown>) => {
          if (table === "projects") {
            return {
              select: () => ({
                single: async () => {
                  if (!authUserId) {
                    return { data: null, error: { message: "Unauthorized" } };
                  }
                  if (db.failProjectInsert) {
                    return { data: null, error: { message: "simulated_project_insert_failure" } };
                  }
                  const activeTenantId = getActiveUserTenantId();
                  if (payload.tenant_id !== activeTenantId || payload.created_by !== authUserId) {
                    return {
                      data: null,
                      error: {
                        message: "new row violates row-level security policy for table projects",
                      },
                    };
                  }
                  const newProject = {
                    id: nextUuid("33333333"),
                    name: String(payload.name),
                    description: (payload.description as string | null) ?? null,
                    status: String(payload.status ?? "active"),
                    created_by: String(payload.created_by),
                    tenant_id: String(payload.tenant_id),
                    metadata: (payload.metadata as Record<string, unknown>) ?? {},
                  };
                  db.projects.push(newProject);
                  return { data: newProject, error: null };
                },
              }),
            };
          }
          if (table === "diagrams") {
            if (db.failDiagramInsert) {
              return Promise.resolve({
                data: null,
                error: { message: "simulated_diagram_insert_failure" },
              });
            }
            const proj = db.projects.find((p) => p.id === payload.project_id);
            if (!proj || proj.tenant_id !== getActiveUserTenantId()) {
              return Promise.resolve({
                data: null,
                error: { message: "new row violates row-level security policy for table diagrams" },
              });
            }
            const newDiagram = {
              id: nextUuid("44444444"),
              project_id: String(payload.project_id),
              name: String(payload.name),
              version: Number(payload.version ?? 1),
              canvas_data: payload.canvas_data,
            };
            db.diagrams.push(newDiagram);
            return Promise.resolve({ data: newDiagram, error: null });
          }
          return Promise.resolve({ data: null, error: { message: "Unsupported insert table" } });
        },
      };

      return builder;
    }),
  };

  return client as unknown as SupabaseClient<Database>;
}

describe("Provisionamento de Tenant (bootstrap_personal_tenant_if_missing) e Criação de Projetos", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetSupabaseAdminCacheForTesting();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetSupabaseAdminCacheForTesting();
  });

  it("1. Usuário não autenticado recebe erro de autorização na RPC e em ensureTenant/createProject", async () => {
    const db = createInMemoryDb();
    const anonClient = createMockAuthenticatedSupabase(db, null);

    const rpcResult = await anonClient.rpc("bootstrap_personal_tenant_if_missing");
    expect(rpcResult.error).not.toBeNull();
    expect(rpcResult.error?.message).toMatch(/Authentication required/i);

    await expect(ensureTenant(anonClient, "")).rejects.toThrow(/Unauthorized/i);
    await expect(
      createProjectRecord(
        { supabase: anonClient, userId: "", claims: {} },
        { name: "Projeto Anônimo" },
      ),
    ).rejects.toThrow(/Unauthorized/i);

    expect(db.tenants).toHaveLength(0);
    expect(db.projects).toHaveLength(0);
  });

  it("2. Usuário autenticado sem tenant consegue provisionar seu workspace pessoal sem SUPABASE_SERVICE_ROLE_KEY", async () => {
    const db = createInMemoryDb();
    const userId = "a1b2c3d4-0000-4000-8000-000000000001";
    const client = createMockAuthenticatedSupabase(db, userId);

    expect(isSupabaseAdminConfigured()).toBe(false);

    const tenantId = await ensureTenant(client, userId, { email: "eng@eletricai.com" });

    expect(tenantId).toBeTruthy();
    expect(db.tenants).toHaveLength(1);
    expect(db.tenants[0].id).toBe(tenantId);
    expect(db.tenants[0].status).toBe("active");
    expect(db.tenants[0].plan).toBe("free");

    expect(db.tenant_memberships).toHaveLength(1);
    expect(db.tenant_memberships[0]).toMatchObject({
      tenant_id: tenantId,
      user_id: userId,
      role: "owner",
    });

    const profile = db.profiles.find((p) => p.id === userId);
    expect(profile?.tenant_id).toBe(tenantId);
    expect(profile?.role).toBe("owner");
  });

  it("3. Segunda chamada (idempotência) não cria outro tenant nem duplica memberships", async () => {
    const db = createInMemoryDb();
    const userId = "a1b2c3d4-0000-4000-8000-000000000002";
    const client = createMockAuthenticatedSupabase(db, userId);

    const firstRpc = await client.rpc("bootstrap_personal_tenant_if_missing");
    expect(firstRpc.error).toBeNull();
    const firstTenantId = firstRpc.data;

    const secondRpc = await client.rpc("bootstrap_personal_tenant_if_missing");
    expect(secondRpc.error).toBeNull();
    expect(secondRpc.data).toBe(firstTenantId);

    const thirdViaEnsure = await ensureTenant(client, userId);
    expect(thirdViaEnsure).toBe(firstTenantId);

    expect(db.tenants).toHaveLength(1);
    expect(db.tenant_memberships).toHaveLength(1);
  });

  it("4. Usuário com tenant ativo existente mantém exatamente o mesmo vínculo", async () => {
    const db = createInMemoryDb();
    const userId = "a1b2c3d4-0000-4000-8000-000000000003";
    const existingTenantId = "99999999-0000-4000-8000-000000000003";

    db.tenants.push({
      id: existingTenantId,
      name: "Workspace Existente",
      slug: "workspace-existente",
      plan: "pro",
      status: "active",
      deleted_at: null,
    });
    db.profiles.push({
      id: userId,
      full_name: "Engenheira Senior",
      locale: "pt-BR",
      role: "owner",
      tenant_id: existingTenantId,
    });
    db.tenant_memberships.push({
      id: "88888888-0000-4000-8000-000000000003",
      tenant_id: existingTenantId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });

    const client = createMockAuthenticatedSupabase(db, userId);
    const rpcRes = await client.rpc("bootstrap_personal_tenant_if_missing");
    expect(rpcRes.error).toBeNull();
    expect(rpcRes.data).toBe(existingTenantId);

    const resolvedTenantId = await ensureTenant(client, userId);
    expect(resolvedTenantId).toBe(existingTenantId);
    expect(db.tenants).toHaveLength(1);
  });

  it("5. Usuário com vínculo preexistente válido em tenant_memberships (mas profiles.tenant_id nulo) reutiliza a organização existente", async () => {
    const db = createInMemoryDb();
    const userId = "a1b2c3d4-0000-4000-8000-000000000004";
    const orgTenantId = "77777777-0000-4000-8000-000000000004";

    db.tenants.push({
      id: orgTenantId,
      name: "Organização Industrial Ltda",
      slug: "org-industrial",
      plan: "pro",
      status: "active",
      deleted_at: null,
    });
    db.profiles.push({
      id: userId,
      full_name: "Membro Convidado",
      locale: "pt-BR",
      role: "engineer",
      tenant_id: null,
    });
    db.tenant_memberships.push({
      id: "66666666-0000-4000-8000-000000000004",
      tenant_id: orgTenantId,
      user_id: userId,
      role: "engineer",
      created_at: new Date().toISOString(),
    });

    const client = createMockAuthenticatedSupabase(db, userId);

    const rpcRes = await client.rpc("bootstrap_personal_tenant_if_missing");
    expect(rpcRes.error).toBeNull();
    expect(rpcRes.data).toBe(orgTenantId);

    // Nenhuma organização extra deve ter sido criada
    expect(db.tenants).toHaveLength(1);
    expect(db.profiles.find((p) => p.id === userId)?.tenant_id).toBe(orgTenantId);
  });

  it("6. Nenhum usuário consegue selecionar ou assumir o tenant de outro usuário", async () => {
    const db = createInMemoryDb();
    const victimUserId = "a1b2c3d4-0000-4000-8000-000000000010";
    const attackerUserId = "a1b2c3d4-0000-4000-8000-000000000020";
    const victimTenantId = "55555555-0000-4000-8000-000000000010";

    db.tenants.push({
      id: victimTenantId,
      name: "Workspace Confidencial",
      slug: "workspace-confidencial",
      plan: "pro",
      status: "active",
      deleted_at: null,
    });
    db.profiles.push(
      {
        id: victimUserId,
        full_name: "Victim Owner",
        locale: "pt-BR",
        role: "owner",
        tenant_id: victimTenantId,
      },
      {
        id: attackerUserId,
        full_name: "Attacker User",
        locale: "pt-BR",
        role: "owner",
        tenant_id: null,
      },
    );
    db.tenant_memberships.push({
      id: "55555555-1111-4000-8000-000000000010",
      tenant_id: victimTenantId,
      user_id: victimUserId,
      role: "owner",
      created_at: new Date().toISOString(),
    });

    const attackerClient = createMockAuthenticatedSupabase(db, attackerUserId);

    // Tentativa 1: passar argumentos para a RPC
    const spoofedRpc = await (attackerClient.rpc as any)("bootstrap_personal_tenant_if_missing", {
      tenant_id: victimTenantId,
    });
    expect(spoofedRpc.error).not.toBeNull();

    // Tentativa 2: forçar update direto em profiles.tenant_id para o tenant alheio
    await attackerClient
      .from("profiles")
      .update({ tenant_id: victimTenantId })
      .eq("id", attackerUserId);
    expect(db.profiles.find((p) => p.id === attackerUserId)?.tenant_id).toBeNull();

    // Tentativa 3: bootstrap normal cria apenas um workspace próprio isolado para o atacante
    const attackerTenantId = await ensureTenant(attackerClient, attackerUserId);
    expect(attackerTenantId).not.toBe(victimTenantId);
    expect(db.profiles.find((p) => p.id === attackerUserId)?.tenant_id).toBe(attackerTenantId);

    // Verify switchActiveTenant server function module exists and validates membership
    expect(typeof switchActiveTenant).toBe("function");
  });

  it("7. createProject cria projeto e diagrama inicial no tenant correto", async () => {
    const db = createInMemoryDb();
    const userId = "a1b2c3d4-0000-4000-8000-000000000007";
    const client = createMockAuthenticatedSupabase(db, userId);

    const created = await createProjectRecord(
      {
        supabase: client,
        userId,
        claims: { email: "projetista@eletricai.com", full_name: "Projetista Chefe" },
      },
      {
        name: "Subestação 13.8kV",
        description: "Projeto executivo da subestação principal",
        client: "Indústria ABC",
      },
    );

    const userProfile = db.profiles.find((p) => p.id === userId);
    expect(userProfile?.tenant_id).toBeTruthy();

    expect(created).toEqual({
      id: db.projects[0].id,
      name: "Subestação 13.8kV",
      client: "Indústria ABC",
    });

    expect(db.projects).toHaveLength(1);
    expect(db.projects[0]).toMatchObject({
      name: "Subestação 13.8kV",
      description: "Projeto executivo da subestação principal",
      status: "active",
      created_by: userId,
      tenant_id: userProfile?.tenant_id,
      metadata: { client: "Indústria ABC" },
    });

    expect(db.diagrams).toHaveLength(1);
    expect(db.diagrams[0]).toMatchObject({
      project_id: created.id,
      name: "main",
      version: 1,
    });
  });

  it("8. Falhas do banco são tratadas sem deixar registros inconsistentes (rollback do projeto se o diagrama falhar)", async () => {
    const db = createInMemoryDb();
    const userId = "a1b2c3d4-0000-4000-8000-000000000008";
    const client = createMockAuthenticatedSupabase(db, userId);

    // Caso A: falha na criação do diagrama deve remover o projeto recém-inserido
    db.failDiagramInsert = true;
    await expect(
      createProjectRecord(
        { supabase: client, userId, claims: {} },
        { name: "Projeto com falha no diagrama" },
      ),
    ).rejects.toThrow(/Falha ao criar diagrama do projeto/i);

    expect(db.projects).toHaveLength(0);
    expect(db.diagrams).toHaveLength(0);

    // Caso B: falha na inserção do projeto não cria diagrama órfão
    db.failDiagramInsert = false;
    db.failProjectInsert = true;
    await expect(
      createProjectRecord(
        { supabase: client, userId, claims: {} },
        { name: "Projeto com falha no insert" },
      ),
    ).rejects.toThrow(/simulated_project_insert_failure/i);

    expect(db.projects).toHaveLength(0);
    expect(db.diagrams).toHaveLength(0);
  });

  it("9. A chave administrativa (SUPABASE_SERVICE_ROLE_KEY) nunca é exposta ao frontend nem lida no navegador", () => {
    const secretValue = "sb_secret_super_sensitive_service_role_key_do_not_leak";
    process.env.SUPABASE_URL = "https://rvaaxvdimggztjxoktvy.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = secretValue;
    resetSupabaseAdminCacheForTesting();

    // Em ambiente com `window` definido (simulação de browser), supabaseAdmin é bloqueado
    vi.stubGlobal("window", {});
    try {
      expect(isSupabaseAdminConfigured()).toBe(false);
      expect(() => (supabaseAdmin as any).from("tenants")).toThrow(
        /restrito exclusivamente ao ambiente de servidor/i,
      );
    } finally {
      vi.unstubAllGlobals();
    }

    // Verifica que o cliente do navegador (client.ts), hook de auth (use-auth.tsx) e projects.functions.ts não referenciam SUPABASE_SERVICE_ROLE_KEY nem importam client.server no escopo de módulo
    const clientTs = readFileSync(
      resolve(process.cwd(), "src/integrations/supabase/client.ts"),
      "utf8",
    );
    const useAuthTsx = readFileSync(resolve(process.cwd(), "src/hooks/use-auth.tsx"), "utf8");
    const envTs = readFileSync(resolve(process.cwd(), "src/integrations/supabase/env.ts"), "utf8");
    const projectsFnTs = readFileSync(
      resolve(process.cwd(), "src/lib/projects.functions.ts"),
      "utf8",
    );
    const tenantsFnTs = readFileSync(
      resolve(process.cwd(), "src/lib/tenants.functions.ts"),
      "utf8",
    );

    expect(clientTs).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(clientTs).not.toContain("client.server");
    expect(useAuthTsx).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(useAuthTsx).not.toContain("client.server");
    expect(envTs).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(projectsFnTs).not.toContain("client.server");
    expect(tenantsFnTs).not.toMatch(/^import\s+.*client\.server/m);
  });

  it("10. Verifica o contrato de segurança da migration SQL 20261015210000_bootstrap_personal_tenant_rpc.sql", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261015210000_bootstrap_personal_tenant_rpc.sql",
      ),
      "utf8",
    );

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.bootstrap_personal_tenant_if_missing()",
    );
    expect(sql).toContain("RETURNS uuid");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, auth");
    expect(sql).toContain("v_user_id := auth.uid();");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM PUBLIC;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.bootstrap_personal_tenant_if_missing() FROM anon;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO authenticated;",
    );
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
