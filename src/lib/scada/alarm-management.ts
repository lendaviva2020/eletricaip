/**
 * Gestão de alarmes ISA-18.2 (Fase 3), puro e determinístico:
 *  - ponto de alarme (categoria + tag) como chave estável entre ocorrências;
 *  - racionalização (causa, consequência, ação, tempo de resposta);
 *  - prateleira (shelving) SEMPRE com prazo e fora de serviço com motivo;
 *  - primeiro alarme (first-out) de uma rajada;
 *  - indicadores de desempenho calculados do histórico (alarm_history).
 *
 * Alarmes de segurança (E-STOP etc.) nunca vão para a prateleira nem saem de
 * serviço pelo supervisório: a regra vale aqui e no servidor.
 */
import { z } from "zod";
import type { AlarmSeverity, ScadaAlarmItem } from "./types";

export const SHELVE_DURATIONS_MIN = [15, 60, 240, 480] as const;
export const SHELVE_MAX_MS = 8 * 60 * 60 * 1000;
export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const RATIONALE_MAX = 1000;

/** Referências públicas usuais (ISA-18.2 / EEMUA 191) por console de operação. */
export const ISA_TARGETS = {
  perHourAcceptable: 6,
  perHourManageable: 12,
  per10MinAcceptable: 1,
  per10MinManageable: 2,
  floodPer10Min: 10,
  floodTimePctMax: 1,
  top10ContributionPctMax: 5,
  chatterActivations: 3,
  chatterWindowMs: 60_000,
  standingMs: 24 * 60 * 60 * 1000,
} as const;

export type AlarmCategory = ScadaAlarmItem["category"];

export function alarmPointKey(a: Pick<ScadaAlarmItem, "category" | "tag">): string {
  return `${a.category}|${a.tag.trim().toUpperCase()}`.slice(0, 200);
}

/** Categoria do ponto pela chave (para a regra de segurança no servidor). */
export function pointCategory(pointKey: string): string {
  return pointKey.split("|", 1)[0] ?? "";
}

export function isSafetyPoint(pointKey: string): boolean {
  return pointCategory(pointKey) === "SAFETY";
}

export const PointKeySchema = z
  .string()
  .min(3)
  .max(200)
  .regex(
    /^(PROCESS|ELECTRICAL|SAFETY|COMMUNICATION)\|[^\s|][^|]{0,127}$/,
    "Ponto de alarme inválido.",
  );

export interface AlarmPointSetting {
  pointKey: string;
  tagName: string;
  cause: string | null;
  consequence: string | null;
  correctiveAction: string | null;
  responseTimeMin: number | null;
  rationalizedAt: number | null;
  shelvedUntil: number | null;
  shelvedAt: number | null;
  shelveReason: string | null;
  outOfService: boolean;
  oosAt: number | null;
  oosReason: string | null;
}

export function emptySetting(pointKey: string, tagName: string): AlarmPointSetting {
  return {
    pointKey,
    tagName,
    cause: null,
    consequence: null,
    correctiveAction: null,
    responseTimeMin: null,
    rationalizedAt: null,
    shelvedUntil: null,
    shelvedAt: null,
    shelveReason: null,
    outOfService: false,
    oosAt: null,
    oosReason: null,
  };
}

export function isShelved(s: AlarmPointSetting | undefined, now: number): boolean {
  return Boolean(s?.shelvedUntil && s.shelvedUntil > now);
}

export function isRationalized(s: AlarmPointSetting | undefined): boolean {
  return Boolean(s?.cause && s.consequence && s.correctiveAction);
}

export interface AlarmPartition {
  /** O que o operador vê na lista, no banner e na visão geral. */
  visible: ScadaAlarmItem[];
  shelved: ScadaAlarmItem[];
  outOfService: ScadaAlarmItem[];
}

/** Separa os alarmes pelo estado do ponto. Segurança é sempre visível. */
export function partitionAlarms(
  alarms: readonly ScadaAlarmItem[],
  settings: ReadonlyMap<string, AlarmPointSetting>,
  now: number,
): AlarmPartition {
  const out: AlarmPartition = { visible: [], shelved: [], outOfService: [] };
  for (const a of alarms) {
    const key = alarmPointKey(a);
    const s = settings.get(key);
    if (a.category === "SAFETY" || !s) out.visible.push(a);
    else if (s.outOfService) out.outOfService.push(a);
    else if (isShelved(s, now)) out.shelved.push(a);
    else out.visible.push(a);
  }
  return out;
}

/**
 * Primeiro alarme de cada rajada: alarmes do mesmo grupo (equipamento ou,
 * sem dono, todos juntos) disparados até `windowMs` depois do primeiro.
 * Só marca quando a rajada tem 2 ou mais alarmes.
 */
