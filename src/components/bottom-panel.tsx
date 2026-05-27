import { useState, useMemo } from "react";
import { CONSOLE_TABS, type ConsoleTab } from "@/lib/workspace-data";
import { ChevronDown, ChevronUp, Trash2, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/project-store";

const SEED: Partial<
  Record<
    ConsoleTab,
    { t: string; tag: string; msg: string; lvl?: "info" | "warn" | "err" | "ok" }[]
  >
> = {
  Logs: [{ t: "—", tag: "RT", msg: "Aguardando ticks do runtime…", lvl: "info" }],
  IA: [
    { t: "—", tag: "AI", msg: "Conecte o runtime para ver sugestões em tempo real", lvl: "info" },
  ],
  Terminal: [{ t: "—", tag: "$", msg: "eletricai run --line 03", lvl: "info" }],
};

const lvlColor = {
  info: "text-foreground",
  warn: "text-warning",
  err: "text-destructive",
  ok: "text-success",
};

export function BottomPanel() {
  const [tab, setTab] = useState<ConsoleTab>("Logs");
  const [open, setOpen] = useState(true);
  const liveLogs = useProjectStore((s) => s.logs);
  const lines = useMemo(() => {
    const live = liveLogs.filter((l) => (l.channel ?? "Logs") === tab);
    return live.length ? live : (SEED[tab] ?? []);
  }, [liveLogs, tab]);

  return (
    <div
      className={cn(
        "shrink-0 border-t border-border glass-strong flex flex-col",
        open ? "h-56" : "h-9",
      )}
    >
      <div className="h-9 flex items-center px-2 gap-1 border-b border-border/60">
        <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground mx-1.5" />
        {CONSOLE_TABS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setTab(c);
              setOpen(true);
            }}
            className={cn(
              "h-7 px-2.5 rounded text-[11px] font-medium transition-colors",
              tab === c && open
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {c}
            {c === "Alarmes" && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive energized" />
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            className="h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"
            title="Limpar console"
            aria-label="Limpar console"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"
            title={open ? "Recolher painel inferior" : "Expandir painel inferior"}
            aria-label={open ? "Recolher painel inferior" : "Expandir painel inferior"}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="flex-1 overflow-auto scrollbar-thin font-mono text-[11px] px-3 py-2 space-y-0.5">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-muted-foreground/70 w-20 shrink-0">{l.t}</span>
              <span className="text-primary/80 w-32 shrink-0 truncate">{l.tag}</span>
              <span className={cn("flex-1", l.lvl && lvlColor[l.lvl])}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
