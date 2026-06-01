import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, Edit2, Trash2, ExternalLink, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import {
  listClients,
  deleteClient,
  type ClientRow,
  type ClientStatus,
} from "@/lib/clients.functions";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clientes · EletricAI" },
      { name: "description", content: "Gestão de clientes industriais." },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientStatus | "all">("all");
  const [sector, setSector] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClientRow | null>(null);

  const listFn = useServerFn(listClients);
  const deleteFn = useServerFn(deleteClient);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["clients", { search, status, sector }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          status: status === "all" ? undefined : status,
          sector: sector === "all" ? undefined : sector,
        },
      }),
  });

  const clients = useMemo(() => data?.clients ?? [], [data?.clients]);
  const sectors = useMemo(
    () => Array.from(new Set(clients.map((c) => c.sector).filter(Boolean))).sort(),
    [clients],
  );

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente removido");
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Clientes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie a carteira de clientes industriais da sua organização.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, contato, email, CNPJ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus | "all")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="prospect">Prospects</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos setores</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Carregando…</div>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">Nenhum cliente cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Comece cadastrando seu primeiro cliente industrial.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setEditing(null);
                setOpenForm(true);
              }}
            >
              <Plus className="h-4 w-4" /> Cadastrar cliente
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  {c.logo_url ? (
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full grid place-items-center font-semibold text-primary bg-primary/15 shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.sector || "—"}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/clients/$clientId" params={{ clientId: c.id }}>
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(c);
                          setOpenForm(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setConfirmDelete(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {(c.contact_name || c.email) && (
                  <div className="mt-3 text-[12px] text-muted-foreground truncate">
                    {c.contact_name}
                    {c.contact_name && c.email ? " · " : ""}
                    {c.email}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-border flex justify-between text-[11px] text-muted-foreground font-mono">
                  <span>SLA {Number(c.sla_pct).toFixed(1)}%</span>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: c.id }}
                    className="text-primary hover:underline"
                  >
                    detalhes →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ClientFormDialog open={openForm} onOpenChange={setOpenForm} initial={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove "{confirmDelete?.name}" permanentemente. Projetos vinculados serão
              desassociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ClientStatus }) {
  const map = {
    active: {
      label: "Ativo",
      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    },
    prospect: {
      label: "Prospect",
      className: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    },
    inactive: { label: "Inativo", className: "bg-muted text-muted-foreground border-border" },
  } as const;
  const cfg = map[status];
  return (
    <Badge variant="outline" className={`text-[10px] h-5 ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}
