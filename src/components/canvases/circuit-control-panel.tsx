// Painel de comando dentro do Canvas: Play/Stop, escolha entre Pulso/Manopla
// e lâmpada indicadora (branca=off, amarela=on, vermelha piscante=falha).
// Detecta o ponto onde a "linha vermelha" (potência) deixou de energizar
// e mostra qual componente bloqueou a propagação.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Power, Zap, ToggleLeft, ToggleRight, AlertTriangle, CircleDot } from "lucide-react";
import { useVoltaiStore, type VoltaiDiagramComponent } from "@/lib/voltai/store";
import { cn } from "@/lib/utils";

type ControlMode = "pulse" | "selector";

const SOURCE_TYPES = new Set(["TR", "PS", "UPS", "G"]);

interface FaultInfo {
  hasFault: boolean;
  brokenAtId: string | null;
  reason: string | null;
}

function detectFault(
  components: VoltaiDiagramComponent[],
  edges: { source: string; target: string; role: string }[],
  powered: boolean,
): FaultInfo {
  // Falha local explícita em qualquer componente
  for (const c of components) {
    const s = c.simulationState;
    if (s.tripped) {
      return { hasFault: true, brokenAtId: c.id, reason: `Disjuntor ${c.label} disparado` };
    }
    if (s.blown) {
      return { hasFault: true, brokenAtId: c.id, reason: `Fusível ${c.label} rompido` };
    }
    if (s.failed) {
      return { hasFault: true, brokenAtId: c.id, reason: `Falha em ${c.label}` };
    }
  }

  if (!powered) return { hasFault: false, brokenAtId: null, reason: null };

  // Quando ligado, verifica se a linha vermelha (power) chega em todos os consumidores.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.role !== "power") continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const sources = components.filter((c) => SOURCE_TYPES.has(c.type)).map((c) => c.id);
  if (sources.length === 0) {
    return {
      hasFault: true,
      brokenAtId: null,
      reason: "Nenhuma fonte (TR/PS/UPS) conectada — circuito sem alimentação",
    };
  }

  const reachable = new Set<string>();
  const stack = [...sources];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const t of adj.get(id) ?? []) stack.push(t);
  }

  const consumer = components.find(
    (c) => !SOURCE_TYPES.has(c.type) && !reachable.has(c.id) && hasPowerInput(c),
  );
  if (consumer) {
    return {
      hasFault: true,
      brokenAtId: consumer.id,
      reason: `Linha vermelha interrompida antes de ${consumer.label}`,
    };
  }

  return { hasFault: false, brokenAtId: null, reason: null };
}

function hasPowerInput(_c: VoltaiDiagramComponent) {
  // Heurística simples: todos os componentes não-fonte são considerados consumidores
  // de potência para fins de visualização do break point.
  return true;
}

