import { describe, expect, it } from "vitest";
import { EQUIPMENT_LIBRARY, MEDIA, equipmentDef, searchLibrary } from "@/lib/hmi/process-library";
import { parseHmiCode, serializeHmiDoc } from "@/lib/hmi/hmi-dsl";
import { HmiDocSchema, commonMedium, nextId, validateHmiDoc } from "@/lib/hmi/hmi-model";
import {
  applyCommand,
  initialRuntime,
  runtimeTags,
  stepRuntime,
  type HmiRuntimeState,
} from "@/lib/hmi/hmi-runtime";

const PLANT = `tela "Fábrica de óleo e farinha"
# recepção
equipamento MG1 moega "Moega de recepção" em 40,40
equipamento RT1 rosca "Rosca alimentadora" em 220,80 tag RT_101
equipamento CZ1 cozinhador "Cozinhador" em 480,80
equipamento PR1 prensa "Prensa" em 760,80
equipamento TO1 tanque_oleo "Tanque de óleo" em 800,260
equipamento CA1 caldeira em 420,300

ligar MG1.saida -> RT1.entrada farinha
ligar RT1.saida -> CZ1.entrada produto
ligar CZ1.saida -> PR1.entrada
ligar PR1.oleo -> TO1.entrada oleo
ligar CA1.vapor -> CZ1.vapor vapor
`;

function ok(r: ReturnType<typeof applyCommand>): HmiRuntimeState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe("biblioteca de equipamentos HMI", () => {
  it("tem os equipamentos pedidos, com portas únicas e meios válidos", () => {
    for (const t of [
      "rosca",
      "motor",
      "exaustor",
      "moega",
      "tanque",
      "tanque_oleo",
      "caldeira",
      "tanque_condensado",
      "rede_esgoto",
      "valvula_motorizada",
      "bomba",
    ]) {
      expect(equipmentDef(t), t).toBeDefined();
    }
    expect(EQUIPMENT_LIBRARY.length).toBeGreaterThanOrEqual(45);
    for (const d of EQUIPMENT_LIBRARY) {
      const ids = d.ports.map((p) => p.id);
      expect(new Set(ids).size, d.type).toBe(ids.length);
      for (const p of d.ports) {
        expect(p.at).toBeGreaterThanOrEqual(0);
        expect(p.at).toBeLessThanOrEqual(1);
        for (const m of p.media) expect(MEDIA).toContain(m);
      }
    }
  });

  it("busca sem acento", () => {
    expect(searchLibrary("calderia").length).toBe(0);
    expect(searchLibrary("caldeira")[0].type).toBe("caldeira");
    expect(searchLibrary("oleo").some((d) => d.type === "tanque_oleo")).toBe(true);
  });
});

describe("código da tela (DSL)", () => {
  it("lê o código, decide o meio pelas portas e volta ao mesmo texto", () => {
    const r = parseHmiCode(PLANT);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    const doc = r.doc!;
    expect(doc.title).toBe("Fábrica de óleo e farinha");
    expect(doc.equipment).toHaveLength(6);
    expect(doc.equipment.find((e) => e.id === "RT1")?.tag).toBe("RT_101");
    expect(doc.links.find((l) => l.from.equipment === "CZ1")?.medium).toBe("produto");
    const again = parseHmiCode(serializeHmiDoc(doc));
    expect(again.doc).toEqual(doc);
  });

  it("aponta a linha do erro e recusa tipo, porta ou meio inválido", () => {
    const r = parseHmiCode('tela "x"\nequipamento A1 foguete em 0,0\n');
    expect(r.doc).toBeNull();
    expect(r.issues[0]).toMatchObject({ level: "error", line: 2 });

    const bad = parseHmiCode(
      "equipamento A1 bomba em 0,0\nequipamento B1 tanque em 200,0\nligar A1.saida -> B1.entrada vapor\n",
    );
    expect(bad.doc).toBeNull();
    expect(bad.issues.some((i) => /vapor não é aceito/.test(i.message))).toBe(true);

    const port = parseHmiCode(
      "equipamento A1 bomba em 0,0\nequipamento B1 tanque em 200,0\nligar A1.xpto -> B1.entrada\n",
    );
    expect(port.issues.some((i) => /porta inexistente/.test(i.message))).toBe(true);
  });

  it("limites contra código abusivo", () => {
    const huge = "#".repeat(70_000);
    expect(parseHmiCode(huge).doc).toBeNull();
    expect(
      HmiDocSchema.safeParse({ equipment: [{ id: "1x", type: "rosca", x: 0, y: 0 }] }).success,
    ).toBe(false);
  });

  it("valida sentido e meio comum; gera ids livres", () => {
    expect(commonMedium("bomba", "saida", "tanque", "entrada")).toBe("agua");
    expect(commonMedium("bomba", "saida", "caldeira", "vapor")).toBeNull();
    expect(nextId("RT", new Set(["RT1", "RT2"]))).toBe("RT3");
    const doc = parseHmiCode(
      "equipamento A1 bomba em 0,0\nequipamento B1 tanque em 200,0\nligar B1.entrada -> A1.entrada agua\n",
    ).issues;
    expect(doc.some((i) => i.level === "warning" && /sentido/.test(i.message))).toBe(true);
    expect(validateHmiDoc({ version: 1, title: "", equipment: [], links: [] })).toEqual([]);
  });
});

