import { useEffect, useState } from "react";
import { KonvaCanvas } from "./konva-canvas";
import Editor from "@monaco-editor/react";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Terminal,
  AlertTriangle,
  ShieldCheck,
  Code2,
  ChevronLeft,
  ChevronRight,
  Bell,
  CheckCircle2,
} from "lucide-react";

const DEFAULT_SCRIPT = `// ==========================================
// SCRIPT DE ANIMAÇÃO HMI / SCADA (EletricAI)
// ==========================================
// Controla tags em tempo real através de JavaScript!

// 1. Inicialização de tags
if (typeof tags["TANQUE_NIVEL"] === "undefined") tags["TANQUE_NIVEL"] = 45;
if (typeof tags["TEMP_M01"] === "undefined") tags["TEMP_M01"] = 25.0;

// 2. Lógica de Aquecimento do Motor (SP_SPEED)
const speed = tags["SP_SPEED"] || 0;
if (tags["MOTOR_ON"] === true || tags["CMD_START"] === true) {
  // Aquece proporcionalmente à velocidade
  const targetTemp = 30 + (speed * 0.85);
  if (tags["TEMP_M01"] < targetTemp) {
    tags["TEMP_M01"] = Math.round((tags["TEMP_M01"] + 0.6) * 10) / 10;
  }
} else {
  // Resfria gradualmente até a temperatura ambiente
  if (tags["TEMP_M01"] > 25) {
    tags["TEMP_M01"] = Math.round((tags["TEMP_M01"] - 0.3) * 10) / 10;
  }
}

// 3. Controle de Fluxo do Tanque (Bomba/Válvula)
if (tags["PUMP_ON"] === true) {
  tags["TANQUE_NIVEL"] = Math.min(100, tags["TANQUE_NIVEL"] + 1.2);
}
if (tags["VALVE_OPEN"] === true) {
  tags["TANQUE_NIVEL"] = Math.max(0, tags["TANQUE_NIVEL"] - 1.6);
}

// 4. Gestão de Alarmes (ISA-18.2)
if (tags["TEMP_M01"] > 85) {
  tags["ALARM_ACTIVE"] = true;
  tags["ALARM_MSG"] = "TEMPERATURA DO MOTOR CRÍTICA (" + tags["TEMP_M01"] + "°C)";
} else if (tags["TANQUE_NIVEL"] > 95) {
  tags["ALARM_ACTIVE"] = true;
  tags["ALARM_MSG"] = "ALTO NÍVEL DO TANQUE (" + tags["TANQUE_NIVEL"] + "%)";
} else {
  // Reseta se as condições estiverem normalizadas
  tags["ALARM_ACTIVE"] = false;
}
`;

export function ScadaCanvas() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);

  const tags = useProjectStore((s) => s.tags);
  const applyTick = useProjectStore((s) => s.applyTick);
  const pushLog = useProjectStore((s) => s.pushLog);

  const isAlarmActive = tags["ALARM_ACTIVE"] === true;
  const alarmMsg = String(tags["ALARM_MSG"] || "Alta Temperatura no Motor Principal!");

  // Monaco Script Execution loop running at 100ms
  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      try {
        const nextTags = { ...tags };
        // Clean executor passing current tags
        const runScript = new Function("tags", script);
        runScript(nextTags);

        // Sync to state
        applyTick({ tags: nextTags });

        // Acknowledge alarm logger in runtime console
        if (nextTags["ALARM_ACTIVE"] && !tags["ALARM_ACTIVE"]) {
          pushLog({
            t: new Date().toLocaleTimeString(),
            tag: "ALARME SCADA",
            msg: String(nextTags["ALARM_MSG"]),
            lvl: "err",
            channel: "Alarmes",
          });
        }

        // Sync to EditorStore for Ladder synchronization
        const editorState = useEditorStore.getState();
        Object.entries(nextTags).forEach(([name, value]) => {
          const existing = Object.values(editorState.tags).find((t) => t.name === name);
          if (existing) {
            editorState.setTagValue(existing.id, value);
          } else {
            const type =
              typeof value === "boolean" ? "BOOL" : typeof value === "number" ? "REAL" : "STRING";
            editorState.upsertTag({
              id: `tag-${name}`,
              name,
              type,
              value,
              forced: false,
            });
          }
        });

        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [running, script, tags, applyTick, pushLog]);

  const acknowledgeAlarm = () => {
    applyTick({
      tags: { ...tags, ALARM_ACTIVE: false },
    });
    pushLog({
      t: new Date().toLocaleTimeString(),
      tag: "ALARME SCADA",
      msg: "Alarme reconhecido pelo operador.",
      lvl: "ok",
      channel: "Alarmes",
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden select-none">
      {/* AREA DO CANVAS */}
      <div className="flex-1 min-w-0 relative flex flex-col">
        {/* Pulsing Alarm Banner (ISA-18.2) */}
        {isAlarmActive && (
          <div className="absolute top-16 left-4 right-4 z-30 p-3 rounded-lg border border-destructive bg-destructive/15 backdrop-blur flex items-center justify-between shadow-lg animate-pulse pointer-events-auto">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-destructive shrink-0" />
              <span className="font-mono text-[11px] font-bold text-destructive">
                🚨 ALARME ATIVO: {alarmMsg}
              </span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={acknowledgeAlarm}
              className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
              Reconhecer
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <KonvaCanvas variant="scada" />
        </div>
      </div>

      {/* SCRIPTER SIDEBAR */}
      <div
        className={`shrink-0 border-l border-border bg-background/80 backdrop-blur flex flex-col transition-all duration-300 relative ${
          editorOpen ? "w-[400px]" : "w-0 overflow-hidden border-l-0"
        }`}
      >
        {/* Handle toggle button */}
        <button
          onClick={() => setEditorOpen((o) => !o)}
          className={`absolute top-1/2 -translate-y-1/2 z-30 h-12 w-4 bg-panel/85 backdrop-blur border border-border rounded-l flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all ${
            editorOpen ? "-left-4" : "-left-4 border-r-0"
          }`}
          title={editorOpen ? "Ocultar Editor Script" : "Mostrar Editor Script"}
        >
          {editorOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        {editorOpen && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-card/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Scripting de Animação
                </span>
              </div>
              <Button
                size="sm"
                variant={running ? "destructive" : "default"}
                onClick={() => setRunning((r) => !r)}
                className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
              >
                {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {running ? "Pausar" : "Executar"}
              </Button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-h-0 border-b border-border">
              <Editor
                height="100%"
                language="javascript"
                theme="vs-dark"
                value={script}
                onChange={(v) => setScript(v || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  lineNumbers: "on",
                  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
                }}
              />
            </div>

            {/* Console and Errors footer */}
            <div className="h-32 bg-card/45 backdrop-blur p-2 font-mono text-[10px] overflow-auto flex flex-col gap-1.5 scrollbar-thin">
              <div className="flex items-center gap-1.5 text-muted-foreground border-b border-border pb-1 mb-1">
                <Terminal className="h-3.5 w-3.5" />
                <span>LOGS E ERROS DE SCRIPT</span>
              </div>
              {error ? (
                <div className="text-destructive flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Erro: {error}</span>
                </div>
              ) : running ? (
                <div className="text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" />
                  <span>Script em execução... Ticks a 100ms</span>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Aguardando execução... Clique no botão "Executar" para iniciar.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
