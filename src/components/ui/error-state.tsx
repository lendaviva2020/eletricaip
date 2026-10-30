import * as React from "react";
import { Warning, ArrowCounterClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "Falha na Operação",
  message,
  onRetry,
  retryLabel = "Tentar novamente",
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center p-6 text-center rounded-md border border-destructive/30 bg-destructive/5 max-w-md mx-auto",
        className,
      )}
      {...props}
    >
      <div className="p-2 rounded-md bg-destructive/15 text-destructive mb-2.5 border border-destructive/30">
        <Warning className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs sm:text-[13px] text-muted-foreground mt-1 leading-relaxed">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="mt-3.5 gap-1.5 border-destructive/30 hover:bg-destructive/10 text-xs"
        >
          <ArrowCounterClockwise className="h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
