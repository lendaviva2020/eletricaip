import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import type { CompactProgramModel, CompactUdfDefinition } from "../lib/compact-studio/domain/types";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import { CompactExecutionEngine } from "../lib/compact-studio/runtime";
import {
  createUdfDefinitionFromSubgraph,
  detectUdfCycles,
  exportUdfLibraryPackage,
  instantiateUdfNode,
  migrateUdfDefinitionVersion,
  parseUdfLibraryPackage,
} from "../lib/compact-studio/udf";

describe("Fase 6 — UDFs, Macros Hierárquicos e Bibliotecas SemVer", () => {
  it("extracts a subgraph into a UDF and isolates timer state between multiple instances", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_udf", name: "UDF Isolation" });
    const pageId = base.pages[0].id;

    // Build internal TON pattern: IN -> TON(PT=100ms) -> Q
    const ton = createCompactBlockNode({
      id: "inner_ton",
      pageId,
      blockType: "TON",
      instanceName: "T_DELAY",
      params: { PT: 100 },
    });

    const sourceModel: CompactProgramModel = { ...base, nodes: [ton] };
    const udfDef = createUdfDefinitionFromSubgraph(sourceModel, {
      id: "udf_pulse_delay",
      name: "DelayOn",
      version: "1.0.0",
      nodeIds: ["inner_ton"],
    });

    expect(udfDef.ports.some((p) => p.direction === "input")).toBe(true);
    expect(udfDef.ports.some((p) => p.direction === "output")).toBe(true);

    // Instantiate TWO independent instances I1 -> U1 -> Q1 and I2 -> U2 -> Q2
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
    const u1 = instantiateUdfNode(udfDef, { nodeId: "u1", pageId, instanceName: "U1" });
    const u2 = instantiateUdfNode(udfDef, { nodeId: "u2", pageId, instanceName: "U2" });
    const q1 = createCompactBlockNode({
      id: "q1",
      pageId,
      blockType: "OUTPUT_QO",
      instanceName: "Q1",
    });
    const q2 = createCompactBlockNode({
      id: "q2",
      pageId,
      blockType: "OUTPUT_QO",
      instanceName: "Q2",
    });

    const inPortId = udfDef.ports.find((p) => p.direction === "input")!.id;
    const outPortId = udfDef.ports.find((p) => p.direction === "output")!.id;

    const runtimeModel: CompactProgramModel = {
      ...base,
      udfs: [udfDef],
      nodes: [i1, i2, u1, u2, q1, q2],
      connections: [
        {
          id: "c1",
          pageId,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "u1",
          toPortId: inPortId,
          signalType: "BOOL",
        },
        {
          id: "c2",
          pageId,
          fromNodeId: "u1",
          fromPortId: outPortId,
          toNodeId: "q1",
          toPortId: "in",
          signalType: "BOOL",
        },
        {
          id: "c3",
          pageId,
          fromNodeId: "i2",
          fromPortId: "out",
          toNodeId: "u2",
          toPortId: inPortId,
          signalType: "BOOL",
        },
        {
          id: "c4",
          pageId,
          fromNodeId: "u2",
          fromPortId: outPortId,
          toNodeId: "q2",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const eng = new CompactExecutionEngine(runtimeModel);
    expect(eng.compileOk).toBe(true);

    eng.setInput("I1", true);
    eng.setInput("I2", false);
    const frame = eng.advanceMs(120);

    // Instance 1 elapsed 120ms (>=100ms) -> Q1 true; Instance 2 input false -> Q2 stays false!
    expect(frame.variables["Q1"]).toBe(true);
    expect(frame.variables["Q2"]).toBe(false);
  });

  it("detects direct and indirect recursion cycles cleanly", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_cyc", name: "Cycle Check" });
    const defA: CompactUdfDefinition = {
      id: "udf_a",
      name: "A",
      version: "1.0.0",
      description: "",
      ports: [],
      params: [],
      internalNodes: [
        {
          id: "call_b",
          pageId: base.pages[0].id,
          blockType: "UDF",
          instanceName: "B1",
          category: "udf",
          libraryVersion: "1.0.0",
          udfId: "udf_b",
          udfVersion: "1.0.0",
          params: {},
          inputs: [],
          outputs: [],
        },
      ],
      internalConnections: [],
      portBindings: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const defB: CompactUdfDefinition = {
      ...defA,
      id: "udf_b",
      name: "B",
      internalNodes: [
        {
          ...defA.internalNodes[0],
          id: "call_a",
          instanceName: "A1",
          udfId: "udf_a",
        },
      ],
    };

    const diags = detectUdfCycles([defA, defB]);
    expect(diags.some((d) => d.code === "UDF_RECURSION_CYCLE")).toBe(true);
  });

  it("migrates UDF instances v1.0.0 -> v2.0.0 without corruption and flags removed ports", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_mig", name: "Migration" });
    const pageId = base.pages[0].id;
    const defV1: CompactUdfDefinition = {
      id: "udf_motor",
      name: "MotorCtrl",
      version: "1.0.0",
      description: "",
      ports: [
        { id: "in_start", name: "START", direction: "input", signalType: "BOOL" },
        { id: "in_aux", name: "AUX", direction: "input", signalType: "BOOL" },
        { id: "out_run", name: "RUN", direction: "output", signalType: "BOOL" },
      ],
      params: [{ key: "TIMEOUT_MS", label: "Timeout", signalType: "INT", defaultValue: 500 }],
      internalNodes: [],
      internalConnections: [],
      portBindings: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const i1 = createCompactBlockNode({
      id: "i1",
      pageId,
      blockType: "INPUT_DI",
      instanceName: "I1",
    });
    const inst = instantiateUdfNode(defV1, {
      nodeId: "m1",
      pageId,
      instanceName: "MOTOR_1",
      paramOverrides: { TIMEOUT_MS: 1200 },
    });

    const modelV1: CompactProgramModel = {
      ...base,
      udfs: [defV1],
      nodes: [i1, inst],
      connections: [
        {
          id: "c_start",
          pageId,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "m1",
          toPortId: "in_start",
          signalType: "BOOL",
        },
        {
          id: "c_aux",
          pageId,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "m1",
          toPortId: "in_aux",
          signalType: "BOOL",
        },
      ],
    };

    const defV2: CompactUdfDefinition = {
      ...defV1,
      version: "2.0.0",
      ports: [
        { id: "in_start", name: "START", direction: "input", signalType: "BOOL" },
        // in_aux removed in v2.0.0!
        { id: "out_run", name: "RUN", direction: "output", signalType: "BOOL" },
      ],
    };

    const res = migrateUdfDefinitionVersion(modelV1, defV2);
    expect(res.migratedCount).toBe(1);
    expect(res.diagnostics.some((d) => d.code === "UDF_PORT_REMOVED_ON_MIGRATION")).toBe(true);
    const migratedNode = res.model.nodes.find((n) => n.id === "m1")!;
    expect(migratedNode.udfVersion).toBe("2.0.0");
    expect(migratedNode.params.TIMEOUT_MS).toBe(1200);
    // Removed pin wire was safely pruned while valid c_start wire remained intact
    expect(res.model.connections.map((c) => c.id)).toEqual(["c_start"]);

    const pkg = exportUdfLibraryPackage(
      "Acionamentos",
      "2.0.0",
      [defV2],
      "2026-01-02T00:00:00.000Z",
    );
    const reparsed = parseUdfLibraryPackage(pkg);
    expect(reparsed.definitions[0].version).toBe("2.0.0");
  });
});
