/**
 * Operação SIMULADA da tela HMI de processo (puro e determinístico).
 *
 * Permite testar a lógica da planta antes do comissionamento: ligar, desligar,
 * reverter, ajustar velocidade, abrir/fechar válvulas e ver o produto correr
 * pelas ligações e encher/esvaziar tanques. NADA aqui escreve em equipamento
 * real (AGENTS regra 21): é simulação e a tela mostra isso.
 *
 * Intertravamentos realistas:
 *  - reversão só com o equipamento PARADO (contatores de reversão);
 *  - equipamento sem produto a montante não transporta (roda em vazio);
 *  - parada geral desliga tudo e não religa nada sozinho.
 */
import { equipmentDef, findPort, type Operation } from "./process-library";
import type { HmiDoc, HmiEquipment } from "./hmi-model";

export interface EquipmentState {
  running: boolean;
  reverse: boolean;
  /** 0..100 % */
  speedPct: number;
  open: boolean;
  /** 0..100 % (tanques, silos, moegas) */
  levelPct: number;
}

export interface HmiRuntimeState {
  equipment: Record<string, EquipmentState>;
  /** id da ligação → com fluxo agora */
  flowing: Record<string, boolean>;
  /** sentido do fluxo invertido (equipamento de origem em reversão) */
  reversedLinks: Record<string, boolean>;
  estop: boolean;
  timeS: number;
}

export type HmiCommand =
  | { kind: "start"; id: string }
  | { kind: "stop"; id: string }
  | { kind: "toggleReverse"; id: string }
  | { kind: "speed"; id: string; pct: number }
  | { kind: "open"; id: string }
  | { kind: "close"; id: string }
  | { kind: "setLevel"; id: string; pct: number }
  | { kind: "estop" }
  | { kind: "reset" };

export type CommandResult = { ok: true; state: HmiRuntimeState } | { ok: false; reason: string };

/** % de nível por segundo, por ligação com fluxo a 100 % de velocidade. */
export const LEVEL_RATE = 4;
/** Abaixo disto o tanque é "vazio" (bomba roda em vazio). */
export const EMPTY_LEVEL = 1;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function has(e: HmiEquipment, op: Operation): boolean {
  return Boolean(equipmentDef(e.type)?.ops.includes(op));
}

export function initialRuntime(doc: HmiDoc): HmiRuntimeState {
  const equipment: Record<string, EquipmentState> = {};
  for (const e of doc.equipment) {
    equipment[e.id] = { running: false, reverse: false, speedPct: 100, open: false, levelPct: 0 };
  }
  return { equipment, flowing: {}, reversedLinks: {}, estop: false, timeS: 0 };
}

/** Mantém o estado ao editar a tela (equipamento novo entra parado). */
export function reconcileRuntime(doc: HmiDoc, prev: HmiRuntimeState): HmiRuntimeState {
  const next = initialRuntime(doc);
  for (const id of Object.keys(next.equipment)) {
    if (prev.equipment[id]) next.equipment[id] = { ...prev.equipment[id] };
  }
  next.estop = prev.estop;
  next.timeS = prev.timeS;
  return computeFlows(doc, next);
}

export function applyCommand(doc: HmiDoc, s: HmiRuntimeState, cmd: HmiCommand): CommandResult {
  if (cmd.kind === "estop") {
    const equipment: Record<string, EquipmentState> = {};
    for (const [id, st] of Object.entries(s.equipment)) {
      equipment[id] = { ...st, running: false };
    }
    return { ok: true, state: computeFlows(doc, { ...s, equipment, estop: true }) };
  }
  if (cmd.kind === "reset") {
    // Rearme NÃO religa nada.
    return { ok: true, state: computeFlows(doc, { ...s, estop: false }) };
  }
  const e = doc.equipment.find((x) => x.id === cmd.id);
  const st = s.equipment[cmd.id];
  if (!e || !st) return { ok: false, reason: "Equipamento não encontrado." };
  const label = e.label || e.id;
  const set = (patch: Partial<EquipmentState>): CommandResult => ({
    ok: true,
    state: computeFlows(doc, {
      ...s,
      equipment: { ...s.equipment, [cmd.id]: { ...st, ...patch } },
    }),
  });

  switch (cmd.kind) {
    case "start":
      if (!has(e, "run")) return { ok: false, reason: `${label} não tem partida.` };
      if (s.estop) return { ok: false, reason: "Parada geral ativa: rearme antes de ligar." };
      return set({ running: true });
    case "stop":
      if (!has(e, "run")) return { ok: false, reason: `${label} não tem partida.` };
      return set({ running: false });
    case "toggleReverse":
      if (!has(e, "reverse")) return { ok: false, reason: `${label} não tem reversão.` };
      if (st.running) return { ok: false, reason: `Pare ${label} antes de reverter.` };
      return set({ reverse: !st.reverse });
    case "speed":
      if (!has(e, "speed")) return { ok: false, reason: `${label} não tem ajuste de velocidade.` };
      if (!Number.isFinite(cmd.pct)) return { ok: false, reason: "Velocidade inválida." };
      return set({ speedPct: clamp(Math.round(cmd.pct), 0, 100) });
    case "open":
    case "close":
      if (!has(e, "open")) return { ok: false, reason: `${label} não é uma válvula.` };
      return set({ open: cmd.kind === "open" });
    case "setLevel":
      if (!has(e, "level")) return { ok: false, reason: `${label} não tem nível.` };
      if (!Number.isFinite(cmd.pct)) return { ok: false, reason: "Nível inválido." };
      return set({ levelPct: clamp(cmd.pct, 0, 100) });
  }
}

