import { describe, it, expect, beforeEach } from "vitest";
import {
  LibraryRegistry,
  IndustrialLibraryManager,
  SemVer,
} from "../libraries/library-manager";
import {
  registerIndustrialLibraries,
  FB_Overcurrent50_51,
  FB_TransformerThermalModel,
  FB_StarDeltaStarter,
  FB_AnalogInputScaling,
  FB_DualChannelEStop,
  IS_PHYSICAL_CONTROL_ALLOWED,
} from "../libraries/industrial-libraries";
import { IndustrialProject } from "../canonical/types";

describe("Milestone 2: Industrial Library Manager & 12 Libraries", () => {
  let registry: LibraryRegistry;
  let manager: IndustrialLibraryManager;

  beforeEach(() => {
    registry = LibraryRegistry.getInstance();
    registry.clear();
    registerIndustrialLibraries(registry);
    manager = new IndustrialLibraryManager(registry);
  });

  it("Semantic Versioning parser e checker funcionam com precisão", () => {
    expect(SemVer.satisfies("3.5.20.0", "^3.5.0")).toBe(true);
    expect(SemVer.satisfies("3.6.0.0", "^3.5.0")).toBe(true);
    expect(SemVer.satisfies("4.0.0.0", "^3.5.0")).toBe(false);
    expect(SemVer.satisfies("1.2.3", ">=1.0.0")).toBe(true);
    expect(SemVer.satisfies("0.9.0", ">=1.0.0")).toBe(false);
  });

  it("Resolve placeholders (#Standard, #SysTypes) dinamicamente para o controlador", () => {
    const mockProject = {
      controllers: [{ vendor: "CODESYS_VIRTUAL" }],
      libraryReferences: [
        { name: "#Standard", version: "3.5.20.0", isPlaceholder: true, category: "STANDARD" },
        { name: "#SysTypes", version: "3.5.20.0", isPlaceholder: true, category: "SYSTEM" },
        { name: "ElectricalProtection", version: "1.0.0", isPlaceholder: false, category: "APPLICATION" },
      ],
    } as unknown as IndustrialProject;

    const res = manager.resolveProjectLibraries(mockProject);
    expect(res.isSuccessful).toBe(true);
    expect(res.diagnostics.length).toBe(0);

    const resolvedStandard = res.resolved.find((r) => r.name === "#Standard");
    expect(resolvedStandard).toBeDefined();
    expect(resolvedStandard?.resolvedTo).toBe("EletricAi_Standard");

    const resolvedProtection = res.resolved.find((r) => r.name === "ElectricalProtection");
    expect(resolvedProtection).toBeDefined();
    expect(resolvedProtection?.effectiveVersion).toBe("1.0.0");
  });

  it("Detecta dependências circulares e emite diagnóstico de erro", () => {
    registry.register({
      id: "lib-circ-a",
      name: "LibA",
      vendor: "Test",
      version: "1.0.0",
      category: "USER",
      description: "A",
      dependencies: [{ name: "LibB", versionRange: "*" }],
      isPlaceholder: false,
      exportedSymbols: [],
    });

    registry.register({
      id: "lib-circ-b",
      name: "LibB",
      vendor: "Test",
      version: "1.0.0",
      category: "USER",
      description: "B",
      dependencies: [{ name: "LibA", versionRange: "*" }],
      isPlaceholder: false,
      exportedSymbols: [],
    });

    const mockProject = {
      controllers: [{ vendor: "GENERIC_IEC" }],
      libraryReferences: [{ name: "LibA", version: "1.0.0", isPlaceholder: false, category: "USER" }],
    } as unknown as IndustrialProject;

    const res = manager.resolveProjectLibraries(mockProject);
    expect(res.isSuccessful).toBe(false);
    expect(res.diagnostics.some((d) => d.code === "ERR_CIRCULAR_DEPENDENCY")).toBe(true);
  });

  it("Executa algoritmo de proteção ANSI 50/51 IEC 60255", () => {
    // Corrente abaixo do pickup: sem trip
    const resNormal = FB_Overcurrent50_51.execute(80, 100, 0.5, "STANDARD_INVERSE", 500, 0.05, 0);
    expect(resNormal.trip50).toBe(false);
    expect(resNormal.trip51).toBe(false);

    // Corrente de sobrecarga temporizada (150A > 100A pickup): trip51 após acumulação
    let acc = 0;
    let tripped51 = false;
    for (let i = 0; i < 50; i++) {
      const step = FB_Overcurrent50_51.execute(150, 100, 0.1, "STANDARD_INVERSE", 500, 0.05, acc);
      acc = step.accumulator;
      if (step.trip51) {
        tripped51 = true;
        break;
      }
    }
    expect(tripped51).toBe(true);

    // Corrente instantânea extrema (600A > 500A): trip50 imediato
    const resInst = FB_Overcurrent50_51.execute(600, 100, 0.5, "STANDARD_INVERSE", 500, 0.05, 0);
    expect(resInst.trip50).toBe(true);
  });

  it("Executa modelo térmico de transformador IEC 60076-7", () => {
    const res = FB_TransformerThermalModel.execute(30.0, 120.0, 3.0, 6.0, 1.0, 45.0, 65.0);
    expect(res.topOilTempC).toBeGreaterThan(45.0);
    expect(res.hotSpotTempC).toBeGreaterThan(65.0);
    expect(res.thermalAgingFactor).toBeGreaterThan(0);
  });

  it("Executa partida estrela-triângulo com dwell anti-flashover", () => {
    let state: any = "OFF";
    let timer = 0;

    // Comando de partida
    const s1 = FB_StarDeltaStarter.execute(true, false, false, 0.05, 0.02, 0.01, state, timer);
    expect(s1.newState).toBe("STAR");
    expect(s1.starContactor).toBe(true);
    expect(s1.deltaContactor).toBe(false);

    // Simula transição para DWELL após o tempo de estrela
    const s2 = FB_StarDeltaStarter.execute(true, false, false, 0.05, 0.02, 0.06, s1.newState, s1.newTimer);
    expect(s2.newState).toBe("DWELL");
    expect(s2.starContactor).toBe(false);
    expect(s2.deltaContactor).toBe(false);

    // Simula transição para DELTA após o dwell
    const s3 = FB_StarDeltaStarter.execute(true, false, false, 0.05, 0.02, 0.03, s2.newState, s2.newTimer);
    expect(s3.newState).toBe("DELTA");
    expect(s3.starContactor).toBe(false);
    expect(s3.deltaContactor).toBe(true);
  });

  it("Executa escalonamento analógico NAMUR NE43", () => {
    // Normal 12mA em faixa 0-100%
    const r1 = FB_AnalogInputScaling.execute(12.0, 0, 100);
    expect(r1.status).toBe("OK");
    expect(r1.scaledValue).toBeCloseTo(50.0, 1);

    // Falha de fiação rompida (< 3.6 mA)
    const r2 = FB_AnalogInputScaling.execute(2.5, 0, 100);
    expect(r2.status).toBe("FAULT_OPEN_WIRE");

    // Falha de curto-circuito (> 21.0 mA)
    const r3 = FB_AnalogInputScaling.execute(22.5, 0, 100);
    expect(r3.status).toBe("FAULT_SHORT");
  });

  it("Valida monitoramento de parada de emergência bicanal e salvaguarda física", () => {
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);

    // Ambos canais fechados (saudáveis)
    const s1 = FB_DualChannelEStop.execute(true, true, false, 0.05, 0.005, 0, false);
    expect(s1.safetyHealthy).toBe(true);
    expect(s1.faultDiscrepancy).toBe(false);

    // Discrepância entre canais mantida além de 50ms
    const s2 = FB_DualChannelEStop.execute(true, false, false, 0.05, 0.06, 0, false);
    expect(s2.safetyHealthy).toBe(false);
    expect(s2.faultDiscrepancy).toBe(true);
  });
});
