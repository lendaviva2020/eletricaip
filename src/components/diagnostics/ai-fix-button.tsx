import React from "react";
import { Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  useAiDiagnosticRepairStore,
  type DiagnosticContext,
} from "@/lib/diagnostics/ai-repair-context";

export interface AiFixButtonProps {
  diagnostic?: DiagnosticContext;
  batch?: DiagnosticContext[];
  variant?: "primary" | "secondary" | "outline" | "compact" | "ghost";
  size?: "xs" | "sm" | "md";
  label?: string;
  className?: string;
  onTrigger?: () => void;
  disabled?: boolean;
  showIcon?: boolean;
}

export const AiFixButton: React.FC<AiFixButtonProps> = ({
  diagnostic,
  batch,
  variant = "primary",
  size = "sm",
  label,
  className,
  onTrigger,
  disabled = false,
  showIcon = true,
}) => {
  const openRepairWithContext = useAiDiagnosticRepairStore(
    (s) => s.openRepairWithContext,
  );
  const openRepairWithBatch = useAiDiagnosticRepairStore(
    (s) => s.openRepairWithBatch,
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    if (batch && batch.length > 0) {
      openRepairWithBatch(batch);
    } else if (diagnostic) {
      openRepairWithContext(diagnostic);
    }

    if (onTrigger) {
      onTrigger();
    }
  };

  const defaultText =
    batch && batch.length > 1
      ? "CORRIGIR TODOS COM IA"
      : "CORRIGIR COM IA";

  const displayText = label || defaultText;

  const sizeClasses = {
    xs: "h-5 px-1.5 text-[10px] gap-1",
    sm: "h-6 px-2 text-[11px] gap-1.5",
    md: "h-8 px-3 text-xs gap-2",
  }[size];

  const variantClasses = {
    primary:
      "bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-sm shadow-amber-500/20 active:scale-[0.98]",
    secondary:
      "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold",
    outline:
      "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold",
    compact:
      "bg-transparent hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 font-medium",
    ghost:
      "bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground font-medium",
  }[variant];

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded transition-all duration-150 font-mono tracking-tight shrink-0 select-none",
        sizeClasses,
        variantClasses,
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className,
      )}
      title="Iniciar diagnóstico e protocolo de correção automática com IA"
      data-testid="ai-fix-button"
      data-diagnostic-code={diagnostic?.error_code || (batch?.[0]?.error_code ?? "BATCH")}
    >
      {showIcon && (
        <Sparkle
          className={cn(
            "shrink-0",
            size === "xs" ? "h-2.5 w-2.5" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
            variant === "primary" ? "text-black fill-black" : "text-amber-400 fill-amber-400",
          )}
          weight="fill"
        />
      )}
      <span>{displayText}</span>
    </button>
  );
};
