import { beforeEach, describe, expect, it } from "vitest";
import { fbdSnapshotToTags, publishFbdToScada } from "@/lib/fbd/scada-bridge";
import { useProjectStore } from "@/lib/project-store";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";

describe("ponte FBD → SCADA/telemetria", () => {
  beforeEach(() => {
    useProjectStore.setState({ tags: {} });
    useDigitalTwinStore.setState({ telemetryBuffers: {}, lastRealtimeUpdate: null });
  });

  it("mapeia saídas e entradas para tags FBD.<instância>.<pino>", () => {
    const tags = fbdSnapshotToTags({
      outputs: { T1: { Q: true, ET: 300 }, ADD1: { OUT: 42.5 } },
      inputs: { START: true },
    });
    expect(tags["FBD.T1.Q"]).toBe(true);
    expect(tags["FBD.T1.ET"]).toBe(300);
    expect(tags["FBD.ADD1.OUT"]).toBe(42.5);
    expect(tags["FBD.IN.START"]).toBe(true);
  });

  it("publica nas tags globais do projeto e no feed de telemetria", () => {
    publishFbdToScada({
      outputs: { MOTOR: { Q: true }, T1: { ET: 150 } },
      inputs: { START: false },
    });

    const tags = useProjectStore.getState().tags;
    expect(tags["FBD.MOTOR.Q"]).toBe(true);
    expect(tags["FBD.T1.ET"]).toBe(150);
    expect(tags["FBD.IN.START"]).toBe(false);

    const buffers = useDigitalTwinStore.getState().telemetryBuffers;
    // Booleanos viram 0/1 no feed; números passam direto.
    expect(buffers["FBD.MOTOR.Q"].samples.at(-1)?.value).toBe(1);
    expect(buffers["FBD.T1.ET"].samples.at(-1)?.value).toBe(150);
    expect(buffers["FBD.IN.START"].samples.at(-1)?.value).toBe(0);
    expect(useDigitalTwinStore.getState().lastRealtimeUpdate).not.toBeNull();
  });

  it("não publica nada quando o snapshot está vazio", () => {
    publishFbdToScada({ outputs: {}, inputs: {} });
    expect(useProjectStore.getState().tags).toEqual({});
    expect(useDigitalTwinStore.getState().telemetryBuffers).toEqual({});
  });
});
