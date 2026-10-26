import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
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
        "flex flex-col items-center justify-center p-6 sm:p-8 text-center rounded-xl border border-destructive/20 bg-destructive/5 max-w-md mx-auto",
        className,
      )}
      {...props}
    >
      <div className="p-2.5 rounded-full bg-destructive/15 text-destructive mb-3 ring-1 ring-destructive/30">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
      <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="mt-4 gap-1.5 border-destructive/30 hover:bg-destructive/10 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
