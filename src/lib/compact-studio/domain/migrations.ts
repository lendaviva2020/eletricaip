/**
 * Pure factories and versioned schema migrations for CompactProgramModel.
 * Accepts an explicit ISO timestamp to avoid hidden dependencies on global clocks.
 */
import { parseCompactProgramModel, CompactNodeSchema, CompactConnectionSchema } from "./schemas";
import type { CompactHardwareArchitecture, CompactProgramModel } from "./types";

export const COMPACT_PROGRAM_SCHEMA_VERSION = 1 as const;

export const DEFAULT_COMPACT_HARDWARE: CompactHardwareArchitecture = {
  baseCatalogId: "elc-base-12-24dc-eth",
  basePartCode: "ELC-CPU-1224-ETH",
  supplyCatalogId: "elc-psu-24v-25a",
  hasExternalDisplay: false,
  maxBlocks: 400,
  retentiveMemoryBytes: 850,
  maxDigitalInputs: 24,
  maxDigitalOutputs: 20,
  maxAnalogInputs: 8,
  maxAnalogOutputs: 8,
  slots: [
    {
      slotIndex: 0,
      catalogId: "elc-base-12-24dc-eth",
      partCode: "ELC-CPU-1224-ETH",
      family: "BASE_COMPACT",
      digitalInputs: 8,
      digitalOutputs: 4,
      analogInputs: 4,
      analogOutputs: 0,
    },
  ],
};

/**
 * Creates a clean canonical CompactProgramModel without external side effects.
 */
export function createEmptyCompactProgramModel(opts?: {
  readonly id?: string;
  readonly name?: string;
  readonly nowIso?: string;
}): CompactProgramModel {
  const timestamp = opts?.nowIso ?? "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: COMPACT_PROGRAM_SCHEMA_VERSION,
    id: opts?.id ?? "compact-prog-main",
    name: opts?.name ?? "Programa Principal",
    description: "",
    preferredNotation: "FBD",
    cycleTimeMs: 20,
    createdAt: timestamp,
    updatedAt: timestamp,
    pages: [
      {
        id: "page-1",
        name: "Página 1",
        order: 0,
        description: "Lógica principal",
        gridCols: 24,
        gridRows: 16,
      },
    ],
    nodes: [],
    connections: [],
    ioSymbols: [],
    udfs: [],
    hardware: {
      ...DEFAULT_COMPACT_HARDWARE,
      slots: [...DEFAULT_COMPACT_HARDWARE.slots],
    },
    layout: {
      fbd: {},
      lad: {},
      edgesFbd: {},
      edgesLad: {},
    },
    revisions: [],
  };
}

export type CompactMigrationOutcome =
  | {
      readonly ok: true;
      readonly model: CompactProgramModel;
      readonly migratedFromVersion: number;
    }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Migrates any supported legacy compact program shape (v0 / untyped partial drafts)
 * to the current strict schema version (`schemaVersion = 1`).
 */
export function migrateCompactProgram(
  raw: unknown,
  nowIso = "2026-01-01T00:00:00.000Z",
): CompactMigrationOutcome {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["Payload de programa compacto inválido: esperado objeto JSON."] };
  }

  const record = raw as Record<string, unknown>;
  const rawVersion = typeof record.schemaVersion === "number" ? record.schemaVersion : 0;

  if (rawVersion === 1) {
    const parsed = parseCompactProgramModel(raw);
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors };
    }
    return { ok: true, model: parsed.model, migratedFromVersion: 1 };
  }

  if (rawVersion !== 0) {
    return {
      ok: false,
      errors: [`Versão de esquema não suportada: ${rawVersion}. Máxima suportada: 1.`],
    };
  }

  // Migrate v0 partial draft shape: synthesize missing page-1, hardware, and layout buckets.
  const base = createEmptyCompactProgramModel({
    id: typeof record.id === "string" && record.id ? record.id : "compact-prog-migrated",
    name: typeof record.name === "string" && record.name ? record.name : "Programa Migrado",
    nowIso,
  });

  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const rawConnections = Array.isArray(record.connections) ? record.connections : [];

  const normalizedNodes: CompactProgramModel["nodes"][number][] = [];
  const nodeErrors: string[] = [];

  for (let i = 0; i < rawNodes.length; i++) {
    const item = rawNodes[i];
    if (typeof item !== "object" || item === null) {
      nodeErrors.push(`nodes[${i}]: objeto inválido.`);
      continue;
    }
    const nObj = item as Record<string, unknown>;
    const candidate = {
      ...nObj,
      pageId: typeof nObj.pageId === "string" && nObj.pageId ? nObj.pageId : "page-1",
      libraryVersion:
        typeof nObj.libraryVersion === "string" && nObj.libraryVersion
          ? nObj.libraryVersion
          : "1.0.0",
      params: typeof nObj.params === "object" && nObj.params !== null ? nObj.params : {},
      inputs: Array.isArray(nObj.inputs) ? nObj.inputs : [],
      outputs: Array.isArray(nObj.outputs) ? nObj.outputs : [],
    };
    const parsedNode = CompactNodeSchema.safeParse(candidate);
    if (!parsedNode.success) {
      nodeErrors.push(
        ...parsedNode.error.issues.map(
          (iss) => `nodes[${i}].${iss.path.join(".")}: ${iss.message}`,
        ),
      );
      continue;
    }
    normalizedNodes.push(parsedNode.data);
  }

  const normalizedConnections: CompactProgramModel["connections"][number][] = [];
  for (let i = 0; i < rawConnections.length; i++) {
    const item = rawConnections[i];
    if (typeof item !== "object" || item === null) {
      nodeErrors.push(`connections[${i}]: objeto inválido.`);
      continue;
    }
    const cObj = item as Record<string, unknown>;
    const candidate = {
      ...cObj,
      pageId: typeof cObj.pageId === "string" && cObj.pageId ? cObj.pageId : "page-1",
      signalType: typeof cObj.signalType === "string" && cObj.signalType ? cObj.signalType : "BOOL",
    };
    const parsedConn = CompactConnectionSchema.safeParse(candidate);
    if (!parsedConn.success) {
      nodeErrors.push(
        ...parsedConn.error.issues.map(
          (iss) => `connections[${i}].${iss.path.join(".")}: ${iss.message}`,
        ),
      );
      continue;
    }
    normalizedConnections.push(parsedConn.data);
  }

  if (nodeErrors.length > 0) {
    return { ok: false, errors: nodeErrors };
  }

  const migrated: CompactProgramModel = {
    ...base,
    nodes: normalizedNodes,
    connections: normalizedConnections,
  };

  const finalCheck = parseCompactProgramModel(migrated);
  if (!finalCheck.ok) {
    return { ok: false, errors: finalCheck.errors };
  }

  return { ok: true, model: finalCheck.model, migratedFromVersion: 0 };
}
