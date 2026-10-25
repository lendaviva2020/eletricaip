import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Cpu, Copy, Archive, Trash2, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { toast } from "sonner";
import {
  listProjects,
  createProject,
  duplicateProject,
  archiveProject,
  deleteProject,
} from "@/lib/projects.functions";
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
import { prefetchRouteQuery } from "@/lib/query-prefetch";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";

export const Route = createFileRoute("/projects")({
  loader: ({ context }) => {
    prefetchRouteQuery(context.queryClient, {
      queryKey: ["projects"],
      queryFn: () => listProjects({}),
    });
  },
  head: () => ({
    meta: [
      { title: "Projetos · EletricAI" },
      { name: "description", content: "Seus projetos industriais." },
    ],
  }),
  component: Projects,
});

function Projects() {
  const { t, locale } = useI18n();
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const dup = useServerFn(duplicateProject);
  const arch = useServerFn(archiveProject);
  const del = useServerFn(deleteProject);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => list({}),
  });

  const createMut = useMutation({
    mutationFn: (input: { name: string; client?: string; description?: string }) =>
      create({ data: input }),
    onSuccess: (p: any) => {
      toast.success(t("projects.createdSuccess", { name: p.name }));
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/workspace", search: { projectId: p.id } });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => dup({ data: { projectId: id } }),
    onSuccess: (p: any) => {
      toast.success(t("projects.duplicatedSuccess", { name: p.name }));
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: any) => toast.error(`Falha ao duplicar: ${e.message ?? e}`),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => arch({ data: { projectId: id } }),
    onSuccess: () => {
      toast.success(t("projects.archivedSuccess"));
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: any) => toast.error(`Falha ao arquivar: ${e.message ?? e}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { projectId: id } }),
    onSuccess: () => {
      toast.success(t("projects.deletedSuccess"));
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const projects = useMemo(() => data?.projects ?? [], [data?.projects]);
  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((project: any) => {
      const projectStatus = project.status ?? "active";
      if (status !== "all" && projectStatus !== status) return false;
      if (!q) return true;
      return [project.name, project.client, project.description, projectStatus]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [projects, search, status]);

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{t("projects.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? t("common.loading")
                : t("projects.countSummary", {
                    filtered: filteredProjects.length,
                    total: projects.length,
                  })}
            </p>
          </div>
          <CreateProjectDialog
            onCreate={(v) => createMut.mutate(v)}
            pending={createMut.isPending}
          />
        </div>

        <div className="mb-5 flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("projects.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            aria-label={t("projects.filterAria")}
            title={t("projects.filterAria")}
          >
            <option value="all">{t("projects.filterAll")}</option>
            <option value="active">{t("projects.filterActive")}</option>
            <option value="archived">{t("projects.filterArchived")}</option>
          </select>
        </div>

        {isLoading ? (
          <div className="grid place-items-center h-40 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center">
            <p className="text-sm text-destructive mb-3">
              {t("projects.loadError", {
                error: (error as Error)?.message ?? "unknown error",
              })}
            </p>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Cpu className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              {t("projects.emptyTitle")}
            </p>
            <CreateProjectDialog
              onCreate={(v) => createMut.mutate(v)}
              pending={createMut.isPending}
            />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("projects.noMatchTitle")}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((p: any) => (
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
                    {p.client ?? p.description ?? "-"}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex justify-between text-[11px] font-mono text-muted-foreground">
                    <span>{p.status ?? "active"}</span>
                    <span>{formatDate(new Date(p.updated_at), locale)}</span>
                  </div>
                </Link>
                <div className="mt-2 flex gap-2 text-[11px]">
                  <Link
                    to="/projects/$projectId/export"
                    params={{ projectId: p.id }}
                    className="text-primary font-semibold hover:underline"
                  >
                    Dossiê Técnico
                  </Link>
                  <span className="text-muted-foreground/40">·</span>
                  <Link
                    to="/projects/$projectId/bom"
                    params={{ projectId: p.id }}
                    className="text-muted-foreground hover:text-primary hover:underline"
                  >
                    {t("projects.actionBOM")}
                  </Link>
                  <span className="text-muted-foreground/40">·</span>
                  <Link
                    to="/projects/$projectId/export"
                    params={{ projectId: p.id }}
                    className="text-muted-foreground hover:text-primary hover:underline"
                  >
                    {t("projects.actionExport")}
                  </Link>
                </div>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => duplicateMut.mutate(p.id)}
                    className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                    aria-label={t("projects.actionDuplicate")}
                    title={t("projects.actionDuplicate")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t("projects.confirmArchive", { name: p.name }))) archiveMut.mutate(p.id);
                    }}
                    className="p-1 rounded hover:bg-warning/10 text-muted-foreground hover:text-warning transition"
                    aria-label={t("projects.actionArchive")}
                    title={t("projects.actionArchive")}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          t("projects.confirmDelete", { name: p.name }),
                        )
                      )
                        deleteMut.mutate(p.id);
                    }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                    aria-label={t("projects.actionDelete")}
                    title={t("projects.actionDelete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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
  const { t } = useI18n();
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
          <Plus className="h-4 w-4" /> {t("projects.newProject")}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projects.newProjectTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-name">{t("projects.nameLabel")}</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.namePlaceholder")}
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-client">{t("projects.clientLabel")}</Label>
            <Input
              id="np-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder={t("projects.clientPlaceholder")}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-desc">{t("projects.descriptionLabel")}</Label>
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
              {t("projects.createAndOpen")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
