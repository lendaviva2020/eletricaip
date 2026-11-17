/**
 * Operações persistentes do SCADA (Fase 1):
 *  - `authorizeTagForce`: forçar tag exige papel (owner/admin/engineer) e motivo;
 *    o registro de auditoria é gravado AQUI, antes de o navegador aplicar.
 *  - `persistScadaBatch`: alarmes (upsert por ocorrência) e eventos de auditoria.
 *  - `loadScadaPersistedState`: o que volta à tela ao recarregar a página.
 *
 * Alarmes usam o cliente do usuário (RLS de alarm_history). Auditoria usa o
 * service role, só depois de `authorizeProjectAccess` (audit_logs não aceita
 * INSERT de cliente e operador não lê a cadeia de outros).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";
import { DEMO_ETE_PROJECT_ID } from "./demo-ete-seed";
import { authorizeProjectAccess } from "./scada.functions";
import {
  AlarmOccurrenceSchema,
  AuditEntrySchema,
  PERSIST_MAX_ALARMS,
  PERSIST_MAX_AUDIT,
  categoryToDb,
  rowToAlarm,
  severityToDb,
  shouldRestore,
  type AlarmHistoryRow,
} from "./scada-persistence-model";
import type { ScadaAlarmItem, ScadaAuditLog } from "./types";

/** Quem pode forçar tag (engenharia de manutenção; operador não). */
export const FORCE_ROLES = new Set(["owner", "admin", "engineer"]);

const ScalarSchema = z.union([z.number().finite(), z.boolean(), z.string().max(200)]);

function isDemo(projectId: string): boolean {
  return projectId === DEMO_ETE_PROJECT_ID;
}

async function operatorLabel(ctx: AuthContext): Promise<string> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  const name = typeof data?.full_name === "string" ? data.full_name.trim() : "";
  return name ? name.slice(0, 120) : "Usuário";
}

export const authorizeTagForce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.guid(),
        tagName: z.string().min(1).max(128),
        value: ScalarSchema,
        reason: z.string().trim().min(5, "Informe o motivo.").max(500),
        ttlMinutes: z
          .number()
          .int()
          .min(1)
          .max(24 * 60)
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ operator: string }> => {
    const ctx = context as unknown as AuthContext;
    if (isDemo(data.projectId)) return { operator: "Demonstração" };

    const { tenantId, role } = await authorizeProjectAccess(ctx, data.projectId, {
      requireWrite: true,
    });
    if (!role || !FORCE_ROLES.has(role)) {
      throw new Response("Forçar tag exige papel de engenharia ou administração.", {
        status: 403,
      });
    }
    const operator = await operatorLabel(ctx);
    const { appendAuditEntries } = await import("./audit-append.server");
    await appendAuditEntries(tenantId, ctx.userId, [
      {
        action: "TAG_FORCE",
        resourceId: data.projectId,
        resourceType: "scada",
        details: {
          category: "SECURITY",
          tag: data.tagName,
          value: data.value,
          reason: data.reason,
          ttlMinutes: data.ttlMinutes,
          role,
          operator,
        },
      },
    ]);
    return { operator };
  });

export const persistScadaBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.guid(),
        alarms: z.array(AlarmOccurrenceSchema).max(PERSIST_MAX_ALARMS),
        audit: z.array(AuditEntrySchema).max(PERSIST_MAX_AUDIT),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ alarms: number; auditIds: string[] }> => {
    const ctx = context as unknown as AuthContext;
    if (isDemo(data.projectId)) return { alarms: 0, auditIds: [] };
    const { tenantId } = await authorizeProjectAccess(ctx, data.projectId, {
      requireWrite: true,
    });

    if (data.alarms.length) {
      const rows = data.alarms.map((a) => ({
        project_id: data.projectId,
        occurrence_id: a.occurrenceId,
        tag_name: a.tag,
        description: a.description,
        message: a.description,
        category: categoryToDb(a.category),
        severity: severityToDb(a.priority),
        state: a.state,
        equipment_type: "CANONICAL",
        area: "GERAL",
        location: "PLANTA",
        value: a.value,
        setpoint: a.setpoint,
        triggered_at: a.triggeredAt,
        acknowledged_at: a.acknowledgedAt,
        acknowledged_by: a.acknowledgedBy,
        cleared_at: a.clearedAt,
        source: a.source,
        updated_at: new Date().toISOString(),
      }));
      // Colunas novas (occurrence_id/source) ainda fora dos tipos gerados.
      const { error } = await (ctx.supabase as unknown as SupabaseClient)
        .from("alarm_history")
        .upsert(rows, { onConflict: "project_id,occurrence_id" });
      if (error) {
        console.error("[scada.persist] alarmes:", error.code, error.message);
        throw new Response("Falha ao gravar alarmes.", { status: 500 });
      }
    }

    const auditIds: string[] = [];
    if (data.audit.length) {
      const { appendAuditEntries } = await import("./audit-append.server");
      const ordered = [...data.audit].sort((a, b) => a.timestamp - b.timestamp);
      await appendAuditEntries(
        tenantId,
        ctx.userId,
        ordered.map((e) => ({
          action: e.action,
          resourceId: data.projectId,
          resourceType: "scada",
          timestamp: e.timestamp,
          details: {
            clientId: e.clientId,
            category: e.category,
            severity: e.severity,
            // Rótulo informado pelo navegador; quem fez é `user_id` (do token).
            operatorLabel: e.operator,
            tag: e.tag ?? null,
            equipment: e.equipment ?? null,
            text: e.details,
          },
        })),
      );
      for (const e of ordered) auditIds.push(e.clientId);
    }
    return { alarms: data.alarms.length, auditIds };
  });

