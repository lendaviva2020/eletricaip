// Zod-First Validation Schema for the ElétricAi Canvas Bundle
// Version 1.0.0 — Validates structure, bounds, component kinds, and sanitizes input

import { z } from "zod";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  DEFAULT_IMPORTER_LIMITS,
  type AllowedCircuitConfig,
  type AllowedEdgeKind,
  type AllowedNodeKind,
  type EletricAiCanvasBundle,
} from "./types";

export const ALLOWED_NODE_KINDS: readonly AllowedNodeKind[] = [
  "breaker",
  "rcd",
  "contactor",
  "relay",
  "fuse",
  "disconnector",
  "transformer",
  "psu",
  "vfd",
  "softstarter",
  "busbar",
  "ccm",
  "motor",
  "load",
  "lamp",
  "socket",
  "pt100",
  "pressure",
  "flow",
  "level",
  "encoder",
  "estop",
  "lightcurtain",
  "ground",
  "neutral",
  "terminal",
] as const;

export const COMPONENT_ALIASES: Record<string, AllowedNodeKind> = {
  // Disjuntores e proteção
  breaker: "breaker",
  disjuntor: "breaker",
  disjuntormotor: "breaker",
  mcb: "breaker",
  mccb: "breaker",
  qf: "breaker",
  rcd: "rcd",
  dr: "rcd",
  diferencial: "rcd",
  fuse: "fuse",
  fusivel: "fuse",
  fu: "fuse",
  disconnector: "disconnector",
  seccionadora: "disconnector",
  chave_seccionadora: "disconnector",
  qs: "disconnector",

  // Manobra
  contactor: "contactor",
  contator: "contactor",
  km: "contactor",
  relay: "relay",
  rele: "relay",
  rele_termico: "relay",
  ka: "relay",
  fr: "relay",

  // Fontes e acionamentos
  transformer: "transformer",
  transformador: "transformer",
  trafo: "transformer",
  tr: "transformer",
  psu: "psu",
  fonte: "psu",
  power_supply: "psu",
  g: "psu",
  vfd: "vfd",
  inversor: "vfd",
  inversor_frequencia: "vfd",
  softstarter: "softstarter",
  soft_starter: "softstarter",
  partida_suave: "softstarter",
  ss: "softstarter",
  busbar: "busbar",
  barramento: "busbar",
  ccm: "ccm",

  // Cargas
  motor: "motor",
  m: "motor",
  load: "load",
  carga: "load",
  lamp: "lamp",
  lampada: "lamp",
  hl: "lamp",
  socket: "socket",
  tomada: "socket",

  // Segurança
  estop: "estop",
  emergencia: "estop",
  botao_emergencia: "estop",
  e_stop: "estop",
  es: "estop",
  lightcurtain: "lightcurtain",
  cortina_luz: "lightcurtain",

  // Instrumentação
  pt100: "pt100",
  temperatura: "pt100",
  pressure: "pressure",
  pressostato: "pressure",
  transmissor_pressao: "pressure",
  flow: "flow",
  fluxo: "flow",
  level: "level",
  nivel: "level",
  encoder: "encoder",

  // Referência
  ground: "ground",
  terra: "ground",
  pe: "ground",
  neutral: "neutral",
  neutro: "neutral",
  terminal: "terminal",
  borne: "terminal",
};

export function resolveComponentKind(rawType: string): AllowedNodeKind | null {
  if (!rawType || typeof rawType !== "string") return null;
  const clean = rawType.toLowerCase().trim().replace(/[-\s]/g, "_");
  if (COMPONENT_ALIASES[clean]) {
    return COMPONENT_ALIASES[clean];
  }
  if (ALLOWED_NODE_KINDS.includes(clean as AllowedNodeKind)) {
    return clean as AllowedNodeKind;
  }
  return null;
}

// ── Zod Schemas com Sanitização Rigorosa ───────────────────────────────────

export const BundleNodePositionSchema = z.object({
  x: z.number().finite().min(-50000).max(50000),
  y: z.number().finite().min(-50000).max(50000),
});

