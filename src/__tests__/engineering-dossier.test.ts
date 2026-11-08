// Comprehensive Unit & Integration Tests for ElétricAi Engineering Dossier
// Tests extraction, deterministic calculations, normative checks, 10-group BOM,
// safety approval lock, and multi-format export generation.

import { describe, it, expect } from "vitest";
import { extractCanvasData } from "@/lib/dossier/extractor";
import {
  generateElectricalCalculationMemory,
  computePeSection,
  computeNeutralSection,
  computeVoltageDropWithReactance,
} from "@/lib/dossier/calculations";
import { evaluateNormativeCompliance } from "@/lib/dossier/normative";
import { generateIndustrialBom } from "@/lib/dossier/bom";
import {
  generatePlcopenXml,
  generateStructuredText,
  generateInstructionList,
} from "@/lib/dossier/plcopen";
import { generateEngineeringDossierPdf } from "@/lib/dossier/pdf-builder";
import { buildDossierExcelWorkbook, buildBomCsv } from "@/lib/dossier/export-spreadsheets";
import { assembleCompleteDossier } from "@/lib/dossier/dossier.functions";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import { XLSX } from "@/lib/security/safe-xlsx";

function createMockIndustrialSnapshot(): ProjectSnapshot {
  return {
    schemaVersion: 3,
    project: {
      nodes: [
        {
          id: "trafo_01",
          kind: "transformer",
          label: "Transformador 150 kVA",
          params: { kVA: 150, primary_kV: 13.8, secondary_V: 380 },
          position: { x: 100, y: 50 },
        },
        {
          id: "qg_01",
          kind: "breaker",
          label: "Disjuntor Geral QGD 250A",
          params: { In: 250, poles: 3, curve: "C", icc_kA: 25 },
          position: { x: 100, y: 150 },
        },
        {
          id: "m1",
          kind: "motor",
          label: "Motor Bomba Hidráulica 15 kW",
          params: { P: 15, U: 380, startMethod: "DOL", cosphi: 0.86, efficiency: 0.91 },
          position: { x: 100, y: 300 },
        },
        {
          id: "m2",
          kind: "motor",
          label: "Motor Exaustor 7.5 kW",
          params: { P: 7.5, U: 380, startMethod: "DOL", cosphi: 0.85, efficiency: 0.89 },
          position: { x: 300, y: 300 },
        },
        {
          id: "estop_01",
          kind: "estop",
          label: "Botão de Emergência E-STOP Painel",
          params: { type: "mushroom_twist" },
          position: { x: 500, y: 150 },
        },
      ],
      edges: [
        { id: "e1", source: "trafo_01", target: "qg_01", kind: "power" },
        { id: "e2", source: "qg_01", target: "m1", kind: "power" },
        { id: "e3", source: "qg_01", target: "m2", kind: "power" },
      ],
      tags: {
        SB_ESTOP_1: false,
        KM1_FEEDBACK: false,
        KM2_FEEDBACK: false,
      },
      scadaLayout: { nodes: [], edges: [] },
    },
    voltai: { components: [], edges: [] },
    editor: {
      tags: {},
      rungs: [
        {
          id: "rung-1",
          comment: "Acionamento da Bomba 15kW com intertravamento por E-STOP",
          output: { kind: "OTE", operand: "KM1_COIL" },
          branches: [
            [
              { kind: "XIO", operand: "SB_ESTOP_1" },
              { kind: "XIC", operand: "START_PB_M1" },
            ],
          ],
        },
      ],
      fbdNodes: [],
      fbdEdges: [],
    },
    plc: {
      vendor: "siemens",
      rack: {
        id: "rack-1",
        label: "Bastidor S7-1200",
        modules: [
          {
            slotNumber: 1,
            partNumber: "6ES7214-1AG40-0XB0",
            label: "CPU 1214C DC/DC/DC",
            type: "DI",
            channels: [
              { address: "%I0.0", tag: "SB_ESTOP_1", description: "Botão de Emergência NF" },
              { address: "%I0.1", tag: "START_PB_M1", description: "Botão Liga M1 NA" },
            ],
          },
          {
            slotNumber: 2,
            partNumber: "6ES7222-1BF32-0XB0",
            label: "SM 1222 DQ 8x24Vdc",
            type: "DO",
            channels: [
              { address: "%Q0.0", tag: "KM1_COIL", description: "Bobina do Contator KM1" },
              { address: "%Q0.1", tag: "HL_M1_RUN", description: "Sinaleiro M1 Ligado" },
            ],
          },
        ],
      },
      variables: [],
      programBlocks: [],
      cycleTimeMs: 10,
    },
    studies: {},
    controlBindings: {},
    diagnostics: [],
  };
}

