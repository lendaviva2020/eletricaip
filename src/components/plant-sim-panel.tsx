// Painel da planta simulada (8 motores + 2 exaustores) para o modo Sim.
// Tudo aqui deriva do plant-engine — nenhuma animação/número é decorativo:
// a velocidade das partículas e as barras vêm de `energized` + `current_A`.
// Selo SIMULAÇÃO fixo: valores simulados, nunca medição (RISK-028).
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Play,
  Square,
  Octagon,
  ArrowCounterClockwise,
  Flame,
  Warning,
} from "@phosphor-icons/react";
import { usePlantStore, PLANT_TICK_MS } from "@/lib/simulation/plant-store";
import { useSafetyStore } from "@/lib/simulation/safety-core";
import { cn } from "@/lib/utils";

const MOTOR_IDS = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"];

function FlowWire({
  energized,
  current_A,
  label,
}: {
  energized: boolean;
  current_A: number;
  label: string;
}) {
  const speed = energized ? Math.max(0.4, Math.min(3, current_A / 8)) : 0;
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <div
        className="h-[3px] flex-1 rounded-full"
        style={{
          backgroundImage: energized
            ? "repeating-linear-gradient(90deg, var(--color-primary) 0 6px, transparent 6px 12px)"
            : "none",
          backgroundColor: energized ? "transparent" : "var(--color-border)",
          backgroundSize: "12px 3px",
          animation: energized ? `flowdash ${1 / speed}s linear infinite` : "none",
          opacity: energized ? 1 : 0.5,
        }}
      />
      <style>{`@keyframes flowdash { to { background-position-x: 12px; } }`}</style>
    </div>
  );
}

