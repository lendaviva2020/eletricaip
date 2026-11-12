import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import {
  addExpansionModule,
  evaluateRackEngineering,
  getCompactHardwareCatalog,
  removeHardwareSlot,
  selectBaseController,
} from "../lib/compact-studio/hardware";

describe("Fase 5 — Catálogo Data-Driven e Engenharia de Hardware Compacto", () => {
  it("loads Zod-validated catalog with explicit provenance flags on every module", () => {
    const cat = getCompactHardwareCatalog();
    expect(cat.items.length).toBeGreaterThanOrEqual(10);
    for (const item of cat.items) {
      expect(typeof item.verified).toBe("boolean");
      expect(item.sourceRef.length).toBeGreaterThan(0);
      expect(item.verifiedAt.length).toBeGreaterThan(0);
    }
  });

  it("auto-addresses I/Q/AI/AQ linearly across CPU + DM8 + DM16 + AM2 + AQ expansions and computes BOM", () => {
    let model = createEmptyCompactProgramModel({ id: "prog_hw", name: "Rack Multi-Modulo" });
    model = addExpansionModule(model, "elc-exp-dm8-24"); // +4 DI, +4 DO
    model = addExpansionModule(model, "elc-exp-dm16-24r"); // +8 DI, +8 DO
    model = addExpansionModule(model, "elc-exp-am2-ai"); // +2 AI
    model = addExpansionModule(model, "elc-exp-am2-aq"); // +2 AQ

    const rep = evaluateRackEngineering(model);
    expect(rep.totalDi).toBe(8 + 4 + 8); // 20
    expect(rep.totalDo).toBe(4 + 4 + 8); // 16
    expect(rep.totalAi).toBe(4 + 2); // 6
    expect(rep.totalAq).toBe(2);
    expect(rep.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(rep.allocations[1].diRange).toBe("I9..I12");
    expect(rep.allocations[2].doRange).toBe("Q9..Q16");
    expect(rep.allocations[3].aiRange).toBe("AI5..AI6");
    expect(rep.allocations[4].aqRange).toBe("AQ1..AQ2");
    expect(rep.bom.length).toBe(5);
  });

  it("flags voltage mismatches (230VAC CPU + 24VDC DI/DO module) and I/O overflow cleanly", () => {
    let model = createEmptyCompactProgramModel({ id: "prog_hw_err", name: "Conflito Tensao" });
    model = selectBaseController(model, "elc-base-230rc-rel-eth");
    model = addExpansionModule(model, "elc-exp-dm8-24"); // 24VDC on 230VAC base

    const rep = evaluateRackEngineering(model);
    expect(rep.diagnostics.some((d) => d.code === "HW_VOLTAGE_MISMATCH")).toBe(true);

    // Removing the offending slot restores clean compatibility
    model = removeHardwareSlot(model, 1);
    const cleanRep = evaluateRackEngineering(model);
    expect(cleanRep.diagnostics.some((d) => d.code === "HW_VOLTAGE_MISMATCH")).toBe(false);
  });

  it("detects unmapped symbolic I/O addresses and program block limit overflow", () => {
    let model = createEmptyCompactProgramModel({ id: "prog_hw_lim", name: "Limites" });
    model = {
      ...model,
      ioSymbols: [
        {
          id: "sym_high_di",
          ioKind: "DI",
          address: "I22", // Base only has I1..I8
          symbolicName: "SENSOR_LONGE",
          signalType: "BOOL",
          comment: "",
          retentive: false,
          initialValue: false,
        },
      ],
      nodes: Array.from({ length: 405 }, (_, i) =>
        createCompactBlockNode({
          id: `n_${i}`,
          pageId: model.pages[0].id,
          blockType: "AND",
          instanceName: `B_${i}`,
        }),
      ),
    };

    const rep = evaluateRackEngineering(model);
    expect(rep.diagnostics.some((d) => d.code === "HW_IO_ADDRESS_UNAVAILABLE")).toBe(true);
    expect(rep.diagnostics.some((d) => d.code === "HARDWARE_BLOCK_LIMIT_EXCEEDED")).toBe(true);
  });
});
