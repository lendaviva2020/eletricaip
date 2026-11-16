/**
 * Paleta do canvas unifilar/multifilar — tema escuro técnico.
 *
 * Critérios: contraste alto em telas pequenas e ao sol (celular), leitura
 * imediata de "o que é equipamento" (âmbar) × "o que é condutor" (cinza-claro),
 * e cores de estado inequívocas (verde energizado, vermelho falha, ciano
 * seleção — a seleção não usa laranja para não confundir com o âmbar).
 * Condutores do multifilar seguem a convenção NBR 5410 adaptada ao fundo escuro
 * (a fase "preta" é desenhada clara, senão desapareceria).
 */
export const CANVAS_PALETTE = {
  background: 0x0b1220,
  gridMinor: 0x16233a,
  gridMajor: 0x22324f,

  symbol: 0xfbbf24,
  label: 0xe2e8f0,

  wire: 0x94a3b8,
  wireEnergized: 0x22c55e,
  wireDeenergized: 0x475569,
  wireFault: 0xef4444,
  selection: 0x22d3ee,
  junction: 0xcbd5e1,

  port: 0x60a5fa,
  portHover: 0xffffff,
  portStroke: 0x0b1220,

  phaseL1: 0xe5e7eb,
  phaseL2: 0x9ca3af,
  phaseL3: 0xf87171,
  neutral: 0x38bdf8,
  protective: 0x4ade80,

  draft: 0xfbbf24,
  draftSnap: 0x22d3ee,
  marquee: 0x22d3ee,

  badgeOn: 0x22c55e,
  badgeOnStroke: 0x15803d,
  badgeOff: 0xef4444,
  badgeOffStroke: 0xb91c1c,
} as const;

/** Cor CSS equivalente ao fundo (para o contêiner antes do WebGL desenhar). */
export const CANVAS_BACKGROUND_CSS = "#0b1220";

/** Cor de cada condutor do multifilar no tema escuro. */
export function conductorColor(label: string): number {
  switch (label) {
    case "L1":
      return CANVAS_PALETTE.phaseL1;
    case "L2":
      return CANVAS_PALETTE.phaseL2;
    case "L3":
      return CANVAS_PALETTE.phaseL3;
    case "N":
      return CANVAS_PALETTE.neutral;
    case "PE":
      return CANVAS_PALETTE.protective;
    default:
      return CANVAS_PALETTE.wire;
  }
}
