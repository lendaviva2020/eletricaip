import { describe, it, expect } from "vitest";
import { LadderEngine } from "../iec/languages/ladder-engine";
import { FBDEngine } from "../iec/languages/fbd-engine";
import { ILEngine } from "../iec/languages/il-engine";
import { UnifiedIRTranslator } from "../iec/languages/ir-translator";
import { LadderRung, FBDNode, FBDConnection, POU } from "../canonical/types";

describe("Milestone 4: IEC 61131-3 Languages Engine & Bidirectional IR Translators", () => {
  it("LadderEngine avalia fluxo de potência (Power Flow) e bobinas Set/Reset", () => {
    const memory: Record<string, any> = {
      bSensorStart: true,
      bEStopOK: true,
      bPumpRun: false,
    };

    const rung: LadderRung = {
      id: "rung-1",
      number: 1,
      comment: "Partida com retenção",
      elements: [
        { id: "e1", type: "CONTACT_NO", symbolName: "bSensorStart", negated: false, params: {} },
        { id: "e2", type: "CONTACT_NO", symbolName: "bEStopOK", negated: false, params: {} },
        { id: "e3", type: "COIL_SET", symbolName: "bPumpRun", negated: false, params: {} },
      ],
      branches: [],
    };

    const power = LadderEngine.evaluateRung(rung, {
      getVariable: (name) => memory[name],
      setVariable: (name, val) => {
        memory[name] = val;
      },
    });

    expect(power).toBe(true);
    expect(memory.bPumpRun).toBe(true);

    // Geração de IR do Ladder
    const irBlock = LadderEngine.ladderToIR("PRG_Ladder", [rung]);
    expect(irBlock.instructions.length).toBeGreaterThan(0);
    expect(irBlock.instructions.some((i) => i.op === "STORE_VAR")).toBe(true);

    // Tradução de Ladder para ST
    const stCode = LadderEngine.ladderToST([rung]);
    expect(stCode).toContain("bSensorStart AND bEStopOK");
  });

  it("FBDEngine ordena nós topologicamente e avalia portas lógicas e aritméticas", () => {
    const memory: Record<string, any> = {};

    const node1: FBDNode = {
      id: "node-1",
      name: "AND_01",
      blockType: "AND",
      x: 0,
      y: 0,
      inputs: [
        { id: "p1", name: "IN1", dataType: "BOOL", isInput: true, defaultValue: true },
        { id: "p2", name: "IN2", dataType: "BOOL", isInput: true, defaultValue: true },
      ],
      outputs: [{ id: "p3", name: "OUT", dataType: "BOOL", isInput: false }],
    };

    const node2: FBDNode = {
      id: "node-2",
      name: "ADD_01",
      blockType: "ADD",
      x: 100,
      y: 0,
      inputs: [
        { id: "p4", name: "IN1", dataType: "INT", isInput: true, defaultValue: 10 },
        { id: "p5", name: "IN2", dataType: "INT", isInput: true, defaultValue: 25 },
      ],
      outputs: [{ id: "p6", name: "OUT", dataType: "INT", isInput: false }],
    };

    const nodes = [node2, node1];
    const sorted = FBDEngine.sortNodesTopologically(nodes, []);
    expect(sorted.length).toBe(2);

    FBDEngine.evaluateNetwork(nodes, [], {
      getVariable: (name) => memory[name],
      setVariable: (name, val) => {
        memory[name] = val;
      },
    });

    expect(memory.AND_01).toBe(true);
    expect(memory.ADD_01).toBe(35);

    // FBD para IR
    const fbdIR = FBDEngine.fbdToIR("PRG_FBD", nodes, []);
    expect(fbdIR.instructions.length).toBeGreaterThan(0);

    // FBD para ST
    const fbdST = FBDEngine.fbdToST(nodes, []);
    expect(fbdST).toContain("AND");
  });

  it("ILEngine analisa e compila Instruction List com registrador acumulador", () => {
    const ilSource = `
LD 100
ADD 50
ST nTotalCalculado
LD bPermissivo
AND bComando
ST bSaidaValvula
RET
`;

    const parsed = ILEngine.parseIL(ilSource);
    expect(parsed.length).toBe(7);
    expect(parsed[0].operator).toBe("LD");
    expect(parsed[1].operator).toBe("ADD");
    expect(parsed[2].operator).toBe("ST");

    const irBlock = ILEngine.ilToIR("PRG_IL", ilSource);
    expect(irBlock.instructions.some((i) => i.op === "LOAD_CONST")).toBe(true);
    expect(irBlock.instructions.some((i) => i.op === "ADD")).toBe(true);
    expect(irBlock.instructions.some((i) => i.op === "STORE_VAR")).toBe(true);
  });

  it("UnifiedIRTranslator converte POUs para IR e descompila para ST legível", () => {
    const pouST: POU = {
      id: "pou-st-1",
      tenantId: "t1",
      projectId: "p1",
      name: "PRG_Calculo",
      pouType: "PROGRAM",
      language: "ST",
      comment: "Teste de descompilação",
      variables: [],
      rawSourceST: "",
      networks: [],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    const ir = UnifiedIRTranslator.translatePouToIR(pouST);
    expect(ir.instructions.length).toBeGreaterThan(0);

    // Descompilação de IR para ST
    const mockIRBlock = {
      pouName: "PRG_Mock",
      localVariables: { rPressao: 10.5 },
      instructions: [
        { op: "ADD" as any, arg1: "10", arg2: "20", dest: "rSoma" },
        { op: "STORE_VAR" as any, arg1: "rResultado", arg2: "rSoma" },
      ],
    };

    const decompiledST = UnifiedIRTranslator.decompileIRToST(mockIRBlock);
    expect(decompiledST).toContain("PROGRAM PRG_Mock");
    expect(decompiledST).toContain("rResultado := rSoma");
  });
});
