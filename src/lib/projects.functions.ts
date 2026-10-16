// Project server functions — CRUD operations for industrial projects
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";

// ── Types ──────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  client: string | null;
  updated_at: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  client: string | null;
}

export interface DiagramSnapshot {
  project: {
    nodes: Json[];
    edges: Json[];
  };
  voltai: {
    components: Json[];
    edges: Json[];
  };
}

export interface SaveResult {
  diagramId: string;
  version: number;
  savedAt: string;
}

// ── Schemas ────────────────────────────────────────────────────

const CURRENT_SNAPSHOT_VERSION = 2;

const RuntimeTagSchema = z.union([z.number(), z.boolean(), z.string()]);

const SnapshotSchema = z
  .object({
    schemaVersion: z.number().int().positive().default(CURRENT_SNAPSHOT_VERSION),
    project: z
      .object({
        nodes: z.array(z.any()).default([]),
        edges: z.array(z.any()).default([]),
        tags: z.record(RuntimeTagSchema).default({}),
        scadaLayout: z
          .object({
            nodes: z.array(z.any()).default([]),
            edges: z.array(z.any()).default([]),
          })
          .default({ nodes: [], edges: [] }),
      })
      .default({ nodes: [], edges: [], tags: {}, scadaLayout: { nodes: [], edges: [] } }),
    voltai: z
      .object({
        components: z.array(z.any()).default([]),
        edges: z.array(z.any()).default([]),
      })
      .default({ components: [], edges: [] }),
    editor: z
      .object({
        tags: z.record(z.any()).default({}),
        rungs: z.array(z.any()).default([]),
        fbdNodes: z.array(z.any()).default([]),
        fbdEdges: z.array(z.any()).default([]),
        fbdSim: z
          .object({
            scans: z.number().int().nonnegative(),
            elapsedMs: z.number().nonnegative(),
            variables: z.record(z.union([z.boolean(), z.number(), z.string()])),
            states: z.record(z.record(z.union([z.boolean(), z.number(), z.string()]))),
            outputs: z.record(z.record(z.union([z.boolean(), z.number(), z.string()]))),
            inputs: z.record(z.boolean()),
          })
          .nullable()
          .optional(),
      })
      .default({ tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] }),
    diagram: z.any().optional(),
    plc: z
      .object({
        vendor: z.string().default("siemens"),
        rack: z.any().default({}),
        variables: z.array(z.any()).default([]),
        programBlocks: z.array(z.any()).default([]),
        cycleTimeMs: z.number().default(10),
      })
      .default({
        vendor: "siemens",
        rack: { id: "rack-1", label: "Rack Principal", modules: [] },
        variables: [],
        programBlocks: [],
        cycleTimeMs: 10,
      }),
  })
  .passthrough()
  .transform((snapshot) => ({
    ...snapshot,
    schemaVersion: CURRENT_SNAPSHOT_VERSION,
  }));

export type ProjectSnapshot = z.infer<typeof SnapshotSchema>;

const EMPTY_SNAPSHOT: ProjectSnapshot = {
  schemaVersion: CURRENT_SNAPSHOT_VERSION,
  project: { nodes: [], edges: [], tags: {}, scadaLayout: { nodes: [], edges: [] } },
  voltai: { components: [], edges: [] },
  editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
  plc: {
    vendor: "siemens",
    rack: { id: "rack-1", label: "Rack Principal", modules: [] },
    variables: [],
    programBlocks: [],
    cycleTimeMs: 10,
  },
};

// ── Helpers ────────────────────────────────────────────────────

