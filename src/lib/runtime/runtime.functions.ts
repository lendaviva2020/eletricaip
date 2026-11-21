// Server functions do ElétricAi Runtime: publicar e aprovar pacotes, gerir
// dispositivos (gateways) e pedir parada. Toda escrita confere o papel na
// empresa do projeto e é gravada com service role + trilha de auditoria; o
// cliente só lê (RLS). A nuvem NUNCA arma o Runtime — só entrega pacote
// aprovado e pode pedir PARADA.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";
import { authorizeProjectAccess } from "@/lib/scada/scada.functions";
import { appendAuditEntries } from "@/lib/scada/audit-append.server";
import { canonicalJson, sha256Hex } from "@/lib/dossier/revision-seal";
import type { Json } from "@/integrations/supabase/types";
import { RuntimePackageSchema, MAX_PACKAGE_BYTES, collectProgramTags } from "./program-package";

const ENGINEERING_ROLES = new Set(["owner", "admin", "engineer"]);
const STOP_ROLES = new Set(["owner", "admin", "engineer", "operator"]);
/** Runtime faz parte da camada industrial (mesmos planos do IoT). */
const RUNTIME_PLANS = new Set(["pro", "premium"]);
const MAX_DEVICES_PER_PROJECT = 20;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function dbError(scope: string, error: { code?: string; message?: string } | null): never {
  console.error(`[runtime] ${scope}:`, error?.code ?? "", error?.message ?? "");
  throw new Error(`DB_ERROR: falha ao ${scope}.`);
}

async function requireRole(
  ctx: AuthContext,
  projectId: string,
  allowed: ReadonlySet<string>,
): Promise<{ tenantId: string; projectName: string; role: string }> {
  const access = await authorizeProjectAccess(
    { supabase: ctx.supabase, userId: ctx.userId } as Parameters<typeof authorizeProjectAccess>[0],
    projectId,
    { requireWrite: true },
  );
  if (/^00000000-0000-4000-8000-0000000000/.test(projectId)) {
    throw new Error("DEMO_PROJECT: o projeto de demonstração não publica no Runtime de campo.");
  }
  if (!access.role || !allowed.has(access.role)) {
    throw new Error("FORBIDDEN: seu papel na empresa não permite esta ação no Runtime.");
  }
  return { tenantId: access.tenantId, projectName: access.projectName, role: access.role };
}

async function audit(
  tenantId: string,
  userId: string,
  action: string,
  resourceId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await appendAuditEntries(tenantId, userId, [
    { action, resourceId, resourceType: "runtime", details },
  ]);
}

// ─── Pacotes ────────────────────────────────────────────────────────────────

export const publishRuntimePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        label: z.string().trim().max(120).default(""),
        package: z.unknown(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { tenantId } = await requireRole(ctx, data.projectId, ENGINEERING_ROLES);
    // O servidor revalida e recalcula o hash: nunca confia no do navegador.
    const parsed = RuntimePackageSchema.safeParse(data.package);
    if (!parsed.success) {
      throw new Error(`INVALID_PACKAGE: ${parsed.error.issues[0]?.message ?? "pacote inválido"}`);
    }
    const pkg = { ...parsed.data, label: data.label || parsed.data.label };
    if (pkg.projectId !== data.projectId) throw new Error("INVALID_PACKAGE: projeto divergente.");
    const text = canonicalJson(pkg);
    const size = new TextEncoder().encode(text).length;
    if (size > MAX_PACKAGE_BYTES) throw new Error("INVALID_PACKAGE: pacote grande demais.");
    const hash = await sha256Hex(text);

    const db = await admin();
    const { data: existing, error: exErr } = await db
      .from("runtime_packages")
      .select("id, version")
      .eq("project_id", data.projectId)
      .eq("sha256", hash)
      .maybeSingle();
    if (exErr) dbError("consultar pacotes", exErr);
    if (existing)
      return {
        id: existing.id as string,
        version: existing.version as number,
        hash,
        duplicate: true,
      };

    const { data: last, error: lErr } = await db
      .from("runtime_packages")
      .select("version")
      .eq("project_id", data.projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) dbError("consultar versões", lErr);
    const version = ((last?.version as number | undefined) ?? 0) + 1;
    const summary = {
      rungs: pkg.ladder.rungs.length,
      studioPages: pkg.studio?.pages.length ?? 0,
      points: pkg.ioMap.points.length,
      writableOutputs: pkg.ioMap.points.filter((p) => p.writeEnabled).length,
      connections: pkg.ioMap.connections.map((c) => ({ id: c.id, kind: c.kind })),
      estopTag: pkg.ioMap.estopTag ?? null,
      scanMs: pkg.scanMs,
      programTags: collectProgramTags(pkg).size,
    };
    const { data: row, error } = await db
      .from("runtime_packages")
      .insert({
        tenant_id: tenantId,
        project_id: data.projectId,
        version,
        label: pkg.label,
        sha256: hash,
        // Pacote validado por Zod (RuntimePackageSchema) e serializável em JSON.
        package: pkg as unknown as Json,
        size_bytes: size,
        summary,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !row) dbError("publicar o pacote", error);
    await audit(tenantId, ctx.userId, "RUNTIME_PACKAGE_PUBLISHED", row.id as string, {
      projectId: data.projectId,
      version,
      sha256: hash,
      summary,
    });
    return { id: row.id as string, version, hash, duplicate: false };
  });

