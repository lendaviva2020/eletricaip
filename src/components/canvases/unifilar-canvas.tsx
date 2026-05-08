import { motion } from "framer-motion";

/** Stylized SVG single-line diagram (IEC 60617-ish) with animated power flow. */
export function UnifilarCanvas() {
  return (
    <div className="relative h-full w-full industrial-grid scan-overlay overflow-hidden">
      <FloatingLegend
        title="Unifilar"
        items={["13.8kV / 380V", "QGBT-01", "CCM-03", "Linha 03"]}
      />

      <svg viewBox="0 0 900 520" className="absolute inset-0 m-auto w-[92%] h-[88%]">
        <defs>
          <linearGradient id="bus" x1="0" x2="1">
            <stop offset="0" stopColor="oklch(0.86 0.20 90)" />
            <stop offset="1" stopColor="oklch(0.78 0.18 60)" />
          </linearGradient>
        </defs>

        {/* Source */}
        <g>
          <circle cx="80" cy="60" r="18" fill="none" stroke="oklch(0.78 0.17 200)" strokeWidth="2" />
          <text x="80" y="65" textAnchor="middle" fontSize="14" fill="oklch(0.78 0.17 200)" fontFamily="monospace">~</text>
          <text x="80" y="32" textAnchor="middle" fontSize="10" fill="oklch(0.7 0.02 240)">CONCESSIONÁRIA 13.8 kV</text>
        </g>

        {/* Transformer */}
        <g transform="translate(80,140)">
          <circle cx="-8" cy="0" r="12" fill="none" stroke="oklch(0.86 0.20 90)" strokeWidth="2" />
          <circle cx="8" cy="0" r="12" fill="none" stroke="oklch(0.86 0.20 90)" strokeWidth="2" />
          <text x="40" y="4" fontSize="10" fill="oklch(0.7 0.02 240)" fontFamily="monospace">TR-01 · 1500kVA</text>
        </g>

        {/* Vertical feeder */}
        <line x1="80" y1="78" x2="80" y2="128" stroke="oklch(0.78 0.17 200)" strokeWidth="2" className="flow-line" />
        <line x1="80" y1="152" x2="80" y2="220" stroke="oklch(0.86 0.20 90)" strokeWidth="2.5" className="flow-line" />

        {/* Main bus */}
        <line x1="60" y1="220" x2="840" y2="220" stroke="url(#bus)" strokeWidth="6" />
        <text x="60" y="212" fontSize="10" fill="oklch(0.86 0.20 90)" fontFamily="monospace">QGBT-01 · 380V · 2500A</text>

        {/* Feeders */}
        {[160, 320, 480, 640, 780].map((x, i) => (
          <g key={x}>
            <line x1={x} y1="220" x2={x} y2="280" stroke="oklch(0.78 0.17 200)" strokeWidth="2" />
            {/* breaker */}
            <rect x={x - 8} y="280" width="16" height="22" fill="none" stroke="oklch(0.78 0.17 200)" strokeWidth="1.5" rx="2" />
            <line x1={x} y1="291" x2={x + 6} y2="285" stroke="oklch(0.78 0.17 200)" strokeWidth="1.5" />
            <line x1={x} y1="302" x2={x} y2="360" stroke="oklch(0.78 0.18 150)" strokeWidth="2" className="flow-line" />
            {/* Motor / load */}
            <circle cx={x} cy="385" r="22" fill="oklch(0.205 0.014 250)" stroke="oklch(0.78 0.18 150)" strokeWidth="2" />
            <text x={x} y="390" textAnchor="middle" fontSize="14" fill="oklch(0.78 0.18 150)" fontFamily="monospace">M</text>
            <text x={x} y="430" textAnchor="middle" fontSize="9" fill="oklch(0.68 0.02 240)" fontFamily="monospace">
              M-{String(i + 1).padStart(2, "0")} · {[7.5, 15, 22, 11, 5.5][i]}kW
            </text>
          </g>
        ))}

        {/* Animated current flow ball */}
        <motion.circle
          r="3.5"
          fill="oklch(0.86 0.20 90)"
          animate={{ cx: [60, 840], cy: 220 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
      </svg>

      <BottomStrip
        items={[
          ["Icc", "12.4 kA"],
          ["Seletividade", "OK"],
          ["Queda V%", "1.8 %"],
          ["Cabos", "32 OK / 0 ⚠"],
        ]}
      />
    </div>
  );
}

export function FloatingLegend({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="absolute top-4 left-4 z-10 glass rounded-md px-3 py-2 text-[11px]">
      <div className="text-muted-foreground uppercase tracking-[0.18em] text-[9px] mb-1">{title}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-foreground/90">
        {items.map((i) => <span key={i}>{i}</span>)}
      </div>
    </div>
  );
}

export function BottomStrip({ items }: { items: [string, string][] }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 glass rounded-md px-3 py-2 flex flex-wrap gap-4 text-[11px]">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase tracking-wider text-[9px]">{k}</span>
          <span className="font-mono text-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}
