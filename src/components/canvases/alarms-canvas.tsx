import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

const ALARMS = [
  {
    sev: "high",
    code: "ALM-1042",
    tag: "TQ-101.NIVEL",
    msg: "Nível alto · 92.4%",
    t: "12:42:18",
    ack: false,
  },
  {
    sev: "high",
    code: "ALM-1041",
    tag: "M-03.OVERLOAD",
    msg: "Sobrecarga térmica detectada",
    t: "12:39:02",
    ack: false,
  },
  {
    sev: "med",
    code: "ALM-1038",
    tag: "P-201.VIB",
    msg: "Vibração acima de 3.2 mm/s",
    t: "12:31:55",
    ack: true,
  },
  {
    sev: "low",
    code: "ALM-1031",
    tag: "OPC.LATENCY",
    msg: "Latência OPC-UA 38ms",
    t: "12:14:09",
    ack: true,
  },
  {
    sev: "info",
    code: "EVT-0992",
    tag: "PLC.RUN",
    msg: "OB1 reiniciado",
    t: "11:58:00",
    ack: true,
  },
];

const sevConf = {
  high: {
    icon: AlertCircle,
    color: "text-destructive",
    dot: "bg-destructive",
    bg: "bg-destructive/10",
  },
  med: { icon: AlertTriangle, color: "text-warning", dot: "bg-warning", bg: "bg-warning/10" },
  low: { icon: Info, color: "text-info", dot: "bg-info", bg: "bg-info/10" },
  info: { icon: CheckCircle2, color: "text-success", dot: "bg-success", bg: "bg-success/10" },
} as const;

export function AlarmsCanvas() {
  return (
    <div className="relative h-full w-full overflow-auto p-6 pt-16 pb-20">
      <FloatingLegend
        title="Alarmes · ISA-18.2"
        items={["Active 2", "Acked 2", "Shelved 0", "Suppressed 0"]}
      />

      <div className="rounded-md border border-border glass overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-left text-muted-foreground bg-muted/40 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2">Sev.</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Tag</th>
              <th className="px-3 py-2">Mensagem</th>
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {ALARMS.map((a) => {
              const c = sevConf[a.sev as keyof typeof sevConf];
              const Icon = c.icon;
              return (
                <tr key={a.code} className={`hover:bg-accent/30 ${!a.ack ? c.bg : ""}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${c.dot} ${!a.ack ? "energized" : ""}`}
                      />
                      <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{a.code}</td>
                  <td className="px-3 py-2 font-mono">{a.tag}</td>
                  <td className="px-3 py-2">{a.msg}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{a.t}</td>
                  <td className="px-3 py-2 text-right">
                    {a.ack ? (
                      <span className="text-success font-mono text-[10px]">ACKED</span>
                    ) : (
                      <button className="text-[10px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90">
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

      <BottomStrip
        items={[
          ["Total", "5"],
          ["Active", "2"],
          ["MTTR", "4.2 min"],
          ["ISA-18.2", "✓"],
        ]}
      />
    </div>
  );
}
