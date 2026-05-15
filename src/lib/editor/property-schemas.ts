import { z } from "zod";
import type { ParamSpec } from "@/lib/voltai/component-definitions";

/**
 * Build a Zod schema for a single ParamSpec entry.
 * Mirrors ParamSpec's runtime contract (type, min/max, options).
 */
export function paramSpecToZod(spec: ParamSpec): z.ZodType {
  switch (spec.type) {
    case "boolean":
      return z.boolean();
    case "select": {
      const values = (spec.options ?? []).map((o) => o.value);
      if (values.length === 0) return z.string();
      return z.enum(values as [string, ...string[]]);
    }
    case "time":
    case "number": {
      let s = z.number({ invalid_type_error: `${spec.label} precisa ser numérico` });
      if (typeof spec.min === "number") s = s.min(spec.min, `Mínimo: ${spec.min}`);
      if (typeof spec.max === "number") s = s.max(spec.max, `Máximo: ${spec.max}`);
      return s;
    }
    default:
      return z.string().trim().max(255);
  }
}

/** Build an object schema for an entire component (all paramSpecs). */
export function componentParamsToZod(
  paramSpecs: Record<string, ParamSpec>,
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, spec] of Object.entries(paramSpecs)) {
    shape[key] = paramSpecToZod(spec);
  }
  return z.object(shape);
}

/** Validate one field; returns null on success or the error message. */
export function validateParam(spec: ParamSpec, value: unknown): string | null {
  const result = paramSpecToZod(spec).safeParse(value);
  if (result.success) return null;
  return result.error.errors[0]?.message ?? "Valor inválido";
}

/** Tag name validation — used by the property panel for binding tags to nodes. */
export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag obrigatória")
  .max(64, "Máx 64 caracteres")
  .regex(/^[A-Za-z%][A-Za-z0-9_.]*$/, "Use letras, dígitos, _, . — pode iniciar com % ou letra");

export function validateTagName(value: string): string | null {
  const r = tagNameSchema.safeParse(value);
  return r.success ? null : (r.error.errors[0]?.message ?? "Tag inválida");
}
