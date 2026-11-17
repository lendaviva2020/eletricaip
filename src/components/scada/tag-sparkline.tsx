// Tendência curta de um tag (faceplate). Só pontos publicados de verdade;
// trecho com qualidade não boa é desenhado tracejado (ISA-101: estado visível).
import { useMemo } from "react";
import type { TrendPoint } from "@/lib/scada/tag-trend-buffer";
import { sourceLabel } from "@/lib/scada/tag-hub";

interface Props {
  points: readonly TrendPoint[];
  unit: string;
  width?: number;
  height?: number;
}

export function TagSparkline({ points, unit, width = 360, height = 90 }: Props) {
  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = 6;
    const x = (t: number) =>
      t1 === t0 ? width / 2 : pad + ((t - t0) / (t1 - t0)) * (width - 2 * pad);
    const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - 2 * pad);
    const good: string[] = [];
    const doubtful: string[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const seg = `M${x(a.t).toFixed(1)},${y(a.v).toFixed(1)}H${x(b.t).toFixed(1)}V${y(b.v).toFixed(1)}`;
      (a.quality === "GOOD" ? good : doubtful).push(seg);
    }
    return { good: good.join(""), doubtful: doubtful.join(""), min, max, t0, t1, x, y };
  }, [points, width, height]);

  if (!geom) {
    return (
      <div
        className="h-[90px] flex items-center justify-center text-[11px] text-zinc-500 border border-dashed border-zinc-800 rounded"
        data-testid="faceplate-trend-empty"
      >
        Sem valores publicados desde a abertura da tela.
      </div>
    );
  }
  const last = points[points.length - 1];
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  const time = (t: number) => new Date(t).toLocaleTimeString("pt-BR");
  return (
    <div data-testid="faceplate-trend" className="space-y-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[90px] bg-zinc-950/60 rounded border border-zinc-800"
        role="img"
        aria-label={`Tendência: último valor ${fmt(last.v)} ${unit}`}
      >
        <path d={geom.good} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
        <path
          d={geom.doubtful}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
        {points.length === 1 && (
          <circle cx={geom.x(last.t)} cy={geom.y(last.v)} r={2.5} fill="#cbd5e1" />
        )}
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-zinc-500">
        <span>
          {time(geom.t0)} → {time(geom.t1)} · {points.length} pts
        </span>
        <span>
          mín {fmt(geom.min)} · máx {fmt(geom.max)} {unit} · {sourceLabel(last.source)}
        </span>
      </div>
    </div>
  );
}
