/**
 * Hierarquia de ativos do supervisório (ISA-101 níveis 1→3, IEC 81346).
 *
 * Puro e determinístico: recebe equipamentos, tags e alarmes do store e
 * devolve áreas (`=planta+local`), a árvore planta → local → equipamento e os
 * DESVIOS de cada equipamento. Nada é inventado: equipamento sem local fica em
 * "Área não definida" e área sem nenhuma fonte de dado aparece como "sem dados".
 */
import type {
  AlarmSeverity,
  EquipmentTelemetry,
  ScadaAlarmItem,
  ScadaTagDefinition,
} from "./types";

export const UNASSIGNED_AREA_KEY = "__sem_area__";

export type DeviationKind =
  "ALARM_UNACK" | "ALARM_ACK" | "TRIPPED" | "MAINTENANCE" | "BAD_QUALITY" | "STALE" | "FORCED";

export interface Deviation {
  kind: DeviationKind;
  equipmentId: string;
  /** Tag ou alarme que originou o desvio (para navegar até ele). */
  ref: string;
  message: string;
  priority?: AlarmSeverity;
  timestamp?: number;
}

/** Estado resumido (cor só para anormalidade — ISA-101). */
export type AreaHealth = "ALARM" | "DEVIATION" | "NORMAL" | "NO_DATA";

export interface AreaSummary {
  key: string;
  plant?: string;
  location?: string;
  label: string;
  equipmentIds: string[];
  deviations: Deviation[];
  unackAlarms: number;
  activeAlarms: number;
  health: AreaHealth;
  /** Tags com fonte publicando (qualidade diferente de NOT_CONNECTED). */
  connectedTags: number;
  totalTags: number;
}

export interface AssetTreeNode {
  key: string;
  label: string;
  kind: "plant" | "location" | "equipment";
  equipmentId?: string;
  health: AreaHealth;
  children: AssetTreeNode[];
}

const PRIORITY_RANK: Record<AlarmSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const DEVIATION_RANK: Record<DeviationKind, number> = {
  ALARM_UNACK: 0,
  TRIPPED: 1,
  ALARM_ACK: 2,
  STALE: 3,
  BAD_QUALITY: 4,
  FORCED: 5,
  MAINTENANCE: 6,
};

function normalize(s: string): string {
  return s.trim().toUpperCase();
}

/** Alarme ativo = ainda não encerrado (normalizado e reconhecido sai da lista). */
export function isActiveAlarm(a: ScadaAlarmItem): boolean {
  return a.state !== "CLEARED" && a.state !== "SHELVED";
}

export function areaKeyOf(eq: Pick<EquipmentTelemetry, "plant" | "location">): string {
  if (!eq.plant && !eq.location) return UNASSIGNED_AREA_KEY;
  return `${eq.plant ? `=${eq.plant}` : ""}${eq.location ? `+${eq.location}` : ""}`;
}

export function areaLabelOf(eq: Pick<EquipmentTelemetry, "plant" | "location">): string {
  const key = areaKeyOf(eq);
  return key === UNASSIGNED_AREA_KEY ? "Área não definida" : key;
}

/**
 * Índice tag → equipamento. Ordem de confiança: `linkedEquipmentId` do tag,
 * depois a lista `linkedTags` do equipamento.
 */
export function buildTagOwnerIndex(
  equipments: Readonly<Record<string, EquipmentTelemetry>>,
  tags: Readonly<Record<string, ScadaTagDefinition>>,
): Map<string, string> {
  const owner = new Map<string, string>();
  for (const eq of Object.values(equipments)) {
    if (!eq) continue;
    for (const name of eq.linkedTags) owner.set(normalize(name), eq.id);
  }
  for (const t of uniqueTags(tags)) {
    if (t.linkedEquipmentId && equipments[t.linkedEquipmentId]) {
      owner.set(normalize(t.name), t.linkedEquipmentId);
    }
  }
  return owner;
}

/**
 * Equipamento dono de um alarme: pelo tag do alarme (índice), senão pelo
 * prefixo `TAG.` / `TAG_` / `ID.` do equipamento (ex.: "M1.CORRENTE" → M1).
 * Prefixo exige separador para "M1" não casar "M10". Sem dono → null (o
 * alarme continua na lista geral; nunca é atribuído por palpite no texto).
 */
export function equipmentIdForAlarm(
  alarm: Pick<ScadaAlarmItem, "tag">,
  equipments: Readonly<Record<string, EquipmentTelemetry>>,
  ownerIndex: ReadonlyMap<string, string>,
): string | null {
  const tag = normalize(alarm.tag);
  const direct = ownerIndex.get(tag);
  if (direct) return direct;
  let best: { id: string; len: number } | null = null;
  for (const eq of Object.values(equipments)) {
    if (!eq) continue;
    for (const key of [eq.tag, eq.id]) {
      const k = normalize(key);
      if (!k) continue;
      const matches = tag === k || (tag.startsWith(k) && /^[._:-]/.test(tag.slice(k.length)));
      if (matches && (!best || k.length > best.len)) best = { id: eq.id, len: k.length };
    }
  }
  return best?.id ?? null;
}

