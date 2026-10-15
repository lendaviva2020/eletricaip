// Ponte Unifilar → Ladder: mapeamento automático de componentes do diagrama
// unifilar para tags/programa Ladder.
//
// A análise é **pura** (sem I/O, sem rede): recebe nodes/edges do store e
// devolve o mapeamento + código ST/IL gerado. Persistência e aplicação no
// editor ficam em funções separadas (`saveMappings`, `loadMappings`,
// `applyProgramToEditor`), para que a lógica de mapeamento seja testável
// isoladamente.
//
// O código ST gerado segue o dialeto aceito por `@/lib/ladder/importer`
// (assignments `TAG := EXPR;` com AND/OR/NOT).

import type { IndustrialNode, IndustrialEdge } from "@/lib/project-store";
import { importLadderProgram } from "@/lib/ladder/importer";
import { useEditorStore } from "@/lib/editor/store";
import { supabase } from "@/integrations/supabase/client";

export type EquipmentType =
  | "motor"
  | "exhaustor"
  | "breaker"
  | "contactor"
  | "vfd"
  | "softstarter"
  | "transformer"
  | "psu"
  | "estop"
  | "sensor";

export type MappingType = "command" | "feedback" | "protection" | "status";

export interface UnifilarLadderMapping {
  unifilarNodeId: string;
  ladderTagName: string;
  equipmentType: EquipmentType;
  equipmentId: string;
  mappingType: MappingType;
  isPrimary: boolean;
}

export interface GeneratedLadderProgram {
  stCode: string;
  ilCode: string;
  rungsCount: number;
}

export interface BridgeResult {
  success: boolean;
  mappings: UnifilarLadderMapping[];
  ladderProgram?: GeneratedLadderProgram;
  warnings: string[];
  errors: string[];
}

/** Máximo de equipamentos de potência endereçáveis pelo programa gerado. */
const MAX_POWER_DEVICES = 8;

/** Detecção de exaustores — `NodeKind` não possui `exhaustor`/`fan`. */
const EXHAUST_LABEL_RE = /(exaust|exaustor|exhaust|ventilad?or|ex\s*0[12])/i;

/** Tipos que representam uma carga motora acionada por motor elétrico. */
const DRIVEN_KINDS: ReadonlySet<string> = new Set(["motor", "pump", "conveyor", "screw"]);

const SENSOR_KINDS: ReadonlySet<string> = new Set([
  "pt100",
  "pressure",
  "flow",
  "level",
  "encoder",
]);

interface KindRule {
  type: EquipmentType;
  test: (kind: string) => boolean;
}

const KIND_RULES: KindRule[] = [
  { type: "breaker", test: (k) => k === "breaker" },
  { type: "contactor", test: (k) => k === "contactor" },
  { type: "vfd", test: (k) => k === "vfd" },
  { type: "softstarter", test: (k) => k === "softstarter" },
  { type: "transformer", test: (k) => k === "transformer" },
  { type: "psu", test: (k) => k === "psu" },
  { type: "estop", test: (k) => k === "estop" || k === "lightcurtain" },
  { type: "sensor", test: (k) => SENSOR_KINDS.has(k) },
];

function classify(kind: string): EquipmentType | null {
  for (const rule of KIND_RULES) if (rule.test(kind)) return rule.type;
  return null;
}

function isExhaustor(node: IndustrialNode): boolean {
  return EXHAUST_LABEL_RE.test(node.label) || EXHAUST_LABEL_RE.test(node.id);
}

function isDriven(node: IndustrialNode): boolean {
  return DRIVEN_KINDS.has(node.kind) && !isExhaustor(node);
}

/** Tag Ladder estável: prefixo do tipo + id curto derivado do label/id. */
function tagFor(type: EquipmentType, equipmentId: string): string {
  const prefix: Record<EquipmentType, string> = {
    motor: "MTR",
    exhaustor: "EXO",
    breaker: "BRK",
    contactor: "CT",
    vfd: "VFD",
    softstarter: "SST",
    transformer: "TRF",
    psu: "PSU",
    estop: "ES",
    sensor: "SNS",
  };
  return `${prefix[type]}_${equipmentId}`;
}

function shortRef(node: IndustrialNode): string {
  const raw = (node.label || node.id).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.slice(0, 6) || node.id.slice(0, 6).toUpperCase();
}

/**
 * Deriva o `equipmentId` e garante que ele seja **único dentro do tipo**.
 *
 * O `shortRef` vem do label, então dois rótulos parecidos ("Exaustor EX01" e
 * "Exaustor 2") colapsam no mesmo id. Como a tag é `PREFIXO_<id>`, a colisão
 * produziria dois rungs gravando a mesma tag no programa gerado — o segundo
 * sobrescreveria o primeiro em cada scan. Por isso o sufixo sequencial.
 */
