/** Cadastro manual de item no catálogo da empresa. Preço vazio = sem preço (nunca estimado). */
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { saveTenantCatalogItem } from "@/lib/tenant-catalog.functions";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** "1.234,56" / "1234.56" → número; vazio → null; inválido → undefined. */
export function parseLocaleNumber(raw: string): number | null | undefined {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const EMPTY = {
  manufacturer: "",
  partNumber: "",
  description: "",
  category: "",
  current: "",
  voltage: "",
  price: "",
  currency: "BRL",
  datasheet: "",
};

export function CatalogItemFormDialog({ open, onOpenChange, onSaved }: Props) {
  const { t } = useI18n();
  const saveFn = useServerFn(saveTenantCatalogItem);
  const [form, setForm] = useState(EMPTY);
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveFn>[0]) => saveFn(payload),
    onSuccess: () => {
      setForm(EMPTY);
      onSaved();
      onOpenChange(false);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const current = parseLocaleNumber(form.current);
    const voltage = parseLocaleNumber(form.voltage);
    const price = parseLocaleNumber(form.price);
    if (current === undefined || voltage === undefined || price === undefined) {
      setLocalError("Número inválido: use apenas dígitos e vírgula ou ponto decimal.");
      return;
    }
    mutation.mutate({
      data: {
        manufacturer: form.manufacturer,
        partNumber: form.partNumber,
        description: form.description || null,
        category: form.category || null,
        ratedCurrentA: current,
        ratedVoltageV: voltage,
        unitPrice: price,
        currency: price === null ? null : form.currency,
        datasheetUrl: form.datasheet || null,
      },
    });
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const error =
    localError ??
    (mutation.isError ? (mutation.error as Error).message || "Falha ao salvar." : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tenantCatalog.formTitle")}</DialogTitle>
          <DialogDescription>{t("tenantCatalog.formPriceHint")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          data-testid="catalog-item-form"
        >
          <div className="space-y-1">
            <Label htmlFor="ci-mfr">{t("tenantCatalog.formManufacturer")}</Label>
            <Input id="ci-mfr" required maxLength={120} {...field("manufacturer")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ci-pn">{t("tenantCatalog.formPart")}</Label>
            <Input id="ci-pn" required maxLength={120} {...field("partNumber")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ci-desc">{t("tenantCatalog.formDescription")}</Label>
            <Input id="ci-desc" maxLength={1000} {...field("description")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ci-cat">{t("tenantCatalog.formCategory")}</Label>
            <Input id="ci-cat" maxLength={120} {...field("category")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="ci-a">{t("tenantCatalog.formCurrent")}</Label>
              <Input id="ci-a" inputMode="decimal" {...field("current")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ci-v">{t("tenantCatalog.formVoltage")}</Label>
              <Input id="ci-v" inputMode="decimal" {...field("voltage")} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div className="space-y-1">
              <Label htmlFor="ci-price">{t("tenantCatalog.formPrice")}</Label>
              <Input id="ci-price" inputMode="decimal" {...field("price")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ci-cur">{t("tenantCatalog.formCurrency")}</Label>
              <select
                id="ci-cur"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {["BRL", "USD", "EUR"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ci-ds">{t("tenantCatalog.formDatasheet")}</Label>
            <Input
              id="ci-ds"
              type="url"
              maxLength={2000}
              placeholder="https://"
              {...field("datasheet")}
            />
          </div>
          {error && (
            <p role="alert" className="sm:col-span-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("tenantCatalog.formCancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {t("tenantCatalog.formSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
