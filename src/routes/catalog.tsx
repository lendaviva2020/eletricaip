import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Search, ExternalLink } from "lucide-react";
import { listCatalog, listCatalogCategories } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/catalog")({
  head: () => ({ meta: [{ title: "Catálogo de componentes · EletricAI" }] }),
  component: CatalogPage,
});

function CatalogPage() {
  const listFn = useServerFn(listCatalog);
  const catsFn = useServerFn(listCatalogCategories);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);

  const { data: cats } = useQuery({
    queryKey: ["catalog-cats"],
    queryFn: () => catsFn({}),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["catalog", search, categoryId],
    queryFn: () => listFn({ data: { search, categoryId, limit: 100 } }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-6xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      <h1 className="text-2xl font-bold mb-1">Catálogo de componentes</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Disjuntores, contatores, relés, cabos e demais componentes elétricos.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por part number, nome ou descrição…"
            className="pl-9"
          />
        </div>
        <select
          aria-label="Filtrar catalogo por categoria"
          title="Filtrar catalogo por categoria"
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || undefined)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">Todas as categorias</option>
          {(cats?.categories ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && (data?.components?.length ?? 0) === 0 && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Nenhum componente encontrado. Catálogo aguardando cadastro pelo administrador.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data?.components ?? []).map((c: any) => (
          <div key={c.id} className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{c.part_number}</p>
                <h3 className="font-semibold">{c.commercial_name ?? c.part_number}</h3>
              </div>
              {c.datasheet_url && (
                <a
                  href={c.datasheet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  PDF <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {c.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{c.catalog_manufacturers?.name ?? "—"}</span>
              <span>{c.catalog_component_categories?.name ?? "—"}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
        Para adicionar componentes ao seu projeto, abra o BOM em{" "}
        <Link to="/projects" className="text-primary hover:underline">
          Projetos
        </Link>
        .
      </div>
    </div>
  );
}
