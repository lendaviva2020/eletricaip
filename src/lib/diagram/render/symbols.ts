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

const disconnector: Draw = (g) => {
  g.moveTo(-24, 0).lineTo(-8, 0);
  g.moveTo(24, 0).lineTo(8, 0);
  g.moveTo(-8, 0).lineTo(8, -16);
  g.circle(-8, 0, 2);
  stroke(g);
};

const neutral: Draw = (g) => {
  g.moveTo(0, -14).lineTo(0, 0);
  g.circle(0, 4, 4);
  stroke(g);
};

const socket: Draw = (g) => {
  g.circle(0, 0, 10);
  g.circle(-3, -3, 1.5).circle(3, -3, 1.5).circle(0, 4, 1.5);
  stroke(g);
};

const estop: Draw = (g) => {
  g.circle(0, -10, 10);
  g.moveTo(-10, 8).lineTo(-4, 8);
  g.moveTo(10, 8).lineTo(4, 8);
  g.moveTo(-4, 8).lineTo(4, 2);
  stroke(g);
};

const lightcurtain: Draw = (g) => {
  g.rect(-20, -16, 6, 32);
  g.rect(14, -16, 6, 32);
  g.moveTo(-14, -8).lineTo(14, -8);
  g.moveTo(-14, 0).lineTo(14, 0);
  g.moveTo(-14, 8).lineTo(14, 8);
  stroke(g);
};

const psu: Draw = (g) => {
  g.rect(-18, -12, 36, 24);
  g.moveTo(-12, 0).lineTo(-8, -6).lineTo(-4, 6).lineTo(0, 0);
  g.moveTo(6, 0).lineTo(14, 0);
  stroke(g);
};

const vfd: Draw = (g) => {
  g.rect(-20, -12, 40, 24);
  g.moveTo(-16, 0).lineTo(-13, -6).lineTo(-10, 6).lineTo(-7, 0);
  g.moveTo(-3, -6).lineTo(-3, 6).moveTo(3, -6).lineTo(3, 6);
  g.moveTo(7, 0).lineTo(10, -6).lineTo(13, 6).lineTo(16, 0);
  stroke(g);
};

const softstarter: Draw = (g) => {
  g.rect(-18, -12, 36, 24);
  g.moveTo(-12, 8)
    .lineTo(-6, 8)
    .lineTo(-6, 2)
    .lineTo(0, 2)
    .lineTo(0, -4)
    .lineTo(6, -4)
    .lineTo(6, -8)
    .lineTo(12, -8);
  stroke(g);
};

const busbar: Draw = (g) => {
  g.moveTo(-26, 0).lineTo(26, 0);
  g.stroke({ width: 5, color: 0xe5e7eb });
};

const ccm: Draw = (g) => {
  g.rect(-22, -16, 44, 32);
  g.moveTo(-8, -16).lineTo(-8, 16);
  g.moveTo(8, -16).lineTo(8, 16);
  stroke(g);
};

const instrumentBubble = (g: Graphics) => {
  g.circle(0, 0, 11);
  stroke(g);
};

const pt100: Draw = (g) => {
  instrumentBubble(g);
  g.moveTo(0, 8).lineTo(0, -6).lineTo(-4, -10);
  stroke(g);
};

const pressure: Draw = (g) => {
  instrumentBubble(g);
  g.moveTo(0, 0).lineTo(6, -6);
  stroke(g);
};

const flow: Draw = (g) => {
  instrumentBubble(g);
  g.moveTo(-6, 0).lineTo(6, 0).moveTo(2, -4).lineTo(6, 0).lineTo(2, 4);
  stroke(g);
};

const level: Draw = (g) => {
  instrumentBubble(g);
  g.moveTo(-6, 2).lineTo(6, 2);
  stroke(g);
};

const encoder: Draw = (g) => {
  instrumentBubble(g);
  g.moveTo(-5, 5).lineTo(5, -5).moveTo(5, -5).lineTo(1, -5).moveTo(5, -5).lineTo(5, -1);
  stroke(g);
};

const REGISTRY: Partial<Record<NodeKind, Draw>> = {
  breaker,
  fuse,
  rcd,
  contactor,
  relay,
  disconnector,
  transformer,
  motor,
  load,
  lamp,
  socket,
  ground,
  neutral,
  terminal,
  psu,
  vfd,
  softstarter,
  busbar,
  ccm,
  pt100,
  pressure,
  flow,
  level,
  encoder,
  estop,
  lightcurtain,
};


export function drawSymbol(kind: NodeKind): Graphics {
  const g = new Graphics();
  (REGISTRY[kind] ?? generic)(g);
  return g;
}
