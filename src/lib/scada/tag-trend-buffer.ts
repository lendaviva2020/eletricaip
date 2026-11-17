/**
 * Tendência curta por tag para o faceplate (ISA-101 nível 3): guarda os
 * valores REALMENTE publicados na base única de tags desde que a tela abriu.
 * Nada é interpolado nem preenchido para trás — a série começa vazia.
 * Não é persistida (o histórico durável é `tag_samples`, Fase 4).
 */
import { create } from "zustand";
import type { ProtocolDriver, ScadaTagDefinition, TagQuality } from "./types";
import { useScadaStore } from "./scada-store";

export const TREND_MAX_POINTS = 600;
export const TREND_MAX_TAGS = 2000;

export interface TrendPoint {
  t: number;
  v: number;
  quality: TagQuality;
  source: ProtocolDriver;
}

/** Valor numérico plotável (booleano vira 0/1; texto não é plotado). */
export function plotValue(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/**
 * Acrescenta à série só quando há publicação nova (lastUpdated avançou) ou
 * mudança de qualidade. Retorna a mesma referência se nada mudou.
 */
export function appendTrendPoint(
  series: readonly TrendPoint[] | undefined,
  tag: Pick<ScadaTagDefinition, "value" | "quality" | "driver" | "lastUpdated">,
  max = TREND_MAX_POINTS,
): readonly TrendPoint[] | undefined {
  const v = plotValue(tag.value);
  if (v === null || !Number.isFinite(tag.lastUpdated)) return series;
  if (tag.quality === "NOT_CONNECTED") return series;
  const last = series?.[series.length - 1];
  if (last && last.t >= tag.lastUpdated && last.quality === tag.quality) return series;
  const point: TrendPoint = {
    t: Math.max(tag.lastUpdated, last ? last.t : 0),
    v,
    quality: tag.quality,
    source: tag.driver,
  };
  const next = [...(series ?? []), point];
  return next.length > max ? next.slice(next.length - max) : next;
}

interface TrendState {
  projectId: string | null;
  series: Record<string, readonly TrendPoint[]>;
  ingest: (projectId: string | null, tags: Record<string, ScadaTagDefinition>) => void;
}

export const useTagTrendStore = create<TrendState>((set, get) => ({
  projectId: null,
  series: {},
  ingest: (projectId, tags) => {
    const s = get();
    // Troca de projeto zera tudo: nunca misturar séries de plantas diferentes.
    const base = s.projectId === projectId ? s.series : {};
    let changed = s.projectId !== projectId;
    const next: Record<string, readonly TrendPoint[]> = { ...base };
    let count = Object.keys(next).length;
    for (const tag of Object.values(tags)) {
      if (!tag?.name) continue;
      const prev = next[tag.name];
      if (!prev && count >= TREND_MAX_TAGS) continue;
      const updated = appendTrendPoint(prev, tag);
      if (updated !== prev && updated) {
        if (!prev) count += 1;
        next[tag.name] = updated;
        changed = true;
      }
    }
    if (changed) set({ projectId, series: next });
  },
}));

let unsubscribe: (() => void) | null = null;

/** Liga o gravador uma única vez por aba (idempotente). */
export function ensureTagTrendRecorder(): void {
  if (unsubscribe || typeof window === "undefined") return;
  const record = () => {
    const st = useScadaStore.getState();
    useTagTrendStore.getState().ingest(st.currentProjectId, st.tags);
  };
  record();
  unsubscribe = useScadaStore.subscribe((st, prev) => {
    if (st.tags !== prev.tags || st.currentProjectId !== prev.currentProjectId) record();
  });
}
