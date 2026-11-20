// Estado dos equipamentos da tela HMI a partir de TAGS REAIS — PURO.
//
// Usado pelo WebVisu do ElétricAi Runtime: o símbolo só mostra o que uma tag
// diz. Sem tag correspondente o equipamento fica "sem sinal" (cinza) — nada é
// deduzido nem simulado. Convenção (a mesma que o editor HMI publica):
//   <TAG>.LIGADO | <TAG>       → ligado (BOOL)
//   <TAG>.REVERSO              → reverso (BOOL)
//   <TAG>.VELOCIDADE           → velocidade % (número)
//   <TAG>.ABERTA | <TAG>       → válvula aberta (BOOL, se o equipamento abre)
//   <TAG>.NIVEL                → nível % (número)
import type { HmiDoc } from "./hmi-model";
import { equipmentDef } from "./process-library";

export interface TagBoundState {
  running: boolean;
  reverse: boolean;
  speedPct: number;
  open: boolean;
  levelPct: number;
}

export interface EquipmentTagState {
  state: TagBoundState;
  /** Tags efetivamente usadas (para o faceplate). */
  bound: Partial<Record<keyof TagBoundState, string>>;
  /** Alguma tag deste equipamento existe na imagem de processo. */
  hasSignal: boolean;
}

type Tags = Readonly<Record<string, boolean | number>>;

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

function readBool(tags: Tags, names: string[]): { value: boolean; tag: string } | null {
  for (const n of names) {
    const v = tags[n];
    if (typeof v === "boolean") return { value: v, tag: n };
    if (typeof v === "number" && (v === 0 || v === 1)) return { value: v === 1, tag: n };
  }
  return null;
}

function readNum(tags: Tags, name: string): { value: number; tag: string } | null {
  const v = tags[name];
  return typeof v === "number" && Number.isFinite(v) ? { value: v, tag: name } : null;
}

export function equipmentStatesFromTags(
  doc: HmiDoc,
  tags: Tags,
): Record<string, EquipmentTagState> {
  const out: Record<string, EquipmentTagState> = {};
  for (const e of doc.equipment) {
    const ops = equipmentDef(e.type)?.ops ?? [];
    const base = e.tag || e.id;
    const bound: EquipmentTagState["bound"] = {};
    const state: TagBoundState = {
      running: false,
      reverse: false,
      speedPct: 100,
      open: false,
      levelPct: 0,
    };
    if (ops.includes("run")) {
      const r = readBool(tags, [`${base}.LIGADO`, base]);
      if (r) {
        state.running = r.value;
        bound.running = r.tag;
      }
    }
    if (ops.includes("reverse")) {
      const r = readBool(tags, [`${base}.REVERSO`]);
      if (r) {
        state.reverse = r.value;
        bound.reverse = r.tag;
      }
    }
    if (ops.includes("speed")) {
      const r = readNum(tags, `${base}.VELOCIDADE`);
      if (r) {
        state.speedPct = clampPct(r.value);
        bound.speedPct = r.tag;
      }
    }
    if (ops.includes("open")) {
      const r = readBool(tags, [`${base}.ABERTA`, ...(ops.includes("run") ? [] : [base])]);
      if (r) {
        state.open = r.value;
        bound.open = r.tag;
      }
    }
    if (ops.includes("level")) {
      const r = readNum(tags, `${base}.NIVEL`);
      if (r) {
        state.levelPct = clampPct(r.value);
        bound.levelPct = r.tag;
      }
    }
    out[e.id] = { state, bound, hasSignal: Object.keys(bound).length > 0 };
  }
  return out;
}

/** Chave estável do desenho (o símbolo só é refeito quando ela muda). */
export function symbolStateKey(s: TagBoundState): string {
  return [
    s.running ? 1 : 0,
    s.reverse ? 1 : 0,
    Math.round(s.speedPct),
    s.open ? 1 : 0,
    Math.round(s.levelPct),
  ].join("-");
}

/** Lê a chave de volta (validada) — usada pela rota que desenha o símbolo. */
export function parseSymbolStateKey(key: string): TagBoundState | null {
  const m = /^([01])-([01])-(\d{1,3})-([01])-(\d{1,3})$/.exec(key);
  if (!m) return null;
  const speed = Number(m[3]);
  const level = Number(m[5]);
  if (speed > 100 || level > 100) return null;
  return {
    running: m[1] === "1",
    reverse: m[2] === "1",
    speedPct: speed,
    open: m[4] === "1",
    levelPct: level,
  };
}
