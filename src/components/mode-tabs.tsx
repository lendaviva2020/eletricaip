import { MODES, type WorkspaceMode } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

export function ModeTabs({
  mode,
  onChange,
}: {
  mode: WorkspaceMode;
  onChange: (m: WorkspaceMode) => void;
}) {
  return (
    <div className="h-11 shrink-0 flex items-end border-b border-border bg-panel/40">
      <div className="flex-1 min-w-0 flex items-end gap-0.5 px-2 overflow-x-auto scrollbar-none">
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              className={cn(
                "relative h-9 px-3 text-xs font-medium rounded-t-md flex items-center gap-2 transition-all shrink-0",
                "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                active && "text-foreground bg-background border border-b-0 border-border",
              )}
            >
              <span>{m.label}</span>
              <span className="hidden lg:inline text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                {m.hint}
              </span>
              {active && (
                <span
                  className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full"
                  style={{ background: "var(--gradient-primary)" }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="hidden sm:flex items-center gap-2 pb-2 pr-3 pl-2 text-[11px] text-muted-foreground shrink-0 border-l border-border/60">
        <Activity className="h-3 w-3 text-success" />
        <span className="font-mono">Sync · 60Hz</span>
      </div>
    </div>
  );
}
