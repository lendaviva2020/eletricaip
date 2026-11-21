/**
 * Catálogo próprio da organização (`tenant_catalog_items`).
 *
 * Começa VAZIO. A empresa escolhe como montar: cadastro manual, planilha
 * (CSV/XLSX) ou busca no distribuidor (Mouser). Toda leitura/escrita usa o
 * cliente Supabase DO USUÁRIO — o RLS isola a organização e restringe a
 * escrita a owner/admin/engineer; o servidor repete a checagem só para dar
 * um 403 claro antes de tocar no banco.
 *
 * Itens do distribuidor: o cliente envia apenas os CÓDIGOS escolhidos; preço,
 * estoque e descrição são reconsultados aqui no servidor (nunca se confia em
 * preço vindo do navegador).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";
import { toSafeExternalHref } from "@/lib/security/url-safety";
import { CatalogRowSchema } from "@/lib/catalog-import.functions";
import { SupplierError, type SupplierPart } from "@/lib/catalog/mouser";

const TABLE = "tenant_catalog_items";
const WRITE_ROLES = new Set(["owner", "admin", "engineer"]);
/** Itens do distribuidor atualizados por chamada (a Mouser limita 1000 consultas/dia). */
export const MAX_PRICE_REFRESH = 50;

export const TenantCatalogItemSchema = z.object({
  id: z.string().uuid(),
  manufacturer: z.string(),
  part_number: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  rated_current_a: z.number().nullable(),
  rated_voltage_v: z.number().nullable(),
  unit_price: z
    .union([z.number(), z.string()])
    .nullable()
    .transform((v) => (v === null ? null : Number(v))),
  currency: z.string().nullable(),
  price_source: z.enum(["manual", "planilha", "mouser"]),
  source_part_id: z.string().nullable(),
  source_url: z.string().nullable(),
  datasheet_url: z.string().nullable(),
  stock: z.number().nullable(),
  price_updated_at: z.string().nullable(),
  updated_at: z.string(),
});
export type TenantCatalogItem = z.output<typeof TenantCatalogItemSchema>;

const ITEM_COLUMNS =
  "id, manufacturer, part_number, description, category, rated_current_a, rated_voltage_v, unit_price, currency, price_source, source_part_id, source_url, datasheet_url, stock, price_updated_at, updated_at";

interface CatalogAccess {
  db: AuthContext["supabase"];
  tenantId: string;
  role: string;
  canWrite: boolean;
}

async function resolveAccess(ctx: AuthContext): Promise<CatalogAccess> {
  const db = ctx.supabase;
  const { data: profile, error: pErr } = await ctx.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (pErr) throw new Response("Falha ao identificar a organização.", { status: 500 });
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new Response("Forbidden: nenhuma organização ativa.", { status: 403 });

  const { data: membership, error: mErr } = await ctx.supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (mErr) throw new Response("Falha ao verificar o papel na organização.", { status: 500 });
  const role = membership?.role;
  if (!role) throw new Response("Forbidden: sem vínculo com a organização.", { status: 403 });
  return { db, tenantId, role, canWrite: WRITE_ROLES.has(role) };
}

function requireWrite(access: CatalogAccess): void {
  if (!access.canWrite) {
    throw new Response("Forbidden: apenas owner, admin ou engineer alteram o catálogo.", {
      status: 403,
    });
  }
}

