/**
 * Animação da corrente no unifilar/multifilar durante a simulação (puro).
 *
 * Cada condutor energizado mostra "partículas" correndo da origem para a
 * carga; condutor em falta pisca; ao abrir (derrubar) um disjuntor, as
 * partículas do ramal param na hora e o dispositivo dá um pulso visual.
 * Nada aqui é medição: é a visualização do estado da simulação.
 */
export interface FlowPoint {
  readonly x: number;
  readonly y: number;
}

/** Distância entre partículas, em unidades do mundo. */
export const FLOW_SPACING = 26;
/** Velocidade das partículas (unidades do mundo por segundo). */
export const FLOW_SPEED = 60;
/** Duração do pulso de manobra (ms). */
export const TRIP_PULSE_MS = 700;

export function polylineLength(points: ReadonlyArray<FlowPoint>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Ponto a uma distância `d` do início da polilinha (d em [0, comprimento]). */
export function pointAtDistance(points: ReadonlyArray<FlowPoint>, d: number): FlowPoint {
  let remaining = d;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    if (remaining <= seg) {
      const t = remaining / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= seg;
  }
  return points[points.length - 1];
}

/**
 * Partículas ao longo do condutor no instante `timeMs`. A fase depende do
 * tempo, então o movimento é contínuo entre quadros; o número de partículas
 * é limitado para manter o custo baixo em celular.
 */
export function flowParticles(
  points: ReadonlyArray<FlowPoint>,
  timeMs: number,
  spacing = FLOW_SPACING,
  speed = FLOW_SPEED,
  maxParticles = 80,
): FlowPoint[] {
  if (points.length < 2 || spacing <= 0) return [];
  const length = polylineLength(points);
  if (length < 1) return [];
  const step = Math.max(spacing, length / maxParticles);
  const phase = ((timeMs / 1000) * speed) % step;
  const out: FlowPoint[] = [];
  for (let d = phase; d <= length; d += step) out.push(pointAtDistance(points, d));
  return out;
}

/** Opacidade do condutor em falta (pisca 2 Hz). */
export function faultBlinkAlpha(timeMs: number): number {
  return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((timeMs / 1000) * Math.PI * 4));
}

/** Raio e opacidade do pulso de manobra (0..1 do tempo decorrido). */
export function tripPulse(elapsedMs: number): { radius: number; alpha: number } | null {
  if (elapsedMs < 0 || elapsedMs > TRIP_PULSE_MS) return null;
  const t = elapsedMs / TRIP_PULSE_MS;
  return { radius: 14 + 26 * t, alpha: 1 - t };
}

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}
