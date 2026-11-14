import { describe, it, expect } from "vitest";
import { createEmptyDoc, makeNode } from "@/lib/diagram/model";
import { resolveVisualPort } from "@/lib/diagram/render/ports";
import {
  computeDiagramBounds,
  computeEdgeAnnotations,
  computeNodeBoundingBox,
  routeOrthogonalEdge,
  simplifyOrthogonalPoints,
} from "@/lib/diagram/render/wire-router";
import { applyCommand, buildAiPatchCommand, cmd, invertCommand } from "@/lib/diagram/commands";
import { evaluateNormativeEngineeringCompliance } from "@/lib/diagram/connection/graph-validator";
import { convertBundleToDiagramDoc } from "@/lib/importer/universal-importer";
import type { EletricAiCanvasBundle } from "@/lib/importer/types";

describe("P0.1/P0.2/P0.3 — Conectividade Unifilar, Roteamento Ortogonal, Bounds e Normas", () => {
  it("resolveVisualPort mapeia códigos IEC verticais (1/L1, 2/T1, PRI, SEC, taps de barramento) corretamente sem cair em L/R", () => {
    const brkIn = resolveVisualPort("breaker", "1/L1", "target");
    const brkOut = resolveVisualPort("breaker", "2/T1", "source");
    expect(brkIn?.id).toBe("T");
    expect(brkIn?.side).toBe("top");
    expect(brkOut?.id).toBe("B");
    expect(brkOut?.side).toBe("bottom");

    const trPri = resolveVisualPort("transformer", "PRI", "target");
    const trSec = resolveVisualPort("transformer", "SEC", "source");
    expect(trPri?.side).toBe("top");
    expect(trSec?.side).toBe("bottom");

    const busTap = resolveVisualPort("busbar", "TAP2", "source");
    expect(busTap?.side).toBe("bottom");

    const kmOut = resolveVisualPort("contactor", "T2", "source");
    expect(kmOut?.side).toBe("bottom");
  });

  it("routeOrthogonalEdge gera segmentos estritamente ortogonais (90°) e desvia de obstáculos", () => {
    const obstacleNode = makeNode({
      id: "obs_1",
      sheet: "unifilar",
      position: { x: 200, y: 200 },
      label: "Obstacle",
      params: { kind: "breaker", poles: 3, in_A: 63, curve: "C" },
    });
    const obstacleBox = computeNodeBoundingBox(obstacleNode);

    const pts = routeOrthogonalEdge({
      from: { x: 200, y: 80 },
      to: { x: 200, y: 340 },
      srcSide: "bottom",
      tgtSide: "top",
      obstacles: [obstacleBox],
    });

    expect(pts.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = Math.abs(pts[i].x - pts[i + 1].x);
      const dy = Math.abs(pts[i].y - pts[i + 1].y);
      expect(dx < 0.5 || dy < 0.5).toBe(true);
    }

    // Nenhum segmento deve cortar o centro do obstáculo
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const crossesCenterX =
        Math.min(a.x, b.x) <= 200 && Math.max(a.x, b.x) >= 200 && Math.abs(a.y - 200) < 10;
      const crossesCenterY =
        Math.min(a.y, b.y) <= 200 && Math.max(a.y, b.y) >= 200 && Math.abs(a.x - 200) < 10;
      expect(crossesCenterX || crossesCenterY).toBe(false);
    }
  });

  it("routeOrthogonalEdge adapta waypoints manuais quando o componente conectado se move", () => {
    const existing = [
      { x: 100, y: 100 },
      { x: 100, y: 160 },
      { x: 220, y: 160 },
      { x: 220, y: 260 },
    ];
    const adapted = routeOrthogonalEdge({
      from: { x: 125, y: 108 },
      to: { x: 220, y: 260 },
      srcSide: "bottom",
      tgtSide: "top",
      existingWaypoints: existing,
    });

    expect(adapted[0]).toEqual({ x: 125, y: 108 });
    expect(adapted[adapted.length - 1]).toEqual({ x: 220, y: 260 });
    expect(adapted.some((p) => Math.abs(p.y - 160) < 0.5)).toBe(true);
    for (let i = 0; i < adapted.length - 1; i++) {
      expect(
        Math.abs(adapted[i].x - adapted[i + 1].x) < 0.5 ||
          Math.abs(adapted[i].y - adapted[i + 1].y) < 0.5,
      ).toBe(true);
    }
  });

  it("computeEdgeAnnotations gera pontos de junção apenas em derivações/múltiplos condutores e pontes apenas em cruzamentos não conectivos", () => {
    const annotations = computeEdgeAnnotations([
      {
        id: "e1",
        source: "bus1",
        sourcePort: "B1",
        target: "qf1",
        targetPort: "T",
        isBusbarTap: true,
        busbarPoint: { x: 100, y: 100 },
        points: [
          { x: 100, y: 100 },
          { x: 100, y: 220 },
        ],
      },
      {
        id: "e2",
        source: "srcA",
        sourcePort: "R",
        target: "dstA",
        targetPort: "L",
        points: [
          { x: 40, y: 160 },
          { x: 180, y: 160 },
        ],
      },
    ]);

    // Busbar tap no ponto (100,100) -> 1 junção
    expect(annotations.junctions.some((j) => j.x === 100 && j.y === 100)).toBe(true);
    // Cruzamento ortogonal entre e2 (y=160) e e1 (x=100) sem junção -> 1 crossing bridge
    const crossingsOnE2 = annotations.crossingsByEdge.get("e2") ?? [];
    expect(crossingsOnE2.length).toBe(1);
    expect(crossingsOnE2[0]).toEqual({ edgeId: "e2", x: 100, y: 160 });
  });

  it("computeDiagramBounds calcula conteúdo real ignorando NaN/Infinity/sentinels e ajusta waypoints", () => {
    const n1 = makeNode({
      id: "n1",
      sheet: "unifilar",
      position: { x: 200, y: 120 },
      label: "QF-GERAL",
      params: { kind: "breaker", poles: 3, in_A: 100, curve: "C" },
    });
    const n2 = makeNode({
      id: "n2",
      sheet: "unifilar",
      position: { x: 200, y: 360 },
      label: "M1",
      params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
    });
    const corrupt = {
      ...makeNode({
        id: "corrupt",
        sheet: "unifilar",
        position: { x: 0, y: 0 },
        label: "CORRUPT",
        params: { kind: "load", power_W: 1000, voltage_V: 220, fp: 0.92 },
      }),
      position: { x: Number.NaN, y: 9_999_999 },
    };
    const e1 = {
      id: "e1",
      sheet: "unifilar" as const,
      source: "n1",
      target: "n2",
      kind: "power" as const,
      waypoints: [
        { x: 200, y: 146 },
        { x: 340, y: 146 },
        { x: 340, y: 334 },
        { x: 200, y: 334 },
      ],
    };

    const bounds = computeDiagramBounds([n1, n2, corrupt], [e1]);
    expect(bounds).not.toBeNull();
    expect(bounds!.validNodeCount).toBe(2);
    expect(Number.isFinite(bounds!.width)).toBe(true);
    expect(bounds!.maxX).toBeGreaterThanOrEqual(340);
    expect(bounds!.maxX).toBeLessThan(1000);
  });

  it("comandos UpdateEdgeWaypoints e ApplyAiPatch.updateEdges preservam Undo/Redo completo", () => {
    const doc = createEmptyDoc({
      nodes: {
        n1: makeNode({
          id: "n1",
          sheet: "unifilar",
          position: { x: 100, y: 100 },
          params: { kind: "breaker", poles: 3, in_A: 32, curve: "C" },
        }),
        n2: makeNode({
          id: "n2",
          sheet: "unifilar",
          position: { x: 100, y: 240 },
          params: { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL" },
        }),
      },
      edges: {
        e1: {
          id: "e1",
          sheet: "unifilar",
          source: "n1",
          target: "n2",
          kind: "power",
        },
      },
    });

    const wps = [
      { x: 100, y: 126 },
      { x: 140, y: 126 },
      { x: 140, y: 214 },
      { x: 100, y: 214 },
    ];
    const c = cmd.updateEdgeWaypoints("e1", undefined, wps);
    const inv = invertCommand(doc, c)!;
    const updated = applyCommand(doc, c);
    expect(updated.edges.e1?.waypoints?.length).toBe(4);
    const reverted = applyCommand(updated, inv);
    expect(reverted.edges.e1?.waypoints).toBeUndefined();

    // Também via ApplyAiPatch.updateEdges
    const aiCmd = buildAiPatchCommand(doc, {
      rationale: "Teste roteamento",
      addNodes: [],
      addEdges: [],
      updateNodes: [],
      updateEdges: [{ id: "e1", waypoints: wps }],
      removeNodeIds: [],
      removeEdgeIds: [],
    });
    const patched = applyCommand(doc, aiCmd);
    expect(patched.edges.e1?.waypoints).toEqual(wps);
    const aiUndo = invertCommand(patched, aiCmd)!;
    const undone = applyCommand(patched, aiUndo);
    expect(undone.edges.e1?.waypoints).toBeUndefined();
  });

  it("convertBundleToDiagramDoc preserva terminais IEC explícitos e materializa waypoints ortogonais", () => {
    const bundle: EletricAiCanvasBundle = {
      format: "eletricai.canvas-bundle",
      schemaVersion: "1.0.0",
      project: {
        name: "Teste Subestação",
        diagramType: "unifilar",
        systemVoltageV: 380,
      },
      nodes: [
        {
          id: "tr1",
          type: "transformer",
          label: "T1",
          position: { x: 300, y: 120 },
          properties: { kVA: 75, primary_V: 13800, secondary_V: 380 },
        },
        {
          id: "qf1",
          type: "breaker",
          label: "QF1",
          position: { x: 300, y: 260 },
          properties: { poles: 3, in_A: 100, curve: "C" },
        },
      ],
      edges: [
        {
          id: "c1",
          source: "tr1",
          fromTerminal: "sec",
          target: "qf1",
          toTerminal: "1/l1",
          kind: "power",
        },
      ],
    };

    const doc = convertBundleToDiagramDoc(bundle);
    const edge = doc.edges["c1"];
    expect(edge).toBeDefined();
    expect(edge.sourcePort).toBeDefined();
    expect(edge.targetPort).toBeDefined();
    expect(resolveVisualPort("transformer", edge.sourcePort, "source")?.side).toBe("bottom");
    expect(resolveVisualPort("breaker", edge.targetPort, "target")?.side).toBe("top");
    expect(edge.waypoints?.length).toBeGreaterThanOrEqual(2);
    const ortho = simplifyOrthogonalPoints(edge.waypoints ?? []);
    expect(ortho.length).toBeGreaterThanOrEqual(2);
  });

  it("evaluateNormativeEngineeringCompliance não inventa parâmetros ausentes e distingue VALID vs NOT_VERIFIABLE vs REQUIRES_ENGINEERING_REVIEW", () => {
    const incompleteCableDoc = createEmptyDoc({
      nodes: {
        qf: makeNode({
          id: "qf",
          sheet: "unifilar",
          position: { x: 200, y: 100 },
          label: "QF1",
          params: { kind: "breaker", poles: 3, in_A: 32, curve: "C" },
        }),
        m1: makeNode({
          id: "m1",
          sheet: "unifilar",
          position: { x: 200, y: 260 },
          label: "M1",
          params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
        }),
      },
      edges: {
        e1: {
          id: "e1",
          sheet: "unifilar",
          source: "qf",
          sourcePort: "B",
          target: "m1",
          targetPort: "T",
          kind: "power",
        },
      },
    });

    const partialReport = evaluateNormativeEngineeringCompliance(incompleteCableDoc);
    expect(partialReport.overallStatus).toBe("REQUIRES_ENGINEERING_REVIEW");
    expect(partialReport.findings.some((f) => f.status === "NOT_VERIFIABLE")).toBe(true);
    expect(
      partialReport.findings.some(
        (f) => f.standard === "IEC 60204-1" && f.status === "REQUIRES_ENGINEERING_REVIEW",
      ),
    ).toBe(true);

    // Agora com fonte upstream, PE explícito, cabo completo, Icc informada e E-STOP presente -> VALID
    const compliantDoc = createEmptyDoc({
      nodes: {
        tr1: makeNode({
          id: "tr1",
          sheet: "unifilar",
          position: { x: 200, y: 60 },
          label: "TR1",
          params: {
            kind: "transformer",
            kVA: 75,
            primary_V: 13800,
            secondary_V: 380,
            vector: "Dyn11",
          },
        }),
        qf: makeNode({
          id: "qf",
          sheet: "unifilar",
          position: { x: 200, y: 180 },
          label: "QF1",
          params: { kind: "breaker", poles: 3, in_A: 32, curve: "C", icc_kA: 10 },
        }),
        m1: makeNode({
          id: "m1",
          sheet: "unifilar",
          position: { x: 200, y: 320 },
          label: "M1",
          params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
        }),
        pe: makeNode({
          id: "pe",
          sheet: "unifilar",
          position: { x: 340, y: 320 },
          label: "PE",
          params: { kind: "ground" },
        }),
        estop: makeNode({
          id: "estop",
          sheet: "unifilar",
          position: { x: 80, y: 180 },
          label: "S0",
          params: { kind: "estop", category: "0" },
        }),
      },
      edges: {
        e0: {
          id: "e0",
          sheet: "unifilar",
          source: "tr1",
          sourcePort: "B",
          target: "qf",
          targetPort: "T",
          kind: "power",
          cable: { section_mm2: 16, length_m: 10, insulation: "PVC" },
        },
        e1: {
          id: "e1",
          sheet: "unifilar",
          source: "qf",
          sourcePort: "B",
          target: "m1",
          targetPort: "T",
          kind: "power",
          cable: { section_mm2: 4, length_m: 18, insulation: "PVC" },
        },
        e2: {
          id: "e2",
          sheet: "unifilar",
          source: "estop",
          sourcePort: "R",
          target: "qf",
          targetPort: "L",
          kind: "signal",
        },
        e3: {
          id: "e3",
          sheet: "unifilar",
          source: "m1",
          sourcePort: "R",
          target: "pe",
          targetPort: "T",
          kind: "ground",
        },
      },
    });

    const fullReport = evaluateNormativeEngineeringCompliance(compliantDoc);
    expect(fullReport.overallStatus).toBe("VALID");
  });
});
