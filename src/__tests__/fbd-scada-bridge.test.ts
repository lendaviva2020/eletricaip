import { beforeEach, describe, expect, it } from "vitest";
import { fbdSnapshotToTags, publishFbdToScada } from "@/lib/fbd/scada-bridge";
import { useProjectStore } from "@/lib/project-store";

describe("ponte FBD → SCADA", () => {
  beforeEach(() => {
    useProjectStore.setState({ tags: {} });
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

  it("publica nas tags globais SCADA do projeto", () => {
    publishFbdToScada({
      outputs: { MOTOR: { Q: true }, T1: { ET: 150 } },
      inputs: { START: false },
    });

    const tags = useProjectStore.getState().tags;
    expect(tags["FBD.MOTOR.Q"]).toBe(true);
    expect(tags["FBD.T1.ET"]).toBe(150);
    expect(tags["FBD.IN.START"]).toBe(false);
  });

  it("não publica nada quando o snapshot está vazio", () => {
    publishFbdToScada({ outputs: {}, inputs: {} });
    expect(useProjectStore.getState().tags).toEqual({});
  });
});