export function CircuitControlPanel() {
  const components = useVoltaiStore((s) => s.components);
  const edges = useVoltaiStore((s) => s.edges);
  const selectComponent = useVoltaiStore((s) => s.selectComponent);

  const [mode, setMode] = useState<ControlMode>("selector");
  const [powerOn, setPowerOn] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);

  const effectivePower = mode === "pulse" ? pulseActive : powerOn;

  // Aplica master power energizando todos os componentes simulados.
  useEffect(() => {
    useVoltaiStore.setState((store) => ({
      components: store.components.map((c) => ({
        ...c,
        simulationState: {
          ...c.simulationState,
          energized: effectivePower && !c.simulationState.tripped && !c.simulationState.blown,
          coilEnergized: effectivePower && !c.simulationState.tripped && !c.simulationState.blown,
        },
      })),
    }));
  }, [effectivePower]);

  // Hash leve só com bits que afetam o resultado de detectFault.
  // Evita recalcular o BFS a cada tick quando nada de relevante mudou.
  const faultKey = useMemo(() => {
    let s = `${effectivePower ? 1 : 0}|${edges.length}`;
    for (const c of components) {
      const st = c.simulationState;
      const bits =
        (st.tripped ? 1 : 0) |
        (st.failed ? 2 : 0) |
        (st.blown ? 4 : 0) |
        (st.energized ? 8 : 0);
      s += `|${c.id}:${bits}`;
    }
    return s;
  }, [components, edges.length, effectivePower]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fault = useMemo(
    () => detectFault(components, edges, effectivePower),
    [faultKey],
  );

  // Lâmpada piscante quando há falha
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (!fault.hasFault) return;
    const t = setInterval(() => setBlink((b) => !b), 450);
    return () => clearInterval(t);
  }, [fault.hasFault]);

  // Estado visual da lâmpada
  const lampColor = fault.hasFault
    ? blink
      ? "#ef4444"
      : "#1f2937"
    : effectivePower
      ? "#facc15"
      : "#f8fafc";
  const lampGlow = fault.hasFault
    ? blink
      ? "0 0 22px #ef4444"
      : "none"
    : effectivePower
      ? "0 0 24px #facc15"
      : "0 0 6px rgba(255,255,255,0.25)";

  const lampLabel = fault.hasFault ? "FALHA" : effectivePower ? "LIGADO" : "DESLIGADO";

  const handleReset = useCallback(() => {
    useVoltaiStore.setState((store) => ({
      components: store.components.map((c) => ({
        ...c,
        simulationState: {
          ...c.simulationState,
          tripped: false,
          failed: false,
          blown: false,
          alarm: undefined,
          thermalMs: 0,
          i2tA2s: 0,
        },
      })),
    }));
  }, []);

  const handleMasterToggle = useCallback(() => {
    if (mode === "pulse") return;
    setPowerOn((v) => !v);
  }, [mode]);

  const focusFault = useCallback(() => {
    if (fault.brokenAtId) selectComponent(fault.brokenAtId);
  }, [fault.brokenAtId, selectComponent]);

  return (
    <div className="absolute bottom-20 right-4 z-20 w-[230px] select-none pointer-events-auto rounded-lg border border-border bg-card/95 backdrop-blur shadow-xl">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Comando do circuito
        </span>
      </div>

      {/* Lâmpada */}
      <div className="flex flex-col items-center gap-1.5 py-3 border-b border-border">
        <div
          className="h-12 w-12 rounded-full border-2 border-border/80 transition-colors duration-150"
          style={{ background: lampColor, boxShadow: lampGlow }}
          title={lampLabel}
        />
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-wider",
            fault.hasFault
              ? "text-destructive"
              : effectivePower
                ? "text-yellow-400"
                : "text-muted-foreground",
          )}
        >
          {lampLabel}
        </span>
      </div>

      {/* Seleção de tipo de comando */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Tipo de comando
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              setMode("selector");
              setPulseActive(false);
            }}
            className={cn(
              "h-7 rounded-md text-[10px] font-medium border transition-colors flex items-center justify-center gap-1",
              mode === "selector"
                ? "bg-primary/15 border-primary/60 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
            title="Chave seletora (manopla) — mantém estado"
          >
            {powerOn ? (
              <ToggleRight className="h-3.5 w-3.5" />
            ) : (
              <ToggleLeft className="h-3.5 w-3.5" />
            )}
            Manopla
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("pulse");
              setPowerOn(false);
            }}
            className={cn(
              "h-7 rounded-md text-[10px] font-medium border transition-colors flex items-center justify-center gap-1",
              mode === "pulse"
                ? "bg-primary/15 border-primary/60 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
            title="Botoeira de pulso — energiza apenas enquanto pressionado"
          >
            <CircleDot className="h-3.5 w-3.5" />
            Pulso
          </button>
        </div>
      </div>

      {/* Controles */}
      <div className="px-3 py-3 flex flex-col gap-2">
        {mode === "selector" ? (
          <button
            type="button"
            onClick={handleMasterToggle}
            className={cn(
              "h-10 rounded-md font-semibold text-xs flex items-center justify-center gap-2 border transition-all",
              powerOn
                ? "bg-success/15 border-success/60 text-success"
                : "bg-card border-border hover:bg-accent text-foreground",
            )}
          >
            <Power className="h-4 w-4" />
            {powerOn ? "STOP" : "PLAY"}
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              setPulseActive(true);
            }}
            onPointerUp={() => setPulseActive(false)}
            onPointerLeave={() => setPulseActive(false)}
            onPointerCancel={() => setPulseActive(false)}
            className={cn(
              "h-10 rounded-md font-semibold text-xs flex items-center justify-center gap-2 border transition-all touch-none",
              pulseActive
                ? "bg-success/25 border-success text-success scale-[0.98]"
                : "bg-card border-border hover:bg-accent text-foreground",
            )}
            title="Mantenha pressionado para energizar"
          >
            <CircleDot className="h-4 w-4" />
            {pulseActive ? "ENERGIZANDO…" : "PRESSIONAR"}
          </button>
        )}

        {fault.hasFault && (
          <button
            type="button"
            onClick={handleReset}
            className="h-7 rounded-md text-[10px] font-medium border border-border hover:bg-accent text-muted-foreground"
            title="Resetar disparos e falhas"
          >
            Reset falhas
          </button>
        )}
      </div>

      {/* Diagnóstico de erro */}
      {fault.hasFault && fault.reason && (
        <button
          type="button"
          onClick={focusFault}
          className="w-full text-left px-3 py-2 border-t border-destructive/40 bg-destructive/10 hover:bg-destructive/15 transition-colors rounded-b-lg"
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold">
                Erro no circuito
              </div>
              <div className="text-[11px] text-foreground/90 leading-snug truncate">
                {fault.reason}
              </div>
              {fault.brokenAtId && (
                <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                  → clique p/ localizar
                </div>
              )}
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
