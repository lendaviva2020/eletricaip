// Authorized Engineering Agent Tool Layer for ElétricAi Industrial OS.
// Implements all 18 typed tools with strict Zod validation, revision tracking,
// audit logging, and IS_PHYSICAL_CONTROL_ALLOWED = false enforcement.
import { z } from "zod";
import { autoLayoutIndustrialDiagram } from "@/lib/diagram/connection/auto-layout-router";
import { buildCanonicalDiagramParams } from "@/lib/diagram/connection/canonical-params";
import {
  buildEngineeringProposalBundle,
  repairDiagramConnections,
} from "@/lib/diagram/connection/connection-repair-engine";
import {
  evaluateNormativeEngineeringCompliance,
  validateElectricalTopology,
} from "@/lib/diagram/connection/graph-validator";
import { createEmptyDoc, makeEdge, makeNode } from "@/lib/diagram/model";
import { buildMultifilarCommands, summarizeConductors } from "@/lib/diagram/multifilar";
import { DiagramDocSchema, NodeKindSchema, type DiagramDoc } from "@/lib/diagram/schema";
import { computeCircuitEnergization } from "@/lib/diagram/electrical-simulation";
import { recordAiAuditEvent } from "./ai-gateway.server";
import { extractEngineeringSnapshotFromState } from "./engineering-context.server";
import { IS_PHYSICAL_CONTROL_ALLOWED, type AiToolDeclaration } from "./types";

export const ENGINEERING_TOOL_NAMES = [
  "inspectProject",
  "getProjectContext",
  "getHardwareCatalog",
  "createDiagram",
  "updateDiagram",
  "validateTopology",
  "createVariables",
  "configurePLC",
  "createLadderProgram",
  "createFBDProgram",
  "createMultifilar",
  "configureSCADA",
  "configureAlarms",
  "createSimulationScenario",
  "runSimulation",
  "getDiagnostics",
  "generateDocumentation",
  "proposeEngineeringRepair",
] as const;

export type EngineeringToolName = (typeof ENGINEERING_TOOL_NAMES)[number];

export interface EngineeringToolRevisionRecord {
  revisionId: string;
  timestamp: string;
  toolName: EngineeringToolName;
  projectId?: string;
  summary: string;
  mutated: boolean;
  physicalControlAllowed: typeof IS_PHYSICAL_CONTROL_ALLOWED;
}

const toolRevisionLog: EngineeringToolRevisionRecord[] = [];
let revCounter = 1;

function recordToolRevision(
  toolName: EngineeringToolName,
  mutated: boolean,
  summary: string,
  projectId?: string,
): EngineeringToolRevisionRecord {
  const rec: EngineeringToolRevisionRecord = {
    revisionId: `rev_${Date.now()}_${revCounter++}`,
    timestamp: new Date().toISOString(),
    toolName,
    projectId,
    summary,
    mutated,
    physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
  };
  toolRevisionLog.unshift(rec);
  if (toolRevisionLog.length > 100) toolRevisionLog.length = 100;
  return rec;
}

export function getEngineeringToolRevisions(): EngineeringToolRevisionRecord[] {
  return [...toolRevisionLog];
}

// ---------------------------------------------------------------------------
// Strict Zod Schemas for All 18 Tools
// ---------------------------------------------------------------------------

const PhysicalSafetyGuardSchema = z
  .object({
    writePhysicalPlc: z.literal(false).optional(),
    forcePhysicalOutputs: z.literal(false).optional(),
    downloadToPhysicalHardware: z.literal(false).optional(),
  })
  .strict();

