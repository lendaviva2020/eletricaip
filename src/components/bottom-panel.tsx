import { useState } from "react";
import { CONSOLE_TABS, type ConsoleTab } from "@/lib/workspace-data";
import { ChevronDown, ChevronUp, Trash2, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const LOGS: Record<ConsoleTab, { t: string; tag: string; msg: string; lvl?: "info" | "warn" | "err" | "ok" }[]> = {
  Logs: [
    { t: "12:42:18", tag: "PLC", msg: "OB1 cycle 8.2 ms · OK", lvl: "ok" },
    { t: "12:42:17", tag: "SCADA", msg: "Tag TQ101.NIVEL = 64.2", lvl: "info" },
    { t: "12:42:15", tag: "SIM", msg: "Solver step #12340 OK", lvl: "info" },
    { t: "12:42:10", tag: "AI", msg: "Sugestão: aumentar setpoint TQ-101 em 4%", lvl: "info" },
  ],
  Alarmes: [
    { t: "12:42:18", tag: "ALM-1042", msg: "Nível alto TQ-101 (92.4%)", lvl: "err" },
    { t: "12:39:02", tag: "ALM-1041", msg: "Sobrecarga térmica M-03", lvl: "err" },
  ],
  IA: [
    { t: "12:41:00", tag: "AI", msg: "Detectado cabo subdimensionado em CCM-03 → NBR 5410 §6.2.6", lvl: "warn" },
    { t: "12:40:55", tag: "AI", msg: "Recomenda intertravamento entre M-01 e V-303", lvl: "info" },
  ],
  Terminal: [{ t: "12:40:00", tag: "$", msg: "eletricai run --line 03", lvl: "info" }],
  Eventos: [{ t: "12:35:00", tag: "EVT", msg: "Operador admin entrou em modo Run", lvl: "info" }],
  "OPC-UA": [{ t: "12:42:18", tag: "ns=2;i=1042", msg: "TQ-101.NIVEL = 64.2 GOOD", lvl: "ok" }],
  Modbus: [{ t: "12:42:18", tag: "HR[40001]", msg: "= 1450 (P-201 speed)", lvl: "info" }],
  Runtime: [{ t: "12:42:18", tag: "RT", msg: "Heap 42 MB · 142 tags · 0 erros", lvl: "ok" }],
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
  const lines = LOGS[tab] ?? [];

  return (
    <div className={cn("shrink-0 border-t border-border glass-strong flex flex-col", open ? "h-56" : "h-9")}>
      <div className="h-9 flex items-center px-2 gap-1 border-b border-border/60">
        <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground mx-1.5" />
        {CONSOLE_TABS.map((c) => (
          <button
            key={c}
            onClick={() => { setTab(c); setOpen(true); }}
            className={cn(
              "h-7 px-2.5 rounded text-[11px] font-medium transition-colors",
              tab === c && open
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {c}
            {c === "Alarmes" && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive energized" />
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button className="h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"><Trash2 className="h-3.5 w-3.5"/></button>
          <button onClick={() => setOpen((o) => !o)} className="h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground">
            {open ? <ChevronDown className="h-3.5 w-3.5"/> : <ChevronUp className="h-3.5 w-3.5"/>}
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
