/**
 * Gestão de alarmes ISA-18.2 no servidor (Fase 3).
 *
 *  - `loadAlarmPointSettings`: racionalização, prateleira e fora de serviço
 *    do projeto (leitura pelo cliente do usuário — RLS de membro).
 *  - `updateAlarmPoint`: muda um ponto. Confere papel, recusa alarmes de
 *    segurança, grava a AUDITORIA e só então a linha (service role; a tabela
 *    não aceita escrita de cliente).
 *  - `loadAlarmKpis`: indicadores calculados de `alarm_history`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";
import { DEMO_ETE_PROJECT_ID } from "./demo-ete-seed";
import { authorizeProjectAccess } from "./scada.functions";
import { rowToAlarm, type AlarmHistoryRow } from "./scada-persistence-model";
import {
  PointKeySchema,
  RATIONALE_MAX,
  REASON_MAX,
  REASON_MIN,
  SHELVE_MAX_MS,
  alarmPointKey,
  computeAlarmKpis,
  isSafetyPoint,
  pointCategory,
  type AlarmCategory,
  type AlarmHistoryEvent,
  type AlarmKpis,
  type AlarmPointSetting,
} from "./alarm-management";

/** Prateleira: quem opera. Fora de serviço e racionalização: engenharia. */
export const SHELVE_ROLES = new Set(["owner", "admin", "engineer", "operator"]);
export const ENGINEERING_ROLES = new Set(["owner", "admin", "engineer"]);

export const KPI_MAX_ROWS = 20_000;

interface SettingRow {
  point_key: string;
  tag_name: string;
  cause: string | null;
  consequence: string | null;
  corrective_action: string | null;
  response_time_min: number | null;
  rationalized_at: string | null;
  shelved_until: string | null;
  shelved_at: string | null;
  shelve_reason: string | null;
  out_of_service: boolean;
  oos_at: string | null;
  oos_reason: string | null;
}

const SETTING_COLUMNS =
  "point_key, tag_name, cause, consequence, corrective_action, response_time_min, rationalized_at, shelved_until, shelved_at, shelve_reason, out_of_service, oos_at, oos_reason";

const ms = (v: string | null): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export function rowToSetting(r: SettingRow): AlarmPointSetting {
  return {
    pointKey: r.point_key,
    tagName: r.tag_name,
    cause: r.cause,
    consequence: r.consequence,
    correctiveAction: r.corrective_action,
    responseTimeMin: r.response_time_min,
    rationalizedAt: ms(r.rationalized_at),
    shelvedUntil: ms(r.shelved_until),
    shelvedAt: ms(r.shelved_at),
    shelveReason: r.shelve_reason,
    outOfService: Boolean(r.out_of_service),
    oosAt: ms(r.oos_at),
    oosReason: r.oos_reason,
  };
}

/** Tabela ainda não criada no banco (migration pendente): sem quebrar a tela. */
function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

export const loadAlarmPointSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.guid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; settings: AlarmPointSetting[]; role: string | null }> => {
      const ctx = context as unknown as AuthContext;
      if (data.projectId === DEMO_ETE_PROJECT_ID)
        return { available: true, settings: [], role: "owner" };
      const { role } = await authorizeProjectAccess(ctx, data.projectId);
      const { data: rows, error } = await ctx.supabase
        .from("alarm_point_settings")
        .select(SETTING_COLUMNS)
        .eq("project_id", data.projectId)
        .limit(5000);
      if (error) {
        if (isMissingTable(error.code)) return { available: false, settings: [], role };
        console.error("[alarm-mgmt] load:", error.code);
        throw new Response("Falha ao carregar a configuração de alarmes.", { status: 500 });
      }
      return {
        available: true,
        settings: ((rows ?? []) as SettingRow[]).map(rowToSetting),
        role,
      };
    },
  );

const ReasonSchema = z.string().trim().min(REASON_MIN, "Informe o motivo.").max(REASON_MAX);
const RationaleText = z.string().trim().min(3).max(RATIONALE_MAX);