export const TOOL_SCHEMAS: Record<EngineeringToolName, z.ZodType<any>> = {
  inspectProject: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown().optional(),
      includeCompliance: z.boolean().default(true),
    })
    .strict(),

  getProjectContext: z
    .object({
      projectId: z.string().optional(),
      module: z
        .enum([
          "unifilar",
          "multifilar",
          "ladder",
          "fbd",
          "scada",
          "plc",
          "simulation",
          "alarms",
          "studio_iec",
          "compact_studio",
          "general",
        ])
        .default("general"),
      state: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),

  getHardwareCatalog: z
    .object({
      category: z
        .enum(["all", "protection", "switching", "drives", "loads", "plc", "compact_plc", "sensors"])
        .default("all"),
      manufacturer: z.string().max(60).optional(),
    })
    .strict(),

  createDiagram: z
    .object({
      projectId: z.string().optional(),
      title: z.string().min(1).max(160).default("Diagrama Unifilar Industrial"),
      nodes: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            kind: NodeKindSchema,
            label: z.string().min(1).max(120),
            position: z
              .object({ x: z.number(), y: z.number() })
              .default({ x: 200, y: 120 }),
            params: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .min(1)
        .max(200),
      edges: z
        .array(
          z.object({
            id: z.string().min(1).max(64).optional(),
            source: z.string().min(1),
            target: z.string().min(1),
            sourcePort: z.string().optional(),
            targetPort: z.string().optional(),
            kind: z.enum(["power", "signal", "ground"]).default("power"),
            section_mm2: z.number().positive().optional(),
            length_m: z.number().positive().optional(),
          }),
        )
        .default([]),
    })
    .strict(),

  updateDiagram: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown(),
      addNodes: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            kind: NodeKindSchema,
            label: z.string().min(1).max(120),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
            params: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .default([]),
      addEdges: z
        .array(
          z.object({
            id: z.string().min(1).max(64).optional(),
            source: z.string().min(1),
            target: z.string().min(1),
            sourcePort: z.string().optional(),
            targetPort: z.string().optional(),
            kind: z.enum(["power", "signal", "ground"]).default("power"),
          }),
        )
        .default([]),
      removeNodeIds: z.array(z.string()).default([]),
      removeEdgeIds: z.array(z.string()).default([]),
    })
    .strict(),

  validateTopology: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown(),
    })
    .strict(),

  createVariables: z
    .object({
      projectId: z.string().optional(),
      variables: z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            address: z.string().min(1).max(32),
            dataType: z.enum(["BOOL", "INT", "DINT", "REAL", "WORD", "TIME"]).default("BOOL"),
            direction: z.enum(["INPUT", "OUTPUT", "MEMORY"]).default("INPUT"),
            comment: z.string().max(200).optional(),
          }),
        )
        .min(1)
        .max(200),
    })
    .strict(),

  configurePLC: z
    .object({
      projectId: z.string().optional(),
      cpuModel: z.string().min(1).max(80).default("LOGO! 8.4 12/24RCE (6ED1052-1MD08-0BA2)"),
      scanCycleMs: z.number().int().min(1).max(1000).default(20),
      expansionModules: z.array(z.string().max(80)).default([]),
      protocol: z.enum(["Modbus-TCP", "OPC-UA", "S7-Protocol", "EtherNet/IP"]).default("Modbus-TCP"),
      safetyGuard: PhysicalSafetyGuardSchema.optional(),
    })
    .strict(),

  createLadderProgram: z
    .object({
      projectId: z.string().optional(),
      programName: z.string().min(1).max(80).default("MAIN_OB1"),
      rungs: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            comment: z.string().max(240).optional(),
            contacts: z
              .array(
                z.object({
                  type: z.enum(["NO", "NC"]),
                  operand: z.string().min(1).max(64),
                }),
              )
              .min(1),
            coil: z.object({
              type: z.enum(["OTE", "OTL", "OTU", "TON", "TOF"]).default("OTE"),
              operand: z.string().min(1).max(64),
              presetMs: z.number().int().positive().optional(),
            }),
          }),
        )
        .min(1)
        .max(100),
    })
    .strict(),

  createFBDProgram: z
    .object({
      projectId: z.string().optional(),
      networkName: z.string().min(1).max(80).default("FBD_NET_01"),
      blocks: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            type: z.enum(["AND", "OR", "NOT", "XOR", "RS", "SR", "TON", "TOF", "CTU", "PID", "CMP_GT"]),
            label: z.string().max(80).optional(),
            inputs: z.array(z.string().max(64)).default([]),
            output: z.string().max(64).optional(),
          }),
        )
        .min(1)
        .max(100),
    })
    .strict(),

  createMultifilar: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown(),
    })
    .strict(),

  configureSCADA: z
    .object({
      projectId: z.string().optional(),
      screenTitle: z.string().min(1).max(120).default("Supervisório Geral AGRO"),
      tags: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            name: z.string().min(1).max(80),
            address: z.string().min(1).max(32),
            unit: z.string().max(24).default(""),
            min: z.number().default(0),
            max: z.number().default(100),
            deadband: z.number().min(0).default(0.5),
          }),
        )
        .min(1)
        .max(200),
    })
    .strict(),

  configureAlarms: z
    .object({
      projectId: z.string().optional(),
      alarms: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            tag: z.string().min(1).max(80),
            priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("HIGH"),
            condition: z.enum(["HIHI", "HI", "LO", "LOLO", "TRIP", "ESTOP"]).default("TRIP"),
            setpoint: z.number().default(1),
            hysteresis: z.number().min(0).default(0.5),
            message: z.string().min(1).max(240),
          }),
        )
        .min(1)
        .max(100),
    })
    .strict(),

  createSimulationScenario: z
    .object({
      projectId: z.string().optional(),
      scenarioName: z.string().min(1).max(120),
      ambientTempC: z.number().min(-20).max(70).default(35),
      supplyVoltageV: z.number().positive().default(380),
      events: z
        .array(
          z.object({
            timeSec: z.number().min(0),
            action: z.enum(["START_MOTOR", "STOP_MOTOR", "TRIGGER_ESTOP", "OVERLOAD_FAULT"]),
            targetId: z.string().min(1).max(64),
          }),
        )
        .default([]),
    })
    .strict(),

  runSimulation: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown(),
      mode: z.literal("VIRTUAL_ONLY").default("VIRTUAL_ONLY"),
    })
    .strict(),

  getDiagnostics: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown(),
    })
    .strict(),

  generateDocumentation: z
    .object({
      projectId: z.string().optional(),
      projectName: z.string().min(1).max(160).default("Projeto Industrial ElétricAi"),
      doc: z.unknown(),
      norms: z.array(z.string()).default(["ABNT NBR 5410", "NR-10", "NR-12", "IEC 61439"]),
    })
    .strict(),

  proposeEngineeringRepair: z
    .object({
      projectId: z.string().optional(),
      doc: z.unknown(),
    })
    .strict(),
};

