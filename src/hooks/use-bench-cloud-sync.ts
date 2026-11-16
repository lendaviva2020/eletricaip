/**
 * Envio da telemetria REAL da bancada para a nuvem (iot_readings + Realtime).
 *
 * Só envia com o Arduino conectado e telemetria recente; aplica banda morta e
 * batimento de 60 s (`selectReadingsToSend`). Erros definitivos (plano, limite
 * de dispositivos, permissão) desligam o envio e mostram o motivo; erros
 * temporários tentam de novo com espera crescente (até 30 s).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ingestBenchTelemetry } from "@/lib/bench-telemetry.functions";
import type { BenchConfig } from "@/lib/hardware/bench-config";
import {
  BENCH_SEND_INTERVAL_MS,
  FATAL_INGEST_ERRORS,
  selectReadingsToSend,
  snapshotToCloudReadings,
  type BenchIngestErrorCode,
  type BenchSnapshot,
  type SentRecord,
} from "@/lib/hardware/bench-telemetry";

export interface CloudSyncState {
  readonly status: "off" | "waiting" | "sending" | "ok" | "error";
  readonly sentReadings: number;
  readonly lastSentAt: number | null;
  readonly errorCode: BenchIngestErrorCode | null;
}

const INITIAL: CloudSyncState = {
  status: "off",
  sentReadings: 0,
  lastSentAt: null,
  errorCode: null,
};

export function useBenchCloudSync(params: {
  readonly enabled: boolean;
  readonly config: BenchConfig;
  readonly deviceExternalId: string;
  readonly deviceName: string;
  readonly firmware: string | null;
  /** null = sem telemetria válida agora (desconectado ou velha). */
  readonly snapshot: BenchSnapshot | null;
  readonly onFatal: () => void;
}): CloudSyncState & { reset: () => void } {
  const { enabled, config, deviceExternalId, deviceName, firmware, snapshot, onFatal } = params;
  const [state, setState] = useState<CloudSyncState>(INITIAL);
  const lastSent = useRef<Map<string, SentRecord>>(new Map());
  const inFlight = useRef(false);
  const nextAllowedAt = useRef(0);
  const backoffMs = useRef(BENCH_SEND_INTERVAL_MS);
  // Lê sempre o valor mais recente sem recriar o intervalo a cada telemetria.
  const latest = useRef({ config, snapshot, deviceExternalId, deviceName, firmware, onFatal });
  latest.current = { config, snapshot, deviceExternalId, deviceName, firmware, onFatal };

  const reset = useCallback(() => {
    lastSent.current = new Map();
    backoffMs.current = BENCH_SEND_INTERVAL_MS;
    nextAllowedAt.current = 0;
    setState(INITIAL);
  }, []);

  // Dispositivo ou configuração diferente: o histórico de envio não vale mais.
  useEffect(() => {
    lastSent.current = new Map();
  }, [deviceExternalId, config]);

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === "off" ? s : { ...s, status: "off" }));
      return;
    }
    setState((s) => ({ ...s, status: "waiting", errorCode: null }));
    let cancelled = false;

    const tick = async () => {
      const now = Date.now();
      if (inFlight.current || now < nextAllowedAt.current) return;
      const cur = latest.current;
      if (!cur.snapshot) {
        setState((s) => (s.status === "waiting" ? s : { ...s, status: "waiting" }));
        return;
      }
      const readings = snapshotToCloudReadings(cur.config, cur.snapshot);
      const { batch, next } = selectReadingsToSend(cur.config, readings, lastSent.current, now);
      if (batch.length === 0) return;

      inFlight.current = true;
      setState((s) => ({ ...s, status: "sending" }));
      let code: BenchIngestErrorCode | null = null;
      let retryAfterMs = 0;
      try {
        const res = await ingestBenchTelemetry({
          data: {
            deviceExternalId: cur.deviceExternalId,
            deviceName: cur.deviceName,
            firmware: cur.firmware ?? undefined,
            readings: batch,
          },
        });
        if (res.ok) {
          lastSent.current = next;
          backoffMs.current = BENCH_SEND_INTERVAL_MS;
          nextAllowedAt.current = Date.now() + BENCH_SEND_INTERVAL_MS;
          if (!cancelled) {
            setState((s) => ({
              status: "ok",
              sentReadings: s.sentReadings + res.inserted,
              lastSentAt: Date.now(),
              errorCode: null,
            }));
          }
        } else {
          code = res.code;
          retryAfterMs = (res.retryAfterSeconds ?? 0) * 1000;
        }
      } catch {
        code = "network";
      } finally {
        inFlight.current = false;
      }

      if (code && !cancelled) {
        if (FATAL_INGEST_ERRORS.has(code)) {
          setState((s) => ({ ...s, status: "error", errorCode: code }));
          latest.current.onFatal();
          return;
        }
        backoffMs.current = Math.min(backoffMs.current * 2, 30_000);
        nextAllowedAt.current = Date.now() + Math.max(backoffMs.current, retryAfterMs);
        setState((s) => ({ ...s, status: "error", errorCode: code }));
      }
    };

    const timer = setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return { ...state, reset };
}
