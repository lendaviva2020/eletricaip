import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface AuthCtx {
  supabase: SupabaseClient<Database>;
  userId: string;
}

export const listBom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    const { data: items, error } = await supabase
      .from("project_bom_items")
      .select(
        "id, component_id, part_number, description, manufacturer, quantity, unit, reference, notes, unit_price_brl, source, created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const totalBRL = (items ?? []).reduce(
      (sum: number, it) => sum + Number(it.unit_price_brl ?? 0) * Number(it.quantity ?? 0),
      0,
    );
    return { items: items ?? [], totalBRL };
  });

export const addBomItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        componentId: z.string().uuid().optional(),
        partNumber: z.string().min(1).max(255),
        description: z.string().max(500).optional(),
        manufacturer: z.string().max(255).optional(),
        quantity: z.number().positive().default(1),
        unit: z.string().max(20).default("un"),
        reference: z.string().max(255).optional(),
        notes: z.string().max(1000).optional(),
        unitPriceBRL: z.number().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as AuthCtx;
    const { data: row, error } = await supabase
      .from("project_bom_items")
      .insert({
        project_id: data.projectId,
        component_id: data.componentId ?? null,
        part_number: data.partNumber,
        description: data.description ?? null,
        manufacturer: data.manufacturer ?? null,
        quantity: data.quantity,
        unit: data.unit,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        unit_price_brl: data.unitPriceBRL ?? null,
        source: "manual",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { item: row };
  });

export const updateBomItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        quantity: z.number().positive().optional(),
        unitPriceBRL: z.number().min(0).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        reference: z.string().max(255).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    const patch: Record<string, unknown> = {};
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.unitPriceBRL !== undefined) patch.unit_price_brl = data.unitPriceBRL;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.reference !== undefined) patch.reference = data.reference;
    const { error } = await supabase.from("project_bom_items").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBomItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    const { error } = await supabase.from("project_bom_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateBomFromCanvas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as AuthCtx;
    const { data: result, error } = await supabaseAdmin.rpc("generate_bom_from_canvas_for_user", {
      p_user_id: userId,
      p_project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return { itemsAdded: (result?.[0]?.items_added ?? 0) as number };
  });
