import { useEffect, useMemo, useRef } from "react";
import { useVisibleAlarms } from "@/lib/scada/alarm-management-store";
import { Warning, WarningCircle, Info, CheckCircle, BellRinging } from "@phosphor-icons/react";
import { BottomStrip, FloatingLegend } from "./canvas-chrome";
import { useScadaStore } from "@/lib/scada/scada-store";
import { sourceLabel } from "@/lib/scada/tag-hub";
import type { ScadaAlarmItem } from "@/lib/scada/types";
import { toast } from "sonner";
import { useNotificationStore } from "@/lib/notification-store";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";

const SEV_CONF = {
  critical: {
    icon: WarningCircle,
    color: "text-destructive",
    dot: "bg-destructive",
    bg: "bg-destructive/10",
    label: "CRIT",
  },
  high: {
    icon: WarningCircle,
    color: "text-orange-500",
    dot: "bg-orange-500",
    bg: "bg-orange-500/10",
    label: "HIGH",
  },
  medium: {
    icon: Warning,
    color: "text-amber-500",
    dot: "bg-amber-500",
    bg: "bg-amber-500/10",
    label: "MED",
  },
  low: {
    icon: Info,
    color: "text-sky-500",
    dot: "bg-sky-500",
    bg: "bg-sky-500/10",
    label: "LOW",
  },
  info: {
    icon: CheckCircle,
    color: "text-success",
    dot: "bg-success",
    bg: "bg-success/10",
    label: "INFO",
  },
} as const;

/** Prioridade ISA-18.2 do SCADA → estilo da tabela. */
function sevKey(p: ScadaAlarmItem["priority"]): keyof typeof SEV_CONF {
  return p.toLowerCase() as keyof typeof SEV_CONF;
}

/**
 * Modo Alarmes do workspace: a MESMA lista do SCADA (motor ISA-18.2, script
 * HMI, E-STOP e alarmes restaurados do banco). Antes havia uma segunda lista
 * só deste modo, que sumia ao recarregar a página.
 */
export function AlarmsCanvas() {
  const { t, locale } = useI18n();
  // Prateleira e fora de serviço ficam fora da lista (gestão no SCADA → Alarmes).
  const alarms = useVisibleAlarms();
  const acknowledgeAlarm = useScadaStore((s) => s.acknowledgeAlarm);
  const acknowledgeAll = useScadaStore((s) => s.acknowledgeAllAlarms);
  const pushNotification = useNotificationStore((s) => s.addNotification);
  const seen = useRef<Set<string> | null>(null);

  // Notifica só alarmes NOVOS (não os restaurados ao abrir a página).
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(alarms.map((a) => `${a.id}@${a.timestamp}`));
      return;
    }
    for (const a of alarms) {
      const key = `${a.id}@${a.timestamp}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      if (a.origin === "RESTORED" || a.state !== "UNACK") continue;
      const timeStr = formatDate(new Date(a.timestamp), locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      toast.error(`[${a.priority}] ${a.description}`, {
        description: `Tag: ${a.tag} · ${timeStr}`,
        duration: 8000,
      });
      pushNotification({
        id: `alarm-${key}`,
        type: "alarm",
        title: `Alarme ${a.priority}`,
        message: a.description,
        readAt: null,
        createdAt: new Date().toISOString(),
      });
    }
  }, [alarms, locale, pushNotification]);

  const stats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return {
      active: alarms.filter((a) => a.clearedAt == null).length,
      acked: alarms.filter((a) => a.state === "ACK").length,
      unacked: alarms.filter((a) => a.state === "UNACK").length,
      shelved: alarms.filter((a) => a.state === "SHELVED").length,
      today: alarms.filter((a) => a.timestamp >= startOfDay.getTime()).length,
    };
  }, [alarms]);

  return (
    <div className="relative h-full w-full overflow-auto p-6 pt-16 pb-20">
      <FloatingLegend
        title="Alarmes · ISA-18.2"
        items={[
          `${t("canvases.alarms.active")} ${stats.active}`,
          `${t("canvases.alarms.acked")} ${stats.acked}`,
          `${t("canvases.alarms.shelved")} ${stats.shelved}`,
        ]}
      />

      {stats.unacked > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => acknowledgeAll("OPERADOR")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors cursor-pointer"
          >
            <BellRinging className="h-3.5 w-3.5" />
            {t("canvases.alarms.acknowledgeAll", { count: stats.unacked })}
          </button>
        </div>
      )}

      {alarms.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <CheckCircle className="h-8 w-8 mx-auto opacity-30" />
            <p>{t("canvases.alarms.noneActive")}</p>
            <p className="text-[11px] text-muted-foreground/60">{t("canvases.alarms.emptyHint")}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border glass overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead className="text-left text-muted-foreground bg-muted/40 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">{t("canvases.alarms.colSev")}</th>
                <th className="px-3 py-2">{t("canvases.alarms.colTag")}</th>
                <th className="px-3 py-2">{t("canvases.alarms.colMessage")}</th>
                <th className="px-3 py-2">{t("canvases.alarms.colTrigger")}</th>
                <th className="px-3 py-2">{t("canvases.alarms.colSource")}</th>
                <th className="px-3 py-2 text-right">{t("canvases.alarms.colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {alarms.map((a) => {
                const c = SEV_CONF[sevKey(a.priority)] ?? SEV_CONF.info;
                const Icon = c.icon;
                const active = a.clearedAt == null;
                return (
                  <tr
                    key={`${a.id}@${a.timestamp}`}
                    className={`hover:bg-accent/30 ${a.state === "UNACK" ? c.bg : ""}`}
                    data-testid="alarm-row"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${c.dot} ${active ? "energized" : ""}`}
                        />
                        <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {c.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground">{a.tag}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.description}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground text-[11px]">
                      {formatDate(new Date(a.timestamp), locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                        {a.source ? sourceLabel(a.source) : a.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {a.state === "ACK" ? (
                        <span className="text-success font-mono text-[10px]">ACKED</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {!active && (
                            <span className="text-muted-foreground text-[10px]">
                              {t("canvases.alarms.returnedUnacked")}
                            </span>
                          )}
                          <button
                            onClick={() => acknowledgeAlarm(a.id, "OPERADOR")}
                            className="text-[10px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 cursor-pointer transition-opacity"
                          >
                            ACK
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BottomStrip
        items={[
          [t("canvases.alarms.totalToday"), String(stats.today)],
          [t("canvases.alarms.active"), String(stats.active)],
          [t("canvases.alarms.unacknowledged"), String(stats.unacked)],
        ]}
      />
    </div>
  );
}
