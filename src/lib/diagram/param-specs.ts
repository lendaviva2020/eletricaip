// Especificações de UI (labels, unidades, ranges, opções) para os parâmetros
// de cada `NodeKind` do DiagramStore. Fonte de verdade da renderização do
// `RightPropertyPanel`. As validações estruturais (tipos, obrigatórios, mins)
// continuam sendo aplicadas pelo `NodeParamsSchema` (Zod) em `schema.ts` —
// este arquivo cuida somente da experiência de edição.
//
// Introduzido em #WGL-07 · etapa 2 como substituto do `paramSpecs` derivado
// de `palette/component-catalog.ts`.
import type { NodeKind } from "./schema";

export type ParamSpecType = "number" | "boolean" | "select" | "text" | "time";

export interface ParamSpec {
  key: string;
  label: string;
  type: ParamSpecType;
  unit?: string;
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
  normRef?: string;
}

type SpecMap = Record<string, ParamSpec>;

const empty: SpecMap = {};

const commonMeta: SpecMap = {
  tag: { key: "tag", label: "Tag", type: "text", defaultValue: "" },
  notes: { key: "notes", label: "Notas", type: "text", defaultValue: "" },
};

function withCommon(specs: SpecMap): SpecMap {
  return { ...specs, ...commonMeta };
}

const curveOptions = ["B", "C", "D"].map((v) => ({ label: v, value: v }));
const poles14 = { min: 1, max: 4 };
const startMethodOptions = ["DOL", "SOFT", "VFD"].map((v) => ({ label: v, value: v }));
const insulationOptions = ["PVC", "EPR", "XLPE"].map((v) => ({ label: v, value: v }));
const estopCategoryOptions = ["0", "1", "2"].map((v) => ({ label: `Cat ${v}`, value: v }));

