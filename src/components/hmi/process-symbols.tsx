/**
 * Símbolos 2D dos equipamentos de processo — acabamento REALISTA (desenho
 * próprio, sem licença de terceiros): aço escovado em degradê, volume
 * cilíndrico, tampos abaulados, flanges, parafusos, pés/berços, motores
 * pintados com aletas e caixa de ligação. Estado em cor (ISA-101): verde
 * ligado, âmbar reverso, nível com o fluido do processo. Animações por CSS
 * (`hmi-*` em styles.css), desligadas com `prefers-reduced-motion`.
 */
import { memo, useId, type CSSProperties, type ReactNode } from "react";
import { MEDIUM_COLOR, type Medium } from "@/lib/hmi/process-library";

export interface SymbolState {
  running: boolean;
  reverse: boolean;
  speedPct: number;
  open: boolean;
  levelPct: number;
}

export const IDLE_STATE: SymbolState = {
  running: false,
  reverse: false,
  speedPct: 100,
  open: false,
  levelPct: 0,
};

const ON = "#22c55e";
const REV = "#f59e0b";
const OFF = "#64748b";
const EDGE = "#1f2937";

interface Ctx {
  w: number;
  h: number;
  st: SymbolState;
  /** cor de estado (ligado/reverso/parado) */
  accent: string;
  anim: CSSProperties;
  fluid: Medium;
  /** prefixo único por instância (clipPath/gradientes com geometria própria) */
  uid: string;
}

// ── Pintura ────────────────────────────────────────────────────────────

const G = {
  steelV: "url(#hmi-steel-v)",
  steelH: "url(#hmi-steel-h)",
  blueV: "url(#hmi-blue-v)",
  blueH: "url(#hmi-blue-h)",
  grayV: "url(#hmi-gray-v)",
  yellowH: "url(#hmi-yellow-h)",
  concrete: "url(#hmi-concrete)",
  dark: "url(#hmi-dark)",
  glass: "url(#hmi-glass)",
  fire: "url(#hmi-fire)",
  redH: "url(#hmi-red-h)",
} as const;

function stops(colors: readonly string[]) {
  return colors.map((c, i) => (
    <stop key={i} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={c} />
  ));
}

const STEEL = ["#3f4753", "#9aa6b5", "#e8edf3", "#b8c2ce", "#6b7685", "#2f3640"];
const BLUE = ["#13285e", "#2f5fc4", "#7fa6f0", "#3a6ad1", "#1d3f8f", "#0f1f4a"];
const GRAY = ["#2b3038", "#5b6470", "#9aa3ae", "#6a737e", "#3a414b"];
const YELLOW = ["#7a5a00", "#e0a800", "#ffd84d", "#d39b00", "#6b4f00"];
const RED = ["#4a0d0d", "#a32020", "#e05050", "#b02a2a", "#3d0a0a"];

/** Definições compartilhadas (ids fixos: mesmo conteúdo em todas as instâncias). */
function SharedDefs() {
  return (
    <defs>
      <linearGradient id="hmi-steel-v" x1="0" x2="1" y1="0" y2="0">
        {stops(STEEL)}
      </linearGradient>
      <linearGradient id="hmi-steel-h" x1="0" x2="0" y1="0" y2="1">
        {stops(STEEL)}
      </linearGradient>
      <linearGradient id="hmi-blue-v" x1="0" x2="1" y1="0" y2="0">
        {stops(BLUE)}
      </linearGradient>
      <linearGradient id="hmi-blue-h" x1="0" x2="0" y1="0" y2="1">
        {stops(BLUE)}
      </linearGradient>
      <linearGradient id="hmi-gray-v" x1="0" x2="1" y1="0" y2="0">
        {stops(GRAY)}
      </linearGradient>
      <linearGradient id="hmi-yellow-h" x1="0" x2="0" y1="0" y2="1">
        {stops(YELLOW)}
      </linearGradient>
      <linearGradient id="hmi-red-h" x1="0" x2="0" y1="0" y2="1">
        {stops(RED)}
      </linearGradient>
      <linearGradient id="hmi-concrete" x1="0" x2="0" y1="0" y2="1">
        {stops(["#8b8f94", "#6f747a", "#5b6066"])}
      </linearGradient>
      <linearGradient id="hmi-dark" x1="0" x2="0" y1="0" y2="1">
        {stops(["#0b0f15", "#1c232d", "#0b0f15"])}
      </linearGradient>
      <linearGradient id="hmi-glass" x1="0" x2="1" y1="0" y2="0">
        {stops(["#0f172a", "#334155", "#0f172a"])}
      </linearGradient>
      <radialGradient id="hmi-fire" cx="0.5" cy="0.8" r="0.8">
        <stop offset="0%" stopColor="#fff7ae" />
        <stop offset="40%" stopColor="#fbbf24" />
        <stop offset="80%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#7c2d12" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

// ── Utilidades de animação ─────────────────────────────────────────────

function animClass(base: string, st: SymbolState): string {
  if (!st.running) return "";
  return `${base}${st.reverse ? " hmi-rev" : ""}`;
}

/** Período da animação proporcional à velocidade. */
function animStyle(st: SymbolState, baseS: number): CSSProperties {
  const k = Math.max(0.15, (st.speedPct || 0) / 100);
  return { animationDuration: `${(baseS / k).toFixed(2)}s` };
}

// ── Peças ──────────────────────────────────────────────────────────────

function Bolts({
  x,
  y,
  w,
  n = 4,
  r = 1.4,
}: {
  x: number;
  y: number;
  w: number;
  n?: number;
  r?: number;
}) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          cx={x + (w / (n - 1)) * i}
          cy={y}
          r={r}
          fill="#d1d5db"
          stroke={EDGE}
          strokeWidth={0.5}
        />
      ))}
    </>
  );
}

/** Flange de bocal (vertical = tubo sobe/desce). */
function Flange({
  x,
  y,
  vertical = true,
  size = 14,
}: {
  x: number;
  y: number;
  vertical?: boolean;
  size?: number;
}) {
  return vertical ? (
    <>
      <rect
        x={x - size / 2 + 3}
        y={y - 5}
        width={size - 6}
        height={10}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      <rect
        x={x - size / 2}
        y={y - 2}
        width={size}
        height={4}
        rx={1}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={0.8}
      />
    </>
  ) : (
    <>
      <rect
        x={x - 5}
        y={y - size / 2 + 3}
        width={10}
        height={size - 6}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      <rect
        x={x - 2}
        y={y - size / 2}
        width={4}
        height={size}
        rx={1}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={0.8}
      />
    </>
  );
}

/** Lâmpada de estado (sinaleiro) no equipamento. */
function Lamp({ x, y, c }: { x: number; y: number; c: Ctx }) {
  return (
    <>
      <circle cx={x} cy={y} r={4.5} fill="#111827" stroke={EDGE} />
      <circle cx={x} cy={y} r={3} fill={c.st.running ? c.accent : "#374151"} />
      {c.st.running && <circle cx={x - 1} cy={y - 1} r={1} fill="#fff" opacity={0.8} />}
    </>
  );
}

/** Nível do fluido recortado na forma do vaso, com volume. */
function Fluid({
  clip,
  x,
  y,
  w,
  h,
  pct,
  color,
}: {
  clip: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pct: number;
  color: string;
}) {
  const lh = (h * Math.min(100, Math.max(0, pct))) / 100;
  if (lh <= 0) return null;
  return (
    <g clipPath={`url(#${clip})`}>
      <rect x={x} y={y + h - lh} width={w} height={lh} fill={color} opacity={0.85} />
      <rect x={x} y={y + h - lh} width={w} height={lh} fill={G.steelV} opacity={0.28} />
      <rect x={x} y={y + h - lh} width={w} height={2} fill="#fff" opacity={0.35} />
    </g>
  );
}

function PctLabel({ x, y, pct }: { x: number; y: number; pct: number }) {
  return (
    <g>
      <rect x={x - 17} y={y - 9} width={34} height={14} rx={3} fill="#020617" opacity={0.75} />
      <text x={x} y={y + 2} textAnchor="middle" fontSize={10} fill="#e2e8f0" fontFamily="monospace">
        {Math.round(pct)}%
      </text>
    </g>
  );
}

