/**
 * Numeração de dispositivos no editor (Documentação EletricAI), aplicada como UM comando reversível (Ctrl+Z desfaz tudo).
 *
 * - Ordem de numeração: por coluna (x, em faixas de 100 px) e depois linha (y),
 *   como a numeração por página/coluna usual em CAE elétrico.
 * - Modo "missing": só equipamentos sem tag válida + o 2º, 3º… de uma tag
 *   duplicada. Tags válidas e únicas do engenheiro nunca são alteradas.
 * - Modo "all": renumera tudo em sequência limpa (Q1, Q2…, K1, K2…).
 * - Só a folha unifilar (o multifilar é derivado dela).
 */
import type { Command } from "@/lib/diagram/commands";
import type { DiagramDoc, DiagramNode } from "@/lib/diagram/schema";
import { stripStaleDesignation } from "@/lib/diagram/render/node-label";
import { IEC_81346_CLASS, isValidDeviceTag, normalizeTag } from "./device-designation";

export type NumberingMode = "missing" | "all";

export interface NumberingChange {
  nodeId: string;
  label: string;
  from: string;
  to: string;
  reason: "missing" | "invalid" | "duplicate" | "renumber";
}

export interface NumberingPlan {
  changes: NumberingChange[];
  command: Command | null;
}

const NOT_A_PRODUCT = new Set(["ground", "neutral"]);
const COLUMN_PX = 100;

function placementOrder(a: DiagramNode, b: DiagramNode): number {
  const ca = Math.floor(a.position.x / COLUMN_PX);
  const cb = Math.floor(b.position.x / COLUMN_PX);
  return ca - cb || a.position.y - b.position.y || a.id.localeCompare(b.id);
}

export function planDeviceNumbering(doc: DiagramDoc, mode: NumberingMode): NumberingPlan {
  const nodes = Object.values(doc.nodes)
    .filter((n) => n.sheet === "unifilar" && !NOT_A_PRODUCT.has(n.params.kind))
    .sort(placementOrder);

  const used = new Set<string>();
  const seen = new Set<string>();
  const keep = new Set<string>();
  if (mode === "missing") {
    for (const n of nodes) {
      const tag = n.params.tag;
      if (!isValidDeviceTag(tag)) continue;
      const key = normalizeTag(tag as string);
      if (seen.has(key)) continue; // duplicata: o primeiro (por posição) fica
      seen.add(key);
      used.add(key);
      keep.add(n.id);
    }
  }

  const counters = new Map<string, number>();
  const next = (letter: string): string => {
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

  const changes: NumberingChange[] = [];
  const commands: Command[] = [];
  for (const n of nodes) {
    if (keep.has(n.id)) continue;
    const current = n.params.tag ?? "";
    const to = next(IEC_81346_CLASS[n.params.kind] ?? "A");
    if (current === to) continue;
    const reason: NumberingChange["reason"] =
      mode === "all"
        ? "renumber"
        : !current
          ? "missing"
          : isValidDeviceTag(current)
            ? "duplicate"
            : "invalid";
    changes.push({ nodeId: n.id, label: n.label || n.params.kind, from: current, to, reason });
    commands.push({
      type: "UpdateNodeParams",
      nodeId: n.id,
      from: n.params,
      to: { ...n.params, tag: to },
    });
    // Rótulo com a designação antiga ("KM-01 32A") ficaria "K1 KM-01 32A" no desenho.
    const cleanLabel = n.label ? stripStaleDesignation(n.label, to) : n.label;
    if (cleanLabel !== n.label) {
      commands.push({ type: "UpdateNodeLabel", nodeId: n.id, from: n.label, to: cleanLabel });
    }
  }

  return {
    changes,
    command: commands.length ? { type: "Batch", commands } : null,
  };
}
