/**
 * Catálogo da empresa: começa vazio e oferece três formas de montar —
 * cadastro manual, planilha ou busca no distribuidor. Nada é pré-carregado.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowClockwise,
  ArrowSquareOut,
  FileXls,
  MagnifyingGlass,
  PencilSimpleLine,
  Plus,
  Storefront,
  Trash,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteTenantCatalogItems,
  getTenantCatalogStatus,
  listTenantCatalog,
  refreshSupplierPrices,
  type TenantCatalogItem,
} from "@/lib/tenant-catalog.functions";
import { toSafeExternalHref } from "@/lib/security/url-safety";
import { useI18n } from "@/lib/i18n";
import { CatalogItemFormDialog } from "./catalog-item-form-dialog";
import { SupplierSearchDialog } from "./supplier-search-dialog";
import { formatCatalogPrice } from "./format";

const SOURCE_KEY: Record<TenantCatalogItem["price_source"], string> = {
  manual: "tenantCatalog.sourceManual",
  planilha: "tenantCatalog.sourceSheet",
  mouser: "tenantCatalog.sourceMouser",
};

export function TenantCatalogPanel() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const statusFn = useServerFn(getTenantCatalogStatus);
  const listFn = useServerFn(listTenantCatalog);
  const deleteFn = useServerFn(deleteTenantCatalogItems);
  const refreshFn = useServerFn(refreshSupplierPrices);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [toDelete, setToDelete] = useState<TenantCatalogItem | null>(null);

  const status = useQuery({ queryKey: ["tenant-catalog", "status"], queryFn: () => statusFn({}) });
  const list = useQuery({
    queryKey: ["tenant-catalog", "list", search],
    queryFn: () => listFn({ data: { search, limit: 500 } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant-catalog"] });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { ids: [id] } }),
    onSuccess: invalidate,
  });
  const refresh = useMutation({ mutationFn: () => refreshFn({ data: {} }), onSuccess: invalidate });

  const canWrite = status.data?.canWrite ?? false;
  const supplierReady = status.data?.providers.mouser ?? false;
  const items = list.data?.items ?? [];
  const hasSupplierItems = items.some((i) => i.price_source === "mouser");
  const catalogEmpty = (status.data?.itemCount ?? 0) === 0 && !search;

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale);

  return (
    <section className="space-y-4" data-testid="tenant-catalog">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("tenantCatalog.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("tenantCatalog.subtitle")}</p>
        </div>
        {canWrite && !catalogEmpty && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t("tenantCatalog.addItem")}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/settings/catalog-import">
                <FileXls className="h-4 w-4 mr-1" /> {t("tenantCatalog.importSheet")}
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSupplierOpen(true)}>
              <Storefront className="h-4 w-4 mr-1" /> {t("tenantCatalog.searchSupplier")}
            </Button>
            {hasSupplierItems && supplierReady && (
              <Button
                size="sm"
                variant="outline"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                <ArrowClockwise className="h-4 w-4 mr-1" />
                {refresh.isPending
                  ? t("tenantCatalog.refreshing")
                  : t("tenantCatalog.refreshPrices")}
              </Button>
            )}
          </div>
        )}
      </div>

      {status.data && !canWrite && (
        <p className="text-xs text-muted-foreground">{t("tenantCatalog.readOnly")}</p>
      )}
      {refresh.isSuccess && (
        <p className="text-xs text-muted-foreground" role="status">
          {t("tenantCatalog.refreshDone", {
            updated: refresh.data.updated,
            checked: refresh.data.checked,
          })}
        </p>
      )}
      {refresh.isError && (
        <p className="text-xs text-destructive" role="alert">
          {(refresh.error as Error).message}
        </p>
      )}

      {status.isLoading || list.isLoading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : status.isError || list.isError ? (
        <ErrorState
          message={
            ((status.error ?? list.error) as Error)?.message ?? "Falha ao carregar o catálogo."
          }
          onRetry={() => {
            void status.refetch();
            void list.refetch();
          }}
        />
      ) : catalogEmpty ? (
        <div
          className="rounded-md border border-border bg-card p-5"
          data-testid="tenant-catalog-empty"
        >
          <h3 className="text-sm font-semibold">{t("tenantCatalog.emptyTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("tenantCatalog.emptyHint")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ChoiceCard
              icon={<PencilSimpleLine className="h-5 w-5" />}
              title={t("tenantCatalog.chooseManual")}
              hint={t("tenantCatalog.chooseManualHint")}
              disabled={!canWrite}
              onClick={() => setFormOpen(true)}
            />
            <ChoiceCard
              icon={<FileXls className="h-5 w-5" />}
              title={t("tenantCatalog.chooseSheet")}
              hint={t("tenantCatalog.chooseSheetHint")}
              disabled={!canWrite}
              to="/settings/catalog-import"
            />
            <ChoiceCard
              icon={<Storefront className="h-5 w-5" />}
              title={t("tenantCatalog.chooseSupplier")}
              hint={t("tenantCatalog.chooseSupplierHint")}
              disabled={!canWrite}
              onClick={() => setSupplierOpen(true)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("tenantCatalog.searchPlaceholder")}
              className="pl-8"
              aria-label={t("tenantCatalog.searchPlaceholder")}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {items.length} {t("tenantCatalog.items")}
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs" data-testid="tenant-catalog-table">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="p-2">{t("tenantCatalog.colManufacturer")}</th>
                  <th className="p-2">{t("tenantCatalog.colPart")}</th>
                  <th className="p-2 hidden md:table-cell">{t("tenantCatalog.colDescription")}</th>
                  <th className="p-2 hidden sm:table-cell">{t("tenantCatalog.colCategory")}</th>
                  <th className="p-2 text-right">{t("tenantCatalog.colPrice")}</th>
                  <th className="p-2">{t("tenantCatalog.colSource")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const ds = toSafeExternalHref(it.datasheet_url);
                  return (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="p-2">{it.manufacturer}</td>
                      <td className="p-2 font-mono">
                        {it.part_number}
                        {ds && (
                          <a
                            href={ds}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-primary inline-flex items-center"
                            aria-label="Datasheet"
                          >
                            <ArrowSquareOut className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                      <td className="p-2 hidden md:table-cell text-muted-foreground max-w-xs truncate">
                        {it.description ?? "—"}
                      </td>
                      <td className="p-2 hidden sm:table-cell">{it.category ?? "—"}</td>
                      <td className="p-2 text-right font-mono whitespace-nowrap">
                        {it.unit_price !== null && it.currency ? (
                          formatCatalogPrice(it.unit_price, it.currency, locale)
                        ) : (
                          <span className="text-muted-foreground">
                            {t("tenantCatalog.noPrice")}
                          </span>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <span>{t(SOURCE_KEY[it.price_source])}</span>
                        {it.price_updated_at && (
                          <span className="block text-[10px] text-muted-foreground">
                            {t("tenantCatalog.updatedAt", { date: date(it.price_updated_at) })}
                          </span>
                        )}
                        {it.stock !== null && (
                          <span className="block text-[10px] text-muted-foreground">
                            {t("tenantCatalog.stock", { n: it.stock })}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {canWrite && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={t("tenantCatalog.remove")}
                            onClick={() => setToDelete(it)}
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CatalogItemFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={invalidate} />
      <SupplierSearchDialog
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        configured={supplierReady}
        canWrite={canWrite}
        onImported={invalidate}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("tenantCatalog.remove")}
        description={
          toDelete
            ? `${t("tenantCatalog.removeConfirm")} ${toDelete.manufacturer} ${toDelete.part_number}`
            : ""
        }
        variant="destructive"
        confirmLabel={t("tenantCatalog.remove")}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </section>
  );
}

interface ChoiceCardProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  disabled: boolean;
  onClick?: () => void;
  to?: "/settings/catalog-import";
}

function ChoiceCard({ icon, title, hint, disabled, onClick, to }: ChoiceCardProps) {
  const body = (
    <>
      <span className="p-2 rounded-md bg-primary/10 text-primary w-fit">{icon}</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
  const cls =
    "flex flex-col gap-2 text-left rounded-md border border-border p-4 transition-colors hover:border-primary disabled:opacity-50 disabled:pointer-events-none";
  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  );
}
