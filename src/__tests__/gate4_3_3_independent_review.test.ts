import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";
import {
  repairDiagramConnections,
  applyApprovedEngineeringProposals,
  synthesizeDiagramDocFromProject,
  synthesizeDiagramDocWithDiagnostics,
} from "@/lib/diagram/connection/connection-repair-engine";
import {
  connectBusbarToBranches,
  resolveTerminalAllocation,
} from "@/lib/diagram/connection/connection-engine";
import { validateElectricalTopology } from "@/lib/diagram/connection/graph-validator";
import { buildCanonicalDiagramParams } from "@/lib/diagram/connection/canonical-params";
import {
  convertBundleToDiagramDoc,
  validateAndParseExternalPayload,
} from "@/lib/importer/universal-importer";
import {
  convertArchitectResultToDiagramDoc,
  type ArchitectResult,
} from "@/lib/ai-architect-client";
import { computeEdgeRenderHash } from "@/lib/diagram/render/stage";
import {
  DiagnosticContextSchema,
  validateAndSanitizeDiagnosticContext,
  serializeDiagnosticContextForAi,
  buildDiagnosticContextFromMultifilar,
  buildDiagnosticContextFromLadder,
  buildDiagnosticContextFromFbd,
  buildDiagnosticContextFromPlc,
  buildDiagnosticContextFromHardware,
  buildDiagnosticContextFromIo,
  buildDiagnosticContextFromComms,
  buildDiagnosticContextFromSimulation,
  buildDiagnosticContextFromScada,
  buildDiagnosticContextFromNormFinding,
  buildDiagnosticContextFromImportIssue,
} from "@/lib/diagnostics/ai-repair-context";
import { buildModelConversationContext, assertProjectTenantAccess } from "@/lib/ai/memory.server";

