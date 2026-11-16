/**
 * Structured Text (IEC 61131-3) gerado do programa do FB Electric Studio —
 * da página atual ou do programa inteiro. Somente leitura: a fonte é o
 * diagrama; o ST é a tradução do mesmo modelo usado pela simulação.
 */
import { useMemo, useState } from "react";
import { Copy, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import { studioToStructuredText } from "@/lib/compact-studio/runtime/structured-text";

interface Props {
  readonly model: CompactProgramModel;
  readonly activePageId: string;
}

export function StructuredTextPanel({ model, activePageId }: Props) {
  const [scope, setScope] = useState<"page" | "all">("page");
  const page = model.pages.find((p) => p.id === activePageId);

  const result = useMemo(() => {
    try {
      return studioToStructuredText(model, {
        pageId: scope === "page" ? activePageId : undefined,
        programName: scope === "page" ? (page?.name ?? "Pagina") : model.name,
      });
    } catch (err) {
      return {
        code: `// Falha ao gerar ST: ${err instanceof Error ? err.message : String(err)}`,
        blockCount: 0,
        diagnostics: ["falha na geração"],
      };
    }
  }, [model, scope, activePageId, page?.name]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      toast.success("ST copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const download = () => {
    const blob = new Blob([result.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(scope === "page" ? (page?.name ?? "pagina") : model.name).replace(/[^\w-]+/g, "_")}.st`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-3 gap-2" data-testid="studio-st-panel">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Structured Text (IEC 61131-3)</span>
        <select
          aria-label="Escopo do ST"
          value={scope}
          onChange={(e) => setScope(e.target.value === "all" ? "all" : "page")}
          className="h-7 rounded border border-border bg-card px-2"
        >
          <option value="page">Página atual{page ? ` — ${page.name}` : ""}</option>
          <option value="all">Programa inteiro</option>
        </select>
        <span className="text-muted-foreground">{result.blockCount} blocos</span>
        {result.diagnostics.length > 0 && (
          <span className="text-destructive" role="status">
            {result.diagnostics.length} erro(s) de compilação
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" className="h-7" onClick={copy}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={download}>
            <DownloadSimple className="h-3.5 w-3.5 mr-1" /> .st
          </Button>
        </div>
      </div>
      <pre className="flex-1 min-h-0 overflow-auto rounded border border-border bg-muted/30 p-3 text-[11px] font-mono leading-relaxed">
        {result.code}
      </pre>
    </div>
  );
}
