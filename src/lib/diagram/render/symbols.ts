// Biblioteca mínima de símbolos IEC 60617 desenhados com PIXI.Graphics.
// Cada função desenha em coordenadas locais (origem no centro do símbolo).
// Cor única (currentColor) — overlays/labels via HTML.
import { Graphics } from "pixi.js";
import type { NodeKind } from "../schema";

export const SYMBOL_SIZE = 56; // grid lógico

type Draw = (g: Graphics) => void;

const stroke = (g: Graphics) => g.stroke({ width: 1.5, color: 0x1e293b });

const breaker: Draw = (g) => {
  // Disjuntor IEC 60617 vertical/bidirecional com terminais de contato
  g.circle(0, -14, 2.5).circle(0, 14, 2.5);
  g.moveTo(0, -22).lineTo(0, -14);
  g.moveTo(0, 14).lineTo(0, 22);
  g.moveTo(0, -14).lineTo(8, 10);
  // Cruz de disparo magnético
  g.moveTo(5, -2).lineTo(11, -6);
  stroke(g);
};

const fuse: Draw = (g) => {
  g.moveTo(0, -22).lineTo(0, -12).moveTo(0, 22).lineTo(0, 12);
  g.rect(-6, -12, 12, 24);
  g.moveTo(0, -12).lineTo(0, 12);
  stroke(g);
};

const rcd: Draw = (g) => {
  g.rect(-18, -14, 36, 28);
  g.moveTo(-12, 6).lineTo(12, -6);
  stroke(g);
};

const contactor: Draw = (g) => {
  // Contator de potência IEC 60617 com terminais e lâmina de contato
  g.circle(0, -14, 2.5).circle(0, 14, 2.5);
  g.moveTo(0, -22).lineTo(0, -14);
  g.moveTo(0, 14).lineTo(0, 22);
  g.moveTo(0, -14).lineTo(8, 8);
  // Semicírculo de retenção de contator
  g.arc(8, 8, 3, -Math.PI / 2, Math.PI / 2);
  stroke(g);
};

const thermal_relay: Draw = (g) => {
  // Relé térmico bimetálico de sobrecarga IEC 60617 (FT1 na referência visual)
  g.rect(-16, -14, 32, 28);
  g.moveTo(0, -22).lineTo(0, -14);
  g.moveTo(0, 14).lineTo(0, 22);
  // Elemento bimetálico térmico interno
  g.moveTo(-8, -6).lineTo(-2, -6).lineTo(-2, 6).lineTo(-8, 6);
  g.moveTo(2, -6).lineTo(8, -6).moveTo(5, -6).lineTo(5, 6);
  stroke(g);
};

const capacitor_bank: Draw = (g) => {
  // Banco de capacitores trifásico (como na referência visual)
  g.moveTo(-18, -14).lineTo(18, -14);
  g.moveTo(0, -22).lineTo(0, -14);
  for (const cx of [-12, 0, 12]) {
    g.moveTo(cx, -14).lineTo(cx, -5);
    g.moveTo(cx - 5, -5).lineTo(cx + 5, -5);
    g.moveTo(cx - 5, 3).lineTo(cx + 5, 3);
    g.moveTo(cx, 3).lineTo(cx, 14);
  }
  g.moveTo(-18, 14).lineTo(18, 14);
  g.moveTo(0, 14).lineTo(0, 22);
  stroke(g);
};

const plc: Draw = (g) => {
  // Bastidor de automação CLP com módulos de I/O e CPU
  g.rect(-24, -20, 48, 40);
  g.moveTo(-8, -20).lineTo(-8, 20);
  g.moveTo(8, -20).lineTo(8, 20);
  g.circle(-16, -12, 2).circle(-16, -4, 2).circle(-16, 4, 2);
  g.rect(12, -14, 8, 12);
  g.rect(12, 2, 8, 12);
  stroke(g);
};

const hmi: Draw = (g) => {
  // Painel de interface IHM industrial
  g.rect(-24, -18, 48, 36);
  g.rect(-20, -14, 40, 24);
  g.moveTo(-12, 14).lineTo(12, 14);
  stroke(g);
};

const generator: Draw = (g) => {
  g.circle(0, 0, 18);
  g.moveTo(4, -6).lineTo(-4, -6).lineTo(-4, 6).lineTo(4, 6).lineTo(4, 0).lineTo(0, 0);
  g.moveTo(-6, 11).lineTo(-3, 9).lineTo(0, 11).lineTo(3, 13).lineTo(6, 11);
  stroke(g);
};

const relay: Draw = (g) => {
  g.rect(-14, -10, 28, 20);
  stroke(g);
};

const transformer: Draw = (g) => {
  // Dois círculos entrelaçados verticalmente (IEC 60617)
  g.circle(0, -8, 12).circle(0, 8, 12);
  g.moveTo(0, -20).lineTo(0, -18);
  g.moveTo(0, 18).lineTo(0, 20);
  stroke(g);
};

const motor: Draw = (g) => {
  g.circle(0, 0, 18);
  // Base do motor / pés (como na referência visual)
  g.moveTo(-14, 20).lineTo(14, 20);
  g.moveTo(-10, 16).lineTo(-10, 20);
  g.moveTo(10, 16).lineTo(10, 20);
  stroke(g);
  // Letra M central
  g.moveTo(-7, 7).lineTo(-7, -7).lineTo(0, 2).lineTo(7, -7).lineTo(7, 7);
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
  // Inversor de Frequência (VFD) IEC 60617 (como na referência visual)
  g.rect(-20, -22, 40, 44);
  // Linha diagonal divisória
  g.moveTo(-20, 22).lineTo(20, -22);
  // Símbolo CC (=) no quadrante superior
  g.moveTo(-10, -14).lineTo(2, -14);
  g.moveTo(-10, -10).lineTo(2, -10);
  // Símbolo CA (senóide) no quadrante inferior
  g.moveTo(-4, 10).lineTo(-1, 7).lineTo(2, 10).lineTo(5, 13).lineTo(8, 10);
  // Terminais verticais de entrada e saída
  g.moveTo(0, -28).lineTo(0, -22);
  g.moveTo(0, 22).lineTo(0, 28);
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
  // Barramento de distribuição trifásico principal (como linha horizontal grossa na imagem)
  g.moveTo(-60, 0).lineTo(60, 0);
  g.stroke({ width: 5.5, color: 0x1e293b });
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
  thermal_relay,
  disconnector,
  transformer,
  generator,
  capacitor_bank,
  plc,
  hmi,
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
