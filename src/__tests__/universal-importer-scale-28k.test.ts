// Scale, Performance & Acceptance Test Suite for Universal Importer
// Validates 28,000+ line industrial project support, Zero AI credits, Zero Trust security,
// preservation of topology, no silent truncation, and configurable limits enforcement.

import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  validateAndParseExternalPayload,
  convertBundleToDiagramDoc,
  convertBundleToIndustrialElements,
  convertBundleToLadderRungs,
  detectFormat,
} from "../lib/importer/universal-importer";
import { parseStructuredText } from "../lib/importer/adapters/st-adapter";
import { parseTxtSpecification } from "../lib/importer/adapters/txt-spec-adapter";
import { scanPayloadSecurity } from "../lib/importer/security-validator";
import { DEFAULT_IMPORTER_LIMITS } from "../lib/importer/types";

describe("Universal Importer - 28,000+ Line Industrial Scale Acceptance", () => {
  const fixturePath = path.resolve(__dirname, "fixtures/benchmark-project-28k.json");
  const rawContent = fs.readFileSync(fixturePath, "utf-8");
  const lineCount = rawContent.split(/\r?\n/).length;

  it("fixture contains at least 28,000 lines as required by specification", () => {
    expect(lineCount).toBeGreaterThanOrEqual(28000);
    expect(lineCount).toBe(44399); // Exactly 44,399 lines in reference industrial project
  });

  it("detects json-bundle format automatically for the 28k+ file", () => {
    const format = detectFormat(rawContent);
    expect(format).toBe("json-bundle");
  });

  it("operates 100% deterministically with 0 AI API calls and 0 credit consumption", () => {
    // Espionar chamadas a provedores de rede / IA
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const report = validateAndParseExternalPayload(rawContent);

    // Valida que NENHUMA requisição externa ou chamada ao Gemini/OpenAI ocorreu
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report.isValid).toBe(true);
    expect(report.canImport).toBe(true);

    fetchSpy.mockRestore();
  });

  it("executes validation and parsing within acceptable high-performance bounds (< 3000 ms)", () => {
    const startTime = performance.now();
    const report = validateAndParseExternalPayload(rawContent);
    const durationMs = performance.now() - startTime;

    expect(report.canImport).toBe(true);
    // Deve processar as 44.000+ linhas confortavelmente abaixo de 3 segundos
    expect(durationMs).toBeLessThan(3000);
    expect(report.stats.lineCount).toBe(lineCount);
    expect(report.stats.payloadBytes).toBeGreaterThan(500 * 1024); // ~1 MB
  });

  it("guarantees zero silent truncation: all 1,075 nodes and 1,074 edges preserved", () => {
    const report = validateAndParseExternalPayload(rawContent);
    const bundle = report.bundle!;

    expect(bundle.nodes.length).toBe(1075);
    expect(report.stats.totalNodes).toBe(1075);
    expect(report.stats.recognizedNodes).toBe(1075);
    expect(report.stats.rejectedNodes).toBe(0);

    expect(bundle.edges.length).toBe(1074);
    expect(report.stats.totalEdges).toBe(1074);
    expect(report.stats.validEdges).toBe(1074);
    expect(report.stats.rejectedEdges).toBe(0);

    expect(bundle.ladder?.rungs.length).toBe(265);
    expect(report.stats.ladderRungsCount).toBe(265);

    expect(bundle.tags?.length).toBe(1060);
    expect(report.stats.tagsCount).toBe(1060);

    // Verificar que nós específicos da topologia estão presentes e íntegros
    const subestacao = bundle.nodes.find((n) => n.id === "SUBESTACAO-13KV");
    expect(subestacao).toBeDefined();
    expect(subestacao?.type).toBe("transformer");
    expect(subestacao?.properties?.power_kVA).toBe(1000);
    expect(subestacao?.properties?.primary_kV).toBe(13.8);

    const qg = bundle.nodes.find((n) => n.id === "DJ-GERAL-QGBT");
    expect(qg).toBeDefined();
    expect(qg?.type).toBe("breaker");
    expect(qg?.properties?.In).toBe(1600);

    // Verificar nós de motor nos 6 CCMs
    const motor1 = bundle.nodes.find((n) => n.id === "MOTOR-M001");
    expect(motor1).toBeDefined();
    expect(motor1?.type).toBe("motor");
    expect(motor1?.properties?.power_kW).toBe(3.7);
    expect(motor1?.properties?.in_A).toBe(7);
    expect(motor1?.properties?.rpm).toBe(1750);

    const motor265 = bundle.nodes.find((n) => n.id === "MOTOR-M265");
    expect(motor265).toBeDefined();
    expect(motor265?.type).toBe("motor");

    // Verificar conexões íntegras da subestação
    const edgeEntrada = bundle.edges.find(
      (e) => e.source === "SUBESTACAO-13KV" && e.target === "DJ-GERAL-QGBT",
    );
    expect(edgeEntrada).toBeDefined();
    expect(edgeEntrada?.circuitConfig).toBe("3F+N+PE");
  });

  it("converts 28k+ bundle into real DiagramDoc (WebGL Canvas) without loss of elements", () => {
    const report = validateAndParseExternalPayload(rawContent);
    const bundle = report.bundle!;

    const doc = convertBundleToDiagramDoc(bundle);

    expect(Object.keys(doc.nodes).length).toBe(1075);
    expect(Object.keys(doc.edges).length).toBe(1074);

    // Valida que os nós possuem posições e parâmetros elétricos
    const subestacaoDoc = doc.nodes["SUBESTACAO-13KV"];
    expect(subestacaoDoc).toBeDefined();
    expect(subestacaoDoc.position.x).toBe(500);
    expect(subestacaoDoc.position.y).toBe(50);

    const motorDoc = doc.nodes["MOTOR-M001"];
    expect(motorDoc).toBeDefined();
    expect((motorDoc.params as any).power_kW).toBe(3.7);
  });

  it("converts 28k+ bundle into Industrial Elements and Ladder Rungs", () => {
    const report = validateAndParseExternalPayload(rawContent);
    const bundle = report.bundle!;

    const { nodes, edges } = convertBundleToIndustrialElements(bundle);
    expect(nodes.length).toBe(1075);
    expect(edges.length).toBe(1074);

    const rungs = convertBundleToLadderRungs(bundle);
    expect(rungs.length).toBe(265);
    expect(rungs[0].label).toContain("Intertravamento Motor M001");
    expect(rungs[0].cells.length).toBeGreaterThan(0);
  });

  it("cleanly rejects when configurable line limits are exceeded, informing the reason", () => {
    // Configura limite estrito de 20.000 linhas (menor que as 44.399 do arquivo)
    const report = validateAndParseExternalPayload(rawContent, {
      maxLines: 20000,
    });

    expect(report.isValid).toBe(false);
    expect(report.canImport).toBe(false);

    const lineIssue = report.issues.find(
      (i) => i.id === "line-count-exceeded" || i.id === "sec-size",
    );
    expect(lineIssue).toBeDefined();
    expect(lineIssue?.message).toContain("20.000");
    expect(lineIssue?.rejected).toBe(true);
  });

  it("cleanly rejects when configurable node count limit is exceeded", () => {
    // Configura limite de 500 nós (arquivo tem 1075)
    const report = validateAndParseExternalPayload(rawContent, {
      maxNodes: 500,
    });

    expect(report.canImport).toBe(false);
    const nodeIssue = report.issues.find((i) => i.id === "node-limit-exceeded");
    expect(nodeIssue).toBeDefined();
    expect(nodeIssue?.message).toContain("1.075");
    expect(nodeIssue?.message).toContain("500");
  });

  it("cleanly rejects when configurable edge count limit is exceeded", () => {
    // Configura limite de 500 edges (arquivo tem 1074)
    const report = validateAndParseExternalPayload(rawContent, {
      maxEdges: 500,
    });

    expect(report.canImport).toBe(false);
    const edgeIssue = report.issues.find((i) => i.id === "edge-limit-exceeded");
    expect(edgeIssue).toBeDefined();
    expect(edgeIssue?.message).toContain("1.074");
    expect(edgeIssue?.message).toContain("500");
  });
});

