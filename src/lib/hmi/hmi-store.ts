/**
 * Estado do editor HMI de processo: documento (salvo no projeto), histórico
 * para desfazer/refazer e a operação simulada (efêmera, nunca salva).
 */
import { create } from "zustand";
import { equipmentDef } from "./process-library";
import {
  HmiDocSchema,
  commonMedium,
  emptyHmiDoc,
  nextId,
  type HmiDoc,
  type HmiEquipment,
  type HmiLink,
} from "./hmi-model";
import {
  applyCommand,
  initialRuntime,
  reconcileRuntime,
  stepRuntime,
  type HmiCommand,
  type HmiRuntimeState,
} from "./hmi-runtime";

const HISTORY_MAX = 80;

export type HmiMode = "design" | "code" | "operate";

interface HmiState {
  doc: HmiDoc;
  past: HmiDoc[];
  future: HmiDoc[];
  dirty: boolean;
  mode: HmiMode;
  selectedId: string | null;
  runtime: HmiRuntimeState;

  /** Carrega do projeto salvo (inválido → tela vazia, nunca quebra o editor). */
  hydrate: (raw: unknown) => void;
  markSaved: () => void;
  setMode: (m: HmiMode) => void;
  select: (id: string | null) => void;
  /** Substitui o documento inteiro (código, IA). Entra no desfazer. */
  replaceDoc: (doc: HmiDoc) => void;
  addEquipment: (type: string, x: number, y: number) => string | null;
  moveEquipment: (id: string, x: number, y: number) => void;
  updateEquipment: (id: string, patch: Partial<Omit<HmiEquipment, "id" | "type">>) => void;
  renameEquipment: (id: string, newId: string) => string | null;
  removeEquipment: (id: string) => void;
  connect: (
    from: HmiLink["from"],
    to: HmiLink["to"],
  ) => { ok: true } | { ok: false; reason: string };
  removeLink: (id: string) => void;
  undo: () => void;
  redo: () => void;
  command: (cmd: HmiCommand) => { ok: true } | { ok: false; reason: string };
  tick: (dtS: number) => void;
}

function commit(s: HmiState, doc: HmiDoc): Partial<HmiState> {
  return {
    doc,
    past: [...s.past, s.doc].slice(-HISTORY_MAX),
    future: [],
    dirty: true,
    runtime: reconcileRuntime(doc, s.runtime),
  };
}

