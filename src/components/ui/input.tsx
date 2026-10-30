import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const fallbackLabel =
      typeof props.placeholder === "string" ? props.placeholder : "Campo de formulario";
    return (
      <input
        type={type}
        aria-label={props["aria-label"] ?? fallbackLabel}
        title={props.title ?? fallbackLabel}
        className={cn(
          "flex h-8 [@media(pointer:coarse)]:h-10 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-[13px] transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
