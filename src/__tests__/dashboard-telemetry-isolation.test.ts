import { describe, it, expect } from "vitest";
import { getDigitalTwinDemoMappings } from "@/lib/seed-digital-twin";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";

describe("Etapa 3.1: Saneamento de Telemetria e Ausência de Mocks Artificiais", () => {
  it("modo demo do digital twin carrega mappings isolados com flag explícito isDemoData", () => {
    const mappings = getDigitalTwinDemoMappings();
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings[0].equipmentLabel).toContain("(demonstração)");

    useDigitalTwinStore.getState().setMappings(mappings, { isDemo: true });
    expect(useDigitalTwinStore.getState().isDemoData).toBe(true);

    useDigitalTwinStore.getState().setMappings([], { isDemo: false });
    expect(useDigitalTwinStore.getState().isDemoData).toBe(false);
  });

  it("telemetria ausente em digital-twin-store não inventa valores e mantém buffers vazios", () => {
    const buffers = useDigitalTwinStore.getState().telemetryBuffers;
    expect(buffers["TAG_INEXISTENTE_TESTE"]).toBeUndefined();
  });

  it("pushTelemetry registra amostras com timestamp e origem rastreável", () => {
    useDigitalTwinStore.getState().pushTelemetry("MOTOR_TEMP", 72.5, "scada");
    const buffer = useDigitalTwinStore.getState().telemetryBuffers["MOTOR_TEMP"];
    expect(buffer).toBeDefined();
    expect(buffer.samples.length).toBeGreaterThanOrEqual(1);
    const lastSample = buffer.samples[buffer.samples.length - 1];
    expect(lastSample.value).toBe(72.5);
    expect(lastSample.origin).toBe("scada");
  });

  it("modo what-if de simulação marca explicitamente whatIfEnabled na store", () => {
    useDigitalTwinStore.getState().setWhatIfEnabled(true);
    expect(useDigitalTwinStore.getState().whatIfEnabled).toBe(true);

    useDigitalTwinStore.getState().setWhatIfEnabled(false);
    expect(useDigitalTwinStore.getState().whatIfEnabled).toBe(false);
  });
});