describe("Universal Importer - Automation & Specialized Parsers (ST/SCL & TXT)", () => {
  it("parses IEC 61131-3 Structured Text (ST/SCL) deterministically without code execution", () => {
    const stCode = `
      PROGRAM ConveyorControl
      VAR_INPUT
        Start_PB AT %IX0.0 : BOOL;
        Stop_PB AT %IX0.1 : BOOL;
        Sensor_PE1 AT %IX0.2 : BOOL;
        Thermal_OL AT %IX0.3 : BOOL;
      END_VAR
      VAR_OUTPUT
        KM_Motor1 AT %QX0.0 : BOOL;
        Lamp_Run AT %QX0.1 : BOOL;
        Lamp_Fault AT %QX0.2 : BOOL;
      END_VAR
      VAR
        Speed_RPM : REAL := 1750.0;
        Timer1 : TON;
      END_VAR

      // Lógica de comando
      KM_Motor1 := (Start_PB OR KM_Motor1) AND NOT Stop_PB AND NOT Thermal_OL;
      Lamp_Run := KM_Motor1;
      Lamp_Fault := Thermal_OL;

      // Temporizador de partida
      Timer1(IN := Start_PB, PT := T#5s);

      END_PROGRAM
    `;

    // Detect format
    expect(detectFormat(stCode)).toBe("st-program");

    // Parse ST
    const res = parseStructuredText(stCode);
    expect(res.success).toBe(true);
    expect(res.bundle).toBeDefined();

    const b = res.bundle!;
    expect(b.project.name).toBe("ConveyorControl");
    expect(b.tags?.length).toBe(9); // 4 inputs, 3 outputs, 2 internal

    // Verifica que tags com endereços foram extraídas
    const startTag = b.tags?.find((t) => t.name === "Start_PB");
    expect(startTag?.address).toBe("%IX0.0");
    expect(startTag?.type).toBe("BOOL");

    // Verifica PLC rack gerado
    expect(b.plc?.modules?.length).toBeGreaterThan(0);

    // Verifica Rungs Ladder geradas a partir da lógica ST
    expect(b.ladder?.rungs.length).toBeGreaterThanOrEqual(3);
    const motorRung = b.ladder?.rungs.find((r) => r.output.operand === "KM_Motor1");
    expect(motorRung).toBeDefined();
    expect(motorRung?.output.kind).toBe("OTE");

    // Verifica Timer Rung
    const timerRung = b.ladder?.rungs.find((r) => r.output.operand === "Timer1");
    expect(timerRung).toBeDefined();
    expect(timerRung?.output.kind).toBe("TON");
    expect(timerRung?.output.params?.preset).toBe(5000);
  });

  it("parses TXT structured technical specifications and Markdown tables", () => {
    const txtSpec = `
PROJETO: Subestação Primária e CCM 01
TENSAO: 380V
NORMA: NBR 5410

COMPONENTES:
- TR1: transformador | potencia=150kVA | primario=13.8kV | secundario=380V
- QG1: disjuntor | In=250A | curva=C | polos=3
- KM1: contator | In=80A
- FT1: rele | faixa=50-65A
- M1: motor | potencia=37kW | In=70A | polos=4
- M2: motor | potencia=15kW | In=29.5A | polos=4

LIGACOES:
- TR1 -> QG1 (power)
- QG1 -> KM1 (power)
- KM1 -> FT1 (power)
- FT1 -> M1 (power)
    `;

    expect(detectFormat(txtSpec)).toBe("txt-spec");

    const res = parseTxtSpecification(txtSpec);
    expect(res.success).toBe(true);
    expect(res.bundle).toBeDefined();

    const b = res.bundle!;
    expect(b.project.name).toBe("Subestação Primária e CCM 01");
    expect(b.project.systemVoltageV).toBe(380);
    expect(b.nodes.length).toBeGreaterThanOrEqual(6);
    expect(b.edges.length).toBe(4);

    const m1 = b.nodes.find((n) => n.id === "M1");
    expect(m1?.type).toBe("motor");
    expect(m1?.properties?.power_kW).toBe(37);
    expect(m1?.properties?.in_A).toBe(70);
  });

  it("parses TXT Markdown table load list with feeders", () => {
    const tableSpec = `
# Lista de Cargas da Fábrica
| Tag | Tipo | Potência (kW) | Tensão (V) | Corrente (A) | Alimentador |
| M1  | motor | 45 | 380 | 85 | Q1 |
| M2  | motor | 30 | 380 | 58 | Q2 |
| Q1  | disjuntor | 0 | 380 | 100 | BARRA |
| Q2  | disjuntor | 0 | 380 | 70 | BARRA |
| BARRA | busbar | 0 | 380 | 630 | GERAL |
    `;

    expect(detectFormat(tableSpec)).toBe("txt-spec");

    const res = parseTxtSpecification(tableSpec);
    expect(res.success).toBe(true);
    const b = res.bundle!;
    expect(b.nodes.length).toBeGreaterThanOrEqual(5);

    const m1 = b.nodes.find((n) => n.id === "M1");
    expect(m1?.type).toBe("motor");
    expect(m1?.properties?.power_kW).toBe(45);
  });
});
