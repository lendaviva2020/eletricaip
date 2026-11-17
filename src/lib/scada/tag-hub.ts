/**
 * Base ÚNICA de tags do projeto (Fase 1).
 *
 * A fonte da verdade é `useScadaStore.tags` (valor + qualidade + ORIGEM). Toda
 * fonte publica por aqui: script HMI e CCM (simulação), runtime do CLP,
 * bancada Arduino e IoT (dispositivo físico). O editor HMI continua lendo
 * `useProjectStore.tags`, que passa a ser só um ESPELHO dos valores — assim
 * um tag mostra o mesmo valor no SCADA, no editor HMI e no modo Alarmes.
 */
import type { ProtocolDriver, ScadaTagDefinition } from "./types";
import { useScadaStore, type PublishedTagValue } from "./scada-store";

type Scalar = number | boolean | string;

let mirror: ((values: Record<string, Scalar>) => void) | null = null;

/** O editor HMI registra como receber o espelho (evita import circular). */
export function registerHmiMirror(fn: ((values: Record<string, Scalar>) => void) | null): void {
  mirror = fn;
}

/**
 * Publica valores de uma fonte. `mirrorToHmi=false` quando quem chama já
 * gravou no editor HMI (ex.: o próprio applyTick).
 */
export function publishTags(
  source: ProtocolDriver,
  values: Record<string, Scalar> | readonly PublishedTagValue[],
  opts: { mirrorToHmi?: boolean } = {},
): void {
  const list: PublishedTagValue[] = Array.isArray(values)
    ? [...values]
    : Object.entries(values).map(([name, value]) => ({ name, value }));
  const clean = list.filter(
    (v) =>
      typeof v.name === "string" &&
      v.name.length > 0 &&
      (typeof v.value === "boolean" ||
        typeof v.value === "string" ||
        (typeof v.value === "number" && Number.isFinite(v.value))),
  );
  if (clean.length === 0) return;
  useScadaStore.getState().publishTags(source, clean);
  if (opts.mirrorToHmi !== false && mirror) {
    const out: Record<string, Scalar> = {};
    for (const v of clean) out[v.name] = v.value;
    mirror(out);
  }
}

export interface TagOrigin {
  source: ProtocolDriver | null;
  quality: ScadaTagDefinition["quality"] | null;
  isSimulated: boolean;
}

/** Origem do tag na base única (o que o editor HMI e os alarmes exibem). */
export function tagOrigin(name: string): TagOrigin {
  const t = useScadaStore.getState().tags[name];
  if (!t) return { source: null, quality: null, isSimulated: false };
  return { source: t.driver ?? null, quality: t.quality, isSimulated: Boolean(t.isSimulated) };
}

const SOURCE_LABEL: Record<ProtocolDriver, string> = {
  SIMULATION: "Simulação",
  INTERNAL_RUNTIME: "Runtime (simulado)",
  OPC_UA: "OPC UA",
  MODBUS_TCP: "Modbus TCP",
  MQTT: "MQTT",
  IOT: "Dispositivo físico",
  IMPORTED: "Importado",
};

export function sourceLabel(source: ProtocolDriver | null | undefined): string {
  return source ? SOURCE_LABEL[source] : "Sem fonte";
}
