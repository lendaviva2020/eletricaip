// SCADA — Núcleo compartilhado do supervisório: singletons de runtime/alarmes,
// limites e helpers puros usados pelo store, pelo ciclo (scada-tick) e por
// outras fontes. Fica num módulo próprio para quebrar o ciclo de import entre
// o store e o ciclo de simulação. O store RE-EXPORTA tudo isto, então quem
// importa de "@/lib/scada/scada-store" não muda.

import type {
  ScadaTagDefinition,
  ScadaAlarmItem,
  TagQuality,
  HistoricalSample,
  ExtendedAlarmInstance,
} from "./types";
import { IndustrialTagRuntime } from "./tag-runtime";
import { DeterministicAlarmEngine } from "./alarm-engine";

export const scadaTagRuntime = new IndustrialTagRuntime();

/** Teto do buffer de histórico no navegador (aba aberta por horas na sala de controle). */
export const MAX_BUFFERED_SAMPLES = 2000;
/** Igual ao `MAX_HISTORIAN_BATCH` do servidor. */
export const MAX_FLUSH_BATCH = 500;
/** Eventos de auditoria mantidos na tela (os já gravados podem sair). */
export const MAX_AUDIT_IN_MEMORY = 1000;

/** Mantém as amostras mais recentes; as mais antigas são descartadas e registradas. */
export function capHistoricalBuffer(samples: HistoricalSample[]): HistoricalSample[] {
  if (samples.length <= MAX_BUFFERED_SAMPLES) return samples;
  console.warn(
    `[scada.historian] buffer cheio: ${samples.length - MAX_BUFFERED_SAMPLES} amostra(s) antiga(s) descartada(s)`,
  );
  return samples.slice(-MAX_BUFFERED_SAMPLES);
}
export const scadaAlarmEngine = new DeterministicAlarmEngine();

/** Instâncias ativas do motor ISA-18.2 → itens da lista de alarmes. */
export function mapEngineAlarms(instances: ExtendedAlarmInstance[]): ScadaAlarmItem[] {
  return instances.map((inst) => ({
    id: inst.id,
    tag: inst.tagName,
    description: inst.description,
    priority: inst.severity,
    category:
      inst.alarmClass === "COMMUNICATION"
        ? "COMMUNICATION"
        : inst.alarmClass === "ELECTRICAL"
          ? "ELECTRICAL"
          : inst.alarmClass === "SAFETY_INDICATION"
            ? "SAFETY"
            : "PROCESS",
    currentValue: inst.triggerValue,
    setpointLimit: inst.setpointLimit,
    state: inst.ackState === "ACKNOWLEDGED" ? "ACK" : "UNACK",
    timestamp: inst.triggeredAt,
    acknowledgedAt: inst.acknowledgedAt,
    acknowledgedBy: inst.acknowledgedBy,
    clearedAt: inst.clearedAt,
    origin: "ENGINE",
  }));
}

/**
 * Lista única de alarmes: os do motor substituem os do motor; os demais
 * (fontes externas, E-STOP, restaurados do banco) são preservados. Antes, a
 * saída do motor SUBSTITUÍA a lista inteira (apagava o alarme de E-STOP) e,
 * quando o motor ficava sem alarmes, o último alarme ficava na tela para sempre.
 */
export function mergeAlarmLists(
  engine: ScadaAlarmItem[],
  current: ScadaAlarmItem[],
): ScadaAlarmItem[] {
  const engineIds = new Set(engine.map((a) => a.id));
  const kept = current.filter((a) => a.origin !== "ENGINE" && !engineIds.has(a.id));
  return [...engine, ...kept];
}

/** Papel mínimo para forçar tag (e motivo obrigatório). */
export const FORCE_REASON_MIN = 5;
export const FORCE_REASON_MAX = 500;

export interface ForceRequest {
  operator: string;
  reason: string;
  ttlMs?: number;
}

export interface PublishedTagValue {
  name: string;
  value: number | boolean | string;
  unit?: string;
  equipmentId?: string;
  quality?: TagQuality;
}

/** Definições novas do projeto + estado de runtime já publicado. */
export function mergeTagDefinitions(
  definitions: Record<string, ScadaTagDefinition>,
  current: Record<string, ScadaTagDefinition>,
): Record<string, ScadaTagDefinition> {
  const out: Record<string, ScadaTagDefinition> = { ...current };
  for (const [key, def] of Object.entries(definitions)) {
    const live = current[key] ?? current[def.name];
    out[key] =
      live && live.quality !== "NOT_CONNECTED"
        ? {
            ...def,
            value: live.value,
            quality: live.quality,
            driver: live.driver,
            isSimulated: live.isSimulated,
            lastUpdated: live.lastUpdated,
            forced: live.forced,
          }
        : def;
  }
  return out;
}

export function inferDataType(value: number | boolean | string): ScadaTagDefinition["dataType"] {
  if (typeof value === "boolean") return "BOOL";
  if (typeof value === "number") return "REAL";
  return "STRING";
}