function equipmentIdFor(
  type: EquipmentType,
  node: IndustrialNode,
  counters: Map<string, number>,
  used: Set<string>,
): string {
  const claim = (id: string): string => {
    let candidate = id;
    let n = 2;
    while (used.has(`${type}:${candidate}`)) {
      candidate = `${id.slice(0, 4)}${n}`;
      n += 1;
    }
    used.add(`${type}:${candidate}`);
    return candidate;
  };

  if (type === "motor" || type === "exhaustor") return claim(shortRef(node));

  const n = (counters.get(type) ?? 0) + 1;
  counters.set(type, n);
  return claim(`${String(n).padStart(2, "0")}`);
}

/** Label de controle amigável para as saídas do programa gerado. */
function controlTag(type: EquipmentType, equipmentId: string): string {
  return `${tagFor(type, equipmentId)}_CMD`;
}

/**
 * Analisa o diagrama unifilar e produz os mapeamentos + programa Ladder.
 * Função pura: não lê nem grava estado externo.
 */
export function analyzeUnifilarForLadder(
  nodes: IndustrialNode[],
  edges: IndustrialEdge[],
): BridgeResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const counters = new Map<string, number>();
  const used = new Set<string>();
  const mappings: UnifilarLadderMapping[] = [];

  if (nodes.length === 0) {
    return { success: false, mappings: [], warnings, errors: ["Diagrama unifilar vazio"] };
  }

  const motors = nodes.filter(isDriven);
  const exhaustors = nodes.filter(isExhaustor);

  if (motors.length > MAX_POWER_DEVICES) {
    warnings.push(
      `${motors.length} cargas motoras encontradas; o programa gerado cobre as ${MAX_POWER_DEVICES} primeiras.`,
    );
  }

  // 1. Cargas motoras e exaustores → comando principal.
  motors.slice(0, MAX_POWER_DEVICES).forEach((node) => {
    const id = equipmentIdFor("motor", node, counters, used);
    mappings.push({
      unifilarNodeId: node.id,
      ladderTagName: controlTag("motor", id),
      equipmentType: "motor",
      equipmentId: id,
      mappingType: "command",
      isPrimary: true,
    });
  });

  exhaustors.slice(0, 4).forEach((node) => {
    const id = equipmentIdFor("exhaustor", node, counters, used);
    mappings.push({
      unifilarNodeId: node.id,
      ladderTagName: controlTag("exhaustor", id),
      equipmentType: "exhaustor",
      equipmentId: id,
      mappingType: "command",
      isPrimary: true,
    });
  });

  // 2. Demais componentes → proteção/status/feedback.
  for (const node of nodes) {
    const type = classify(node.kind);
    if (!type) continue;
    if (isExhaustor(node) || isDriven(node)) continue;

    const id = equipmentIdFor(type, node, counters, used);
    const mappingType: MappingType =
      type === "estop" || type === "breaker"
        ? "protection"
        : type === "sensor"
          ? "feedback"
          : "status";

    mappings.push({
      unifilarNodeId: node.id,
      ladderTagName: tagFor(type, id),
      equipmentType: type,
      equipmentId: id,
      mappingType,
      isPrimary: type === "estop",
    });
  }

  // 3. Coerência de conexões: cargas sem fonte de alimentação.
  const connectedTargets = new Set(edges.filter((e) => e.kind === "power").map((e) => e.target));
  for (const m of mappings) {
    if (m.equipmentType !== "motor" && m.equipmentType !== "exhaustor") continue;
    if (!connectedTargets.has(m.unifilarNodeId)) {
      warnings.push(`Carga ${m.equipmentId} sem conexão de potência de origem no unifilar.`);
    }
  }

  if (mappings.length === 0) {
    errors.push("Nenhum equipamento reconhecível no diagrama unifilar.");
    return { success: false, mappings, warnings, errors };
  }

  const stCode = generateSTFromMappings(mappings, exhaustors.length > 0);
  const ilCode = generateILFromMappings(mappings, exhaustors.length > 0);

  let rungsCount = 0;
  try {
    rungsCount = importLadderProgram(stCode, "ST").rungs.length;
  } catch (err) {
    warnings.push(
      `Não foi possível validar o programa ST gerado: ${err instanceof Error ? err.message : "erro desconhecido"}`,
    );
  }

  return {
    success: errors.length === 0,
    mappings,
    ladderProgram: { stCode, ilCode, rungsCount },
    warnings,
    errors,
  };
}

const ESTOP_TAG = "ES_SISTEMA";

