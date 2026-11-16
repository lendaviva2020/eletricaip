import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CANVAS_PALETTE, conductorColor } from "@/lib/diagram/render/palette";

/** Razão de contraste WCAG 2.x entre duas cores 0xRRGGBB. */
function contrast(a: number, b: number): number {
  const lum = (c: number) => {
    const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tema escuro do canvas — legibilidade (WCAG)", () => {
  const bg = CANVAS_PALETTE.background;

  it("símbolos (âmbar) e rótulos têm contraste AAA contra o fundo", () => {
    expect(contrast(CANVAS_PALETTE.symbol, bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(CANVAS_PALETTE.label, bg)).toBeGreaterThanOrEqual(7);
  });

  it("condutores e estados são distinguíveis do fundo (≥ 4,5:1)", () => {
    for (const c of [
      CANVAS_PALETTE.wire,
      CANVAS_PALETTE.wireEnergized,
      CANVAS_PALETTE.wireFault,
      CANVAS_PALETTE.selection,
      CANVAS_PALETTE.junction,
    ]) {
      expect(contrast(c, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("todas as fases, neutro e PE do multifilar aparecem no fundo escuro (≥ 3:1)", () => {
    for (const label of ["L1", "L2", "L3", "N", "PE"]) {
      expect(contrast(conductorColor(label), bg), label).toBeGreaterThanOrEqual(3);
    }
    // e são diferentes entre si
    expect(new Set(["L1", "L2", "L3", "N", "PE"].map(conductorColor)).size).toBe(5);
  });

  it("seleção não usa a mesma cor dos equipamentos", () => {
    expect(CANVAS_PALETTE.selection).not.toBe(CANVAS_PALETTE.symbol);
  });
});

describe("canvas acompanha o tamanho real do contêiner (celular)", () => {
  const stage = readFileSync(resolve(__dirname, "../lib/diagram/render/stage.ts"), "utf8");

  it("ResizeObserver redimensiona o RENDERER (não só o viewport) e refaz o enquadramento", () => {
    expect(stage).toContain("this.app.renderer.resize(size.w, size.h)");
    expect(stage).toContain("fitPendingRealSize");
    expect(stage).toContain('addEventListener("orientationchange"');
    expect(stage).toContain('removeEventListener("orientationchange"');
  });

  it("enquadramento em tela estreita mantém escala mínima legível", () => {
    expect(stage).toMatch(/MOBILE_MIN_FIT_SCALE = 0\.4\d/);
    // pela largura do aparelho, não da coluna (no PC a coluna é estreita)
    expect(stage).toContain("window.innerWidth < MOBILE_BREAKPOINT_PX");
  });

  it("sem cores fixas espalhadas: tudo vem da paleta", () => {
    const hexes = stage.match(/0x[0-9a-fA-F]{6}/g) ?? [];
    expect(hexes.every((h) => h.toLowerCase() === "0xffffff")).toBe(true);
  });
});