export const UpdateAlarmPointSchema = z.object({
  projectId: z.guid(),
  pointKey: PointKeySchema,
  tagName: z.string().trim().min(1).max(128),
  change: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("shelve"),
      minutes: z
        .number()
        .int()
        .min(1)
        .max(SHELVE_MAX_MS / 60_000),
      reason: ReasonSchema,
    }),
    z.object({ kind: z.literal("unshelve") }),
    z.object({ kind: z.literal("outOfService"), reason: ReasonSchema }),
    z.object({ kind: z.literal("returnToService") }),
    z.object({
      kind: z.literal("rationalize"),
      cause: RationaleText,
      consequence: RationaleText,
      correctiveAction: RationaleText,
      responseTimeMin: z.number().int().min(1).max(1440).nullable(),
    }),
  ]),
});
export type UpdateAlarmPointInput = z.infer<typeof UpdateAlarmPointSchema>;

/** Regras de negócio independentes do banco (testadas). */
export function checkAlarmPointChange(
  input: UpdateAlarmPointInput,
  role: string | null,
): { ok: true } | { ok: false; status: number; message: string } {
  const kind = input.change.kind;
  const category = pointCategory(input.pointKey) as AlarmCategory;
  if (input.pointKey !== alarmPointKey({ category, tag: input.tagName }))
    return { ok: false, status: 400, message: "Ponto e tag não conferem." };
  if (isSafetyPoint(input.pointKey) && kind !== "rationalize")
    return {
      ok: false,
      status: 403,
      message: "Alarme de segurança não pode ir para a prateleira nem sair de serviço.",
    };
  const allowed = kind === "shelve" || kind === "unshelve" ? SHELVE_ROLES : ENGINEERING_ROLES;
  if (!role || !allowed.has(role))
    return {
      ok: false,
      status: 403,
      message:
        kind === "shelve" || kind === "unshelve"
          ? "Sem permissão para pôr alarme na prateleira."
          : "Exige papel de engenharia ou administração.",
    };
  return { ok: true };
}

