import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  breadcrumb,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2 pb-4 border-b border-border/80", className)} {...props}>
      {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
