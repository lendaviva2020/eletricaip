import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import type { CompactProgramModel } from "../lib/compact-studio/domain/types";
import {
  alignCompactNodes,
  computeOrthogonalEdgeWaypoints,
  copySelectionToClipboard,
  createCompactBlockNode,
  createEmptyCompactHistory,
  getVisibleNodesForViewport,
  pasteClipboardIntoPage,
  pushCompactHistory,
  redoCompactHistory,
  undoCompactHistory,
} from "../lib/compact-studio/editor";
import { HISTORY_LIMIT } from "../lib/diagram/history";

function buildBaseModel(): CompactProgramModel {
  const base = createEmptyCompactProgramModel({ id: "prog_p3", name: "Editor FBD Test" });
  const n1 = createCompactBlockNode({
    id: "n1",
    pageId: base.pages[0].id,
    blockType: "INPUT_DI",
    instanceName: "I1",
  });
  const n2 = createCompactBlockNode({
    id: "n2",
    pageId: base.pages[0].id,
    blockType: "TON",
    instanceName: "T001",
    params: { PT: 1000 },
  });
  const n3 = createCompactBlockNode({
    id: "n3",
    pageId: base.pages[0].id,
    blockType: "OUTPUT_DO",
    instanceName: "Q1",
  });
  return {
    ...base,
    nodes: [n1, n2, n3],
    connections: [
      {
        id: "c1",
        pageId: base.pages[0].id,
        fromNodeId: "n1",
        fromPortId: "out",
        toNodeId: "n2",
        toPortId: "in",
        signalType: "BOOL",
        negatedTarget: false,
      },
      {
        id: "c2",
        pageId: base.pages[0].id,
        fromNodeId: "n2",
        fromPortId: "q",
        toNodeId: "n3",
        toPortId: "in",
        signalType: "BOOL",
        negatedTarget: false,
      },
    ],
    layout: {
      fbd: {
        n1: { x: 40, y: 100, width: 170, height: 96 },
        n2: { x: 260, y: 140, width: 180, height: 110 },
        n3: { x: 520, y: 180, width: 170, height: 96 },
      },
      lad: {},
      edgesFbd: {},
      edgesLad: {},
    },
  };
}