export const useHmiStore = create<HmiState>((set, get) => ({
  doc: emptyHmiDoc(),
  past: [],
  future: [],
  dirty: false,
  mode: "design",
  selectedId: null,
  runtime: initialRuntime(emptyHmiDoc()),

  hydrate: (raw) => {
    const parsed = HmiDocSchema.safeParse(raw ?? emptyHmiDoc());
    const doc = parsed.success ? parsed.data : emptyHmiDoc();
    if (!parsed.success) console.warn("[hmi] tela salva inválida — aberta vazia");
    set({
      doc,
      past: [],
      future: [],
      dirty: false,
      selectedId: null,
      runtime: initialRuntime(doc),
    });
  },
  markSaved: () => set({ dirty: false }),
  setMode: (mode) => set({ mode }),
  select: (selectedId) => set({ selectedId }),

  replaceDoc: (doc) => set((s) => ({ ...commit(s, doc), selectedId: null })),

  addEquipment: (type, x, y) => {
    const def = equipmentDef(type);
    if (!def) return null;
    const s = get();
    const id = nextId(def.tagPrefix, new Set(s.doc.equipment.map((e) => e.id)));
    const eq: HmiEquipment = {
      id,
      type,
      label: def.label,
      x: Math.round(x),
      y: Math.round(y),
      rotation: 0,
    };
    set(commit(s, { ...s.doc, equipment: [...s.doc.equipment, eq] }));
    set({ selectedId: id });
    return id;
  },

  moveEquipment: (id, x, y) =>
    set((s) => {
      const e = s.doc.equipment.find((q) => q.id === id);
      if (!e || (e.x === Math.round(x) && e.y === Math.round(y))) return {};
      return commit(s, {
        ...s.doc,
        equipment: s.doc.equipment.map((q) =>
          q.id === id ? { ...q, x: Math.round(x), y: Math.round(y) } : q,
        ),
      });
    }),

  updateEquipment: (id, patch) =>
    set((s) => {
      const next = {
        ...s.doc,
        equipment: s.doc.equipment.map((q) => (q.id === id ? { ...q, ...patch } : q)),
      };
      const parsed = HmiDocSchema.safeParse(next);
      return parsed.success ? commit(s, parsed.data) : {};
    }),

  renameEquipment: (id, newId) => {
    const s = get();
    if (id === newId) return null;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(newId))
      return "Identificação inválida (letra + letras/números, até 32).";
    if (s.doc.equipment.some((e) => e.id === newId))
      return "Já existe um equipamento com essa identificação.";
    const ren = (x: string) => (x === id ? newId : x);
    set(
      commit(s, {
        ...s.doc,
        equipment: s.doc.equipment.map((e) => (e.id === id ? { ...e, id: newId } : e)),
        links: s.doc.links.map((l) => ({
          ...l,
          from: { ...l.from, equipment: ren(l.from.equipment) },
          to: { ...l.to, equipment: ren(l.to.equipment) },
        })),
      }),
    );
    set({ selectedId: newId });
    return null;
  },

  removeEquipment: (id) =>
    set((s) => ({
      ...commit(s, {
        ...s.doc,
        equipment: s.doc.equipment.filter((e) => e.id !== id),
        links: s.doc.links.filter((l) => l.from.equipment !== id && l.to.equipment !== id),
      }),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  connect: (from, to) => {
    const s = get();
    const a = s.doc.equipment.find((e) => e.id === from.equipment);
    const b = s.doc.equipment.find((e) => e.id === to.equipment);
    if (!a || !b) return { ok: false, reason: "Equipamento não encontrado." };
    if (a.id === b.id) return { ok: false, reason: "Não ligue o equipamento a ele mesmo." };
    const medium = commonMedium(a.type, from.port, b.type, to.port);
    if (!medium)
      return {
        ok: false,
        reason: "Essas portas não aceitam o mesmo meio (ex.: vapor numa entrada de óleo).",
      };
    const dup = s.doc.links.some(
      (l) =>
        (l.from.equipment === a.id &&
          l.from.port === from.port &&
          l.to.equipment === b.id &&
          l.to.port === to.port) ||
        (l.from.equipment === b.id &&
          l.from.port === to.port &&
          l.to.equipment === a.id &&
          l.to.port === from.port),
    );
    if (dup) return { ok: false, reason: "Essa ligação já existe." };
    const id = nextId("L", new Set(s.doc.links.map((l) => l.id)));
    set(commit(s, { ...s.doc, links: [...s.doc.links, { id, from, to, medium }] }));
    return { ok: true };
  },

  removeLink: (id) =>
    set((s) => commit(s, { ...s.doc, links: s.doc.links.filter((l) => l.id !== id) })),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      return {
        doc: prev,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future].slice(0, HISTORY_MAX),
        dirty: true,
        runtime: reconcileRuntime(prev, s.runtime),
      };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      return {
        doc: next,
        past: [...s.past, s.doc].slice(-HISTORY_MAX),
        future: s.future.slice(1),
        dirty: true,
        runtime: reconcileRuntime(next, s.runtime),
      };
    }),

  command: (cmd) => {
    const s = get();
    const r = applyCommand(s.doc, s.runtime, cmd);
    if (!r.ok) return r;
    set({ runtime: r.state });
    return { ok: true };
  },
  tick: (dtS) => set((s) => ({ runtime: stepRuntime(s.doc, s.runtime, dtS) })),
}));
