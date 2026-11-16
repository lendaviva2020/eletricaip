/**
 * Montagem dos lotes de telemetria REAL da bancada para a nuvem (puro, testado).
 *
 * Para não encher o banco com valores repetidos (uma leitura a cada 250 ms
 * por canal daria milhões de linhas por dia), cada grandeza só é enviada
 * quando:
 *  - muda além da banda morta (analógica: 1 % do fundo de escala; digital:
 *    qualquer mudança), ou
 *  - passou o batimento de 60 s desde o último envio (prova de vida: um valor
 *    parado não some da nuvem).
 * Nada é enviado com telemetria velha ou desconectado: não existe valor
 * presumido. Canal analógico sem sensor configurado não vai para a nuvem
 * (o valor bruto não tem unidade física).
 */
import { SENSOR_PRESETS, type BenchConfig, type EngineeringReading } from "./bench-config";
import { pinBit } from "./serial/protocol";

export const BENCH_METRIC_PATTERN = /^[A-Za-z0-9_.:-]{1,48}$/;
export const BENCH_DEVICE_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,64}$/;
export const MAX_BENCH_BATCH = 64;
export const BENCH_HEARTBEAT_MS = 60_000;
/** Intervalo mínimo entre lotes enviados ao servidor. */
export const BENCH_SEND_INTERVAL_MS = 2_000;

export type BenchIngestErrorCode =
  | "plan_required"
  | "device_limit"
  | "forbidden"
  | "no_tenant"
  | "unauthorized"
  | "rate_limited"
  | "bad_input"
  | "not_enabled"
  | "server_error"
  | "network";

/** Erros que não se resolvem tentando de novo: a sincronização para. */
export const FATAL_INGEST_ERRORS: ReadonlySet<BenchIngestErrorCode> = new Set([
  "plan_required",
  "device_limit",
  "forbidden",
  "no_tenant",
  "unauthorized",
  "bad_input",
  "not_enabled",
]);

const KNOWN_DB_ERRORS: readonly BenchIngestErrorCode[] = [
  "plan_required",
  "device_limit",
  "forbidden",
  "no_tenant",
  "unauthorized",
];

/** Traduz a exceção do banco num código estável (sem vazar detalhes internos). */
export function mapBenchIngestError(message: string): BenchIngestErrorCode {
  for (const code of KNOWN_DB_ERRORS) {
    if (message.includes(code)) return code;
  }
  if (/bad_(metric|value|quality|unit|readings|device)/.test(message)) return "bad_input";
  // Migration ainda não aplicada: função inexistente.
  if (/ingest_bench_telemetry|does not exist|PGRST202/.test(message)) return "not_enabled";
  return "server_error";
}

export interface CloudReading {
  readonly metric: string;
  readonly value: number;
  readonly unit?: string;
  readonly quality: "GOOD" | "UNCERTAIN" | "BAD";
}

export interface SentRecord {
  readonly value: number;
  readonly at: number;
}

export interface BenchSnapshot {
  readonly readings: readonly EngineeringReading[];
  readonly inputsMask: number;
  readonly outputsMask: number;
  readonly estop: boolean;
}

/** Todas as grandezas atuais da bancada, já com nome estável na nuvem. */
export function snapshotToCloudReadings(config: BenchConfig, snap: BenchSnapshot): CloudReading[] {
  const out: CloudReading[] = [];
  for (const r of snap.readings) {
    if (r.value === null || r.unit === "contagens") continue;
    out.push({
      metric: `A${r.channel}`,
      value: r.value,
      unit: r.unit,
      quality: r.saturated ? "UNCERTAIN" : "GOOD",
    });
  }
  for (const o of config.outputs) {
    out.push({
      metric: `out.D${o.pin}`,
      value: pinBit(snap.outputsMask, o.pin) ? 1 : 0,
      quality: "GOOD",
    });
  }
  for (const i of config.inputs) {
    // INPUT_PULLUP: contato fechado = nível baixo = ativo (1 na nuvem).
    out.push({
      metric: `in.D${i.pin}`,
      value: pinBit(snap.inputsMask, i.pin) ? 0 : 1,
      quality: "GOOD",
    });
  }
  out.push({ metric: "estop", value: snap.estop ? 1 : 0, quality: "GOOD" });
  return out;
}

function deadbandFor(config: BenchConfig, metric: string): number {
  const m = /^A(\d)$/.exec(metric);
  if (!m) return 0; // digital: qualquer mudança
  const ch = config.analog.find((a) => a.channel === Number(m[1]));
  if (!ch) return 0;
  return Math.max(SENSOR_PRESETS[ch.sensor].fullScale * 0.01, 0.001);
}

/**
 * Seleciona o que enviar agora. Devolve o lote e o novo registro de "último
 * enviado" (aplicar só depois que o servidor confirmar).
 */
export function selectReadingsToSend(
  config: BenchConfig,
  current: readonly CloudReading[],
  lastSent: ReadonlyMap<string, SentRecord>,
  now: number,
): { batch: CloudReading[]; next: Map<string, SentRecord> } {
  const batch: CloudReading[] = [];
  const next = new Map(lastSent);
  for (const r of current) {
    const prev = lastSent.get(r.metric);
    const changed = !prev || Math.abs(r.value - prev.value) > deadbandFor(config, r.metric);
    const stale = !prev || now - prev.at >= BENCH_HEARTBEAT_MS;
    if (changed || stale) {
      batch.push(r);
      next.set(r.metric, { value: r.value, at: now });
      if (batch.length >= MAX_BENCH_BATCH) break;
    }
  }
  return { batch, next };
}

/** Identificador estável do dispositivo na nuvem (por projeto ou bancada de exemplo). */
export function benchDeviceExternalId(projectId: string | null, usingExample: boolean): string {
  if (usingExample || !projectId) return "arduino-uno-exemplo";
  const clean = projectId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12)
    .toLowerCase();
  return clean.length >= 3 ? `arduino-uno-${clean}` : "arduino-uno-exemplo";
}