export const ENGINEERING_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "inspectProject",
    description:
      "Inspeciona o diagrama e o estado atual do projeto, retornando contagem de equipamentos, conexões, status topológico e conformidade normativa.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        includeCompliance: { type: "boolean" },
      },
    },
  },
  {
    name: "getProjectContext",
    description:
      "Obtém o snapshot técnico unificado do projeto para o módulo ativo (unifilar, multifilar, ladder, fbd, scada, plc, simulation, alarms).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        module: { type: "string" },
      },
    },
  },
  {
    name: "getHardwareCatalog",
    description:
      "Consulta o catálogo industrial homologado de disjuntores, contatores, relés térmicos, inversores, motores, sensores e CLPs (incluindo linha LOGO! 8.4).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        manufacturer: { type: "string" },
      },
    },
  },
  {
    name: "createDiagram",
    description:
      "Cria um novo DiagramDoc unifilar validado com equipamentos, parâmetros canônicos, conexões explícitas e auto-layout ortogonal.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        nodes: { type: "array" },
        edges: { type: "array" },
      },
      required: ["nodes"],
    },
  },
  {
    name: "updateDiagram",
    description:
      "Aplica adições/remoções autorizadas em um DiagramDoc existente, recalculando roteamento ortogonal e validando topologia sem inventar ligações.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        doc: { type: "object" },
        addNodes: { type: "array" },
        addEdges: { type: "array" },
      },
      required: ["doc"],
    },
  },
  {
    name: "validateTopology",
    description:
      "Executa validateElectricalTopology sobre o diagrama para verificar continuidade fonte-carga, terminais IEC e capacidade de barramentos.",
    parametersJsonSchema: {
      type: "object",
      properties: { doc: { type: "object" } },
      required: ["doc"],
    },
  },
  {
    name: "createVariables",
    description:
      "Cria e valida variáveis simbólicas e endereços IEC (%I, %Q, %M, %MW) compartilhados entre CLP, Ladder, FBD e SCADA.",
    parametersJsonSchema: {
      type: "object",
      properties: { variables: { type: "array" } },
      required: ["variables"],
    },
  },
  {
    name: "configurePLC",
    description:
      "Configura a arquitetura virtual do CLP (CPU, ciclo de scan, expansões e protocolo de comunicação) sob bloqueio físico estrito.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        cpuModel: { type: "string" },
        scanCycleMs: { type: "number" },
        protocol: { type: "string" },
      },
    },
  },
  {
    name: "createLadderProgram",
    description:
      "Gera redes Ladder IEC 61131-3 estruturadas com intertravamentos de segurança NR-12 (E-STOP) e selos de comando.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        programName: { type: "string" },
        rungs: { type: "array" },
      },
      required: ["rungs"],
    },
  },
  {
    name: "createFBDProgram",
    description:
      "Gera malhas de Diagrama de Blocos de Função (FBD IEC 61131-3) tipadas e validadas.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        networkName: { type: "string" },
        blocks: { type: "array" },
      },
      required: ["blocks"],
    },
  },
  {
    name: "createMultifilar",
    description:
      "Expande o diagrama Unifilar em representação Multifilar trifásica completa (L1, L2, L3, N, PE e comando).",
    parametersJsonSchema: {
      type: "object",
      properties: { doc: { type: "object" } },
      required: ["doc"],
    },
  },
  {
    name: "configureSCADA",
    description:
      "Configura tags supervisórias SCADA com faixa de engenharia, unidades e deadband.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        screenTitle: { type: "string" },
        tags: { type: "array" },
      },
      required: ["tags"],
    },
  },
  {
    name: "configureAlarms",
    description:
      "Configura alarmes industriais conforme ANSI/ISA-18.2 com prioridade, setpoint e histerese.",
    parametersJsonSchema: {
      type: "object",
      properties: { alarms: { type: "array" } },
      required: ["alarms"],
    },
  },
  {
    name: "createSimulationScenario",
    description:
      "Cria um cenário de simulação transitória/operacional virtual (partidas de motor, falhas de sobrecarga, E-STOP).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        scenarioName: { type: "string" },
        supplyVoltageV: { type: "number" },
        events: { type: "array" },
      },
      required: ["scenarioName"],
    },
  },
  {
    name: "runSimulation",
    description:
      "Executa a simulação elétrica determinística em modo 100% virtual (VIRTUAL_ONLY) sem qualquer atuação física.",
    parametersJsonSchema: {
      type: "object",
      properties: { doc: { type: "object" } },
      required: ["doc"],
    },
  },
  {
    name: "getDiagnostics",
    description:
      "Obtém o relatório consolidado de diagnósticos topológicos e normativos (NBR 5410, IEC 60617, IEC 60909, IEC 61439, IEC 60204-1).",
    parametersJsonSchema: {
      type: "object",
      properties: { doc: { type: "object" } },
      required: ["doc"],
    },
  },
  {
    name: "generateDocumentation",
    description:
      "Gera memorial descritivo técnico, lista de equipamentos (BOM) e quadro de cargas do projeto.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        doc: { type: "object" },
      },
      required: ["doc"],
    },
  },
  {
    name: "proposeEngineeringRepair",
    description:
      "Gera propostas não-mutantes de engenharia (suggestedConnections, requiredAssumptions, missingTechnicalInformation) sujeitas à aprovação explícita do engenheiro.",
    parametersJsonSchema: {
      type: "object",
      properties: { doc: { type: "object" } },
      required: ["doc"],
    },
  },
];

