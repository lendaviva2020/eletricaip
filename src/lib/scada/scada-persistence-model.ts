/**
 * Persistência de alarmes e auditoria do SCADA (puro: cliente e servidor).
 *
 * Uma OCORRÊNCIA de alarme é `id@timestamp`: o mesmo alarme (ex.: falha de
 * comunicação de um tag) pode disparar várias vezes; cada disparo é uma linha
 * em `alarm_history`, atualizada no reconhecimento e na normalização.
 */
import { z } from "zod";
import type { AlarmSeverity, ProtocolDriver, ScadaAlarmItem, ScadaAuditLog } from "./types";

export const PERSIST_MAX_ALARMS = 200;
export const PERSIST_MAX_AUDIT = 200;

const PROTOCOLS = [
  "SIMULATION",
  "INTERNAL_RUNTIME",
  "OPC_UA",
  "MODBUS_TCP",
  "MQTT",
  "IOT",
  "IMPORTED",
] as const satisfies readonly ProtocolDriver[];

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export function alarmOccurrenceId(a: Pick<ScadaAlarmItem, "id" | "timestamp">): string {
  return `${a.id}@${a.timestamp}`.slice(0, 200);
}

const isoOrNull = z
  .string()
  .max(40)
  .nullable()
  .refine((v) => v === null || Number.isFinite(Date.parse(v)), "data inválida");

export const AlarmOccurrenceSchema = z.object({
  occurrenceId: z.string().min(1).max(200),
  tag: z.string().min(1).max(128),
  description: z.string().min(1).max(500),
  priority: z.enum(SEVERITIES),
  category: z.enum(["PROCESS", "ELECTRICAL", "SAFETY", "COMMUNICATION"]),
  state: z.enum(["active", "acknowledged", "cleared"]),
  value: z.number().finite().nullable(),
  setpoint: z.number().finite().nullable(),
  triggeredAt: z
    .string()
    .max(40)
    .refine((v) => Number.isFinite(Date.parse(v))),
  acknowledgedAt: isoOrNull,
  acknowledgedBy: z.string().max(120).nullable(),
  clearedAt: isoOrNull,
  source: z.enum(PROTOCOLS).nullable(),
});
export type AlarmOccurrence = z.infer<typeof AlarmOccurrenceSchema>;

