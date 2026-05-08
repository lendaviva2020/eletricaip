import { motion } from "framer-motion";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

export function TwinCanvas() {
  return (
    <div className="relative h-full w-full overflow-hidden"
         style={{ background: "radial-gradient(ellipse at top, oklch(0.22 0.02 230), oklch(0.14 0.012 250))" }}>
      <FloatingLegend title="Digital Twin · 2D/3D" items={["Physics ON", "Δt 16ms", "Mesh 3.2k", "GPU OK"]} />

      {/* Floor grid (perspective) */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 industrial-grid opacity-40"
        style={{ transform: "perspective(900px) rotateX(58deg)", transformOrigin: "center bottom" }}
      />

      <svg viewBox="0 0 900 520" className="relative w-full h-full">
        {/* Conveyor */}
        <g transform="translate(120,260)">
          <rect width="500" height="44" rx="6" fill="oklch(0.24 0.014 250)" stroke="oklch(0.78 0.17 200)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.rect
              key={i}
              x={20 + i * 100} y="10" width="60" height="24" rx="3"
              fill="oklch(0.78 0.17 200 / 0.35)" stroke="oklch(0.78 0.17 200)"
              animate={{ x: [20 + i * 100, 460 + i * 100] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
          ))}
          <text y="-10" fontSize="10" fontFamily="monospace" fill="oklch(0.7 0.02 240)">CONVEYOR-01 · 1.2 m/s</text>
        </g>

        {/* Motor */}
        <g transform="translate(60,280)">
          <rect width="60" height="46" rx="6" fill="oklch(0.205 0.014 250)" stroke="oklch(0.78 0.18 150)" />
          <motion.circle cx="30" cy="23" r="12" fill="none" stroke="oklch(0.78 0.18 150)" strokeWidth="2"
            animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
            style={{ originX: "30px", originY: "23px" }} strokeDasharray="3 4"/>
          <text y="62" fontSize="9" fontFamily="monospace" fill="oklch(0.78 0.18 150)">M-01</text>
        </g>

        {/* Robot arm */}
        <g transform="translate(680,180)">
          <rect x="-10" y="120" width="80" height="20" rx="4" fill="oklch(0.24 0.014 250)" stroke="oklch(0.78 0.17 200)"/>
          <motion.g animate={{ rotate: [-30, 30, -30] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ originX: "30px", originY: "120px" }}>
            <line x1="30" y1="120" x2="30" y2="50" stroke="oklch(0.78 0.17 200)" strokeWidth="6" strokeLinecap="round"/>
            <motion.g animate={{ rotate: [40, -40, 40] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ originX: "30px", originY: "50px" }}>
              <line x1="30" y1="50" x2="80" y2="20" stroke="oklch(0.78 0.17 200)" strokeWidth="5" strokeLinecap="round"/>
              <circle cx="80" cy="20" r="6" fill="oklch(0.86 0.20 90)" className="energized"/>
            </motion.g>
          </motion.g>
          <text x="30" y="158" fontSize="9" fontFamily="monospace" fill="oklch(0.78 0.17 200)" textAnchor="middle">ROBOT-01</text>
        </g>

        {/* Sensor pings */}
        {[300, 460, 580].map((x) => (
          <g key={x} transform={`translate(${x},250)`}>
            <circle r="4" fill="oklch(0.86 0.20 90)" className="energized" />
            <motion.circle r="14" fill="none" stroke="oklch(0.86 0.20 90)" strokeWidth="1.5"
              animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
          </g>
        ))}
      </svg>

      <BottomStrip items={[["Throughput", "1240 pç/h"], ["Vibração", "2.1 mm/s"], ["Temp", "47°C"], ["MTBF", "9 240 h"]]} />
    </div>
  );
}