/**
 * Gera o programa ST (dialeto do importador Ladder):
 * - Rung SISTEMA: sela de partida com E-STOP normalmente fechado.
 * - Um rung por carga: comando e proteção de cada equipamento.
 * - Um rung térmico dos exaustores, se houver.
 */
export function generateSTFromMappings(
  mappings: UnifilarLadderMapping[],
  withExhaustThermal: boolean,
): string {
  const lines: string[] = [];
  lines.push("// Gerado pela ponte Unifilar → Ladder");
  lines.push(
    "SISTEMA_ON := SISTEMA_START OR SISTEMA_ON AND NOT SISTEMA_STOP AND NOT " + ESTOP_TAG + ";",
  );

  for (const m of mappings) {
    if (m.mappingType === "command") {
      lines.push(`${m.ladderTagName} := SISTEMA_ON;`);
    } else if (m.mappingType === "protection") {
      lines.push(`${m.ladderTagName}_PERM := ${m.ladderTagName} AND SISTEMA_ON;`);
    } else {
      lines.push(`${m.ladderTagName}_OK := ${m.ladderTagName};`);
    }
  }

  if (withExhaustThermal) {
    lines.push("EXO_TERMICO := NOT ES_SISTEMA AND PLANT_TEMP_ALTA;");
  }

  return lines.join("\n");
}

/** Gera o equivalente IL (diametro do importador: LD / ST / S / R). */
export function generateILFromMappings(
  mappings: UnifilarLadderMapping[],
  withExhaustThermal: boolean,
): string {
  const lines: string[] = [];
  lines.push("(* Gerado pela ponte Unifilar → Ladder *)");
  lines.push("LD SISTEMA_START");
  lines.push("OR SISTEMA_ON");
  lines.push("AND NOT SISTEMA_STOP");
  lines.push("AND NOT " + ESTOP_TAG);
  lines.push("ST SISTEMA_ON");

  for (const m of mappings) {
    if (m.mappingType === "command") {
      lines.push("LD SISTEMA_ON");
      lines.push("ST " + m.ladderTagName);
    } else if (m.mappingType === "protection") {
      lines.push("LD " + m.ladderTagName);
      lines.push("AND SISTEMA_ON");
      lines.push("ST " + m.ladderTagName + "_PERM");
    } else {
      lines.push("LD " + m.ladderTagName);
      lines.push("ST " + m.ladderTagName + "_OK");
    }
  }

  if (withExhaustThermal) {
    lines.push("LD NOT ES_SISTEMA");
    lines.push("AND PLANT_TEMP_ALTA");
    lines.push("ST EXO_TERMICO");
  }

  return lines.join("\n");
}

/**
 * Importa o programa ST e carrega os rungs no editor Ladder.
 * Lança se o programa for inválido — o chamador exibe o erro.
 */
export function applyProgramToEditor(stCode: string): number {
  const result = importLadderProgram(stCode, "ST");
  if (result.rungs.length === 0) throw new Error("empty_ladder_program");
  useEditorStore.getState().setRungs(result.rungs);
  return result.rungs.length;
}

/** Persiste um conjunto de mapeamentos, substituindo os anteriores do projeto. */
export async function saveMappings(
  projectId: string,
  mappings: UnifilarLadderMapping[],
): Promise<void> {
  const { error: delError } = await supabase
    .from("unifilar_ladder_mapping")
    .delete()
    .eq("project_id", projectId);
  if (delError) throw new Error(delError.message);

  if (mappings.length === 0) return;

  const rows = mappings.map((m) => ({
    project_id: projectId,
    unifilar_node_id: m.unifilarNodeId,
    ladder_tag_name: m.ladderTagName,
    equipment_type: m.equipmentType,
    equipment_id: m.equipmentId,
    mapping_type: m.mappingType,
    is_primary: m.isPrimary,
  }));

  const { error } = await supabase.from("unifilar_ladder_mapping").insert(rows);
  if (error) throw new Error(error.message);
}

export async function loadMappings(projectId: string): Promise<UnifilarLadderMapping[]> {
  const { data, error } = await supabase
    .from("unifilar_ladder_mapping")
    .select(
      "unifilar_node_id, ladder_tag_name, equipment_type, equipment_id, mapping_type, is_primary",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data as Array<Record<string, unknown>>).map((row) => ({
    unifilarNodeId: String(row.unifilar_node_id),
    ladderTagName: String(row.ladder_tag_name),
    equipmentType: row.equipment_type as EquipmentType,
    equipmentId: String(row.equipment_id),
    mappingType: row.mapping_type as MappingType,
    isPrimary: Boolean(row.is_primary),
  }));
}
