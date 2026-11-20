// Geometria da tela HMI de processo — PURO.
//
// Fonte única de posições de portas (com rotação) e do traçado das ligações,
// usada pelo editor (React Flow) e pelo WebVisu do ElétricAi Runtime, para que
// a tela no gateway seja a MESMA desenhada no editor.
import type { HmiDoc } from "./hmi-model";
import {
  MEDIUM_COLOR,
  equipmentDef,
  findPort,
  type Medium,
  type PortSide,
} from "./process-library";

const SIDES: PortSide[] = ["top", "right", "bottom", "left"];

/** Gira o lado e a fração da porta em passos de 90° no sentido horário. */
export function rotatePort(
  side: PortSide,
  at: number,
  rotation: number,
): { side: PortSide; at: number } {
  let s = side;
  let a = at;
  for (let i = 0; i < (((rotation / 90) % 4) + 4) % 4; i++) {
    // left→top (1-a), top→right (a), right→bottom (1-a), bottom→left (a)
    const flip = s === "left" || s === "right";
    s = SIDES[(SIDES.indexOf(s) + 1) % 4];
    a = flip ? 1 - a : a;
  }
  return { side: s, at: a };
}

export interface LayoutEquipment {
  id: string;
  type: string;
  label: string;
  tag: string | null;
  /** Caixa na tela (já com largura/altura trocadas em 90°/270°). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tamanho do desenho do símbolo (antes da rotação). */
  symbolW: number;
  symbolH: number;
  rotation: 0 | 90 | 180 | 270;
  fluid: Medium;
  ops: readonly string[];
}

export interface LayoutLink {
  id: string;
  from: string;
  medium: Medium;
  color: string;
  electric: boolean;
  /** Polilinha ortogonal (pontos da origem ao destino). */
  points: Array<[number, number]>;
}

export interface HmiLayout {
  title: string;
  equipment: LayoutEquipment[];
  links: LayoutLink[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Folga do traçado para fora da porta antes de dobrar. */
const STUB = 18;

const OUT: Record<PortSide, [number, number]> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};

export function portPoint(
  box: { x: number; y: number; w: number; h: number },
  side: PortSide,
  at: number,
): [number, number] {
  switch (side) {
    case "top":
      return [box.x + at * box.w, box.y];
    case "bottom":
      return [box.x + at * box.w, box.y + box.h];
    case "left":
      return [box.x, box.y + at * box.h];
    case "right":
      return [box.x + box.w, box.y + at * box.h];
  }
}

/** Traçado ortogonal: sai da porta, dobra no meio e entra na outra porta. */
export function orthogonalRoute(
  a: [number, number],
  aSide: PortSide,
  b: [number, number],
  bSide: PortSide,
): Array<[number, number]> {
  const a1: [number, number] = [a[0] + OUT[aSide][0] * STUB, a[1] + OUT[aSide][1] * STUB];
  const b1: [number, number] = [b[0] + OUT[bSide][0] * STUB, b[1] + OUT[bSide][1] * STUB];
  const horizontalFirst = aSide === "left" || aSide === "right";
  // Destino "atrás" da saída (ex.: sai para baixo e o destino está acima):
  // seguir em frente cortaria o próprio equipamento — contorna pelo lado.
  const backwards = horizontalFirst
    ? (aSide === "right" && b1[0] < a1[0]) || (aSide === "left" && b1[0] > a1[0])
    : (aSide === "bottom" && b1[1] < a1[1]) || (aSide === "top" && b1[1] > a1[1]);
  const midX = (a1[0] + b1[0]) / 2;
  const midY = (a1[1] + b1[1]) / 2;
  const mid: Array<[number, number]> = horizontalFirst
    ? backwards
      ? [
          [a1[0], midY],
          [b1[0], midY],
        ]
      : [
          [midX, a1[1]],
          [midX, b1[1]],
        ]
    : backwards
      ? [
          [midX, a1[1]],
          [midX, b1[1]],
        ]
      : [
          [a1[0], midY],
          [b1[0], midY],
        ];
  return [a, a1, ...mid, b1, b];
}

export function buildHmiLayout(doc: HmiDoc): HmiLayout {
  const equipment: LayoutEquipment[] = [];
  const byId = new Map<string, LayoutEquipment>();
  for (const e of doc.equipment) {
    const def = equipmentDef(e.type);
    if (!def) continue;
    const rot = (e.rotation ?? 0) as LayoutEquipment["rotation"];
    const swap = rot === 90 || rot === 270;
    const fluid =
      def.ports.find((p) => p.dir !== "out" && p.media[0] !== "energia")?.media[0] ?? "agua";
    const item: LayoutEquipment = {
      id: e.id,
      type: e.type,
      label: e.label ?? "",
      tag: e.tag ?? null,
      x: e.x,
      y: e.y,
      w: swap ? def.h : def.w,
      h: swap ? def.w : def.h,
      symbolW: def.w,
      symbolH: def.h,
      rotation: rot,
      fluid,
      ops: def.ops,
    };
    equipment.push(item);
    byId.set(e.id, item);
  }
  const links: LayoutLink[] = [];
  for (const l of doc.links) {
    const a = byId.get(l.from.equipment);
    const b = byId.get(l.to.equipment);
    const pa = a && findPort(a.type, l.from.port);
    const pb = b && findPort(b.type, l.to.port);
    if (!a || !b || !pa || !pb) continue; // ligação inválida não é desenhada
    const ra = rotatePort(pa.side, pa.at, a.rotation);
    const rb = rotatePort(pb.side, pb.at, b.rotation);
    links.push({
      id: l.id,
      from: a.id,
      medium: l.medium,
      color: MEDIUM_COLOR[l.medium],
      electric: l.medium === "energia" || l.medium === "sinal",
      points: orthogonalRoute(
        portPoint(a, ra.side, ra.at),
        ra.side,
        portPoint(b, rb.side, rb.at),
        rb.side,
      ),
    });
  }
  const xs = equipment.flatMap((e) => [e.x, e.x + e.w]);
  const ys = equipment.flatMap((e) => [e.y, e.y + e.h]);
  return {
    title: doc.title,
    equipment,
    links,
    bounds: xs.length
      ? {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}