export function PlantSimPanel() {
  const plant = usePlantStore((s) => s.plant);
  const inputs = usePlantStore((s) => s.inputs);
  const ticking = usePlantStore((s) => s.ticking);
  const actions = usePlantStore(
    useShallow((s) => ({
      setMotorCmd: s.setMotorCmd,
      setFaultInject: s.setFaultInject,
      setPlantTemp: s.setPlantTemp,
      setSmoke: s.setSmoke,
      pulseStart: s.pulseStart,
      pulseStop: s.pulseStop,
      pulseEstop: s.pulseEstop,
      pulseReset: s.pulseReset,
      setTicking: s.setTicking,
      tick: s.tick,
      resetAll: s.resetAll,
    })),
  );

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => usePlantStore.getState().tick(), PLANT_TICK_MS);
    return () => clearInterval(id);
  }, [ticking]);

  const lastEvents = plant.events.slice(-6).reverse();

  return (
    <section
      aria-label="Planta simulada"
      className="rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Planta simulada — 8 motores + 2 exaustores</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
            Simulação
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => actions.setTicking(!ticking)}
            className="h-8 px-3 rounded bg-primary/10 hover:bg-primary/20 text-[11px] font-bold uppercase tracking-wider text-primary border border-primary/20 inline-flex items-center gap-1.5 cursor-pointer"
          >
            {ticking ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {ticking ? "Pausar" : "Rodar"}
          </button>
          <button
            onClick={actions.resetAll}
            className="h-8 px-3 rounded border border-border hover:bg-accent text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowCounterClockwise className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Comando do sistema (rung SISTEMA: START sela, STOP quebra, E-STOP trava) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <button
          onClick={() => {
            const check = useSafetyStore.getState().canStartSimulation();
            if (!check.allowed) {
              return;
            }
            actions.pulseStart();
          }}
          disabled={!ticking || plant.estopLatched}
          className="h-9 rounded bg-success/15 hover:bg-success/25 text-success border border-success/30 text-xs font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Play className="h-3.5 w-3.5" /> Ligar sistema
        </button>
        <button
          onClick={actions.pulseStop}
          disabled={!ticking}
          className="h-9 rounded border border-border hover:bg-accent text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Square className="h-3.5 w-3.5" /> Desligar
        </button>
        <button
          onClick={() => {
            actions.pulseEstop();
            useSafetyStore
              .getState()
              .triggerEmergency("plant_panel", "Parada de emergência acionada no painel da planta");
          }}
          disabled={!ticking}
          className="h-9 rounded bg-destructive/15 hover:bg-destructive/30 text-destructive border border-destructive/40 text-xs font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Octagon className="h-3.5 w-3.5" /> E-Stop
        </button>
        <button
          onClick={() => {
            actions.pulseReset();
            useSafetyStore.getState().rearmEmergency("Operador Planta");
          }}
          disabled={!ticking || !plant.estopLatched}
          className="h-9 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <ArrowCounterClockwise className="h-3.5 w-3.5" /> Reset E-Stop
        </button>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs mb-3">
        <span>
          Sistema:{" "}
          <strong className={plant.systemOn ? "text-success" : "text-muted-foreground"}>
            {plant.systemOn ? "ON" : "OFF"}
          </strong>
        </span>
        <span>
          Barramento: <strong className="font-mono">{plant.bus_V} V</strong>
        </span>
        {plant.estopLatched && (
          <span className="text-destructive font-bold inline-flex items-center gap-1">
            <Warning className="h-3.5 w-3.5" /> E-STOP ATUADO
          </span>
        )}
        {plant.generalAlarm && !plant.estopLatched && (
          <span className="text-warning font-bold">ALARME GERAL</span>
        )}
        <label className="inline-flex items-center gap-1.5 text-muted-foreground">
          Temp. planta
          <input
            type="range"
            min={18}
            max={38}
            step={0.5}
            value={inputs.plantTemp_C}
            onChange={(e) => actions.setPlantTemp(Number(e.target.value))}
            className="w-28"
            aria-label="Temperatura da planta"
          />
          <span className="font-mono">{inputs.plantTemp_C.toFixed(1)} °C</span>
        </label>
        <label className="inline-flex items-center gap-1.5 text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={inputs.smoke}
            onChange={(e) => actions.setSmoke(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Flame className="h-3.5 w-3.5" /> Fumaça
        </label>
      </div>

      {/* Diagrama de fluxo REDE → QGBT → barramento → motores */}
      <div className="rounded border border-border/70 bg-background/40 p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Fluxo de energia (derivado da simulação)
        </p>
        <div className="grid grid-cols-[70px_1fr_90px] items-center gap-2 text-[11px]">
          <span className="font-mono">REDE 380V</span>
          <FlowWire energized={plant.busEnergized} current_A={20} label="Alimentação QGBT" />
          <span
            className={cn(
              "font-semibold",
              plant.busEnergized ? "text-success" : "text-muted-foreground",
            )}
          >
            {plant.busEnergized ? "QGBT ON" : "QGBT OFF"}
          </span>
          <span className="font-mono">BARR. L1L2L3</span>
          <FlowWire energized={plant.busEnergized} current_A={20} label="Barramento" />
          <span className="text-muted-foreground font-mono">PE ━</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mt-2">
          {MOTOR_IDS.map((id) => {
            const m = plant.motors[id];
            return (
              <div key={id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    "font-mono font-bold",
                    m.fault
                      ? "text-destructive"
                      : m.running
                        ? "text-success"
                        : "text-muted-foreground",
                  )}
                >
                  {id}
                </span>
                <div className="flex-1">
                  <FlowWire
                    energized={m.energized}
                    current_A={m.current_A}
                    label={`Circuito ${id}`}
                  />
                </div>
                <span className="font-mono text-muted-foreground w-14 text-right">
                  {m.current_A.toFixed(1)} A
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela de motores */}
      <div className="overflow-x-auto rounded border border-border/70">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
              <th className="p-2">Motor</th>
              <th className="p-2">Estado</th>
              <th className="p-2 text-right">RPM</th>
              <th className="p-2 text-right">Corrente</th>
              <th className="p-2 text-right">Temp</th>
              <th className="p-2">Comando</th>
              <th className="p-2">Falha inj.</th>
            </tr>
          </thead>
          <tbody>
            {MOTOR_IDS.map((id) => {
              const m = plant.motors[id];
              const In = plant.motorIn_A[id] ?? 0;
              return (
                <tr key={id} className="border-b border-border/50 last:border-0">
                  <td className="p-2 font-mono font-bold">{id}</td>
                  <td className="p-2">
                    {m.fault ? (
                      <span className="text-destructive font-bold">🔴 {m.fault.code}</span>
                    ) : m.running ? (
                      <span className="text-success">● GIRANDO</span>
                    ) : (
                      <span className="text-muted-foreground">○ PARADO</span>
                    )}
                  </td>
                  <td className="p-2 text-right font-mono">{Math.round(m.speed_rpm)}</td>
                  <td className="p-2 text-right font-mono">
                    {m.current_A.toFixed(1)} A{" "}
                    <span className="text-muted-foreground">/ In {In.toFixed(1)}</span>
                  </td>
                  <td className="p-2 text-right font-mono">{m.temp_C.toFixed(1)} °C</td>
                  <td className="p-2">
                    <button
                      onClick={() => actions.setMotorCmd(id, !(inputs.motorCmd[id] ?? true))}
                      className="px-2 py-0.5 rounded border border-border hover:bg-accent text-[10px] font-bold uppercase cursor-pointer"
                    >
                      {(inputs.motorCmd[id] ?? true) ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="p-2">
                    <select
                      aria-label={`Injetar falha em ${id}`}
                      value={inputs.faultInject[id] ?? "none"}
                      onChange={(e) =>
                        actions.setFaultInject(
                          id,
                          e.target.value as "none" | "overload" | "short" | "phase",
                        )
                      }
                      className="h-7 rounded border border-border bg-background px-1 text-[10px]"
                    >
                      <option value="none">sem falha</option>
                      <option value="overload">sobrecarga</option>
                      <option value="short">curto</option>
                      <option value="phase">falta de fase</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Exaustores */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        {(["EX01", "EX02"] as const).map((id) => {
          const e = plant.exhaustors[id];
          return (
            <div
              key={id}
              className="rounded border border-border/70 p-2 text-[11px] flex items-center justify-between"
            >
              <span className="font-mono font-bold">{id}</span>
              <span className={e.running ? "text-success" : "text-muted-foreground"}>
                {e.running ? "● ON" : "○ OFF"} · {Math.round(e.airflow_pct)}% fluxo
              </span>
              <span className="text-muted-foreground">liga &gt; 27 °C · desliga &lt; 24 °C</span>
            </div>
          );
        })}
      </div>

      {/* Eventos */}
      {lastEvents.length > 0 && (
        <div className="mt-2 rounded border border-border/70 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Eventos</p>
          <ul className="text-[11px] font-mono space-y-0.5">
            {lastEvents.map((e, i) => (
              <li key={`${e.t}-${i}`} className="text-muted-foreground">
                <span className="text-foreground">t={e.t.toFixed(1)}s</span> [{e.ref}] {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
