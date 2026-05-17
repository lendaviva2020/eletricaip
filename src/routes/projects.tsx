import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Cpu, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects, createProject, deleteProject } from "@/lib/projects.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projetos · EletricAI" },
      { name: "description", content: "Seus projetos industriais." },
    ],
  }),
  component: Projects,
});

function Projects() {
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const del = useServerFn(deleteProject);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => list({}),
  });

  const createMut = useMutation({
    mutationFn: (input: { name: string; client?: string; description?: string }) =>
      create({ data: input }),
    onSuccess: (p: any) => {
      toast.success(`Projeto "${p.name}" criado`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/workspace", search: { projectId: p.id } });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { projectId: id } }),
    onSuccess: () => {
      toast.success("Projeto excluído");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const projects = data?.projects ?? [];

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Projetos industriais</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Carregando..." : `${projects.length} projeto(s)`}
            </p>
          </div>
          <CreateProjectDialog
            onCreate={(v) => createMut.mutate(v)}
            pending={createMut.isPending}
          />
        </div>

        {isLoading ? (
          <div className="grid place-items-center h-40 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Cpu className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              Você ainda não tem projetos. Crie o primeiro para começar.
            </p>
            <CreateProjectDialog
              onCreate={(v) => createMut.mutate(v)}
              pending={createMut.isPending}
            />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p: any) => (
              <div
                key={p.id}
                className="group relative rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/30 transition-all"
              >
                <Link to="/workspace" search={{ projectId: p.id }} className="block">
                  <div className="flex items-start justify-between">
                    <div className="h-9 w-9 rounded-md grid place-items-center bg-primary/15 text-primary">
                      <Cpu className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 text-sm font-semibold group-hover:text-primary transition-colors">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.client ?? p.description ?? "—"}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex justify-between text-[11px] font-mono text-muted-foreground">
                    <span>{p.status ?? "active"}</span>
                    <span>{new Date(p.updated_at).toLocaleDateString()}</span>
                  </div>
                </Link>
                <div className="mt-2 flex gap-2 text-[11px]">
                  <Link
                    to="/projects/$projectId/bom"
                    params={{ projectId: p.id }}
                    className="text-primary hover:underline"
                  >
                    BOM
                  </Link>
                  <Link
                    to="/projects/$projectId/export"
                    params={{ projectId: p.id }}
                    className="text-primary hover:underline"
                  >
                    Exportar
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Excluir "${p.name}"?`)) deleteMut.mutate(p.id);
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateProjectDialog({
  onCreate,
  pending,
}: {
  onCreate: (v: { name: string; client?: string; description?: string }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      client: client.trim() || undefined,
      description: description.trim() || undefined,
    });
    setOpen(false);
    setName("");
    setClient("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground inline-flex items-center gap-2 glow-primary"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus className="h-4 w-4" /> Novo projeto
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto industrial</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-name">Nome *</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Engarrafamento · Linha 03"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-client">Cliente</Label>
            <Input
              id="np-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Ex.: Coca-Cola FEMSA"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-desc">Descrição</Label>
            <Textarea
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar e abrir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
