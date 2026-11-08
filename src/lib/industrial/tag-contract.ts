// ELÉTRICAI — GATE 3.6 — Contrato de Tag: transformação raw → engenharia
// Preserva o valor bruto e registra exatamente a transformação aplicada.

import type {
  GatewayTagSource,
  IndustrialTag,
  SampleQuality,
  TagTransformation,
} from "./types";
import { getUnitConversion } from "./units";

export interface TransformResult {
  engineeringValue: number | boolean | string | null;
  quality: SampleQuality;
  transformation: TagTransformation;
  rejectionReason?: TagTransformation["clampedOrRejected"];
}

function roundTo(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}

/**
 * Aplica o contrato da tag ao valor bruto:
 *   eng = ((raw * scale + offset) * unitFactor + unitOffset) arredondado em `precision`.
 * Regras:
 *  - NaN/Infinity → engineeringValue null, quality BAD (nunca persistido como número).
 *  - Tipo incompatível → null, BAD.
 *  - Unidades de grandezas diferentes → null, BAD.
 *  - Fora de [minimumValue, maximumValue] → valor preservado, quality UNCERTAIN (não grampeado).
 */
export function transformRawValue(
  tag: IndustrialTag,
  source: Pick<GatewayTagSource, "rawUnit" | "scale" | "offset"> | null,
  rawValue: number | boolean | string,
  reportedQuality: SampleQuality,
): TransformResult {
  const rawUnit = source?.rawUnit || tag.rawUnit || tag.engineeringUnit;
  const effectiveScale = source?.scale ?? tag.scale;
  const effectiveOffset = source?.offset ?? tag.offset;
  const base: TagTransformation = {
    scale: effectiveScale,
    offset: effectiveOffset,
    rawUnit,
    engineeringUnit: tag.engineeringUnit,
    unitFactor: 1,
    unitOffset: 0,
    precision: tag.precision,
    clampedOrRejected: "NONE",
  };

  if (tag.dataType === "BOOL") {
    if (typeof rawValue === "boolean") {
      return { engineeringValue: rawValue, quality: reportedQuality, transformation: base };
    }
    if (typeof rawValue === "number" && (rawValue === 0 || rawValue === 1)) {
      return { engineeringValue: rawValue === 1, quality: reportedQuality, transformation: base };
    }
    return {
      engineeringValue: null,
      quality: "BAD",
      transformation: { ...base, clampedOrRejected: "TYPE_MISMATCH" },
      rejectionReason: "TYPE_MISMATCH",
    };
  }

  if (tag.dataType === "STRING") {
    if (typeof rawValue === "string") {
      return { engineeringValue: rawValue, quality: reportedQuality, transformation: base };
    }
    return {
      engineeringValue: null,
      quality: "BAD",
      transformation: { ...base, clampedOrRejected: "TYPE_MISMATCH" },
      rejectionReason: "TYPE_MISMATCH",
    };
  }

  // Numéricos (INT / DINT / REAL)
  if (typeof rawValue !== "number") {
    return {
      engineeringValue: null,
      quality: "BAD",
      transformation: { ...base, clampedOrRejected: "TYPE_MISMATCH" },
      rejectionReason: "TYPE_MISMATCH",
    };
  }
  if (!Number.isFinite(rawValue)) {
    return {
      engineeringValue: null,
      quality: "BAD",
      transformation: { ...base, clampedOrRejected: "NON_FINITE" },
      rejectionReason: "NON_FINITE",
    };
  }

  const conv = getUnitConversion(rawUnit, tag.engineeringUnit);
  if (!conv) {
    return {
      engineeringValue: null,
      quality: "BAD",
      transformation: { ...base, clampedOrRejected: "UNIT_INCOMPATIBLE" },
      rejectionReason: "UNIT_INCOMPATIBLE",
    };
  }

  const scaled = rawValue * effectiveScale + effectiveOffset;
  let eng = scaled * conv.factor + conv.offset;
  if (!Number.isFinite(eng)) {
    return {
      engineeringValue: null,
      quality: "BAD",
      transformation: {
        ...base,
        unitFactor: conv.factor,
        unitOffset: conv.offset,
        clampedOrRejected: "NON_FINITE",
      },
      rejectionReason: "NON_FINITE",
    };
  }
  eng = tag.dataType === "REAL" ? roundTo(eng, tag.precision) : Math.round(eng);

  const transformation: TagTransformation = {
    ...base,
    unitFactor: conv.factor,
    unitOffset: conv.offset,
  };

  const below = tag.minimumValue !== undefined && eng < tag.minimumValue;
  const above = tag.maximumValue !== undefined && eng > tag.maximumValue;
  if (below || above) {
    return {
      engineeringValue: eng,
      quality: reportedQuality === "BAD" ? "BAD" : "UNCERTAIN",
      transformation: { ...transformation, clampedOrRejected: "OUT_OF_RANGE" },
    };
  }

  return { engineeringValue: eng, quality: reportedQuality, transformation };
}
