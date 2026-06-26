// Persistência de telemetria + upload de modelos 3D do Digital Twin
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SampleSchema = z.object({
  tag_name: z.string().min(1).max(120),
  value: z.number().finite(),
  quality: z.string().max(16).optional(),
});

const InputSchema = z.object({
  projectId: z.string().uuid(),
  samples: z.array(SampleSchema).min(1).max(500),
});

export const flushTwinTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, tenant_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project) throw new Error("project_not_found_or_forbidden");

    await supabase.rpc("create_monthly_tag_samples_partition").throwOnError();

    const payload = data.samples.map((s) => ({
      tag_name: s.tag_name,
      value: s.value,
      quality: s.quality ?? "GOOD",
    }));

    const { error } = await supabase.rpc("batch_insert_tag_samples", {
      p_project_id: data.projectId,
      p_samples: payload,
    });
    if (error) throw new Error(error.message);

    return { inserted: payload.length, userId };
  });

// =====================================================================
// #TWIN-03 — Upload de modelos 3D (GLB/GLTF) em bucket privado
// Path convention: "<tenant_id>/<project_id>/<timestamp>-<filename>"
// =====================================================================

const BUCKET = "twin-models";
const MAX_BYTES = 75 * 1024 * 1024; // 75 MB
const FILENAME_RE = /^[A-Za-z0-9._-]{1,120}\.(glb|gltf)$/i;

const UploadUrlInput = z.object({
  projectId: z.string().uuid(),
  filename: z.string().regex(FILENAME_RE, "invalid_filename"),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
});

async function resolveTenantForProject(
  supabase: Awaited<ReturnType<typeof getAuth>>["supabase"],
  userId: string,
  projectId: string,
) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, tenant_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project?.tenant_id) throw new Error("project_not_found_or_forbidden");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.tenant_id !== project.tenant_id) {
    throw new Error("forbidden");
  }
  return project.tenant_id as string;
}

// Helper só p/ tipar o retorno de context.supabase no helper acima.
async function getAuth() {
  return { supabase: null as never };
}

export const createTwinModelUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UploadUrlInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantForProject(supabase as never, userId, data.projectId);

    const safe = data.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${tenantId}/${data.projectId}/${Date.now()}-${safe}`;

    const { data: signed, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "sign_upload_failed");

    return { path, token: signed.token, signedUrl: signed.signedUrl, bucket: BUCKET };
  });

const SignedReadInput = z.object({
  path: z.string().min(1).max(512),
  expiresIn: z.number().int().min(60).max(60 * 60 * 24).optional(),
});

export const getTwinModelSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SignedReadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("no_tenant");
    if (!data.path.startsWith(`${tenantId}/`)) throw new Error("forbidden");

    const { data: signed, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.path, data.expiresIn ?? 3600);
    if (error || !signed) throw new Error(error?.message ?? "sign_read_failed");

    return { signedUrl: signed.signedUrl, path: data.path };
  });