/** Vaso vertical com tampos abaulados, pés, visor de nível e bocais. */
function VerticalVessel({
  c,
  x,
  y,
  w,
  h,
  paint = G.steelV,
  band,
}: {
  c: Ctx;
  x: number;
  y: number;
  w: number;
  h: number;
  paint?: string;
  band?: string;
}) {
  const head = Math.min(18, h * 0.12);
  const legH = Math.min(16, h * 0.1);
  const bodyH = h - legH;
  const clip = `${c.uid}-vv`;
  const shape = `M${x},${y + head} Q${x},${y} ${x + w / 2},${y} Q${x + w},${y} ${x + w},${y + head} V${y + bodyH - head} Q${x + w},${y + bodyH} ${x + w / 2},${y + bodyH} Q${x},${y + bodyH} ${x},${y + bodyH - head} Z`;
  return (
    <>
      {[0.18, 0.82].map((f) => (
        <rect
          key={f}
          x={x + w * f - 4}
          y={y + bodyH - 6}
          width={8}
          height={legH + 6}
          fill={G.grayV}
          stroke={EDGE}
          strokeWidth={0.6}
        />
      ))}
      <rect x={x + w * 0.1} y={y + h - 3} width={w * 0.8} height={3} fill="#111827" opacity={0.6} />
      <clipPath id={clip}>
        <path d={shape} />
      </clipPath>
      <path d={shape} fill={paint} stroke={EDGE} strokeWidth={1.2} />
      <Fluid
        clip={clip}
        x={x}
        y={y}
        w={w}
        h={bodyH}
        pct={c.st.levelPct}
        color={MEDIUM_COLOR[c.fluid]}
      />
      {band && <rect x={x} y={y + head + 6} width={w} height={8} fill={band} opacity={0.9} />}
      <path
        d={`M${x + w * 0.08},${y + head} V${y + bodyH - head}`}
        stroke="#fff"
        strokeOpacity={0.25}
        strokeWidth={2}
      />
      <path d={`M${x},${y + head} H${x + w}`} stroke={EDGE} strokeOpacity={0.5} strokeWidth={0.8} />
      <path
        d={`M${x},${y + bodyH - head} H${x + w}`}
        stroke={EDGE}
        strokeOpacity={0.5}
        strokeWidth={0.8}
      />
      {/* visor de nível */}
      <rect
        x={x + w - 10}
        y={y + head + 4}
        width={5}
        height={bodyH - 2 * head - 8}
        rx={2}
        fill={G.glass}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      {c.st.levelPct > 0 && <PctLabel x={x + w / 2} y={y + bodyH / 2} pct={c.st.levelPct} />}
    </>
  );
}

/** Vaso horizontal com tampos e berços (selas). */
function HorizontalVessel({
  c,
  x,
  y,
  w,
  h,
  paint = G.steelH,
  showLevel = true,
}: {
  c: Ctx;
  x: number;
  y: number;
  w: number;
  h: number;
  paint?: string;
  showLevel?: boolean;
}) {
  const r = Math.min(h / 2, 22);
  const saddleH = Math.min(14, h * 0.18);
  const bodyH = h - saddleH;
  const clip = `${c.uid}-hv`;
  const shape = `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + bodyH / 2} Q${x + w},${y + bodyH} ${x + w - r},${y + bodyH} H${x + r} Q${x},${y + bodyH} ${x},${y + bodyH / 2} Q${x},${y} ${x + r},${y} Z`;
  return (
    <>
      {[0.22, 0.78].map((f) => (
        <path
          key={f}
          d={`M${x + w * f - 12},${y + h} L${x + w * f - 7},${y + bodyH - 6} H${x + w * f + 7} L${x + w * f + 12},${y + h} Z`}
          fill={G.grayV}
          stroke={EDGE}
          strokeWidth={0.6}
        />
      ))}
      <clipPath id={clip}>
        <path d={shape} />
      </clipPath>
      <path d={shape} fill={paint} stroke={EDGE} strokeWidth={1.2} />
      {showLevel && (
        <Fluid
          clip={clip}
          x={x}
          y={y}
          w={w}
          h={bodyH}
          pct={c.st.levelPct}
          color={MEDIUM_COLOR[c.fluid]}
        />
      )}
      <path
        d={`M${x + r},${y + 4} H${x + w - r}`}
        stroke="#fff"
        strokeOpacity={0.3}
        strokeWidth={2}
      />
      <path
        d={`M${x + r},${y} V${y + bodyH} M${x + w - r},${y} V${y + bodyH}`}
        stroke={EDGE}
        strokeOpacity={0.45}
        strokeWidth={0.8}
      />
      {showLevel && c.st.levelPct > 0 && (
        <PctLabel x={x + w / 2} y={y + bodyH / 2} pct={c.st.levelPct} />
      )}
    </>
  );
}