const PackageRef = z.object({ projectId: z.string().uuid(), packageId: z.string().uuid() });

export const approveRuntimePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PackageRef.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { tenantId } = await requireRole(ctx, data.projectId, ENGINEERING_ROLES);
    const db = await admin();
    const { data: row, error } = await db
      .from("runtime_packages")
      .update({ approved_by: ctx.userId, approved_at: new Date().toISOString() })
      .eq("id", data.packageId)
      .eq("project_id", data.projectId)
      .is("approved_at", null)
      .is("revoked_at", null)
      .select("id, version, sha256")
      .maybeSingle();
    if (error) dbError("aprovar o pacote", error);
    if (!row) throw new Error("NOT_FOUND: pacote inexistente, já aprovado ou revogado.");
    await audit(tenantId, ctx.userId, "RUNTIME_PACKAGE_APPROVED", data.packageId, {
      projectId: data.projectId,
      version: row.version,
      sha256: row.sha256,
    });
    return { ok: true };
  });

export const revokeRuntimePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PackageRef.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { tenantId } = await requireRole(ctx, data.projectId, ENGINEERING_ROLES);
    const db = await admin();
    const { data: row, error } = await db
      .from("runtime_packages")
      .update({ revoked_by: ctx.userId, revoked_at: new Date().toISOString() })
      .eq("id", data.packageId)
      .eq("project_id", data.projectId)
      .is("revoked_at", null)
      .select("id, version, sha256")
      .maybeSingle();
    if (error) dbError("revogar o pacote", error);
    if (!row) throw new Error("NOT_FOUND: pacote inexistente ou já revogado.");
    // Dispositivos que tinham este alvo param de recebê-lo (o Runtime desarma).
    const { error: dErr } = await db
      .from("runtime_devices")
      .update({ target_package_id: null })
      .eq("target_package_id", data.packageId);
    if (dErr) dbError("desvincular dispositivos", dErr);
    await audit(tenantId, ctx.userId, "RUNTIME_PACKAGE_REVOKED", data.packageId, {
      projectId: data.projectId,
      version: row.version,
      sha256: row.sha256,
    });
    return { ok: true };
  });

// ─── Dispositivos ─────────────────────────────────────────────────────────

const DeviceRef = z.object({ projectId: z.string().uuid(), deviceId: z.string().uuid() });

export const createRuntimeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { tenantId } = await requireRole(ctx, data.projectId, ENGINEERING_ROLES);
    const db = await admin();
    const { data: tenant, error: tErr } = await db
      .from("tenants")
      .select("plan")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr) dbError("consultar o plano", tErr);
    if (!RUNTIME_PLANS.has(String(tenant?.plan ?? ""))) {
      throw new Error("PLAN_REQUIRED: o Runtime de campo está nos planos Pro Empresa e Premium.");
    }
    const { count, error: cErr } = await db
      .from("runtime_devices")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId)
      .is("revoked_at", null);
    if (cErr) dbError("contar dispositivos", cErr);
    if ((count ?? 0) >= MAX_DEVICES_PER_PROJECT) {
      throw new Error(`LIMIT: no máximo ${MAX_DEVICES_PER_PROJECT} dispositivos por projeto.`);
    }
    const { randomBytes } = await import("node:crypto");
    const token = `ert_${randomBytes(32).toString("base64url")}`;
    const tokenHash = await sha256Hex(token);
    const { data: row, error } = await db
      .from("runtime_devices")
      .insert({
        tenant_id: tenantId,
        project_id: data.projectId,
        name: data.name,
        token_hash: tokenHash,
        token_prefix: token.slice(0, 10),
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !row) dbError("criar o dispositivo", error);
    await audit(tenantId, ctx.userId, "RUNTIME_DEVICE_CREATED", row.id as string, {
      projectId: data.projectId,
      name: data.name,
      tokenPrefix: token.slice(0, 10),
    });
    // O token aparece UMA vez; só o hash fica guardado.
    return { id: row.id as string, token };
  });

