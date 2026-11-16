// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { fitCenter, stageResolution } from "@/lib/diagram/render/stage";
import { diagramToSvg, escapeSvgText } from "@/lib/diagram/export-svg";
import { DiagramCompatView } from "@/components/canvases/diagram-compat-view";
import type { DiagramDoc } from "@/lib/diagram/schema";
import { createEmptyDoc } from "@/lib/diagram/model";

function docWith(label: string): DiagramDoc {
  const base = createEmptyDoc();
  return {
    ...base,
    metadata: { ...base.metadata, title: "Teste <script>" },
    nodes: {
      b1: {
        id: "b1",
        sheet: "unifilar",
        position: { x: 0, y: 0 },
        rotation: 0,
        label,
        params: { kind: "busbar", tag: label, voltage_V: 220, current_A: 100 },
      } as unknown as DiagramDoc["nodes"][string],
    },
    edges: {},
  };
}

describe("resolução do canvas no celular", () => {
  it("celular: densidade do aparelho limitada a 2x (evita estourar a memória de vídeo)", () => {
    expect(stageResolution(3.5, 412)).toBe(2);
    expect(stageResolution(2.625, 412)).toBe(2);
    expect(stageResolution(1.5, 412)).toBe(1.5);
  });
  it("PC: no mínimo 2x para nitidez", () => {
    expect(stageResolution(1, 1440)).toBe(2);
    expect(stageResolution(3, 1440)).toBe(3);
    expect(stageResolution(Number.NaN, 1440)).toBe(2);
  });
});

describe("enquadramento com escala travada no celular", () => {
  const big = { minX: 0, minY: 0, centerX: 2000, centerY: 1500, width: 4000, height: 3000 };
  it("desenho maior que a tela: mostra o início (canto superior esquerdo), não o meio vazio", () => {
    const c = fitCenter(big, 0.45, { w: 412, h: 650 });
    expect(c.x).toBeLessThan(600);
    expect(c.y).toBeLessThan(800);
  });
  it("desenho que cabe: centraliza", () => {
    const small = { minX: 0, minY: 0, centerX: 100, centerY: 80, width: 200, height: 160 };
    expect(fitCenter(small, 1, { w: 412, h: 650 })).toEqual({ x: 100, y: 80 });
  });
});

describe("SVG do diagrama", () => {
  it("escapa texto do projeto", () => {
    expect(escapeSvgText(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    const svg = diagramToSvg(docWith("QGBT <b> & cia"), "unifilar");
    expect(svg).toContain("QGBT &lt;b&gt; &amp; cia");
    expect(svg).not.toContain("<script>");
  });
  it("barramento mostra a tensão/corrente DO PROJETO (não mais 380V/630A fixos)", () => {
    const svg = diagramToSvg(docWith("B1"), "unifilar");
    expect(svg).toContain("220 V");
    expect(svg).toContain("100 A");
    expect(svg).not.toContain("630A");
  });
});

describe("modo de compatibilidade do canvas", () => {
  afterEach(() => cleanup());

  it("mostra o diagrama como imagem e permite tentar de novo", () => {
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const onRetry = vi.fn();
    render(
      <DiagramCompatView
        doc={docWith("B1")}
        sheet="unifilar"
        reason="contextlost"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("diagram-compat-view")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:test");
    expect(screen.getByText(/memória de vídeo/)).toBeTruthy();
    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("o canvas trata falha de inicialização e perda de contexto (antes: tela preta)", () => {
    const canvas = readFileSync(
      resolve(__dirname, "../components/canvases/webgl-canvas.tsx"),
      "utf8",
    );
    const stage = readFileSync(resolve(__dirname, "../lib/diagram/render/stage.ts"), "utf8");
    expect(canvas).toMatch(/\.catch\(\(err: unknown\) =>/);
    expect(canvas).toContain('setRenderFailure("init")');
    expect(canvas).toContain("<DiagramCompatView");
    expect(stage).toContain('addEventListener("webglcontextlost"');
    expect(stage).toContain('preference: "webgl"');
  });
});
