import { useState, useMemo } from "react";
import { CONSOLE_TABS, type ConsoleTab } from "@/lib/workspace-data";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Terminal as TerminalIcon,
  Wifi,
  Cpu,
  Activity,
  Bell,
  Bot,
  List,
  Radio,
  Zap,
  Plug,
  PlugZap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/project-store";
import { useOpcuaBridge } from "@/hooks/use-opcua-bridge";

const TAB_ICON: Record<ConsoleTab, typeof TerminalIcon> = {
  Logs: List,
  Alarmes: Bell,
  IA: Bot,
  Terminal: TerminalIcon,
  Eventos: Activity,
  "OPC-UA": Radio,
  Modbus: Cpu,
  Runtime: Zap,
};

const SEED: Record<
  ConsoleTab,
  { t: string; tag: string; msg: string; lvl?: "info" | "warn" | "err" | "ok" }[]
> = {
  Logs: [{ t: "—", tag: "RT", msg: "Aguardando ticks do runtime…", lvl: "info" }],
  Alarmes: [{ t: "—", tag: "ALM", msg: "Nenhum alarme ativo", lvl: "ok" }],
  IA: [
    { t: "—", tag: "AI", msg: "Conecte o runtime para ver sugestões em tempo real", lvl: "info" },
  ],
  Terminal: [{ t: "—", tag: "$", msg: "eletricai run --line 03", lvl: "info" }],
  Eventos: [{ t: "—", tag: "EVT", msg: "Nenhum evento registrado", lvl: "info" }],
  "OPC-UA": [{ t: "—", tag: "OPC", msg: "Servidor OPC-UA desconectado", lvl: "warn" }],
  Modbus: [{ t: "—", tag: "MB", msg: "Gateway Modbus TCP: 192.168.1.100:502", lvl: "info" }],
  Runtime: [
    { t: "—", tag: "RT", msg: "Runtime parado. Conecte para iniciar simulação.", lvl: "warn" },
  ],
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
  const runtime = useProjectStore((s) => s.runtime);
  const bridge = useOpcuaBridge();

  const lines = useMemo(() => {
    const live = liveLogs.filter((l) => (l.channel ?? "Logs") === tab);
    return live.length ? live : (SEED[tab] ?? []);
  }, [liveLogs, tab]);

  const TabIcon = TAB_ICON[tab];

  return (
    <div
      className={cn(
        "shrink-0 border-t border-border glass-strong flex flex-col",
        open ? "h-56" : "h-9",
      )}
    >
      <div className="h-9 flex items-center px-2 gap-1 border-b border-border/60">
        <TabIcon className="h-3.5 w-3.5 text-muted-foreground mx-1.5 shrink-0" />
        <span className="text-[11px] font-semibold text-muted-foreground mr-1">{tab}</span>
        <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
          {CONSOLE_TABS.map((c) => {
            const Icon = TAB_ICON[c];
            return (
              <button
                key={c}
                onClick={() => {
                  setTab(c);
                  setOpen(true);
                }}
                className={cn(
                  "h-7 px-2 rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0",
                  tab === c && open
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
                title={c}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{c}</span>
                {c === "Runtime" && (
                  <span
                    className={cn(
                      "ml-0.5 inline-block h-1.5 w-1.5 rounded-full",
                      runtime.connected ? "bg-success" : "bg-destructive",
                    )}
                  />
                )}
                {c === "Alarmes" && (
                  <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive energized" />
                )}
                {c === "OPC-UA" && (
                  <span
                    className={cn(
                      "ml-0.5 inline-block h-1.5 w-1.5 rounded-full",
                      bridge.opcua.status === "connected"
                        ? "bg-success"
                        : bridge.opcua.status === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/40",
                    )}
                  />
                )}
                {c === "Modbus" && (
                  <span
                    className={cn(
                      "ml-0.5 inline-block h-1.5 w-1.5 rounded-full",
                      bridge.modbus.status === "connected"
                        ? "bg-success"
                        : bridge.modbus.status === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/40",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {tab === "Runtime" && runtime.connected && (
            <span className="text-[10px] text-success font-mono mr-1">
              {runtime.cycleMs ?? 0}ms
            </span>
          )}
          {tab === "Modbus" && <Wifi className="h-3 w-3 text-muted-foreground" />}
          <button
            onClick={() => {
              const store = useProjectStore.getState();
              store.setAll(store.nodes, store.edges);
            }}
            className="h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"
            title="Limpar console"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="flex-1 overflow-auto scrollbar-thin font-mono text-[11px] px-3 py-2 space-y-0.5">
          {tab === "Runtime" && (
            <div className="flex gap-4 mb-2 pb-2 border-b border-border/40 text-[10px]">
              <span className="text-muted-foreground">
                Status:{" "}
                <span className={runtime.connected ? "text-success" : "text-destructive"}>
                  {runtime.connected ? "Conectado" : "Desconectado"}
                </span>
              </span>
              <span className="text-muted-foreground">
                Fonte: <span className="text-foreground">{runtime.source}</span>
              </span>
              {runtime.lastTick && (
                <span className="text-muted-foreground">
                  Último tick:{" "}
                  <span className="text-foreground">
                    {new Date(runtime.lastTick).toLocaleTimeString()}
                  </span>
                </span>
              )}
              {runtime.cycleMs && (
                <span className="text-muted-foreground">
                  Ciclo: <span className="text-foreground">{runtime.cycleMs}ms</span>
                </span>
              )}
            </div>
          )}
          {tab === "OPC-UA" && (
            <div className="flex gap-4 mb-2 pb-2 border-b border-border/40 text-[10px]">
              <span className="text-muted-foreground">
                Endpoint: <span className="text-foreground">{bridge.opcua.endpoint}</span>
              </span>
              <span className="text-muted-foreground">
                Status:{" "}
                <span
                  className={cn(
                    bridge.opcua.status === "connected"
                      ? "text-success"
                      : bridge.opcua.status === "error"
                        ? "text-destructive"
                        : "text-warning",
                  )}
                >
                  {bridge.opcua.status === "connected"
                    ? "Conectado"
                    : bridge.opcua.status === "connecting"
                      ? "Conectando..."
                      : bridge.opcua.status === "error"
                        ? bridge.opcua.error
                        : "Desconectado"}
                </span>
              </span>
              {bridge.opcua.connectedAt && (
                <span className="text-muted-foreground">
                  Desde:{" "}
                  <span className="text-foreground">
                    {new Date(bridge.opcua.connectedAt).toLocaleTimeString()}
                  </span>
                </span>
              )}
              {bridge.opcua.tags.length > 0 && (
                <span className="text-muted-foreground">
                  Tags: <span className="text-foreground">{bridge.opcua.tags.length}</span>
                </span>
              )}
              <button
                onClick={() => {
                  if (bridge.opcua.status === "connected") {
                    bridge.opcua.disconnect();
                  } else {
                    bridge.opcua.connect({ endpoint: bridge.opcua.endpoint });
                  }
                }}
                className="ml-auto h-6 px-2 rounded text-[10px] font-medium transition-colors hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {bridge.opcua.isConnecting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                ) : bridge.opcua.status === "connected" ? (
                  <PlugZap className="h-3 w-3" />
                ) : (
                  <Plug className="h-3 w-3" />
                )}
                {bridge.opcua.status === "connected" ? "Desconectar" : "Conectar"}
              </button>
            </div>
          )}
          {tab === "Modbus" && (
            <div className="flex gap-4 mb-2 pb-2 border-b border-border/40 text-[10px]">
              <span className="text-muted-foreground">
                Gateway:{" "}
                <span className="text-foreground">
                  {bridge.modbus.host}:{bridge.modbus.port}
                </span>
              </span>
              <span className="text-muted-foreground">
                Status:{" "}
                <span
                  className={cn(
                    bridge.modbus.status === "connected"
                      ? "text-success"
                      : bridge.modbus.status === "error"
                        ? "text-destructive"
                        : "text-warning",
                  )}
                >
                  {bridge.modbus.status === "connected"
                    ? "Conectado"
                    : bridge.modbus.status === "connecting"
                      ? "Conectando..."
                      : bridge.modbus.status === "error"
                        ? bridge.modbus.error
                        : "Desconectado"}
                </span>
              </span>
              {bridge.modbus.connectedAt && (
                <span className="text-muted-foreground">
                  Desde:{" "}
                  <span className="text-foreground">
                    {new Date(bridge.modbus.connectedAt).toLocaleTimeString()}
                  </span>
                </span>
              )}
              {bridge.modbus.values.length > 0 && (
                <span className="text-muted-foreground">
                  Registros: <span className="text-foreground">{bridge.modbus.values.length}</span>
                </span>
              )}
              <button
                onClick={() => {
                  if (bridge.modbus.status === "connected") {
                    bridge.modbus.disconnect();
                  } else {
                    bridge.modbus.connect({
                      host: bridge.modbus.host,
                      port: bridge.modbus.port,
                      unitId: 1,
                    });
                  }
                }}
                className="ml-auto h-6 px-2 rounded text-[10px] font-medium transition-colors hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {bridge.modbus.isConnecting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                ) : bridge.modbus.status === "connected" ? (
                  <PlugZap className="h-3 w-3" />
                ) : (
                  <Plug className="h-3 w-3" />
                )}
                {bridge.modbus.status === "connected" ? "Desconectar" : "Conectar"}
              </button>
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-muted-foreground/70 w-20 shrink-0 font-mono">{l.t}</span>
              <span className="text-primary/80 w-28 shrink-0 truncate font-semibold">{l.tag}</span>
              <span className={cn("flex-1 break-all", l.lvl && lvlColor[l.lvl])}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