/** O store guarda o mesmo tag por nome e por id: conta cada tag uma vez. */
export function uniqueTags(
  tags: Readonly<Record<string, ScadaTagDefinition>>,
): ScadaTagDefinition[] {
  const seen = new Map<string, ScadaTagDefinition>();
  for (const t of Object.values(tags)) if (t?.name && !seen.has(t.name)) seen.set(t.name, t);
  return [...seen.values()];
}

function sortDeviations(list: Deviation[]): Deviation[] {
  return list.sort((a, b) => {
    const r = DEVIATION_RANK[a.kind] - DEVIATION_RANK[b.kind];
    if (r !== 0) return r;
    const p = PRIORITY_RANK[a.priority ?? "INFO"] - PRIORITY_RANK[b.priority ?? "INFO"];
    if (p !== 0) return p;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
  });
}

export interface HierarchyInput {
  equipments: Readonly<Record<string, EquipmentTelemetry>>;
  tags: Readonly<Record<string, ScadaTagDefinition>>;
  alarms: readonly ScadaAlarmItem[];
}

export interface HierarchyResult {
  areas: AreaSummary[];
  tree: AssetTreeNode[];
  /** Desvios de equipamento, indexados por id. */
  byEquipment: Map<string, Deviation[]>;
  /** Alarmes ativos sem equipamento identificável (exibidos à parte). */
  orphanAlarms: ScadaAlarmItem[];
  alarmOwner: Map<string, string>;
}

function healthOf(deviations: readonly Deviation[], connected: number, total: number): AreaHealth {
  if (deviations.some((d) => d.kind === "ALARM_UNACK" || d.kind === "TRIPPED")) return "ALARM";
  if (deviations.length > 0) return "DEVIATION";
  if (total > 0 && connected === 0) return "NO_DATA";
  if (total === 0) return "NO_DATA";
  return "NORMAL";
}

export function buildAssetHierarchy(input: HierarchyInput): HierarchyResult {
  const { equipments, tags, alarms } = input;
  const ownerIndex = buildTagOwnerIndex(equipments, tags);
  const byEquipment = new Map<string, Deviation[]>();
  const push = (d: Deviation) => {
    const list = byEquipment.get(d.equipmentId) ?? [];
    list.push(d);
    byEquipment.set(d.equipmentId, list);
  };

  const alarmOwner = new Map<string, string>();
  const orphanAlarms: ScadaAlarmItem[] = [];
  for (const a of alarms) {
    if (!isActiveAlarm(a)) continue;
    const owner = equipmentIdForAlarm(a, equipments, ownerIndex);
    if (!owner) {
      orphanAlarms.push(a);
      continue;
    }
    alarmOwner.set(a.id, owner);
    push({
      kind: a.state === "UNACK" ? "ALARM_UNACK" : "ALARM_ACK",
      equipmentId: owner,
      ref: a.id,
      message: a.description,
      priority: a.priority,
      timestamp: a.timestamp,
    });
  }

  const tagStats = new Map<string, { connected: number; total: number }>();
  for (const t of uniqueTags(tags)) {
    const owner = ownerIndex.get(normalize(t.name));
    if (!owner) continue;
    const st = tagStats.get(owner) ?? { connected: 0, total: 0 };
    st.total += 1;
    if (t.quality !== "NOT_CONNECTED") st.connected += 1;
    tagStats.set(owner, st);
    if (t.forced) {
      push({
        kind: "FORCED",
        equipmentId: owner,
        ref: t.name,
        message: `${t.name} forçado${t.forceReason ? ` — ${t.forceReason}` : ""}`,
        timestamp: t.forcedAt,
      });
    } else if (t.quality === "STALE") {
      push({
        kind: "STALE",
        equipmentId: owner,
        ref: t.name,
        message: `${t.name} sem atualização`,
      });
    } else if (t.quality === "BAD") {
      push({
        kind: "BAD_QUALITY",
        equipmentId: owner,
        ref: t.name,
        message: `${t.name} qualidade ruim`,
      });
    }
  }

  for (const eq of Object.values(equipments)) {
    if (!eq) continue;
    if (eq.status === "TRIPPED")
      push({
        kind: "TRIPPED",
        equipmentId: eq.id,
        ref: eq.id,
        message: `${eq.tag} em falha (disparado)`,
      });
    else if (eq.status === "MAINTENANCE")
      push({
        kind: "MAINTENANCE",
        equipmentId: eq.id,
        ref: eq.id,
        message: `${eq.tag} em manutenção`,
      });
  }
  for (const list of byEquipment.values()) sortDeviations(list);

  const areaMap = new Map<string, AreaSummary>();
  const sortedEquipments = Object.values(equipments)
    .filter(Boolean)
    .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true }));
  for (const eq of sortedEquipments) {
    const key = areaKeyOf(eq);
    const area =
      areaMap.get(key) ??
      ({
        key,
        plant: eq.plant,
        location: eq.location,
        label: areaLabelOf(eq),
        equipmentIds: [],
        deviations: [],
        unackAlarms: 0,
        activeAlarms: 0,
        health: "NO_DATA",
        connectedTags: 0,
        totalTags: 0,
      } satisfies AreaSummary);
    area.equipmentIds.push(eq.id);
    const devs = byEquipment.get(eq.id) ?? [];
    area.deviations.push(...devs);
    area.unackAlarms += devs.filter((d) => d.kind === "ALARM_UNACK").length;
    area.activeAlarms += devs.filter(
      (d) => d.kind === "ALARM_UNACK" || d.kind === "ALARM_ACK",
    ).length;
    const st = tagStats.get(eq.id);
    area.connectedTags += st?.connected ?? 0;
    area.totalTags += st?.total ?? 0;
    areaMap.set(key, area);
  }

  const areas = [...areaMap.values()];
  for (const a of areas) {
    sortDeviations(a.deviations);
    a.health = healthOf(a.deviations, a.connectedTags, a.totalTags);
  }
  // Área com desvio primeiro; "não definida" por último entre iguais.
  const healthRank: Record<AreaHealth, number> = { ALARM: 0, DEVIATION: 1, NORMAL: 2, NO_DATA: 3 };
  areas.sort((a, b) => {
    const h = healthRank[a.health] - healthRank[b.health];
    if (h !== 0) return h;
    if (a.key === UNASSIGNED_AREA_KEY) return 1;
    if (b.key === UNASSIGNED_AREA_KEY) return -1;
    return a.label.localeCompare(b.label, "pt-BR");
  });

  return {
    areas,
    tree: buildTree(areas, equipments, byEquipment, tagStats),
    byEquipment,
    orphanAlarms,
    alarmOwner,
  };
}

