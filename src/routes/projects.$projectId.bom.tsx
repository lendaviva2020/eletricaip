import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Wand2, Search } from "lucide-react";
import {
  listBom,
  addBomItem,
  updateBomItem,
  deleteBomItem,
  generateBomFromCanvas,
} from "@/lib/bom.functions";
import { listCatalog } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/i18n/format";

export const Route = createFileRoute("/projects/$projectId/bom")({
  head: () => ({ meta: [{ title: "BOM · EletricAI" }] }),
  component: BomPage,
});

function BomPage() {
  const { t, locale } = useI18n();
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listBom);
  const addFn = useServerFn(addBomItem);
  const updFn = useServerFn(updateBomItem);
  const delFn = useServerFn(deleteBomItem);
  const genFn = useServerFn(generateBomFromCanvas);
  const catalogFn = useServerFn(listCatalog);

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["bom", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const { data: catalog } = useQuery({
    queryKey: ["catalog-pick", search],
    queryFn: () => catalogFn({ data: { search, limit: 20 } }),
    enabled: search.trim().length > 1,
  });

  async function handleGenerate() {
    setBusy(true);
    try {
      const r = await genFn({ data: { projectId } });
      toast.success(t("bom.itemGeneratedSuccess", { count: r.itemsAdded }));
      await qc.invalidateQueries({ queryKey: ["bom", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFromCatalog(c: any) {
    try {
      await addFn({
        data: {
          projectId,
          componentId: c.id,
          partNumber: c.part_number,
          description: c.commercial_name ?? c.description ?? undefined,
          manufacturer: c.catalog_manufacturers?.name ?? undefined,
          quantity: 1,
          unit: "un",
        },
      });
      toast.success(t("bom.itemAdded"));
      setSearch("");
      await qc.invalidateQueries({ queryKey: ["bom", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleAddManual() {
    const part = prompt("Part number:");
    if (!part) return;
    const desc = prompt("Descrição (opcional):") ?? undefined;
    const qtyStr = prompt("Quantidade:", "1") ?? "1";
    const quantity = Number(qtyStr) || 1;
    try {
      await addFn({
        data: { projectId, partNumber: part, description: desc, quantity, unit: "un" },
      });
      toast.success(t("bom.itemAdded"));
      await qc.invalidateQueries({ queryKey: ["bom", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleUpdateQty(id: string, value: string) {
    const q = Number(value);
    if (!q || q <= 0) return;
    try {
      await updFn({ data: { id, quantity: q } });
      await qc.invalidateQueries({ queryKey: ["bom", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleUpdatePrice(id: string, value: string) {
    const v = value === "" ? null : Number(value);
    if (v !== null && (Number.isNaN(v) || v < 0)) return;
    try {
      await updFn({ data: { id, unitPriceBRL: v } });
      await qc.invalidateQueries({ queryKey: ["bom", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("bom.confirmDelete"))) return;
    try {
      await delFn({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["bom", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-6xl mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t("bom.backToProjects")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("bom.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("bom.estimatedTotal")}{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(data?.totalBRL ?? 0, locale, locale === "pt-BR" ? "BRL" : "USD")}
            </span>{" "}
            · {t("bom.itemsCount", { count: data?.items?.length ?? 0 })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleAddManual}>
            <Plus className="w-4 h-4 mr-1" /> {t("bom.addManual")}
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={busy}>
            <Wand2 className="w-4 h-4 mr-1" /> {busy ? t("bom.generating") : t("bom.generateFromCanvas")}
          </Button>
        </div>
      </div>

      <div className="mb-6 border border-border rounded-lg p-4">
        <label className="text-xs text-muted-foreground mb-2 block">{t("bom.addFromCatalog")}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("bom.searchCatalogPlaceholder")}
            className="pl-9"
          />
        </div>
        {(catalog?.components?.length ?? 0) > 0 && (
          <div className="mt-2 border border-border rounded-md divide-y divide-border max-h-64 overflow-auto">
            {catalog!.components.map((c: any) => (
              <button
                key={c.id}
                onClick={() => handleAddFromCatalog(c)}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
              >
                <div className="font-mono text-xs text-muted-foreground">{c.part_number}</div>
                <div>{c.commercial_name ?? c.description ?? "—"}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          {locale === "pt-BR"
            ? "BOM vazio. Adicione manualmente, do catálogo, ou gere a partir do canvas."
            : "Empty BOM. Add items manually, from the catalog, or generate from canvas."}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("bom.colPartNumber")}</th>
                <th className="text-left px-3 py-2">{t("bom.colDescription")}</th>
                <th className="text-left px-3 py-2">{t("bom.colManufacturer")}</th>
                <th className="text-right px-3 py-2">{t("bom.colQuantity")}</th>
                <th className="text-right px-3 py-2">{t("bom.colUnitPrice")}</th>
                <th className="text-right px-3 py-2">{t("bom.colSubtotal")}</th>
                <th className="text-left px-3 py-2">Origem</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data!.items.map((it: any) => {
                const subtotal = Number(it.quantity) * Number(it.unit_price_brl ?? 0);
                return (
                  <tr key={it.id} className="hover:bg-accent/30">
                    <td className="px-3 py-2 font-mono text-xs">{it.part_number}</td>
                    <td className="px-3 py-2">{it.description ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{it.manufacturer ?? "—"}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        aria-label={`Quantidade de ${it.part_number}`}
                        title={`Quantidade de ${it.part_number}`}
                        min={0.01}
                        step={0.01}
                        defaultValue={it.quantity}
                        onBlur={(e) => handleUpdateQty(it.id, e.target.value)}
                        className="w-20 text-right bg-transparent border border-border rounded px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        aria-label={`Preco unitario de ${it.part_number}`}
                        title={`Preco unitario de ${it.part_number}`}
                        min={0}
                        step={0.01}
                        defaultValue={it.unit_price_brl ?? ""}
                        onBlur={(e) => handleUpdatePrice(it.id, e.target.value)}
                        className="w-24 text-right bg-transparent border border-border rounded px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(subtotal, locale, locale === "pt-BR" ? "BRL" : "USD")}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted">
                        {it.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDelete(it.id)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/30 font-semibold">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right">
                  Total
                </td>
                <td className="px-3 py-2 text-right">
                  {formatCurrency(data?.totalBRL ?? 0, locale, locale === "pt-BR" ? "BRL" : "USD")}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
