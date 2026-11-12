import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import type { CompactProgramModel } from "../lib/compact-studio/domain/types";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import {
  convertLadRungsToCanonical,
  projectModelToLadNetworks,
  verifyFbdLadEquivalence,
} from "../lib/compact-studio/conversion";

function buildRelaySealCircuit(): CompactProgramModel {
  const base = createEmptyCompactProgramModel({ id: "prog_p4", name: "Partida / Intertravamento" });
  const pageId = base.pages[0].id;
  // Q1 = (I1 AND NOT I2) OR I3
  const i1 = createCompactBlockNode({
    id: "i1",
    pageId,
    blockType: "INPUT_DI",
    instanceName: "I1",
  });
  const i2 = createCompactBlockNode({
    id: "i2",
    pageId,
    blockType: "INPUT_DI",
    instanceName: "I2",
  });
  const i3 = createCompactBlockNode({
    id: "i3",
    pageId,
    blockType: "INPUT_DI",
    instanceName: "I3",
  });
  const gAnd = createCompactBlockNode({
    id: "g_and",
    pageId,
    blockType: "AND",
    instanceName: "B01",
  });
  const gOr = createCompactBlockNode({ id: "g_or", pageId, blockType: "OR", instanceName: "B02" });
  const q1 = createCompactBlockNode({
    id: "q1",
    pageId,
    blockType: "OUTPUT_QO",
    instanceName: "Q1",
  });

  return {
    ...base,
    nodes: [i1, i2, i3, gAnd, gOr, q1],
    connections: [
      {
        id: "c1",
        pageId,
        fromNodeId: "i1",
        fromPortId: "out",
        toNodeId: "g_and",
        toPortId: "in1",
        signalType: "BOOL",
      },
      {
        id: "c2",
        pageId,
        fromNodeId: "i2",
        fromPortId: "out",
        toNodeId: "g_and",
        toPortId: "in2",
        signalType: "BOOL",
        negatedTarget: true,
      },
      {
        id: "c3",
        pageId,
        fromNodeId: "g_and",
        fromPortId: "out",
        toNodeId: "g_or",
        toPortId: "in1",
        signalType: "BOOL",
      },
      {
        id: "c4",
        pageId,
        fromNodeId: "i3",
        fromPortId: "out",
        toNodeId: "g_or",
        toPortId: "in2",
        signalType: "BOOL",
      },
      {
        id: "c5",
        pageId,
        fromNodeId: "g_or",
        fromPortId: "out",
        toNodeId: "q1",
        toPortId: "in",
        signalType: "BOOL",
      },
    ],
  };
}