describe("ElétricAi Engineering Dossier — Industrial Suite", () => {
  it("1. Extração fiel do Canvas: identifica nós, potências e estrutura de automação", () => {
    const snap = createMockIndustrialSnapshot();
    const extracted = extractCanvasData({
      projectId: "proj-test-123",
      projectName: "Estação de Bombeamento Industrial",
      clientName: "Siderúrgica Nacional",
      snapshot: snap,
    });

    expect(extracted.projectName).toBe("Estação de Bombeamento Industrial");
    expect(extracted.clientName).toBe("Siderúrgica Nacional");
    expect(extracted.equipments.length).toBeGreaterThanOrEqual(4);

    const m1 = extracted.equipments.find((e) => e.id === "m1");
    expect(m1).toBeDefined();
    expect(m1?.specs.powerKw).toBe(15);
    expect(m1?.category).toBe("load");

    const m2 = extracted.equipments.find((e) => e.id === "m2");
    expect(m2).toBeDefined();
    expect(m2?.specs.powerKw).toBe(7.5);

    // Verifica extração de I/O do CLP
    expect(extracted.plcProgram.ioMappings.length).toBe(4);
    expect(extracted.plcProgram.ioMappings[0].address).toBe("%I0.0");
    expect(extracted.plcProgram.ioMappings[0].symbolicTag).toBe("SB_ESTOP_1");

    // Verifica régua de bornes X1
    expect(extracted.terminals.length).toBeGreaterThan(0);
    const m1Terminals = extracted.terminals.filter(
      (t) => t.externalEquipment.includes("m1") || t.wireTag.includes("m1"),
    );
    expect(m1Terminals.length).toBe(4); // U1, V1, W1, PE
  });

  it("2. Fórmulas determinísticas: PE Tabela 58, Neutro e Queda de Tensão com Reatância", () => {
    // PE conforme NBR 5410 Tabela 58
    expect(computePeSection(2.5)).toBe(2.5);
    expect(computePeSection(10)).toBe(10);
    expect(computePeSection(16)).toBe(16);
    expect(computePeSection(25)).toBe(16);
    expect(computePeSection(35)).toBe(16);
    expect(computePeSection(50)).toBe(25);
    expect(computePeSection(70)).toBe(35);
    expect(computePeSection(95)).toBe(48);

    // Neutro conforme NBR 5410 Tabela 48
    expect(computeNeutralSection(10)).toBe(10);
    expect(computeNeutralSection(25)).toBe(16);
    expect(computeNeutralSection(50)).toBe(25);

    // Queda de tensão: para seção < 35 mm², reatância é zero
    const dropSmall = computeVoltageDropWithReactance({
      currentA: 20,
      lengthM: 30,
      sectionMm2: 4,
      voltageV: 380,
    });
    expect(dropSmall.reactanceOhmPerM).toBe(0);
    expect(dropSmall.dropPct).toBeLessThan(3.0);

    // Queda de tensão: para seção >= 35 mm², reatância indutiva XL=0.08 mΩ/m é somada
    const dropLarge = computeVoltageDropWithReactance({
      currentA: 150,
      lengthM: 60,
      sectionMm2: 70,
      voltageV: 380,
    });
    expect(dropLarge.reactanceOhmPerM).toBe(0.00008);
    expect(dropLarge.dropV).toBeGreaterThan(0);
  });

  it("3. Memória de Cálculo Completa: dimensiona condutores, ampacidade corrigida e coordenação Ib <= In <= I'z", () => {
    const snap = createMockIndustrialSnapshot();
    const extracted = extractCanvasData({ snapshot: snap });
    const memory = generateElectricalCalculationMemory(extracted);

    expect(memory.circuits.length).toBeGreaterThanOrEqual(2);
    expect(memory.summary.totalInstalledPowerKw).toBe(22.5); // 15 + 7.5 kW
    expect(memory.summary.totalDemandPowerKw).toBeGreaterThan(15);
    expect(memory.summary.mainBreakerRatingInA).toBeGreaterThan(0);
    expect(memory.summary.recommendedTransformerKva).toBeGreaterThanOrEqual(30);

    for (const c of memory.circuits) {
      expect(c.designCurrentIbA).toBeGreaterThan(0);
      expect(c.selectedCableMm2).toBeGreaterThanOrEqual(2.5);
      expect(c.correctedAmpacityIzA).toBeGreaterThanOrEqual(c.designCurrentIbA);
      expect(c.ampacityCheckPass).toBe(true);
      expect(c.voltageDropPass).toBe(true);
      expect(c.voltageDropPct).toBeLessThanOrEqual(4.0);
      expect(c.peCableMm2).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("4. Lista de Materiais (BOM): categoriza nos 10 grupos industriais sem duplicidade", () => {
    const snap = createMockIndustrialSnapshot();
    const extracted = extractCanvasData({ snapshot: snap });
    const memory = generateElectricalCalculationMemory(extracted);
    const bom = generateIndustrialBom(extracted, memory);

    expect(bom.length).toBeGreaterThanOrEqual(15);

    // Verifica que contém os grupos essenciais
    const categories = new Set(bom.map((b) => b.category));
    expect(categories.has("1_protecao_eletrica")).toBe(true);
    expect(categories.has("2_manobra_comando")).toBe(true);
    expect(categories.has("3_motores_acionamentos")).toBe(true);
    expect(categories.has("4_clp_modulos_interfaces")).toBe(true);
    expect(categories.has("6_cabos_condutores")).toBe(true);
    expect(categories.has("7_bornes_acessorios")).toBe(true);
    expect(categories.has("8_paineis_barramentos_montagem")).toBe(true);
    expect(categories.has("9_dispositivos_seguranca")).toBe(true);
    expect(categories.has("10_identificacao_documentacao")).toBe(true);

    // Verifica ausência de IDs duplicados
    const ids = bom.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Verifica motor presente
    const motItem = bom.find(
      (b) => b.category === "3_motores_acionamentos" && b.nominalPower?.includes("15 kW"),
    );
    expect(motItem).toBeDefined();
    expect(motItem?.sourceKind).toBe("canvas_identified");
  });

  it("5. Validação Normativa e Trava de Segurança: bloqueia emissão automática se houver pendência crítica", () => {
    // Caso com E-STOP presente
    const safeSnap = createMockIndustrialSnapshot();
    const safeExtracted = extractCanvasData({ snapshot: safeSnap });
    const safeCalc = generateElectricalCalculationMemory(safeExtracted);
    const safeReport = evaluateNormativeCompliance(safeExtracted, safeCalc);

    const estopPass = safeReport.findings.find((f) => f.code === "NR12_12_56_PASS");
    expect(estopPass).toBeDefined();
    expect(estopPass?.status).toBe("VALIDADO");

    // Caso inseguro: remove E-STOP e remove PE para testar disparo da trava
    const unsafeSnap = createMockIndustrialSnapshot();
    unsafeSnap.project.nodes = unsafeSnap.project.nodes.filter((n) => n.kind !== "estop");
    unsafeSnap.editor.rungs = [];
    unsafeSnap.plc.rack.modules = [];

    const unsafeExtracted = extractCanvasData({ snapshot: unsafeSnap });
    const unsafeCalc = generateElectricalCalculationMemory(unsafeExtracted);
    const unsafeReport = evaluateNormativeCompliance(unsafeExtracted, unsafeCalc);

    const estopFail = unsafeReport.findings.find((f) => f.code === "NR12_12_56_FAIL");
    expect(estopFail).toBeDefined();
    expect(estopFail?.status).toBe("REPROVADO");
    expect(estopFail?.severity).toBe("critical");
    expect(unsafeReport.overallStatus).toBe("blocked_by_critical_findings");
  });

  it("6. Geração de Artefatos Multi-Formato: PDF, Excel, CSV, ST e PLCopen XML", () => {
    const snap = createMockIndustrialSnapshot();
    const dossier = assembleCompleteDossier({
      projectId: "proj-456",
      projectName: "Unidade de Britagem Primária",
      clientName: "Mineradora Vale Verde",
      snapshot: snap,
      approval: {
        engineerName: "Eng. Carlos Drumond",
        professionalRegistration: "CREA-MG 123456/D",
        isApproved: true,
      },
    });

    // 1. PDF multi-páginas
    const pdf = generateEngineeringDossierPdf(dossier);
    expect(pdf).toBeDefined();
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(4);

    // 2. Excel multi-abas
    const excelBytes = buildDossierExcelWorkbook(dossier);
    expect(excelBytes.length).toBeGreaterThan(1000);
    const readWb = XLSX.read(excelBytes, { type: "array" });
    expect(readWb.SheetNames).toContain("Lista de Materiais");
    expect(readWb.SheetNames).toContain("Cabos e Condutores");
    expect(readWb.SheetNames).toContain("Régua de Bornes");
    expect(readWb.SheetNames).toContain("Mapa IO CLP");
    expect(readWb.SheetNames).toContain("Memória de Cálculo");

    // 3. CSV
    const csv = buildBomCsv(dossier);
    expect(csv).toContain("Grupo;Tag;Descricao");
    expect(csv).toContain("1. Proteção Elétrica");

    // 4. Structured Text
    const st = generateStructuredText(dossier.plcProgram);
    expect(st).toContain("PROGRAM MainLogic");
    expect(st).toContain("SB_ESTOP_1 AT %I0.0 : BOOL;");
    expect(st).toContain("KM1_COIL AT %Q0.0 : BOOL;");

    // 5. Instruction List
    const il = generateInstructionList(dossier.plcProgram);
    expect(il).toContain("NETWORK 1");

    // 6. PLCopen XML
    const dummyExtracted = extractCanvasData({ snapshot: snap });
    const xml = generatePlcopenXml(dummyExtracted, dossier.plcProgram);
    expect(xml).toContain('xmlns="http://www.plcopen.org/xml/tc6_0201"');
    expect(xml).toContain('<pou name="MainLogic" pouType="program">');
    expect(xml).toContain('<variable name="SB_ESTOP_1" address="%I0.0">');
  });
});