describe("operação simulada", () => {
  const doc = parseHmiCode(PLANT).doc!;

  it("sem produto na moega a rosca gira em vazio; com produto, transporta e o óleo enche o tanque", () => {
    let s = initialRuntime(doc);
    for (const id of ["RT1", "CZ1", "PR1"]) s = ok(applyCommand(doc, s, { kind: "start", id }));
    expect(s.equipment.RT1.running).toBe(true);
    const l1 = doc.links.find((l) => l.from.equipment === "MG1")!;
    const l2 = doc.links.find((l) => l.from.equipment === "RT1")!;
    expect(s.flowing[l1.id]).toBeFalsy();
    expect(s.flowing[l2.id]).toBeFalsy();

    s = ok(applyCommand(doc, s, { kind: "setLevel", id: "MG1", pct: 80 }));
    expect(s.flowing[l1.id]).toBe(true);
    expect(s.flowing[l2.id]).toBe(true);
    const oleo = doc.links.find((l) => l.to.equipment === "TO1")!;
    expect(s.flowing[oleo.id]).toBe(true);

    for (let i = 0; i < 10; i++) s = stepRuntime(doc, s, 1);
    expect(s.equipment.TO1.levelPct).toBeGreaterThan(0);
    expect(s.equipment.MG1.levelPct).toBeLessThan(80);
  });

  it("reversão só parado; parada geral desliga tudo e o rearme não religa", () => {
    let s = initialRuntime(doc);
    s = ok(applyCommand(doc, s, { kind: "start", id: "RT1" }));
    const r = applyCommand(doc, s, { kind: "toggleReverse", id: "RT1" });
    expect(r.ok).toBe(false);
    s = ok(applyCommand(doc, s, { kind: "stop", id: "RT1" }));
    s = ok(applyCommand(doc, s, { kind: "toggleReverse", id: "RT1" }));
    expect(s.equipment.RT1.reverse).toBe(true);
    s = ok(applyCommand(doc, s, { kind: "start", id: "RT1" }));
    s = ok(applyCommand(doc, s, { kind: "estop" }));
    expect(Object.values(s.equipment).some((e) => e.running)).toBe(false);
    expect(applyCommand(doc, s, { kind: "start", id: "RT1" }).ok).toBe(false);
    s = ok(applyCommand(doc, s, { kind: "reset" }));
    expect(s.equipment.RT1.running).toBe(false);
    expect(applyCommand(doc, s, { kind: "start", id: "MG1" }).ok).toBe(false);
  });

  it("velocidade limitada e tags publicadas com unidade", () => {
    let s = initialRuntime(doc);
    s = ok(applyCommand(doc, s, { kind: "speed", id: "RT1", pct: 250 }));
    expect(s.equipment.RT1.speedPct).toBe(100);
    const tags = runtimeTags(doc, s);
    expect(tags.find((t) => t.name === "RT_101.VELOCIDADE")).toMatchObject({
      value: 100,
      unit: "%",
    });
    expect(tags.find((t) => t.name === "MG1.NIVEL")?.unit).toBe("%");
    expect(stepRuntime(doc, s, Number.NaN)).toBe(s);
  });
});

describe("desenho e portas", () => {
  it("todo equipamento da biblioteca tem desenho próprio", async () => {
    const { SYMBOL_TYPES } = await import("@/components/hmi/process-symbols");
    for (const d of EQUIPMENT_LIBRARY) expect(SYMBOL_TYPES, d.type).toContain(d.type);
  });

  it("portas giram junto com o equipamento", async () => {
    const { rotatePort } = await import("@/components/hmi/hmi-process-studio");
    expect(rotatePort("left", 0.3, 0)).toEqual({ side: "left", at: 0.3 });
    expect(rotatePort("left", 0.3, 90)).toEqual({ side: "top", at: 0.7 });
    expect(rotatePort("top", 0.3, 90)).toEqual({ side: "right", at: 0.3 });
    const back = rotatePort("right", 0.25, 360);
    expect(back.side).toBe("right");
    expect(back.at).toBeCloseTo(0.25);
  });
});
