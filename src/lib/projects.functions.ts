import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      })
      .default({ nodes: [], edges: [], tags: {} }),
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
      })
      .default({ tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] }),
    diagram: z.any().optional(),
  })
  .passthrough()
  .transform((snapshot) => ({
    ...snapshot,
    schemaVersion: CURRENT_SNAPSHOT_VERSION,
  }));

export type ProjectSnapshot = z.infer<typeof SnapshotSchema>;

const EMPTY_SNAPSHOT: ProjectSnapshot = {
  schemaVersion: CURRENT_SNAPSHOT_VERSION,
  project: { nodes: [], edges: [], tags: {} },
  voltai: { components: [], edges: [] },
  editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
};

function parseSnapshot(value: unknown): ProjectSnapshot {
  const parsed = SnapshotSchema.safeParse(value ?? EMPTY_SNAPSHOT);
  if (parsed.success) return parsed.data;
  console.warn("[projects] invalid snapshot, falling back to empty snapshot", parsed.error.message);
  return EMPTY_SNAPSHOT;
}

async function ensureTenant(supabase: any, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.tenant_id) return profile.tenant_id as string;
  const { data: tid, error } = await supabase.rpc("bootstrap_personal_tenant_if_missing");
  if (error) throw new Error(error.message);
  return tid as string;
}

export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, status, metadata, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return {
      projects: (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        client: (p.metadata as any)?.client ?? null,
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
    const { supabase, userId } = context as any;
    const tenant_id = await ensureTenant(supabase, userId);

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
        created_by: userId,
        tenant_id,
        metadata: data.client ? { client: data.client } : {},
      })
      .select("id, name, metadata")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("diagrams").insert({
      project_id: row.id,
      name: "main",
      canvas_data: EMPTY_SNAPSHOT as any,
    });
    return {
      id: row.id as string,
      name: row.name as string,
      client: (row.metadata as any)?.client ?? null,
    };
  });

export const loadProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
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

    return {
      project: {
        id: project.id as string,
        name: project.name as string,
        description: project.description as string | null,
        client: (project.metadata as any)?.client ?? null,
      },
      diagramId: (diagram?.id as string) ?? null,
      version: (diagram?.version as number) ?? 1,
      snapshot: parseSnapshot(diagram?.canvas_data),
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
    const { supabase, userId } = context as any;
    const snapshot = parseSnapshot(data.snapshot);

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
      diagramId = existing.id as string;
      version = (existing.version as number) ?? 1;
      const { error } = await supabase
        .from("diagrams")
        .update({ canvas_data: snapshot as any, updated_at: new Date().toISOString() })
        .eq("id", diagramId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await supabase
        .from("diagrams")
        .insert({
          project_id: data.projectId,
          name: "main",
          canvas_data: snapshot as any,
        })
        .select("id, version")
        .single();
      if (error) throw new Error(error.message);
      diagramId = row.id as string;
      version = row.version as number;
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
      const next = ((last?.version_number as number) ?? 0) + 1;
      await supabase.from("project_versions").insert({
        project_id: data.projectId,
        version_number: next,
        snapshot: snapshot as any,
        created_by: userId,
      });
      version = next;
    }

    return { diagramId, version, savedAt: new Date().toISOString() };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await supabase.from("diagrams").delete().eq("project_id", data.projectId);
    await supabase.from("project_versions").delete().eq("project_id", data.projectId);
    const { error } = await supabase.from("projects").delete().eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("projects")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid(), name: z.string().max(200).optional() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenant_id = await ensureTenant(supabase, userId);

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("name, description, metadata")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado.");

    const { data: diagram } = await supabase
      .from("diagrams")
      .select("canvas_data")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: copy, error: cErr } = await supabase
      .from("projects")
      .insert({
        name: data.name?.trim() || `${project.name} (cópia)`,
        description: project.description ?? null,
        created_by: userId,
        tenant_id,
        metadata: project.metadata ?? {},
      })
      .select("id, name, metadata")
      .single();
    if (cErr) throw new Error(cErr.message);

    await supabase.from("diagrams").insert({
      project_id: copy.id,
      name: "main",
      canvas_data: parseSnapshot(diagram?.canvas_data) as any,
    });

    return {
      id: copy.id as string,
      name: copy.name as string,
      client: (copy.metadata as any)?.client ?? null,
    };
  });

export const listProjectVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
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
    const { supabase } = context as any;
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
        .update({ canvas_data: parseSnapshot(ver.snapshot), updated_at: new Date().toISOString() })
        .eq("id", diagram.id);
    }
    return { ok: true, restoredVersion: ver.version_number as number };
  });
