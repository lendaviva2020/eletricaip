/**
 * Ponte Motor IEC → SCADA/Telemetria.
 *
 * A cada scan do motor FBD, publica as saídas dos blocos (e entradas) como
 * tags globais do projeto (`FBD.<instância>.<pino>`) via `applyTick` — o
 * mesmo caminho usado pelo runtime SCADA — e empurra amostras para o feed
 * de telemetria do Digital Twin (origem "local", sem gravar no banco).
 *
 * O editor FBD apenas representa o modelo; esta ponte é somente leitura do
 * estado do runtime — nunca escreve de volta no motor.
 */
import { useProjectStore } from "@/lib/project-store";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import type { FbdValue } from "./engine";

export interface FbdScadaSnapshot {
  readonly outputs: Readonly<Record<string, Readonly<Record<string, FbdValue>>>>;
  readonly inputs: Readonly<Record<string, boolean>>;
}

/** Converte o estado ao vivo do runtime em tags globais do SCADA. */
export function fbdSnapshotToTags(snapshot: FbdScadaSnapshot): Record<string, number | boolean | string> {
  const tags: Record<string, number | boolean | string> = {};
  for (const [instance, pins] of Object.entries(snapshot.outputs)) {
    for (const [pin, value] of Object.entries(pins)) {
      tags[`FBD.${instance}.${pin}`] = value;
    }
  }
  for (const [variable, value] of Object.entries(snapshot.inputs)) {
    tags[`FBD.IN.${variable}`] = value;
  }
  return tags;
}

/**
 * Publica o estado do motor FBD nas tags globais (SCADA) e no feed de
 * telemetria do Digital Twin. Apenas valores numéricos/booleanos viram
 * amostras de telemetria; todos viram tags.
 */
export function publishFbdToScada(snapshot: FbdScadaSnapshot): void {
  const tags = fbdSnapshotToTags(snapshot);
  if (Object.keys(tags).length === 0) return;

  useProjectStore.getState().applyTick({ tags, ts: Date.now() });

  const twin = useDigitalTwinStore.getState();
  for (const [tag, value] of Object.entries(tags)) {
    if (typeof value === "number") {
      twin.pushTelemetry(tag, value, "local");
    } else if (typeof value === "boolean") {
      twin.pushTelemetry(tag, value ? 1 : 0, "local");
    }
  }
}