describe("GATE 4.3.3 — INDEPENDENT ENGINEERING REVIEW ACCEPTANCE SUITE", () => {
  // 1. Disconnected 12-equipment project with 0 edges must NEVER get invented connections
  it("Scenario 1: Disconnected 12-equipment project yields 0 invented edges, INCOMPLETE status, and non-mutating proposal", () => {
    const doc = createEmptyDoc({ sheets: ["unifilar"] });
    const kinds = [
      "transformer",
      "breaker",
      "busbar",
      "breaker",
      "contactor",
      "thermal_relay",
      "motor",
      "breaker",
      "vfd",
      "motor",
      "psu",
      "ground",
    ] as const;

    kinds.forEach((kind, idx) => {
      const id = `eq_${idx + 1}`;
      doc.nodes[id] = makeNode({
        id,
        sheet: "unifilar",
        position: { x: 200 + (idx % 3) * 180, y: 100 + Math.floor(idx / 3) * 120 },
        label: `EQ-${idx + 1} (${kind})`,
        params: buildCanonicalDiagramParams(kind, {}) as any,
      });
    });

    const snapshotBefore = JSON.stringify(doc);
    const result = repairDiagramConnections(doc);

    // Zero invented connections; input document untouched
    expect(JSON.stringify(doc)).toBe(snapshotBefore);
    expect(result.addedEdges).toHaveLength(0);
    expect(result.repairedCount).toBe(0);
    expect(Object.keys(result.repairedDoc.edges)).toHaveLength(0);

    // Must report INCOMPLETE and list all 12 disconnected equipments
    expect(result.validation.status).toBe("INCOMPLETE");
    expect(result.validation.disconnectedNodes).toHaveLength(12);
    expect(result.remainingIssues.length).toBeGreaterThan(0);

    // Must return a separate proposal requiring explicit engineer approval
    expect(result.engineeringProposal.requiresEngineerApproval).toBe(true);
    expect(result.engineeringProposal.suggestedConnections.length).toBeGreaterThan(0);
    expect(result.engineeringProposal.requiredAssumptions.length).toBeGreaterThan(0);
    expect(result.engineeringProposal.missingTechnicalInformation.length).toBeGreaterThan(0);

    // performLoad must preserve persisted diagram verbatim without inventing edges
    const persistenceSrc = fs.readFileSync(
      path.resolve(__dirname, "../lib/use-project-persistence.ts"),
      "utf8",
    );
    expect(persistenceSrc).not.toContain("repairDiagramConnections(loadedDiagramDoc)");
  });

  // 2. Lossless param/kind conversion + explicit connection preservation
  it("Scenario 2: Preserves explicit electrical connections and accurately converts thermal_relay, capacitor_bank, generator, plc, hmi, and STAR_DELTA", () => {
    const rawPayload = JSON.stringify({
      format: "eletricai.canvas-bundle",
      schemaVersion: "1.0.0",
      project: { name: "Lossless Fidelity Plant", diagramType: "unifilar" },
      nodes: [
        {
          id: "gen1",
          type: "generator",
          label: "G-01",
          position: { x: 100, y: 80 },
          properties: { power_kVA: 500, voltage_V: 380, pf: 0.85, notes: "Standby diesel" },
        },
        {
          id: "qf1",
          type: "breaker",
          label: "QF-01",
          position: { x: 100, y: 200 },
          properties: { in_A: 800, poles: 3, curve: "C" },
        },
        {
          id: "bus1",
          type: "busbar",
          label: "QGBT-BUS",
          position: { x: 250, y: 320 },
          properties: { current_A: 800, voltage_V: 380, taps: 6 },
        },
        {
          id: "rt1",
          type: "thermal_relay",
          label: "FT-01",
          position: { x: 250, y: 440 },
          properties: { in_A: 65, rangeMin_A: 48, rangeMax_A: 65, trip_class: "20" },
        },
        {
          id: "mot1",
          type: "motor",
          label: "M-01",
          position: { x: 250, y: 560 },
          properties: {
            power_kW: 30,
            voltage_V: 380,
            startMethod: "STAR_DELTA",
            manufacturer: "WEG",
          },
        },
        {
          id: "cap1",
          type: "capacitor_bank",
          label: "BC-01",
          position: { x: 450, y: 440 },
          properties: { power_kvar: 75, voltage_V: 380, stages: 6 },
        },
        {
          id: "plc1",
          type: "plc",
          label: "PLC-01",
          position: { x: 650, y: 200 },
          properties: { diCount: 16, doCount: 12, protocol: "OPC-UA" },
        },
        {
          id: "hmi1",
          type: "hmi",
          label: "IHM-01",
          position: { x: 650, y: 340 },
          properties: { screenSizeIn: 10.1, protocol: "Modbus-TCP" },
        },
      ],
      edges: [
        { source: "gen1", target: "qf1", kind: "power" },
        { source: "qf1", target: "bus1", kind: "power" },
        { source: "bus1", target: "rt1", kind: "power" },
        { source: "rt1", target: "mot1", kind: "power" },
        { source: "bus1", target: "cap1", kind: "power" },
        { source: "plc1", target: "hmi1", kind: "signal" },
      ],
    });

    const parsed = validateAndParseExternalPayload(rawPayload);
    expect(parsed.canImport).toBe(true);
    expect(parsed.bundle).toBeDefined();
    if (!parsed.bundle) throw new Error("Bundle parse failed");

    const doc = convertBundleToDiagramDoc(parsed.bundle);
    expect(Object.keys(doc.edges)).toHaveLength(6);
    expect((doc.nodes.gen1.params as any).kind).toBe("generator");
    expect((doc.nodes.gen1.params as any).kVA).toBe(500);
    expect((doc.nodes.rt1.params as any).kind).toBe("thermal_relay");
    expect((doc.nodes.rt1.params as any).trip_class).toBe("20");
    expect((doc.nodes.mot1.params as any).startMethod).toBe("STAR_DELTA");
    expect((doc.nodes.cap1.params as any).kind).toBe("capacitor_bank");
    expect((doc.nodes.cap1.params as any).kvar).toBe(75);
    expect((doc.nodes.cap1.params as any).stages).toBe(6);
    expect((doc.nodes.plc1.params as any).kind).toBe("plc");
    expect((doc.nodes.hmi1.params as any).kind).toBe("hmi");

    // Also verify convertArchitectResultToDiagramDoc preserves non-default kinds & metadata
    const archResult: ArchitectResult = {
      title: "Arch",
      rationale: "R",
      transformer: { kVA: 500, primary_kV: 13.8, secondary_V: 380 },
      ccm: { columns: 1, cells: 2 },
      motors: [{ id: "M1", power_kW: 30, voltage_V: 380, startMethod: "VFD" }],
      nodes: [
        {
          id: "C1",
          kind: "capacitor_bank",
          category: "power",
          label: "Banco",
          position: { x: 100, y: 100 },
          params: { power_kvar: 50, voltage_V: 380, stages: 4 },
        },
        {
          id: "G1",
          kind: "generator",
          category: "power",
          label: "Gerador",
          position: { x: 250, y: 100 },
          params: { power_kVA: 300, voltage_V: 380 },
        },
      ],
      edges: [{ source: "G1", target: "C1", kind: "power" }],
    };
    const archDoc = convertArchitectResultToDiagramDoc(archResult);
    expect((archDoc.nodes.C1.params as any).kind).toBe("capacitor_bank");
    expect((archDoc.nodes.C1.params as any).kvar).toBe(50);
    expect((archDoc.nodes.C1.params as any).stages).toBe(4);
    expect((archDoc.nodes.G1.params as any).kind).toBe("generator");
    expect((archDoc.nodes.G1.params as any).kVA).toBe(300);
    expect(Object.keys(archDoc.edges)).toHaveLength(1);
  });

  // 3. Invalid terminal references must fail validation instead of falling back silently
  it("Scenario 3: Rejects incompatible terminal codes ('B' on ground, 'T' on estop, 'TERMINAL_FANTASMA_999') with INVALID_TERMINAL_REFERENCE", () => {
    const doc = createEmptyDoc({ sheets: ["unifilar"] });
    const nBreaker = makeNode({
      id: "qf_main",
      sheet: "unifilar",
      position: { x: 200, y: 100 },
      label: "QF1",
      params: { kind: "breaker", in_A: 63, poles: 3, curve: "C" },
    });
    const nGround = makeNode({
      id: "pe_1",
      sheet: "unifilar",
      position: { x: 200, y: 240 },
      label: "PE",
      params: { kind: "ground" },
    });
    const nEstop = makeNode({
      id: "es_1",
      sheet: "unifilar",
      position: { x: 380, y: 240 },
      label: "ES1",
      params: { kind: "estop", category: "1" },
    });

    doc.nodes[nBreaker.id] = nBreaker;
    doc.nodes[nGround.id] = nGround;
    doc.nodes[nEstop.id] = nEstop;

    expect(resolveTerminalAllocation(nGround, "B", "target").valid).toBe(false);
    expect(resolveTerminalAllocation(nEstop, "T", "source").valid).toBe(false);
    expect(resolveTerminalAllocation(nBreaker, "TERMINAL_FANTASMA_999", "source").valid).toBe(
      false,
    );

    doc.edges.e_bad_gnd = makeEdge({
      id: "e_bad_gnd",
      sheet: "unifilar",
      source: "qf_main",
      sourcePort: "B",
      target: "pe_1",
      targetPort: "B", // invalid on ground!
      kind: "ground",
    });
    doc.edges.e_bad_estop = makeEdge({
      id: "e_bad_estop",
      sheet: "unifilar",
      source: "es_1",
      sourcePort: "T", // invalid on estop!
      target: "qf_main",
      targetPort: "TERMINAL_FANTASMA_999", // phantom terminal!
      kind: "signal",
    });

    const topo = validateElectricalTopology(doc);
    expect(topo.isElectricallyConsistent).toBe(false);
    expect(topo.status).toBe("INVALID");
    const invalidTermDiags = topo.diagnostics.filter(
      (d) => d.code === "INVALID_TERMINAL_REFERENCE",
    );
    expect(invalidTermDiags.length).toBeGreaterThanOrEqual(2);
  });

  // 4. Busbar configured capacity must reject/fail on over-capacity instead of modulo wraparound
  it("Scenario 4: Rejects exceeding busbar tap capacity instead of modulo wraparound", () => {
    const bus = makeNode({
      id: "bus_small",
      sheet: "unifilar",
      position: { x: 300, y: 120 },
      label: "BARRA 2-TAP",
      params: { kind: "busbar", current_A: 250, voltage_V: 380, taps: 2 } as any,
    });
    const branches = [1, 2, 3].map((i) =>
      makeNode({
        id: `qf_${i}`,
        sheet: "unifilar",
        position: { x: 100 + i * 150, y: 260 },
        label: `QF${i}`,
        params: { kind: "breaker", in_A: 32, poles: 3, curve: "C" },
      }),
    );

    // Deterministic connector must fail explicitly instead of wrapping modulo
    expect(() => connectBusbarToBranches(bus, branches)).toThrow(/suporta 2 derivações/);

    // And graph validator must flag BUSBAR_TAP_CAPACITY_EXCEEDED error if manually wired over capacity
    const doc = createEmptyDoc({ sheets: ["unifilar"] });
    doc.nodes[bus.id] = bus;
    branches.forEach((b, idx) => {
      doc.nodes[b.id] = b;
      doc.edges[`e_${idx}`] = makeEdge({
        id: `e_${idx}`,
        sheet: "unifilar",
        source: bus.id,
        sourcePort: "TAP_1",
        target: b.id,
        targetPort: "T",
        kind: "power",
      });
    });
    const topo = validateElectricalTopology(doc);
    expect(topo.isElectricallyConsistent).toBe(false);
    expect(topo.diagnostics.some((d) => d.code === "BUSBAR_TAP_CAPACITY_EXCEEDED")).toBe(true);
  });

  // 5. Pipe / non-electrical SCADA edges must not become electrical conductors
  it("Scenario 5: Filters non-electrical pipe/fluid/telemetry edges during synthesis and rejects pipe edges in topology validation", () => {
    const nodes = [
      { id: "PUMP_1", kind: "motor", label: "Bomba B1", position: { x: 100, y: 100 } },
      { id: "TANK_1", kind: "breaker", label: "TK-01", position: { x: 300, y: 100 } },
    ];
    const legacyEdges = [
      { id: "e_pipe", source: "PUMP_1", target: "TANK_1", kind: "pipe" },
      { id: "e_fluid", source: "PUMP_1", target: "TANK_1", kind: "fluid" },
    ];

    const synth = synthesizeDiagramDocWithDiagnostics(nodes, legacyEdges);
    expect(Object.keys(synth.doc.edges)).toHaveLength(0);
    expect(synth.rejectedLegacyEdges).toHaveLength(2);
    expect(synth.rejectedLegacyEdges[0].kind).toBe("pipe");

    const plainDoc = synthesizeDiagramDocFromProject(nodes, legacyEdges);
    expect(Object.keys(plainDoc.edges)).toHaveLength(0);

    // If an explicit DiagramDoc retains a 'pipe' edge, validateElectricalTopology flags NON_ELECTRICAL_EDGE
    plainDoc.edges.e_pipe = {
      id: "e_pipe",
      source: "PUMP_1",
      target: "TANK_1",
      sourcePort: "T",
      targetPort: "T",
      kind: "pipe",
    } as any;
    const topo = validateElectricalTopology(plainDoc);
    expect(topo.isElectricallyConsistent).toBe(false);
    expect(topo.diagnostics.some((d) => d.code === "NON_ELECTRICAL_EDGE")).toBe(true);
  });

  // 6. Canvas edge render hash reactivity across movement, route/waypoints, terminal, sheet, selection
  it("Scenario 6: Recomputes computeEdgeRenderHash across node movement, terminal changes, waypoints, sheet switch, and reload", () => {
    const srcNode = makeNode({
      id: "n1",
      sheet: "unifilar",
      position: { x: 100, y: 100 },
      label: "QF1",
      params: { kind: "breaker", in_A: 32, poles: 3, curve: "C" },
    });
    const tgtNode = makeNode({
      id: "n2",
      sheet: "unifilar",
      position: { x: 100, y: 260 },
      label: "KM1",
      params: { kind: "contactor", in_A: 32, coil_V: 24 },
    });
    const edge = makeEdge({
      id: "e1",
      sheet: "unifilar",
      source: "n1",
      sourcePort: "B",
      target: "n2",
      targetPort: "T",
      kind: "power",
    });

    const baseHash = computeEdgeRenderHash({
      edge,
      srcNode,
      tgtNode,
      points: [
        { x: 100, y: 132 },
        { x: 100, y: 228 },
      ],
      crossings: [],
      sheet: "unifilar",
      isSelected: false,
      simFlag: "idle",
    });

    // Moved node position
    const movedHash = computeEdgeRenderHash({
      edge,
      srcNode,
      tgtNode: { ...tgtNode, position: { x: 240, y: 260 } },
      points: [
        { x: 100, y: 132 },
        { x: 240, y: 132 },
        { x: 240, y: 228 },
      ],
      crossings: [],
      sheet: "unifilar",
      isSelected: false,
      simFlag: "idle",
    });
    expect(movedHash).not.toBe(baseHash);

    // Terminal assignment change
    const terminalHash = computeEdgeRenderHash({
      edge: { ...edge, targetPort: "B" },
      srcNode,
      tgtNode,
      points: [
        { x: 100, y: 132 },
        { x: 100, y: 228 },
      ],
      crossings: [],
      sheet: "unifilar",
      isSelected: false,
      simFlag: "idle",
    });
    expect(terminalHash).not.toBe(baseHash);

    // Waypoints change
    const wpHash = computeEdgeRenderHash({
      edge: { ...edge, waypoints: [{ x: 180, y: 180 }] },
      srcNode,
      tgtNode,
      points: [
        { x: 100, y: 132 },
        { x: 180, y: 180 },
        { x: 100, y: 228 },
      ],
      crossings: [],
      sheet: "unifilar",
      isSelected: false,
      simFlag: "idle",
    });
    expect(wpHash).not.toBe(baseHash);

    // Sheet tab switch
    const sheetHash = computeEdgeRenderHash({
      edge,
      srcNode,
      tgtNode,
      points: [
        { x: 100, y: 132 },
        { x: 100, y: 228 },
      ],
      crossings: [],
      sheet: "multifilar",
      isSelected: false,
      simFlag: "idle",
    });
    expect(sheetHash).not.toBe(baseHash);

    // Cable / kind change
    const kindHash = computeEdgeRenderHash({
      edge: { ...edge, kind: "signal" },
      srcNode,
      tgtNode,
      points: [
        { x: 100, y: 132 },
        { x: 100, y: 228 },
      ],
      crossings: [],
      sheet: "unifilar",
      isSelected: false,
      simFlag: "idle",
    });
    expect(kindHash).not.toBe(baseHash);
  });

  // 7. Strict DiagnosticContextSchema (no z.any, deterministic IDs, size bound, token redaction)
  it("Scenario 7: Validates strict DiagnosticContextSchema, rejects mismatched/oversized payloads, redacts secrets, and creates deterministic IDs", () => {
    const diagSrc = fs.readFileSync(
      path.resolve(__dirname, "../lib/diagnostics/ai-repair-context.ts"),
      "utf8",
    );
    expect(diagSrc).not.toContain("z.any()");

    // Rejects mismatched module vs source_context.kind
    const mismatched = DiagnosticContextSchema.safeParse({
      project_id: "p1",
      module: "fbd",
      diagnostic_id: "d1",
      error_code: "ERR_FBD",
      severity: "warning",
      error_message: "Mismatched source context",
      source_context: { kind: "ladder", rungId: "r1" },
    });
    expect(mismatched.success).toBe(false);

    // Rejects oversized payload
    expect(() =>
      validateAndSanitizeDiagnosticContext({
        project_id: "p1",
        module: "comms",
        diagnostic_id: "d_huge",
        error_code: "ERR_COMMS",
        severity: "critical",
        error_message: "Too big",
        technical_details: "X".repeat(20_000),
      }),
    ).toThrow(/excede o limite/);

    // Redacts Bearer JWTs / API keys & guarantees deterministic IDs across identical calls
    const c1 = buildDiagnosticContextFromComms(
      {
        code: "COMMS_ERR",
        protocol: "OPC-UA",
        severity: "critical",
        message:
          "Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload123.sig456 and key sk-abcdef1234567890abcdef",
        endpoint: "opc.tcp://10.0.0.5:4840?token=secret123",
      },
      "proj_sec",
    );
    const c2 = buildDiagnosticContextFromComms(
      {
        code: "COMMS_ERR",
        protocol: "OPC-UA",
        severity: "critical",
        message:
          "Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload123.sig456 and key sk-abcdef1234567890abcdef",
        endpoint: "opc.tcp://10.0.0.5:4840?token=secret123",
      },
      "proj_sec",
    );
    expect(c1.diagnostic_id).toBe(c2.diagnostic_id);
    const serialized = serializeDiagnosticContextForAi(c1);
    expect(serialized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(serialized).not.toContain("sk-abcdef1234567890abcdef");
    expect(serialized).toContain("[REDACTED");
  });

  // 8. Long AI conversations (>40 messages) keep baseline architectural facts + latest decisions
  it("Scenario 8: Preserves initial project architectural baseline and recent turns when exceeding 40 messages", () => {
    const history = [
      {
        role: "user",
        content: "Projeto Subestação Industrial 13.8kV TR1 750kVA alimentando QGBT 380V.",
      },
      {
        role: "assistant",
        content:
          "Arquitetura base NBR 14039 e NBR 5410 registrada: TR1 750kVA -> QF_GERAL 1250A -> BUS_PRINCIPAL.",
      },
      ...Array.from({ length: 48 }, (_, idx) => ({
        role: idx % 2 === 0 ? "user" : "assistant",
        content:
          idx === 10
            ? "Decisão intermediária: Motor M05 37kW configurado com inversor VFD NBR 5410."
            : `Turno técnico #${idx + 3}: ajuste de proteção e validação em curso.`,
      })),
    ];

    const built = buildModelConversationContext(history, {
      recentLimit: 12,
      auditDecisions: ["Aprovação NR-10 para bloqueio QF03"],
    });

    expect(built.totalHistoryCount).toBe(50);
    expect(built.summarizedCount).toBe(38);
    expect(built.recentTurns.length).toBeLessThanOrEqual(12);
    expect(built.summaryBlock).toContain("750kVA");
    expect(built.summaryBlock).toContain("QGBT");
    expect(built.summaryBlock).toContain("NR-10");
  });

  // 9. Cross-module engineering workflow + all 12 modules exposed with AiFixButton & typed builders
  it("Scenario 9: Covers all 12 modules with typed DiagnosticContext builders and live AiFixButton component integration", () => {
    const allContexts = [
      buildDiagnosticContextFromMultifilar(
        { id: "u1", type: "ERRO", message: "Unifilar fault" },
        "p1",
      ),
      {
        ...buildDiagnosticContextFromMultifilar(
          { id: "m1", type: "AVISO", message: "Multifilar warn" },
          "p1",
        ),
        module: "multifilar" as const,
        source_context: { kind: "multifilar" as const, alertType: "AVISO" as const },
      },
      buildDiagnosticContextFromLadder(
        { level: "error", code: "LAD_1", message: "Coil missing", rungId: "r1" },
        "p1",
      ),
      buildDiagnosticContextFromFbd({ code: "FBD_1", message: "Cycle", nodeId: "n1" }, "p1"),
      buildDiagnosticContextFromPlc({ code: "PLC_1", message: "Missing CPU" }, "p1"),
      buildDiagnosticContextFromHardware({ code: "HW_1", message: "Bus power overflow" }, "p1"),
      buildDiagnosticContextFromIo(
        { code: "IO_1", message: "Duplicate Q0.0", address: "Q0.0" },
        "p1",
      ),
      buildDiagnosticContextFromComms(
        { code: "COM_1", protocol: "Modbus-TCP", message: "Timeout" },
        "p1",
      ),
      buildDiagnosticContextFromSimulation(
        { code: "SIM_1", message: "Motor overload", overloadedEquipmentIds: ["M1"] },
        "p1",
      ),
      buildDiagnosticContextFromScada(
        { code: "SCA_1", message: "High temp", isaPriority: "CRITICAL", tag: "TI-101" },
        "p1",
      ),
      buildDiagnosticContextFromImportIssue(
        {
          id: "imp_1",
          severity: "critical",
          category: "schema",
          message: "Broken import",
          format: "json-bundle",
        },
        "p1",
      ),
      buildDiagnosticContextFromNormFinding(
        { id: "n1", norm: "NBR 5410", severity: "error", title: "Breaker", detail: "Missing" },
        "p1",
      ),
    ];

    const modules = new Set(allContexts.map((c) => c.module));
    expect(modules).toEqual(
      new Set([
        "unifilar",
        "multifilar",
        "ladder",
        "fbd",
        "plc",
        "hardware",
        "io",
        "comms",
        "simulation",
        "scada",
        "importer",
        "validation",
      ]),
    );
    allContexts.forEach((c) => {
      expect(DiagnosticContextSchema.safeParse(c).success).toBe(true);
    });

    const filesWithAiFixButton = [
      "../components/canvases/webgl-canvas.tsx",
      "../components/editor/unified-bottom-dock.tsx",
      "../components/diagnostics/normative-compliance-panel.tsx",
      "../components/canvases/fbd-canvas.tsx",
      "../components/canvases/plc-canvas.tsx",
      "../components/compact-studio/hardware-configurator.tsx",
      "../components/canvases/sim-canvas.tsx",
      "../components/canvases/alarms-canvas.tsx",
      "../components/scada/views/scada-alarms-view.tsx",
      "../components/scada/views/scada-communication-view.tsx",
      "../components/importer/universal-import-modal.tsx",
    ];
    for (const rel of filesWithAiFixButton) {
      const content = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
      expect(content).toContain("AiFixButton");
    }
  });

  // 10. Multi-tenant isolation in TypeScript helper + Supabase RLS migration
  it("Scenario 10: Blocks cross-tenant project access in assertProjectTenantAccess and verifies Gate 4.3.3 RLS migration hardening", async () => {
    const fakeSupabaseOtherTenant = {
      from: (table: string) => ({
        select: () => ({
          eq: () => {
            if (table === "projects") {
              return {
                maybeSingle: async () => ({
                  data: { id: "proj_b", tenant_id: "tenant_b", created_by: "user_other" },
                  error: null,
                }),
              };
            }
            return {
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          },
        }),
      }),
    } as any;

    await expect(
      assertProjectTenantAccess(fakeSupabaseOtherTenant, "user_attacker", "proj_b"),
    ).rejects.toThrow(/FORBIDDEN_PROJECT_ACCESS/);

    const rlsSql = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/migrations/20261114120000_gate4_3_3_memory_and_rls_hardening.sql",
      ),
      "utf8",
    );
    expect(rlsSql).toContain("ai_conversations");
    expect(rlsSql).toContain("ai_messages");
    expect(rlsSql).toContain("ai_fix_audit");
    expect(rlsSql).toContain("tenant_memberships");
    expect(rlsSql).toContain("is_platform_admin()");
  });
});
