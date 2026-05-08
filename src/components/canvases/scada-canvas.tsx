import { motion } from "framer-motion";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

export function ScadaCanvas() {
  return (
    <div className="relative h-full w-full overflow-hidden industrial-grid scan-overlay">
      <FloatingLegend title="SCADA · HMI Runtime" items={["Linha 03", "Tags 142", "Alarms 2", "60 Hz"]} />

      <svg viewBox="0 0 900 480" className="absolute inset-0 m-auto w-[94%] h-[86%]">
        {/* Tank */}
        <g transform="translate(60,80)">
          <rect width="140" height="220" rx="12" fill="oklch(0.205 0.014 250)" stroke="oklch(0.78 0.17 200)" strokeWidth="2" />
          <motion.rect
            x="4" width="132" rx="10"
            fill="oklch(0.78 0.17 200 / 0.35)"
            stroke="oklch(0.78 0.17 200)"
            initial={{ y: 130, height: 86 }}
            animate={{ y: [130, 90, 130], height: [86, 126, 86] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <text x="70" y="-8" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="oklch(0.78 0.17 200)">TQ-101</text>
          <text x="70" y="240" textAnchor="middle" fontSize="10" fill="oklch(0.7 0.02 240)" fontFamily="monospace">Nível 64.2%</text>
        </g>

        {/* Pipe */}
        <path d="M 200 200 L 360 200" stroke="oklch(0.78 0.17 200)" strokeWidth="10" strokeLinecap="round" />
        <path d="M 200 200 L 360 200" stroke="oklch(0.86 0.20 90)" strokeWidth="3" strokeLinecap="round" className="flow-line" />

        {/* Pump */}
        <g transform="translate(360,200)">
          <circle r="36" fill="oklch(0.205 0.014 250)" stroke="oklch(0.78 0.18 150)" strokeWidth="2" />
          <motion.g animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
            <line x1="-22" y1="0" x2="22" y2="0" stroke="oklch(0.78 0.18 150)" strokeWidth="3" />
            <line x1="0" y1="-22" x2="0" y2="22" stroke="oklch(0.78 0.18 150)" strokeWidth="3" />
          </motion.g>
          <text y="58" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="oklch(0.78 0.18 150)">P-201 · RUN</text>
        </g>

        <path d="M 396 200 L 540 200" stroke="oklch(0.78 0.17 200)" strokeWidth="10" strokeLinecap="round" />
        <path d="M 396 200 L 540 200" stroke="oklch(0.86 0.20 90)" strokeWidth="3" strokeLinecap="round" className="flow-line" />

        {/* Valve */}
        <g transform="translate(560,200)">
          <polygon points="0,-18 0,18 36,0" fill="oklch(0.205 0.014 250)" stroke="oklch(0.82 0.17 80)" strokeWidth="2" />
          <polygon points="36,-18 36,18 0,0" fill="oklch(0.205 0.014 250)" stroke="oklch(0.82 0.17 80)" strokeWidth="2" />
          <text x="18" y="40" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="oklch(0.82 0.17 80)">V-303 · 78%</text>
        </g>

        {/* Reactor */}
        <g transform="translate(700,90)">
          <rect width="160" height="200" rx="80" fill="oklch(0.205 0.014 250)" stroke="oklch(0.78 0.17 200)" strokeWidth="2" />
          <motion.circle cx="80" cy="100" r="52" fill="none" stroke="oklch(0.86 0.20 90)" strokeOpacity="0.6"
            animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            strokeDasharray="4 8" style={{ originX: "80px", originY: "100px" }}
          />
          <text x="80" y="-8" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="oklch(0.78 0.17 200)">R-401</text>
          <text x="80" y="220" textAnchor="middle" fontSize="10" fill="oklch(0.7 0.02 240)" fontFamily="monospace">82.4 °C · 3.1 bar</text>
        </g>

        {/* KPI cards */}
        <g transform="translate(60,330)">
          {[["FLOW", "142 m³/h", "oklch(0.78 0.17 200)"],
            ["TEMP", "82.4 °C", "oklch(0.86 0.20 90)"],
            ["EFF.", "94.1 %", "oklch(0.78 0.18 150)"]].map(([k, v, c], i) => (
            <g key={k} transform={`translate(${i * 180},0)`}>
              <rect width="160" height="64" rx="8" fill="oklch(0.205 0.014 250)" stroke="oklch(0.28 0.018 250)" />
              <text x="14" y="22" fontSize="10" fontFamily="monospace" fill="oklch(0.68 0.02 240)">{k}</text>
              <text x="14" y="48" fontSize="22" fontFamily="monospace" fill={c as string} fontWeight="600">{v}</text>
            </g>
          ))}
        </g>
      </svg>

      <BottomStrip items={[["Tags", "142"], ["Alarmes", "2 ⚠"], ["FPS", "60"], ["ISA-18.2", "✓"]]} />
    </div>
  );
}