function worst(list: readonly AreaHealth[]): AreaHealth {
  for (const h of ["ALARM", "DEVIATION", "NORMAL"] as const) if (list.includes(h)) return h;
  return "NO_DATA";
}

function buildTree(
  areas: readonly AreaSummary[],
  equipments: Readonly<Record<string, EquipmentTelemetry>>,
  byEquipment: ReadonlyMap<string, Deviation[]>,
  tagStats: ReadonlyMap<string, { connected: number; total: number }>,
): AssetTreeNode[] {
  const plants = new Map<string, AssetTreeNode>();
  const orderedAreas = [...areas].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  for (const area of orderedAreas) {
    const plantKey =
      area.key === UNASSIGNED_AREA_KEY ? UNASSIGNED_AREA_KEY : area.plant ? `=${area.plant}` : "=";
    const plantLabel =
      area.key === UNASSIGNED_AREA_KEY
        ? "Área não definida"
        : area.plant
          ? `=${area.plant}`
          : "Planta não definida";
    const plant =
      plants.get(plantKey) ??
      ({
        key: plantKey,
        label: plantLabel,
        kind: "plant",
        health: "NO_DATA",
        children: [],
      } satisfies AssetTreeNode);
    const eqNodes: AssetTreeNode[] = area.equipmentIds.map((id) => {
      const eq = equipments[id];
      const devs = byEquipment.get(id) ?? [];
      const st = tagStats.get(id);
      return {
        key: `eq:${id}`,
        label: eq ? `${eq.tag} — ${eq.name}` : id,
        kind: "equipment",
        equipmentId: id,
        health: healthOf(devs, st?.connected ?? 0, st?.total ?? 0),
        children: [],
      };
    });
    if (area.key === UNASSIGNED_AREA_KEY || !area.location) {
      plant.children.push(...eqNodes);
    } else {
      plant.children.push({
        key: area.key,
        label: `+${area.location}`,
        kind: "location",
        health: area.health,
        children: eqNodes,
      });
    }
    plant.health = worst(plant.children.map((c) => c.health));
    plants.set(plantKey, plant);
  }
  return [...plants.values()].sort((a, b) => {
    if (a.key === UNASSIGNED_AREA_KEY) return 1;
    if (b.key === UNASSIGNED_AREA_KEY) return -1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

/** Filtra a árvore (sem acento, por tag/nome); mantém os ancestrais dos achados. */
export function filterAssetTree(nodes: readonly AssetTreeNode[], query: string): AssetTreeNode[] {
  const q = query.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!q) return [...nodes];
  const out: AssetTreeNode[] = [];
  for (const n of nodes) {
    const label = n.label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (label.includes(q)) {
      out.push(n);
      continue;
    }
    const kids = filterAssetTree(n.children, query);
    if (kids.length) out.push({ ...n, children: kids });
  }
  return out;
}
