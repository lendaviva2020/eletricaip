// Gradual Performance & Scale Benchmark: Textual Import vs Topological Integrity
// Tests 4 escalating scales: Small (~150 lines), Medium (~1,500 lines), Large (~6,000 lines), Industrial (44,399 lines).
// Validates parse duration (ms), lines/second throughput, zero truncation, and conversion to DiagramDoc and Ladder rungs.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  validateAndParseExternalPayload,
  convertBundleToDiagramDoc,
  convertBundleToLadderRungs,
  convertBundleToIndustrialElements,
} from "../lib/importer/universal-importer";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleEdge,
  type BundleLadderRung,
  type BundleNode,
  type BundleTag,
  type EletricAiCanvasBundle,
} from "../lib/importer/types";

// Helper to create synthetic industrial projects with N motor feeders
function generateSyntheticBundle(feederCount: number, name: string): EletricAiCanvasBundle {
  const nodes: BundleNode[] = [];
  const edges: BundleEdge[] = [];
  const tags: BundleTag[] = [];
  const rungs: BundleLadderRung[] = [];

  // Substation
  nodes.push({
    id: "SUBESTACAO-13KV",
    type: "transformer",
    label: "Transformador MT/BT 13.8kV/380V - 1000kVA",
    position: { x: 500, y: 50 },
    properties: {
      tag: "TR-01",
      power_kVA: 1000,
      primary_kV: 13.8,
      secondary_V: 380,
    },
  });

  nodes.push({
    id: "DJ-GERAL-QGBT",
    type: "breaker",
    label: "Disjuntor Aberto Geral BT 1600A",
    position: { x: 500, y: 180 },
    properties: { tag: "QG-01", In: 1600, poles: 3 },
  });

  edges.push({
    id: "edge-tr-qg",
    source: "SUBESTACAO-13KV",
    target: "DJ-GERAL-QGBT",
    kind: "power",
  });

  nodes.push({
    id: "BARRA-GERAL-QGBT",
    type: "busbar",
    label: "Barramento Geral de Cobre 2000A",
    position: { x: 500, y: 300 },
    properties: { tag: "BARRA-01", voltage_V: 380, In_A: 2000 },
  });

  edges.push({
    id: "edge-qg-barra",
    source: "DJ-GERAL-QGBT",
    target: "BARRA-GERAL-QGBT",
    kind: "power",
  });

  const ccmCount = Math.max(1, Math.ceil(feederCount / 30));
  let globalFeederIdx = 1;

  for (let c = 0; c < ccmCount; c++) {
    const ccmId = `CCM-0${c + 1}`;
    const feedersInCcm = Math.min(30, feederCount - (globalFeederIdx - 1));
    const ccmX = 200 + c * 350;

    const djCcmId = `DJ-${ccmId}`;
    nodes.push({
      id: djCcmId,
      type: "breaker",
      label: `Disjuntor Caixa Moldada 400A - ${ccmId}`,
      position: { x: ccmX, y: 450 },
      properties: { tag: `Q-${ccmId}`, In: 400, poles: 3 },
    });

    edges.push({
      id: `edge-barra-${djCcmId}`,
      source: "BARRA-GERAL-QGBT",
      target: djCcmId,
      kind: "power",
    });

    const barraCcmId = `BARRA-${ccmId}`;
    nodes.push({
      id: barraCcmId,
      type: "busbar",
      label: `Barramento 630A ${ccmId}`,
      position: { x: ccmX, y: 580 },
      properties: { tag: `BARRA-${ccmId}`, voltage_V: 380 },
    });

    edges.push({
      id: `edge-${djCcmId}-${barraCcmId}`,
      source: djCcmId,
      target: barraCcmId,
      kind: "power",
    });

    for (let f = 0; f < feedersInCcm; f++) {
      const idx = globalFeederIdx++;
      const idPad = String(idx).padStart(3, "0");
      const feederX = ccmX - 100 + (f % 5) * 60;
      const feederY = 700 + Math.floor(f / 5) * 450;

      const djId = `DJ-MOT-${idPad}`;
      nodes.push({
        id: djId,
        type: "breaker",
        label: `Disjuntor-Motor ${idPad}`,
        position: { x: feederX, y: feederY },
        properties: { tag: `QM-${idPad}`, In: 16 },
      });

      edges.push({
        id: `edge-${barraCcmId}-${djId}`,
        source: barraCcmId,
        target: djId,
        kind: "power",
      });

      const contId = `K-MOT-${idPad}`;
      nodes.push({
        id: contId,
        type: "contactor",
        label: `Contator Potência ${idPad}`,
        position: { x: feederX, y: feederY + 80 },
        properties: { tag: `KM-${idPad}`, In: 18 },
      });

      edges.push({
        id: `edge-${djId}-${contId}`,
        source: djId,
        target: contId,
        kind: "power",
      });

      const motId = `MOTOR-M${idPad}`;
      nodes.push({
        id: motId,
        type: "motor",
        label: `Motor Trifásico M${idPad}`,
        position: { x: feederX, y: feederY + 160 },
        properties: { tag: `M-${idPad}`, power_kW: 7.5, rpm: 1750 },
      });

      edges.push({
        id: `edge-${contId}-${motId}`,
        source: contId,
        target: motId,
        kind: "power",
      });

      // Ladder Rung
      rungs.push({
        id: `rung-m${idPad}`,
        comment: `Partida Motor M${idPad}`,
        output: {
          kind: "OTE",
          operand: `KM_M${idPad}`,
        },
        branches: [
          [
            { kind: "XIC", operand: `CMD_LIGA_M${idPad}` },
            { kind: "XIO", operand: `EMERGENCIA` },
          ],
        ],
      });

      // Tags
      tags.push({ name: `CMD_LIGA_M${idPad}`, type: "BOOL", address: `%IX0.${idx % 8}` });
      tags.push({ name: `KM_M${idPad}`, type: "BOOL", address: `%QX0.${idx % 8}` });
    }
  }

  return {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    metadata: {
      generator: "EletricAi Scale Benchmark Generator",
      notes: "Benchmark",
      generatedAt: new Date().toISOString(),
    },
    project: {
      name,
      description: `Projeto Benchmark com ${feederCount} alimentadores e ${nodes.length} nós`,
      diagramType: "unifilar",
    },
    nodes,
    edges,
    tags,
    ladder: {
      rungs,
    },
  };
}

