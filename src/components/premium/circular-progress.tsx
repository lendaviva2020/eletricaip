export function CircularProgress({
  value,
  max = 100,
  size = 48,
  strokeWidth = 3,
  label,
  color = "#3fb6d6",
  warningColor = "#f59e0b",
  dangerColor = "#ef4444",
  className = "",
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
  warningColor?: string;
  dangerColor?: string;
  className?: string;
}) {
  const pct = Math.min(value / max, 1);
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - pct);
  const finalColor = pct > 0.9 ? dangerColor : pct > 0.7 ? warningColor : color;

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={finalColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {label && (
        <span className="text-[9px] font-mono text-muted-foreground/70">{label}</span>
      )}
    </div>
  );
}