function sanitizeSearch(s: string | undefined): string {
  return (s ?? "")
    .trim()
    .replace(/[,().\\*"'%_]/g, "")
    .slice(0, 120);
}

function supplierErrorToResponse(err: unknown): never {
  if (err instanceof SupplierError) {
    const status = err.code === "NOT_CONFIGURED" ? 503 : err.code === "RATE_LIMITED" ? 429 : 502;
    throw new Response(err.message, { status });
  }
  throw err;
}

function rowFromSupplier(part: SupplierPart, tenantId: string, nowIso: string) {
  return {
    tenant_id: tenantId,
    manufacturer: part.manufacturer,
    part_number: part.partNumber,
    description: part.description,
    category: part.category,
    unit_price: part.unitPrice,
    currency: part.currency,
    price_source: "mouser" as const,
    source_part_id: part.supplierPartNumber,
    source_url: part.productUrl,
    datasheet_url: part.datasheetUrl,
    stock: part.stock,
    price_updated_at: part.unitPrice !== null ? nowIso : null,
  };
}

/* ------------------------------------------------------------------ */

/** Tabela ainda não criada no banco (migration pendente): estado explícito, não erro 500. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/tenant_catalog_items/.test(error.message ?? "") &&
      /does not exist|schema cache/i.test(error.message ?? ""))
  );
}

export const getTenantCatalogStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await resolveAccess(context as unknown as AuthContext);
    const { isMouserConfigured } = await import("@/lib/catalog/mouser-client.server");
    const { count, error } = await access.db
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", access.tenantId);
    if (isMissingTable(error)) {
      return {
        canWrite: false,
        role: access.role,
        itemCount: 0,
        providers: { mouser: isMouserConfigured() },
        unavailable: true as const,
      };
    }
    if (error) throw new Response(error.message, { status: 500 });
    return {
      unavailable: false as const,
      canWrite: access.canWrite,
      role: access.role,
      itemCount: count ?? 0,
      providers: { mouser: isMouserConfigured() },
    };
  });

export const listTenantCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context as unknown as AuthContext);
    let q = access.db
      .from(TABLE)
      .select(ITEM_COLUMNS)
      .eq("tenant_id", access.tenantId)
      .order("manufacturer")
      .order("part_number")
      .limit(data.limit);
    const s = sanitizeSearch(data.search);
    if (s)
      q = q.or(
        `part_number.ilike.%${s}%,manufacturer.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`,
      );
    const { data: rows, error } = await q;
    if (isMissingTable(error)) return { items: [] as TenantCatalogItem[] };
    if (error) throw new Response(error.message, { status: 500 });
    const items = z.array(TenantCatalogItemSchema).parse(rows ?? []);
    return { items };
  });

const ManualItemSchema = z.object({
  id: z.string().uuid().optional(),
  manufacturer: z.string().trim().min(1).max(120),
  partNumber: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  ratedCurrentA: z.number().nonnegative().finite().optional().nullable(),
  ratedVoltageV: z.number().nonnegative().finite().optional().nullable(),
  unitPrice: z.number().nonnegative().finite().max(1e10).optional().nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional()
    .nullable(),
  datasheetUrl: z.string().trim().max(2000).optional().nullable(),
});
export type ManualCatalogItem = z.input<typeof ManualItemSchema>;

export const saveTenantCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ManualItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context as unknown as AuthContext);
    requireWrite(access);
    const hasPrice = data.unitPrice !== undefined && data.unitPrice !== null;
    const payload = {
      tenant_id: access.tenantId,
      manufacturer: data.manufacturer,
      part_number: data.partNumber,
      description: data.description || null,
      category: data.category || null,
      rated_current_a: data.ratedCurrentA ?? null,
      rated_voltage_v: data.ratedVoltageV ?? null,
      unit_price: hasPrice ? data.unitPrice : null,
      currency: hasPrice ? (data.currency ?? "BRL") : null,
      price_source: "manual" as const,
      source_part_id: null,
      source_url: null,
      datasheet_url: toSafeExternalHref(data.datasheetUrl ?? null),
      stock: null,
      price_updated_at: hasPrice ? new Date().toISOString() : null,
    };
    const q = data.id
      ? access.db.from(TABLE).update(payload).eq("id", data.id).eq("tenant_id", access.tenantId)
      : access.db.from(TABLE).insert(payload);
    const { data: row, error } = await q.select(ITEM_COLUMNS).single();
    if (error) {
      if (error.code === "23505") {
        throw new Response("Já existe um item com este fabricante e código.", { status: 409 });
      }
      throw new Response(error.message, { status: 500 });
    }
    return { item: TenantCatalogItemSchema.parse(row) };
  });

export const deleteTenantCatalogItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const access = await resolveAccess(context as unknown as AuthContext);
    requireWrite(access);
    const { data: rows, error } = await access.db
      .from(TABLE)
      .delete()
      .in("id", data.ids)
      .eq("tenant_id", access.tenantId)
      .select("id");
    if (error) throw new Response(error.message, { status: 500 });
    return { deleted: rows?.length ?? 0 };
  });

export interface TenantImportReport {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

/** Importação de planilha para o catálogo da organização (dedup fabricante + código). */
export const importTenantCatalogRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rows: z.array(z.unknown()).min(1).max(2000) }).parse(input))
  .handler(async ({ data, context }): Promise<TenantImportReport> => {
    const access = await resolveAccess(context as unknown as AuthContext);
    requireWrite(access);
    const report: TenantImportReport = { inserted: 0, updated: 0, skipped: 0, errors: [] };

    const { data: existingRows, error: exErr } = await access.db
      .from(TABLE)
      .select("id, manufacturer, part_number")
      .eq("tenant_id", access.tenantId);
    if (exErr) throw new Response(exErr.message, { status: 500 });
    const existing = new Map<string, string>();
    for (const r of z
      .array(z.object({ id: z.string(), manufacturer: z.string(), part_number: z.string() }))
      .parse(existingRows ?? [])) {
      existing.set(`${r.manufacturer.toLowerCase()}\u0000${r.part_number.toLowerCase()}`, r.id);
    }

    const nowIso = new Date().toISOString();
    const seenInFile = new Set<string>();
    for (let i = 0; i < data.rows.length; i++) {
      const rowNumber = i + 1;
      const parsed = CatalogRowSchema.safeParse(data.rows[i]);
      if (!parsed.success) {
        report.errors.push({
          row: rowNumber,
          reason: parsed.error.issues
            .map((x) => `${x.path.join(".") || "linha"}: ${x.message}`)
            .join("; "),
        });
        report.skipped++;
        continue;
      }
      const row = parsed.data;
      if (row.manufacturer.length > 120 || row.partNumber.length > 120) {
        report.errors.push({ row: rowNumber, reason: "fabricante/código acima de 120 caracteres" });
        report.skipped++;
        continue;
      }
      const key = `${row.manufacturer.toLowerCase()}\u0000${row.partNumber.toLowerCase()}`;
      if (seenInFile.has(key)) {
        report.errors.push({
          row: rowNumber,
          reason: "linha repetida no arquivo (fabricante + código)",
        });
        report.skipped++;
        continue;
      }
      seenInFile.add(key);
      const hasPrice = row.listPriceBRL !== null && row.listPriceBRL >= 0;
      const payload = {
        tenant_id: access.tenantId,
        manufacturer: row.manufacturer,
        part_number: row.partNumber,
        description: (row.description ?? row.commercialName)?.slice(0, 1000) ?? null,
        category: row.category?.slice(0, 120) ?? null,
        rated_current_a:
          row.ratedCurrentA !== null && row.ratedCurrentA >= 0 ? row.ratedCurrentA : null,
        rated_voltage_v:
          row.ratedVoltageV !== null && row.ratedVoltageV >= 0 ? row.ratedVoltageV : null,
        unit_price: hasPrice ? row.listPriceBRL : null,
        currency: hasPrice ? "BRL" : null,
        price_source: "planilha" as const,
        datasheet_url: toSafeExternalHref(row.datasheetUrl),
        price_updated_at: hasPrice ? nowIso : null,
      };
      const id = existing.get(key);
      const { error } = id
        ? await access.db.from(TABLE).update(payload).eq("id", id).eq("tenant_id", access.tenantId)
        : await access.db.from(TABLE).insert(payload);
      if (error) {
        report.errors.push({ row: rowNumber, reason: error.message });
        report.skipped++;
      } else if (id) report.updated++;
      else report.inserted++;
    }
    return report;
  });