interface AuditRow {
  id: string;
  action: string;
  details: unknown;
  created_at: string;
}

function auditRowToLog(row: AuditRow): ScadaAuditLog | null {
  const created = Date.parse(row.created_at);
  if (!Number.isFinite(created)) return null;
  const d =
    row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const category = str(d.category);
  const severity = str(d.severity);
  return {
    id: str(d.clientId) ?? `db:${row.id}`,
    timestamp: created,
    category: (["OPERATOR", "ALARM", "SECURITY", "SYSTEM", "COMMUNICATION"] as const).includes(
      category as ScadaAuditLog["category"],
    )
      ? (category as ScadaAuditLog["category"])
      : "SYSTEM",
    operator: str(d.operator) ?? str(d.operatorLabel) ?? "—",
    action: row.action,
    tag: str(d.tag),
    equipment: str(d.equipment),
    details:
      str(d.text) ??
      (row.action === "TAG_FORCE"
        ? `Tag ${str(d.tag) ?? "?"} forçado para ${String(d.value)}. Motivo: ${str(d.reason) ?? "—"}`
        : row.action),
    severity:
      severity === "WARNING" || severity === "CRITICAL"
        ? severity
        : row.action === "TAG_FORCE"
          ? "WARNING"
          : "INFO",
    persisted: true,
  };
}

export const loadScadaPersistedState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.guid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ alarms: ScadaAlarmItem[]; auditLogs: ScadaAuditLog[] }> => {
      const ctx = context as unknown as AuthContext;
      if (isDemo(data.projectId)) return { alarms: [], auditLogs: [] };
      const { tenantId, role } = await authorizeProjectAccess(ctx, data.projectId);

      const db = ctx.supabase as unknown as SupabaseClient;
      const [openRes, recentRes] = await Promise.all([
        // Ainda exigem atenção, qualquer idade.
        db
          .from("alarm_history")
          .select(
            "occurrence_id, tag_name, description, severity, state, category, value, setpoint, triggered_at, acknowledged_at, acknowledged_by, cleared_at, source",
          )
          .eq("project_id", data.projectId)
          .is("acknowledged_at", null)
          .order("triggered_at", { ascending: false })
          .limit(PERSIST_MAX_ALARMS),
        db
          .from("alarm_history")
          .select(
            "occurrence_id, tag_name, description, severity, state, category, value, setpoint, triggered_at, acknowledged_at, acknowledged_by, cleared_at, source",
          )
          .eq("project_id", data.projectId)
          .is("cleared_at", null)
          .order("triggered_at", { ascending: false })
          .limit(PERSIST_MAX_ALARMS),
      ]);
      if (openRes.error || recentRes.error) {
        console.error("[scada.restore] alarmes:", openRes.error?.code, recentRes.error?.code);
        throw new Response("Falha ao carregar alarmes.", { status: 500 });
      }
      const byOcc = new Map<string, ScadaAlarmItem>();
      for (const row of [
        ...((openRes.data ?? []) as AlarmHistoryRow[]),
        ...((recentRes.data ?? []) as AlarmHistoryRow[]),
      ]) {
        const a = rowToAlarm(row);
        if (a && shouldRestore(a)) byOcc.set(`${a.id}@${a.timestamp}`, a);
      }
      // Uma linha por alarme na lista: a ocorrência mais recente vence.
      const latest = new Map<string, ScadaAlarmItem>();
      for (const a of byOcc.values()) {
        const prev = latest.get(a.id);
        if (!prev || a.timestamp > prev.timestamp) latest.set(a.id, a);
      }

      const alarms = [...latest.values()].sort((a, b) => b.timestamp - a.timestamp);
      // Visualizador não lê a trilha de auditoria (mesma regra da policy de audit_logs).
      if (!role || role === "viewer") return { alarms, auditLogs: [] };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id, action, details, created_at")
        .eq("tenant_id", tenantId)
        .eq("resource_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(PERSIST_MAX_AUDIT);
      if (error) {
        console.error("[scada.restore] auditoria:", error.code);
        throw new Response("Falha ao carregar a auditoria.", { status: 500 });
      }
      const auditLogs = (rows ?? [])
        .map((r) => auditRowToLog(r as AuditRow))
        .filter((l): l is ScadaAuditLog => l !== null);

      return { alarms, auditLogs };
    },
  );
