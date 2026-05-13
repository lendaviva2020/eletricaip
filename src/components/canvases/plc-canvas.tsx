import { Cpu, MemoryStick, Network, Activity } from "lucide-react";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

const data = Array.from({ length: 40 }, (_, i) => ({
  t: i,
  cycle: 7 + Math.sin(i / 3) * 0.8 + Math.random() * 0.4,
  cpu: 32 + Math.sin(i / 4) * 6 + Math.random() * 3,
}));

export function PlcCanvas() {
  return (
    <div className="relative h-full w-full overflow-auto p-6 pt-16 pb-20">
      <FloatingLegend
        title="PLC Runtime"
        items={["S7-1500 emul.", "Firmware 2.9", "OB1 · 8ms", "Online"]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard icon={Cpu} label="CPU" value="32%" sub="OB1 · 8.2 ms" />
        <StatCard icon={MemoryStick} label="Memória" value="42 / 256 MB" sub="DB load 16%" />
        <StatCard icon={Network} label="I/O" value="64 DI · 32 DO" sub="0 erros" />
      </div>

      <div className="mt-4 rounded-md border border-border glass p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-primary" /> Cycle Time (ms)
          </div>
          <span className="text-[10px] font-mono text-success">● HEALTHY</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={data}>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={[0, 12]} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.20 0.015 250)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="cycle"
                stroke="oklch(0.78 0.17 200)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="oklch(0.86 0.20 90)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border border-border glass p-4">
          <div className="text-sm font-medium mb-3">Tags ativas</div>
          <table className="w-full text-[11px] font-mono">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left pb-1">Tag</th>
                <th className="text-left pb-1">Tipo</th>
                <th className="text-right pb-1">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {[
                ["ESTEIRA01.RUN", "BOOL", "TRUE"],
                ["TQ101.NIVEL", "REAL", "64.2"],
                ["P201.SPEED", "INT", "1450"],
                ["R401.TEMP", "REAL", "82.4"],
                ["V303.POS", "REAL", "78.0"],
              ].map(([t, k, v]) => (
                <tr key={t}>
                  <td className="py-1.5">{t}</td>
                  <td className="text-muted-foreground">{k}</td>
                  <td className="text-right text-primary">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-md border border-border glass p-4">
          <div className="text-sm font-medium mb-3">Diagnóstico</div>
          <ul className="text-[12px] space-y-1.5">
            <li className="flex justify-between">
              <span>OB1 Cycle</span>
              <span className="font-mono text-success">8.2 ms</span>
            </li>
            <li className="flex justify-between">
              <span>Watchdog</span>
              <span className="font-mono text-success">OK</span>
            </li>
            <li className="flex justify-between">
              <span>Profinet</span>
              <span className="font-mono text-success">12 dispositivos</span>
            </li>
            <li className="flex justify-between">
              <span>OPC-UA</span>
              <span className="font-mono text-success">Conectado</span>
            </li>
            <li className="flex justify-between">
              <span>Modbus TCP</span>
              <span className="font-mono text-warning">Latência 38ms</span>
            </li>
          </ul>
        </div>
      </div>

      <BottomStrip
        items={[
          ["Cycle", "8.2 ms"],
          ["Tags", "142"],
          ["I/O", "96"],
          ["Uptime", "12d 04h"],
        ]}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: any) {
  return (
    <div className="rounded-md border border-border glass p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-2xl font-mono text-primary text-glow">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
