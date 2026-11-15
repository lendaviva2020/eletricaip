import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "@/lib/compact-studio/domain";
import { CompactExecutionEngine } from "@/lib/compact-studio/runtime";
import { validateCompactProgram } from "@/lib/compact-studio/domain/validation";
import {
  UF_PAGE_ID,
  syncMotorLogicFromUnifilar,
} from "@/lib/compact-studio/integration/unifilar-motor-program";
import { buildMccDemoDiagram, MCC_DEMO_MOTORS } from "@/lib/simulation/mcc-demo-plant";

const NOW = "2026-01-01T00:00:00.000Z";
const doc = buildMccDemoDiagram(NOW);

describe("eletric Studio ← unifilar: lógica de comando de motores", () => {
  const base = {
    ...createEmptyCompactProgramModel({ nowIso: NOW }),
    hardware: {
      ...createEmptyCompactProgramModel().hardware,
      maxDigitalInputs: 64,
      maxDigitalOutputs: 32,
    },
  };
  const { model, motorsGenerated, warnings } = syncMotorLogicFromUnifilar(base, doc, NOW);

  it("gera um circuito por motor do unifilar e compila", () => {
    expect(motorsGenerated).toBe(MCC_DEMO_MOTORS.length);
    expect(model.ioSymbols.filter((s) => s.ioKind === "DO")).toHaveLength(MCC_DEMO_MOTORS.length);
    expect(warnings).toEqual([]);
    const engine = new CompactExecutionEngine(model);
    expect(engine.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(engine.compileOk).toBe(true);
    const report = validateCompactProgram(model);
    expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("partida sela, parada desliga, térmico desliga e bloqueia, emergência desliga", () => {
    const engine = new CompactExecutionEngine(model);
    engine.step(20);
    expect(engine.step(20).variables.K_MG_201).toBe(false);
    engine.setInput("PARTIDA_MG_201", true);
    expect(engine.step(20).variables.K_MG_201).toBe(true);
    engine.setInput("PARTIDA_MG_201", false);
    expect(engine.step(20).variables.K_MG_201).toBe(true); // selo
    engine.setInput("PARADA_MG_201", false);
    expect(engine.step(20).variables.K_MG_201).toBe(false);
    engine.setInput("PARADA_MG_201", true);

    engine.setInput("PARTIDA_MG_201", true);
    engine.step(20);
    engine.setInput("PARTIDA_MG_201", false);
    engine.setInput("TERMICO_MG_201", false); // relé disparou
    expect(engine.step(20).variables.K_MG_201).toBe(false);
    engine.setInput("PARTIDA_MG_201", true); // partida com térmico aberto: reset dominante
    expect(engine.step(20).variables.K_MG_201).toBe(false);
    engine.setInput("TERMICO_MG_201", true);
    engine.setInput("PARTIDA_MG_201", false);

    engine.setInput("PARTIDA_RT_203", true);
    engine.step(20);
    engine.setInput("PARTIDA_RT_203", false);
    engine.setInput("EMERG_OK", false);
    expect(engine.step(20).variables.K_RT_203).toBe(false);
  });

  it("é idempotente e preserva páginas e endereços do usuário", () => {
    const withUser = {
      ...base,
      ioSymbols: [
        {
          id: "user1",
          ioKind: "DI" as const,
          address: "I1",
          symbolicName: "SENSOR_X",
          signalType: "BOOL" as const,
          comment: "",
          retentive: false,
          initialValue: false,
        },
      ],
    };
    const first = syncMotorLogicFromUnifilar(withUser, doc, NOW).model;
    const second = syncMotorLogicFromUnifilar(first, doc, NOW).model;
    expect(second).toEqual(first);
    expect(first.ioSymbols.find((s) => s.id === "user1")?.address).toBe("I1");
    const generatedAddrs = first.ioSymbols
      .filter((s) => s.id.startsWith("uf_"))
      .map((s) => s.address);
    expect(generatedAddrs).not.toContain("I1");
    expect(first.pages.some((p) => p.id === "page-1")).toBe(true);
    expect(first.pages.some((p) => p.id === UF_PAGE_ID)).toBe(true);
  });

  it("acusa falta de entradas no hardware", () => {
    const small = {
      ...base,
      hardware: { ...base.hardware, maxDigitalInputs: 8, maxDigitalOutputs: 4 },
    };
    const r = syncMotorLogicFromUnifilar(small, doc, NOW);
    expect(r.warnings.some((w) => w.includes("entradas digitais"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("saídas digitais"))).toBe(true);
  });
});
