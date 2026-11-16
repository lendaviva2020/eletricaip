import { describe, expect, it } from "vitest";
import {
  buildProcessPlantLayout,
  classifyProcessEquipment,
  isaInstrumentLetters,
} from "@/lib/scada/process-classifier";

describe("classifyProcessEquipment", () => {
  it.each([
    ["Rosca Transportadora 01", "motor", "screw_conveyor"],
    ["Elevador de Canecas EL-02", "motor", "bucket_elevator"],
    ["Exaustor do Secador", "motor", "exhaust_fan"],
    ["Condensador evaporativo", "motor", "condenser"],
    ["Bomba de óleo bruto", "motor", "pump"],
    ["Redler de farelo", "motor", "chain_conveyor"],
    ["Moinho de martelos", "motor", "mill"],
    ["Prensa expeller", "motor", "press"],
    ["Torre de resfriamento", "motor", "cooling_tower"],
    ["Tanque de óleo", "load", "tank"],
  ])("'%s' (%s) → %s", (name, catalogType, kind) => {
    expect(classifyProcessEquipment({ id: "x", name, catalogType }).kind).toBe(kind);
  });

  it("motor sem aplicação identificável continua motor genérico (nada inventado)", () => {
    const c = classifyProcessEquipment({ id: "m1", name: "M1", tag: "M1", catalogType: "motor" });
    expect(c.kind).toBe("motor");
    expect(c.source).toBe("catalog");
  });

  it("disjuntor que cita a carga continua sendo manobra/proteção", () => {
    const c = classifyProcessEquipment({
      id: "q1",
      name: "Disjuntor da Rosca RT-01",
      catalogType: "breaker",
    });
    expect(c.kind).toBe("switchgear");
    expect(c.area).toBeNull();
  });

  it("transformador TR-01 não é confundido com outro tipo", () => {
    expect(
      classifyProcessEquipment({ id: "t", name: "TR-01", catalogType: "transformer" }).kind,
    ).toBe("transformer");
  });

  it("sensores viram instrumentos ISA", () => {
    expect(classifyProcessEquipment({ id: "s", name: "B1", catalogType: "level" }).kind).toBe(
      "instrument",
    );
    expect(isaInstrumentLetters("level")).toBe("LT");
    expect(isaInstrumentLetters("pt100")).toBe("TT");
  });
});

describe("buildProcessPlantLayout", () => {
  it("agrupa por área na ordem do fluxo e separa manobra/instrumentos", () => {
    const layout = buildProcessPlantLayout([
      { id: "1", tag: "B-02", name: "Bomba de óleo", catalogType: "motor" },
      { id: "2", tag: "RT-10", name: "Rosca 10", catalogType: "motor" },
      { id: "3", tag: "RT-2", name: "Rosca 2", catalogType: "motor" },
      { id: "4", tag: "Q1", name: "Q1", catalogType: "breaker" },
      { id: "5", tag: "LT-01", name: "Nível", catalogType: "level" },
      { id: "6", tag: "TR-01", name: "Trafo", catalogType: "transformer" },
    ]);
    expect(layout.areas.map((a) => a.area)).toEqual(["transport", "utilities", "energy"]);
    expect(layout.areas[0].items.map((i) => i.equipment.tag)).toEqual(["RT-2", "RT-10"]);
    expect(layout.switchgearCount).toBe(1);
    expect(layout.instruments).toHaveLength(1);
  });
});