export const setRuntimeDeviceTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    DeviceRef.extend({ packageId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { tenantId } = await requireRole(ctx, data.projectId, ENGINEERING_ROLES);
    const db = await admin();
    if (data.packageId) {
      const { data: pkg, error } = await db
        .from("runtime_packages")
        .select("id, approved_at, revoked_at, version, sha256")
        .eq("id", data.packageId)
        .eq("project_id", data.projectId)
        .maybeSingle();
      if (error) dbError("consultar o pacote", error);
      if (!pkg || !pkg.approved_at || pkg.revoked_at) {
        throw new Error("NOT_APPROVED: só um pacote aprovado e não revogado pode ser implantado.");
      }
    }
    const { data: row, error } = await db
      .from("runtime_devices")
      .update({ target_package_id: data.packageId })
      .eq("id", data.deviceId)
      .eq("project_id", data.projectId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) dbError("implantar", error);
    if (!row) throw new Error("NOT_FOUND: dispositivo inexistente ou revogado.");
    await audit(tenantId, ctx.userId, "RUNTIME_DEPLOY_TARGET_SET", data.deviceId, {
      projectId: data.projectId,
      packageId: data.packageId,
    });
    return { ok: true };
  });

export const setRuntimeDeviceStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeviceRef.extend({ stop: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    // Pedir parada: também o operador. Liberar (stop=false) não arma nada —
    // o arme continua sendo local, no gateway.
    const { tenantId } = await requireRole(
      ctx,
      data.projectId,
      data.stop ? STOP_ROLES : ENGINEERING_ROLES,
    );
    const db = await admin();
    const { data: row, error } = await db
      .from("runtime_devices")
      .update({ stop_requested: data.stop })
      .eq("id", data.deviceId)
      .eq("project_id", data.projectId)
      .select("id")
      .maybeSingle();
    if (error) dbError("registrar a parada", error);
    if (!row) throw new Error("NOT_FOUND: dispositivo inexistente.");
    await audit(
      tenantId,
      ctx.userId,
      data.stop ? "RUNTIME_STOP_REQUESTED" : "RUNTIME_STOP_CLEARED",
      data.deviceId,
      {
        projectId: data.projectId,
      },
    );
    return { ok: true };
  });

export const revokeRuntimeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeviceRef.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { tenantId } = await requireRole(ctx, data.projectId, ENGINEERING_ROLES);
    const db = await admin();
    const { data: row, error } = await db
      .from("runtime_devices")
      .update({
        revoked_at: new Date().toISOString(),
        target_package_id: null,
        stop_requested: true,
      })
      .eq("id", data.deviceId)
      .eq("project_id", data.projectId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) dbError("revogar o dispositivo", error);
    if (!row) throw new Error("NOT_FOUND: dispositivo inexistente ou já revogado.");
    await audit(tenantId, ctx.userId, "RUNTIME_DEVICE_REVOKED", data.deviceId, {
      projectId: data.projectId,
    });
    return { ok: true };
  });

// ─── Leitura (RLS do usuário) ─────────────────────────────────────────────

export interface RuntimePackageRow {
  id: string;
  version: number;
  label: string;
  sha256: string;
  size_bytes: number;
  summary: { [key: string]: Json | undefined };
  created_at: string;
  approved_at: string | null;
  revoked_at: string | null;
}

export interface RuntimeDeviceRow {
  id: string;
  name: string;
  token_prefix: string;
  target_package_id: string | null;
  stop_requested: boolean;
  last_seen_at: string | null;
  last_mode: "SHADOW" | "RUN" | "SAFE" | null;
  last_package_hash: string | null;
  last_state: { [key: string]: Json | undefined };
  revoked_at: string | null;
}

export const listRuntime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const access = await authorizeProjectAccess(
      { supabase: ctx.supabase, userId: ctx.userId } as Parameters<
        typeof authorizeProjectAccess
      >[0],
      data.projectId,
    );
    const db = ctx.supabase;
    const [pk, dv] = await Promise.all([
      db
        .from("runtime_packages")
        .select(
          "id, version, label, sha256, size_bytes, summary, created_at, approved_at, revoked_at",
        )
        .eq("project_id", data.projectId)
        .order("version", { ascending: false })
        .limit(50),
      db
        .from("runtime_devices")
        .select(
          "id, name, token_prefix, target_package_id, stop_requested, last_seen_at, last_mode, last_package_hash, last_state, revoked_at",
        )
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: true }),
    ]);
    if (pk.error) {
      // Tabela ainda não criada no banco: a tela mostra "ativando".
      if (pk.error.code === "42P01" || pk.error.code === "PGRST205") {
        return { available: false as const, role: access.role, packages: [], devices: [] };
      }
      dbError("listar pacotes", pk.error);
    }
    if (dv.error) dbError("listar dispositivos", dv.error);
    return {
      available: true as const,
      role: access.role,
      packages: (pk.data ?? []) as RuntimePackageRow[],
      devices: (dv.data ?? []) as RuntimeDeviceRow[],
    };
  });
