import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, RotateCcw, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { listProjectVersions, restoreProjectVersion } from "@/lib/projects.functions";
import { useProjectStore } from "@/lib/project-store";
import { Button } from "@/components/ui/button";

export function RevisionHistory() {
  const projectId = useProjectStore((s) => s.projectId);
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const listFn = useServerFn(listProjectVersions);
  const restoreFn = useServerFn(restoreProjectVersion);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["project-versions", projectId],
    queryFn: () => listFn({ data: { projectId: projectId! } }),
    enabled: !!projectId && open,
    staleTime: 10_000,
  });

  if (!projectId) return null;

  const versions = data?.versions ?? [];

  async function handleRestore(versionId: string, versionNumber: number) {
    if (!confirm(`Restaurar o projeto para a versão v${versionNumber}? A versão atual será sobrescrita.`))
      return;
    setRestoring(versionId);
    try {
      const res = await restoreFn({ data: { projectId: projectId!, versionId } });
      if (res.ok) {
        toast.success(`Restaurado para v${res.restoredVersion}. Recarregue o workspace.`);
        // Force reload project data
        qc.invalidateQueries({ queryKey: ["project-export"] });
        window.location.reload();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card/90 backdrop-blur overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) refetch();
        }}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-foreground hover:bg-accent/40 transition-colors cursor-pointer"
      >
        <History className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1 text-left">Histórico de Revisões</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="p-3 text-[10px] text-muted-foreground text-center">Carregando…</div>
          )}
          {!isLoading && versions.length === 0 && (
            <div className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-[10px] text-muted-foreground">
                Nenhuma revisão salva ainda.
              </p>
              <p className="text-[9px] text-muted-foreground/60 mt-1">
                Use o botão "Salvar" no topbar para criar snapshots auditáveis.
              </p>
            </div>
          )}
          {versions.map((v: any) => (
            <div
              key={v.id}
              className="flex items-center gap-2 px-3 py-2 text-[10px] border-b border-border last:border-0 hover:bg-accent/20 transition-colors group"
            >
              <div className="h-5 w-5 rounded-full bg-primary/15 text-primary grid place-items-center text-[9px] font-bold shrink-0">
                v{v.version_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">
                  Revisão #{v.version_number}
                </div>
                <div className="text-muted-foreground font-mono">
                  {new Date(v.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-[9px] cursor-pointer"
                disabled={restoring === v.id}
                onClick={() => handleRestore(v.id, v.version_number)}
              >
                <RotateCcw className="h-3 w-3" />
                {restoring === v.id ? "…" : "Restaurar"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
