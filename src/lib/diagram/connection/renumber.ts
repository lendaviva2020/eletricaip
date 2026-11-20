// Numeração sequencial determinística de dispositivos do unifilar — PURA.
//
// Converte tags fora da convenção IEC 81346 (ex.: "DJ", "DJ1", "QF1") para a
// LETRA DE CLASSE do tipo + número sequencial por tipo (Q1, Q2…, K1, K2…,
// F1…, M1…), por coluna (x) e depois linha (y). Tags que JÁ usam a letra de
// classe correta e são únicas são preservadas (o "Q0" do disjuntor geral e o
// "Q5" escolhido pelo engenheiro continuam iguais).
//
// Propriedades garantidas:
//  • Idempotente: rodar duas vezes seguidas não muda nada na segunda vez.
//  • Nunca adiciona, remove ou move equipamento — só ajusta `params.tag` e tira
//    do rótulo a designação antiga ("KM-01 32A" com tag K1 → "32A").
//  • Nunca gera duas tags iguais (resolve duplicatas numerando a 2ª em diante).
//
// É o mesmo princípio de `lib/documentation/diagram-numbering.ts`, mas opera
// sobre um DiagramDoc no servidor (geração/correção com IA) em vez de emitir
// comandos do editor.
import type { DiagramDoc, DiagramNode } from "../schema";
import { stripStaleDesignation } from "../render/node-label";
import {
  IEC_81346_CLASS,
  isValidDeviceTag,
  normalizeTag,
} from "@/lib/documentation/device-designation";

export interface TagChange {
  nodeId: string;
  from: string;
  to: string;
}

export interface RenumberResult {
  doc: DiagramDoc;
  changes: TagChange[];
}

/** Referências do desenho que não recebem tag de produto. */
const NOT_A_PRODUCT = new Set(["ground", "neutral"]);
const COLUMN_PX = 100;

function placementOrder(a: DiagramNode, b: DiagramNode): number {
  const ca = Math.floor(a.position.x / COLUMN_PX);
  const cb = Math.floor(b.position.x / COLUMN_PX);
  return ca - cb || a.position.y - b.position.y || a.id.localeCompare(b.id);
}

const classLetter = (kind: string): string => IEC_81346_CLASS[kind] ?? "A";

/** Letra inicial da tag normalizada ("DJ1" → "DJ", "Q0" → "Q"). */
function tagLetter(normalized: string): string {
  return normalized.match(/^[A-Z]+/)?.[0] ?? "";
}

export function normalizeDeviceTags(doc: DiagramDoc): RenumberResult {
  const nodes = Object.values(doc.nodes)
    .filter((n) => n.sheet === "unifilar" && !NOT_A_PRODUCT.has(n.params.kind))
    .sort(placementOrder);

  // Semente: tags válidas que JÁ usam a letra de classe certa e são únicas.
  const used = new Set<string>();
  const keep = new Set<string>();
  for (const n of nodes) {
    const tag = n.params.tag;
    if (!isValidDeviceTag(tag)) continue;
    const norm = normalizeTag(tag as string);
    if (tagLetter(norm) !== classLetter(n.params.kind)) continue; // letra errada → renumera
    if (used.has(norm)) continue; // duplicata → a 2ª em diante renumera
    used.add(norm);
    keep.add(n.id);
  }

  const counters = new Map<string, number>();
  const nextTag = (letter: string): string => {
    let n = counters.get(letter) ?? 0;
    let candidate: string;
    do {
      n += 1;
      candidate = `${letter}${n}`;
    } while (used.has(candidate));
    counters.set(letter, n);
    used.add(candidate);
    return candidate;
  };

  const changes: TagChange[] = [];
  const nextNodes: Record<string, DiagramNode> = { ...doc.nodes };
  for (const n of nodes) {
    if (keep.has(n.id)) {
      // Tag certa, mas rótulo com designação antiga ("K1" + "KM-01 32A").
      const tag = typeof n.params.tag === "string" ? n.params.tag : "";
      const clean = n.label ? stripStaleDesignation(n.label, tag) : n.label;
      if (clean !== n.label) nextNodes[n.id] = { ...n, label: clean };
      continue;
    }
    const to = nextTag(classLetter(n.params.kind));
    const from = typeof n.params.tag === "string" ? n.params.tag : "";
    if (normalizeTag(from) === to) continue; // já estava correto
    // O rótulo não pode carregar a designação antiga ("KM-01 32A" → "32A").
    const label = n.label ? stripStaleDesignation(n.label, to) : n.label;
    nextNodes[n.id] = { ...n, label, params: { ...n.params, tag: to } };
    changes.push({ nodeId: n.id, from, to });
  }

  return { doc: { ...doc, nodes: nextNodes }, changes };
}
