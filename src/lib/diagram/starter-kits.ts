// Kits de partida de motor para o unifilar — PURO.
//
// Um kit solta o ramal COMPLETO e já ligado (disjuntor-motor → contator(es) →
// relé térmico → motor), com a função de cada contator declarada (`role`) para
// que Ladder, FB Electric Studio e CCM saibam qual é linha, estrela, triângulo,
// horário ou anti-horário. Os valores nominais vêm da biblioteca e entram como
// NÃO CONFIRMADOS (o engenheiro confere com placa/catálogo).
import { makeEdge, makeNode } from "./model";
import type {
  DiagramDoc,
  DiagramEdge,
  DiagramNode,
  NodeKind,
  NodeParams,
  Position,
  SheetKind,
} from "./schema";
import {
  IEC_81346_CLASS,
  isValidDeviceTag,
  normalizeTag,
} from "@/lib/documentation/device-designation";

export type StarterKitKind = "dol" | "star_delta" | "reversing";

export const STARTER_KITS: ReadonlyArray<{
  kind: StarterKitKind;
  name: string;
  description: string;
  norm: string;
}> = [
  {
    kind: "dol",
    name: "Partida direta",
    description: "Disjuntor-motor, contator, relé térmico e motor",
    norm: "IEC 60947-4-1",
  },
  {
    kind: "star_delta",
    name: "Partida estrela-triângulo",
    description: "Contatores de linha, estrela e triângulo + relé térmico",
    norm: "IEC 60947-4-1",
  },
  {
    kind: "reversing",
    name: "Partida com reversão",
    description: "Contatores horário e anti-horário intertravados + relé térmico",
    norm: "IEC 60947-4-1",
  },
];

export interface StarterKitResult {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

type ParamsFor = (kind: NodeKind) => Record<string, unknown>;

/** Espaçamento vertical/horizontal do kit (px do canvas, múltiplos da grade). */
const DY = 120;
const DX = 140;

export function buildStarterKit(
  kit: StarterKitKind,
  origin: Position,
  sheet: SheetKind,
  paramsFor: ParamsFor,
): StarterKitResult {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const node = (
    kind: NodeKind,
    dx: number,
    dy: number,
    label: string,
    extra: Record<string, unknown> = {},
  ) => {
    const n = makeNode({
      sheet,
      position: { x: origin.x + dx, y: origin.y + dy },
      params: { ...paramsFor(kind), ...extra } as NodeParams,
      label,
    });
    nodes.push(n);
    return n;
  };
  const link = (a: DiagramNode, b: DiagramNode) =>
    edges.push(makeEdge({ sheet, source: a.id, target: b.id, kind: "power" }));

  const q = node("breaker", 0, 0, "QF");
  if (kit === "dol") {
    const k = node("contactor", 0, DY, "KM", { role: "line" });
    const f = node("thermal_relay", 0, 2 * DY, "FT");
    const m = node("motor", 0, 3 * DY, "M", { startMethod: "DOL" });
    link(q, k);
    link(k, f);
    link(f, m);
  } else if (kit === "reversing") {
    const k1 = node("contactor", -DX / 2, DY, "KM", { role: "forward" });
    const k2 = node("contactor", DX / 2, DY, "KM", { role: "reverse" });
    const f = node("thermal_relay", 0, 2 * DY, "FT");
    const m = node("motor", 0, 3 * DY, "M", { startMethod: "REVERSING" });
    link(q, k1);
    link(q, k2);
    link(k1, f);
    link(k2, f);
    link(f, m);
  } else {
    // Estrela-triângulo: linha → térmico → motor; triângulo e estrela ligados ao motor
    // (no unifilar o fechamento dos enrolamentos fica representado pelos contatores).
    const kLine = node("contactor", 0, DY, "KM", { role: "line" });
    const f = node("thermal_relay", 0, 2 * DY, "FT");
    const m = node("motor", 0, 3 * DY, "M", { startMethod: "STAR_DELTA" });
    const kDelta = node("contactor", DX, 2 * DY, "KM", { role: "delta" });
    const kStar = node("contactor", DX, 3 * DY + DY / 2, "KM", { role: "star" });
    link(q, kLine);
    link(kLine, f);
    link(f, m);
    link(kLine, kDelta);
    link(kDelta, m);
    link(m, kStar);
  }
  return { nodes, edges };
}

/**
 * Dá a cada equipamento do kit a próxima tag livre da classe IEC 81346 (Q, K, F,
 * M…) considerando o que já existe no diagrama — dois contatores do mesmo kit
 * nunca saem com o mesmo nome (o Ladder usa a tag como operando).
 */
export function assignKitTags(doc: DiagramDoc, kit: StarterKitResult): StarterKitResult {
  const taken = new Set<string>();
  for (const n of Object.values(doc.nodes)) {
    const tag = n.params.tag;
    if (isValidDeviceTag(tag)) taken.add(normalizeTag(tag as string));
  }
  const counters = new Map<string, number>();
  const nextTag = (letter: string) => {
    let i = counters.get(letter) ?? 1;
    while (taken.has(normalizeTag(`${letter}${i}`))) i++;
    const tag = `${letter}${i}`;
    taken.add(normalizeTag(tag));
    counters.set(letter, i + 1);
    return tag;
  };
  const nodes = kit.nodes.map((n) => {
    const letter = IEC_81346_CLASS[n.params.kind] ?? "A";
    const tag = nextTag(letter);
    return { ...n, label: tag, params: { ...n.params, tag } as NodeParams };
  });
  return { nodes, edges: kit.edges };
}
