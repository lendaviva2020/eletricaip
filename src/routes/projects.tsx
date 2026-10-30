import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Plus,
  Cpu,
  Copy,
  Archive,
  Trash,
  CircleNotch,
  MagnifyingGlass,
  DotsThree,
  CaretUp,
  CaretDown,
  ArrowRight,
  FileText,
  Table as TableIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { prefetchRouteQuery } from "@/lib/query-prefetch";
import { useI18n } from "@/lib/i18n";

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

const rtfPtBr = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function formatRelativePtBr(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return "—";
  const diffSec = Math.round((target - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtfPtBr.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtfPtBr.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtfPtBr.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtfPtBr.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtfPtBr.format(diffMonth, "month");
  return rtfPtBr.format(Math.round(diffDay / 365), "year");
}

function Projects() {
  const { t } = useI18n();
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const dup = useServerFn(duplicateProject);
  const arch = useServerFn(archiveProject);
  const del = useServerFn(deleteProject);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Projeto",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-6 w-6 rounded-sm grid place-items-center bg-muted border border-border text-primary shrink-0">
                <Cpu className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <Link
                  to="/workspace"
                  search={{ projectId: p.id }}
                  className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                >
                  {p.name}
                </Link>
                {(p.client || p.description) && (
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {p.client ?? p.description}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "mode",
        header: "Modo / Tipo",
        cell: () => (
          <Badge variant="outline" className="font-mono">
            Unifilar / Ladder
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const st = row.original.status ?? "active";
          return (
            <Badge variant={st === "archived" ? "secondary" : "success"}>
              {st === "archived" ? "Arquivado" : "Ativo"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "updated_at",
        header: "Atualizado em",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatRelativePtBr(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Link
                to="/projects/$projectId/export"
                params={{ projectId: p.id }}
                className="hidden sm:inline-flex h-7 px-2 items-center rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Dossiê
              </Link>
              <Link
                to="/projects/$projectId/bom"
                params={{ projectId: p.id }}
                className="hidden sm:inline-flex h-7 px-2 items-center rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {t("projects.actionBOM")}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Ações para ${p.name}`}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <DotsThree className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/workspace" search={{ projectId: p.id }}>
                      <ArrowRight className="h-3.5 w-3.5" /> Abrir no Workspace
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/projects/$projectId/export" params={{ projectId: p.id }}>
                      <FileText className="h-3.5 w-3.5" /> Dossiê Técnico (
                      {t("projects.actionExport")})
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/projects/$projectId/bom" params={{ projectId: p.id }}>
                      <TableIcon className="h-3.5 w-3.5" /> {t("projects.actionBOM")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => duplicateMut.mutate(p.id)}>
                    <Copy className="h-3.5 w-3.5" /> {t("projects.actionDuplicate")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (confirm(t("projects.confirmArchive", { name: p.name }))) {
                        archiveMut.mutate(p.id);
                      }
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" /> {t("projects.actionArchive")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      if (confirm(t("projects.confirmDelete", { name: p.name }))) {
                        deleteMut.mutate(p.id);
                      }
                    }}
                  >
                    <Trash className="h-3.5 w-3.5" /> {t("projects.actionDelete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [archiveMut, deleteMut, duplicateMut, t],
  );

  const table = useReactTable({
    data: filteredProjects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
              {t("projects.title")}
            </h1>
            <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
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

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <SearchInput
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch("")}
              placeholder={t("projects.searchPlaceholder")}
              shortcut="/"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 [@media(pointer:coarse)]:h-10 rounded-md border border-input bg-card px-2.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={t("projects.filterAria")}
            title={t("projects.filterAria")}
          >
            <option value="all">{t("projects.filterAll")}</option>
            <option value="active">{t("projects.filterActive")}</option>
            <option value="archived">{t("projects.filterArchived")}</option>
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : isError ? (
          <ErrorState
            message={t("projects.loadError", {
              error: (error as Error)?.message ?? "unknown error",
            })}
            retryLabel={t("common.retry")}
            onRetry={() => refetch()}
          />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<Cpu className="h-5 w-5" />}
            title={t("projects.emptyTitle")}
            description="Crie seu primeiro projeto industrial para acessar o canvas elétrico e de automação."
            action={
              <CreateProjectDialog
                onCreate={(v) => createMut.mutate(v)}
                pending={createMut.isPending}
              />
            }
          />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon={<MagnifyingGlass className="h-5 w-5" />}
            title={t("projects.noMatchTitle")}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none uppercase"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" && <CaretUp className="h-3 w-3 text-primary" />}
                              {sorted === "desc" && <CaretDown className="h-3 w-3 text-primary" />}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        <Button size="default">
          <Plus className="h-3.5 w-3.5" /> {t("projects.newProject")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projects.newProjectTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label htmlFor="np-client">{t("projects.clientLabel")}</Label>
            <Input
              id="np-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder={t("projects.clientPlaceholder")}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
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
              {pending ? <CircleNotch className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("projects.createAndOpen")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
