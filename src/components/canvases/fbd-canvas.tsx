import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

const BLOCKS = [
  { id: "AI1", label: "AI · Sensor Temp", x: 60, y: 80, kind: "in" },
  { id: "AI2", label: "AI · Pressão", x: 60, y: 200, kind: "in" },
  { id: "PID", label: "PID_CTRL", x: 320, y: 130, kind: "fb" },
  { id: "SCALE", label: "SCALE_X", x: 320, y: 280, kind: "fb" },
  { id: "AO1", label: "AO · Inversor", x: 600, y: 130, kind: "out" },
  { id: "DO1", label: "DO · Válvula", x: 600, y: 280, kind: "out" },
];

export function FbdCanvas() {
  return (
    <div className="relative h-full w-full industrial-grid scan-overlay overflow-hidden">
      <FloatingLegend title="FBD · Function Block" items={["IEC 61131-3", "PID", "SCALE", "Safety"]} />

      <svg viewBox="0 0 800 420" className="absolute inset-0 m-auto w-[94%] h-[86%]">
        {/* connections */}
        {[
          ["AI1", "PID"], ["AI2", "PID"], ["PID", "AO1"],
          ["AI2", "SCALE"], ["SCALE", "DO1"],
        ].map(([from, to], i) => {
          const a = BLOCKS.find((b) => b.id === from)!;
          const b = BLOCKS.find((b) => b.id === to)!;
          return (
            <path
              key={i}
              d={`M ${a.x + 130} ${a.y + 22} C ${(a.x + b.x) / 2 + 60} ${a.y + 22}, ${(a.x + b.x) / 2} ${b.y + 22}, ${b.x} ${b.y + 22}`}
              fill="none"
              stroke="oklch(0.78 0.17 200)"
              strokeWidth="1.5"
              className="flow-line"
            />
          );
        })}

        {BLOCKS.map((b) => (
          <g key={b.id} transform={`translate(${b.x},${b.y})`}>
            <rect
              width="130" height="44" rx="6"
              fill="oklch(0.205 0.014 250)"
              stroke={b.kind === "fb" ? "oklch(0.78 0.17 200)" : b.kind === "in" ? "oklch(0.78 0.18 150)" : "oklch(0.82 0.17 80)"}
              strokeWidth="1.5"
            />
            <text x="65" y="20" textAnchor="middle" fontSize="11" fill="oklch(0.96 0.005 230)" fontFamily="monospace">{b.id}</text>
            <text x="65" y="34" textAnchor="middle" fontSize="9" fill="oklch(0.68 0.02 240)">{b.label}</text>
            <circle cx="0" cy="22" r="3" fill="oklch(0.78 0.17 200)" />
            <circle cx="130" cy="22" r="3" fill="oklch(0.78 0.17 200)" />
          </g>
        ))}
      </svg>

      <BottomStrip items={[["Blocks", "6"], ["Loops", "1"], ["Scan", "8 ms"], ["Quality", "GOOD"]]} />
    </div>
  );
}
