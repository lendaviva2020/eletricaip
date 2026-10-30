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
        "flex flex-col items-center justify-center text-center p-6 sm:p-8 rounded-md border border-border bg-card max-w-lg mx-auto",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="p-2.5 rounded-md bg-muted text-muted-foreground mb-3 border border-border">
          {icon}
        </div>
      )}
      <h3 className="text-sm sm:text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-xs sm:text-[13px] text-muted-foreground mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  );
}