export function firstOutIds(
  alarms: readonly ScadaAlarmItem[],
  groupOf: (a: ScadaAlarmItem) => string,
  windowMs = 10_000,
): Set<string> {
  const groups = new Map<string, ScadaAlarmItem[]>();
  for (const a of alarms) {
    if (a.state === "CLEARED" || a.state === "SHELVED") continue;
    const g = groupOf(a);
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  const ids = new Set<string>();
  for (const list of groups.values()) {
    const sorted = [...list].sort((x, y) => x.timestamp - y.timestamp || x.id.localeCompare(y.id));
    let i = 0;
    while (i < sorted.length) {
      const start = sorted[i];
      let j = i + 1;
      while (j < sorted.length && sorted[j].timestamp - start.timestamp <= windowMs) j++;
      if (j - i >= 2) ids.add(start.id);
      i = j;
    }
  }
  return ids;
}

// ── Indicadores (ISA-18.2 cap. de monitoramento) ─────────────────────────────

export interface AlarmHistoryEvent {
  pointKey: string;
  tag: string;
  priority: AlarmSeverity;
  triggeredAt: number;
  acknowledgedAt: number | null;
  clearedAt: number | null;
}

export interface BadActor {
  pointKey: string;
  tag: string;
  count: number;
  pct: number;
}

export interface AlarmKpis {
  from: number;
  to: number;
  hours: number;
  total: number;
  perHour: number;
  per10MinAvg: number;
  peak10Min: number;
  floodIntervals: number;
  floodTimePct: number;
  chatteringPoints: { pointKey: string; tag: string; maxIn60s: number }[];
  standing: { pointKey: string; tag: string; since: number }[];
  topBadActors: BadActor[];
  top10Pct: number;
  priorityMix: Record<AlarmSeverity, number>;
  /** Mediana do tempo até o reconhecimento (ms), entre os reconhecidos. */
  medianAckMs: number | null;
}

const TEN_MIN = 10 * 60 * 1000;

/**
 * Calcula os indicadores no intervalo [from, to). `now` decide quais alarmes
 * estão parados (ativos há mais de 24 h, sem normalizar).
 */
export function computeAlarmKpis(
  events: readonly AlarmHistoryEvent[],
  range: { from: number; to: number; now: number },
): AlarmKpis {
  const { from, to, now } = range;
  const spanMs = Math.max(to - from, TEN_MIN);
  const hours = spanMs / 3_600_000;
  const inRange = events.filter(
    (e) => Number.isFinite(e.triggeredAt) && e.triggeredAt >= from && e.triggeredAt < to,
  );
  const total = inRange.length;

  const buckets = new Map<number, number>();
  for (const e of inRange) {
    const b = Math.floor((e.triggeredAt - from) / TEN_MIN);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const bucketCount = Math.ceil(spanMs / TEN_MIN);
  let peak = 0;
  let flood = 0;
  for (const n of buckets.values()) {
    if (n > peak) peak = n;
    if (n > ISA_TARGETS.floodPer10Min) flood++;
  }

  const byPoint = new Map<string, AlarmHistoryEvent[]>();
  for (const e of inRange) byPoint.set(e.pointKey, [...(byPoint.get(e.pointKey) ?? []), e]);

  const chattering: AlarmKpis["chatteringPoints"] = [];
  for (const [pointKey, list] of byPoint) {
    const ts = list.map((e) => e.triggeredAt).sort((a, b) => a - b);
    let best = 0;
    let lo = 0;
    for (let hi = 0; hi < ts.length; hi++) {
      while (ts[hi] - ts[lo] > ISA_TARGETS.chatterWindowMs) lo++;
      best = Math.max(best, hi - lo + 1);
    }
    if (best >= ISA_TARGETS.chatterActivations)
      chattering.push({ pointKey, tag: list[0].tag, maxIn60s: best });
  }
  chattering.sort((a, b) => b.maxIn60s - a.maxIn60s || a.pointKey.localeCompare(b.pointKey));

  // Parados: avaliados em todo o histórico recebido, não só no intervalo.
  const standingMap = new Map<string, { pointKey: string; tag: string; since: number }>();
  for (const e of events) {
    if (e.clearedAt != null || now - e.triggeredAt < ISA_TARGETS.standingMs) continue;
    const prev = standingMap.get(e.pointKey);
    if (!prev || e.triggeredAt < prev.since)
      standingMap.set(e.pointKey, { pointKey: e.pointKey, tag: e.tag, since: e.triggeredAt });
  }
  const standing = [...standingMap.values()].sort((a, b) => a.since - b.since);

  const actors: BadActor[] = [...byPoint.entries()]
    .map(([pointKey, list]) => ({
      pointKey,
      tag: list[0].tag,
      count: list.length,
      pct: total ? (list.length / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.pointKey.localeCompare(b.pointKey))
    .slice(0, 10);
  const top10Pct = actors.reduce((s, a) => s + a.pct, 0);

  const priorityMix: Record<AlarmSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  for (const e of inRange) priorityMix[e.priority] += 1;

  const ackDelays = inRange
    .filter((e) => e.acknowledgedAt != null && e.acknowledgedAt >= e.triggeredAt)
    .map((e) => (e.acknowledgedAt as number) - e.triggeredAt)
    .sort((a, b) => a - b);
  const medianAckMs = ackDelays.length
    ? ackDelays.length % 2
      ? ackDelays[(ackDelays.length - 1) / 2]
      : (ackDelays[ackDelays.length / 2 - 1] + ackDelays[ackDelays.length / 2]) / 2
    : null;

  return {
    from,
    to,
    hours,
    total,
    perHour: total / hours,
    per10MinAvg: total / bucketCount,
    peak10Min: peak,
    floodIntervals: flood,
    floodTimePct: bucketCount ? (flood / bucketCount) * 100 : 0,
    chatteringPoints: chattering,
    standing,
    topBadActors: actors,
    top10Pct,
    priorityMix,
    medianAckMs,
  };
}
