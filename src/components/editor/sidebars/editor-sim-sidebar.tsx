import { useState, useEffect } from "react";
import { Play, Square, Eye, Sliders, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { SidebarSearch, SidebarShell } from "./sidebar-primitives";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";
import { startLocalSimulation, disconnect, isLocalRunning } from "@/lib/runtime-client";

const SPEEDS = [1, 10, 100] as const;
const MODES = ["Unifilar", "Ladder", "SCADA Conjunta"] as const;

export function EditorSimSidebar() {
  const [activeMode, setActiveMode] = useState<typeof MODES[number]>("SCADA Conjunta");
  const [activeSpeed, setActiveSpeed] = useState<typeof SPEEDS[number]>(1);
  const [running, setRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const editorTags = useEditorStore((s) => s.tags);
  const forceTagValue = useEditorStore((s) => s.forceTagValue);
  const releaseTag = useEditorStore((s) => s.releaseTag);

  const projectTags = useProjectStore((s) => s.tags);
  const runtime = useProjectStore((s) => s.runtime);

  // Keep simulation running state synced with the runtime client
  useEffect(() => {
    const checkState = () => {
      setRunning(isLocalRunning() || runtime.connected);
    };
    checkState();
    const interval = setInterval(checkState, 250);
    return () => clearInterval(interval);
  }, [runtime]);

  const toggleSimulation = async () => {
    if (running) {
      await disconnect();
      setRunning(false);
    } else {
      startLocalSimulation();
      setRunning(true);
    }
  };

  // Build list of active tags from both stores
  const allTags: Array<{
    id: string;
    name: string;
    source: "plc" | "scada";
    type: "BOOL" | "INT" | "REAL" | "STRING";
    value: boolean | number | string;
    forced: boolean;
  }> = [];

  // 1. Add Ladder PLC tags
  Object.values(editorTags).forEach((t) => {
    allTags.push({
      id: t.id,
      name: t.name,
      source: "plc",
      type: t.type,
      value: t.value,
      forced: t.forced,
    });
  });

  // 2. Add SCADA / HMI tags
  Object.entries(projectTags).forEach(([key, val]) => {
    // Avoid duplication if the tag matches a PLC tag name
    if (allTags.find((t) => t.name.toUpperCase() === key.toUpperCase())) return;

    allTags.push({
      id: `scada-${key}`,
      name: key,
      source: "scada",
      type: typeof val === "boolean" ? "BOOL" : "REAL",
      value: val,
      forced: false,
    });
  });

  // Filter tags by search query
  const filteredTags = allTags.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleBool = (tagId: string, currentVal: boolean, source: "plc" | "scada") => {
    if (source === "plc") {
      forceTagValue(tagId, !currentVal);
    } else {
      const tagName = tagId.replace("scada-", "");
      useProjectStore.getState().tags[tagName] = !currentVal;
      useProjectStore.setState((s) => ({ tags: { ...s.tags } }));
    }
  };

  const handleSliderChange = (tagId: string, val: number, source: "plc" | "scada") => {
    if (source === "plc") {
      forceTagValue(tagId, val);
    } else {
      const tagName = tagId.replace("scada-", "");
      useProjectStore.getState().tags[tagName] = val;
      useProjectStore.setState((s) => ({ tags: { ...s.tags } }));
    }
  };

  const handleRelease = (tagId: string, source: "plc" | "scada") => {
    if (source === "plc") {
      releaseTag(tagId);
    }
  };

  return (
    <SidebarShell width={240}>
      <div className="p-3 border-b border-border bg-card/10 shrink-0">
        <div className="flex items-center justify-between text-[11px] font-display font-semibold uppercase tracking-wider mb-2 text-foreground">
          <span>Controles de Simulação</span>
          {running && <span className="h-1.5 w-1.5 rounded-full bg-success energized" />}
        </div>

        {/* Start / Stop Trigger */}
        <button
          onClick={toggleSimulation}
          style={{ background: running ? "none" : "var(--gradient-primary)" }}
          className={`w-full h-9 rounded flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer border transition-all ${
            running
              ? "border-destructive text-destructive hover:bg-destructive/10"
              : "border-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {running ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Parar Simulação</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Iniciar Simulação</span>
            </>
          )}
        </button>
      </div>

      <div className="px-3 py-3 space-y-4 overflow-auto scrollbar-thin flex-1">
        {/* MODE SELECTOR */}
        <div>
          <div className="text-[9px] uppercase font-display font-semibold tracking-[0.16em] text-muted-foreground mb-1.5">
            Modo Operacional
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setActiveMode(m)}
                className={`h-8 rounded border text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  activeMode === m
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-accent"
                }`}
              >
                {m.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* SPEED SELECTOR */}
        <div>
          <div className="text-[9px] uppercase font-display font-semibold tracking-[0.16em] text-muted-foreground mb-1.5">
            Velocidade do Processo
          </div>
          <div className="grid grid-cols-3 gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSpeed(s)}
                className={`h-8 rounded border text-[10px] font-mono cursor-pointer transition-all ${
                  activeSpeed === s
                    ? "bg-primary/20 border-primary text-primary animate-pulse"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* SEARCH FILTER */}
        <div>
          <div className="text-[9px] uppercase font-display font-semibold tracking-[0.16em] text-muted-foreground mb-1">
            Buscar Var / Tag
          </div>
          <input
            type="text"
            placeholder="M01.SPEED, %I0.0..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 px-2 rounded bg-input border border-border text-[11px] outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        </div>

        {/* WATCH TABLE */}
        <div className="space-y-2">
          <div className="text-[9px] uppercase font-display font-semibold tracking-[0.16em] text-muted-foreground flex items-center justify-between">
            <span>Watch List / Forçamento</span>
            <span className="text-[8px] font-mono text-primary uppercase">
              {filteredTags.length} tags
            </span>
          </div>

          {filteredTags.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic text-center p-3 border border-dashed border-border/40 rounded bg-card/20">
              Nenhuma variável ativa.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTags.map((tag) => {
                const isBool = tag.type === "BOOL" || typeof tag.value === "boolean";
                const numVal = Number(tag.value) || 0;

                return (
                  <div
                    key={tag.id}
                    className={`p-2 rounded border border-border/50 bg-card/40 flex flex-col gap-1.5 transition-all ${
                      tag.forced ? "border-warning/40 bg-warning/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold tracking-tight text-foreground truncate max-w-[130px]" title={tag.name}>
                        {tag.name}
                      </span>
                      <span className={`text-[8px] font-mono font-semibold px-1 rounded uppercase ${
                        tag.source === "plc" ? "bg-primary/20 text-primary" : "bg-success/20 text-success"
                      }`}>
                        {tag.source}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {isBool ? (
                        <button
                          onClick={() => handleToggleBool(tag.id, Boolean(tag.value), tag.source)}
                          className={`h-6 px-2 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer border transition-all ${
                            tag.value
                              ? "bg-success/20 border-success text-success"
                              : "bg-muted-foreground/10 border-border text-muted-foreground"
                          }`}
                        >
                          {tag.value ? "TRUE" : "FALSE"}
                        </button>
                      ) : (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={numVal}
                            onChange={(e) => handleSliderChange(tag.id, Number(e.target.value), tag.source)}
                            className="flex-1 accent-primary h-1 bg-input rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-[10px] font-mono text-muted-foreground min-w-[30px] text-right">
                            {numVal.toFixed(0)}
                          </span>
                        </div>
                      )}

                      {tag.forced && (
                        <button
                          onClick={() => handleRelease(tag.id, tag.source)}
                          title="Liberar Forçamento (Release)"
                          className="h-6 w-6 rounded bg-warning/20 border border-warning/40 text-warning flex items-center justify-center cursor-pointer hover:bg-warning/35 transition-all"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SidebarShell>
  );
}
