import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-xl border border-dashed border-border bg-card/40 max-w-lg mx-auto",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="p-3 rounded-full bg-muted/60 text-muted-foreground mb-3 ring-1 ring-border">
          {icon}
        </div>
      )}
      <h3 className="font-display text-base sm:text-lg font-bold text-foreground">{title}</h3>
      {description && (
        <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    </div>
  );
}
