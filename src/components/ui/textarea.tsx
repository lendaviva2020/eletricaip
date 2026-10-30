import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    const fallbackLabel =
      typeof props.placeholder === "string" ? props.placeholder : "Campo de texto";
    return (
      <textarea
        aria-label={props["aria-label"] ?? fallbackLabel}
        title={props.title ?? fallbackLabel}
        className={cn(
          "flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-[13px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
