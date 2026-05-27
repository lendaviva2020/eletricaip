// Biblioteca mínima de símbolos IEC 60617 desenhados com PIXI.Graphics.
// Cada função desenha em coordenadas locais (origem no centro do símbolo).
// Cor única (currentColor) — overlays/labels via HTML.
import { Graphics } from "pixi.js";
import type { NodeKind } from "../schema";

export const SYMBOL_SIZE = 56; // grid lógico

type Draw = (g: Graphics) => void;

const stroke = (g: Graphics) => g.stroke({ width: 1.5, color: 0xe5e7eb });

const breaker: Draw = (g) => {
  g.moveTo(-24, 0).lineTo(-8, 0);
  g.moveTo(24, 0).lineTo(8, 0);
  g.moveTo(-8, 0).lineTo(8, -14);
  stroke(g);
};

const fuse: Draw = (g) => {
  g.moveTo(-24, 0).lineTo(-12, 0).moveTo(24, 0).lineTo(12, 0);
  g.rect(-12, -6, 24, 12);
  stroke(g);
};

const rcd: Draw = (g) => {
  g.rect(-18, -14, 36, 28);
  g.moveTo(-12, 6).lineTo(12, -6);
  stroke(g);
};

const contactor: Draw = (g) => {
  g.moveTo(-24, 0).lineTo(-8, 0).moveTo(24, 0).lineTo(8, 0);
  g.moveTo(-8, 0).lineTo(8, -12);
  g.circle(-8, 0, 2).circle(8, 0, 2);
  stroke(g);
};

const relay: Draw = (g) => {
  g.rect(-14, -10, 28, 20);
  stroke(g);
};

const transformer: Draw = (g) => {
  g.circle(-7, 0, 10).circle(7, 0, 10);
  stroke(g);
};

const motor: Draw = (g) => {
  g.circle(0, 0, 16);
  stroke(g);
  // letra M desenhada como linhas
  g.moveTo(-7, 6).lineTo(-7, -6).lineTo(0, 2).lineTo(7, -6).lineTo(7, 6);
  stroke(g);
};

const load: Draw = (g) => {
  g.rect(-14, -10, 28, 20);
  stroke(g);
};

const lamp: Draw = (g) => {
  g.circle(0, 0, 12);
  g.moveTo(-9, -9).lineTo(9, 9).moveTo(9, -9).lineTo(-9, 9);
  stroke(g);
};

const ground: Draw = (g) => {
  g.moveTo(0, -12).lineTo(0, 0);
  g.moveTo(-14, 0).lineTo(14, 0);
  g.moveTo(-10, 5).lineTo(10, 5);
  g.moveTo(-6, 10).lineTo(6, 10);
  stroke(g);
};

const terminal: Draw = (g) => {
  g.circle(0, 0, 4);
  stroke(g);
};

const generic: Draw = (g) => {
  g.rect(-18, -12, 36, 24);
  stroke(g);
};

const REGISTRY: Partial<Record<NodeKind, Draw>> = {
  breaker,
  fuse,
  rcd,
  contactor,
  relay,
  disconnector: breaker,
  transformer,
  motor,
  load,
  lamp,
  socket: lamp,
  ground,
  neutral: ground,
  terminal,
  psu: generic,
  vfd: generic,
  softstarter: generic,
  busbar: generic,
  ccm: generic,
  pt100: terminal,
  pressure: terminal,
  flow: terminal,
  level: terminal,
  encoder: terminal,
  estop: lamp,
  lightcurtain: generic,
};

export function drawSymbol(kind: NodeKind): Graphics {
  const g = new Graphics();
  (REGISTRY[kind] ?? generic)(g);
  return g;
}
