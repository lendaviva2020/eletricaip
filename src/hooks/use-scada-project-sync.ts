/**
 * Mantém o SCADA do projeto aberto persistente e alimentado (Fase 1).
 *
 * 1. Ao abrir o projeto: traz do banco os alarmes que ainda exigem atenção e a
 *    trilha de auditoria — recarregar a página não perde nada.
 * 2. A cada 5 s (e ao sair): grava alarmes novos/reconhecidos/normalizados,
 *    eventos de auditoria ainda não gravados e o histórico de tags.
 * 3. Publica os tags da CCM simulada na base única (origem SIMULATION).
 *
 * Montado no workspace e no SCADA. Demonstração não lê nem grava no banco.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useScadaStore } from "@/lib/scada/scada-store";
import { ScadaPersistenceTracker } from "@/lib/scada/scada-persistence-sync";
import { loadScadaPersistedState, persistScadaBatch } from "@/lib/scada/scada-operations.functions";
import { publishTags } from "@/lib/scada/tag-hub";
import { useMotorControlStore, mccProcessTags } from "@/lib/simulation/motor-control-store";
import { mccTagsToPublished } from "@/lib/scada/source-bridges";

const FLUSH_MS = 5_000;

/** Uma instância ativa por aba: duas gravariam a auditoria em dobro. */
let activeOwners = 0;
const CCM_PUBLISH_MS = 1_000;

export function useScadaProjectSync(): void {
  const projectId = useScadaStore((s) => s.currentProjectId);
  const isDemo = useScadaStore((s) => s.isDemoProject);
  const loadFn = useServerFn(loadScadaPersistedState);
  const persistFn = useServerFn(persistScadaBatch);
  const tracker = useRef(new ScadaPersistenceTracker());
  const ready = useRef(false);
  const inFlight = useRef(false);
  const owner = useRef(false);

  useEffect(() => {
    owner.current = activeOwners === 0;
    activeOwners++;
    return () => {
      activeOwners--;
      owner.current = false;
    };
  }, []);

  // 1 + 2: restaurar e gravar.
  useEffect(() => {
    tracker.current.reset();
    ready.current = false;
    if (!projectId || !owner.current) return;
    if (isDemo) {
      // Sem banco: só tira da lista o que já foi reconhecido e normalizado.
      const timer = setInterval(() => useScadaStore.getState().pruneSettledAlarms(), FLUSH_MS);
      return () => clearInterval(timer);
    }
    let cancelled = false;

    void (async () => {
      try {
        const res = await loadFn({ data: { projectId } });
        if (cancelled) return;
        useScadaStore.getState().hydratePersisted({
          projectId,
          alarms: res.alarms,
          auditLogs: res.auditLogs,
        });
        tracker.current.seed(res.alarms);
      } catch (err) {
        // Sem restaurar, ainda grava o que acontecer daqui em diante.
        console.error("[scada.sync] restauração:", err);
      } finally {
        if (!cancelled) ready.current = true;
      }
    })();

    const flush = async () => {
      if (!ready.current || inFlight.current) return;
      const st = useScadaStore.getState();
      if (st.currentProjectId !== projectId || st.isDemoProject) return;
      const batch = tracker.current.diff(st.alarms, st.auditLogs);
      if (batch.alarms.length === 0 && batch.audit.length === 0) return;
      inFlight.current = true;
      try {
        const res = await persistFn({ data: { projectId, ...batch } });
        tracker.current.commit(batch, useScadaStore.getState().alarms);
        useScadaStore.getState().markAuditPersisted(res.auditIds);
        useScadaStore
          .getState()
          .pruneSettledAlarms(new Set(batch.alarms.map((o) => o.occurrenceId)));
      } catch (err) {
        // Nada marcado como gravado: a próxima rodada reenvia (upsert idempotente).
        console.error("[scada.sync] gravação:", err);
      } finally {
        inFlight.current = false;
      }
    };

    // Histórico de tags (tag_samples) no mesmo ritmo; o store fatia em lotes de 500.
    const flushAll = () => {
      void flush();
      void useScadaStore.getState().flushHistoricalSamples();
    };
    const timer = setInterval(flushAll, FLUSH_MS);
    // Reconhecimento grava já (o motor tira da lista o alarme reconhecido e
    // normalizado; esperar 5 s arriscaria perder o registro do reconhecimento).
    let lastAcks = 0;
    let soon: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useScadaStore.subscribe((st) => {
      const acks = st.alarms.reduce((n, a) => n + (a.state === "ACK" ? 1 : 0), 0);
      if (acks > lastAcks && !soon) {
        soon = setTimeout(() => {
          soon = null;
          void flush();
        }, 300);
      }
      lastAcks = acks;
    });
    const onHide = flushAll;
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
      if (soon) clearTimeout(soon);
      window.removeEventListener("pagehide", onHide);
      flushAll();
    };
  }, [projectId, isDemo, loadFn, persistFn]);

  // 3: CCM simulada como fonte da base única.
  useEffect(() => {
    if (!projectId || !owner.current) return;
    const timer = setInterval(() => {
      const { fleet, drives } = useMotorControlStore.getState();
      if (fleet.length === 0) return;
      const values = mccTagsToPublished(mccProcessTags(fleet, drives));
      if (values.length) publishTags("SIMULATION", values);
    }, CCM_PUBLISH_MS);
    return () => clearInterval(timer);
  }, [projectId]);
}
