import * as React from "react";
import { CircleNotch } from "@phosphor-icons/react";
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
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center p-6 text-center text-muted-foreground",
        className,
      )}
      {...props}
    >
      <CircleNotch className={cn("animate-spin text-primary mb-2", sizeClasses[size])} />
      <span className="text-xs sm:text-[13px] font-medium">{message}</span>
    </div>
  );
}