export const NODE_PARAM_SPECS: Record<NodeKind, SpecMap> = {
  breaker: withCommon({
    in_A: { key: "in_A", label: "Corrente nominal", type: "number", unit: "A", defaultValue: 16, min: 0.1, normRef: "NBR 5410" },
    curve: { key: "curve", label: "Curva", type: "select", defaultValue: "C", options: curveOptions },
    poles: { key: "poles", label: "Polos", type: "number", defaultValue: 1, ...poles14 },
    icc_kA: { key: "icc_kA", label: "Icc", type: "number", unit: "kA", defaultValue: 6 },
  }),
  rcd: withCommon({
    in_A: { key: "in_A", label: "Corrente nominal", type: "number", unit: "A", defaultValue: 25, min: 0.1 },
    sensitivity_mA: { key: "sensitivity_mA", label: "Sensibilidade", type: "number", unit: "mA", defaultValue: 30, min: 1 },
    poles: { key: "poles", label: "Polos", type: "number", defaultValue: 2, min: 2, max: 4 },
  }),
  contactor: withCommon({
    in_A: { key: "in_A", label: "Corrente nominal", type: "number", unit: "A", defaultValue: 25, min: 0.1 },
    coil_V: { key: "coil_V", label: "Tensão bobina", type: "number", unit: "V", defaultValue: 24 },
  }),
  relay: withCommon({
    coil_V: { key: "coil_V", label: "Tensão bobina", type: "number", unit: "V", defaultValue: 24 },
    contacts: { key: "contacts", label: "Contatos", type: "number", defaultValue: 2, min: 1 },
  }),
  fuse: withCommon({
    in_A: { key: "in_A", label: "Corrente nominal", type: "number", unit: "A", defaultValue: 10, min: 0.1 },
  }),
  disconnector: withCommon({
    in_A: { key: "in_A", label: "Corrente nominal", type: "number", unit: "A", defaultValue: 32, min: 0.1 },
  }),
  transformer: withCommon({
    kVA: { key: "kVA", label: "Potência", type: "number", unit: "kVA", defaultValue: 75, min: 0.1 },
    primary_V: { key: "primary_V", label: "Tensão primária", type: "number", unit: "V", defaultValue: 13800 },
    secondary_V: { key: "secondary_V", label: "Tensão secundária", type: "number", unit: "V", defaultValue: 380 },
    vector: { key: "vector", label: "Grupo vetorial", type: "text", defaultValue: "Dyn11" },
  }),
  psu: withCommon({
    output_V: { key: "output_V", label: "Tensão saída", type: "number", unit: "V", defaultValue: 24 },
    output_A: { key: "output_A", label: "Corrente saída", type: "number", unit: "A", defaultValue: 10 },
  }),
  vfd: withCommon({
    power_kW: { key: "power_kW", label: "Potência", type: "number", unit: "kW", defaultValue: 7.5, min: 0.1 },
    voltage_V: { key: "voltage_V", label: "Tensão", type: "number", unit: "V", defaultValue: 380 },
  }),
  softstarter: withCommon({
    power_kW: { key: "power_kW", label: "Potência", type: "number", unit: "kW", defaultValue: 7.5, min: 0.1 },
  }),
  busbar: withCommon({
    current_A: { key: "current_A", label: "Corrente", type: "number", unit: "A", defaultValue: 63 },
    voltage_V: { key: "voltage_V", label: "Tensão", type: "number", unit: "V", defaultValue: 380 },
  }),
  ccm: withCommon({
    columns: { key: "columns", label: "Colunas", type: "number", defaultValue: 1, min: 1 },
    cells: { key: "cells", label: "Gavetas", type: "number", defaultValue: 4, min: 1 },
  }),
  motor: withCommon({
    power_kW: { key: "power_kW", label: "Potência", type: "number", unit: "kW", defaultValue: 7.5, min: 0.1 },
    voltage_V: { key: "voltage_V", label: "Tensão", type: "number", unit: "V", defaultValue: 380 },
    fla_A: { key: "fla_A", label: "Corrente plena carga", type: "number", unit: "A", defaultValue: 15 },
    startMethod: { key: "startMethod", label: "Partida", type: "select", defaultValue: "DOL", options: startMethodOptions },
  }),
  load: withCommon({
    power_W: { key: "power_W", label: "Potência", type: "number", unit: "W", defaultValue: 1500, min: 0.1 },
    voltage_V: { key: "voltage_V", label: "Tensão", type: "number", unit: "V", defaultValue: 220 },
    fp: { key: "fp", label: "Fator de potência", type: "number", defaultValue: 0.92, min: 0, max: 1 },
  }),
  lamp: withCommon({
    power_W: { key: "power_W", label: "Potência", type: "number", unit: "W", defaultValue: 15 },
    voltage_V: { key: "voltage_V", label: "Tensão", type: "number", unit: "V", defaultValue: 220 },
  }),
  socket: withCommon({
    current_A: { key: "current_A", label: "Corrente", type: "number", unit: "A", defaultValue: 10 },
    voltage_V: { key: "voltage_V", label: "Tensão", type: "number", unit: "V", defaultValue: 220 },
  }),
  pt100: withCommon(empty),
  pressure: withCommon(empty),
  flow: withCommon(empty),
  level: withCommon(empty),
  encoder: withCommon({
    ppr: { key: "ppr", label: "Pulsos por volta", type: "number", defaultValue: 1024, min: 1 },
  }),
  estop: withCommon({
    category: { key: "category", label: "Categoria de parada", type: "select", defaultValue: "1", options: estopCategoryOptions, normRef: "ISO 13850" },
  }),
  lightcurtain: withCommon({
    resolution_mm: { key: "resolution_mm", label: "Resolução", type: "number", unit: "mm", defaultValue: 14 },
  }),
  ground: withCommon(empty),
  neutral: withCommon(empty),
  terminal: withCommon(empty),
};

/** Opções default para o campo `insulation` do cabo — usado no painel de aresta. */
export const CABLE_INSULATION_OPTIONS = insulationOptions;

export function getParamSpecs(kind: NodeKind): SpecMap {
  return NODE_PARAM_SPECS[kind] ?? commonMeta;
}
