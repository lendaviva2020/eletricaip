/**
 * SCADA Fase 0 — nada exibido como leitura real pode ser inventado.
 * Guarda as correções de 2026-11-17: tick sem jitter em projeto de cliente,
 * sem alarme automático, categoria pelo tipo real, buffer com teto, envio do
 * histórico em lotes aceitos pelo servidor e resumo honesto dos drivers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestMock = vi.fn();
vi.mock("@/lib/scada/scada.functions", () => ({
  ingestTagSamplesBatch: (args: unknown) => ingestMock(args),
}));
vi.mock("../lib/scada/scada.functions", () => ({
  ingestTagSamplesBatch: (args: unknown) => ingestMock(args),
}));

import {
  MAX_BUFFERED_SAMPLES,
  MAX_FLUSH_BATCH,
  capHistoricalBuffer,
  useScadaStore,
} from "@/lib/scada/scada-store";
import { NO_FIELD_DRIVERS, isRotatingEquipment, summarizeDrivers } from "@/lib/scada/types";
import type { HistoricalSample, ScadaTagDefinition } from "@/lib/scada/types";
import { canonicalToScadaTelemetry, scadaCategoryOf } from "@/lib/scada/canonical-bridge";
import type { CanonicalEquipment } from "@/lib/model/unified-schema";

function sample(i: number): HistoricalSample {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    tagName: "M1.CURRENT",
    value: i,
    quality: "GOOD",
    source: "MODBUS_TCP",
    unit: "A",
    sampledAt: new Date(1_700_000_000_000 + i).toISOString(),
    receivedAt: new Date(1_700_000_000_000 + i).toISOString(),
    sequenceNumber: i,
  };
}

function equipment(catalogType: string, category: CanonicalEquipment["category"]) {
  return {
    id: `EQ-${catalogType}`,
    tagCode: "X1",
    displayName: catalogType,
    catalogType,
    category,
    phases: "3F",
    terminals: [],
    specs: { powerKw: 7.5, voltageV: 380, nominalCurrentA: 14.2, powerFactor: 0.85 },
  } as unknown as CanonicalEquipment;
}

const customerTag: ScadaTagDefinition = {
  id: "t1",
  name: "M1.CURRENT",
  description: "Corrente M1",
  dataType: "REAL",
  unit: "A",
  scaleMin: 0,
  scaleMax: 50,
  value: 12.5,
  quality: "NOT_CONNECTED",
  driver: "INTERNAL_RUNTIME",
  scanRateMs: 100,
  lastUpdated: 0,
  forced: false,
  sourceAddress: "DB1",
  isSimulated: false,
};

describe("SCADA Fase 0 — integridade dos dados", () => {
  beforeEach(() => {
    ingestMock.mockReset();
    useScadaStore.getState().clearProjectContext();
  });

  it("projeto de cliente: o tick não altera valores nem cria alarmes automáticos", () => {
    useScadaStore.getState().setProjectContext({
      projectId: "11111111-1111-4111-8111-111111111111",
      tenantId: "tenant-a",
      projectName: "Cliente",
      isDemo: false,
      tags: { [customerTag.name]: { ...customerTag } },
    });
    for (let i = 0; i < 20; i++) useScadaStore.getState().tickSimulation();
    const st = useScadaStore.getState();
    expect(st.tags[customerTag.name].value).toBe(12.5);
    expect(st.alarms).toHaveLength(0);
    expect(st.gatewayStatus).toEqual(NO_FIELD_DRIVERS);
  });

  it("buffer do histórico tem teto e mantém as amostras mais novas", () => {
    const many = Array.from({ length: MAX_BUFFERED_SAMPLES + 50 }, (_, i) => sample(i));
    const capped = capHistoricalBuffer(many);
    expect(capped).toHaveLength(MAX_BUFFERED_SAMPLES);
    expect(capped[capped.length - 1].value).toBe(MAX_BUFFERED_SAMPLES + 49);
  });

  it("envio do histórico respeita o lote do servidor e devolve à fila em falha", async () => {
    useScadaStore.getState().setProjectContext({
      projectId: "11111111-1111-4111-8111-111111111111",
      tenantId: "tenant-a",
      projectName: "Cliente",
      isDemo: false,
    });
    useScadaStore.setState({
      bufferedHistoricalSamples: Array.from({ length: MAX_FLUSH_BATCH + 20 }, (_, i) => sample(i)),
    });

    ingestMock.mockResolvedValueOnce({ inserted: MAX_FLUSH_BATCH });
    await expect(useScadaStore.getState().flushHistoricalSamples()).resolves.toBe(MAX_FLUSH_BATCH);
    const sent = ingestMock.mock.calls[0][0] as {
      data: { samples: { source: string; unit?: string }[] };
    };
    expect(sent.data.samples).toHaveLength(MAX_FLUSH_BATCH);
    expect(sent.data.samples[0]).toMatchObject({ source: "MODBUS_TCP", unit: "A" });
    expect(useScadaStore.getState().bufferedHistoricalSamples).toHaveLength(20);

    ingestMock.mockRejectedValueOnce(new Error("rede"));
    await expect(useScadaStore.getState().flushHistoricalSamples()).resolves.toBe(0);
    expect(useScadaStore.getState().bufferedHistoricalSamples).toHaveLength(20);
  });

  it("demonstração nunca grava no histórico do banco", async () => {
    useScadaStore.getState().resetToInitialState();
    useScadaStore.setState({ bufferedHistoricalSamples: [sample(1)] });
    await expect(useScadaStore.getState().flushHistoricalSamples()).resolves.toBe(0);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("categoria vem do tipo real (motor não vira bomba)", () => {
    expect(scadaCategoryOf(equipment("motor", "load"))).toBe("MOTOR");
    expect(scadaCategoryOf(equipment("vfd", "drive"))).toBe("PANEL");
    expect(scadaCategoryOf(equipment("transformer", "source"))).toBe("TRANSFORMER");
    expect(scadaCategoryOf(equipment("pt100", "instrumentation"))).toBe("SENSOR");
    expect(isRotatingEquipment("MOTOR")).toBe(true);
    expect(isRotatingEquipment("PANEL")).toBe(false);
  });

  it("telemetria nasce sem leitura: dados de placa só em `nominal`", () => {
    const t = canonicalToScadaTelemetry(equipment("motor", "load"), []);
    expect(t.currentA).toBe(0);
    expect(t.voltageV).toBe(0);
    expect(t.frequencyHz).toBe(0);
    expect(t.lastMaintenance).toBe("—");
    expect(t.nominal).toEqual({ voltageV: 380, currentA: 14.2, powerFactor: 0.85 });
  });

  it("resumo dos drivers não afirma conexão inexistente", () => {
    expect(summarizeDrivers(NO_FIELD_DRIVERS, false).label).toBe("Sem driver de campo");
    expect(summarizeDrivers(NO_FIELD_DRIVERS, true).label).toBe("Simulação");
  });
});
