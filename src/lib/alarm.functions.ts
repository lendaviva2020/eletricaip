// Alarm server functions — ISA-18.2 alarm management backed by Supabase.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";

interface AuthCtx {
  supabase: SupabaseClient<Database>;
  userId: string;
}

// ── Types ──────────────────────────────────────────────────────

export type AlarmSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AlarmCategory = "process" | "equipment" | "safety" | "communication";

export interface AlarmConfigRow {
  id: string;
  project_id: string;
  tag_name: string;
  message: string;
  severity: AlarmSeverity;
  category: AlarmCategory;
  condition: string;
  enabled: boolean;
}

export interface AlarmHistoryRow {
  id: string;
  project_id: string;
  alarm_config_id: string | null;
  tag_name: string;
  message: string;
  severity: AlarmSeverity;
  category: AlarmCategory;
  state: string;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

// ── Server Functions ───────────────────────────────────────────

export const listAlarmConfigs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    const { data: rows, error } = await supabase
      .from("alarm_configs")
      .select("*")
      .eq("project_id", data.projectId)
      .order("severity");
    if (error) throw new Error(error.message);
    return { configs: rows as AlarmConfigRow[] };
  });

export const createAlarmConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        tagName: z.string().min(1),
        message: z.string().min(1),
        severity: z.enum(["critical", "high", "medium", "low", "info"]),
        category: z.enum(["process", "equipment", "safety", "communication"]),
        condition: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    const { data: row, error } = await supabase
      .from("alarm_configs")
      .insert({
        project_id: data.projectId,
        tag_name: data.tagName,
        message: data.message,
        severity: data.severity,
        category: data.category,
        condition: data.condition,
        enabled: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { config: row as AlarmConfigRow };
  });

export const listAlarmHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        limit: z.number().min(1).max(500).default(100),
        severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    let query = supabase
      .from("alarm_history")
      .select("*")
      .eq("project_id", data.projectId)
      .order("triggered_at", { ascending: false })
      .limit(data.limit);
    if (data.severity) query = query.eq("severity", data.severity);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { history: rows as AlarmHistoryRow[] };
  });

export const ackAlarm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ alarmId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as AuthCtx;
    const { error } = await supabase
      .from("alarm_history")
      .update({
        state: "acknowledged",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId,
      })
      .eq("id", data.alarmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const batchInsertAlarms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        alarms: z.array(
          z.object({
            alarm_config_id: z.string().uuid().optional(),
            tag_name: z.string(),
            message: z.string(),
            severity: z.enum(["critical", "high", "medium", "low", "info"]),
            category: z.enum(["process", "equipment", "safety", "communication"]),
            state: z.string(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;
    const { error } = await supabase.rpc("batch_insert_alarm_history", {
      p_alarms: data.alarms as unknown as Json,
      p_project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
