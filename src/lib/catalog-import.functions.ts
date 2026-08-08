// Pipeline de importação de catálogo real (CSV/XLSX parseado no client).
// NENHUM dado é gerado, inferido ou completado por IA aqui: apenas o que vem
// explicitamente no arquivo importado é persistido. Embedding fica null
// (passo separado, fora deste escopo).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTenantAdmin } from "@/integrations/supabase/tenant-admin-middleware";

const numeric = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const s = v.trim();
    if (!s) return null;
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  });

const text = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s ? s : null;
  });

const required = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => v.length > 0, "obrigatório");

export const CatalogRowSchema = z.object({
  manufacturer: required,
  partNumber: required,
  commercialName: text,
  description: text,
  category: text,
  ratedCurrentA: numeric,
  ratedVoltageV: numeric,
  listPriceBRL: numeric,
  etimClass: text,
  datasheetUrl: text,
  certifications: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const arr = Array.isArray(v) ? v : v.split(/[;,|]/);
      const clean = arr.map((s) => String(s).trim()).filter(Boolean);
      return clean.length ? clean : null;
    }),
  specs: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type CatalogRow = z.input<typeof CatalogRowSchema>;

const InputSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(2000),
});

export interface ImportReport {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

const DEFAULT_CATEGORY = "Não classificado";

export const importCatalogBatch = createServerFn({ method: "POST" })
  .middleware([requireTenantAdmin])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<ImportReport> => {
    const { userId } = context;
    // Catálogo é global e sua RLS libera escrita só para platform admins;
    // o caller já foi autorizado como owner/admin do tenant acima.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => any;
    };

    const report: ImportReport = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const manufacturerCache = new Map<string, string>();
    const categoryCache = new Map<string, string>();

    async function getOrCreateManufacturer(name: string): Promise<string> {
      const key = name.toLowerCase();
      const cached = manufacturerCache.get(key);
      if (cached) return cached;
      const { data: found, error: findErr } = await db
        .from("catalog_manufacturers")
        .select("id, name")
        .ilike("name", name)
        .limit(1);
      if (findErr) throw new Error(findErr.message);
      if (found?.[0]?.id) {
        manufacturerCache.set(key, found[0].id);
        return found[0].id;
      }
      const { data: created, error: insErr } = await db
        .from("catalog_manufacturers")
        .insert({ name })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      manufacturerCache.set(key, created.id);
      return created.id;
    }

    async function getOrCreateCategory(name: string): Promise<string> {
      const key = name.toLowerCase();
      const cached = categoryCache.get(key);
      if (cached) return cached;
      const { data: found, error: findErr } = await db
        .from("catalog_component_categories")
        .select("id, name")
        .ilike("name", name)
        .limit(1);
      if (findErr) throw new Error(findErr.message);
      if (found?.[0]?.id) {
        categoryCache.set(key, found[0].id);
        return found[0].id;
      }
      const { data: created, error: insErr } = await db
        .from("catalog_component_categories")
        .insert({ name })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      categoryCache.set(key, created.id);
      return created.id;
    }

    for (let i = 0; i < data.rows.length; i++) {
      const rowNumber = i + 1;
      const parsed = CatalogRowSchema.safeParse(data.rows[i]);
      if (!parsed.success) {
        const reason = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
          .join("; ");
        report.errors.push({ row: rowNumber, reason });
        report.skipped++;
        continue;
      }
      const row = parsed.data;

      try {
        const manufacturerId = await getOrCreateManufacturer(row.manufacturer);
        const categoryId = await getOrCreateCategory(row.category ?? DEFAULT_CATEGORY);

        const payload: Record<string, unknown> = {
          manufacturer_id: manufacturerId,
          category_id: categoryId,
          part_number: row.partNumber,
          commercial_name: row.commercialName,
          description: row.description,
          rated_current_a: row.ratedCurrentA,
          rated_voltage_v: row.ratedVoltageV,
          list_price_brl: row.listPriceBRL,
          etim_class: row.etimClass,
          datasheet_url: row.datasheetUrl,
          certifications: row.certifications,
          specs: row.specs ?? {},
          embedding: null,
        };

        const { data: existing, error: existErr } = await db
          .from("catalog_components")
          .select("id")
          .eq("manufacturer_id", manufacturerId)
          .eq("part_number", row.partNumber)
          .maybeSingle();
        if (existErr) throw new Error(existErr.message);

        if (existing?.id) {
          const { error } = await db
            .from("catalog_components")
            .update(payload)
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          report.updated++;
        } else {
          const { error } = await db.from("catalog_components").insert(payload);
          if (error) throw new Error(error.message);
          report.inserted++;
        }
      } catch (err) {
        report.errors.push({
          row: rowNumber,
          reason: err instanceof Error ? err.message : "erro desconhecido",
        });
        report.skipped++;
      }
    }

    console.info(
      `[catalog-import] user=${userId} inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped}`,
    );
    return report;
  });

export const canImportCatalog = createServerFn({ method: "POST" })
  .middleware([requireTenantAdmin])
  .handler(async ({ context }) => ({ allowed: true, role: context.tenantRole }));
