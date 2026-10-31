import { describe, it, expect } from "vitest";
import {
  detectFormat,
  validateAndParseExternalPayload,
  convertBundleToDiagramDoc,
  convertBundleToIndustrialElements,
  convertBundleToLadderRungs,
} from "@/lib/importer/universal-importer";
import { scanPayloadSecurity } from "@/lib/importer/security-validator";
import {
  exportCurrentCanvasToBundle,
  generateExternalAiPrompt,
  exportCanvasBundleJson,
} from "@/lib/importer/external-ai-prompts";
import { makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";

describe("Universal Importer - Format Detection & Parsing", () => {
  it("detects json-bundle, yaml-bundle, csv-table, and plcopen-xml formats correctly", () => {
    expect(detectFormat('{"format": "eletricai.canvas-bundle"}')).toBe("json-bundle");
    expect(detectFormat('format: "eletricai.canvas-bundle"\nnodes:\n')).toBe("yaml-bundle");
    expect(detectFormat("tag,tipo,potencia_kW,tensao_V\nDJ-01,disjuntor,0,380")).toBe("csv-table");
    expect(
      detectFormat('<?xml version="1.0"?><project xmlns="http://www.plcopen.org/xml/tc6_0201">'),
    ).toBe("plcopen-xml");
    expect(detectFormat("plain random text without structure")).toBe("unknown");
  });

  it("parses and validates a complete valid eletricai.canvas-bundle JSON", () => {
    const rawJson = JSON.stringify({
      format: "eletricai.canvas-bundle",
      schemaVersion: "1.0.0",
      project: {
        name: "Painel de Bombeamento",
        diagramType: "unifilar",
        systemVoltageV: 380,
      },
      nodes: [
        {
          id: "DJ-01",
          type: "breaker",
          label: "Disjuntor Geral 63A",
          position: { x: 100, y: 100 },
          properties: { In: 63, poles: 3, curve: "C", tag: "DJ-01" },
        },
        {
          id: "BARRA-01",
          type: "busbar",
          label: "Barramento QGBT",
          position: { x: 100, y: 220 },
          properties: { voltage_V: 380 },
        },
        {
          id: "MTR-01",
          type: "motor",
          label: "Motor Bomba 7.5kW",
          position: { x: 100, y: 400 },
          properties: { power_kW: 7.5, voltage_V: 380, in_A: 15.2, tag: "M-01" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "DJ-01",
          target: "BARRA-01",
          kind: "power",
          circuitConfig: "3F+N+PE",
        },
        {
          id: "e2",
          source: "BARRA-01",
          target: "MTR-01",
          kind: "power",
          circuitConfig: "3F+PE",
        },
      ],
      ladder: {
        rungs: [
          {
            id: "r0",
            comment: "Comando Liga/Desliga Bomba",
            output: { kind: "OTE", operand: "K1" },
            branches: [[{ kind: "XIC", operand: "BT_LIGA" }]],
          },
        ],
      },
    });

    const report = validateAndParseExternalPayload(rawJson);
    expect(report.isValid).toBe(true);
    expect(report.canImport).toBe(true);
    expect(report.detectedFormat).toBe("json-bundle");
    expect(report.stats.totalNodes).toBe(3);
    expect(report.stats.recognizedNodes).toBe(3);
    expect(report.stats.rejectedNodes).toBe(0);
    expect(report.stats.totalEdges).toBe(2);
    expect(report.stats.validEdges).toBe(2);
    expect(report.stats.ladderRungsCount).toBe(1);

    // Converter para DiagramDoc do Canvas WebGL
    const doc = convertBundleToDiagramDoc(report.bundle!);
    expect(Object.keys(doc.nodes)).toHaveLength(3);
    expect(Object.keys(doc.edges)).toHaveLength(2);
    expect(doc.nodes["DJ-01"].params.kind).toBe("breaker");
    expect(doc.nodes["BARRA-01"].params.kind).toBe("busbar");
    expect(doc.nodes["MTR-01"].params.kind).toBe("motor");
    expect((doc.nodes["MTR-01"].params as any).power_kW).toBe(7.5);

    // Converter para Industrial elements
    const industrial = convertBundleToIndustrialElements(report.bundle!);
    expect(industrial.nodes).toHaveLength(3);
    expect(industrial.edges).toHaveLength(2);

    // Converter para Ladder
    const rungs = convertBundleToLadderRungs(report.bundle!);
    expect(rungs).toHaveLength(1);
    expect(
      (rungs[0] as any).output?.operand ||
        (rungs[0].cells[0][rungs[0].cells[0].length - 1] as any).operand,
    ).toBe("K1");
  });

  it("normalizes Portuguese component aliases automatically (disjuntor -> breaker, contator -> contactor)", () => {
    const raw = JSON.stringify({
      format: "eletricai.canvas-bundle",
      schemaVersion: "1.0.0",
      project: { name: "Teste Alias", diagramType: "unifilar" },
      nodes: [
        { id: "Q1", type: "disjuntor", position: { x: 50, y: 50 } },
        { id: "K1", type: "contator", position: { x: 50, y: 150 } },
        { id: "RT1", type: "rele_termico", position: { x: 50, y: 250 } },
        { id: "TRAFO", type: "transformador", position: { x: 50, y: 350 } },
      ],
      edges: [],
    });

    const report = validateAndParseExternalPayload(raw);
    expect(report.canImport).toBe(true);
    expect(report.stats.recognizedNodes).toBe(4);
    const doc = convertBundleToDiagramDoc(report.bundle!);
    expect(doc.nodes["Q1"].params.kind).toBe("breaker");
    expect(doc.nodes["K1"].params.kind).toBe("contactor");
    expect(doc.nodes["RT1"].params.kind).toBe("relay");
    expect(doc.nodes["TRAFO"].params.kind).toBe("transformer");
  });
});

describe("Universal Importer - Zero Trust Security Scanning", () => {
  it("rejects Prototype Pollution (__proto__, constructor, prototype)", () => {
    const maliciousProto =
      '{"format": "eletricai.canvas-bundle", "__proto__": {"isAdmin": true}, "nodes": []}';
    const scanProto = scanPayloadSecurity(maliciousProto);
    expect(scanProto.safe).toBe(false);
    expect(scanProto.issues.some((i) => i.id === "prototype-pollution")).toBe(true);

    const maliciousConstructor = '{"constructor": {"prototype": {"admin": true}}}';
    const scanConst = scanPayloadSecurity(maliciousConstructor);
    expect(scanConst.safe).toBe(false);
  });

  it("rejects Script and HTML injection (<script>, javascript:, eval)", () => {
    const scriptInjection = '{"nodes": [{"id": "n1", "label": "<script>alert(1)</script>"}]}';
    const scanScript = scanPayloadSecurity(scriptInjection);
    expect(scanScript.safe).toBe(false);
    expect(scanScript.issues.some((i) => i.id === "script-injection")).toBe(true);

    const jsUriInjection =
      '{"nodes": [{"id": "n1", "label": "javascript:alert(document.cookie)"}]}';
    const scanJs = scanPayloadSecurity(jsUriInjection);
    expect(scanJs.safe).toBe(false);

    const evalInjection = '{"nodes": [{"id": "n1", "label": "eval(dangerousCode)"}]}';
    const scanEval = scanPayloadSecurity(evalInjection);
    expect(scanEval.safe).toBe(false);
  });

  it("rejects XML XXE and DTD entities before parsing", () => {
    const maliciousXml = `<?xml version="1.0"?>
    <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    <project><name>&xxe;</name></project>`;

    const scanXml = scanPayloadSecurity(maliciousXml);
    expect(scanXml.safe).toBe(false);
    expect(scanXml.issues.some((i) => i.id === "xxe-doctype-prohibited")).toBe(true);

    const report = validateAndParseExternalPayload(maliciousXml);
    expect(report.canImport).toBe(false);
  });

  it("rejects payloads exceeding size limits or extreme nesting depth", () => {
    // String gigantesta simulando estouro de memória com limite configurável
    const hugeString = "a".repeat(6 * 1024 * 1024);
    const scanConfigured = scanPayloadSecurity(hugeString, { maxPayloadBytes: 5 * 1024 * 1024 });
    expect(scanConfigured.safe).toBe(false);
    expect(scanConfigured.issues.some((i) => i.id === "payload-too-large")).toBe(true);

    // Teste de estouro do limite padrão (26MB)
    const exceedsDefault = "a".repeat(26 * 1024 * 1024);
    const scanDefault = scanPayloadSecurity(exceedsDefault);
    expect(scanDefault.safe).toBe(false);
    expect(scanDefault.issues.some((i) => i.id === "payload-too-large")).toBe(true);
  });
});

describe("Universal Importer - Multi-format Adapters (YAML, CSV, PLCopen)", () => {
  it("parses safe YAML bundle into identical canonical bundle", () => {
    const yamlString = `
format: eletricai.canvas-bundle
schemaVersion: 1.0.0
project:
  name: Subestacao 13.8kV
  diagramType: unifilar
nodes:
  - id: DJ-MEDIA
    type: breaker
    label: Disjuntor MT 630A
    position:
      x: 150
      y: 100
  - id: TRAFO-01
    type: transformer
    label: Trafo 500kVA
    position:
      x: 150
      y: 280
edges:
  - source: DJ-MEDIA
    target: TRAFO-01
    kind: power
`;

    const report = validateAndParseExternalPayload(yamlString);
    expect(report.canImport).toBe(true);
    expect(report.detectedFormat).toBe("yaml-bundle");
    expect(report.stats.recognizedNodes).toBe(2);
    expect(report.bundle?.nodes[0].id).toBe("DJ-MEDIA");
    expect(report.bundle?.nodes[1].id).toBe("TRAFO-01");
  });

  it("parses CSV tables (IO list, bill of materials) into spaced canvas nodes", () => {
    const csvContent = `tag,tipo,descricao,potencia_kW,tensao_V
DJ-01,breaker,Disjuntor Geral,,380
M-01,motor,Bomba d'água 1,11,380
M-02,motor,Bomba d'água 2,15,380
BT-ESTOP,estop,Botao Emergencia,,24`;

    const report = validateAndParseExternalPayload(csvContent);
    expect(report.canImport).toBe(true);
    expect(report.detectedFormat).toBe("csv-table");
    expect(report.stats.recognizedNodes).toBe(4);
    expect(report.bundle?.nodes[1].id).toBe("M-01");
    expect(report.bundle?.nodes[1].type).toBe("motor");
  });

  it("parses PLCopen XML into PLC variables and ladder rungs safely", () => {
    const plcopenXml = `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201">
  <types>
    <pous>
      <pou name="MainProgram" pouType="program">
        <interface>
          <localVars>
            <variable name="BOTAO_START">
              <type><BOOL/></type>
            </variable>
            <variable name="VALVULA_OUT">
              <type><BOOL/></type>
            </variable>
          </localVars>
        </interface>
        <body>
          <LD>
            <!-- LD body -->
          </LD>
        </body>
      </pou>
    </pous>
  </types>
</project>`;

    const report = validateAndParseExternalPayload(plcopenXml);
    expect(report.canImport).toBe(true);
    expect(report.detectedFormat).toBe("plcopen-xml");
    expect(report.bundle?.tags).toHaveLength(2);
    expect(report.bundle?.tags?.[0].name).toBe("BOTAO_START");
  });
});

describe("Universal Importer - Merge vs Replace Application Modes", () => {
  it("replaces existing project cleanly in 'replace' mode", () => {
    const existingDoc: DiagramDoc = {
      version: 1,
      id: "doc_old",
      metadata: { title: "Old", norms: [] },
      sheets: ["unifilar"],
      nodes: {
        old1: makeNode({
          sheet: "unifilar",
          params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
          position: { x: 50, y: 50 },
          id: "old1",
        }),
      },
      edges: {},
    };

    const bundle = {
      format: "eletricai.canvas-bundle" as const,
      schemaVersion: "1.0.0" as const,
      project: { name: "Novo", diagramType: "unifilar" as const },
      nodes: [{ id: "new1", type: "motor", position: { x: 100, y: 100 } }],
      edges: [],
    };

    const replaced = convertBundleToDiagramDoc(bundle, existingDoc, "replace");
    expect(replaced.nodes["old1"]).toBeUndefined();
    expect(replaced.nodes["new1"]).toBeDefined();
    expect((replaced.nodes["new1"] as any).kind || replaced.nodes["new1"].params.kind).toBe(
      "motor",
    );
  });

  it("merges incoming nodes by shifting coordinates and preserving existing elements", () => {
    const existingDoc: DiagramDoc = {
      version: 1,
      id: "doc_merge",
      metadata: { title: "Merge", norms: [] },
      sheets: ["unifilar"],
      nodes: {
        n_existente: makeNode({
          sheet: "unifilar",
          params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
          position: { x: 300, y: 100 },
          id: "n_existente",
        }),
      },
      edges: {},
    };

    const bundle = {
      format: "eletricai.canvas-bundle" as const,
      schemaVersion: "1.0.0" as const,
      project: { name: "Adicao", diagramType: "unifilar" as const },
      nodes: [{ id: "n_adicional", type: "motor", position: { x: 50, y: 100 } }],
      edges: [],
    };

    const merged = convertBundleToDiagramDoc(bundle, existingDoc, "merge");
    expect(merged.nodes["n_existente"]).toBeDefined();
    expect(merged.nodes["n_adicional"]).toBeDefined();
    // Posição deve ser deslocada à direita do maxX existente (300 + 250 + 50 = 600)
    expect(merged.nodes["n_adicional"].position.x).toBe(600);
  });
});

describe("Universal Importer - External AI Prompts & Bundle Exporter", () => {
  it("exports active DiagramDoc into standard eletricai.canvas-bundle v1.0.0", () => {
    const doc: DiagramDoc = {
      version: 1,
      id: "doc_export",
      metadata: { title: "Export", norms: [] },
      sheets: ["unifilar"],
      nodes: {
        DJ1: makeNode({
          sheet: "unifilar",
          params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
          position: { x: 100, y: 100 },
          id: "DJ1",
        }),
        M1: makeNode({
          sheet: "unifilar",
          params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
          position: { x: 100, y: 300 },
          id: "M1",
        }),
      },
      edges: {
        e1: makeEdge({
          id: "e1",
          source: "DJ1",
          target: "M1",
          kind: "power",
          sheet: "unifilar",
        }),
      },
    };

    const bundle = exportCurrentCanvasToBundle(doc, { projectName: "Painel Teste" });
    expect(bundle.format).toBe("eletricai.canvas-bundle");
    expect(bundle.schemaVersion).toBe("1.0.0");
    expect(bundle.project.name).toBe("Painel Teste");
    expect(bundle.nodes).toHaveLength(2);
    expect(bundle.edges).toHaveLength(1);

    const jsonString = exportCanvasBundleJson(bundle);
    expect(jsonString).toContain('"format": "eletricai.canvas-bundle"');
  });

  it("generates an exhaustive prompt for external LLMs with rules, schemas, and catalog", () => {
    const prompt = generateExternalAiPrompt({
      customRequirements: "2 motores de 15kW com softstarter",
    });

    expect(prompt).toContain("eletricai.canvas-bundle");
    expect(prompt).toContain("breaker");
    expect(prompt).toContain("motor");
    expect(prompt).toContain("softstarter");
    expect(prompt).toContain("2 motores de 15kW com softstarter");
    expect(prompt).toContain("ABNT NBR 5410");
  });
});

describe("Universal Importer - Zero AI Credits & Determinism Guarantee", () => {
  it("operates 100% deterministically and synchronously without invoking network or AI endpoints", () => {
    // Spy on global fetch to ensure 0 external network/AI requests are made
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error(
        "AI or Network call detected! Importer must be 100% local and deterministic.",
      );
    }) as any;

    try {
      const payload = JSON.stringify({
        format: "eletricai.canvas-bundle",
        schemaVersion: "1.0.0",
        project: { name: "Zero Credits Verification", diagramType: "unifilar" },
        nodes: [
          { id: "DJ_ZERO", type: "breaker", position: { x: 100, y: 100 }, properties: { In: 100 } },
          {
            id: "MTR_ZERO",
            type: "motor",
            position: { x: 100, y: 300 },
            properties: { power_kW: 15 },
          },
        ],
        edges: [{ source: "DJ_ZERO", target: "MTR_ZERO", kind: "power" }],
      });

      // 1. Validate
      const report = validateAndParseExternalPayload(payload);
      expect(report.canImport).toBe(true);

      // 2. Convert to DiagramDoc
      const doc = convertBundleToDiagramDoc(report.bundle!);
      expect(doc.nodes["DJ_ZERO"]).toBeDefined();
      expect(doc.nodes["MTR_ZERO"]).toBeDefined();

      // 3. Convert to Industrial Elements
      const industrial = convertBundleToIndustrialElements(report.bundle!);
      expect(industrial.nodes).toHaveLength(2);

      // Verify fetch was never invoked
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maintains complete fidelity during round-trip export -> import", () => {
    const originalDoc: DiagramDoc = {
      version: 1,
      id: "doc_original",
      metadata: { title: "Projeto Redondo", norms: ["NBR 5410"] },
      sheets: ["unifilar"],
      nodes: {
        DJ_P1: makeNode({
          sheet: "unifilar",
          params: { kind: "breaker", in_A: 40, curve: "C", poles: 3 },
          position: { x: 120, y: 150 },
          id: "DJ_P1",
          label: "Disjuntor P1",
        }),
      },
      edges: {},
    };

    // Exportar
    const bundle = exportCurrentCanvasToBundle(originalDoc, { projectName: "Projeto Redondo" });
    expect(bundle.nodes[0].id).toBe("DJ_P1");
    expect(bundle.nodes[0].position.x).toBe(120);

    // Reimportar
    const reimportedDoc = convertBundleToDiagramDoc(bundle, undefined, "replace");
    expect(reimportedDoc.nodes["DJ_P1"]).toBeDefined();
    expect(reimportedDoc.nodes["DJ_P1"].position.x).toBe(120);
    expect(reimportedDoc.nodes["DJ_P1"].position.y).toBe(150);
  });

  it("handles markdown code fences automatically when copying from ChatGPT / Claude", () => {
    const wrappedJson =
      "```json\n" +
      JSON.stringify({
        format: "eletricai.canvas-bundle",
        schemaVersion: "1.0.0",
        project: { name: "ChatGPT Output", diagramType: "unifilar" },
        nodes: [
          { id: "DJ_GPT", type: "breaker", position: { x: 100, y: 100 }, properties: { In: 50 } },
        ],
        edges: [],
      }) +
      "\n```";

    expect(detectFormat(wrappedJson)).toBe("json-bundle");
    const report = validateAndParseExternalPayload(wrappedJson);
    expect(report.canImport).toBe(true);
    expect(report.bundle?.nodes[0].id).toBe("DJ_GPT");
  });

  it("parses SPICE / Netlist circuit formats deterministically without executing arbitrary code", () => {
    const netlistText = `* Circuito de Alimentação Industrial
V_SRC N1 0 380V
DJ_GERAL N1 N2 125A
KM_BOMBA N2 N3 32A
MTR_RECALQUE N3 0 15kW
`;

    expect(detectFormat(netlistText)).toBe("netlist");
    const report = validateAndParseExternalPayload(netlistText);
    expect(report.canImport).toBe(true);
    expect(report.stats.totalNodes).toBe(4);
    expect(report.bundle?.nodes.some((n) => n.id === "DJ_GERAL" && n.type === "breaker")).toBe(
      true,
    );
    expect(report.bundle?.nodes.some((n) => n.id === "KM_BOMBA" && n.type === "contactor")).toBe(
      true,
    );
    expect(report.bundle?.nodes.some((n) => n.id === "MTR_RECALQUE" && n.type === "motor")).toBe(
      true,
    );
    expect(report.bundle?.edges.length).toBeGreaterThan(0);
  });

  it("converts 'In' into required 'in_A' and passes DiagramDocSchema and ingestDiagramDocChange without ZodError", async () => {
    const { DiagramDocSchema } = await import("@/lib/diagram/schema");
    const { useUnifiedProjectStore } = await import("@/lib/model/unified-store");

    const bundleJson = JSON.stringify({
      format: "eletricai.canvas-bundle",
      schemaVersion: "1.0.0",
      project: { name: "Bomba Directa", diagramType: "unifilar" },
      nodes: [
        {
          id: "DJ-GERAL",
          type: "breaker",
          label: "Disjuntor Geral 63A",
          position: { x: 200, y: 80 },
          properties: { tag: "QGBT-DJ01", In: 63, poles: 3, curve: "C" },
        },
        {
          id: "DJ-MOTOR",
          type: "breaker",
          label: "Disjuntor-Motor 20A",
          position: { x: 200, y: 320 },
          properties: { tag: "QM1", In: 20, poles: 3 },
        },
        {
          id: "K1",
          type: "contactor",
          label: "Contator Tripolar 18A",
          position: { x: 200, y: 440 },
          properties: { tag: "K1", In: 18, poles: 3 },
        },
      ],
      edges: [
        { id: "e1", source: "DJ-GERAL", target: "DJ-MOTOR", kind: "power" },
        { id: "e2", source: "DJ-MOTOR", target: "K1", kind: "power" },
      ],
    });

    const report = validateAndParseExternalPayload(bundleJson);
    expect(report.canImport).toBe(true);

    const doc = convertBundleToDiagramDoc(report.bundle!);

    // Verifica que in_A foi rigorosamente preenchido
    expect((doc.nodes["DJ-GERAL"].params as any).in_A).toBe(63);
    expect((doc.nodes["DJ-MOTOR"].params as any).in_A).toBe(20);
    expect((doc.nodes["K1"].params as any).in_A).toBe(18);

    // Valida com o DiagramDocSchema completo
    const parsedDoc = DiagramDocSchema.parse(doc);
    expect(parsedDoc.nodes["DJ-GERAL"]).toBeDefined();

    // Ingestão no UnifiedProjectStore não pode lançar ZodError
    expect(() => {
      useUnifiedProjectStore.getState().ingestDiagramDocChange(parsedDoc);
    }).not.toThrow();
  });
});