export async function ensureTenant(
  supabase: SupabaseClient<Database>,
  userId: string,
  _claims?: Record<string, unknown>,
): Promise<string> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new Error("Unauthorized: Authentication required");
  }

  // 1. Verificar se o usuário já possui tenant_id vinculado no perfil
  const { data: profile, error: profileReadError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileReadError) {
    throw new Error(`Falha ao consultar perfil do usuário: ${profileReadError.message}`);
  }

  if (profile?.tenant_id) {
    return profile.tenant_id;
  }

  // 2. Verificar se já existe associação válida em tenant_memberships para este usuário
  const { data: existingMembership, error: membershipReadError } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipReadError) {
    throw new Error(`Falha ao consultar membros do workspace: ${membershipReadError.message}`);
  }

  if (existingMembership?.tenant_id) {
    await supabase
      .from("profiles")
      .update({
        tenant_id: existingMembership.tenant_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    return existingMembership.tenant_id;
  }

  // 3. Provisionar workspace pessoal via RPC autenticada idempotente (RLS / SECURITY DEFINER)
  const { data: rpcTenantId, error: rpcError } = await supabase.rpc(
    "bootstrap_personal_tenant_if_missing",
  );

  if (rpcError) {
    throw new Error(`Não foi possível provisionar o workspace pessoal: ${rpcError.message}`);
  }

  if (typeof rpcTenantId === "string" && rpcTenantId.trim().length > 0) {
    return rpcTenantId.trim();
  }

  const { data: refreshedProfile, error: refreshError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (refreshError) {
    throw new Error(`Falha ao confirmar workspace provisionado: ${refreshError.message}`);
  }

  if (refreshedProfile?.tenant_id) {
    return refreshedProfile.tenant_id;
  }

  throw new Error("Não foi possível provisionar o workspace pessoal do usuário.");
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  client?: string;
}

export async function createProjectRecord(
  authCtx: Pick<AuthContext, "supabase" | "userId" | "claims">,
  data: CreateProjectInput,
): Promise<{ id: string; name: string; client: string | null }> {
  const { supabase, userId, claims } = authCtx;
  if (!userId) {
    throw new Error("Unauthorized: Authentication required");
  }

  const tenant_id = await ensureTenant(supabase, userId, claims);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan")
    .eq("id", tenant_id)
    .maybeSingle();
  const planName = tenant?.plan ?? "free";
  const { data: limits } = await supabase
    .from("plan_limits")
    .select("max_projects")
    .eq("plan", planName)
    .maybeSingle();
  const maxProjects = limits?.max_projects ?? 3;
  if (maxProjects >= 0) {
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant_id);
    if ((count ?? 0) >= maxProjects) {
      if (planName === "free") {
        throw new Error("Limite de 3 projetos atingido. Faça upgrade para continuar.");
      }
      throw new Error(
        `Limite de ${maxProjects} projetos atingido no plano ${planName}. Faça upgrade em /settings/billing.`,
      );
    }
  }

  const { data: row, error } = await supabase
    .from("projects")
    .insert({
      name: data.name,
      description: data.description ?? null,
      status: "active",
      created_by: userId,
      tenant_id,
      metadata: data.client ? { client: data.client } : {},
    })
    .select("id, name, metadata")
    .single();
  if (error) throw new Error(error.message);

  const { error: diagramError } = await supabase.from("diagrams").insert({
    project_id: row.id,
    name: "main",
    version: 1,
    canvas_data: EMPTY_SNAPSHOT as unknown as Json,
  });

  if (diagramError) {
    // Evitar registro órfão/inconsistente caso a criação do diagrama inicial falhe
    await supabase.from("projects").delete().eq("id", row.id);
    throw new Error(`Falha ao criar diagrama do projeto: ${diagramError.message}`);
  }

  const metadata = row.metadata as Record<string, unknown> | null;
  return {
    id: row.id,
    name: row.name,
    client: (metadata?.client as string | null) ?? null,
  };
}

// ── Server Functions ───────────────────────────────────────────

export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase } = authCtx;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, status, metadata, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return {
      projects: (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        client: ((p.metadata as Record<string, unknown> | null)?.client as string | null) ?? null,
        updated_at: p.updated_at,
      })),
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      client: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    return createProjectRecord(authCtx, data);
  });