export const BundleNodeSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_\-\.]+$/, "ID do nó deve conter apenas caracteres alfanuméricos, hífen ou sublinhado"),
  type: z.string().min(1).max(64),
  label: z.string().max(120).optional(),
  position: BundleNodePositionSchema,
  rotation: z.number().finite().min(0).max(360).optional().default(0),
  properties: z
    .record(z.string().max(64), z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]))
    .optional()
    .default({}),
});

export const BundleEdgeSchema = z.object({
  id: z.string().max(64).optional(),
  source: z.string().min(1).max(64),
  target: z.string().min(1).max(64),
  fromTerminal: z.string().max(32).optional(),
  toTerminal: z.string().max(32).optional(),
  kind: z.enum(["power", "signal", "pipe", "ground"]).optional().default("power"),
  circuitConfig: z
    .enum(["F", "F+N", "F+N+PE", "3F", "3F+PE", "3F+N", "3F+N+PE", "PE", "N"])
    .optional(),
});

export const BundleLadderContactSchema = z.object({
  kind: z.enum(["XIC", "XIO"]),
  operand: z.string().min(1).max(64),
});

export const BundleLadderRungSchema = z.object({
  id: z.string().min(1).max(64),
  comment: z.string().max(300).optional(),
  output: z.object({
    kind: z.enum(["OTE", "OTL", "OTU", "TON", "TOF", "TP"]),
    operand: z.string().min(1).max(64),
    params: z.record(z.string().max(32), z.union([z.string().max(64), z.number().finite()])).optional(),
  }),
  branches: z.array(z.array(BundleLadderContactSchema)).min(1).max(20),
});

export const BundleTagSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["BOOL", "INT", "DINT", "REAL", "TIME", "STRING"]).default("BOOL"),
  address: z.string().max(32).optional(),
  initialValue: z.union([z.boolean(), z.number().finite(), z.string().max(120)]).optional(),
  description: z.string().max(250).optional(),
});

export const BundlePlcModuleSchema = z.object({
  slot: z.number().int().min(0).max(32),
  type: z.enum(["DI", "DO", "AI", "AO"]),
  partNumber: z.string().max(64).optional(),
  channelsCount: z.number().int().min(1).max(64).default(8),
  label: z.string().max(64).optional(),
});

export const BundleProjectMetaSchema = z.object({
  name: z.string().min(1).max(160).default("Projeto Importado"),
  diagramType: z.enum(["unifilar", "multifilar", "ladder", "fbd", "hybrid"]).default("unifilar"),
  units: z.enum(["metric", "imperial"]).optional().default("metric"),
  description: z.string().max(1000).optional(),
  standards: z.array(z.string().max(64)).optional().default(["NBR_5410", "NR-10", "NR-12"]),
  systemVoltageV: z.number().finite().positive().optional().default(380),
  frequencyHz: z.union([z.literal(50), z.literal(60)]).optional().default(60),
});

export const EletricAiCanvasBundleSchema = z.object({
  format: z.literal(CANVAS_BUNDLE_FORMAT),
  schemaVersion: z.literal(CURRENT_BUNDLE_VERSION).or(z.string().regex(/^1\.\d+\.\d+$/)),
  project: BundleProjectMetaSchema,
  nodes: z.array(BundleNodeSchema).min(0).max(DEFAULT_IMPORTER_LIMITS.maxNodes),
  edges: z.array(BundleEdgeSchema).min(0).max(DEFAULT_IMPORTER_LIMITS.maxEdges),
  ladder: z
    .object({
      rungs: z.array(BundleLadderRungSchema).max(5000),
    })
    .optional(),
  plc: z
    .object({
      vendor: z.string().max(64).optional().default("siemens"),
      rackName: z.string().max(64).optional().default("Rack Principal"),
      cpuModel: z.string().max(64).optional().default("CPU 1214C DC/DC/DC"),
      modules: z.array(BundlePlcModuleSchema).max(128).optional().default([]),
    })
    .optional(),
  tags: z.array(BundleTagSchema).max(DEFAULT_IMPORTER_LIMITS.maxNodes).optional(),
  metadata: z
    .object({
      author: z.string().max(120).optional(),
      generator: z.string().max(120).optional(),
      generatedAt: z.string().max(64).optional(),
      notes: z.string().max(1000).optional(),
    })
    .optional(),
});