export const updateAlarmPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateAlarmPointSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ setting: AlarmPointSetting }> => {
    const ctx = context as unknown as AuthContext;
    if (data.projectId === DEMO_ETE_PROJECT_ID)
      throw new Response("Projeto de demonstração: alterações ficam só nesta tela.", {
        status: 400,
      });
    const { tenantId, role } = await authorizeProjectAccess(ctx, data.projectId, {
      requireWrite: true,
    });
    const verdict = checkAlarmPointChange(data, role);
    if (!verdict.ok) throw new Response(verdict.message, { status: verdict.status });

    const now = new Date();
    const nowIso = now.toISOString();
    const patch: TablesInsert<"alarm_point_settings"> = {
      project_id: data.projectId,
      point_key: data.pointKey,
      tag_name: data.tagName,
      updated_at: nowIso,
    };
    const c = data.change;
    let action: string;
    switch (c.kind) {
      case "shelve":
        action = "ALARM_SHELVE";
        patch.shelved_until = new Date(now.getTime() + c.minutes * 60_000).toISOString();
        patch.shelved_at = nowIso;
        patch.shelved_by = ctx.userId;
        patch.shelve_reason = c.reason;
        break;
      case "unshelve":
        action = "ALARM_UNSHELVE";
        patch.shelved_until = null;
        patch.shelved_at = null;
        patch.shelved_by = null;
        patch.shelve_reason = null;
        break;
      case "outOfService":
        action = "ALARM_OUT_OF_SERVICE";
        patch.out_of_service = true;
        patch.oos_at = nowIso;
        patch.oos_by = ctx.userId;
        patch.oos_reason = c.reason;
        break;
      case "returnToService":
        action = "ALARM_RETURN_TO_SERVICE";
        patch.out_of_service = false;
        patch.oos_at = null;
        patch.oos_by = null;
        patch.oos_reason = null;
        break;
      case "rationalize":
        action = "ALARM_RATIONALIZE";
        patch.cause = c.cause;
        patch.consequence = c.consequence;
        patch.corrective_action = c.correctiveAction;
        patch.response_time_min = c.responseTimeMin;
        patch.rationalized_at = nowIso;
        patch.rationalized_by = ctx.userId;
        break;
    }

    const { appendAuditEntries } = await import("./audit-append.server");
    await appendAuditEntries(tenantId, ctx.userId, [
      {
        action,
        resourceId: data.projectId,
        resourceType: "scada",
        details: {
          category: "ALARM",
          severity: c.kind === "outOfService" || c.kind === "shelve" ? "WARNING" : "INFO",
          tag: data.tagName,
          pointKey: data.pointKey,
          role,
          change: c,
        },
      },
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // `patch` é montado dinamicamente (campos variam por tipo de mudança);
    // o cast permite o upsert parcial. As chaves/valores já batem com a tabela.
    const { data: row, error } = await supabaseAdmin
      .from("alarm_point_settings")
      .upsert(patch, { onConflict: "project_id,point_key" })
      .select(SETTING_COLUMNS)
      .single();
    if (error || !row) {
      console.error("[alarm-mgmt] update:", error?.code);
      if (isMissingTable(error?.code))
        throw new Response("Gestão de alarmes ainda não ativada no banco.", { status: 503 });
      throw new Response("Falha ao gravar o alarme.", { status: 500 });
    }
    return { setting: rowToSetting(row as SettingRow) };
  });

export const KPI_WINDOWS_H = [24, 168, 720] as const;

export const loadAlarmKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.guid(),
        hours: z.union([z.literal(24), z.literal(168), z.literal(720)]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ kpis: AlarmKpis; truncated: boolean } | null> => {
    const ctx = context as unknown as AuthContext;
    if (data.projectId === DEMO_ETE_PROJECT_ID) return null;
    await authorizeProjectAccess(ctx, data.projectId);
    const now = Date.now();
    const from = now - data.hours * 3_600_000;
    const db = ctx.supabase;
    const cols =
      "occurrence_id, tag_name, description, severity, state, category, value, setpoint, triggered_at, acknowledged_at, acknowledged_by, cleared_at, source";
    const [rangeRes, standingRes] = await Promise.all([
      db
        .from("alarm_history")
        .select(cols)
        .eq("project_id", data.projectId)
        .gte("triggered_at", new Date(from).toISOString())
        .order("triggered_at", { ascending: false })
        .limit(KPI_MAX_ROWS),
      // Parados: ainda não normalizados, mais antigos que o intervalo.
      db
        .from("alarm_history")
        .select(cols)
        .eq("project_id", data.projectId)
        .is("cleared_at", null)
        .lt("triggered_at", new Date(from).toISOString())
        .limit(500),
    ]);
    if (rangeRes.error || standingRes.error) {
      console.error("[alarm-mgmt] kpis:", rangeRes.error?.code, standingRes.error?.code);
      throw new Response("Falha ao calcular os indicadores.", { status: 500 });
    }
    const events: AlarmHistoryEvent[] = [];
    for (const r of [
      ...((rangeRes.data ?? []) as AlarmHistoryRow[]),
      ...((standingRes.data ?? []) as AlarmHistoryRow[]),
    ]) {
      const a = rowToAlarm(r);
      if (!a) continue;
      events.push({
        pointKey: alarmPointKey(a),
        tag: a.tag,
        priority: a.priority,
        triggeredAt: a.timestamp,
        acknowledgedAt: a.acknowledgedAt ?? null,
        clearedAt: a.clearedAt ?? null,
      });
    }
    return {
      kpis: computeAlarmKpis(events, { from, to: now, now }),
      truncated: (rangeRes.data ?? []).length >= KPI_MAX_ROWS,
    };
  });
