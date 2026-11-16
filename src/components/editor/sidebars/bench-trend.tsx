/**
 * Tendência ao vivo dos canais analógicos da bancada (últimos ~60 s).
 * Só amostras REAIS recebidas do Arduino — sem interpolação nem preenchimento.
 */
import { memo, useMemo } from "react";
import { useBenchStore } from "@/lib/hardware/serial/bench-controller";
import { toEngineering, type BenchConfig } from "@/lib/hardware/bench-config";

const W = 220;
const H = 36;

interface Series {
  readonly channel: number;
  readonly label: string;
  readonly unit: string;
  readonly path: string;
  readonly min: number;
  readonly max: number;
  readonly last: number;
}

function buildSeries(
  config: BenchConfig,
  history: ReturnType<typeof useBenchStore.getState>["history"],
): Series[] {
  if (history.length < 2) return [];
  const ordered = [...config.analog].sort((a, b) => a.channel - b.channel);
  const t0 = history[0].at;
  const span = Math.max(1, history[history.length - 1].at - t0);
  return ordered.flatMap((cfg, idx) => {
    const values = history
      .filter((h) => h.mean[idx] !== undefined)
      .map((h) => ({
        at: h.at,
        v: toEngineering(cfg, cfg.channel, h.mean[idx], h.rms[idx] ?? 0).value,
      }))
      .filter((p): p is { at: number; v: number } => p.v !== null);
    if (values.length < 2) return [];
    const min = Math.min(...values.map((p) => p.v));
    const max = Math.max(...values.map((p) => p.v));
    const range = max - min || 1;
    const path = values
      .map((p, i) => {
        const x = ((p.at - t0) / span) * W;
        const y = H - 2 - ((p.v - min) / range) * (H - 4);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const sample = toEngineering(cfg, cfg.channel, 0, 0);
    return [
      {
        channel: cfg.channel,
        label: cfg.label,
        unit: sample.unit,
        path,
        min,
        max,
        last: values[values.length - 1].v,
      },
    ];
  });
}

export const BenchTrend = memo(function BenchTrend({ config }: { config: BenchConfig }) {
  const history = useBenchStore((s) => s.history);
  const series = useMemo(() => buildSeries(config, history), [config, history]);
  if (series.length === 0) return null;
  return (
    <div className="mt-1 space-y-1" data-testid="bench-trend">
      {series.map((s) => (
        <figure key={s.channel} className="rounded border border-border p-1">
          <figcaption className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              A{s.channel} · {s.label}
            </span>
            <span className="font-mono">
              {s.min.toFixed(2)}–{s.max.toFixed(2)} {s.unit}
            </span>
          </figcaption>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-9 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${s.label}: ${s.last.toFixed(2)} ${s.unit}`}
          >
            <path
              d={s.path}
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth="1.2"
            />
          </svg>
        </figure>
      ))}
    </div>
  );
});
