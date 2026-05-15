import { useEffect, useState } from "react";
import type { ParamSpec } from "@/lib/voltai/component-definitions";
import { validateParam } from "@/lib/editor/property-schemas";
import { cn } from "@/lib/utils";

interface Props {
  spec: ParamSpec;
  value: unknown;
  onCommit: (value: string | number | boolean) => void;
}

/**
 * Validated parameter editor. Errors block commit; valid changes propagate immediately.
 */
export function ValidatedParamField({ spec, value, onCommit }: Props) {
  const [draft, setDraft] = useState<string>(String(value ?? spec.defaultValue));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value ?? spec.defaultValue));
    setError(null);
  }, [value, spec.defaultValue]);

  const commit = (raw: string | boolean) => {
    let coerced: string | number | boolean;
    if (spec.type === "boolean") coerced = Boolean(raw);
    else if (spec.type === "number" || spec.type === "time") coerced = Number(raw);
    else coerced = String(raw);

    const err = validateParam(spec, coerced);
    setError(err);
    if (!err) onCommit(coerced);
  };

  return (
    <label className="grid gap-1 text-[11px]">
      <span className="flex justify-between text-muted-foreground">
        <span>
          {spec.label}
          {spec.normRef && (
            <span className="ml-1 text-[9px] font-mono text-primary/70">[{spec.normRef}]</span>
          )}
        </span>
        {spec.unit && <span>{spec.unit}</span>}
      </span>

      {spec.type === "boolean" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => commit(e.target.checked)}
          className="h-4 w-4"
        />
      ) : spec.type === "select" && spec.options ? (
        <select
          value={String(value ?? spec.defaultValue)}
          onChange={(e) => commit(e.target.value)}
          className={cn(
            "h-8 rounded bg-input border px-2 text-foreground",
            error ? "border-destructive" : "border-border",
          )}
        >
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={spec.type === "number" || spec.type === "time" ? "number" : "text"}
          value={draft}
          min={spec.min}
          max={spec.max}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={cn(
            "h-8 rounded bg-input border px-2 font-mono text-foreground",
            error ? "border-destructive" : "border-border",
          )}
        />
      )}

      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </label>
  );
}
