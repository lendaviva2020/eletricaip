// Deterministic Electrical Connection Repair Engine
// Standards: IEC 60947, IEC 60204-1, NBR 5410
//
// Detecta ligações de POTÊNCIA obrigatórias ausentes em ramais industriais
// típicos e as sintetiza. Usado pela geração/correção com IA, importador e
// pela recuperação de projetos sem ligações.
//
// Regras (AGENTS.md §12.1):
//  • Só a folha UNIFILAR e só arestas `power` contam: um fio de comando
//    (CLP → bobina) não "alimenta" o contator.
//  • Pareamento pelo candidato MAIS PRÓXIMO dentro de um raio máximo, com
//    preferência pelo sentido do fluxo (montante acima, jusante abaixo). Sem
//    candidato plausível → NÃO liga (reporta pendência). Ligar "qualquer
//    disjuntor livre" criava cruzamentos fantasmas entre ramais distantes.
//  • Cadeias: Q → K → F → M ; Q → K → (VFD|SS) → M ; Q → (VFD|SS) → M ; Q → PSU.
//  • Infeed: TR → Q0 → Barramento (ou TR → Barramento sem disjuntor geral).
import type { DiagramDoc, DiagramNode, DiagramEdge, NodeKind, NodeParams } from "../schema";
import { NodeParamsSchema } from "../schema";
import { validateElectricalTopology } from "./graph-validator";
import { createDeterministicConnection, connectBusbarToBranches } from "./connection-engine";

export interface RepairResult {
  repairedDoc: DiagramDoc;
  addedEdges: DiagramEdge[];
  repairedCount: number;
  remainingIssues: string[];
}

/** Raio máximo (px de canvas) para considerar dois equipamentos do mesmo ramal. */
export const MAX_PAIRING_DISTANCE = 900;
/** Penalidade por candidato no sentido contrário ao fluxo (ex.: motor ACIMA do contator). */
const WRONG_DIRECTION_PENALTY = 600;

const MAIN_BREAKER_PATTERN = /\b(geral|main|qgbt|qf0|dj0)\b|^-?q0\b/i;

/** Dispositivos de manobra/proteção em série que só repassam a potência. */
const SERIES_KINDS = new Set(["disconnector", "rcd", "fuse"]);
/** Quem pode alimentar um dispositivo em série. */
const SERIES_UPSTREAM_KINDS = new Set([
  "transformer",
  "generator",
  "breaker",
  "disconnector",
  "rcd",
  "fuse",
]);
/** O que um dispositivo em série pode alimentar. */
const SERIES_DOWNSTREAM_KINDS = new Set([
  "busbar",
  "disconnector",
  "rcd",
  "fuse",
  "contactor",
  "vfd",
  "softstarter",
  "psu",
  "motor",
  "load",
  "lamp",
  "socket",
]);

/** Sobe do barramento pela cadeia série (QS/DR/fusível) até o disjuntor que a alimenta. */
function mainBreakerAbove(doc: DiagramDoc, busbarId: string): string | undefined {
  const seen = new Set<string>();
  let cursor = busbarId;
  while (!seen.has(cursor)) {
    seen.add(cursor);
    const feed = Object.values(doc.edges).find(
      (e) => e.kind === "power" && e.sheet === "unifilar" && e.target === cursor,
    );
    if (!feed) return undefined;
    const up = doc.nodes[feed.source];
    if (!up) return undefined;
    if (up.params.kind === "breaker") return up.id;
    if (!SERIES_KINDS.has(up.params.kind)) return undefined;
    cursor = up.id;
  }
  return undefined;
}

