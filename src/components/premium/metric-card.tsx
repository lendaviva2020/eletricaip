import { type ReactNode } from "react";

export function MetricCard({
  icon,
  label,
  value,
  sub,
  trend,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; positive: boolean };
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/40 ${className}`}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 font-medium">
            {label}
          </span>
          <span className="text-muted-foreground/60">{icon}</span>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {(sub || trend) && (
          <div className="flex items-center gap-2 mt-1.5">
            {trend && (
              <span
                className={`text-[11px] font-medium ${
                  trend.positive ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
            )}
            {sub && <span className="text-[11px] text-muted-foreground/60">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