export const loadProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase } = authCtx;
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, name, description, metadata, updated_at")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado");

    const { data: diagram } = await supabase
      .from("diagrams")
      .select("id, canvas_data, version, updated_at")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const parsed = SnapshotSchema.safeParse(diagram?.canvas_data ?? EMPTY_SNAPSHOT);
    const metadata = project.metadata as Record<string, unknown> | null;
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        client: (metadata?.client as string | null) ?? null,
      },
      diagramId: diagram?.id ?? null,
      version: diagram?.version ?? 1,
      snapshot: parsed.success ? parsed.data : EMPTY_SNAPSHOT,
    };
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      projectId: z.string().uuid(),
      snapshot: SnapshotSchema,
      createVersion: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase, userId } = authCtx;

    const { data: existing } = await supabase
      .from("diagrams")
      .select("id, version")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let diagramId: string;
    let version: number;
    if (existing) {
      diagramId = existing.id;
      version = existing.version ?? 1;
      const { error } = await supabase
        .from("diagrams")
        .update({
          canvas_data: data.snapshot as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", diagramId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await supabase
        .from("diagrams")
        .insert({
          project_id: data.projectId,
          name: "main",
          version: 1,
          canvas_data: data.snapshot as unknown as Json,
        })
        .select("id, version")
        .single();
      if (error) throw new Error(error.message);
      diagramId = row.id;
      version = row.version;
    }

    await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    if (data.createVersion) {
      const { data: last } = await supabase
        .from("project_versions")
        .select("version_number")
        .eq("project_id", data.projectId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const next = (last?.version_number ?? 0) + 1;
      await supabase.from("project_versions").insert({
        project_id: data.projectId,
        version_number: next,
        snapshot: data.snapshot as unknown as Json,
        created_by: userId,
      });
      version = next;
    }

    return { diagramId, version, savedAt: new Date().toISOString() };
  });

export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase, userId, claims } = authCtx;
    const tenant_id = await ensureTenant(supabase, userId, claims);

    // Fetch original project
    const { data: original, error: pErr } = await supabase
      .from("projects")
      .select("id, name, description, metadata")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!original) throw new Error("Projeto não encontrado");

    // Enforce plan_limits.max_projects
    const { data: tenant } = await supabase
      .from("tenants")
      .select("plan")
      .eq("id", tenant_id)
      .maybeSingle();
    const planName = tenant?.plan ?? "free";
    const { data: limits } = await supabase
      .from("plan_limits")
      .select("max_projects")
      .eq("plan", planName)
      .maybeSingle();
    const maxProjects = limits?.max_projects ?? 3;
    if (maxProjects >= 0) {
      const { count } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id);
      if ((count ?? 0) >= maxProjects) {
        throw new Error(
          planName === "free"
            ? "Limite de 3 projetos atingido. Faça upgrade para continuar."
            : `Limite de ${maxProjects} projetos atingido.`,
        );
      }
    }

    // Fetch original diagram
    const { data: diagram } = await supabase
      .from("diagrams")
      .select("canvas_data")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newName = `${original.name} (cópia)`;

    // Create duplicate project
    const { data: row, error } = await supabase
      .from("projects")
      .insert({
        name: newName,
        description: original.description,
        status: "active",
        created_by: userId,
        tenant_id,
        metadata: original.metadata,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    // Copy diagram snapshot
    const { error: diagramError } = await supabase.from("diagrams").insert({
      project_id: row.id,
      name: "main",
      version: 1,
      canvas_data: (diagram?.canvas_data ?? EMPTY_SNAPSHOT) as unknown as Json,
    });
    if (diagramError) {
      await supabase.from("projects").delete().eq("id", row.id);
      throw new Error(`Falha ao duplicar diagrama do projeto: ${diagramError.message}`);
    }

    return { id: row.id, name: row.name };
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase } = authCtx;
    const { error } = await supabase
      .from("projects")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Tabelas filhas com coluna project_id e cobertura de DELETE para owner/admin
// do tenant (ver policies no baseline + migration 20261012110000).
// twin_hotspots sai por ON DELETE CASCADE (migration 20261012090000).
// tag_samples (telemetria, sem policy de DELETE p/ cliente) e comments
// (só próprios) ficam de fora — limpeza via rotina de expurgo com service role.
const PROJECT_CHILD_TABLES = [
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
] as const;

type ProjectChildTable = (typeof PROJECT_CHILD_TABLES)[number];

async function deleteProjectChildren(
  supabase: AuthContext["supabase"],
  projectId: string,
): Promise<void> {
  for (const table of PROJECT_CHILD_TABLES) {
    const { error } = await supabase.from(table).delete().eq("project_id", projectId);
    if (error) throw new Error(`delete_${table}_failed: ${error.message}`);
  }
}

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase, userId } = authCtx;

    // Gate de papel ANTES de qualquer mutação: só owner/admin do tenant do
    // projeto. Sem isso, um engineer apagava diagrams/versions e falhava no
    // DELETE de projects (policy admin-only) — corrupção parcial.
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, tenant_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project?.tenant_id) throw new Error("project_not_found_or_forbidden");

    const { data: membership, error: memberErr } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", project.tenant_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw new Error(memberErr.message);
    if (membership?.role !== "owner" && membership?.role !== "admin") {
      throw new Error("forbidden: owner/admin required");
    }

    await deleteProjectChildren(supabase, data.projectId);

    const { error } = await supabase.from("projects").delete().eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProjectVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase } = authCtx;
    const { data: rows, error } = await supabase
      .from("project_versions")
      .select("id, version_number, created_at, created_by")
      .eq("project_id", data.projectId)
      .order("version_number", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });

export const restoreProjectVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid(), versionId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase } = authCtx;
    // Fetch the snapshot from the version record
    const { data: ver, error: verErr } = await supabase
      .from("project_versions")
      .select("snapshot, version_number")
      .eq("id", data.versionId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (verErr) throw new Error(verErr.message);
    if (!ver) throw new Error("Versão não encontrada.");

    const { data: diagram } = await supabase
      .from("diagrams")
      .select("id")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (diagram) {
      await supabase
        .from("diagrams")
        .update({
          canvas_data: (ver.snapshot ?? EMPTY_SNAPSHOT) as unknown as Json,
          updated_at: new Date().toISOString(),
        })

        .eq("id", diagram.id);
    }
    return { ok: true, restoredVersion: ver.version_number };
  });
