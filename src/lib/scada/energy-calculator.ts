// SCADA SUPERVISÓRIO — Industrial Energy Calculator & Numerical Integration
// Standards: IEC 62053 (Electricity metering equipment), IEEE 1459 (Power definitions)
// Mathematical Method: Composite Trapezoidal Rule with Irregular Time Steps and Gap Detection

import type { HistoricalSample, TagQuality } from "./types";

export interface EnergySampleInput {
  timestamp: number | string;
  powerValue: number;
  quality?: TagQuality | string;
}

export interface EnergyCalculationOptions {
  /** Power unit of input samples: "W" (Watts) or "kW" (Kilowatts). Defaults to "kW". */
  powerUnit?: "W" | "kW";
  /** Maximum allowable gap between consecutive valid samples (in seconds). Gaps larger than this are NOT interpolated. Defaults to 300s (5 min). */
  maxGapSeconds?: number;
  /** Allowed qualities to include in integration. Defaults to ["GOOD", "FORCED"]. */
  validQualities?: TagQuality[];
}

export interface EnergyCalculationResult {
  /** Total energy accumulated in kilowatt-hours (kWh) */
  totalEnergyKwh: number;
  /** Peak active demand recorded in kW */
  peakDemandKw: number;
  /** Time-weighted average power in kW across active integration intervals */
  averagePowerKw: number;
  /** Total time span analyzed in hours */
  totalSpanHours: number;
  /** Active integration time in hours (excluding disconnected gaps) */
  activeIntegrationHours: number;
  /** Total valid samples integrated */
  validSamplesCount: number;
  /** Number of discarded samples (BAD, STALE, NaN, Infinity) */
  discardedSamplesCount: number;
  /** Number of detected communication gaps exceeding maxGapSeconds */
  gapsDetectedCount: number;
}

/**
 * Calculates active electrical energy using the Composite Trapezoidal Rule
 * for non-uniform time series sampling with strict quality filtering and gap suppression.
 */
export function calculateEnergyKwhTrapezoidal(
  samples: Array<EnergySampleInput | HistoricalSample>,
  options?: EnergyCalculationOptions,
): EnergyCalculationResult {
  const powerUnit = options?.powerUnit ?? "kW";
  const maxGapSeconds = options?.maxGapSeconds ?? 300; // 5 minutes
  const validQualities = new Set<string>(options?.validQualities ?? ["GOOD", "FORCED"]);

  if (!samples || samples.length === 0) {
    return {
      totalEnergyKwh: 0,
      peakDemandKw: 0,
      averagePowerKw: 0,
      totalSpanHours: 0,
      activeIntegrationHours: 0,
      validSamplesCount: 0,
      discardedSamplesCount: 0,
      gapsDetectedCount: 0,
    };
  }

  // 1. Filter and normalize samples
  let discardedCount = 0;
  interface NormalizedSample {
    timestamp: number;
    powerKw: number;
  }

  const normalized: NormalizedSample[] = [];

  for (const s of samples) {
    // Extract timestamp
    const rawTs = "sampledAt" in s ? s.sampledAt : s.timestamp;
    const ts = typeof rawTs === "number" ? rawTs : new Date(rawTs).getTime();

    // Extract value
    const rawVal = "value" in s ? s.value : s.powerValue;

    // Extract quality
    const q = (s.quality ?? "GOOD") as string;

    // Quality & Finite Check
    if (
      !validQualities.has(q) ||
      typeof rawVal !== "number" ||
      !Number.isFinite(rawVal) ||
      Number.isNaN(rawVal) ||
      rawVal < 0 || // Active power should not be negative for normal consumption calculation
      Number.isNaN(ts)
    ) {
      discardedCount++;
      continue;
    }

    const powerKw = powerUnit === "W" ? rawVal / 1000 : rawVal;
    normalized.push({ timestamp: ts, powerKw });
  }

  if (normalized.length === 0) {
    return {
      totalEnergyKwh: 0,
      peakDemandKw: 0,
      averagePowerKw: 0,
      totalSpanHours: 0,
      activeIntegrationHours: 0,
      validSamplesCount: 0,
      discardedSamplesCount: discardedCount,
      gapsDetectedCount: 0,
    };
  }

  // 2. Sort chronologically
  normalized.sort((a, b) => a.timestamp - b.timestamp);

  // 3. Deduplicate exact timestamps by taking the latest valid reading
  const deduplicated: NormalizedSample[] = [];
  for (const s of normalized) {
    const prev = deduplicated[deduplicated.length - 1];
    if (prev && prev.timestamp === s.timestamp) {
      prev.powerKw = s.powerKw; // overwrite with newest
    } else {
      deduplicated.push({ ...s });
    }
  }

  if (deduplicated.length === 1) {
    return {
      totalEnergyKwh: 0,
      peakDemandKw: deduplicated[0].powerKw,
      averagePowerKw: deduplicated[0].powerKw,
      totalSpanHours: 0,
      activeIntegrationHours: 0,
      validSamplesCount: 1,
      discardedSamplesCount: discardedCount,
      gapsDetectedCount: 0,
    };
  }

  // 4. Composite Trapezoidal Integration
  let totalEnergyKwh = 0;
  let peakDemandKw = -Number.MAX_VALUE;
  let activeTimeMs = 0;
  let gapsCount = 0;

  for (let i = 0; i < deduplicated.length; i++) {
    const curr = deduplicated[i];
    if (curr.powerKw > peakDemandKw) {
      peakDemandKw = curr.powerKw;
    }

    if (i === 0) continue;

    const prev = deduplicated[i - 1];
    const dtSeconds = (curr.timestamp - prev.timestamp) / 1000;

    if (dtSeconds <= 0) continue;

    // Gap Detection: if dt exceeds maxGapSeconds, treat as communication dropout
    if (dtSeconds > maxGapSeconds) {
      gapsCount++;
      // Do NOT interpolate power consumption across blackout/dropouts
      continue;
    }

    // Trapezoidal rule: E_interval = ((P_prev + P_curr) / 2) * dt_hours
    const dtHours = dtSeconds / 3600;
    const avgPowerInterval = (prev.powerKw + curr.powerKw) / 2;
    const intervalEnergyKwh = avgPowerInterval * dtHours;

    totalEnergyKwh += intervalEnergyKwh;
    activeTimeMs += curr.timestamp - prev.timestamp;
  }

  const firstTs = deduplicated[0].timestamp;
  const lastTs = deduplicated[deduplicated.length - 1].timestamp;
  const totalSpanHours = (lastTs - firstTs) / (1000 * 3600);
  const activeIntegrationHours = activeTimeMs / (1000 * 3600);
  const averagePowerKw =
    activeIntegrationHours > 0
      ? totalEnergyKwh / activeIntegrationHours
      : peakDemandKw;

  return {
    totalEnergyKwh: Math.round(totalEnergyKwh * 10000) / 10000,
    peakDemandKw: Math.round(peakDemandKw * 100) / 100,
    averagePowerKw: Math.round(averagePowerKw * 100) / 100,
    totalSpanHours: Math.round(totalSpanHours * 1000) / 1000,
    activeIntegrationHours: Math.round(activeIntegrationHours * 1000) / 1000,
    validSamplesCount: deduplicated.length,
    discardedSamplesCount: discardedCount,
    gapsDetectedCount: gapsCount,
  };
}
