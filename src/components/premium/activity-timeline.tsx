import { type ReactNode } from "react";

interface TimelineEntry {
  id: string;
  icon: ReactNode;
  label: string;
  desc: string;
  time: string;
  status?: "ok" | "warn" | "err";
}

export function ActivityTimeline({
  entries,
  title,
  className = "",
}: {
  entries: TimelineEntry[];
  title?: string;
  className?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <div className={className}>
      {title && (
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3">
          {title}
        </span>
      )}
      <div className="relative space-y-0">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border/60" />
        {entries.map((e) => {
          const dotColor =
            e.status === "err"
              ? "bg-red-500"
              : e.status === "warn"
                ? "bg-amber-500"
                : "bg-emerald-500";
          return (
            <div key={e.id} className="relative flex items-start gap-3 pb-3 last:pb-0">
              <div className="relative z-10 mt-0.5">
                <div
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border border-border/40 bg-background ${dotColor === "bg-emerald-500" ? "text-emerald-500" : dotColor === "bg-amber-500" ? "text-amber-500" : "text-red-500"}`}
                >
                  {e.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs font-medium text-foreground/90 truncate">{e.label}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{e.desc}</p>
              </div>
              <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0 pt-1">
                {e.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
