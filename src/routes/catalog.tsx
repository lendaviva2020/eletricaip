import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, MagnifyingGlass, ArrowSquareOut, Package } from "@phosphor-icons/react";
import { listCatalog, listCatalogCategories } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/catalog")({
  head: () => ({ meta: [{ title: "Catálogo de componentes · EletricAI" }] }),
  component: CatalogPage,
});

function CatalogPage() {
  const { t } = useI18n();
  const listFn = useServerFn(listCatalog);
  const catsFn = useServerFn(listCatalogCategories);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);

  const { data: cats } = useQuery({
    queryKey: ["catalog-cats"],
    queryFn: () => catsFn({}),
  });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["catalog", search, categoryId],
    queryFn: () => listFn({ data: { search, categoryId, limit: 100 } }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-6xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
      </Link>
      <h1 className="text-xl font-semibold mb-1">{t("catalogPage.title")}</h1>
      <p className="text-xs text-muted-foreground mb-5">{t("catalogPage.subtitle")}</p>

      <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("catalogPage.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <select
          aria-label="Filtrar catalogo por categoria"
          title="Filtrar catalogo por categoria"
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || undefined)}
          className="h-8 [@media(pointer:coarse)]:h-10 rounded-md border border-input bg-card px-2.5 text-[13px]"
        >
          <option value="">{t("catalogPage.allCategories")}</option>
          {(cats?.categories ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : isError ? (
        <ErrorState
          message={(error as Error)?.message ?? "Falha ao carregar catálogo."}
          onRetry={() => refetch()}
        />
      ) : (data?.components?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={t("catalogPage.empty")}
          action={
            (search || categoryId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategoryId(undefined);
                }}
              >
                Limpar filtros
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.components ?? []).map((c: any) => (
            <div key={c.id} className="border border-border rounded-md p-3.5 bg-card">
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <p className="font-mono text-[11px] text-muted-foreground">{c.part_number}</p>
                  <h3 className="text-sm font-semibold">{c.commercial_name ?? c.part_number}</h3>
                </div>
                {c.datasheet_url && (
                  <a
                    href={c.datasheet_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    PDF <ArrowSquareOut className="w-3 h-3" />
                  </a>
                )}
              </div>
              {c.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
              )}
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-2 border-t border-border">
                <span>{c.catalog_manufacturers?.name ?? "—"}</span>
                <span>{c.catalog_component_categories?.name ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
        {t("catalogPage.footerHint")}{" "}
        <Link to="/projects" className="text-primary hover:underline">
          {t("nav.projects")}
        </Link>
        .
      </div>
    </div>
  );
}
