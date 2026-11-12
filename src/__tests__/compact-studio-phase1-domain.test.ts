import { describe, expect, it } from "vitest";
import {
  COMPACT_STUDIO_FEATURE_FLAG,
  PRODUCT_NAME,
  getCompactStudioBranding,
} from "@/lib/compact-studio/branding";
import {
  DEFAULT_COMPACT_STUDIO_FLAGS,
  resolveCompactStudioFlags,
} from "@/lib/compact-studio/feature-flags";
import {
  areSignalTypesCompatible,
  createEmptyCompactProgramModel,
  migrateCompactProgram,
  parseCompactProgramModel,
  validateCompactProgram,
  type CompactNode,
  type CompactProgramModel,
} from "@/lib/compact-studio/domain";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";

function makeBoolNode(
  id: string,
  blockType: string,
  instanceName: string,
  pageId = "page-1",
  extra?: Partial<CompactNode>,
): CompactNode {
  return {
    id,
    pageId,
    blockType,
    instanceName,
    category: "logic",
    libraryVersion: "1.0.0",
    params: {},
    inputs: [
      { id: "in1", name: "IN1", direction: "input", signalType: "BOOL" },
      { id: "in2", name: "IN2", direction: "input", signalType: "BOOL" },
    ],
    outputs: [{ id: "out", name: "OUT", direction: "output", signalType: "BOOL" }],
    ...extra,
  };
}

