/**
 * Tradução das fontes do app para a base única de tags (puro e testável).
 */
import type { PublishedTagValue } from "./scada-store";
import type { BenchConfig } from "@/lib/hardware/bench-config";
import { snapshotToCloudReadings, type BenchSnapshot } from "@/lib/hardware/bench-telemetry";

/** Prefixo dos tags da bancada Arduino (dispositivo físico). */
export const BENCH_TAG_PREFIX = "BANCADA";

const MCC_UNITS: ReadonlyArray<readonly [string, string]> = [
  ["_CURRENT_A", "A"],
  ["_SPEED_RPM", "rpm"],
  ["_TEMP_C", "°C"],
];

/**
 * Tags de processo da CCM simulada. A temperatura `-999` significa "motor sem
 * sensor" e NÃO é publicada (seria um valor inventado na tendência/alarme).
 */
export function mccTagsToPublished(tags: Record<string, number | boolean>): PublishedTagValue[] {
  const out: PublishedTagValue[] = [];
  for (const [name, value] of Object.entries(tags)) {
    if (name.endsWith("_TEMP_C") && (value === -999 || !Number.isFinite(value as number))) {
      continue;
    }
    const unit = MCC_UNITS.find(([suffix]) => name.endsWith(suffix))?.[1];
    out.push({ name, value, unit });
  }
  return out;
}

/**
 * Leituras REAIS da bancada (Web Serial). Mesmo nome estável da nuvem
 * (`A0`, `out.D4`, `in.D8`, `estop`), com prefixo e unidade; qualidade do
 * próprio conversor (saturado = incerto).
 */
export function benchSnapshotToPublished(
  config: BenchConfig,
  snapshot: BenchSnapshot,
): PublishedTagValue[] {
  return snapshotToCloudReadings(config, snapshot).map((r) => ({
    name: `${BENCH_TAG_PREFIX}.${r.metric}`,
    value: r.metric.startsWith("A") ? r.value : r.value === 1,
    unit: r.unit,
    quality: r.quality,
  }));
}
