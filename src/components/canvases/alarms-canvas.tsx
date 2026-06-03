import { useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, BellRing } from "lucide-react";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";
import { useAlarmStore, type LiveAlarm } from "@/lib/alarm-store";
import { toast } from "sonner";
import { useNotificationStore } from "@/lib/notification-store";

const SEV_CONF = {
  critical: {
    icon: AlertCircle,
    color: "text-destructive",
    dot: "bg-destructive",
    bg: "bg-destructive/10",
    label: "CRIT",
  },
  high: {
    icon: AlertCircle,
    color: "text-orange-500",
    dot: "bg-orange-500",
    bg: "bg-orange-500/10",
    label: "HIGH",
  },
  medium: {
    icon: AlertTriangle,
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
    icon: CheckCircle2,
    color: "text-success",
    dot: "bg-success",
    bg: "bg-success/10",
    label: "INFO",
  },
} as const;

export function AlarmsCanvas() {
  const alarms = useAlarmStore((s) => s.alarms);
  const unackedCount = useAlarmStore((s) => s.unackedCount);
  const totalToday = useAlarmStore((s) => s.totalToday);
  const ackTag = useAlarmStore((s) => s.acknowledgeTag);
  const ackAll = useAlarmStore((s) => s.acknowledgeAll);
  const registerNewAlarmCb = useAlarmStore((s) => s.registerNewAlarmCallback);
  const pushNotification = useNotificationStore((s) => s.addNotification);

  // Register callback for new alarms — fires pushNotification + toast
  useEffect(() => {
    registerNewAlarmCb((alarm: LiveAlarm) => {
      toast.error(`[${alarm.priority.toUpperCase()}] ${alarm.message}`, {
        description: `Tag: ${alarm.tagName} · ${new Date(alarm.triggeredAt).toLocaleTimeString("pt-BR")}`,
        duration: 8000,
      });
      pushNotification({
        id: `alarm-${alarm.id}`,
        type: "alarm",
        title: `Alarme ${alarm.priority}`,
        message: alarm.message,
        readAt: null,
        createdAt: new Date().toISOString(),
      });
    });
    return () => registerNewAlarmCb(null);
  }, [registerNewAlarmCb, pushNotification]);

  const activeCount = alarms.filter((a) => a.isActive).length;
  const ackedCount = alarms.filter((a) => a.state === "acknowledged").length;

  return (
    <div className="relative h-full w-full overflow-auto p-6 pt-16 pb-20">
      <FloatingLegend
        title="Alarmes · ISA-18.2"
        items={[`Active ${activeCount}`, `Acked ${ackedCount}`, `Shelved 0`, `Suppressed 0`]}
      />

      {unackedCount > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={ackAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors cursor-pointer"
          >
            <BellRing className="h-3.5 w-3.5" />
            Reconhecer todos ({unackedCount})
          </button>
        </div>
      )}

      {alarms.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto opacity-30" />
            <p>Nenhum alarme ativo</p>
            <p className="text-[11px] text-muted-foreground/60">
              Os alarmes aparecerão aqui quando as regras do ScadaEngine forem violadas.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border glass overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground bg-muted/40 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Sev.</th>
                <th className="px-3 py-2">Tag</th>
                <th className="px-3 py-2">Mensagem</th>
                <th className="px-3 py-2">Disparo</th>
                <th className="px-3 py-2">Cat.</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {alarms.map((a) => {
                const c = SEV_CONF[a.priority] ?? SEV_CONF.info;
                const Icon = c.icon;
                return (
                  <tr
                    key={a.id}
                    className={`hover:bg-accent/30 ${a.state === "unacknowledged" ? c.bg : ""}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${c.dot} ${a.isActive ? "energized" : ""}`}
                        />
                        <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {c.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground">{a.tagName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.message}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground text-[11px]">
                      {new Date(a.triggeredAt).toLocaleTimeString("pt-BR")}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                        {a.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {a.state === "acknowledged" || a.state === "cleared" ? (
                        <span className="text-success font-mono text-[10px]">
                          {a.state === "acknowledged" ? "ACKED" : "CLEAR"}
                        </span>
                      ) : (
                        <button
                          onClick={() => ackTag(a.tagName)}
                          className="text-[10px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 cursor-pointer transition-opacity"
                        >
                          ACK
                        </button>
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
          ["Total hoje", String(totalToday)],
          ["Ativos", String(activeCount)],
          ["Não reconhecidos", String(unackedCount)],
          ["ISA-18.2", "✓"],
        ]}
      />
    </div>
  );
}
