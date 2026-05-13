import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

const series = (n: number, base: number, amp: number) =>
  Array.from({ length: 60 }, (_, i) => ({
    t: i,
    v: base + Math.sin(i / 4 + n) * amp + Math.random() * (amp / 6),
  }));

export function SimCanvas() {
  return (
    <div className="relative h-full w-full overflow-auto p-6 pt-16 pb-20">
      <FloatingLegend
        title="Simulação · Tempo Real"
        items={["Δt 16ms", "Modelo físico", "Solver: RK4", "Live"]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "Vazão (m³/h)", color: "oklch(0.78 0.17 200)", data: series(0, 140, 12) },
          { label: "Pressão (bar)", color: "oklch(0.86 0.20 90)", data: series(1, 3.2, 0.3) },
          { label: "Temperatura (°C)", color: "oklch(0.66 0.22 25)", data: series(2, 82, 4) },
          { label: "Corrente Motor (A)", color: "oklch(0.78 0.18 150)", data: series(3, 18, 2.4) },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-border glass p-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-muted-foreground uppercase tracking-wider">{s.label}</span>
              <span className="font-mono" style={{ color: s.color }}>
                ● live
              </span>
            </div>
            <div className="h-36">
              <ResponsiveContainer>
                <AreaChart data={s.data}>
                  <defs>
                    <linearGradient id={s.label} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.20 0.015 250)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#${s.label})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <BottomStrip
        items={[
          ["Solver", "RK4"],
          ["Δt", "16 ms"],
          ["Steps", "12.4k"],
          ["Drift", "0.02%"],
        ]}
      />
    </div>
  );
}
