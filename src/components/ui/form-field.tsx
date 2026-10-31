import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean | "true" | "false";
  }>;
}

export function FormField({
  id,
  label,
  required,
  description,
  error,
  children,
  className,
  ...props
}: FormFieldProps) {
  const descId = description ? `${id}-desc` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const ariaDescribedBy = [descId, errorId].filter(Boolean).join(" ") || undefined;

  const childWithProps = React.cloneElement(children, {
    id,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <Label htmlFor={id} className="text-xs font-semibold text-foreground flex items-center gap-1">
        <span>{label}</span>
        {required && (
          <span className="text-destructive font-bold" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {childWithProps}
      {description && (
        <p id={descId} className="text-[11px] text-muted-foreground leading-normal">
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-[11px] font-medium text-destructive leading-normal"
        >
          {error}
        </p>
      )}
    </div>
  );
}
