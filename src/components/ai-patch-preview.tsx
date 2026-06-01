import { Plus, Minus, RotateCw, FileEdit } from "lucide-react";
import type { AiDiagramPatch } from "@/lib/diagram/schema";

interface Props {
  patch: AiDiagramPatch;
  onApply: () => void;
  onCancel: () => void;
}

export function AiPatchPreview({ patch, onApply, onCancel }: Props) {
  const addNodes = patch.addNodes ?? [];
  const addEdges = patch.addEdges ?? [];
  const removeNodes = patch.removeNodeIds ?? [];
  const removeEdges = patch.removeEdgeIds ?? [];
  const updateNodes = patch.updateNodes ?? [];

  const totalChanges =
    addNodes.length +
    addEdges.length +
    removeNodes.length +
    removeEdges.length +
    updateNodes.length;

  if (totalChanges === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileEdit className="h-4 w-4 text-muted-foreground" />
          Preview da IA
        </div>
        <p className="text-xs text-muted-foreground">Nenhuma alteração a aplicar.</p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-h-[420px] flex flex-col">
      <div className="flex items-center gap-2 text-sm font-medium shrink-0">
        <FileEdit className="h-4 w-4 text-primary" />
        Preview das alterações da IA
        <span className="text-[10px] text-muted-foreground font-normal ml-auto">
          {totalChanges} mudança{totalChanges > 1 ? "s" : ""}
        </span>
      </div>

      {patch.rationale && (
        <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 rounded px-2.5 py-2 shrink-0">
          {patch.rationale}
        </p>
      )}

      <div className="overflow-auto flex-1 space-y-3 min-h-0 text-xs">
        {addNodes.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-emerald-500 font-medium mb-1">
              <Plus className="h-3.5 w-3.5" />
              Adicionar ({addNodes.length})
            </div>
            <div className="space-y-1">
              {addNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 pl-4 text-muted-foreground font-mono text-[11px]"
                >
                  <span className="text-emerald-500">+</span>
                  <span className="font-semibold text-foreground">{n.label}</span>
                  <span className="text-[10px]">
                    {typeof n.params?.kind === "string" ? n.params.kind : "node"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    ({n.position.x}, {n.position.y})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {removeNodes.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-destructive font-medium mb-1">
              <Minus className="h-3.5 w-3.5" />
              Remover ({removeNodes.length})
            </div>
            <div className="space-y-1">
              {removeNodes.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-2 pl-4 text-muted-foreground font-mono text-[11px]"
                >
                  <span className="text-destructive">-</span>
                  <span>{id}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {addEdges.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-sky-500 font-medium mb-1">
              <Plus className="h-3.5 w-3.5" />
              Conectar ({addEdges.length})
            </div>
            <div className="space-y-1">
              {addEdges.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 pl-4 text-muted-foreground font-mono text-[11px]"
                >
                  <span className="text-sky-500">→</span>
                  <span>{e.source}</span>
                  <span className="text-[10px] text-muted-foreground/60">→</span>
                  <span>{e.target}</span>
                  <span className="text-[10px] px-1 rounded bg-muted/30">{e.kind}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {removeEdges.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-destructive font-medium mb-1">
              <Minus className="h-3.5 w-3.5" />
              Desconectar ({removeEdges.length})
            </div>
            <div className="space-y-1">
              {removeEdges.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-2 pl-4 text-muted-foreground font-mono text-[11px]"
                >
                  <span className="text-destructive">-</span>
                  <span>{id}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {updateNodes.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-amber-500 font-medium mb-1">
              <RotateCw className="h-3.5 w-3.5" />
              Atualizar ({updateNodes.length})
            </div>
            <div className="space-y-1">
              {updateNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 pl-4 text-muted-foreground font-mono text-[11px]"
                >
                  <span className="text-amber-500">~</span>
                  <span>{n.id}</span>
                  {n.label && <span className="text-foreground">→ {n.label}</span>}
                  {n.position && (
                    <span className="text-[10px] text-muted-foreground/60">
                      ({n.position.x}, {n.position.y})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-border shrink-0">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent font-medium cursor-pointer"
        >
          Cancelar
        </button>
        <button
          onClick={onApply}
          className="flex-1 px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium cursor-pointer"
        >
          Aplicar {totalChanges} alteração{totalChanges > 1 ? "ões" : ""}
        </button>
      </div>
    </div>
  );
}