/** Equipamento entrega produto pela saída? */
function delivers(
  e: HmiEquipment,
  st: EquipmentState,
  hasInflow: boolean,
  productInputLinked: boolean,
): boolean {
  const def = equipmentDef(e.type);
  if (!def) return false;
  const ops = def.ops;
  if (ops.includes("run")) {
    if (!st.running || st.speedPct <= 0) return false;
    // Entrada de produto sem ligação (exaustor puxando ar ambiente, gerador):
    // entrega só por estar ligado. Com entrada ligada, depende do montante.
    if (!productInputLinked) return true;
    if (ops.includes("level")) return st.levelPct > EMPTY_LEVEL || hasInflow;
    return hasInflow;
  }
  if (ops.includes("open")) return st.open && hasInflow;
  if (ops.includes("level")) return st.levelPct > EMPTY_LEVEL || hasInflow;
  // Painel/quadro sem alimentação desenhada: considerado ligado à rede.
  if (def.category === "Elétrico" && !productInputLinked) return true;
  return hasInflow; // passivo (tubulação, trocador, junção…)
}

const isUtility = (media: readonly string[]) =>
  media.every((m) => m === "energia" || m === "sinal");

/** Fluxo nas ligações por ponto fixo (grafo pode ter ciclos). */
export function computeFlows(doc: HmiDoc, s: HmiRuntimeState): HmiRuntimeState {
  const byId = new Map(doc.equipment.map((e) => [e.id, e]));
  const flowing: Record<string, boolean> = {};
  const reversedLinks: Record<string, boolean> = {};
  const inflow = new Map<string, boolean>();
  // Equipamentos com alguma ENTRADA de produto ligada (energia/sinal não contam,
  // exceto no quadro elétrico, cuja entrada é a própria energia).
  const inputLinked = new Set<string>();
  for (const l of doc.links) {
    const dst = byId.get(l.to.equipment);
    const port = dst ? findPort(dst.type, l.to.port) : undefined;
    if (!dst || !port) continue;
    const def = equipmentDef(dst.type);
    if (!isUtility(port.media) || def?.category === "Elétrico") inputLinked.add(dst.id);
  }
  // Fontes sem entrada de produto (gerador, compressor) e tanques com nível
  // "entregam" mesmo sem nada a montante.
  for (let iter = 0; iter < doc.links.length + 2; iter++) {
    let changed = false;
    for (const l of doc.links) {
      const src = byId.get(l.from.equipment);
      const st = src ? s.equipment[src.id] : undefined;
      if (!src || !st) continue;
      const port = findPort(src.type, l.from.port);
      // Energia sai de painel/gerador/inversor; produto sai pelas saídas.
      const on = port
        ? delivers(src, st, inflow.get(src.id) ?? false, inputLinked.has(src.id))
        : false;
      if (on && !flowing[l.id]) {
        flowing[l.id] = true;
        reversedLinks[l.id] = st.reverse;
        if (!inflow.get(l.to.equipment)) {
          inflow.set(l.to.equipment, true);
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { ...s, flowing, reversedLinks };
}

/** Passo de simulação: níveis enchem/esvaziam conforme o fluxo. */
export function stepRuntime(doc: HmiDoc, s: HmiRuntimeState, dtS: number): HmiRuntimeState {
  if (!(dtS > 0) || dtS > 5) return s;
  const flows = computeFlows(doc, s);
  const equipment = { ...flows.equipment };
  const byId = new Map(doc.equipment.map((e) => [e.id, e]));
  for (const e of doc.equipment) {
    if (!has(e, "level")) continue;
    const st = equipment[e.id];
    let delta = 0;
    for (const l of doc.links) {
      if (!flows.flowing[l.id]) continue;
      const src = byId.get(l.from.equipment);
      const rate = (src ? (flows.equipment[src.id]?.speedPct ?? 100) : 100) / 100;
      if (l.to.equipment === e.id) delta += LEVEL_RATE * rate * dtS;
      if (l.from.equipment === e.id) delta -= LEVEL_RATE * dtS;
    }
    if (delta !== 0) equipment[e.id] = { ...st, levelPct: clamp(st.levelPct + delta, 0, 100) };
  }
  return computeFlows(doc, { ...flows, equipment, timeS: s.timeS + dtS });
}

/** Tags publicadas na base única do SCADA (origem SIMULATION). */
export function runtimeTags(
  doc: HmiDoc,
  s: HmiRuntimeState,
): Array<{ name: string; value: number | boolean; unit?: string }> {
  const out: Array<{ name: string; value: number | boolean; unit?: string }> = [];
  for (const e of doc.equipment) {
    const st = s.equipment[e.id];
    if (!st) continue;
    const base = e.tag || e.id;
    if (has(e, "run")) out.push({ name: `${base}.LIGADO`, value: st.running });
    if (has(e, "reverse")) out.push({ name: `${base}.REVERSO`, value: st.reverse });
    if (has(e, "speed")) out.push({ name: `${base}.VELOCIDADE`, value: st.speedPct, unit: "%" });
    if (has(e, "open")) out.push({ name: `${base}.ABERTA`, value: st.open });
    if (has(e, "level"))
      out.push({ name: `${base}.NIVEL`, value: Math.round(st.levelPct * 10) / 10, unit: "%" });
  }
  return out;
}
