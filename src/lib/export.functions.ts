import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProjectExportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const [{ data: project, error: pErr }, { data: diagrams }, { data: bom }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, status, metadata, updated_at")
        .eq("id", data.projectId)
        .maybeSingle(),
      supabase.from("diagrams").select("id, name, canvas_data").eq("project_id", data.projectId),
      supabase
        .from("project_bom_items")
        .select("part_number, description, manufacturer, quantity, unit, unit_price_brl")
        .eq("project_id", data.projectId),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado");
    const totalBRL = (bom ?? []).reduce(
      (s: number, it: any) => s + Number(it.quantity) * Number(it.unit_price_brl ?? 0),
      0,
    );
    return {
      project,
      diagrams: diagrams ?? [],
      bom: bom ?? [],
      totalBRL,
    };
  });
