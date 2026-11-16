/**
 * Monta a configuração da bancada a partir do unifilar.
 *
 * Cada contator da folha unifilar vira uma saída de relé (D4, D5, …), e o
 * disjuntor do mesmo ramal vira uma entrada de contato auxiliar. A corrente
 * da carga e a do disjuntor vêm dos parâmetros do diagrama. A seção do
 * condutor NÃO é presumida: sem ela, a verificação NBR 5410 fica pendente.
 */
import type { DiagramDoc, DiagramEdge } from "@/lib/diagram/schema";
import { BenchConfigSchema, type BenchConfig } from "./bench-config";

/** D2 = E-STOP; D3 reservada (2ª interrupção); D13 evitado (pisca no boot). */
const OUTPUT_PINS = [4, 5, 6, 7, 10, 11, 12] as const;
const INPUT_PINS = [8, 9, 3] as const;

export interface BenchMappingResult {
  readonly config: BenchConfig;
  /** Contatores que ficaram sem pino livre. */
  readonly skipped: readonly string[];
}

function num(params: object, key: string): number | undefined {
  const v = (params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

function label(tag: string | undefined, fallback: string): string {
  const raw = (tag ?? fallback).replace(/[^\w .\-+=]/g, "").trim();
  return (raw || fallback).slice(0, 24);
}

function neighbors(doc: DiagramDoc, id: string): string[] {
  const out: string[] = [];
  for (const e of Object.values(doc.edges) as DiagramEdge[]) {
    if (e.kind !== "power" || e.sheet !== "unifilar") continue;
    if (e.source === id) out.push(e.target);
    else if (e.target === id) out.push(e.source);
  }
  return out;
}

const STOP_KINDS = new Set(["busbar", "transformer", "source", "generator", "ccm"]);

/** Procura (BFS curta) o primeiro nó de um tipo a partir do contator. */
function nearest(doc: DiagramDoc, from: string, kinds: ReadonlySet<string>): string | undefined {
  const visited = new Set([from]);
  let frontier = [from];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of neighbors(doc, id)) {
        if (visited.has(other)) continue;
        visited.add(other);
        const node = doc.nodes[other];
        if (!node) continue;
        if (kinds.has(node.params.kind)) return other;
        if (!STOP_KINDS.has(node.params.kind)) next.push(other);
      }
    }
    frontier = next;
  }
  return undefined;
}

const BREAKER = new Set(["breaker"]);
const LOADS = new Set(["motor", "load", "lamp", "socket"]);

export function benchConfigFromDiagram(doc: DiagramDoc): BenchMappingResult {
  const contactors = Object.values(doc.nodes)
    .filter((n) => n.sheet === "unifilar" && n.params.kind === "contactor")
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  const outputs: BenchConfig["outputs"] = [];
  const inputs: BenchConfig["inputs"] = [];
  const skipped: string[] = [];
  const breakerInput = new Map<string, number>();

  for (const k of contactors) {
    const pin = OUTPUT_PINS[outputs.length];
    if (pin === undefined) {
      skipped.push(k.params.tag ?? k.label ?? k.id);
      continue;
    }
    const breakerId = nearest(doc, k.id, BREAKER);
    const loadId = nearest(doc, k.id, LOADS);
    const breaker = breakerId ? doc.nodes[breakerId] : undefined;
    const load = loadId ? doc.nodes[loadId] : undefined;

    let breakerAuxPin: number | undefined;
    if (breaker) {
      breakerAuxPin = breakerInput.get(breaker.id);
      if (breakerAuxPin === undefined) {
        const free = INPUT_PINS[inputs.length];
        if (free !== undefined) {
          breakerAuxPin = free;
          breakerInput.set(breaker.id, free);
          inputs.push({
            pin: free,
            label: label(breaker.params.tag, `Q${inputs.length + 1}`) + " aux",
            role: "breaker_aux",
            unifilarNodeId: breaker.id,
          });
        }
      }
    }

    const loadCurrent = load
      ? (num(load.params, "current_A") ?? num(load.params, "fla_A"))
      : undefined;
    outputs.push({
      pin,
      label: label(k.params.tag, `K${outputs.length + 1}`),
      activeLow: true,
      unifilarNodeId: k.id,
      loadCurrentA: loadCurrent,
      breakerA: breaker ? num(breaker.params, "in_A") : undefined,
      contactRatingA: num(k.params, "in_A"),
      breakerAuxPin,
    });
  }

  const config = BenchConfigSchema.parse({
    name: "Bancada do unifilar",
    estopPin: 2,
    outputs,
    inputs: inputs.map((i) => ({ ...i, label: i.label.slice(0, 24) })),
    analog: [],
  });
  return { config, skipped };
}
