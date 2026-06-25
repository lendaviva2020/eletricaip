// Flush em lote da telemetria do Digital Twin para tag_samples (#TWIN-02)
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import { useCurrentProject } from "@/lib/current-project";
import { flushTwinTelemetry } from "@/lib/digital-twin.functions";

interface PendingSample {
  tag_name: string;
  value: number;
  quality: string;
  ts: number;
}

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 200;
const HARD_CAP = 500;

export function useTwinTelemetryPersistence(opts?: { intervalMs?: number }) {
  const flush = useServerFn(flushTwinTelemetry);
  const pendingRef = useRef<PendingSample[]>([]);
  const lastSeenRef = useRef<number>(Date.now());
  const inFlightRef = useRef(false);

  useEffect(() => {
    // Captura novas amostras observando lastRealtimeUpdate.
    const unsub = useDigitalTwinStore.subscribe((state) => {
      const update = state.lastRealtimeUpdate;
      if (update == null || update <= lastSeenRef.current) return;
      const since = lastSeenRef.current;
      lastSeenRef.current = update;

      for (const buf of Object.values(state.telemetryBuffers)) {
        for (const s of buf.samples) {
          if (s.ts > since) {
            pendingRef.current.push({
              tag_name: buf.tag,
              value: typeof s.value === "number" ? s.value : Number(s.value) || 0,
              quality: "GOOD",
              ts: s.ts,
            });
          }
        }
      }

      if (pendingRef.current.length > HARD_CAP) {
        pendingRef.current = pendingRef.current.slice(-HARD_CAP);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = opts?.intervalMs ?? FLUSH_INTERVAL_MS;
    let cancelled = false;

    async function doFlush() {
      if (inFlightRef.current || pendingRef.current.length === 0) return;
      const projectId = useCurrentProject.getState().project?.id;
      if (!projectId) {
        // Sem projeto ativo: descarta para não acumular.
        if (pendingRef.current.length > HARD_CAP) {
          pendingRef.current = pendingRef.current.slice(-MAX_BATCH);
        }
        return;
      }
      const batch = pendingRef.current.splice(0, MAX_BATCH);
      inFlightRef.current = true;
      try {
        await flush({
          data: {
            projectId,
            samples: batch.map((s) => ({
              tag_name: s.tag_name,
              value: s.value,
              quality: s.quality,
            })),
          },
        });
      } catch (err) {
        console.warn("[twin telemetry] flush failed:", (err as Error).message);
        // Re-enfileira no fim caso ainda haja espaço.
        if (pendingRef.current.length + batch.length <= HARD_CAP) {
          pendingRef.current.unshift(...batch);
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    const timer = setInterval(() => {
      if (!cancelled) void doFlush();
    }, interval);

    return () => {
      cancelled = true;
      clearInterval(timer);
      // Flush final best-effort.
      void doFlush();
    };
  }, [flush, opts?.intervalMs]);
}
