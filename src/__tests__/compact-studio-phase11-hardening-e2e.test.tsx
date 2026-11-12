// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PRODUCT_NAME } from "../lib/compact-studio/branding";
import { MODES } from "../lib/workspace-data";
import { CompactSimulatorPanel } from "../components/compact-studio/compact-simulator-panel";
import { CompactLadCanvas } from "../components/compact-studio/compact-lad-canvas";
import { HardwareConfigurator } from "../components/compact-studio/hardware-configurator";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import { CompactExecutionEngine } from "../lib/compact-studio/runtime";

describe("Fase 11 — Fortalecimento UI, Branding, XSS Safety, Acessibilidade e Integração", () => {
  it("registers compactStudio after studio in MODES and exposes PRODUCT_NAME without trademark leakage", () => {
    const studioIdx = MODES.findIndex((m) => m.id === "studio");
    const compactIdx = MODES.findIndex((m) => m.id === "compactStudio");

    expect(studioIdx).toBeGreaterThanOrEqual(0);
    expect(compactIdx).toBeGreaterThan(studioIdx);
    expect(MODES[compactIdx].label).toBe(PRODUCT_NAME);
    expect(PRODUCT_NAME).not.toMatch(/LOGO!/i);
  });

  it("renders MESSAGE_TEXT payloads safely via React text without executing injected HTML/scripts", () => {
    const base = createEmptyCompactProgramModel({ id: "prog_xss", name: "XSS Safety" });
    const pageId = base.pages[0].id;
    const i1 = createCompactBlockNode({
      id: "i1",
      pageId,
      blockType: "INPUT_DI",
      instanceName: "I1",
    });
    const msg = createCompactBlockNode({
      id: "m1",
      pageId,
      blockType: "MESSAGE_TEXT",
      instanceName: "MSG1",
      params: {
        template: '<img src=x onerror="alert(1)"><script>window.__xss=1</script>FALHA MOTOR',
      },
    });

    const model = {
      ...base,
      nodes: [i1, msg],
      connections: [
        {
          id: "c1",
          pageId,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "m1",
          toPortId: "en",
          signalType: "BOOL" as const,
        },
      ],
    };

    const eng = new CompactExecutionEngine(model);
    eng.setInput("I1", true);
    const frame = eng.step(20);

    const { container } = render(
      <CompactSimulatorPanel
        model={model}
        running={false}
        frame={frame}
        historyFrames={[frame]}
        forcedNodes={{}}
        recording={false}
        onStart={vi.fn()}
        onPause={vi.fn()}
        onStop={vi.fn()}
        onStep={vi.fn()}
        onJumpClockMs={vi.fn()}
        onSetInput={vi.fn()}
        onToggleForce={vi.fn()}
        onToggleRecord={vi.fn()}
        onReplayLastSession={vi.fn()}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("FALHA MOTOR");
    expect(container.textContent).not.toMatch(/LOGO!/);
  });

  it("supports keyboard-accessible Ladder rungs and Hardware rack configurator rendering", () => {
    const model = createEmptyCompactProgramModel({ id: "prog_ui", name: "UI Check" });
    const onChange = vi.fn();

    render(
      <CompactLadCanvas model={model} activePageId={model.pages[0].id} onChangeModel={onChange} />,
    );

    const addBtn = screen.getByRole("button", { name: /Nova Linha/i });
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledTimes(1);

    const nextModel = onChange.mock.calls[0][0];
    expect(nextModel.nodes.length).toBeGreaterThan(0);

    const { container } = render(
      <HardwareConfigurator model={nextModel} onChangeModel={vi.fn()} />,
    );

    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("ELC-CPU-1224-ETH");
  });
});