function numericParam(node: DiagramNode, key: string): number {
  const v = (node.params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function isMainBreakerByName(b: DiagramNode): boolean {
  return [b.label, b.params.tag, b.id].some(
    (s) => typeof s === "string" && MAIN_BREAKER_PATTERN.test(s),
  );
}

/**
 * Custo de pareamento: distância Manhattan com peso menor na vertical
 * (ramais são colunas) e penalidade quando o candidato está no lado errado.
 */
function pairingCost(from: DiagramNode, to: DiagramNode, direction: "down" | "up"): number {
  const dx = Math.abs(to.position.x - from.position.x);
  const dyRaw = to.position.y - from.position.y;
  const wrong = direction === "down" ? dyRaw < 0 : dyRaw > 0;
  return dx + Math.abs(dyRaw) * 0.5 + (wrong ? WRONG_DIRECTION_PENALTY : 0);
}

export function repairDiagramConnections(doc: DiagramDoc): RepairResult {
  const nextDoc: DiagramDoc = {
    ...doc,
    nodes: { ...doc.nodes },
    edges: { ...doc.edges },
  };
  const addedEdges: DiagramEdge[] = [];
  const pending: string[] = [];

  const nodes = Object.values(nextDoc.nodes).filter((n) => n.sheet === "unifilar");
  const byKind = (k: NodeKind) => nodes.filter((n) => n.params.kind === k);

  // Índices de grau de potência mantidos incrementalmente (O(1) por consulta).
  const powerIn = new Map<string, number>();
  const powerOut = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const linked = new Set<string>();
  const indexEdge = (e: DiagramEdge) => {
    if (e.kind !== "power" || e.sheet !== "unifilar") return;
    powerOut.set(e.source, (powerOut.get(e.source) ?? 0) + 1);
    powerIn.set(e.target, (powerIn.get(e.target) ?? 0) + 1);
    linked.add(pairKey(e.source, e.target));
  };
  for (const e of Object.values(nextDoc.edges)) indexEdge(e);

  const hasFeeder = (id: string) => (powerIn.get(id) ?? 0) > 0;
  const hasLoad = (id: string) => (powerOut.get(id) ?? 0) > 0;

  const addEdge = (edge: DiagramEdge): boolean => {
    if (linked.has(pairKey(edge.source, edge.target)) || nextDoc.edges[edge.id]) return false;
    const e: DiagramEdge = { ...edge, sheet: "unifilar", kind: "power" };
    nextDoc.edges[e.id] = e;
    addedEdges.push(e);
    indexEdge(e);
    return true;
  };
  const connect = (src: DiagramNode, tgt: DiagramNode) =>
    addEdge(
      createDeterministicConnection(src, tgt, {
        sourcePort: "B",
        targetPort: "T",
        sheet: "unifilar",
      }),
    );

  /** Candidato mais próximo que satisfaz `accept`, dentro do raio máximo. */
  const nearest = (
    from: DiagramNode,
    pool: DiagramNode[],
    direction: "down" | "up",
    accept: (n: DiagramNode) => boolean,
  ): DiagramNode | undefined => {
    let best: DiagramNode | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const c of pool) {
      if (c.id === from.id || !accept(c)) continue;
      const cost = pairingCost(from, c, direction);
      // Desempate determinístico por id: mesma entrada → mesmo resultado.
      if (cost < bestCost || (cost === bestCost && best && c.id < best.id)) {
        best = c;
        bestCost = cost;
      }
    }
    return best && bestCost <= MAX_PAIRING_DISTANCE + WRONG_DIRECTION_PENALTY ? best : undefined;
  };

  const busbars = byKind("busbar");
  const busbar = busbars[0];
  const breakers = byKind("breaker");
  const contactors = byKind("contactor");
  const thermalRelays = byKind("thermal_relay");
  const motors = byKind("motor");
  const drives = [...byKind("vfd"), ...byKind("softstarter")];
  const psus = byKind("psu");
  const transformers = byKind("transformer");
  const generalLoads = nodes.filter(
    (n) => n.params.kind === "load" || n.params.kind === "lamp" || n.params.kind === "socket",
  );

  // ── 0. Dispositivos em SÉRIE (seccionadora, DR, fusível) ────────────────────
  // Entrada: TR → Q0 → QS → DR → Barramento; ramal: Q → DR → tomada. Antes
  // ficavam soltos ("QS-01 sem alimentação") porque o reparo só conhecia
  // Q0 → barramento. Processados de cima para baixo para encadear em ordem.
  const seriesDevices = nodes
    .filter((n) => SERIES_KINDS.has(n.params.kind))
    .sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id));
  if (seriesDevices.length > 0) {
    const upstreamPool = nodes.filter((n) => SERIES_UPSTREAM_KINDS.has(n.params.kind));
    const downstreamPool = nodes.filter((n) => SERIES_DOWNSTREAM_KINDS.has(n.params.kind));
    for (const s of seriesDevices) {
      if (!hasFeeder(s.id)) {
        const up = nearest(
          s,
          upstreamPool,
          "up",
          (c) => !hasLoad(c.id) && c.position.y < s.position.y,
        );
        if (up) connect(up, s);
        else pending.push(`${s.params.tag ?? s.label ?? s.id} sem alimentação a montante próxima`);
      }
      if (!hasLoad(s.id)) {
        const down = nearest(
          s,
          downstreamPool,
          "down",
          (c) => !hasFeeder(c.id) && c.position.y > s.position.y,
        );
        if (down) connect(s, down);
      }
    }
  }

  // ── 1. Infeed: TR → Q0 → (série) → Barramento ──────────────────────────────
  let mainBreakerId: string | undefined;
  if (busbar) {
    // O disjuntor geral pode alimentar o barramento através de seccionadora/DR:
    // sobe pela cadeia série até achar o disjuntor (senão o Q0 virava "ramal"
    // e o passo 2 o realimentava pelo próprio barramento, fechando um laço).
    mainBreakerId = mainBreakerAbove(nextDoc, busbar.id);
    if (mainBreakerId && !hasFeeder(mainBreakerId)) {
      const main = nextDoc.nodes[mainBreakerId];
      const trafo = transformers.find((t) => !hasLoad(t.id));
      if (main && trafo) connect(trafo, main);
    }

    if (!hasFeeder(busbar.id)) {
      // Disjuntor geral: por nome/tag; senão o de MAIOR corrente que ainda não alimenta ramal.
      const freeBreakers = breakers.filter((b) => !hasLoad(b.id));
      const main =
        freeBreakers.find(isMainBreakerByName) ??
        [...freeBreakers].sort(
          (a, b) => numericParam(b, "in_A") - numericParam(a, "in_A") || a.id.localeCompare(b.id),
        )[0];
      // Só promove a geral se for estritamente maior que os demais (evita eleger um ramal).
      const others = breakers.filter((b) => b.id !== main?.id).map((b) => numericParam(b, "in_A"));
      const isPlausibleMain =
        !!main &&
        (isMainBreakerByName(main) || others.every((v) => numericParam(main, "in_A") > v));
      if (main && isPlausibleMain) {
        connect(main, busbar);
        mainBreakerId = main.id;
        const trafo = transformers.find((t) => !hasLoad(t.id));
        if (trafo && !hasFeeder(main.id)) connect(trafo, main);
      } else {
        const trafo = transformers.find((t) => !hasLoad(t.id));
        if (trafo) connect(trafo, busbar);
        else pending.push(`Barramento ${busbar.params.tag ?? busbar.id} sem alimentação`);
      }
    }
  }

  const branchBreakers = breakers.filter((b) => b.id !== mainBreakerId);

  // ── 2. Barramento → disjuntores de ramal sem alimentação ───────────────────
  if (busbar) {
    const unfedBranches = branchBreakers
      .filter((b) => !hasFeeder(b.id))
      .sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id));
    if (unfedBranches.length > 0) {
      for (const e of connectBusbarToBranches(busbar, unfedBranches)) addEdge(e);
    } else if (branchBreakers.length === 0) {
      // Sem disjuntores de ramal: barramento alimenta diretamente os acionamentos.
      const direct = [...contactors, ...drives, ...motors]
        .filter((d) => !hasFeeder(d.id))
        .sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id));
      for (const e of connectBusbarToBranches(busbar, direct)) addEdge(e);
    }
  }

  const freeBreaker = (b: DiagramNode) => !hasLoad(b.id);

  // ── 3. Acionamentos: montante (disjuntor) ──────────────────────────────────
  // Contatores primeiro: no ramal Q → K → VFD → M o contator fica entre Q e VFD.
  for (const km of contactors) {
    if (hasFeeder(km.id)) continue;
    const q = nearest(km, branchBreakers, "up", freeBreaker);
    if (q) connect(q, km);
    else pending.push(`Contator ${km.params.tag ?? km.id} sem disjuntor de ramal próximo`);
  }

  // ── 4. Contator → jusante: relé térmico > inversor/soft > motor ────────────
  for (const km of contactors) {
    if (hasLoad(km.id)) continue;
    const target =
      nearest(km, thermalRelays, "down", (n) => !hasFeeder(n.id)) ??
      nearest(km, drives, "down", (n) => !hasFeeder(n.id)) ??
      nearest(km, motors, "down", (n) => !hasFeeder(n.id));
    if (target) connect(km, target);
  }

  // ── 5. Relé térmico → motor ────────────────────────────────────────────────
  for (const rt of thermalRelays) {
    if (hasLoad(rt.id) || !hasFeeder(rt.id)) continue;
    const m = nearest(rt, motors, "down", (n) => !hasFeeder(n.id));
    if (m) connect(rt, m);
  }

  // ── 6. Inversor / soft-starter: montante e jusante ─────────────────────────
  for (const d of drives) {
    if (!hasFeeder(d.id)) {
      const q = nearest(d, branchBreakers, "up", freeBreaker);
      if (q) connect(q, d);
      else pending.push(`Acionamento ${d.params.tag ?? d.id} sem disjuntor de ramal próximo`);
    }
    if (!hasLoad(d.id)) {
      const m = nearest(d, motors, "down", (n) => !hasFeeder(n.id));
      if (m) connect(d, m);
    }
  }

  // ── 7. Fontes de comando ───────────────────────────────────────────────────
  for (const psu of psus) {
    if (hasFeeder(psu.id)) continue;
    const q = nearest(psu, branchBreakers, "up", freeBreaker);
    if (q) connect(q, psu);
  }

  // ── 8. Motores e cargas restantes: partida direta pelo disjuntor ───────────
  for (const load of [...motors, ...generalLoads]) {
    if (hasFeeder(load.id)) continue;
    const q = nearest(load, branchBreakers, "up", freeBreaker);
    if (q) connect(q, load);
    else
      pending.push(
        `Carga ${load.params.tag ?? load.label ?? load.id} sem proteção de ramal próxima`,
      );
  }

  // ── 9. Validação pós-reparo ────────────────────────────────────────────────
  const validation = validateElectricalTopology(nextDoc);
  const remainingIssues = [
    ...validation.diagnostics.filter((d) => d.severity === "error").map((d) => d.message),
    ...pending,
  ];

  return {
    repairedDoc: nextDoc,
    addedEdges,
    repairedCount: addedEdges.length,
    remainingIssues,
  };
}

