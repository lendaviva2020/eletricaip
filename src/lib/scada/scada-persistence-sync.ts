/**
 * Detecta o que mudou na lista de alarmes e na auditoria do store e monta o
 * lote a gravar (puro e testável; o envio é injetado).
 *
 * - Alarme novo, reconhecido ou normalizado → upsert da ocorrência.
 * - Alarme que SAIU da lista → ocorrência marcada como normalizada.
 * - Evento de auditoria ainda não gravado → acrescentado à cadeia.
 * Falha no envio: nada é marcado como gravado; a próxima rodada reenvia
 * (o upsert por ocorrência torna o reenvio seguro).
 */
import type { ScadaAlarmItem, ScadaAuditLog } from "./types";
import {
  PERSIST_MAX_ALARMS,
  PERSIST_MAX_AUDIT,
  alarmOccurrenceId,
  alarmToOccurrence,
  auditToEntry,
  isAuditWorthy,
  occurrenceFingerprint,
  type AlarmOccurrence,
  type AuditEntry,
} from "./scada-persistence-model";

export interface PersistBatch {
  alarms: AlarmOccurrence[];
  audit: AuditEntry[];
}

export class ScadaPersistenceTracker {
  /** ocorrência → última assinatura gravada. */
  private sent = new Map<string, string>();
  /** ocorrências presentes na última leitura (para detectar saída da lista). */
  private present = new Map<string, ScadaAlarmItem>();

  /** Marca como já gravado o que veio do banco (não reenviar ao abrir). */
  seed(alarms: readonly ScadaAlarmItem[], now = Date.now()): void {
    for (const a of alarms) {
      const occ = alarmToOccurrence(a, true, now);
      this.sent.set(occ.occurrenceId, occurrenceFingerprint(occ));
      this.present.set(occ.occurrenceId, a);
    }
  }

  reset(): void {
    this.sent.clear();
    this.present.clear();
  }

  /** Lote a enviar agora, comparando com o que já foi gravado. */
  diff(
    alarms: readonly ScadaAlarmItem[],
    auditLogs: readonly ScadaAuditLog[],
    now = Date.now(),
  ): PersistBatch {
    const out: AlarmOccurrence[] = [];
    const current = new Map<string, ScadaAlarmItem>();
    for (const a of alarms) current.set(alarmOccurrenceId(a), a);

    const consider = (a: ScadaAlarmItem, present: boolean) => {
      const occ = alarmToOccurrence(a, present, now);
      const fp = occurrenceFingerprint(occ);
      if (this.sent.get(occ.occurrenceId) !== fp) out.push(occ);
    };
    for (const a of current.values()) consider(a, true);
    for (const [occId, a] of this.present) {
      if (!current.has(occId)) consider(a, false);
    }

    const audit: AuditEntry[] = [];
    for (const log of auditLogs) {
      if (!isAuditWorthy(log)) continue;
      const entry = auditToEntry(log);
      if (entry) audit.push(entry);
      if (audit.length >= PERSIST_MAX_AUDIT) break;
    }

    return { alarms: out.slice(0, PERSIST_MAX_ALARMS), audit };
  }

  /** Confirma o lote gravado e atualiza a fotografia da lista. */
  commit(batch: PersistBatch, alarms: readonly ScadaAlarmItem[]): void {
    for (const occ of batch.alarms) {
      this.sent.set(occ.occurrenceId, occurrenceFingerprint(occ));
    }
    const sentIds = new Set(batch.alarms.map((o) => o.occurrenceId));
    const next = new Map<string, ScadaAlarmItem>();
    for (const a of alarms) next.set(alarmOccurrenceId(a), a);
    // Saiu da lista mas ainda não gravou a normalização: continua acompanhado.
    for (const [occId, a] of this.present) {
      if (!next.has(occId) && !sentIds.has(occId)) next.set(occId, a);
    }
    this.present = next;
  }
}
