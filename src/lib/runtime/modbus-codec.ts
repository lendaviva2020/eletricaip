// Conversão entre valores de engenharia e palavras Modbus — PURO.
import type { IoPoint, ModbusAddress, ModbusArea } from "./io-map";

export function wordsFor(point: IoPoint): number {
  return point.dataType === "REAL" ? 2 : 1;
}

/** Palavras (16 bits) → valor de engenharia. */
export function decodeWords(point: IoPoint, words: readonly number[]): number {
  const m = point.modbus as ModbusAddress;
  let raw: number;
  if (point.dataType === "REAL") {
    const [a, b] = m.wordOrder === "CDAB" ? [words[1], words[0]] : [words[0], words[1]];
    const buf = new DataView(new ArrayBuffer(4));
    buf.setUint16(0, a);
    buf.setUint16(2, b);
    raw = buf.getFloat32(0);
  } else {
    const w = words[0] & 0xffff;
    raw = m.signed && w > 0x7fff ? w - 0x10000 : w;
  }
  return raw * m.scale + m.offset;
}

/** Valor de engenharia → palavras. Valor que não cabe é ERRO (nunca truncado). */
export function encodeWords(point: IoPoint, value: number): number[] {
  const m = point.modbus as ModbusAddress;
  const raw = (value - m.offset) / m.scale;
  if (!Number.isFinite(raw)) throw new Error(`${point.tag}: valor ${value} inválido`);
  if (point.dataType === "REAL") {
    const buf = new DataView(new ArrayBuffer(4));
    buf.setFloat32(0, raw);
    const hi = buf.getUint16(0);
    const lo = buf.getUint16(2);
    return m.wordOrder === "CDAB" ? [lo, hi] : [hi, lo];
  }
  const n = Math.round(raw);
  const [min, max] = m.signed ? [-32768, 32767] : [0, 65535];
  if (n < min || n > max) {
    throw new Error(`${point.tag}: ${value} não cabe em 16 bits ${m.signed ? "com" : "sem"} sinal`);
  }
  return [n < 0 ? n + 0x10000 : n];
}

export interface ReadBlock {
  area: ModbusArea;
  start: number;
  count: number;
  points: IoPoint[];
}

const MAX_SPAN: Record<ModbusArea, number> = {
  coil: 2000,
  discrete_input: 2000,
  holding_register: 125,
  input_register: 125,
};
/** Buraco máximo lido "de graça" para juntar blocos (menos requisições). */
const MAX_GAP = 8;

/** Agrupa pontos de uma conexão em leituras contíguas. */
export function planReads(points: readonly IoPoint[]): ReadBlock[] {
  const byArea = new Map<ModbusArea, IoPoint[]>();
  for (const p of points) {
    if (!p.modbus) continue;
    const list = byArea.get(p.modbus.area) ?? [];
    list.push(p);
    byArea.set(p.modbus.area, list);
  }
  const blocks: ReadBlock[] = [];
  for (const [area, list] of byArea) {
    const sorted = [...list].sort((a, b) => a.modbus!.address - b.modbus!.address);
    let cur: ReadBlock | null = null;
    for (const p of sorted) {
      const start = p.modbus!.address;
      const end = start + wordsFor(p); // exclusivo
      if (
        cur &&
        start - (cur.start + cur.count) <= MAX_GAP &&
        Math.max(end, cur.start + cur.count) - cur.start <= MAX_SPAN[area]
      ) {
        cur.count = Math.max(end, cur.start + cur.count) - cur.start;
        cur.points.push(p);
      } else {
        cur = { area, start, count: end - start, points: [p] };
        blocks.push(cur);
      }
    }
  }
  return blocks;
}