function parseOrDefaultDiagramDoc(raw: unknown): DiagramDoc {
  if (raw && typeof raw === "object" && "nodes" in raw && "edges" in raw) {
    const parsed = DiagramDocSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    return raw as DiagramDoc;
  }
  return createEmptyDoc();
}

/**
 * Executes an authorized Engineering Agent tool with strict schema validation,
 * physical control lock enforcement, and audit/revision recording.
 */
export async function executeAuthorizedEngineeringTool(
  toolName: EngineeringToolName,
  rawArgs: unknown,
): Promise<{
  ok: boolean;
  toolName: EngineeringToolName;
  physicalControlAllowed: typeof IS_PHYSICAL_CONTROL_ALLOWED;
  revision?: EngineeringToolRevisionRecord;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const t0 = Date.now();

  // Hard physical control barrier (§12)
  if (rawArgs && typeof rawArgs === "object") {
    const a = rawArgs as Record<string, unknown>;
    if (
      a.writePhysicalPlc === true ||
      a.forcePhysicalOutputs === true ||
      a.downloadToPhysicalHardware === true ||
      a.actuatePhysicalMotor === true ||
      a.commandPhysicalValve === true ||
      a.mode === "PHYSICAL"
    ) {
      recordAiAuditEvent({
        operation: `tool:${toolName}:blocked_physical`,
        module: "plc",
        provider: "gemini",
        model: "safety-barrier",
        durationMs: Date.now() - t0,
        ok: false,
        statusCode: 403,
        errorCode: "PHYSICAL_CONTROL_FORBIDDEN",
        errorMessage:
          "Operação bloqueada: IS_PHYSICAL_CONTROL_ALLOWED = false. Nenhuma ferramenta de IA pode atuar em hardware físico.",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        fallbackUsed: false,
      });
      return {
        ok: false,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        error: {
          code: "PHYSICAL_CONTROL_FORBIDDEN",
          message:
            "Bloqueio de Segurança Industrial: IS_PHYSICAL_CONTROL_ALLOWED = false. Operações em equipamentos físicos são estritamente proibidas.",
        },
      };
    }
  }

  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    return {
      ok: false,
      toolName,
      physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
      error: {
        code: "UNKNOWN_TOOL",
        message: `Ferramenta "${toolName}" não pertence ao catálogo autorizado.`,
      },
    };
  }

  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      toolName,
      physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
      error: {
        code: "TOOL_SCHEMA_INVALID",
        message: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      },
    };
  }

  const args = parsed.data;

  switch (toolName) {
    case "inspectProject": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const topology = validateElectricalTopology(doc);
      const compliance = args.includeCompliance
        ? evaluateNormativeEngineeringCompliance(doc)
        : undefined;
      const rev = recordToolRevision(
        "inspectProject",
        false,
        `Inspeção de projeto: ${topology.totalEquipments} equipamentos, ${topology.totalConnections} conexões (${topology.status}).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          equipmentsCount: topology.totalEquipments,
          connectionsCount: topology.totalConnections,
          topologyStatus: topology.status,
          isElectricallyConsistent: topology.isElectricallyConsistent,
          disconnectedNodeIds: topology.disconnectedNodes.map((n) => n.nodeId),
          invalidConnectionCount: topology.invalidConnections.length,
          complianceStatus: compliance?.overallStatus,
          complianceSummary: compliance?.summary,
        },
      };
    }

    case "getProjectContext": {
      const snapshot = extractEngineeringSnapshotFromState(args.module, args.state ?? null);
      const rev = recordToolRevision(
        "getProjectContext",
        false,
        `Contexto transversal carregado para o módulo ${args.module}.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: { snapshot },
      };
    }

    case "getHardwareCatalog": {
      const catalog = [
        {
          sku: "WEG-MDW-C32-3",
          category: "protection",
          kind: "breaker",
          manufacturer: "WEG",
          model: "MDW-C32-3",
          specs: { in_A: 32, poles: 3, curve: "C", icc_kA: 10 },
        },
        {
          sku: "WEG-CWB32-11-30D02",
          category: "switching",
          kind: "contactor",
          manufacturer: "WEG",
          model: "CWB32",
          specs: { in_A: 32, coil_V: 24, auxContacts: "1NA+1NF" },
        },
        {
          sku: "WEG-RW27-2D3-U032",
          category: "protection",
          kind: "thermal_relay",
          manufacturer: "WEG",
          model: "RW27-2D3-U032",
          specs: { in_A: 32, trip_class: "10A" },
        },
        {
          sku: "WEG-CFW500-B0100T4",
          category: "drives",
          kind: "vfd",
          manufacturer: "WEG",
          model: "CFW500",
          specs: { power_kW: 5.5, voltage_V: 380 },
        },
        {
          sku: "WEG-W22-IR3-7.5KW",
          category: "loads",
          kind: "motor",
          manufacturer: "WEG",
          model: "W22 IR3 Premium",
          specs: { power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
        },
        {
          sku: "SIEMENS-LOGO8.4-12-24RCE",
          category: "compact_plc",
          kind: "plc",
          manufacturer: "Siemens",
          model: "LOGO! 8.4 12/24RCE (6ED1052-1MD08-0BA2)",
          specs: { diCount: 8, doCount: 4, aiCount: 4, ethernet: "Modbus-TCP / S7" },
        },
        {
          sku: "SIEMENS-DM16-24R",
          category: "compact_plc",
          kind: "plc",
          manufacturer: "Siemens",
          model: "LOGO! DM16 24R (6ED1055-1NB10-0BA2)",
          specs: { diCount: 8, doCount: 8 },
        },
      ].filter(
        (item) =>
          (args.category === "all" || item.category === args.category) &&
          (!args.manufacturer ||
            item.manufacturer.toLowerCase().includes(args.manufacturer.toLowerCase())),
      );

      const rev = recordToolRevision(
        "getHardwareCatalog",
        false,
        `Consulta ao catálogo de hardware (${catalog.length} itens retornados).`,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: { items: catalog, count: catalog.length },
      };
    }

    case "createDiagram": {
      let doc = createEmptyDoc({
        metadata: { title: args.title, norms: ["NBR 5410", "IEC 60617", "NR-12"] },
      });

      for (const n of args.nodes) {
        const canonicalParams = buildCanonicalDiagramParams(n.kind, n.params ?? {});
        doc.nodes[n.id] = makeNode({
          id: n.id,
          sheet: "unifilar",
          position: n.position,
          label: n.label,
          params: canonicalParams,
        });
      }

      for (let i = 0; i < args.edges.length; i++) {
        const e = args.edges[i];
        const edgeId = e.id || `e_${i + 1}_${e.source}_${e.target}`;
        doc.edges[edgeId] = makeEdge({
          id: edgeId,
          sheet: "unifilar",
          source: e.source,
          target: e.target,
          sourcePort: e.sourcePort,
          targetPort: e.targetPort,
          kind: e.kind,
          ...(e.section_mm2 || e.length_m
            ? {
                cable: {
                  section_mm2: e.section_mm2,
                  length_m: e.length_m,
                  insulation: "PVC",
                },
              }
            : {}),
        });
      }

      const repair = repairDiagramConnections(doc);
      doc = autoLayoutIndustrialDiagram(repair.repairedDoc);
      const validation = validateElectricalTopology(doc);

      const rev = recordToolRevision(
        "createDiagram",
        true,
        `Diagrama "${args.title}" criado com ${Object.keys(doc.nodes).length} nós e ${Object.keys(doc.edges).length} conexões explícitas (${validation.status}).`,
        args.projectId,
      );

      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          doc,
          topologyStatus: validation.status,
          engineeringProposal: repair.engineeringProposal,
        },
      };
    }

    case "updateDiagram": {
      let doc = JSON.parse(JSON.stringify(parseOrDefaultDiagramDoc(args.doc))) as DiagramDoc;
      for (const rmEdge of args.removeEdgeIds) delete doc.edges[rmEdge];
      for (const rmNode of args.removeNodeIds) delete doc.nodes[rmNode];

      for (const n of args.addNodes) {
        const canonicalParams = buildCanonicalDiagramParams(n.kind, n.params ?? {});
        doc.nodes[n.id] = makeNode({
          id: n.id,
          sheet: "unifilar",
          position: n.position ?? { x: 240, y: 240 },
          label: n.label,
          params: canonicalParams,
        });
      }

      for (let i = 0; i < args.addEdges.length; i++) {
        const e = args.addEdges[i];
        const edgeId = e.id || `e_upd_${i + 1}_${e.source}_${e.target}`;
        doc.edges[edgeId] = makeEdge({
          id: edgeId,
          sheet: "unifilar",
          source: e.source,
          target: e.target,
          sourcePort: e.sourcePort,
          targetPort: e.targetPort,
          kind: e.kind,
        });
      }

      const repair = repairDiagramConnections(doc);
      doc = autoLayoutIndustrialDiagram(repair.repairedDoc);
      const validation = validateElectricalTopology(doc);

      const rev = recordToolRevision(
        "updateDiagram",
        true,
        `Diagrama atualizado (+${args.addNodes.length} nós, +${args.addEdges.length} conexões, status ${validation.status}).`,
        args.projectId,
      );

      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          doc,
          topologyStatus: validation.status,
          engineeringProposal: repair.engineeringProposal,
        },
      };
    }

    case "validateTopology": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const validation = validateElectricalTopology(doc);
      const rev = recordToolRevision(
        "validateTopology",
        false,
        `Validação topológica concluída: ${validation.status} (${validation.totalEquipments} nós, ${validation.totalConnections} conexões).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          status: validation.status,
          isElectricallyConsistent: validation.isElectricallyConsistent,
          totalEquipments: validation.totalEquipments,
          totalConnections: validation.totalConnections,
          disconnectedNodes: validation.disconnectedNodes,
          invalidConnections: validation.invalidConnections,
          diagnostics: validation.diagnostics,
        },
      };
    }

    case "createVariables": {
      const rev = recordToolRevision(
        "createVariables",
        true,
        `Criadas ${args.variables.length} variáveis simbólicas/endereços IEC compartilhados.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          variables: args.variables,
          count: args.variables.length,
        },
      };
    }

    case "configurePLC": {
      const rev = recordToolRevision(
        "configurePLC",
        true,
        `CLP virtual configurado: ${args.cpuModel} (ciclo ${args.scanCycleMs} ms, ${args.protocol}).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          cpuModel: args.cpuModel,
          scanCycleMs: args.scanCycleMs,
          expansionModules: args.expansionModules,
          protocol: args.protocol,
          executionMode: "VIRTUAL_SIMULATION_ONLY",
        },
      };
    }

    case "createLadderProgram": {
      const rev = recordToolRevision(
        "createLadderProgram",
        true,
        `Programa Ladder "${args.programName}" gerado com ${args.rungs.length} rung(s) IEC 61131-3.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          programName: args.programName,
          rungsCount: args.rungs.length,
          rungs: args.rungs,
        },
      };
    }

    case "createFBDProgram": {
      const rev = recordToolRevision(
        "createFBDProgram",
        true,
        `Rede FBD "${args.networkName}" criada com ${args.blocks.length} bloco(s) lógicos.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          networkName: args.networkName,
          blocksCount: args.blocks.length,
          blocks: args.blocks,
        },
      };
    }

    case "createMultifilar": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const commands = buildMultifilarCommands(doc);
      const summary = summarizeConductors(doc);
      const rev = recordToolRevision(
        "createMultifilar",
        true,
        `Diagrama Multifilar expandido: ${commands.length} comandos gerados (${summary.totalConductors} condutores totais).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          commandsCount: commands.length,
          conductorSummary: summary,
        },
      };
    }

    case "configureSCADA": {
      const rev = recordToolRevision(
        "configureSCADA",
        true,
        `Tela SCADA "${args.screenTitle}" configurada com ${args.tags.length} tag(s) de telemetria.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          screenTitle: args.screenTitle,
          tagsCount: args.tags.length,
          tags: args.tags,
        },
      };
    }

    case "configureAlarms": {
      const rev = recordToolRevision(
        "configureAlarms",
        true,
        `Configurados ${args.alarms.length} alarme(s) ANSI/ISA-18.2 com prioridade e histerese.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          alarmsCount: args.alarms.length,
          alarms: args.alarms,
        },
      };
    }

    case "createSimulationScenario": {
      const rev = recordToolRevision(
        "createSimulationScenario",
        true,
        `Cenário de simulação virtual "${args.scenarioName}" criado com ${args.events.length} evento(s).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          scenarioName: args.scenarioName,
          ambientTempC: args.ambientTempC,
          supplyVoltageV: args.supplyVoltageV,
          events: args.events,
          mode: "VIRTUAL_ONLY",
        },
      };
    }

    case "runSimulation": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const simResult = computeCircuitEnergization(doc, "running");
      const rev = recordToolRevision(
        "runSimulation",
        false,
        `Simulação elétrica virtual executada: ${simResult.energizedNodeIds.size} nós energizados, ${simResult.energizedEdgeIds.size} condutores energizados.`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          mode: "VIRTUAL_ONLY",
          energizedNodesCount: simResult.energizedNodeIds.size,
          energizedEdgesCount: simResult.energizedEdgeIds.size,
          faultEdgesCount: simResult.faultEdgeIds.size,
          openDevicesCount: simResult.openDeviceIds.size,
          metrics: simResult.metrics,
        },
      };
    }

    case "getDiagnostics": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const compliance = evaluateNormativeEngineeringCompliance(doc);
      const rev = recordToolRevision(
        "getDiagnostics",
        false,
        `Diagnóstico normativo executado: status ${compliance.overallStatus} (${compliance.findings.length} apontamentos).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          overallStatus: compliance.overallStatus,
          topologyStatus: compliance.topologyStatus,
          summary: compliance.summary,
          findings: compliance.findings,
        },
      };
    }

    case "generateDocumentation": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const nodes = Object.values(doc.nodes);
      const edges = Object.values(doc.edges);
      const bom = nodes.map((n) => ({
        id: n.id,
        tag: n.label || n.id,
        kind: n.params.kind,
        manufacturer: n.params.manufacturer || "Padrão Industrial",
        model: n.params.model || n.params.kind.toUpperCase(),
      }));
      const rev = recordToolRevision(
        "generateDocumentation",
        false,
        `Memorial descritivo e BOM gerados para "${args.projectName}" (${bom.length} itens).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          projectName: args.projectName,
          norms: args.norms,
          equipmentsCount: nodes.length,
          connectionsCount: edges.length,
          bom,
          markdownSummary: `# Memorial Técnico — ${args.projectName}\n- Normas: ${args.norms.join(", ")}\n- Equipamentos: ${nodes.length}\n- Conexões Elétricas: ${edges.length}`,
        },
      };
    }

    case "proposeEngineeringRepair": {
      const doc = parseOrDefaultDiagramDoc(args.doc);
      const proposal = buildEngineeringProposalBundle(doc, validateElectricalTopology(doc));
      const rev = recordToolRevision(
        "proposeEngineeringRepair",
        false,
        `Proposta de engenharia gerada (${proposal.suggestedConnections.length} conexões sugeridas, requiresEngineerApproval=${proposal.requiresEngineerApproval}).`,
        args.projectId,
      );
      return {
        ok: true,
        toolName,
        physicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
        revision: rev,
        result: {
          engineeringProposal: proposal,
        },
      };
    }
  }
}
