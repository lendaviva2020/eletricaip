import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingState({
  message = "Carregando dados industriais...",
  size = "md",
  className,
  ...props
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center p-8 text-center text-muted-foreground", className)}
      {...props}
    >
      <Loader2 className={cn("animate-spin text-primary mb-2", sizeClasses[size])} />
      <span className="text-xs sm:text-sm font-medium">{message}</span>
    </div>
  );
}
