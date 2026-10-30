import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 5, className, ...props }: TableSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Carregando tabela"
      className={cn("w-full rounded-md border border-border bg-card overflow-hidden", className)}
      {...props}
    >
      <div
        className="grid h-8 items-center gap-4 border-b border-border bg-muted/40 px-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, colIdx) => (
          <Skeleton key={`head-${colIdx}`} className="h-3 w-20 rounded-sm" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="grid h-9 items-center gap-4 px-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={`cell-${rowIdx}-${colIdx}`}
                className={cn(
                  "h-3.5 rounded-sm",
                  colIdx === 0
                    ? "w-3/4"
                    : colIdx === columns - 1
                      ? "w-8 justify-self-end"
                      : "w-1/2",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
