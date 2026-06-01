import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  createClient,
  updateClient,
  type ClientRow,
  type ClientStatus,
} from "@/lib/clients.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ClientRow | null;
}

const empty = {
  name: "",
  sector: "",
  contact_name: "",
  email: "",
  phone: "",
  cnpj: "",
  address: "",
  website: "",
  status: "active" as ClientStatus,
  sla_pct: 99.9,
  notes: "",
};

export function ClientFormDialog({ open, onOpenChange, initial }: Props) {
  const isEdit = !!initial;
  const [form, setForm] = useState(empty);
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const updateFn = useServerFn(updateClient);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              sector: initial.sector,
              contact_name: initial.contact_name,
              email: initial.email,
              phone: initial.phone,
              cnpj: initial.cnpj,
              address: initial.address,
              website: initial.website,
              status: initial.status,
              sla_pct: Number(initial.sla_pct),
              notes: initial.notes,
            }
          : empty,
      );
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit && initial) {
        return await updateFn({ data: { id: initial.id, ...form } });
      }
      return await createFn({ data: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(isEdit ? "Cliente atualizado" : "Cliente criado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            Dados do cliente industrial vinculados à sua organização.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Nome *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </Field>
          <Field label="Setor">
            <Input
              value={form.sector}
              onChange={(e) => update("sector", e.target.value)}
              placeholder="Bebidas, Energia…"
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => update("status", v as ClientStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contato">
            <Input
              value={form.contact_name}
              onChange={(e) => update("contact_name", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </Field>
          <Field label="CNPJ">
            <Input value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} />
          </Field>
          <Field label="Endereço" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </Field>
          <Field label="Website">
            <Input
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="SLA (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={form.sla_pct}
              onChange={(e) => update("sla_pct", Number(e.target.value))}
            />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name.trim()}
          >
            {mutation.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