describe("Fase 4 — Projeção Ladder (LAD) e Equivalência Semântica Bidirecional FBD <-> LAD", () => {
  it("projects series + parallel + negated contacts cleanly and proves exhaustive FBD <-> LAD equivalence", () => {
    const fbdModel = buildRelaySealCircuit();
    const proj = projectModelToLadNetworks(fbdModel);

    expect(proj.rungs).toHaveLength(1);
    expect(proj.rungs[0].branches).toHaveLength(2);
    expect(proj.rungs[0].branches[0].elements[0].kind).toBe("contact_no");
    expect(proj.rungs[0].branches[0].elements[1].kind).toBe("contact_nc");
    expect(proj.rungs[0].coils[0].kind).toBe("coil");
    expect(proj.hasNonRepresentable).toBe(false);

    const roundTripModel = convertLadRungsToCanonical(fbdModel, fbdModel.pages[0].id, proj.rungs);

    const eq = verifyFbdLadEquivalence(fbdModel, roundTripModel);
    expect(eq.method).toBe("exhaustive");
    expect(eq.testedVectors).toBe(8); // 2^3 inputs
    expect(eq.mismatches).toEqual([]);
    expect(eq.equivalent).toBe(true);
  });

  it("flags non-representable constructs explicitly and preserves them as boxed EN/ENO blocks", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_box", name: "Math & NAND Boxed" });
    const pageId = base.pages[0].id;
    const i1 = createCompactBlockNode({
      id: "i1",
      pageId,
      blockType: "INPUT_DI",
      instanceName: "I1",
    });
    const i2 = createCompactBlockNode({
      id: "i2",
      pageId,
      blockType: "INPUT_DI",
      instanceName: "I2",
    });
    const nand = createCompactBlockNode({
      id: "b1",
      pageId,
      blockType: "NAND",
      instanceName: "B01",
    });
    const q1 = createCompactBlockNode({
      id: "q1",
      pageId,
      blockType: "OUTPUT_QO",
      instanceName: "Q1",
    });

    const model: CompactProgramModel = {
      ...base,
      nodes: [i1, i2, nand, q1],
      connections: [
        {
          id: "c1",
          pageId,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "b1",
          toPortId: "in1",
          signalType: "BOOL",
        },
        {
          id: "c2",
          pageId,
          fromNodeId: "i2",
          fromPortId: "out",
          toNodeId: "b1",
          toPortId: "in2",
          signalType: "BOOL",
        },
        {
          id: "c3",
          pageId,
          fromNodeId: "b1",
          fromPortId: "out",
          toNodeId: "q1",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const boxedProj = projectModelToLadNetworks(model, { wrapNonRepresentableAsBox: true });
    expect(boxedProj.hasNonRepresentable).toBe(true);
    expect(boxedProj.issues.some((i) => i.code === "NON_REPRESENTABLE" && i.keptAsBoxedBlock)).toBe(
      true,
    );
    expect(boxedProj.rungs[0].branches[0].elements.some((e) => e.kind === "box_fb")).toBe(true);

    const dropWarningProj = projectModelToLadNetworks(model, {
      wrapNonRepresentableAsBox: false,
    });
    expect(
      dropWarningProj.issues.some((i) => i.code === "NON_REPRESENTABLE" && !i.keptAsBoxedBlock),
    ).toBe(true);
  });

  it("proves equivalence for large >6-input multi-branch logic via seeded property sweep", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_large", name: "8-Input Interlock" });
    const pageId = base.pages[0].id;
    const inputs = Array.from({ length: 7 }, (_, i) =>
      createCompactBlockNode({
        id: `i${i + 1}`,
        pageId,
        blockType: "INPUT_DI",
        instanceName: `I${i + 1}`,
      }),
    );
    const a1 = createCompactBlockNode({ id: "a1", pageId, blockType: "AND", instanceName: "A1" });
    const o1 = createCompactBlockNode({ id: "o1", pageId, blockType: "OR", instanceName: "O1" });
    const q1 = createCompactBlockNode({
      id: "q1",
      pageId,
      blockType: "OUTPUT_QO",
      instanceName: "Q1",
    });

    const model: CompactProgramModel = {
      ...base,
      nodes: [...inputs, a1, o1, q1],
      connections: [
        {
          id: "c1",
          pageId,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "a1",
          toPortId: "in1",
          signalType: "BOOL",
        },
        {
          id: "c2",
          pageId,
          fromNodeId: "i2",
          fromPortId: "out",
          toNodeId: "a1",
          toPortId: "in2",
          signalType: "BOOL",
        },
        {
          id: "c3",
          pageId,
          fromNodeId: "a1",
          fromPortId: "out",
          toNodeId: "o1",
          toPortId: "in1",
          signalType: "BOOL",
        },
        {
          id: "c4",
          pageId,
          fromNodeId: "i3",
          fromPortId: "out",
          toNodeId: "o1",
          toPortId: "in2",
          signalType: "BOOL",
        },
        {
          id: "c5",
          pageId,
          fromNodeId: "o1",
          fromPortId: "out",
          toNodeId: "q1",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const proj = projectModelToLadNetworks(model);
    const ladModel = convertLadRungsToCanonical(model, pageId, proj.rungs);
    const eq = verifyFbdLadEquivalence(model, ladModel, { randomTrials: 40, seed: 42 });

    expect(eq.method).toBe("property_seeded");
    expect(eq.testedVectors).toBe(40);
    expect(eq.equivalent).toBe(true);
  });
});
