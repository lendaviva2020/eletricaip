import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import type { CompactProgramModel } from "../lib/compact-studio/domain/types";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import {
  compareCompactPrograms,
  replayCompactSession,
  type CompactRecordedSession,
} from "../lib/compact-studio/sim";

function buildTimedModel(): CompactProgramModel {
  const base = createEmptyCompactProgramModel({ id: "prog_sim", name: "Sim Deterministica" });
  const pageId = base.pages[0].id;
  const i1 = createCompactBlockNode({
    id: "i1",
    pageId,
    blockType: "INPUT_DI",
    instanceName: "I1",
  });
  const ton = createCompactBlockNode({
    id: "t1",
    pageId,
    blockType: "TON",
    instanceName: "T001",
    params: { PT: 100 },
  });
  const q1 = createCompactBlockNode({
    id: "q1",
    pageId,
    blockType: "OUTPUT_QO",
    instanceName: "Q1",
  });

  return {
    ...base,
    cycleTimeMs: 20,
    nodes: [i1, ton, q1],
    connections: [
      {
        id: "c1",
        pageId,
        fromNodeId: "i1",
        fromPortId: "out",
        toNodeId: "t1",
        toPortId: "in",
        signalType: "BOOL",
      },
      {
        id: "c2",
        pageId,
        fromNodeId: "t1",
        fromPortId: "q",
        toNodeId: "q1",
        toPortId: "in",
        signalType: "BOOL",
      },
    ],
  };
}

describe("Fase 8 — Simulação Replay Determinístico e Diff Estrutural", () => {
  it("replays recorded input events and clock jumps bit-for-bit identically", () => {
    const model = buildTimedModel();
    const session: CompactRecordedSession = {
      version: 1,
      baseEpochMs: Date.UTC(2026, 10, 12, 8, 0, 0),
      cycleTimeMs: 20,
      totalDurationMs: 200,
      inputEvents: [
        { atElapsedMs: 20, nameOrAddress: "I1", value: true },
        { atElapsedMs: 180, nameOrAddress: "I1", value: false },
      ],
      clockJumps: [{ atElapsedMs: 160, targetEpochMs: Date.UTC(2026, 10, 12, 12, 0, 0) }],
    };

    const run1 = replayCompactSession(model, session);
    const run2 = replayCompactSession(model, session);

    expect(run1.frames).toHaveLength(10);
    expect(run1.digestHex).toBe(run2.digestHex);
    // At t=120ms (frame index 6), TON PT=100ms after I1 rose at 20ms has turned Q1=true
    expect(run1.frames[6].variables["Q1"]).toBe(true);
    // At t=180ms I1 dropped, Q1 turns off immediately on TON
    expect(run1.finalFrame?.variables["Q1"]).toBe(false);
  });

  it("detects structural diffs (added, removed, modified parameters, negated edges)", () => {
    const rev1 = buildTimedModel();
    const q2 = createCompactBlockNode({
      id: "q2",
      pageId: rev1.pages[0].id,
      blockType: "OUTPUT_QO",
      instanceName: "Q2",
    });

    const rev2: CompactProgramModel = {
      ...rev1,
      nodes: [
        rev1.nodes[0],
        { ...rev1.nodes[1], params: { PT: 250 } }, // Modified PT!
        // q1 removed, q2 added!
        q2,
      ],
      connections: [
        { ...rev1.connections[0], negatedTarget: true },
        {
          id: "c_new",
          pageId: rev1.pages[0].id,
          fromNodeId: "t1",
          fromPortId: "q",
          toNodeId: "q2",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const diff = compareCompactPrograms(rev1, rev2);
    expect(diff.hasChanges).toBe(true);
    expect(diff.addedNodesCount).toBe(1);
    expect(diff.removedNodesCount).toBe(1);
    expect(diff.modifiedNodesCount).toBe(1);
    expect(diff.addedConnectionsCount).toBe(1);
    expect(diff.removedConnectionsCount).toBe(1);
  });
});