describe("Fase 3 — Editor FBD, Histórico, Clipboard, Alinhamento e Virtualização", () => {
  it("supports undo/redo and coalesces rapid move commands within 200ms", () => {
    const m0 = buildBaseModel();
    const m1 = alignCompactNodes(m0, "FBD", ["n1"], "grid_snap");
    const m2 = {
      ...m1,
      layout: {
        ...m1.layout,
        fbd: { ...m1.layout.fbd, n1: { x: 120, y: 120 } },
      },
    };
    const m3 = {
      ...m2,
      layout: {
        ...m2.layout,
        fbd: { ...m2.layout.fbd, n1: { x: 200, y: 120 } },
      },
    };

    let stack = createEmptyCompactHistory();
    stack = pushCompactHistory(stack, {
      label: "Mover n1 (1)",
      kind: "move",
      notation: "FBD",
      moveDeltas: [{ nodeId: "n1", from: { x: 40, y: 100 }, to: { x: 120, y: 120 } }],
      before: m1,
      after: m2,
      timestamp: 1000,
    });
    stack = pushCompactHistory(stack, {
      label: "Mover n1 (2)",
      kind: "move",
      notation: "FBD",
      moveDeltas: [{ nodeId: "n1", from: { x: 120, y: 120 }, to: { x: 200, y: 120 } }],
      before: m2,
      after: m3,
      timestamp: 1120,
    });

    expect(stack.past).toHaveLength(1);
    expect(stack.past[0].moveDeltas?.[0]?.from.x).toBe(40);
    expect(stack.past[0].moveDeltas?.[0]?.to.x).toBe(200);

    const undone = undoCompactHistory(stack);
    expect(undone.model?.layout.fbd.n1.x).toBe(40);

    const redone = redoCompactHistory(undone.next);
    expect(redone.model?.layout.fbd.n1.x).toBe(200);
  });

  it("caps history length at shared HISTORY_LIMIT", () => {
    const m0 = buildBaseModel();
    let stack = createEmptyCompactHistory();
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) {
      stack = pushCompactHistory(stack, {
        label: `Op ${i}`,
        kind: "structural",
        before: m0,
        after: m0,
        timestamp: i * 500,
      });
    }
    expect(stack.past).toHaveLength(HISTORY_LIMIT);
  });

  it("validates clipboard payload via Zod and remaps IDs cleanly on paste", () => {
    const m0 = buildBaseModel();
    const clip = copySelectionToClipboard(m0, ["n1", "n2"], "FBD");
    expect(clip.nodes).toHaveLength(2);
    expect(clip.connections).toHaveLength(1);

    const { model: m1, pastedNodeIds } = pasteClipboardIntoPage(
      m0,
      clip,
      m0.pages[0].id,
      "FBD",
      "paste1",
      { x: 60, y: 60 },
    );
    expect(pastedNodeIds).toHaveLength(2);
    expect(m1.nodes).toHaveLength(5);
    expect(m1.connections).toHaveLength(3);
    expect(m1.layout.fbd[pastedNodeIds[0]].x).toBe(100);

    expect(() =>
      pasteClipboardIntoPage(
        m0,
        { kind: "malicious", nodes: [{ bad: true }] },
        m0.pages[0].id,
        "FBD",
        "bad",
      ),
    ).toThrow(/CLIPBOARD_SECURITY_ERROR/);
  });

  it("aligns nodes purely visually without altering program connections or logic", () => {
    const m0 = buildBaseModel();
    const alignedTop = alignCompactNodes(m0, "FBD", ["n1", "n2", "n3"], "top");
    expect(alignedTop.layout.fbd.n1.y).toBe(100);
    expect(alignedTop.layout.fbd.n2.y).toBe(100);
    expect(alignedTop.layout.fbd.n3.y).toBe(100);
    expect(alignedTop.connections).toEqual(m0.connections);

    const distributed = alignCompactNodes(m0, "FBD", ["n1", "n2", "n3"], "distribute_v");
    expect(distributed.layout.fbd.n1.y).toBe(100);
    expect(distributed.layout.fbd.n2.y).toBe(140);
    expect(distributed.layout.fbd.n3.y).toBe(180);
  });

  it("computes orthogonal forward and feedback loop waypoints", () => {
    const forward = computeOrthogonalEdgeWaypoints({ x: 100, y: 80 }, { x: 260, y: 140 });
    expect(forward).toHaveLength(4);
    expect(forward[1].x).toBe(180);
    expect(forward[2].y).toBe(140);

    const feedback = computeOrthogonalEdgeWaypoints({ x: 300, y: 140 }, { x: 120, y: 80 });
    expect(feedback.length).toBeGreaterThan(4);
    expect(feedback[2].y).toBeGreaterThan(140);
  });

  it("virtualizes 1,050 blocks in <50ms and switches LOD tier on zoom out", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_1050", name: "Stress 1050" });
    const pageId = base.pages[0].id;
    const nodes = [];
    const fbdLayout: Record<string, { x: number; y: number; width: number; height: number }> = {};

    for (let i = 0; i < 1050; i++) {
      const col = i % 35;
      const row = Math.floor(i / 35);
      const id = `blk_${i}`;
      nodes.push(
        createCompactBlockNode({
          id,
          pageId,
          blockType: i % 2 === 0 ? "AND" : "OR",
          instanceName: `B${i}`,
        }),
      );
      fbdLayout[id] = { x: col * 240, y: row * 160, width: 180, height: 110 };
    }

    const largeModel: CompactProgramModel = {
      ...base,
      nodes,
      layout: { fbd: fbdLayout, lad: {}, edgesFbd: {}, edgesLad: {} },
    };

    const t0 = performance.now();
    const fullView = getVisibleNodesForViewport(largeModel, pageId, "FBD", {
      minX: 0,
      minY: 0,
      maxX: 1200,
      maxY: 800,
      zoom: 1,
    });
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(50);
    expect(fullView.lodLevel).toBe("full");
    expect(fullView.visibleNodes.length).toBeGreaterThan(10);
    expect(fullView.visibleNodes.length).toBeLessThan(100);

    const zoomedOut = getVisibleNodesForViewport(largeModel, pageId, "FBD", {
      minX: 0,
      minY: 0,
      maxX: 2000,
      maxY: 2000,
      zoom: 0.25,
    });
    expect(zoomedOut.lodLevel).toBe("compact");
  });
});
