import { useState, useEffect } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Pause, Play, RefreshCw, Activity, Layers, Disc } from "lucide-react";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";

interface DataPoint {
  t: number;
  speed: number;
  current: number;
  level: number;
  valve: number;
}

export function SimCanvas() {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [paused, setPaused] = useState(false);
  const [bufferSize, setBufferSize] = useState(60); // 60 ticks history
  const [activeTab, setActiveTab] = useState<"all" | "speed" | "tank">("all");

  const projectTags = useProjectStore((s) => s.tags);
  const editorTags = useEditorStore((s) => s.tags);

  // Poll active tag values from stores and buffer them in state
  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      // 1. Gather live values from both stores
      // Search for any speed, current, level or valve position tags
      let speed = 0;
      let current = 0;
      let level = 50;
      let valve = 0;

      // Extract from useProjectStore (SCADA/Physical twin)
      Object.entries(projectTags).forEach(([key, val]) => {
        const uKey = key.toUpperCase();
        if (uKey.includes("SPEED") || uKey.includes("VELOCIDADE")) speed = Number(val);
        else if (uKey.includes("CURRENT") || uKey.includes("CORRENTE")) current = Number(val);
        else if (uKey.includes("NIVEL") || uKey.includes("LEVEL")) level = Number(val);
        else if (uKey.includes("POS") || uKey.includes("VALVE")) valve = Number(val);
      });

      // Extract from useEditorStore (Ladder PLC variables)
      Object.values(editorTags).forEach((tag) => {
        const name = tag.name.toUpperCase();
        if (name === "SP_SPEED" || name === "VELOCIDADE") speed = Number(tag.value);
        else if (name === "TANQUE_NIVEL" || name === "NIVEL") level = Number(tag.value);
        else if (name === "TEMP_M01")
          current = Number(tag.value) / 5; // scaled down for current visualizer
        else if (name === "VALVE_OPEN" || name === "POS") valve = tag.value ? 100 : 0;
      });

      // Fallbacks if nothing is active
      if (speed === 0 && useProjectStore.getState().runtime.connected) {
        speed = 1200 + Math.sin(Date.now() / 1000) * 80;
      }
      if (current === 0 && speed > 0) {
        current = 12 + Math.abs(Math.sin(Date.now() / 800)) * 5;
      }
      if (level === 50 && useProjectStore.getState().runtime.connected) {
        level = 45 + Math.sin(Date.now() / 4000) * 15;
      }

      setDataPoints((prev) => {
        const next = [...prev];
        const nextTime = prev.length > 0 ? prev[prev.length - 1].t + 1 : 0;
        next.push({
          t: nextTime,
          speed: parseFloat(speed.toFixed(1)),
          current: parseFloat(current.toFixed(1)),
          level: parseFloat(level.toFixed(1)),
          valve: parseFloat(valve.toFixed(1)),
        });

        if (next.length > bufferSize) {
          next.shift();
        }
        return next;
      });
    }, 150); // tick rate matches simulation cycles

    return () => clearInterval(interval);
  }, [projectTags, editorTags, paused, bufferSize]);

  const clearBuffer = () => setDataPoints([]);

  const isLive = useProjectStore((s) => s.runtime.connected);

  return (
    <div className="relative h-full w-full overflow-auto p-6 pt-16 pb-20 bg-[--canvas-bg]">
      <FloatingLegend
        title="Osciloscópio & Telemetria"
        items={[
          `Status: ${isLive ? "LIVE Ticks" : "PAUSED"}`,
          "Solver: Determinístico",
          `Buffer: ${bufferSize}s`,
        ]}
      />

      {/* TOOLBAR CONTROLS */}
      <div className="flex items-center gap-2 mb-4 shrink-0 bg-card/40 p-2 rounded border border-border/80">
        <button
          onClick={() => setPaused(!paused)}
          className="h-8 px-3 rounded bg-primary/10 hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20 inline-flex items-center gap-1.5 cursor-pointer"
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          <span>{paused ? "Iniciar Plot" : "Pausar Plot"}</span>
        </button>

        <button
          onClick={clearBuffer}
          className="h-8 px-3 rounded border border-border bg-card/60 hover:bg-accent text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Limpar</span>
        </button>

        <div className="h-4 w-px bg-border mx-2" />

        <span className="text-[10px] text-muted-foreground uppercase font-semibold font-display">
          Período do Buffer:
        </span>
        {[30, 60, 120].map((size) => (
          <button
            key={size}
            onClick={() => {
              setBufferSize(size);
              clearBuffer();
            }}
            className={`h-7 px-2 rounded text-[10px] font-mono border cursor-pointer ${
              bufferSize === size
                ? "bg-primary/20 border-primary text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:bg-accent/40"
            }`}
          >
            {size}s
          </button>
        ))}

        <div className="h-4 w-px bg-border mx-2" />

        <div className="flex gap-1">
          {(["all", "speed", "tank"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-7 px-2.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card/40 text-muted-foreground hover:bg-accent"
              }`}
            >
              {tab === "all" ? "Todos" : tab === "speed" ? "Motor" : "Tanque"}
            </button>
          ))}
        </div>
      </div>

      {/* REAL-TIME CHARTS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(activeTab === "all" || activeTab === "speed") && (
          <>
            {/* 1. Velocidade Motor Plot */}
            <ChartCard
              label="Velocidade Angular (rpm)"
              color="oklch(0.78 0.17 200)" // Ciano
              data={dataPoints}
              dataKey="speed"
              unit=" rpm"
            />
            {/* 2. Corrente Motor Plot */}
            <ChartCard
              label="Corrente RMS (A)"
              color="oklch(0.66 0.22 25)" // Vermelho
              data={dataPoints}
              dataKey="current"
              unit=" A"
            />
          </>
        )}

        {(activeTab === "all" || activeTab === "tank") && (
          <>
            {/* 3. Nível do Tanque Plot */}
            <ChartCard
              label="Nível Hidrostático (%)"
              color="oklch(0.72 0.16 250)" // Azul
              data={dataPoints}
              dataKey="level"
              unit="%"
            />
            {/* 4. Abertura Válvula Plot */}
            <ChartCard
              label="Abertura da Válvula (%)"
              color="oklch(0.86 0.20 90)" // Amarelo
              data={dataPoints}
              dataKey="valve"
              unit="%"
            />
          </>
        )}
      </div>

      <BottomStrip
        items={[
          ["Taxa de Scan", "50 ms"],
          ["Visualização", paused ? "Pausada" : "Tempo Real"],
          ["Amostras", `${dataPoints.length} pts`],
          ["Qualidade", isLive ? "100% Excelente" : "Sem Sinal"],
        ]}
      />
    </div>
  );
}

function ChartCard({
  label,
  color,
  data,
  dataKey,
  unit,
}: {
  label: string;
  color: string;
  data: DataPoint[];
  dataKey: keyof DataPoint;
  unit: string;
}) {
  const currentVal = data.length > 0 ? data[data.length - 1][dataKey] : 0;

  return (
    <div className="rounded-md border border-border/80 bg-card/60 p-4 shadow-lg hover:border-border transition-colors">
      <div className="flex items-center justify-between text-[11px] mb-2 font-mono">
        <span className="text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 animate-pulse" style={{ color }} />
          {label}
        </span>
        <span className="font-display font-bold text-sm tracking-wide" style={{ color }}>
          {currentVal}
          {unit}
        </span>
      </div>
      <div className="h-44">
        {data.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-border/50 rounded bg-background/20 text-muted-foreground text-[10px] uppercase font-mono tracking-wider gap-1.5">
            <Disc className="h-5 w-5 animate-spin text-primary" />
            Aguardando sinal elétrico...
          </div>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={data}>
              <defs>
                <linearGradient id={label} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.20 0.015 250)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${label})`}
                animationDuration={0} // real-time immediate plotting
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
