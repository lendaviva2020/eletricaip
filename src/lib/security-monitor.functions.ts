// Server functions for the security monitoring dashboard.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SecurityFinding {
  id: string;
  scanner: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "open" | "fixed" | "ignored";
  title: string;
  description: string;
  detectedAt: string;
  fixedAt?: string;
}

// Curated list of known findings from the latest agent_security scans + manual triage.
// Static so the dashboard works without an extra table; future versions can persist these.
const KNOWN_FINDINGS: SecurityFinding[] = [
  {
    id: "ai_quota_localStorage",
    scanner: "agent_security",
    severity: "medium",
    status: "fixed",
    title: "Cota de IA rastreada em localStorage",
    description:
      "Limite de chamadas IA estava em localStorage. Migrado para consume_ai_credits no servidor.",
    detectedAt: "2026-05-22T10:00:00Z",
    fixedAt: "2026-05-24T00:34:00Z",
  },
  {
    id: "modbus_error_oracle",
    scanner: "agent_security",
    severity: "medium",
    status: "fixed",
    title: "Modbus error oracle (SSRF)",
    description:
      "Mensagens detalhadas de erro Modbus permitiam port scanning. Agora retorna CONNECTION_FAILED genérico.",
    detectedAt: "2026-05-22T10:00:00Z",
    fixedAt: "2026-05-24T00:22:00Z",
  },
  {
    id: "opcua_ssrf",
    scanner: "agent_security",
    severity: "high",
    status: "fixed",
    title: "OPC-UA SSRF / role check",
    description:
      "Adicionado isOpcuaEndpointAllowed + verificação de tenant_memberships (owner/admin/engineer).",
    detectedAt: "2026-05-22T10:00:00Z",
    fixedAt: "2026-05-24T00:29:00Z",
  },
  {
    id: "rls_comments_notifications_templates",
    scanner: "supabase_lov",
    severity: "high",
    status: "fixed",
    title: "RLS pendente (comments, notifications, system_templates)",
    description:
      "Policies reescritas exigindo user_id = auth.uid() e tenant_id = get_user_tenant_id().",
    detectedAt: "2026-05-23T08:00:00Z",
    fixedAt: "2026-05-24T00:34:00Z",
  },
  {
    id: "realtime_messages_unscoped",
    scanner: "supabase_lov",
    severity: "high",
    status: "fixed",
    title: "realtime.messages sem escopo de tópico",
    description:
      "Adicionadas policies que limitam broadcast a user:<uid>:% e tenant:<tenant_id>:%.",
    detectedAt: "2026-05-23T08:00:00Z",
    fixedAt: "2026-05-24T00:34:00Z",
  },
  {
    id: "storage_client_logos",
    scanner: "supabase_lov",
    severity: "medium",
    status: "fixed",
    title: "Bucket client-logos com policies muito amplas",
    description: "Caminho passou a exigir prefixo tenant_id; políticas Authenticated removidas.",
    detectedAt: "2026-05-23T08:00:00Z",
    fixedAt: "2026-05-24T00:29:30Z",
  },
  {
    id: "profiles_role_escalation",
    scanner: "supabase_lov",
    severity: "critical",
    status: "fixed",
    title: "Escalonamento de privilégio em profiles",
    description: "Trigger prevent_profile_privilege_escalation ativo impede troca de role.",
    detectedAt: "2026-05-23T08:00:00Z",
    fixedAt: "2026-05-24T00:29:30Z",
  },
  {
    id: "auth_leaked_password_protection",
    scanner: "supabase_lov",
    severity: "medium",
    status: "open",
    title: "Leaked Password Protection desativado",
    description:
      "Ativar manualmente em Supabase Auth → Providers → Password. Não pode ser feito via código.",
    detectedAt: "2026-05-23T08:00:00Z",
  },
];

export interface SecurityDashboardData {
  findings: SecurityFinding[];
  totals: { open: number; fixed: number; ignored: number; critical: number; high: number };
  alertsByDay: { date: string; count: number; criticalCount: number }[];
  recentAlerts: {
    id: string;
    severity: string;
    title: string;
    message: string;
    triggeredAt: string;
    state: string;
  }[];
  auditByDay: { date: string; count: number }[];
  recentAudit: {
    id: string;
    action: string;
    resourceType: string | null;
    createdAt: string;
  }[];
}

export const getSecurityDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityDashboardData> => {
    const { supabase } = context as { supabase: ReturnType<typeof Object> } as any;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [alarmsRes, auditRes] = await Promise.all([
      supabase
        .from("alarm_history")
        .select("id, severity, state, description, message, triggered_at")
        .gte("triggered_at", since)
        .order("triggered_at", { ascending: false })
        .limit(500),
      supabase
        .from("audit_logs")
        .select("id, action, resource_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const alarms = (alarmsRes.data ?? []) as Array<{
      id: string;
      severity: string;
      state: string;
      description: string | null;
      message: string | null;
      triggered_at: string;
    }>;
    const audit = (auditRes.data ?? []) as Array<{
      id: string;
      action: string;
      resource_type: string | null;
      created_at: string;
    }>;

    const dayKey = (iso: string) => iso.slice(0, 10);
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }

    const alarmAgg = new Map<string, { count: number; crit: number }>();
    days.forEach((d) => alarmAgg.set(d, { count: 0, crit: 0 }));
    alarms.forEach((a) => {
      const k = dayKey(a.triggered_at);
      const cur = alarmAgg.get(k);
      if (!cur) return;
      cur.count += 1;
      if (a.severity === "critical" || a.severity === "high") cur.crit += 1;
    });

    const auditAgg = new Map<string, number>();
    days.forEach((d) => auditAgg.set(d, 0));
    audit.forEach((a) => {
      const k = dayKey(a.created_at);
      if (auditAgg.has(k)) auditAgg.set(k, (auditAgg.get(k) ?? 0) + 1);
    });

    const totals = {
      open: KNOWN_FINDINGS.filter((f) => f.status === "open").length,
      fixed: KNOWN_FINDINGS.filter((f) => f.status === "fixed").length,
      ignored: KNOWN_FINDINGS.filter((f) => f.status === "ignored").length,
      critical: KNOWN_FINDINGS.filter((f) => f.severity === "critical" && f.status === "open")
        .length,
      high: KNOWN_FINDINGS.filter((f) => f.severity === "high" && f.status === "open").length,
    };

    return {
      findings: KNOWN_FINDINGS,
      totals,
      alertsByDay: days.map((d) => ({
        date: d,
        count: alarmAgg.get(d)?.count ?? 0,
        criticalCount: alarmAgg.get(d)?.crit ?? 0,
      })),
      recentAlerts: alarms.slice(0, 10).map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.description ?? "Alarme",
        message: a.message ?? "",
        triggeredAt: a.triggered_at,
        state: a.state,
      })),
      auditByDay: days.map((d) => ({ date: d, count: auditAgg.get(d) ?? 0 })),
      recentAudit: audit.slice(0, 10).map((a) => ({
        id: a.id,
        action: a.action,
        resourceType: a.resource_type,
        createdAt: a.created_at,
      })),
    };
  });
