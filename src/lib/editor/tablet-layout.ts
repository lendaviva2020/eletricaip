// Layout responsivo para tablets industriais (Fase 8.1).
// Abaixo de TABLET_AUTO_COLLAPSE_WIDTH (ex.: 1024x768) as barras laterais
// iniciam recolhidas para liberar a área útil de desenho; o usuário pode
// reabri-las manualmente pelas alças (alvos de toque ampliados).

/** Largura mínima (px) em que as duas barras laterais cabem junto do canvas. */
export const TABLET_AUTO_COLLAPSE_WIDTH = 1280;

/** Largura mínima (px) em que as barras laterais são exibidas (md). */
export const SIDEBAR_MIN_WIDTH = 768;

export function shouldAutoCollapsePanels(viewportWidth: number): boolean {
  return viewportWidth > 0 && viewportWidth < TABLET_AUTO_COLLAPSE_WIDTH;
}