/* ---------------------------- distribuidor ---------------------------- */

async function enforceSupplierRateLimit(userId: string): Promise<void> {
  const { checkRateLimit } = await import("@/lib/security/rate-limiter.server");
  const rl = await checkRateLimit("api", `supplier:${userId}`);
  if (!rl.allowed) {
    throw new Response("Muitas consultas ao distribuidor. Aguarde e tente de novo.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }
}

export const searchSupplierCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        provider: z.literal("mouser"),
        keyword: z.string().trim().min(2).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    await resolveAccess(ctx);
    await enforceSupplierRateLimit(ctx.userId);
    const { searchMouserByKeyword } = await import("@/lib/catalog/mouser-client.server");
    try {
      return await searchMouserByKeyword(data.keyword, 30);
    } catch (err) {
      supplierErrorToResponse(err);
    }
  });

const SupplierCodesSchema = z.object({
  provider: z.literal("mouser"),
  supplierPartNumbers: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_PRICE_REFRESH),
});

/** Importa os códigos escolhidos; dados vêm da reconsulta no distribuidor. */
export const importSupplierParts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SupplierCodesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const access = await resolveAccess(ctx);
    requireWrite(access);
    await enforceSupplierRateLimit(ctx.userId);
    const { fetchMouserParts } = await import("@/lib/catalog/mouser-client.server");
    let parts: Map<string, SupplierPart>;
    try {
      parts = await fetchMouserParts(data.supplierPartNumbers);
    } catch (err) {
      supplierErrorToResponse(err);
    }
    const nowIso = new Date().toISOString();
    const rows = [...parts.values()].map((p) => rowFromSupplier(p, access.tenantId, nowIso));
    const notFound = data.supplierPartNumbers.filter((c) => !parts.has(c.trim().toUpperCase()));

    let imported = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const { data: found, error: fErr } = await access.db
        .from(TABLE)
        .select("id")
        .eq("tenant_id", access.tenantId)
        .ilike("manufacturer", row.manufacturer.replace(/[%_\\]/g, "\\$&"))
        .ilike("part_number", row.part_number.replace(/[%_\\]/g, "\\$&"))
        .maybeSingle();
      if (fErr) {
        errors.push(`${row.part_number}: ${fErr.message}`);
        continue;
      }
      const { error } = found
        ? await access.db
            .from(TABLE)
            .update(row)
            .eq("id", (found as { id: string }).id)
        : await access.db.from(TABLE).insert(row);
      if (error) errors.push(`${row.part_number}: ${error.message}`);
      else imported++;
    }
    return { imported, notFound, errors };
  });