/** Motor elétrico TFVE pintado (carcaça aletada, tampa do ventilador, caixa de ligação, pés). */
function Motor({
  c,
  x,
  y,
  w,
  h,
  dir = "right",
}: {
  c: Ctx;
  x: number;
  y: number;
  w: number;
  h: number;
  dir?: "left" | "right";
}) {
  const fanW = w * 0.18;
  const bodyX = dir === "right" ? x + fanW : x + w * 0.12;
  const bodyW = w * 0.7;
  const shaftX = dir === "right" ? bodyX + bodyW : x;
  const fanX = dir === "right" ? x : bodyX + bodyW;
  const cy = y + h * 0.45;
  const bh = h * 0.7;
  return (
    <g>
      <rect
        x={bodyX + 4}
        y={y + h * 0.82}
        width={bodyW - 8}
        height={h * 0.18}
        fill={G.grayV}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <rect
        x={fanX}
        y={cy - bh * 0.42}
        width={fanW}
        height={bh * 0.84}
        rx={fanW * 0.4}
        fill={G.blueH}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      {Array.from({ length: 4 }, (_, i) => (
        <path
          key={i}
          d={`M${fanX + 3},${cy - bh * 0.25 + i * bh * 0.17} H${fanX + fanW - 3}`}
          stroke="#0b1430"
          strokeWidth={1}
        />
      ))}
      <rect
        x={bodyX}
        y={cy - bh / 2}
        width={bodyW}
        height={bh}
        rx={4}
        fill={G.blueH}
        stroke={EDGE}
        strokeWidth={1}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M${bodyX + 3},${cy - bh * 0.38 + i * bh * 0.15} H${bodyX + bodyW - 3}`}
          stroke="#0b1430"
          strokeOpacity={0.55}
          strokeWidth={1.2}
        />
      ))}
      <rect
        x={bodyX + bodyW * 0.35}
        y={cy - bh / 2 - h * 0.14}
        width={bodyW * 0.3}
        height={h * 0.16}
        rx={2}
        fill={G.blueH}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      <rect
        x={shaftX + (dir === "right" ? 0 : w * 0.02)}
        y={cy - 3}
        width={w * 0.1}
        height={6}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <g className={animClass("hmi-spin", c.st)} style={c.anim}>
        <circle
          cx={shaftX + (dir === "right" ? w * 0.1 : w * 0.07)}
          cy={cy}
          r={5}
          fill={G.steelV}
          stroke={EDGE}
          strokeWidth={0.6}
        />
        <path
          d={`M${shaftX + (dir === "right" ? w * 0.1 : w * 0.07)},${cy - 5} v3`}
          stroke={c.accent}
          strokeWidth={1.5}
        />
      </g>
      <Lamp x={bodyX + bodyW * 0.5} y={cy - bh / 2 - h * 0.06} c={c} />
    </g>
  );
}

/** Rotor de pás (impelidor/hélice) que gira. */
function Rotor({
  c,
  cx,
  cy,
  r,
  blades = 6,
}: {
  c: Ctx;
  cx: number;
  cy: number;
  r: number;
  blades?: number;
}) {
  return (
    <g className={animClass("hmi-spin", c.st)} style={c.anim}>
      {Array.from({ length: blades }, (_, i) => (
        <path
          key={i}
          d={`M${cx},${cy} Q${cx + r * 0.55},${cy - r * 0.45} ${cx + r},${cy - r * 0.12} L${cx + r * 0.9},${cy + r * 0.12} Q${cx + r * 0.45},${cy - r * 0.05} ${cx},${cy}`}
          transform={`rotate(${(360 / blades) * i} ${cx} ${cy})`}
          fill={G.steelV}
          stroke={EDGE}
          strokeWidth={0.5}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.2} fill={G.steelV} stroke={EDGE} strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={r * 0.07} fill={c.accent} />
    </g>
  );
}

/** Hélice de rosca vista por uma janela de inspeção. */
function Helix({ c, x, y, w, h }: { c: Ctx; x: number; y: number; w: number; h: number }) {
  const turns = Math.max(4, Math.round(w / 16));
  let d = `M${x},${y + h / 2}`;
  for (let i = 0; i < turns; i++) {
    const x0 = x + (w / turns) * i;
    const x1 = x + (w / turns) * (i + 0.5);
    const x2 = x + (w / turns) * (i + 1);
    d += ` Q${(x0 + x1) / 2},${y - 1} ${x1},${y + h / 2} Q${(x1 + x2) / 2},${y + h + 1} ${x2},${y + h / 2}`;
  }
  return (
    <>
      <rect x={x} y={y + h / 2 - 2} width={w} height={4} fill={G.steelH} />
      <path
        d={d}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={3}
        className={animClass("hmi-flow", c.st)}
        style={c.anim}
      />
      <path
        d={d}
        fill="none"
        stroke={EDGE}
        strokeWidth={0.8}
        strokeOpacity={0.6}
        className={animClass("hmi-flow", c.st)}
        style={c.anim}
      />
    </>
  );
}

function Window({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={3} fill={G.dark} stroke="#0b0f15" strokeWidth={1} />
  );
}

/** Bomba centrífuga (voluta) sobre base, sem o motor. */
function Volute({ c, cx, cy, r }: { c: Ctx; cx: number; cy: number; r: number }) {
  const d = `M${cx},${cy - r * 1.05} H${cx + r * 0.25} V${cy - r * 0.6} A${r},${r} 0 1 1 ${cx},${cy - r} Z`;
  return (
    <>
      <path
        d={`M${cx - r * 0.95},${cy} A${r * 0.98},${r * 0.98} 0 1 0 ${cx + r * 0.25},${cy - r * 0.95} L${cx + r * 0.25},${cy - r * 1.3} H${cx - r * 0.25} V${cy - r * 0.9}`}
        fill={G.blueV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <path d={d} fill="none" stroke="none" />
      <Flange x={cx} y={cy - r * 1.3} vertical />
      <circle cx={cx} cy={cy} r={r * 0.55} fill={G.dark} stroke={EDGE} />
      <Rotor c={c} cx={cx} cy={cy} r={r * 0.5} blades={5} />
      <Bolts x={cx - r * 0.7} y={cy + r * 0.82} w={r * 1.4} n={4} />
    </>
  );
}

// ── Desenhos por tipo ─────────────────────────────────────────────────

const DRAW: Record<string, (c: Ctx) => ReactNode> = {
  // Transporte de sólidos
  rosca: (c) => {
    const ty = c.h * 0.28;
    const th = c.h * 0.48;
    return (
      <>
        {[0.15, 0.6].map((f) => (
          <rect
            key={f}
            x={c.w * f}
            y={ty + th}
            width={6}
            height={c.h - ty - th}
            fill={G.grayV}
            stroke={EDGE}
            strokeWidth={0.5}
          />
        ))}
        <rect
          x={c.w * 0.07}
          y={2}
          width={24}
          height={ty}
          fill={G.steelV}
          stroke={EDGE}
          strokeWidth={0.8}
        />
        <rect
          x={4}
          y={ty}
          width={c.w * 0.78}
          height={th}
          rx={th / 2}
          fill={G.steelH}
          stroke={EDGE}
          strokeWidth={1.2}
        />
        <Window x={c.w * 0.14} y={ty + th * 0.22} w={c.w * 0.58} h={th * 0.56} />
        <Helix c={c} x={c.w * 0.15} y={ty + th * 0.26} w={c.w * 0.56} h={th * 0.48} />
        <rect
          x={c.w * 0.86}
          y={ty + th}
          width={c.w * 0.08}
          height={c.h - ty - th - 2}
          fill={G.steelV}
          stroke={EDGE}
          strokeWidth={0.8}
        />
        <Motor c={c} x={c.w * 0.8} y={ty - 4} w={c.w * 0.2} h={th + 8} dir="left" />
      </>
    );
  },
  esteira: (c) => {
    const y = c.h * 0.25;
    return (
      <>
        {[0.15, 0.5, 0.85].map((f) => (
          <path
            key={f}
            d={`M${c.w * f - 6},${c.h} L${c.w * f - 2},${y + 14} H${c.w * f + 2} L${c.w * f + 6},${c.h}`}
            fill={G.yellowH}
            stroke={EDGE}
            strokeWidth={0.5}
          />
        ))}
        <rect
          x={14}
          y={y + 8}
          width={c.w - 28}
          height={8}
          fill={G.yellowH}
          stroke={EDGE}
          strokeWidth={0.8}
        />
        <rect x={12} y={y - 2} width={c.w - 24} height={8} rx={4} fill="#111827" />
        <path
          d={`M14,${y + 2} H${c.w - 14}`}
          stroke="#4b5563"
          strokeWidth={2}
          strokeDasharray="8 6"
          className={animClass("hmi-flow", c.st)}
          style={c.anim}
        />
        {[16, c.w - 16].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={y + 2} r={9} fill={G.steelV} stroke={EDGE} />
            <g className={animClass("hmi-spin", c.st)} style={c.anim}>
              <path d={`M${cx - 6},${y + 2} H${cx + 6}`} stroke={EDGE} strokeWidth={1.5} />
            </g>
          </g>
        ))}
        <Lamp x={c.w / 2} y={y + 12} c={c} />
      </>
    );
  },
  redler: (c) => (
    <>
      <rect
        x={4}
        y={c.h * 0.2}
        width={c.w - 8}
        height={c.h * 0.55}
        rx={3}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <Window x={c.w * 0.12} y={c.h * 0.32} w={c.w * 0.7} h={c.h * 0.3} />
      <path
        d={`M${c.w * 0.13},${c.h * 0.47} H${c.w * 0.81}`}
        stroke="#cbd5e1"
        strokeWidth={5}
        strokeDasharray="3 6"
        className={animClass("hmi-flow", c.st)}
        style={c.anim}
      />
      <Bolts x={10} y={c.h * 0.24} w={c.w - 20} n={10} r={1} />
      {[0.1, 0.9].map((f) => (
        <rect key={f} x={c.w * f - 3} y={c.h * 0.75} width={6} height={c.h * 0.25} fill={G.grayV} />
      ))}
      <Lamp x={c.w - 14} y={c.h * 0.12} c={c} />
    </>
  ),
  elevador_canecas: (c) => (
    <>
      <rect
        x={c.w * 0.2}
        y={c.h * 0.12}
        width={c.w * 0.6}
        height={c.h * 0.8}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <path
        d={`M${c.w * 0.15},${c.h * 0.12} Q${c.w / 2},${-2} ${c.w * 0.85},${c.h * 0.12} Z`}
        fill={G.steelV}
        stroke={EDGE}
      />
      <rect
        x={c.w * 0.12}
        y={c.h * 0.86}
        width={c.w * 0.76}
        height={c.h * 0.12}
        fill={G.steelV}
        stroke={EDGE}
      />
      <Window x={c.w * 0.3} y={c.h * 0.18} w={c.w * 0.4} h={c.h * 0.64} />
      <path
        d={`M${c.w / 2},${c.h * 0.2} V${c.h * 0.8}`}
        stroke="#cbd5e1"
        strokeWidth={8}
        strokeDasharray="6 9"
        className={animClass("hmi-flow", c.st)}
        style={c.anim}
      />
      <Motor c={c} x={c.w * 0.55} y={c.h * 0.02} w={c.w * 0.45} h={c.h * 0.1} />
    </>
  ),
  moega: (c) => {
    const clip = `${c.uid}-mg`;
    const d = `M6,10 H${c.w - 6} L${c.w / 2 + 14},${c.h - 18} H${c.w / 2 - 14} Z`;
    return (
      <>
        {[0.12, 0.88].map((f) => (
          <rect
            key={f}
            x={c.w * f - 3}
            y={14}
            width={6}
            height={c.h - 14}
            fill={G.grayV}
            stroke={EDGE}
            strokeWidth={0.5}
          />
        ))}
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
        <path d={d} fill={G.steelV} stroke={EDGE} strokeWidth={1.2} />
        <Fluid
          clip={clip}
          x={0}
          y={10}
          w={c.w}
          h={c.h - 28}
          pct={c.st.levelPct}
          color={MEDIUM_COLOR.graos}
        />
        <rect x={2} y={4} width={c.w - 4} height={8} fill={G.steelH} stroke={EDGE} />
        <rect x={c.w / 2 - 14} y={c.h - 20} width={28} height={12} fill={G.steelV} stroke={EDGE} />
        {c.st.levelPct > 0 && <PctLabel x={c.w / 2} y={c.h * 0.42} pct={c.st.levelPct} />}
      </>
    );
  },
  dosador: (c) => (
    <>
      <path
        d={`M14,4 H${c.w - 14} L${c.w / 2 + 12},${c.h * 0.45} H${c.w / 2 - 12} Z`}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1}
      />
      <rect
        x={6}
        y={c.h * 0.5}
        width={c.w - 12}
        height={c.h * 0.22}
        rx={c.h * 0.11}
        fill="#111827"
        stroke={EDGE}
      />
      <path
        d={`M14,${c.h * 0.61} H${c.w - 14}`}
        stroke="#4b5563"
        strokeWidth={2}
        strokeDasharray="6 5"
        className={animClass("hmi-flow", c.st)}
        style={c.anim}
      />
      <rect
        x={c.w / 2 - 10}
        y={c.h * 0.76}
        width={20}
        height={c.h * 0.2}
        fill={G.steelV}
        stroke={EDGE}
      />
      <text
        x={c.w / 2}
        y={c.h * 0.92}
        textAnchor="middle"
        fontSize={7}
        fill="#111827"
        fontWeight="bold"
      >
        kg
      </text>
    </>
  ),
  valvula_rotativa: (c) => (
    <>
      <rect
        x={14}
        y={12}
        width={c.w - 28}
        height={c.h - 24}
        rx={4}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <Flange x={c.w / 2} y={10} vertical size={c.w - 30} />
      <Flange x={c.w / 2} y={c.h - 10} vertical size={c.w - 30} />
      <circle cx={c.w / 2} cy={c.h / 2} r={c.w * 0.26} fill={G.dark} />
      <Rotor c={c} cx={c.w / 2} cy={c.h / 2} r={c.w * 0.24} blades={8} />
      <rect x={2} y={c.h / 2 - 7} width={12} height={14} fill={G.blueH} stroke={EDGE} />
    </>
  ),
  // Bombas e ventilação
  bomba: (c) => (
    <>
      <rect
        x={4}
        y={c.h - 8}
        width={c.w - 8}
        height={6}
        fill={G.grayV}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <Volute c={c} cx={c.w * 0.42} cy={c.h * 0.6} r={c.w * 0.28} />
      <Flange x={4} y={c.h * 0.65} vertical={false} />
      <Lamp x={c.w - 12} y={c.h * 0.25} c={c} />
    </>
  ),
  bomba_engrenagem: (c) => (
    <>
      <rect
        x={6}
        y={c.h * 0.18}
        width={c.w - 12}
        height={c.h * 0.6}
        rx={8}
        fill={G.redH}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <circle cx={c.w / 2 - 12} cy={c.h * 0.48} r={13} fill={G.dark} />
      <circle cx={c.w / 2 + 12} cy={c.h * 0.48} r={13} fill={G.dark} />
      <Rotor c={c} cx={c.w / 2 - 12} cy={c.h * 0.48} r={12} blades={10} />
      <Rotor
        c={{ ...c, st: { ...c.st, reverse: !c.st.reverse } }}
        cx={c.w / 2 + 12}
        cy={c.h * 0.48}
        r={12}
        blades={10}
      />
      <Flange x={4} y={c.h * 0.48} vertical={false} />
      <Flange x={c.w - 4} y={c.h * 0.48} vertical={false} />
      <rect x={10} y={c.h * 0.8} width={c.w - 20} height={c.h * 0.16} fill={G.grayV} />
    </>
  ),
  bomba_dosadora: (c) => (
    <>
      <rect
        x={c.w * 0.35}
        y={8}
        width={c.w * 0.3}
        height={c.h * 0.55}
        rx={3}
        fill={G.blueV}
        stroke={EDGE}
      />
      <circle
        cx={c.w / 2}
        cy={c.h * 0.65}
        r={c.w * 0.2}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <circle
        cx={c.w / 2}
        cy={c.h * 0.65}
        r={c.w * 0.12}
        fill={G.dark}
        className={animClass("hmi-shake", c.st)}
        style={c.anim}
      />
      <Flange x={6} y={c.h * 0.65} vertical={false} size={10} />
      <Flange x={c.w - 6} y={c.h * 0.65} vertical={false} size={10} />
      <Lamp x={c.w / 2} y={18} c={c} />
    </>
  ),
  exaustor: (c) => {
    const cx = c.w * 0.46;
    const cy = c.h * 0.56;
    const r = c.w * 0.36;
    return (
      <>
        <rect
          x={cx + r * 0.2}
          y={2}
          width={r * 0.8}
          height={cy - r * 0.5}
          fill={G.steelV}
          stroke={EDGE}
        />
        <path
          d={`M${cx + r},${cy} A${r},${r} 0 1 1 ${cx + r * 0.2},${cy - r * 0.95} H${cx + r} Z`}
          fill={G.steelV}
          stroke={EDGE}
          strokeWidth={1.2}
        />
        <circle cx={cx} cy={cy} r={r * 0.72} fill={G.dark} stroke={EDGE} />
        <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#9ca3af" strokeWidth={3} />
        <Rotor c={c} cx={cx} cy={cy} r={r * 0.65} blades={8} />
        <rect x={6} y={c.h - 8} width={c.w - 12} height={6} fill={G.grayV} />
        <Lamp x={c.w - 10} y={c.h - 18} c={c} />
      </>
    );
  },
  ventilador: (c) => (
    <>
      <circle
        cx={c.w / 2}
        cy={c.h / 2}
        r={c.w * 0.44}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <circle cx={c.w / 2} cy={c.h / 2} r={c.w * 0.38} fill={G.dark} />
      <Rotor c={c} cx={c.w / 2} cy={c.h / 2} r={c.w * 0.36} blades={5} />
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d={`M${c.w / 2},${c.h / 2} L${c.w / 2 + c.w * 0.38},${c.h / 2}`}
          transform={`rotate(${i * 45} ${c.w / 2} ${c.h / 2})`}
          stroke="#6b7280"
          strokeWidth={0.8}
        />
      ))}
      <Lamp x={c.w - 10} y={10} c={c} />
    </>
  ),
  soprador: (c) => (
    <>
      <rect
        x={c.w * 0.15}
        y={c.h * 0.15}
        width={c.w * 0.55}
        height={c.h * 0.65}
        rx={10}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <ellipse cx={c.w * 0.42} cy={c.h * 0.47} rx={c.w * 0.18} ry={c.h * 0.22} fill={G.dark} />
      <Rotor c={c} cx={c.w * 0.42} cy={c.h * 0.47} r={c.h * 0.2} blades={3} />
      <Motor c={c} x={c.w * 0.68} y={c.h * 0.25} w={c.w * 0.32} h={c.h * 0.5} dir="left" />
      <rect x={4} y={c.h - 10} width={c.w - 8} height={6} fill={G.grayV} />
    </>
  ),
  compressor: (c) => (
    <>
      <HorizontalVessel
        c={{ ...c, st: { ...c.st, levelPct: 0 } }}
        x={6}
        y={c.h * 0.45}
        w={c.w - 12}
        h={c.h * 0.55}
        showLevel={false}
      />
      <rect
        x={c.w * 0.18}
        y={c.h * 0.08}
        width={c.w * 0.28}
        height={c.h * 0.36}
        rx={3}
        fill={G.redH}
        stroke={EDGE}
      />
      {Array.from({ length: 4 }, (_, i) => (
        <path
          key={i}
          d={`M${c.w * 0.18},${c.h * (0.14 + i * 0.07)} H${c.w * 0.46}`}
          stroke="#3d0a0a"
        />
      ))}
      <Motor c={c} x={c.w * 0.52} y={c.h * 0.1} w={c.w * 0.42} h={c.h * 0.34} />
    </>
  ),
  // Tanques e silos
  tanque: (c) => <VerticalVessel c={c} x={8} y={4} w={c.w - 16} h={c.h - 6} />,
  tanque_oleo: (c) => (
    <VerticalVessel
      c={{ ...c, fluid: "oleo" }}
      x={8}
      y={4}
      w={c.w - 16}
      h={c.h - 6}
      band={MEDIUM_COLOR.oleo}
    />
  ),
  tanque_horizontal: (c) => <HorizontalVessel c={c} x={4} y={6} w={c.w - 8} h={c.h - 8} />,
  tanque_condensado: (c) => (
    <HorizontalVessel c={{ ...c, fluid: "condensado" }} x={4} y={6} w={c.w - 8} h={c.h - 8} />
  ),
  reservatorio: (c) => {
    const clip = `${c.uid}-rs`;
    return (
      <>
        <clipPath id={clip}>
          <rect x={10} y={10} width={c.w - 20} height={c.h - 18} />
        </clipPath>
        <path
          d={`M2,6 H10 V${c.h - 8} H${c.w - 10} V6 H${c.w - 2} V${c.h} H2 Z`}
          fill={G.concrete}
          stroke={EDGE}
          strokeWidth={1.2}
        />
        <rect x={10} y={10} width={c.w - 20} height={c.h - 18} fill="#0f172a" />
        <Fluid
          clip={clip}
          x={10}
          y={10}
          w={c.w - 20}
          h={c.h - 18}
          pct={c.st.levelPct}
          color={MEDIUM_COLOR.agua}
        />
        {c.st.levelPct > 0 && <PctLabel x={c.w / 2} y={c.h / 2} pct={c.st.levelPct} />}
      </>
    );
  },
  silo: (c) => {
    const clip = `${c.uid}-si`;
    const top = c.h * 0.12;
    const cone = c.h * 0.7;
    const d = `M8,${top} H${c.w - 8} V${cone} L${c.w / 2 + 10},${c.h - 18} H${c.w / 2 - 10} L8,${cone} Z`;
    return (
      <>
        {[0.15, 0.85].map((f) => (
          <rect
            key={f}
            x={c.w * f - 3}
            y={cone - 6}
            width={6}
            height={c.h - cone + 6}
            fill={G.grayV}
          />
        ))}
        <path d={`M4,${top} L${c.w / 2},2 L${c.w - 4},${top} Z`} fill={G.steelV} stroke={EDGE} />
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
        <path d={d} fill={G.steelV} stroke={EDGE} strokeWidth={1.2} />
        <Fluid
          clip={clip}
          x={0}
          y={top}
          w={c.w}
          h={c.h - top - 18}
          pct={c.st.levelPct}
          color={MEDIUM_COLOR.graos}
        />
        {Array.from({ length: 6 }, (_, i) => (
          <path
            key={i}
            d={`M8,${top + ((cone - top) / 6) * (i + 1)} H${c.w - 8}`}
            stroke={EDGE}
            strokeOpacity={0.35}
          />
        ))}
        <path
          d={`M${c.w - 14},${top} V${cone}`}
          stroke="#9ca3af"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        {c.st.levelPct > 0 && <PctLabel x={c.w / 2} y={c.h * 0.45} pct={c.st.levelPct} />}
      </>
    );
  },
  // Tubulações e válvulas
  valvula_manual: (c) => <GateValve c={c} yc={c.h * 0.7} />,
  valvula_motorizada: (c) => (
    <>
      <GateValve c={c} yc={c.h * 0.75} wheel={false} />
      <rect
        x={c.w / 2 - 13}
        y={2}
        width={26}
        height={c.h * 0.36}
        rx={3}
        fill={G.blueV}
        stroke={EDGE}
      />
      <rect x={c.w / 2 - 9} y={6} width={18} height={6} rx={1} fill="#0f172a" />
      <text
        x={c.w / 2}
        y={11}
        textAnchor="middle"
        fontSize={5}
        fill={c.st.open ? ON : "#94a3b8"}
        fontFamily="monospace"
      >
        {c.st.open ? "ABERTA" : "FECHADA"}
      </text>
    </>
  ),
  valvula_controle: (c) => (
    <>
      <GateValve c={c} yc={c.h * 0.75} wheel={false} />
      <path
        d={`M${c.w / 2 - 16},${c.h * 0.32} A16,14 0 0 1 ${c.w / 2 + 16},${c.h * 0.32} Z`}
        fill={G.steelV}
        stroke={EDGE}
      />
      <rect x={c.w / 2 - 17} y={c.h * 0.32} width={34} height={4} fill={G.steelH} stroke={EDGE} />
      {c.st.open && (
        <text
          x={c.w / 2}
          y={c.h * 0.26}
          textAnchor="middle"
          fontSize={8}
          fill={ON}
          fontFamily="monospace"
        >
          {c.st.speedPct}%
        </text>
      )}
    </>
  ),
  valvula_retencao: (c) => (
    <>
      <rect x={2} y={c.h / 2 - 6} width={c.w - 4} height={12} fill={G.steelH} />
      <ellipse
        cx={c.w / 2}
        cy={c.h / 2}
        rx={c.w * 0.3}
        ry={c.h * 0.4}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <path
        d={`M${c.w / 2 - 8},${c.h / 2 - 8} L${c.w / 2 + 8},${c.h / 2} L${c.w / 2 - 8},${c.h / 2 + 8}`}
        fill="none"
        stroke={EDGE}
        strokeWidth={2}
      />
      <Flange x={4} y={c.h / 2} vertical={false} size={18} />
      <Flange x={c.w - 4} y={c.h / 2} vertical={false} size={18} />
    </>
  ),
  filtro_linha: (c) => (
    <>
      <rect x={2} y={c.h * 0.4 - 6} width={c.w - 4} height={12} fill={G.steelH} />
      <path
        d={`M${c.w / 2 - 8},${c.h * 0.4} L${c.w / 2 + 12},${c.h - 6}`}
        stroke={G.steelV}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <path
        d={`M${c.w / 2 - 8},${c.h * 0.4} L${c.w / 2 + 12},${c.h - 6}`}
        stroke={EDGE}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <Flange x={4} y={c.h * 0.4} vertical={false} size={18} />
      <Flange x={c.w - 4} y={c.h * 0.4} vertical={false} size={18} />
    </>
  ),
  juncao: (c) => (
    <>
      <rect x={2} y={c.h / 2 - 5} width={c.w - 4} height={10} fill={G.steelH} />
      <rect x={c.w / 2 - 5} y={2} width={10} height={c.h - 4} fill={G.steelV} />
      <circle cx={c.w / 2} cy={c.h / 2} r={6} fill={G.steelV} stroke={EDGE} />
    </>
  ),
  // Térmico e vapor
  caldeira: (c) => (
    <>
      <rect x={4} y={c.h - 10} width={c.w - 8} height={8} fill={G.grayV} />
      <rect x={c.w * 0.7} y={2} width={18} height={c.h * 0.3} fill={G.steelV} stroke={EDGE} />
      <rect x={c.w * 0.7 - 3} y={2} width={24} height={5} fill={G.steelV} stroke={EDGE} />
      <HorizontalVessel
        c={{ ...c, st: { ...c.st, levelPct: 0 } }}
        x={c.w * 0.16}
        y={c.h * 0.26}
        w={c.w * 0.82}
        h={c.h * 0.66}
        paint={G.redH}
        showLevel={false}
      />
      <rect
        x={4}
        y={c.h * 0.36}
        width={c.w * 0.18}
        height={c.h * 0.42}
        rx={3}
        fill={G.steelV}
        stroke={EDGE}
      />
      <circle cx={c.w * 0.13} cy={c.h * 0.57} r={c.h * 0.13} fill={G.dark} stroke={EDGE} />
      {c.st.running && (
        <ellipse
          cx={c.w * 0.13}
          cy={c.h * 0.57}
          rx={c.h * 0.1}
          ry={c.h * 0.11}
          fill={G.fire}
          className="hmi-flame"
        />
      )}
      <circle cx={c.w * 0.55} cy={c.h * 0.42} r={7} fill="#f8fafc" stroke={EDGE} />
      <path d={`M${c.w * 0.55},${c.h * 0.42} l4,-3`} stroke="#b91c1c" strokeWidth={1.5} />
      <Lamp x={c.w * 0.92} y={c.h * 0.32} c={c} />
    </>
  ),
  trocador_calor: (c) => (
    <>
      <HorizontalVessel
        c={{ ...c, st: { ...c.st, levelPct: 0 } }}
        x={c.w * 0.1}
        y={c.h * 0.12}
        w={c.w * 0.8}
        h={c.h * 0.86}
        showLevel={false}
      />
      <rect
        x={4}
        y={c.h * 0.16}
        width={c.w * 0.1}
        height={c.h * 0.6}
        rx={4}
        fill={G.steelV}
        stroke={EDGE}
      />
      <rect
        x={c.w * 0.86}
        y={c.h * 0.16}
        width={c.w * 0.1}
        height={c.h * 0.6}
        rx={4}
        fill={G.steelV}
        stroke={EDGE}
      />
      <Bolts x={c.w * 0.1} y={c.h * 0.2} w={0.1} n={2} />
    </>
  ),
  purgador: (c) => (
    <>
      <rect x={2} y={c.h / 2 - 5} width={c.w - 4} height={10} fill={G.steelH} />
      <rect
        x={c.w * 0.25}
        y={c.h * 0.2}
        width={c.w * 0.5}
        height={c.h * 0.6}
        rx={6}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <Bolts x={c.w * 0.3} y={c.h * 0.26} w={c.w * 0.4} n={3} r={1} />
    </>
  ),
  condensador: (c) => DRAW.trocador_calor(c),
  torre_resfriamento: (c) => (
    <>
      <path
        d={`M12,${c.h * 0.22} H${c.w - 12} L${c.w - 4},${c.h - 6} H4 Z`}
        fill={G.grayV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M10,${c.h * (0.5 + i * 0.07)} H${c.w - 10}`}
          stroke="#1f2937"
          strokeWidth={2}
        />
      ))}
      <path
        d={`M${c.w * 0.2},${c.h * 0.22} V${c.h * 0.08} H${c.w * 0.8} V${c.h * 0.22}`}
        fill={G.steelV}
        stroke={EDGE}
      />
      <ellipse cx={c.w / 2} cy={c.h * 0.08} rx={c.w * 0.3} ry={6} fill={G.dark} />
      <Rotor c={c} cx={c.w / 2} cy={c.h * 0.08} r={c.w * 0.26} blades={4} />
    </>
  ),
  secador: (c) => (
    <>
      <rect x={6} y={c.h - 10} width={c.w - 12} height={8} fill={G.grayV} />
      <rect
        x={10}
        y={c.h * 0.18}
        width={c.w - 20}
        height={c.h * 0.55}
        rx={c.h * 0.27}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      {Array.from({ length: 10 }, (_, i) => (
        <path
          key={i}
          d={`M${24 + i * ((c.w - 48) / 9)},${c.h * 0.2} V${c.h * 0.71}`}
          stroke={EDGE}
          strokeOpacity={0.4}
          strokeDasharray="4 4"
          className={animClass("hmi-flow", c.st)}
          style={c.anim}
        />
      ))}
      {[0.25, 0.75].map((f) => (
        <g key={f}>
          <rect
            x={c.w * f - 8}
            y={c.h * 0.16}
            width={16}
            height={c.h * 0.6}
            fill={G.steelV}
            stroke={EDGE}
          />
          <circle cx={c.w * f} cy={c.h * 0.8} r={6} fill={G.steelV} stroke={EDGE} />
        </g>
      ))}
      <Lamp x={c.w / 2} y={c.h * 0.12} c={c} />
    </>
  ),
  cozinhador: (c) => (
    <>
      <HorizontalVessel
        c={{ ...c, st: { ...c.st, levelPct: 0 } }}
        x={6}
        y={c.h * 0.14}
        w={c.w * 0.8}
        h={c.h * 0.84}
        showLevel={false}
      />
      <Window x={c.w * 0.14} y={c.h * 0.3} w={c.w * 0.6} h={c.h * 0.3} />
      <Helix c={c} x={c.w * 0.15} y={c.h * 0.33} w={c.w * 0.58} h={c.h * 0.24} />
      <Motor c={c} x={c.w * 0.8} y={c.h * 0.22} w={c.w * 0.2} h={c.h * 0.4} dir="left" />
    </>
  ),
  prensa: (c) => (
    <>
      <rect x={6} y={c.h - 10} width={c.w - 12} height={8} fill={G.grayV} />
      <path
        d={`M${c.w * 0.18},${c.h * 0.2} H${c.w * 0.82} L${c.w - 4},${c.h * 0.4} V${c.h * 0.6} L${c.w * 0.82},${c.h * 0.78} H${c.w * 0.18} Z`}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      {Array.from({ length: 14 }, (_, i) => (
        <path
          key={i}
          d={`M${c.w * 0.22 + i * (c.w * 0.04)},${c.h * 0.22} V${c.h * 0.76}`}
          stroke={EDGE}
          strokeWidth={1.4}
          strokeOpacity={0.7}
        />
      ))}
      <Helix c={c} x={c.w * 0.22} y={c.h * 0.36} w={c.w * 0.58} h={c.h * 0.26} />
      <Motor c={c} x={2} y={c.h * 0.2} w={c.w * 0.18} h={c.h * 0.58} />
      <rect
        x={c.w * 0.3}
        y={c.h * 0.78}
        width={c.w * 0.3}
        height={c.h * 0.1}
        fill={G.steelH}
        stroke={EDGE}
      />
    </>
  ),
  decanter: (c) => (
    <>
      <rect x={6} y={c.h - 10} width={c.w - 12} height={8} fill={G.grayV} />
      <path
        d={`M${c.w * 0.18},${c.h * 0.18} H${c.w * 0.7} L${c.w - 6},${c.h * 0.36} V${c.h * 0.64} L${c.w * 0.7},${c.h * 0.82} H${c.w * 0.18} Z`}
        fill={G.steelH}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <Window x={c.w * 0.24} y={c.h * 0.36} w={c.w * 0.5} h={c.h * 0.28} />
      <Helix c={c} x={c.w * 0.25} y={c.h * 0.38} w={c.w * 0.48} h={c.h * 0.24} />
      <Motor c={c} x={2} y={c.h * 0.25} w={c.w * 0.17} h={c.h * 0.5} />
    </>
  ),
  separador: (c) => (
    <>
      <rect
        x={c.w * 0.15}
        y={c.h * 0.55}
        width={c.w * 0.7}
        height={c.h * 0.4}
        rx={4}
        fill={G.grayV}
        stroke={EDGE}
      />
      <path
        d={`M${c.w * 0.18},${c.h * 0.12} H${c.w * 0.82} L${c.w * 0.68},${c.h * 0.55} H${c.w * 0.32} Z`}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <ellipse cx={c.w / 2} cy={c.h * 0.12} rx={c.w * 0.32} ry={6} fill={G.steelH} stroke={EDGE} />
      <Rotor c={c} cx={c.w / 2} cy={c.h * 0.34} r={c.w * 0.18} blades={6} />
      <Lamp x={c.w / 2} y={c.h * 0.75} c={c} />
    </>
  ),
  moinho: (c) => (
    <>
      <rect
        x={c.w * 0.1}
        y={c.h * 0.12}
        width={c.w * 0.6}
        height={c.h * 0.7}
        rx={8}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <circle cx={c.w * 0.4} cy={c.h * 0.47} r={c.h * 0.26} fill={G.dark} />
      <Rotor c={c} cx={c.w * 0.4} cy={c.h * 0.47} r={c.h * 0.24} blades={4} />
      <rect
        x={c.w * 0.3}
        y={2}
        width={c.w * 0.2}
        height={c.h * 0.12}
        fill={G.steelV}
        stroke={EDGE}
      />
      <Motor c={c} x={c.w * 0.62} y={c.h * 0.3} w={c.w * 0.38} h={c.h * 0.36} dir="left" />
      <rect x={6} y={c.h - 10} width={c.w - 12} height={8} fill={G.grayV} />
    </>
  ),
  peneira: (c) => (
    <>
      {[0.2, 0.8].map((f) => (
        <path
          key={f}
          d={`M${c.w * f - 5},${c.h} v-6 l5,-4 l-5,-4 l5,-4 v-4`}
          stroke="#9ca3af"
          fill="none"
          strokeWidth={1.5}
        />
      ))}
      <g className={animClass("hmi-shake", c.st)} style={c.anim}>
        <path
          d={`M6,${c.h * 0.18} L${c.w - 6},${c.h * 0.5} V${c.h * 0.72} L6,${c.h * 0.4} Z`}
          fill={G.steelH}
          stroke={EDGE}
          strokeWidth={1.2}
        />
        <path
          d={`M10,${c.h * 0.3} L${c.w - 10},${c.h * 0.6}`}
          stroke="#0f172a"
          strokeWidth={2}
          strokeDasharray="2 2"
        />
      </g>
      <Lamp x={c.w - 14} y={c.h * 0.2} c={c} />
    </>
  ),
  misturador: (c) => (
    <>
      <VerticalVessel c={c} x={8} y={c.h * 0.16} w={c.w - 16} h={c.h * 0.84} />
      <path d={`M${c.w / 2},${c.h * 0.16} V${c.h * 0.72}`} stroke={G.steelV} strokeWidth={4} />
      <Rotor c={c} cx={c.w / 2} cy={c.h * 0.72} r={c.w * 0.22} blades={3} />
      <rect
        x={c.w / 2 - 16}
        y={c.h * 0.08}
        width={32}
        height={c.h * 0.1}
        fill={G.grayV}
        stroke={EDGE}
      />
      <Motor c={c} x={c.w / 2 - 22} y={0} w={44} h={c.h * 0.1} />
    </>
  ),
  filtro_prensa: (c) => (
    <>
      <rect x={4} y={c.h * 0.18} width={c.w - 8} height={8} fill={G.steelH} stroke={EDGE} />
      <rect x={4} y={c.h * 0.72} width={c.w - 8} height={8} fill={G.steelH} stroke={EDGE} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x={c.w * 0.18 + i * (c.w * 0.055)}
          y={c.h * 0.2}
          width={c.w * 0.045}
          height={c.h * 0.58}
          fill={i % 2 ? "#cbd5e1" : "#94a3b8"}
          stroke={EDGE}
          strokeWidth={0.5}
        />
      ))}
      <rect
        x={4}
        y={c.h * 0.22}
        width={c.w * 0.12}
        height={c.h * 0.5}
        fill={G.blueV}
        stroke={EDGE}
      />
      <rect
        x={c.w * 0.86}
        y={c.h * 0.22}
        width={c.w * 0.1}
        height={c.h * 0.5}
        fill={G.steelV}
        stroke={EDGE}
      />
    </>
  ),
  ciclone: (c) => (
    <>
      <rect x={c.w / 2 - 8} y={2} width={16} height={c.h * 0.12} fill={G.steelV} stroke={EDGE} />
      <path
        d={`M10,${c.h * 0.1} H${c.w - 10} V${c.h * 0.42} L${c.w / 2 + 8},${c.h - 10} H${c.w / 2 - 8} L10,${c.h * 0.42} Z`}
        fill={G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <rect x={2} y={c.h * 0.12} width={16} height={c.h * 0.14} fill={G.steelH} stroke={EDGE} />
      <path
        d={`M${c.w / 2 - 8},${c.h - 10} V${c.h - 2} H${c.w / 2 + 8} V${c.h - 10}`}
        fill={G.steelV}
        stroke={EDGE}
      />
    </>
  ),
  // Saneamento
  rede_esgoto: (c) => (
    <>
      <rect
        x={2}
        y={c.h * 0.2}
        width={c.w - 4}
        height={c.h * 0.78}
        fill={G.concrete}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <ellipse
        cx={c.w / 2}
        cy={c.h * 0.22}
        rx={c.w * 0.34}
        ry={c.h * 0.16}
        fill="#374151"
        stroke={EDGE}
      />
      <ellipse
        cx={c.w / 2}
        cy={c.h * 0.22}
        rx={c.w * 0.3}
        ry={c.h * 0.12}
        fill="none"
        stroke="#6b7280"
        strokeDasharray="3 3"
      />
      <rect
        x={6}
        y={c.h * 0.55}
        width={c.w - 12}
        height={c.h * 0.3}
        fill={MEDIUM_COLOR.esgoto}
        opacity={0.8}
      />
    </>
  ),
  elevatoria: (c) => {
    const clip = `${c.uid}-ee`;
    return (
      <>
        <clipPath id={clip}>
          <rect x={10} y={c.h * 0.15} width={c.w - 20} height={c.h * 0.8} />
        </clipPath>
        <path
          d={`M2,${c.h * 0.1} H10 V${c.h * 0.95} H${c.w - 10} V${c.h * 0.1} H${c.w - 2} V${c.h} H2 Z`}
          fill={G.concrete}
          stroke={EDGE}
          strokeWidth={1.2}
        />
        <rect x={10} y={c.h * 0.15} width={c.w - 20} height={c.h * 0.8} fill="#0f172a" />
        <Fluid
          clip={clip}
          x={10}
          y={c.h * 0.15}
          w={c.w - 20}
          h={c.h * 0.8}
          pct={c.st.levelPct}
          color={MEDIUM_COLOR.esgoto}
        />
        <rect
          x={c.w * 0.55}
          y={c.h * 0.72}
          width={c.w * 0.22}
          height={c.h * 0.2}
          rx={4}
          fill={G.blueV}
          stroke={EDGE}
        />
        <path d={`M${c.w * 0.66},${c.h * 0.72} V${c.h * 0.1}`} stroke={G.steelV} strokeWidth={5} />
        <Lamp x={c.w * 0.66} y={c.h * 0.06} c={c} />
        {c.st.levelPct > 0 && <PctLabel x={c.w * 0.3} y={c.h * 0.5} pct={c.st.levelPct} />}
      </>
    );
  },
  gradeamento: (c) => (
    <>
      <path d={`M2,${c.h * 0.2} H${c.w - 2} V${c.h - 2} H2 Z`} fill={G.concrete} stroke={EDGE} />
      <rect
        x={6}
        y={c.h * 0.5}
        width={c.w - 12}
        height={c.h * 0.45}
        fill={MEDIUM_COLOR.esgoto}
        opacity={0.75}
      />
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M${c.w * 0.3 + i * 5},${c.h * 0.05} L${c.w * 0.4 + i * 5},${c.h * 0.95}`}
          stroke={G.steelV}
          strokeWidth={2}
        />
      ))}
      <rect
        x={c.w * 0.28}
        y={c.h * 0.05}
        width={c.w * 0.32}
        height={6}
        fill={G.steelH}
        className={animClass("hmi-shake", c.st)}
        style={c.anim}
      />
    </>
  ),
  decantador: (c) => {
    const clip = `${c.uid}-de`;
    const d = `M6,${c.h * 0.12} H${c.w - 6} V${c.h * 0.62} L${c.w / 2 + 10},${c.h - 6} H${c.w / 2 - 10} L6,${c.h * 0.62} Z`;
    return (
      <>
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
        <path d={d} fill={G.concrete} stroke={EDGE} strokeWidth={1.2} />
        <Fluid
          clip={clip}
          x={0}
          y={c.h * 0.12}
          w={c.w}
          h={c.h * 0.82}
          pct={c.st.levelPct}
          color={MEDIUM_COLOR.agua}
        />
        <path d={`M${c.w / 2},${c.h * 0.05} V${c.h * 0.8}`} stroke={G.steelV} strokeWidth={3} />
        <rect
          x={c.w * 0.2}
          y={c.h * 0.03}
          width={c.w * 0.6}
          height={6}
          fill={G.steelH}
          stroke={EDGE}
        />
        {c.st.levelPct > 0 && <PctLabel x={c.w * 0.3} y={c.h * 0.4} pct={c.st.levelPct} />}
      </>
    );
  },
  // Elétrico
  motor: (c) => <Motor c={c} x={2} y={2} w={c.w - 4} h={c.h - 4} />,
  painel: (c) => (
    <>
      <rect
        x={4}
        y={2}
        width={c.w - 8}
        height={c.h - 8}
        rx={2}
        fill={G.grayV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <rect x={4} y={c.h - 8} width={c.w - 8} height={6} fill="#111827" />
      <path d={`M${c.w / 2},4 V${c.h - 10}`} stroke={EDGE} strokeWidth={1.5} />
      {[c.w / 2 - 6, c.w / 2 + 6].map((x) => (
        <rect key={x} x={x - 1.5} y={c.h * 0.45} width={3} height={12} rx={1} fill="#d1d5db" />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <path key={i} d={`M12,${c.h * 0.75 + i * 4} H${c.w / 2 - 6}`} stroke="#1f2937" />
      ))}
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={c.w * 0.62 + i * 10}
          cy={c.h * 0.18}
          r={3.5}
          fill={i === 0 ? ON : i === 1 ? "#f59e0b" : "#ef4444"}
          opacity={0.85}
          stroke={EDGE}
        />
      ))}
      <rect
        x={14}
        y={c.h * 0.12}
        width={c.w * 0.3}
        height={c.h * 0.16}
        rx={1}
        fill="#0f172a"
        stroke={EDGE}
      />
    </>
  ),
  inversor: (c) => (
    <>
      <rect
        x={6}
        y={4}
        width={c.w - 12}
        height={c.h - 8}
        rx={4}
        fill={G.grayV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <rect
        x={12}
        y={12}
        width={c.w - 24}
        height={c.h * 0.22}
        rx={2}
        fill="#052e16"
        stroke={EDGE}
      />
      <text
        x={c.w / 2}
        y={12 + c.h * 0.15}
        textAnchor="middle"
        fontSize={11}
        fill={c.st.running ? "#4ade80" : "#14532d"}
        fontFamily="monospace"
      >
        {c.st.running ? `${((c.st.speedPct * 60) / 100).toFixed(1)}Hz` : "0.0Hz"}
      </text>
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={i}
          x={14 + (i % 3) * ((c.w - 28) / 3)}
          y={c.h * 0.42 + Math.floor(i / 3) * 12}
          width={(c.w - 28) / 3 - 3}
          height={8}
          rx={2}
          fill="#374151"
        />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <path key={i} d={`M12,${c.h * 0.72 + i * 4} H${c.w - 12}`} stroke="#1f2937" />
      ))}
    </>
  ),
  gerador: (c) => (
    <>
      <rect x={4} y={c.h - 10} width={c.w - 8} height={8} fill={G.grayV} />
      <rect
        x={6}
        y={c.h * 0.2}
        width={c.w * 0.45}
        height={c.h * 0.58}
        rx={3}
        fill={G.yellowH}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      {Array.from({ length: 5 }, (_, i) => (
        <path key={i} d={`M10,${c.h * (0.3 + i * 0.09)} H${c.w * 0.47}`} stroke="#6b4f00" />
      ))}
      <rect
        x={c.w * 0.5}
        y={c.h * 0.26}
        width={c.w * 0.4}
        height={c.h * 0.48}
        rx={c.h * 0.2}
        fill={G.blueH}
        stroke={EDGE}
      />
      <text
        x={c.w * 0.7}
        y={c.h * 0.56}
        textAnchor="middle"
        fontSize={14}
        fontWeight="bold"
        fill="#e2e8f0"
      >
        G
      </text>
      <rect x={c.w * 0.18} y={4} width={8} height={c.h * 0.18} fill={G.steelV} />
      <Lamp x={c.w * 0.9} y={c.h * 0.18} c={c} />
    </>
  ),
  sensor_vazao: (c) => (
    <>
      <rect x={2} y={c.h * 0.55} width={c.w - 4} height={c.h * 0.3} fill={G.steelH} stroke={EDGE} />
      <Flange x={8} y={c.h * 0.7} vertical={false} size={c.h * 0.42} />
      <Flange x={c.w - 8} y={c.h * 0.7} vertical={false} size={c.h * 0.42} />
      <rect x={c.w / 2 - 3} y={c.h * 0.32} width={6} height={c.h * 0.24} fill={G.steelV} />
      <circle cx={c.w / 2} cy={c.h * 0.22} r={c.h * 0.2} fill={G.blueV} stroke={EDGE} />
      <circle cx={c.w / 2} cy={c.h * 0.22} r={c.h * 0.12} fill="#052e16" />
      <text
        x={c.w / 2}
        y={c.h * 0.26}
        textAnchor="middle"
        fontSize={6}
        fill="#4ade80"
        fontFamily="monospace"
      >
        FT
      </text>
    </>
  ),
};

/** Válvula gaveta/globo flangeada (com volante opcional). */
function GateValve({ c, yc, wheel = true }: { c: Ctx; yc: number; wheel?: boolean }) {
  const open = c.st.open;
  return (
    <>
      <rect x={2} y={yc - 6} width={c.w - 4} height={12} fill={G.steelH} />
      <path
        d={`M10,${yc - 12} L${c.w / 2},${yc} L10,${yc + 12} Z M${c.w - 10},${yc - 12} L${c.w / 2},${yc} L${c.w - 10},${yc + 12} Z`}
        fill={open ? ON : G.steelV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <Flange x={6} y={yc} vertical={false} size={22} />
      <Flange x={c.w - 6} y={yc} vertical={false} size={22} />
      <rect x={c.w / 2 - 2} y={yc - 22} width={4} height={14} fill={G.steelV} />
      {wheel && (
        <>
          <ellipse
            cx={c.w / 2}
            cy={yc - 23}
            rx={12}
            ry={3.5}
            fill="none"
            stroke={open ? ON : "#b91c1c"}
            strokeWidth={2.5}
          />
          <path d={`M${c.w / 2 - 12},${yc - 23} H${c.w / 2 + 12}`} stroke={EDGE} strokeWidth={1} />
        </>
      )}
    </>
  );
}

/** Transmissor de campo (cabeça redonda com display) — ISA-5.1 na letra. */
function transmitter(letters: string) {
  return (c: Ctx) => (
    <>
      <rect x={c.w / 2 - 3} y={c.h * 0.62} width={6} height={c.h * 0.36} fill={G.steelV} />
      <rect x={c.w / 2 - 9} y={c.h * 0.86} width={18} height={4} fill={G.steelH} stroke={EDGE} />
      <circle
        cx={c.w / 2}
        cy={c.h * 0.36}
        r={c.w * 0.32}
        fill={G.blueV}
        stroke={EDGE}
        strokeWidth={1.2}
      />
      <circle cx={c.w / 2} cy={c.h * 0.36} r={c.w * 0.21} fill="#052e16" stroke={EDGE} />
      <text
        x={c.w / 2}
        y={c.h * 0.4}
        textAnchor="middle"
        fontSize={8}
        fill="#4ade80"
        fontFamily="monospace"
      >
        {letters}
      </text>
    </>
  );
}
DRAW.sensor_nivel = transmitter("LT");
DRAW.sensor_pressao = transmitter("PT");
DRAW.sensor_temperatura = transmitter("TT");

/** Tipos com desenho próprio (o teste garante que todos da biblioteca têm). */
export const SYMBOL_TYPES = Object.keys(DRAW);

export const ProcessSymbol = memo(function ProcessSymbol({
  type,
  w,
  h,
  state = IDLE_STATE,
  fluid = "agua",
}: {
  type: string;
  w: number;
  h: number;
  state?: SymbolState;
  fluid?: Medium;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const draw = DRAW[type];
  const accent = state.running ? (state.reverse ? REV : ON) : OFF;
  const ctx: Ctx = {
    w,
    h,
    st: state,
    accent,
    anim: animStyle(state, 1.2),
    fluid,
    uid: `hmi${uid}`,
  };
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={type}
      className="overflow-visible"
    >
      <SharedDefs />
      {draw ? (
        draw(ctx)
      ) : (
        <rect x={2} y={2} width={w - 4} height={h - 4} fill={G.steelV} stroke={EDGE} />
      )}
    </svg>
  );
});
