import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().optional(),
        categoryId: z.string().uuid().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("catalog_components")
      .select(
        "id, part_number, commercial_name, description, specs, image_urls, datasheet_url, discontinued, category_id, manufacturer_id, catalog_manufacturers(name), catalog_component_categories(name)",
      )
      .eq("discontinued", false)
      .limit(data.limit);
    if (data.categoryId) q = q.eq("category_id", data.categoryId);
    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`part_number.ilike.%${s}%,commercial_name.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { components: rows ?? [] };
  });

export const listCatalogCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("catalog_component_categories")
      .select("id, name, parent_id, description")
      .order("name");
    if (error) throw new Error(error.message);
    return { categories: data ?? [] };
  });
