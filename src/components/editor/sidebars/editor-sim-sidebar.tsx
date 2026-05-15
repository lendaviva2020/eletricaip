import { Play, Gauge as GaugeIcon } from "lucide-react";
import { SidebarSearch, SidebarShell } from "./sidebar-primitives";

const SPEEDS = [1, 10, 100] as const;
const MODES = ["Unifilar", "Ladder", "Conjunta"] as const;

export function EditorSimSidebar() {
  return (
    <SidebarShell width={240}>
      <SidebarSearch title="Simulação" placeholder="Watch tag..." />
      <div className="px-3 pb-3 space-y-4 overflow-auto scrollbar-thin">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
            Modo
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MODES.map((m) => (
              <button
                key={m}
                className="h-8 rounded border border-border bg-card/60 text-[10px] hover:bg-accent"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
            Velocidade
          </div>
          <div className="grid grid-cols-3 gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className="h-8 rounded border border-border bg-card/60 text-[10px] hover:bg-accent"
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <button className="w-full h-9 rounded bg-primary text-primary-foreground flex items-center justify-center gap-2 text-[11px] hover:opacity-90">
          <Play className="h-3.5 w-3.5" /> Iniciar simulação
        </button>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <GaugeIcon className="h-3 w-3" /> Watch table
          </div>
          <div className="text-[11px] text-muted-foreground italic">Nenhuma tag observada.</div>
        </div>
      </div>
    </SidebarShell>
  );
}
