import { useState, useMemo } from "react";
import { Gauge, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { LADDER_ELEMENTS, type LadderElement } from "@/lib/ladder/definitions";
import { PaletteGroup, SidebarShell } from "./sidebar-primitives";
import { Search } from "lucide-react";

export function EditorLadderSidebar() {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"supported" | "all">("supported");

  const filteredElements = useMemo(() => {
    return LADDER_ELEMENTS.filter((e) => {
      if (filterMode === "supported" && !e.supported) return false;
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        e.id.toLowerCase().includes(term) ||
        e.label.toLowerCase().includes(term) ||
        e.symbol.toLowerCase().includes(term) ||
        e.category.toLowerCase().includes(term)
      );
    });
  }, [search, filterMode]);

  const categories = useMemo(() => {
    return Array.from(new Set(filteredElements.map((e) => e.category)));
  }, [filteredElements]);

  return (
    <SidebarShell width={240}>
      <div className="h-9 flex items-center px-3 border-b border-border text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Elementos Ladder (IEC 61131-3)
      </div>

      <div className="p-2 space-y-2 border-b border-border/60">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar elementos Ladder"
            title="Buscar elementos Ladder"
            placeholder="XIC, OTE, TON..."
            className="w-full h-7 pl-8 pr-2 rounded bg-input/60 border border-border text-[11px] outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Abas de filtro: Suportados vs Roadmap */}
        <div className="grid grid-cols-2 gap-1 bg-muted/40 p-0.5 rounded text-[10px]">
          <button
            type="button"
            onClick={() => setFilterMode("supported")}
            className={`py-1 rounded flex items-center justify-center gap-1 transition-colors ${
              filterMode === "supported"
                ? "bg-background text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Ativos (9)
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`py-1 rounded flex items-center justify-center gap-1 transition-colors ${
              filterMode === "all"
                ? "bg-background text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-3 w-3 text-amber-500" />
            Todos
          </button>
        </div>
      </div>

      <div className="px-2 py-2 space-y-3 overflow-auto scrollbar-thin">
        {categories.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            Nenhum elemento encontrado.
          </div>
        ) : (
          categories.map((category) => (
            <PaletteGroup key={category} icon={Gauge} title={category}>
              {filteredElements
                .filter((e) => e.category === category)
                .map((element) => (
                  <LadderPaletteItem key={element.id} element={element} />
                ))}
            </PaletteGroup>
          ))
        )}
      </div>
    </SidebarShell>
  );
}

function LadderPaletteItem({ element }: { element: LadderElement }) {
  const isSupported = element.supported === true;

  return (
    <button
      type="button"
      draggable={isSupported}
      title={
        isSupported
          ? `${element.label}: ${element.description} (Arrastável para o grid)`
          : `${element.label}: ${element.description} [Planejado Q1 - Use o editor FBD/ST para blocos complexos]`
      }
      onDragStart={(event) => {
        if (!isSupported) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("application/ladder-element", element.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => {
        if (!isSupported) {
          toast.info(
            `"${element.label}" está planejado para o Q1. Para lógica matemática, comparadores e shifts, utilize o editor FBD ou Structured Text.`,
          );
        }
      }}
      className={`group flex items-center justify-between w-full px-2 py-1.5 rounded text-[11px] border transition-all text-left ${
        isSupported
          ? "text-foreground/85 hover:bg-accent hover:text-foreground border-transparent hover:border-border cursor-grab active:cursor-grabbing"
          : "text-muted-foreground/50 bg-muted/10 border-transparent cursor-not-allowed opacity-60 hover:opacity-90"
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        <span
          className={`w-12 shrink-0 font-mono text-[10px] ${
            isSupported ? "text-primary font-semibold" : "text-muted-foreground/60"
          }`}
        >
          {element.symbol}
        </span>
        <span className="truncate">{element.label}</span>
      </div>

      {!isSupported && (
        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-sans border border-amber-500/20 font-medium">
          Q1
        </span>
      )}
    </button>
  );
}
