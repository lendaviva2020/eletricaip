/**
 * Hook da bancada Arduino Uno via Web Serial.
 *
 * - leitura em tempo real (grandezas convertidas pelos sensores configurados);
 * - comandos passam pelo guarda de segurança/NBR 5410 ANTES de ir à serial;
 * - espelha o estado REAL dos relés/disjuntores no unifilar (contatores
 *   abertos/fechados) quando a saída estiver ligada a um nó do diagrama.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  benchController,
  useBenchStore,
  type CommandResult,
} from "@/lib/hardware/serial/bench-controller";
import { pinBit } from "@/lib/hardware/serial/protocol";
import { webSerialSupport } from "@/lib/hardware/serial/web-serial";
import {
  toEngineering,
  type BenchConfig,
  type EngineeringReading,
} from "@/lib/hardware/bench-config";
import {
  evaluateOutputCommand,
  staleLimitMs,
  type GuardDecision,
  type LiveState,
} from "@/lib/hardware/command-guard";
import { useEditorStore } from "@/lib/editor/store";

export interface UseArduinoSerial {
  readonly support: { supported: boolean; reason?: string };
  readonly status: ReturnType<typeof useBenchStore.getState>["status"];
  readonly portLabel: string | null;
  readonly firmware: string | null;
  /** Pinos que o firmware gravado declara (HELLO). */
  readonly firmwarePins: { outputs: readonly number[]; inputs: readonly number[] } | null;
  readonly live: LiveState;
  readonly readings: readonly EngineeringReading[];
  readonly outputOn: (pin: number) => boolean;
  readonly inputActive: (pin: number) => boolean;
  readonly lastError: string | null;
  readonly badFrames: number;
  readonly connect: (opts?: { allPorts?: boolean }) => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly guard: (pin: number, on: boolean, armed: boolean) => GuardDecision;
  readonly command: (pin: number, on: boolean, armed: boolean) => Promise<CommandResult>;
  readonly allOff: () => Promise<void>;
  readonly resetEstop: () => Promise<void>;
}

export function useArduinoSerial(config: BenchConfig): UseArduinoSerial {
  const status = useBenchStore((s) => s.status);
  const portLabel = useBenchStore((s) => s.portLabel);
  const hello = useBenchStore((s) => s.hello);
  const data = useBenchStore((s) => s.data);
  const dataAt = useBenchStore((s) => s.dataAt);
  const lastError = useBenchStore((s) => s.lastError);
  const badFrames = useBenchStore((s) => s.badFrames);
  const [now, setNow] = useState(() => Date.now());
  const support = useMemo(() => webSerialSupport(), []);

  // Relógio para envelhecer a telemetria (detecta Arduino parado).
  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [status]);

  const live: LiveState = useMemo(
    () => ({
      connected: status === "connected",
      telemetryAgeMs: dataAt ? Math.max(0, now - dataAt) : null,
      estop: data?.estop ?? false,
      inputsMask: data?.inputsMask ?? 0,
      outputsMask: data?.outputsMask ?? 0,
    }),
    [status, dataAt, now, data],
  );

  const readings = useMemo<EngineeringReading[]>(() => {
    if (!data) return [];
    // O firmware envia os canais em ordem crescente (A0..A5 configurados).
    const ordered = [...config.analog].sort((a, b) => a.channel - b.channel);
    return data.analogMean.map((mean, i) => {
      const cfg = ordered[i];
      return toEngineering(cfg, cfg?.channel ?? i, mean, data.analogAcRms[i] ?? 0);
    });
  }, [data, config.analog]);

  // Espelho no unifilar: contator ligado = fechado; disjuntor pelo auxiliar.
  useEffect(() => {
    if (!data || live.telemetryAgeMs === null || live.telemetryAgeMs > staleLimitMs(config)) return;
    const { deviceStates, setDeviceState } = useEditorStore.getState();
    for (const o of config.outputs) {
      if (!o.unifilarNodeId) continue;
      const closed = pinBit(data.outputsMask, o.pin);
      if ((deviceStates[o.unifilarNodeId] ?? true) !== closed)
        setDeviceState(o.unifilarNodeId, closed);
    }
    for (const i of config.inputs) {
      if (!i.unifilarNodeId || i.role !== "breaker_aux") continue;
      const closed = !pinBit(data.inputsMask, i.pin);
      if ((deviceStates[i.unifilarNodeId] ?? true) !== closed)
        setDeviceState(i.unifilarNodeId, closed);
    }
  }, [data, config, live.telemetryAgeMs]);

  const guard = useCallback(
    (pin: number, on: boolean, armed: boolean) =>
      evaluateOutputCommand({ config, pin, desiredOn: on, live, armed }),
    [config, live],
  );

  const command = useCallback(
    async (pin: number, on: boolean, armed: boolean): Promise<CommandResult> => {
      const decision = evaluateOutputCommand({ config, pin, desiredOn: on, live, armed });
      if (!decision.allowed) {
        return { ok: false, error: decision.blocking.map((b) => b.message).join(" ") };
      }
      return benchController.setOutput(pin, on);
    },
    [config, live],
  );

  return {
    support,
    status,
    portLabel,
    firmware: hello ? `${hello.board} ${hello.firmware}` : null,
    firmwarePins: hello ? { outputs: hello.outputs, inputs: hello.inputs } : null,
    live,
    readings,
    outputOn: (pin) => pinBit(live.outputsMask, pin),
    inputActive: (pin) => !pinBit(live.inputsMask, pin),
    lastError,
    badFrames,
    connect: (opts) => benchController.connect(opts),
    disconnect: () => benchController.disconnect(),
    guard,
    command,
    allOff: () => benchController.allOff(),
    resetEstop: () => benchController.resetEstop(),
  };
}