// ── Recuperação de projetos legados ──────────────────────────────────────────

type SynthKind =
  | "breaker"
  | "busbar"
  | "contactor"
  | "motor"
  | "transformer"
  | "vfd"
  | "softstarter"
  | "psu"
  | "load";

function inferKind(raw: string): SynthKind {
  const k = raw.toLowerCase();
  if (/breaker|disjuntor|^dj|^q\d/.test(k)) return "breaker";
  if (/busbar|barra/.test(k)) return "busbar";
  if (/contactor|contator|^k\d/.test(k)) return "contactor";
  if (/vfd|inversor/.test(k)) return "vfd";
  if (/soft/.test(k)) return "softstarter";
  if (/motor/.test(k)) return "motor";
  if (/trafo|transformer|transformador/.test(k)) return "transformer";
  if (/psu|fonte/.test(k)) return "psu";
  return "load";
}

/** Parâmetros mínimos VÁLIDOS por tipo (antes um saco `as any` misturava campos de todos). */
const SYNTH_DEFAULTS: Record<SynthKind, Record<string, unknown>> = {
  breaker: { in_A: 32, curve: "C", poles: 3 },
  busbar: { current_A: 250, voltage_V: 380 },
  contactor: { in_A: 32, coil_V: 24 },
  motor: { power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
  transformer: { kVA: 150, primary_V: 13800, secondary_V: 380, vector: "Dyn11" },
  vfd: { power_kW: 7.5, voltage_V: 380 },
  softstarter: { power_kW: 7.5 },
  psu: { output_V: 24, output_A: 10 },
  load: { power_W: 1000, voltage_V: 220, fp: 0.92 },
};

function synthParams(
  kind: SynthKind,
  tag: string,
  extra: Record<string, unknown> | undefined,
): NodeParams {
  const merged = { ...SYNTH_DEFAULTS[kind], ...(extra ?? {}), kind, tag: tag.slice(0, 64) };
  const parsed = NodeParamsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // Parâmetros legados inválidos (ex.: in_A negativo) → descarta os extras, mantém o tipo.
  const fallback = NodeParamsSchema.safeParse({
    ...SYNTH_DEFAULTS[kind],
    kind,
    tag: tag.slice(0, 64),
  });
  if (fallback.success) return fallback.data;
  return NodeParamsSchema.parse({ ...SYNTH_DEFAULTS.load, kind: "load", tag: tag.slice(0, 64) });
}

/**
 * Reconstrói um DiagramDoc a partir do grafo legado do projeto e sela as
 * ligações faltantes com o motor de reparo.
 */
export function synthesizeDiagramDocFromProject(
  nodes: Array<{
    id: string;
    kind?: string;
    label?: string;
    position?: { x: number; y: number };
    params?: Record<string, unknown>;
  }>,
  edges: Array<{
    id?: string;
    source: string;
    target: string;
    kind?: string;
  }>,
): DiagramDoc {
  const newDoc: DiagramDoc = {
    version: 1,
    id: `doc_synth_${Date.now().toString(36)}`,
    metadata: { title: "Projeto Recuperado", norms: ["NBR 5410", "IEC 60947"] },
    sheets: ["unifilar"],
    nodes: {},
    edges: {},
  };

  for (const n of nodes) {
    if (!n?.id) continue;
    const kind = inferKind(n.kind || "load");
    const label = (n.label || n.id).slice(0, 160);
    const pos =
      n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
        ? n.position
        : { x: 100, y: 100 };
    newDoc.nodes[n.id] = {
      id: n.id,
      sheet: "unifilar",
      position: pos,
      label,
      rotation: 0,
      params: synthParams(kind, label, n.params),
    };
  }

  const busbarCount = new Map<string, number>();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!newDoc.nodes[e.source] || !newDoc.nodes[e.target] || e.source === e.target) continue;
    const edgeId = e.id || `edge_synth_${i + 1}`;

    let sourcePort = "B";
    if (newDoc.nodes[e.source]?.params.kind === "busbar") {
      const c = (busbarCount.get(e.source) || 0) + 1;
      busbarCount.set(e.source, c);
      const taps = ["B1", "B2", "B3", "B4", "B"];
      sourcePort = taps[(c - 1) % taps.length];
    }

    newDoc.edges[edgeId] = {
      id: edgeId,
      source: e.source,
      target: e.target,
      sourcePort,
      targetPort: "T",
      kind: e.kind === "signal" ? "signal" : e.kind === "ground" ? "ground" : "power",
      sheet: "unifilar",
      circuitConfig: "3F+N+PE",
    };
  }

  return repairDiagramConnections(newDoc).repairedDoc;
}