describe("Fase 1 — eletric Studio: Fundamentos de Domínio, Schemas, Migrações e Validação", () => {
  it("expõe branding centralizado via PRODUCT_NAME sem marcas de terceiros espalhadas", () => {
    const branding = getCompactStudioBranding();
    expect(branding.productName).toBe(PRODUCT_NAME);
    expect(branding.productName).not.toMatch(/LOGO!/i);
    expect(COMPACT_STUDIO_FEATURE_FLAG).toBe("logoStudio");
  });

  it("resolve feature flags por tenant com fallback seguro em entradas inválidas", () => {
    expect(resolveCompactStudioFlags(undefined)).toEqual(DEFAULT_COMPACT_STUDIO_FLAGS);
    expect(resolveCompactStudioFlags({ logoStudio: "hack" })).toEqual(DEFAULT_COMPACT_STUDIO_FLAGS);
    expect(resolveCompactStudioFlags({ logoStudio: false, fieldDeviceComms: true })).toEqual({
      logoStudio: false,
      fieldDeviceComms: true,
    });
  });

  it("valida fronteiras com Zod e preserva ida e volta sem perda (round-trip)", () => {
    const model = createEmptyCompactProgramModel({
      id: "prog-01",
      name: "Bomba Recalque",
      nowIso: "2026-11-12T10:00:00.000Z",
    });
    const parsed = parseCompactProgramModel(JSON.parse(JSON.stringify(model)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.model).toEqual(model);
    }

    const bad = parseCompactProgramModel({ schemaVersion: 1, name: "" });
    expect(bad.ok).toBe(false);
  });

  it("migra rascunho v0 legado para v1 adicionando página, hardware e layout padrão", () => {
    const legacyV0 = {
      id: "legacy-1",
      name: "Comando Antigo",
      nodes: [makeBoolNode("n1", "AND", "AND_1")],
      connections: [],
    };
    const migrated = migrateCompactProgram(legacyV0, "2026-11-12T12:00:00.000Z");
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.migratedFromVersion).toBe(0);
      expect(migrated.model.schemaVersion).toBe(1);
      expect(migrated.model.pages[0]?.id).toBe("page-1");
      expect(migrated.model.nodes).toHaveLength(1);
      expect(migrated.model.hardware.maxBlocks).toBeGreaterThan(0);
    }
  });

  it("detecta TYPE_MISMATCH, MULTIPLE_DRIVERS, OUTPUT_SHORT_CIRCUIT e FEEDBACK_WITHOUT_MEMORY", () => {
    const base = createEmptyCompactProgramModel();
    const timerNode: CompactNode = {
      id: "t1",
      pageId: "page-1",
      blockType: "TON",
      instanceName: "T001",
      category: "timer",
      libraryVersion: "1.0.0",
      params: { PT: 2000 },
      inputs: [{ id: "in", name: "IN", direction: "input", signalType: "BOOL", required: true }],
      outputs: [
        { id: "q", name: "Q", direction: "output", signalType: "BOOL" },
        { id: "et", name: "ET", direction: "output", signalType: "TIME" },
      ],
    };
    const a1 = makeBoolNode("a1", "AND", "B001");
    const a2 = makeBoolNode("a2", "OR", "B002");
    const q1: CompactNode = {
      id: "q1",
      pageId: "page-1",
      blockType: "OUTPUT_QO",
      instanceName: "Q1_A",
      category: "io",
      libraryVersion: "1.0.0",
      params: { address: "Q1" },
      inputs: [{ id: "in", name: "IN", direction: "input", signalType: "BOOL", required: true }],
      outputs: [],
    };
    const q2: CompactNode = {
      ...q1,
      id: "q2",
      instanceName: "Q1_B",
    };

    const invalidModel: CompactProgramModel = {
      ...base,
      nodes: [timerNode, a1, a2, q1, q2],
      connections: [
        // TYPE_MISMATCH: TIME -> BOOL
        {
          id: "c1",
          pageId: "page-1",
          fromNodeId: "t1",
          fromPortId: "et",
          toNodeId: "a1",
          toPortId: "in1",
          signalType: "TIME",
        },
        // MULTIPLE_DRIVERS on a1.in1
        {
          id: "c2",
          pageId: "page-1",
          fromNodeId: "a2",
          fromPortId: "out",
          toNodeId: "a1",
          toPortId: "in1",
          signalType: "BOOL",
        },
        // Combinational cycle a1 <-> a2 without memory block
        {
          id: "c3",
          pageId: "page-1",
          fromNodeId: "a1",
          fromPortId: "out",
          toNodeId: "a2",
          toPortId: "in1",
          signalType: "BOOL",
        },
      ],
    };

    const report = validateCompactProgram(invalidModel);
    expect(report.valid).toBe(false);
    const codes = new Set(report.diagnostics.map((d) => d.code));
    expect(codes.has("TYPE_MISMATCH")).toBe(true);
    expect(codes.has("MULTIPLE_DRIVERS")).toBe(true);
    expect(codes.has("OUTPUT_SHORT_CIRCUIT")).toBe(true);
    expect(codes.has("FEEDBACK_WITHOUT_MEMORY")).toBe(true);
    expect(codes.has("UNCONNECTED_REQUIRED_INPUT")).toBe(true);
  });

  it("permite realimentação válida quando passa por bloco de memória (SR/RS/TONR)", () => {
    const base = createEmptyCompactProgramModel();
    const andNode = makeBoolNode("a1", "AND", "B001");
    const srNode: CompactNode = {
      id: "sr1",
      pageId: "page-1",
      blockType: "SR",
      instanceName: "SR001",
      category: "logic",
      libraryVersion: "1.0.0",
      params: {},
      inputs: [
        { id: "s1", name: "S1", direction: "input", signalType: "BOOL" },
        { id: "r", name: "R", direction: "input", signalType: "BOOL" },
      ],
      outputs: [{ id: "q1", name: "Q1", direction: "output", signalType: "BOOL" }],
    };

    const model: CompactProgramModel = {
      ...base,
      nodes: [andNode, srNode],
      connections: [
        {
          id: "c1",
          pageId: "page-1",
          fromNodeId: "a1",
          fromPortId: "out",
          toNodeId: "sr1",
          toPortId: "s1",
          signalType: "BOOL",
        },
        {
          id: "c2",
          pageId: "page-1",
          fromNodeId: "sr1",
          fromPortId: "q1",
          toNodeId: "a1",
          toPortId: "in2",
          signalType: "BOOL",
        },
      ],
    };

    const report = validateCompactProgram(model);
    expect(report.diagnostics.some((d) => d.code === "FEEDBACK_WITHOUT_MEMORY")).toBe(false);
    expect(report.valid).toBe(true);
  });

  it("valida limites de blocos e memória retentiva do hardware selecionado e compatibilidade de tipos", () => {
    expect(areSignalTypesCompatible("INT", "REAL")).toBe(true);
    expect(areSignalTypesCompatible("TIME", "BOOL")).toBe(false);

    const base = createEmptyCompactProgramModel();
    const nodes = Array.from({ length: 5 }, (_, idx) =>
      makeBoolNode(`b-${idx}`, "AND", `AND_${idx}`),
    );
    const constrained: CompactProgramModel = {
      ...base,
      hardware: { ...base.hardware, maxBlocks: 3 },
      nodes,
    };
    const report = validateCompactProgram(constrained);
    expect(report.valid).toBe(false);
    expect(report.diagnostics.some((d) => d.code === "HARDWARE_BLOCK_LIMIT_EXCEEDED")).toBe(true);
  });

  it("integra compactStudio ao UnifiedProjectStore compartilhando tags sem cópias paralelas", () => {
    useUnifiedProjectStore.getState().resetUnifiedDoc({ id: "proj-ssot", name: "SSOT Compact" });
    const prog = createEmptyCompactProgramModel({ id: "proj-ssot", name: "SSOT Compact" });
    const withIo: CompactProgramModel = {
      ...prog,
      ioSymbols: [
        {
          id: "sym-i1",
          ioKind: "DI",
          address: "I1",
          symbolicName: "BOMBA_LIGA",
          signalType: "BOOL",
          comment: "Botão partida bomba",
          retentive: false,
          initialValue: false,
        },
      ],
    };
    useUnifiedProjectStore.getState().setCompactStudioProgram(withIo);
    const doc = useUnifiedProjectStore.getState().doc;
    expect(doc.compactStudio?.id).toBe("proj-ssot");
    expect(doc.engineering.tags["sym-i1"]?.name).toBe("BOMBA_LIGA");
    expect(doc.engineering.tags["sym-i1"]?.address).toBe("I1");
  });
});
