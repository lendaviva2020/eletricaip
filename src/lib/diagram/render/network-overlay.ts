// Etiquetas de resultado do cálculo de rede desenhadas no canvas. PURO:
// converte o relatório em posições e textos; o stage só desenha.
import type { DiagramDoc, DiagramNode } from "../schema";
import type { NetworkReport } from "../connection/network-calculation";
import type { CoordinationReport } from "../connection/protection-coordination";
import { computeNodeBoundingBox } from "./wire-router";

export type BadgeLevel = "ok" | "warn" | "error" | "pending";

export interface NetworkBadge {
  nodeId: string;
  x: number;
  y: number;
  lines: string[];
  level: BadgeLevel;
}

const SHOWN = new Set(["breaker", "fuse", "rcd", "busbar", "motor", "load", "lamp", "socket"]);
const LOADS = new Set(["motor", "load", "lamp", "socket"]);
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function buildNetworkBadges(
  doc: DiagramDoc,
  network: NetworkReport,
  coordination?: CoordinationReport,
): NetworkBadge[] {
  const severity = new Map<string, BadgeLevel>();
  const bump = (id: string | undefined, lvl: BadgeLevel) => {
    if (!id) return;
    const cur = severity.get(id);
    if (cur === "error") return;
    if (lvl === "error" || !cur) severity.set(id, lvl);
  };
  for (const f of network.findings) bump(f.nodeId, f.severity === "error" ? "error" : "warn");
  for (const f of coordination?.findings ?? []) {
    if (f.code === "BREAKING_CAPACITY_MISSING") continue; // aviso agregado, não do nó
    bump(f.nodeId, f.severity === "error" ? "error" : "warn");
  }

  const badges: NetworkBadge[] = [];
  for (const n of Object.values(doc.nodes) as DiagramNode[]) {
    if (n.sheet !== "unifilar" || !SHOWN.has(n.params.kind)) continue;
    const r = network.nodes[n.id];
    if (!r) continue;
    const lines: string[] = [];
    let level: BadgeLevel = severity.get(n.id) ?? "ok";
    if (r.Ik3max_kA === undefined) {
      lines.push("Ik pendente");
      if (level === "ok") level = "pending";
    } else {
      lines.push(`Ik ${fmt(r.Ik3max_kA)} kA`);
      if (LOADS.has(n.params.kind) && r.Ik1min_kA !== undefined) {
        lines.push(`F-T ${fmt(r.Ik1min_kA)} kA`);
      }
    }
    if (n.params.kind === "breaker") {
      const icu = (n.params as { icc_kA?: number }).icc_kA;
      lines.push(icu !== undefined ? `Icu ${fmt(icu)} kA` : "Icu ?");
      if (icu === undefined && level === "ok") level = "warn";
    }
    if (LOADS.has(n.params.kind) && r.dropTotal_pct !== undefined) {
      lines.push(`ΔV ${fmt(r.dropTotal_pct)}%`);
    }
    const box = computeNodeBoundingBox(n);
    badges.push({ nodeId: n.id, x: box.maxX + 6, y: box.minY, lines, level });
  }
  return badges;
}
