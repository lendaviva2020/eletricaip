/**
 * Busca no distribuidor (Mouser) e importação dos itens escolhidos. A lista
 * é só para escolha: ao importar, o servidor reconsulta cada código e grava
 * o preço que a Mouser devolver naquele momento.
 */
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowSquareOut, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importSupplierParts, searchSupplierCatalog } from "@/lib/tenant-catalog.functions";
import type { SupplierPart } from "@/lib/catalog/mouser";
import { useI18n } from "@/lib/i18n";
import { toSafeExternalHref } from "@/lib/security/url-safety";
import { formatCatalogPrice } from "./format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configured: boolean;
  canWrite: boolean;
  onImported: () => void;
}

const MAX_SELECTION = 50;

export function SupplierSearchDialog({
  open,
  onOpenChange,
  configured,
  canWrite,
  onImported,
}: Props) {
  const { t, locale } = useI18n();
  const searchFn = useServerFn(searchSupplierCatalog);
  const importFn = useServerFn(importSupplierParts);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const search = useMutation({
    mutationFn: (kw: string) => searchFn({ data: { provider: "mouser", keyword: kw } }),
    onSuccess: () => setSelected(new Set()),
  });
  const doImport = useMutation({
    mutationFn: (codes: string[]) =>
      importFn({ data: { provider: "mouser", supplierPartNumbers: codes } }),
    onSuccess: () => {
      setSelected(new Set());
      onImported();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (keyword.trim().length >= 2) search.mutate(keyword.trim());
  }

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (next.size < MAX_SELECTION) next.add(code);
      return next;
    });
  }

  const parts: SupplierPart[] = search.data?.parts ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("tenantCatalog.supplierTitle")}</DialogTitle>
          <DialogDescription>{t("tenantCatalog.supplierPriceNote")}</DialogDescription>
        </DialogHeader>

        {!configured ? (
          <p
            className="text-sm text-muted-foreground border border-border rounded-md p-3"
            data-testid="supplier-not-configured"
          >
            {t("tenantCatalog.supplierNotConfigured")}
          </p>
        ) : (
          <>
            <form onSubmit={submit} className="flex gap-2">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("tenantCatalog.supplierPlaceholder")}
                maxLength={100}
                aria-label={t("tenantCatalog.supplierPlaceholder")}
              />
              <Button type="submit" disabled={search.isPending || keyword.trim().length < 2}>
                <MagnifyingGlass className="h-4 w-4 mr-1" />
                {search.isPending
                  ? t("tenantCatalog.supplierSearching")
                  : t("tenantCatalog.supplierSearch")}
              </Button>
            </form>

            {search.isError && (
              <p role="alert" className="text-xs text-destructive">
                {(search.error as Error).message}
              </p>
            )}

            <div className="overflow-auto min-h-0 flex-1 border border-border rounded-md">
              {search.isSuccess && parts.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("tenantCatalog.supplierNoResults")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {parts.map((p) => (
                    <li key={p.supplierPartNumber} className="flex items-start gap-3 p-2.5 text-xs">
                      {canWrite && (
                        <input
                          type="checkbox"
                          className="mt-1"
                          aria-label={`${p.manufacturer} ${p.partNumber}`}
                          checked={selected.has(p.supplierPartNumber)}
                          onChange={() => toggle(p.supplierPartNumber)}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {p.manufacturer} · <span className="font-mono">{p.partNumber}</span>
                        </p>
                        {p.description && (
                          <p className="text-muted-foreground line-clamp-2">{p.description}</p>
                        )}
                        <p className="text-muted-foreground">
                          {p.category ?? "—"}
                          {p.stock !== null && ` · ${t("tenantCatalog.stock", { n: p.stock })}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono">
                          {p.unitPrice !== null && p.currency
                            ? formatCatalogPrice(p.unitPrice, p.currency, locale)
                            : t("tenantCatalog.noPrice")}
                        </p>
                        {p.priceQuantity !== null && p.unitPrice !== null && (
                          <p className="text-muted-foreground">
                            {t("tenantCatalog.supplierQty", { n: p.priceQuantity })}
                          </p>
                        )}
                        {toSafeExternalHref(p.productUrl) && (
                          <a
                            href={toSafeExternalHref(p.productUrl) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary inline-flex items-center gap-1"
                          >
                            Mouser <ArrowSquareOut className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {doImport.isSuccess && (
              <p className="text-xs text-muted-foreground" role="status">
                {t("tenantCatalog.supplierImported", { n: doImport.data.imported })}
                {doImport.data.notFound.length > 0 &&
                  ` ${t("tenantCatalog.supplierNotFound", { codes: doImport.data.notFound.join(", ") })}`}
              </p>
            )}
            {doImport.isError && (
              <p role="alert" className="text-xs text-destructive">
                {(doImport.error as Error).message}
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("tenantCatalog.formCancel")}
          </Button>
          {configured && canWrite && (
            <Button
              disabled={selected.size === 0 || doImport.isPending}
              onClick={() => doImport.mutate([...selected])}
            >
              {doImport.isPending
                ? t("tenantCatalog.supplierImporting")
                : t("tenantCatalog.supplierImport", { n: selected.size })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