describe("Gradual Performance Benchmark - Textual Import Scale", () => {
  const benchmarkResults: Array<{
    scale: string;
    lineCount: number;
    byteSizeKb: number;
    nodeCount: number;
    edgeCount: number;
    rungCount: number;
    parseTimeMs: number;
    throughputLinesPerSec: number;
    diagramConversionMs: number;
  }> = [];

  it("Scale 1 (Pequeno): ~150 linhas, ~14 nós, ~14 conexões", () => {
    const bundle = generateSyntheticBundle(3, "Projeto Pequeno - 3 Alimentadores");
    const jsonStr = JSON.stringify(bundle, null, 2);
    const lineCount = jsonStr.split(/\r?\n/).length;

    const t0 = performance.now();
    const report = validateAndParseExternalPayload(jsonStr);
    const parseTimeMs = performance.now() - t0;

    expect(report.isValid).toBe(true);
    expect(report.canImport).toBe(true);
    expect(report.stats.totalNodes).toBe(bundle.nodes.length);
    expect(report.stats.totalEdges).toBe(bundle.edges.length);
    expect(report.stats.rejectedNodes).toBe(0);
    expect(report.stats.rejectedEdges).toBe(0);

    const tDoc0 = performance.now();
    const doc = convertBundleToDiagramDoc(report.bundle!);
    const diagramConversionMs = performance.now() - tDoc0;

    expect(Object.keys(doc.nodes).length).toBe(bundle.nodes.length);
    expect(Object.keys(doc.edges).length).toBe(bundle.edges.length);

    const throughput = Math.round((lineCount / Math.max(0.1, parseTimeMs)) * 1000);
    benchmarkResults.push({
      scale: "Pequeno (Tier 1)",
      lineCount,
      byteSizeKb: Math.round(Buffer.byteLength(jsonStr) / 1024),
      nodeCount: bundle.nodes.length,
      edgeCount: bundle.edges.length,
      rungCount: bundle.ladder?.rungs.length || 0,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
      throughputLinesPerSec: throughput,
      diagramConversionMs: Math.round(diagramConversionMs * 100) / 100,
    });
  });

  it("Scale 2 (Médio): ~1.200 linhas, ~100 nós, ~100 conexões", () => {
    const bundle = generateSyntheticBundle(25, "Projeto Médio - 25 Alimentadores");
    const jsonStr = JSON.stringify(bundle, null, 2);
    const lineCount = jsonStr.split(/\r?\n/).length;

    const t0 = performance.now();
    const report = validateAndParseExternalPayload(jsonStr);
    const parseTimeMs = performance.now() - t0;

    expect(report.isValid).toBe(true);
    expect(report.canImport).toBe(true);
    expect(report.stats.totalNodes).toBe(bundle.nodes.length);
    expect(report.stats.totalEdges).toBe(bundle.edges.length);
    expect(report.stats.rejectedNodes).toBe(0);
    expect(report.stats.rejectedEdges).toBe(0);

    const tDoc0 = performance.now();
    const doc = convertBundleToDiagramDoc(report.bundle!);
    const diagramConversionMs = performance.now() - tDoc0;

    expect(Object.keys(doc.nodes).length).toBe(bundle.nodes.length);
    expect(Object.keys(doc.edges).length).toBe(bundle.edges.length);

    const throughput = Math.round((lineCount / Math.max(0.1, parseTimeMs)) * 1000);
    benchmarkResults.push({
      scale: "Médio (Tier 2)",
      lineCount,
      byteSizeKb: Math.round(Buffer.byteLength(jsonStr) / 1024),
      nodeCount: bundle.nodes.length,
      edgeCount: bundle.edges.length,
      rungCount: bundle.ladder?.rungs.length || 0,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
      throughputLinesPerSec: throughput,
      diagramConversionMs: Math.round(diagramConversionMs * 100) / 100,
    });
  });

  it("Scale 3 (Grande): ~4.500 linhas, ~370 nós, ~370 conexões", () => {
    const bundle = generateSyntheticBundle(90, "Projeto Grande - 90 Alimentadores");
    const jsonStr = JSON.stringify(bundle, null, 2);
    const lineCount = jsonStr.split(/\r?\n/).length;

    const t0 = performance.now();
    const report = validateAndParseExternalPayload(jsonStr);
    const parseTimeMs = performance.now() - t0;

    expect(report.isValid).toBe(true);
    expect(report.canImport).toBe(true);
    expect(report.stats.totalNodes).toBe(bundle.nodes.length);
    expect(report.stats.totalEdges).toBe(bundle.edges.length);
    expect(report.stats.rejectedNodes).toBe(0);
    expect(report.stats.rejectedEdges).toBe(0);

    const tDoc0 = performance.now();
    const doc = convertBundleToDiagramDoc(report.bundle!);
    const diagramConversionMs = performance.now() - tDoc0;

    expect(Object.keys(doc.nodes).length).toBe(bundle.nodes.length);
    expect(Object.keys(doc.edges).length).toBe(bundle.edges.length);

    const throughput = Math.round((lineCount / Math.max(0.1, parseTimeMs)) * 1000);
    benchmarkResults.push({
      scale: "Grande (Tier 3)",
      lineCount,
      byteSizeKb: Math.round(Buffer.byteLength(jsonStr) / 1024),
      nodeCount: bundle.nodes.length,
      edgeCount: bundle.edges.length,
      rungCount: bundle.ladder?.rungs.length || 0,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
      throughputLinesPerSec: throughput,
      diagramConversionMs: Math.round(diagramConversionMs * 100) / 100,
    });
  });

  it("Scale 4 (Industrial Máximo): 44.399 linhas (> 28k), 1.075 nós, 1.074 conexões, 265 rungs", () => {
    const fixturePath = path.resolve(__dirname, "fixtures/benchmark-project-28k.json");
    const jsonStr = fs.readFileSync(fixturePath, "utf-8");
    const lineCount = jsonStr.split(/\r?\n/).length;

    expect(lineCount).toBeGreaterThanOrEqual(28000);

    const t0 = performance.now();
    const report = validateAndParseExternalPayload(jsonStr);
    const parseTimeMs = performance.now() - t0;

    expect(report.isValid).toBe(true);
    expect(report.canImport).toBe(true);
    expect(report.stats.totalNodes).toBe(1075);
    expect(report.stats.totalEdges).toBe(1074);
    expect(report.stats.ladderRungsCount).toBe(265);
    expect(report.stats.tagsCount).toBe(1060);
    expect(report.stats.rejectedNodes).toBe(0);
    expect(report.stats.rejectedEdges).toBe(0);

    const tDoc0 = performance.now();
    const doc = convertBundleToDiagramDoc(report.bundle!);
    const diagramConversionMs = performance.now() - tDoc0;

    const rungs = convertBundleToLadderRungs(report.bundle!);
    expect(rungs.length).toBe(265);

    expect(Object.keys(doc.nodes).length).toBe(1075);
    expect(Object.keys(doc.edges).length).toBe(1074);

    const throughput = Math.round((lineCount / Math.max(0.1, parseTimeMs)) * 1000);
    benchmarkResults.push({
      scale: "Industrial (Tier 4 / 28k+)",
      lineCount,
      byteSizeKb: Math.round(Buffer.byteLength(jsonStr) / 1024),
      nodeCount: 1075,
      edgeCount: 1074,
      rungCount: 265,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
      throughputLinesPerSec: throughput,
      diagramConversionMs: Math.round(diagramConversionMs * 100) / 100,
    });

    // Imprime tabela consolidada no console para registro
    console.table(benchmarkResults);
  });
});
