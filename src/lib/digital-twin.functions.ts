// Persistência de telemetria do Digital Twin (#TWIN-02)
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

    // Confirma acesso ao projeto (RLS já bloqueia, mas devolve erro claro).
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, tenant_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project) throw new Error("project_not_found_or_forbidden");

    // Garante partição do mês corrente e do próximo (idempotente).
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
