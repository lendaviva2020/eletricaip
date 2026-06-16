import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  HardDriveDownload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Trash2,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAutosaveLog, type AutosaveEvent } from "@/lib/autosave-log";
import { useProjectStore } from "@/lib/project-store";
import { useDiagramStore } from "@/lib/diagram/store";

export const Route = createFileRoute("/settings/autosave")({
  head: () => ({
    meta: [
      { title: "Autosave & Persistência · EletricAI" },
      {
        name: "description",
        content:
          "Logs do autosave, status de persistência do canvas e diagnóstico de falhas de salvamento.",
      },
    ],
  }),
  component: AutosavePanel,
});

function AutosavePanel() {
  const { events, lastSavedAt, lastSaveError, lastLoadedAt, saveInFlight, clear } =
    useAutosaveLog();
  const projectId = useProjectStore((s) => s.projectId);
  const projectDirty = useProjectStore((s) => s.dirty);
  const diagramDoc = useDiagramStore((s) => s.doc);

  const counts = useMemo(
    () => ({
      diagramNodes: Object.keys(diagramDoc.nodes ?? {}).length,
      diagramEdges: Object.keys(diagramDoc.edges ?? {}).length,
    }),
    [diagramDoc],
  );

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[960px] mx-auto p-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-1 flex items-center gap-2">
              <HardDriveDownload className="h-3 w-3" /> Persistência
            </div>
            <h1 className="text-2xl font-semibold">Autosave & Canvas</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe em tempo real o ciclo de salvamento e o estado do diagrama persistido.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Limpar log
          </Button>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Projeto"
            value={projectId ? projectId.slice(0, 8) + "…" : "—"}
            tone={projectId ? undefined : "warning"}
          />
          <Stat
            label="Status"
            value={
              saveInFlight
                ? "Salvando…"
                : lastSaveError
                  ? "Erro"
                  : projectDirty
                    ? "Pendente"
                    : "Sincronizado"
            }
            tone={
              saveInFlight
                ? undefined
                : lastSaveError
                  ? "destructive"
                  : projectDirty
                    ? "warning"
                    : "success"
            }
          />
          <Stat label="Nós (diagrama)" value={String(counts.diagramNodes)} />
          <Stat label="Arestas (diagrama)" value={String(counts.diagramEdges)} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-sm">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                Último carregamento
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {lastLoadedAt ? new Date(lastLoadedAt).toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-sm">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                Último salvamento
              </div>
              <div className="flex items-center gap-2">
                {lastSaveError ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "—"}
              </div>
              {lastSaveError && (
                <div className="text-xs text-destructive mt-2 font-mono break-all">
                  {lastSaveError}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Log de eventos ({events.length})
          </h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {events.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Nenhum evento registrado nesta sessão. Abra um projeto e edite o canvas para
                  começar a gravar.
                </div>
              ) : (
                events.map((ev, i) => <EventRow key={i} ev={ev} />)
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: AutosaveEvent }) {
  const tone =
    ev.kind === "save:error" || ev.kind === "load:error"
      ? "destructive"
      : ev.kind === "save:success" || ev.kind === "load:success"
        ? "success"
        : ev.kind === "save:start"
          ? "info"
          : "muted";
  const icon =
    ev.kind === "save:start" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
    ) : tone === "destructive" ? (
      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
    ) : tone === "success" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
    ) : (
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    );

  return (
    <div className="flex items-start gap-3 px-4 py-2 text-xs">
      <span className="font-mono text-muted-foreground shrink-0 w-20">
        {new Date(ev.ts).toLocaleTimeString()}
      </span>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <Badge
        variant={tone === "destructive" ? "destructive" : "secondary"}
        className="text-[10px] h-5 shrink-0 font-mono"
      >
        {ev.kind}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="truncate">{ev.message}</div>
        {ev.meta && (
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {Object.entries(ev.meta)
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive" | "warning";
}) {
  const colorClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
        <div className={`text-lg font-mono mt-1 truncate ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