export const AuditEntrySchema = z.object({
  clientId: z.string().min(1).max(120),
  timestamp: z.number().int().positive(),
  category: z.enum(["OPERATOR", "ALARM", "SECURITY", "SYSTEM", "COMMUNICATION"]),
  operator: z.string().max(120),
  action: z.string().regex(/^[A-Z0-9_]{3,48}$/),
  tag: z.string().max(128).optional(),
  equipment: z.string().max(128).optional(),
  details: z.string().max(1000),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

const toIso = (ms: number | null | undefined): string | null =>
  typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;

/** Item da lista → ocorrência a gravar. `present=false`: sumiu da lista (normalizou). */
export function alarmToOccurrence(
  a: ScadaAlarmItem,
  present: boolean,
  now: number,
): AlarmOccurrence {
  const cleared = !present || a.clearedAt != null;
  const state: AlarmOccurrence["state"] = cleared
    ? "cleared"
    : a.state === "ACK"
      ? "acknowledged"
      : "active";
  return {
    occurrenceId: alarmOccurrenceId(a),
    tag: a.tag.slice(0, 128) || "—",
    description: a.description.slice(0, 500) || "Alarme",
    priority: a.priority,
    category: a.category,
    state,
    value: numOrNull(a.currentValue),
    setpoint: numOrNull(a.setpointLimit),
    triggeredAt: new Date(a.timestamp).toISOString(),
    acknowledgedAt: toIso(a.acknowledgedAt),
    acknowledgedBy: a.acknowledgedBy ? a.acknowledgedBy.slice(0, 120) : null,
    clearedAt: cleared ? (toIso(a.clearedAt) ?? new Date(now).toISOString()) : null,
    source: a.source ?? null,
  };
}

/** Assinatura do que importa gravar: muda só em disparo, reconhecimento ou normalização. */
export function occurrenceFingerprint(o: AlarmOccurrence): string {
  return `${o.state}|${o.acknowledgedAt ?? ""}|${o.clearedAt ?? ""}|${o.description}`;
}

/**
 * Eventos que vão para a trilha de auditoria. Abertura de projeto não é
 * auditada (seria um registro por visita); forçamento é gravado pelo servidor
 * depois de conferir o papel, então a cópia do navegador é ignorada.
 */
export function isAuditWorthy(log: ScadaAuditLog): boolean {
  if (log.persisted) return false;
  if (log.action === "PROJECT_CONTEXT_SET") return false;
  if (log.action === "TAG_FORCE") return false;
  return true;
}

export function auditToEntry(log: ScadaAuditLog): AuditEntry | null {
  const parsed = AuditEntrySchema.safeParse({
    clientId: log.id.slice(0, 120),
    timestamp: Math.trunc(log.timestamp),
    category: log.category,
    operator: (log.operator || "OPERADOR").slice(0, 120),
    action: log.action
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .slice(0, 48),
    tag: log.tag?.slice(0, 128),
    equipment: log.equipment?.slice(0, 128),
    details: log.details.slice(0, 1000),
    severity: log.severity,
  });
  return parsed.success ? parsed.data : null;
}

// ── Banco → store ────────────────────────────────────────────────────────

export interface AlarmHistoryRow {
  occurrence_id: string | null;
  tag_name: string;
  description: string;
  severity: string;
  state: string;
  category: string;
  value: number | null;
  setpoint: number | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  cleared_at: string | null;
  source: string | null;
}

const DB_SEVERITY: Record<string, AlarmSeverity> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

const DB_CATEGORY: Record<string, ScadaAlarmItem["category"]> = {
  process: "PROCESS",
  equipment: "ELECTRICAL",
  safety: "SAFETY",
  communication: "COMMUNICATION",
};

export function categoryToDb(
  c: ScadaAlarmItem["category"],
): "process" | "equipment" | "safety" | "communication" {
  if (c === "ELECTRICAL") return "equipment";
  return c.toLowerCase() as "process" | "safety" | "communication";
}

export function severityToDb(p: AlarmSeverity): "critical" | "high" | "medium" | "low" | "info" {
  return p.toLowerCase() as "critical" | "high" | "medium" | "low" | "info";
}

const parseMs = (v: string | null): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export function rowToAlarm(row: AlarmHistoryRow): ScadaAlarmItem | null {
  const triggered = parseMs(row.triggered_at);
  if (triggered === null) return null;
  // id da lista = parte antes do "@" (o mesmo que o motor/fonte usa).
  const occ = row.occurrence_id ?? "";
  const at = occ.lastIndexOf("@");
  const id = at > 0 ? occ.slice(0, at) : occ || `db:${row.tag_name}:${triggered}`;
  const source = (PROTOCOLS as readonly string[]).includes(row.source ?? "")
    ? (row.source as ProtocolDriver)
    : undefined;
  const category = DB_CATEGORY[row.category];
  return {
    id,
    tag: row.tag_name,
    description: row.description,
    priority: DB_SEVERITY[row.severity] ?? "INFO",
    category: category ?? "PROCESS",
    currentValue: row.value ?? "—",
    setpointLimit: row.setpoint ?? "—",
    state: row.state === "acknowledged" ? "ACK" : "UNACK",
    timestamp: triggered,
    acknowledgedAt: parseMs(row.acknowledged_at),
    acknowledgedBy: row.acknowledged_by,
    clearedAt: parseMs(row.cleared_at),
    origin: "RESTORED",
    source,
  };
}

/**
 * O que volta para a lista ao recarregar: tudo que ainda exige atenção
 * (ativo ou normalizado sem reconhecimento). Reconhecido e normalizado sai.
 */
export function shouldRestore(a: ScadaAlarmItem): boolean {
  return !(a.state === "ACK" && a.clearedAt != null);
}
