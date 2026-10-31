// WCAG 2.2 Contrast & Accessibility Computation Engine
// Follows W3C Recommendation for Relative Luminance and Contrast Ratio.

export interface RgbColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

/**
 * Normaliza uma cor HEX (#RGB, #RRGGBB) para RGB.
 */
export function hexToRgb(hex: string): RgbColor {
  let clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calcula a luminância relativa (0 a 1) segundo a fórmula WCAG 2.2.
 */
export function getRelativeLuminance(color: string | RgbColor): number {
  const rgb = typeof color === "string" ? hexToRgb(color) : color;
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((val) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calcula a razão de contraste entre duas cores (entre 1:1 e 21:1).
 */
export function getContrastRatio(colorA: string | RgbColor, colorB: string | RgbColor): number {
  const l1 = getRelativeLuminance(colorA);
  const l2 = getRelativeLuminance(colorB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Verifica conformidade com WCAG 2.2 nível AA.
 * - Texto normal: razão mínima de 4.5:1
 * - Texto grande (>= 18pt ou >= 14pt bold): razão mínima de 3:1
 * - Elementos de interface e gráficos: razão mínima de 3:1
 */
export function checkWcagCompliance(
  foreground: string | RgbColor,
  background: string | RgbColor,
  isLargeTextOrUi = false,
): { ratio: number; passesAa: boolean; passesAaa: boolean } {
  const ratio = getContrastRatio(foreground, background);
  const aaMin = isLargeTextOrUi ? 3.0 : 4.5;
  const aaaMin = isLargeTextOrUi ? 4.5 : 7.0;

  return {
    ratio,
    passesAa: ratio >= aaMin,
    passesAaa: ratio >= aaaMin,
  };
}