/** Reconsulta preço/estoque dos itens vindos do distribuidor (os mais antigos primeiro). */
export const refreshSupplierPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ ids: z.array(z.string().uuid()).max(MAX_PRICE_REFRESH).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const access = await resolveAccess(ctx);
    requireWrite(access);

    let q = access.db
      .from(TABLE)
      .select("id, source_part_id")
      .eq("tenant_id", access.tenantId)
      .eq("price_source", "mouser")
      .not("source_part_id", "is", null)
      .order("price_updated_at", { ascending: true, nullsFirst: true })
      .limit(MAX_PRICE_REFRESH);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });
    const targets = z
      .array(z.object({ id: z.string(), source_part_id: z.string() }))
      .parse(rows ?? []);
    if (targets.length === 0) return { updated: 0, missing: 0, checked: 0 };

    await enforceSupplierRateLimit(ctx.userId);
    const { fetchMouserParts } = await import("@/lib/catalog/mouser-client.server");
    let parts: Map<string, SupplierPart>;
    try {
      parts = await fetchMouserParts(targets.map((t) => t.source_part_id));
    } catch (err) {
      supplierErrorToResponse(err);
    }

    const nowIso = new Date().toISOString();
    let updated = 0;
    let missing = 0;
    for (const t of targets) {
      const p = parts.get(t.source_part_id.toUpperCase());
      if (!p) {
        missing++;
        continue;
      }
      // Sem preço na resposta: mantém o anterior e não finge atualização.
      const patch =
        p.unitPrice !== null
          ? {
              unit_price: p.unitPrice,
              currency: p.currency,
              stock: p.stock,
              price_updated_at: nowIso,
            }
          : { stock: p.stock };
      const { error: uErr } = await access.db
        .from(TABLE)
        .update(patch)
        .eq("id", t.id)
        .eq("tenant_id", access.tenantId);
      if (!uErr && p.unitPrice !== null) updated++;
    }
    return { updated, missing, checked: targets.length };
  });

/* ---------------------------- BOM ← catálogo ---------------------------- */

/**
 * Preenche o preço dos itens da lista de materiais com o catálogo da empresa
 * (só BRL, casando código/fabricante; ver `lib/catalog/bom-pricing`). RLS do
 * usuário garante que o projeto é da organização dele.
 */
export const applyCatalogPricesToBom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), overwrite: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const access = await resolveAccess(ctx);
    requireWrite(access);

    const { data: bomRows, error: bomErr } = await ctx.supabase
      .from("project_bom_items")
      .select("id, part_number, manufacturer, unit_price_brl")
      .eq("project_id", data.projectId);
    if (bomErr) throw new Response(bomErr.message, { status: 500 });
    const items = z
      .array(
        z.object({
          id: z.string(),
          part_number: z.string().nullable(),
          manufacturer: z.string().nullable(),
          unit_price_brl: z
            .union([z.number(), z.string()])
            .nullable()
            .transform((v) => (v === null ? null : Number(v))),
        }),
      )
      .parse(bomRows ?? []);
    if (items.length === 0)
      return {
        updated: 0,
        total: 0,
        notFound: 0,
        ambiguous: 0,
        otherCurrency: 0,
        withoutPrice: 0,
        keptExisting: 0,
      };

    const { data: catRows, error: catErr } = await access.db
      .from(TABLE)
      .select("manufacturer, part_number, unit_price, currency")
      .eq("tenant_id", access.tenantId);
    if (isMissingTable(catErr)) {
      throw new Response("Catálogo da empresa ainda não ativado no banco.", { status: 409 });
    }
    if (catErr) throw new Response(catErr.message, { status: 500 });
    const catalog = z
      .array(
        z.object({
          manufacturer: z.string(),
          part_number: z.string(),
          unit_price: z
            .union([z.number(), z.string()])
            .nullable()
            .transform((v) => (v === null ? null : Number(v))),
          currency: z.string().nullable(),
        }),
      )
      .parse(catRows ?? []);

    const { planBomPricing } = await import("@/lib/catalog/bom-pricing");
    const plan = planBomPricing(items, catalog, { overwrite: data.overwrite });

    let updated = 0;
    for (const u of plan.updates) {
      const { error } = await ctx.supabase
        .from("project_bom_items")
        .update({ unit_price_brl: u.unitPriceBRL })
        .eq("id", u.id)
        .eq("project_id", data.projectId);
      if (!error) updated++;
    }
    return {
      updated,
      total: items.length,
      notFound: plan.notFound,
      ambiguous: plan.ambiguous,
      otherCurrency: plan.otherCurrency,
      withoutPrice: plan.withoutPrice,
      keptExisting: plan.keptExisting,
    };
  });
