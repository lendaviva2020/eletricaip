// Zod → JSON Schema (flat, no $ref) for DeepSeek tool-calling.
// Eliminates DRY violation where PATCH_JSON_SCHEMA was manually maintained.
// The AiDiagramPatchSchema Zod definition is the SINGLE source of truth.
import { z } from "zod";

type FlatSchema = {
  type: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  enum?: unknown[];
  required?: string[];
};

function zodToFlatJsonSchema(schema: z.ZodTypeAny): FlatSchema {
  const def = (schema as z.ZodTypeAny & { _def?: unknown })._def ?? {};
  const d = def as {
    typeName?: string;
    values?: unknown[];
    shape?: () => Record<string, z.ZodTypeAny>;
    innerType?: z.ZodTypeAny;
  };

  if (!d.typeName) return { type: "string" };

  switch (d.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: d.values };
    case "ZodArray": {
      const itemType = d.innerType ?? (schema as z.ZodArray<z.ZodTypeAny>).element;
      return {
        type: "array",
        items: itemType ? zodToFlatJsonSchema(itemType) : { type: "string" },
      };
    }
    case "ZodObject": {
      const shape = d.shape?.() ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, propSchema] of Object.entries(shape)) {
        const prop = propSchema as z.ZodTypeAny;
        properties[key] = zodToFlatJsonSchema(prop);
        const propDef = (prop as { _def?: { typeName?: string } })._def;
        if (
          !(prop instanceof z.ZodOptional) &&
          propDef?.typeName !== "ZodOptional" &&
          propDef?.typeName !== "ZodDefault"
        ) {
          required.push(key);
        }
      }
      if (required.length > 0) {
        return { type: "object", properties, required };
      }
      return { type: "object", properties };
    }
    case "ZodOptional":
    case "ZodDefault": {
      try {
        const unwrapped = (schema as z.ZodOptional<z.ZodTypeAny>).unwrap();
        if (unwrapped) return zodToFlatJsonSchema(unwrapped);
      } catch {
        /* fall through */
      }
      if (d.innerType) return zodToFlatJsonSchema(d.innerType);
      return { type: "string" };
    }
    default:
      return { type: "string" };
  }
}

export function buildPatchJsonSchema(): FlatSchema {
  return zodToFlatJsonSchema(
    z.object({
      rationale: z.string(),
      addNodes: z.array(
        z.object({
          id: z.string(),
          sheet: z.enum(["unifilar", "multifilar", "ladder"]),
          position: z.object({ x: z.number(), y: z.number() }),
          rotation: z.number().optional(),
          label: z.string(),
          params: z.object({}).passthrough(),
        }),
      ),
      addEdges: z.array(
        z.object({
          id: z.string(),
          sheet: z.enum(["unifilar", "multifilar", "ladder"]),
          source: z.string(),
          target: z.string(),
          kind: z.enum(["power", "signal", "pipe", "ground"]),
        }),
      ),
      removeNodeIds: z.array(z.string()),
      removeEdgeIds: z.array(z.string()),
      updateNodes: z.array(
        z.object({
          id: z.string(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
          label: z.string().optional(),
          params: z.object({}).passthrough().optional(),
        }),
      ),
    }),
  );
}
