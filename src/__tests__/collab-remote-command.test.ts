// #WGL-07 · etapa 3 — applyRemoteCommand aplica sem tocar histórico.
import { describe, expect, it, beforeEach } from "vitest";
import { useDiagramStore } from "@/lib/diagram/store";
import { cmd } from "@/lib/diagram/commands";
import { makeNode } from "@/lib/diagram/model";

describe("#WGL-07 · applyRemoteCommand (collab)", () => {
  beforeEach(() => {
    useDiagramStore.getState().resetDoc();
  });

  it("aplica comando remoto no doc sem gravar no histórico local", () => {
    const node = makeNode({
      sheet: "unifilar",
      position: { x: 10, y: 20 },
      label: "QF-REM",
      params: { kind: "breaker", in_A: 16, curve: "C", poles: 1 },
    });

    useDiagramStore.getState().applyRemoteCommand(cmd.addNode({
      sheet: node.sheet,
      position: node.position,
      label: node.label,
      params: node.params,
    }));

    const state = useDiagramStore.getState();
    expect(Object.values(state.doc.nodes)).toHaveLength(1);
    expect(state.history.past).toHaveLength(0);
    expect(state.canUndo()).toBe(false);
  });

  it("dispatch local ainda grava no histórico normalmente", () => {
    useDiagramStore.getState().dispatch(cmd.addNode({
      sheet: "unifilar",
      position: { x: 0, y: 0 },
      label: "QF-LOC",
      params: { kind: "breaker", in_A: 16, curve: "C", poles: 1 },
    }));
    expect(useDiagramStore.getState().history.past).toHaveLength(1);
  });
});
