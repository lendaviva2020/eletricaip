import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  "aria-label": string;
  size?: "sm" | "md" | "lg";
  icon: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, "aria-label": ariaLabel, size = "md", variant = "ghost", ...props }, ref) => {
    const sizeClasses = {
      sm: "h-8 w-8 p-1.5",
      md: "h-9 w-9 p-2",
      lg: "h-10 w-10 p-2.5",
    };

    return (
      <Button
        ref={ref}
        variant={variant}
        aria-label={ariaLabel}
        title={props.title ?? ariaLabel}
        className={cn("rounded-md shrink-0 inline-flex items-center justify-center", sizeClasses[size], className)}
        {...props}
      >
        {icon}
      </Button>
    );
  },
);
IconButton.displayName = "IconButton";
