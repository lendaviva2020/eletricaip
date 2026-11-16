/**
 * Preço da lista de materiais (BOM) a partir do catálogo da empresa.
 *
 * Regras (dados reais, nada presumido):
 *  - casa pelo código do fabricante (sem diferenciar maiúsculas); se o item
 *    da BOM tiver fabricante, ele também precisa bater;
 *  - código ambíguo (2+ fabricantes no catálogo e BOM sem fabricante) não é
 *    preenchido;
 *  - só preço em BRL (a BOM é em reais; não há conversão de moeda);
 *  - por padrão não sobrescreve preço já digitado.
 */
export interface BomPricingItem {
  readonly id: string;
  readonly part_number: string | null;
  readonly manufacturer: string | null;
  readonly unit_price_brl: number | null;
}

export interface CatalogPriceEntry {
  readonly manufacturer: string;
  readonly part_number: string;
  readonly unit_price: number | null;
  readonly currency: string | null;
}

export interface BomPricingPlan {
  readonly updates: ReadonlyArray<{ id: string; unitPriceBRL: number }>;
  readonly notFound: number;
  readonly ambiguous: number;
  readonly otherCurrency: number;
  readonly withoutPrice: number;
  readonly keptExisting: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function planBomPricing(
  items: readonly BomPricingItem[],
  catalog: readonly CatalogPriceEntry[],
  opts: { readonly overwrite?: boolean } = {},
): BomPricingPlan {
  const byPart = new Map<string, CatalogPriceEntry[]>();
  for (const c of catalog) {
    const key = norm(c.part_number);
    if (!key) continue;
    const list = byPart.get(key) ?? [];
    list.push(c);
    byPart.set(key, list);
  }

  const updates: { id: string; unitPriceBRL: number }[] = [];
  let notFound = 0;
  let ambiguous = 0;
  let otherCurrency = 0;
  let withoutPrice = 0;
  let keptExisting = 0;

  for (const item of items) {
    if (item.unit_price_brl !== null && !opts.overwrite) {
      keptExisting++;
      continue;
    }
    const candidates = byPart.get(norm(item.part_number)) ?? [];
    const filtered = item.manufacturer
      ? candidates.filter((c) => norm(c.manufacturer) === norm(item.manufacturer))
      : candidates;
    if (filtered.length === 0) {
      notFound++;
      continue;
    }
    if (filtered.length > 1) {
      ambiguous++;
      continue;
    }
    const entry = filtered[0];
    if (entry.unit_price === null) {
      withoutPrice++;
      continue;
    }
    if ((entry.currency ?? "").toUpperCase() !== "BRL") {
      otherCurrency++;
      continue;
    }
    updates.push({ id: item.id, unitPriceBRL: Math.round(entry.unit_price * 100) / 100 });
  }

  return { updates, notFound, ambiguous, otherCurrency, withoutPrice, keptExisting };
}
