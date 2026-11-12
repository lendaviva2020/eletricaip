/**
 * Interactive Deterministic Simulator Panel for eletric Studio:
 * - Physical DI switches & AI sliders
 * - Step / Play / Pause / Clock Jump (Weekly & Yearly Timer fast verification)
 * - Watch Table + Forcing + Virtual 6-line Text Display (XSS-safe text rendering)
 * - Live SVG Trend Graph + Record/Replay + DataLog CSV + Structural Revision Diff
 */
import React, { useMemo, useState } from "react";
import {
  Play,
  Pause,
  Stop,
  SkipForward,
  Clock,
  Record as RecordIcon,
  GitDiff,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { sanitizeSpreadsheetFormulaString } from "@/lib/security/safe-xlsx";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import type { CompactRuntimeFrame } from "@/lib/compact-studio/runtime";
import { compareCompactPrograms } from "@/lib/compact-studio/sim";

export interface CompactSimulatorPanelProps {
  readonly model: CompactProgramModel;
  readonly baselineRevisionModel?: CompactProgramModel | null;
  readonly running: boolean;
  readonly frame: CompactRuntimeFrame | null;
  readonly historyFrames: readonly CompactRuntimeFrame[];
  readonly forcedNodes: Readonly<Record<string, boolean | number>>;
  readonly recording: boolean;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onStop: () => void;
  readonly onStep: (dtMs?: number) => void;
  readonly onJumpClockMs: (targetEpochMs: number) => void;
  readonly onSetInput: (nameOrAddress: string, value: boolean | number) => void;
  readonly onToggleForce: (nodeId: string, value: boolean | number | null) => void;
  readonly onToggleRecord: () => void;
  readonly onReplayLastSession: () => void;
}

export function CompactSimulatorPanel({
  model,
  baselineRevisionModel,
  running,
  frame,
  historyFrames,
  forcedNodes,
  recording,
  onStart,
  onPause,
  onStop,
  onStep,
  onJumpClockMs,
  onSetInput,
  onToggleForce,
  onToggleRecord,
  onReplayLastSession,
}: CompactSimulatorPanelProps) {
  const [selectedTrendVar, setSelectedTrendVar] = useState<string>("Q1");

  const digitalInputs = useMemo(
    () => model.nodes.filter((n) => n.blockType === "INPUT_DI"),
    [model.nodes],
  );
  const analogInputs = useMemo(
    () => model.nodes.filter((n) => n.blockType === "INPUT_AI"),
    [model.nodes],
  );
  const digitalOutputs = useMemo(
    () => model.nodes.filter((n) => n.blockType === "OUTPUT_QO"),
    [model.nodes],
  );

  const diffReport = useMemo(() => {
    if (!baselineRevisionModel) return null;
    return compareCompactPrograms(baselineRevisionModel, model);
  }, [baselineRevisionModel, model]);

  const trendPoints = useMemo(() => {
    const slice = historyFrames.slice(-60);
    if (slice.length === 0) return "";
    return slice
      .map((f, idx) => {
        const raw = f.variables[selectedTrendVar];
        const num = typeof raw === "boolean" ? (raw ? 1 : 0) : typeof raw === "number" ? raw : 0;
        const clampedY = Math.max(0, Math.min(1, typeof raw === "boolean" ? num : num / 1000));
        const x = slice.length <= 1 ? 0 : (idx / (slice.length - 1)) * 280;
        const y = 52 - clampedY * 44;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [historyFrames, selectedTrendVar]);

  const handleDownloadDataLog = () => {
    if (!frame || frame.dataLogs.length === 0) return;
    const header = "seq,epochMs,nodeId,label,v1,v2\r\n";
    const lines = frame.dataLogs
      .map((row) =>
        [
          row.seq,
          row.epochMs,
          sanitizeSpreadsheetFormulaString(row.nodeId),
          sanitizeSpreadsheetFormulaString(row.label),
          row.v1,
          row.v2,
        ].join(","),
      )
      .join("\r\n");
    const blob = new Blob([header + lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${model.name.replace(/\s+/g, "_")}_datalog.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground p-4 gap-4 overflow-auto">
      {/* Execution Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {!running ? (
            <Button size="sm" onClick={onStart} className="h-7 text-xs gap-1">
              <Play className="h-3.5 w-3.5" /> Iniciar Ciclo
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onPause} className="h-7 text-xs gap-1">
              <Pause className="h-3.5 w-3.5" /> Pausar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onStop} className="h-7 text-xs gap-1">
            <Stop className="h-3.5 w-3.5" /> Resetar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStep(model.cycleTimeMs)}
            className="h-7 text-xs gap-1"
          >
            <SkipForward className="h-3.5 w-3.5" /> Passo +{model.cycleTimeMs}ms
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onJumpClockMs((frame?.clockEpochMs ?? 0) + 3_600_000)}
            className="h-7 text-xs gap-1"
            title="Avançar relógio simulado em +1 hora (Cames Semanais / Anuais)"
          >
            <Clock className="h-3.5 w-3.5" /> +1h Relógio Simulado
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={recording ? "destructive" : "outline"}
            onClick={onToggleRecord}
            className="h-7 text-xs gap-1"
          >
            <RecordIcon className="h-3.5 w-3.5" />
            {recording ? "Parar Gravação" : "Gravar Estímulos"}
          </Button>
          <Button size="sm" variant="outline" onClick={onReplayLastSession} className="h-7 text-xs">
            Reproduzir Trace
          </Button>
          <span className="text-[11px] font-mono text-muted-foreground">
            Scans: {frame?.scans ?? 0} ·{" "}
            {frame ? new Date(frame.clockEpochMs).toISOString().slice(11, 19) : "00:00:00"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Physical & Analog Inputs Control */}
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chaves de Campo (DI) &amp; Analógicas (AI)
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {digitalInputs.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Nenhuma entrada digital no diagrama.
              </span>
            ) : (
              digitalInputs.map((di) => {
                const active = Boolean(frame?.variables[di.instanceName]);
                return (
                  <Button
                    key={di.id}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => onSetInput(di.instanceName, !active)}
                    className="h-7 text-xs font-mono"
                  >
                    {di.instanceName}: {active ? "1" : "0"}
                  </Button>
                );
              })
            )}
          </div>

          {analogInputs.map((ai) => {
            const val = Number(frame?.variables[ai.instanceName] ?? 0);
            return (
              <div key={ai.id} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span>{ai.instanceName}</span>
                  <span>{val}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={val}
                  onChange={(e) => onSetInput(ai.instanceName, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            );
          })}
        </div>

        {/* Watch Table + Forcing + Virtual Text Display */}
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Saídas, Forçamento &amp; Visor Virtual
          </h3>
          <div className="space-y-1.5">
            {digitalOutputs.map((q) => {
              const val = Boolean(frame?.variables[q.instanceName]);
              const isForced = forcedNodes[q.id] !== undefined;
              return (
                <div
                  key={q.id}
                  className="flex items-center justify-between text-xs border border-border/60 rounded px-2 py-1"
                >
                  <span className="font-mono font-semibold">{q.instanceName}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                        val
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {val ? "ON" : "OFF"}
                    </span>
                    <Button
                      size="sm"
                      variant={isForced ? "destructive" : "ghost"}
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onToggleForce(q.id, isForced ? null : !val)}
                    >
                      {isForced ? "Desforçar" : "Forçar"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Virtual Sanitized Text Display (MESSAGE_TEXT blocks) */}
          <div className="rounded border border-amber-500/30 bg-amber-950/30 p-2 font-mono text-xs min-h-[56px]">
            <div className="text-[10px] text-amber-400/80 mb-1">
              VISOR VIRTUAL (Mensagens Ativas)
            </div>
            {frame && frame.activeMessages.length > 0 ? (
              frame.activeMessages.map((msg) => (
                <div key={msg.nodeId} className="text-amber-100 whitespace-pre-wrap">
                  [{msg.instanceName}] {msg.text}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-[11px]">
                Sem mensagens de alarme ativas.
              </div>
            )}
          </div>
        </div>

        {/* Live Trend + DataLog + Revision Diff */}
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tendência ({selectedTrendVar}) &amp; Data Log
            </h3>
            <select
              value={selectedTrendVar}
              onChange={(e) => setSelectedTrendVar(e.target.value)}
              className="h-6 rounded border border-border bg-background px-1.5 text-[11px] font-mono"
            >
              {Object.keys(frame?.variables ?? { Q1: false }).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <svg
            viewBox="0 0 280 60"
            className="w-full h-16 rounded border border-border/60 bg-background"
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              points={trendPoints || "0,52 280,52"}
              className="text-primary"
            />
          </svg>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono">
              DataLog: {frame?.dataLogs.length ?? 0} registro(s)
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!frame || frame.dataLogs.length === 0}
              onClick={handleDownloadDataLog}
              className="h-6 text-[11px]"
            >
              Exportar DataLog CSV
            </Button>
          </div>

          {diffReport && (
            <div className="rounded border border-border/70 bg-background p-2 text-[11px] space-y-1">
              <div className="flex items-center gap-1 font-semibold">
                <GitDiff className="h-3.5 w-3.5 text-primary" />
                Comparativo vs Revisão Base:
              </div>
              {diffReport.hasChanges ? (
                <div className="text-muted-foreground font-mono">
                  +{diffReport.addedNodesCount} blocos · -{diffReport.removedNodesCount} · ~
                  {diffReport.modifiedNodesCount} mod.
                </div>
              ) : (
                <div className="text-emerald-400">Sem diferenças estruturais.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
