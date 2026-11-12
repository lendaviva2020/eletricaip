/**
 * Pure Static Validation Engine for CompactProgramModel.
 *
 * Detects type mismatches, unconnected required inputs, shorted outputs / multiple drivers,
 * combinational feedback loops lacking memory elements, duplicate names/addresses,
 * orphan page connectors, and hardware block/memory/IO capacity limits.
 */
import type {
  CompactDiagnostic,
  CompactNode,
  CompactPortInstance,
  CompactProgramModel,
  CompactSignalType,
  CompactValidationReport,
} from "./types";

/** Domain exception thrown when an operation violates mandatory domain invariants. */
export class DomainValidationError extends Error {
  public readonly diagnostics: readonly CompactDiagnostic[];

  constructor(message: string, diagnostics: readonly CompactDiagnostic[]) {
    super(message);
    this.name = "DomainValidationError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Block types that break combinational feedback loops because they hold state across scan cycles.
 */
const MEMORY_HOLDING_BLOCKS: ReadonlySet<string> = new Set([
  "SR",
  "RS",
  "PULSE_RELAY",
  "TON",
  "TOF",
  "TON_TOF",
  "TONR",
  "WIPING_RELAY",
  "EDGE_TRIGGERED_WIPING",
  "ASYNC_PULSE_GEN",
  "STAIRWAY_SWITCH",
  "CTU",
  "CTD",
  "CTUD_COMPACT",
  "HOUR_COUNTER",
  "THRESHOLD_TRIGGER",
  "WEEKLY_TIMER",
  "YEARLY_TIMER",
  "PI_CONTROLLER",
  "ANALOG_RAMP",
  "ANALOG_WATCHDOG",
  "ANALOG_FILTER",
  "SHIFT_REGISTER",
  "FLAG_M",
  "FLAG_AM",
  "R_TRIG",
  "F_TRIG",
]);

const NON_MEMORY_PASSIVE_TYPES: ReadonlySet<string> = new Set([
  "INPUT_DI",
  "INPUT_AI",
  "CONST_BOOL",
  "CONST_INT",
  "CONST_REAL",
  "CONST_TIME",
  "HIGH",
  "LOW",
  "STARTUP_FLAG_M8",
  "OUTPUT_QO",
  "OUTPUT_AO",
  "OPEN_CONNECTOR",
  "PAGE_IN",
  "PAGE_OUT",
  "MESSAGE_TEXT",
  "DATA_LOG",
]);

/** Estimates per-block retentive RAM footprint (bytes) for compact PLC capacity checks. */
const BLOCK_RETENTIVE_BYTES: Readonly<Record<string, number>> = {
  TONR: 12,
  HOUR_COUNTER: 16,
  CTUD_COMPACT: 12,
  CTU: 8,
  CTD: 8,
  SR: 2,
  RS: 2,
  PULSE_RELAY: 2,
  SHIFT_REGISTER: 4,
  DATA_LOG: 32,
  WEEKLY_TIMER: 12,
  YEARLY_TIMER: 12,
};

/**
 * Checks whether a source signal type can feed a target signal type safely.
 */
export function areSignalTypesCompatible(
  source: CompactSignalType,
  target: CompactSignalType,
): boolean {
  if (source === target) return true;
  if (source === "INT" && target === "REAL") return true;
  if (source === "BYTE" && (target === "WORD" || target === "INT")) return true;
  if (source === "WORD" && target === "INT") return true;
  return false;
}

function makeDiag(
  partial: Omit<CompactDiagnostic, "id"> & { readonly id: string },
): CompactDiagnostic {
  return partial;
}

/**
 * Validates the entire canonical compact program model deterministically.
 */
export function validateCompactProgram(model: CompactProgramModel): CompactValidationReport {
  const diagnostics: CompactDiagnostic[] = [];
  let diagSeq = 1;
  const nextId = (prefix: string): string => `${prefix}-${diagSeq++}`;

  const pageIds = new Set<string>();
  const pageNames = new Set<string>();

  for (const page of model.pages) {
    pageIds.add(page.id);
    const normalized = page.name.trim().toLowerCase();
    if (pageNames.has(normalized)) {
      diagnostics.push(
        makeDiag({
          id: nextId("dup-page"),
          severity: "error",
          code: "DUPLICATE_PAGE_NAME",
          messageKey: "compactStudio.diag.duplicatePageName",
          message: `Nome de página duplicado: "${page.name}".`,
          pageId: page.id,
        }),
      );
    }
    pageNames.add(normalized);
  }

  // 1. Validate nodes, duplicate IDs, duplicate instance names, and page existence
  const nodeById = new Map<string, CompactNode>();
  const instanceNames = new Set<string>();
  let programBlockCount = 0;
  let estimatedRetentiveBytes = 0;

  for (const node of model.nodes) {
    if (nodeById.has(node.id)) {
      diagnostics.push(
        makeDiag({
          id: nextId("dup-node"),
          severity: "error",
          code: "DUPLICATE_NODE_ID",
          messageKey: "compactStudio.diag.duplicateNodeId",
          message: `Identificador de bloco duplicado: "${node.id}".`,
          pageId: node.pageId,
          nodeId: node.id,
        }),
      );
      continue;
    }
    nodeById.set(node.id, node);

    if (!pageIds.has(node.pageId)) {
      diagnostics.push(
        makeDiag({
          id: nextId("unk-page"),
          severity: "error",
          code: "UNKNOWN_PAGE",
          messageKey: "compactStudio.diag.unknownPage",
          message: `Bloco "${node.instanceName}" referencia página inexistente (${node.pageId}).`,
          pageId: node.pageId,
          nodeId: node.id,
        }),
      );
    }

    const instNorm = node.instanceName.trim().toLowerCase();
    if (instanceNames.has(instNorm)) {
      diagnostics.push(
        makeDiag({
          id: nextId("dup-inst"),
          severity: "warning",
          code: "DUPLICATE_INSTANCE_NAME",
          messageKey: "compactStudio.diag.duplicateInstanceName",
          message: `Nome de instância duplicado: "${node.instanceName}".`,
          pageId: node.pageId,
          nodeId: node.id,
        }),
      );
    }
    instanceNames.add(instNorm);

    if (!NON_MEMORY_PASSIVE_TYPES.has(node.blockType)) {
      programBlockCount += 1;
    }
    if (node.retentive) {
      estimatedRetentiveBytes += BLOCK_RETENTIVE_BYTES[node.blockType] ?? 8;
    }
  }

  // 2. Validate I/O symbols (duplicate symbolic names, duplicate hardware addresses, capacity)
  const seenSymbols = new Set<string>();
  const seenAddresses = new Set<string>();
  const ioCounts = { DI: 0, DO: 0, AI: 0, AO: 0 };

  for (const sym of model.ioSymbols) {
    const nameKey = sym.symbolicName.trim().toLowerCase();
    if (seenSymbols.has(nameKey)) {
      diagnostics.push(
        makeDiag({
          id: nextId("dup-sym"),
          severity: "error",
          code: "DUPLICATE_SYMBOL_NAME",
          messageKey: "compactStudio.diag.duplicateSymbolName",
          message: `Nome simbólico duplicado na tabela de E/S: "${sym.symbolicName}".`,
        }),
      );
    }
    seenSymbols.add(nameKey);

    const addrKey = sym.address.trim().toUpperCase();
    if (seenAddresses.has(addrKey)) {
      diagnostics.push(
        makeDiag({
          id: nextId("dup-addr"),
          severity: "error",
          code: "DUPLICATE_IO_ADDRESS",
          messageKey: "compactStudio.diag.duplicateIoAddress",
          message: `Endereço de E/S duplicado: "${sym.address}".`,
        }),
      );
    }
    seenAddresses.add(addrKey);

    if (sym.ioKind === "DI") ioCounts.DI += 1;
    if (sym.ioKind === "DO") ioCounts.DO += 1;
    if (sym.ioKind === "AI") ioCounts.AI += 1;
    if (sym.ioKind === "AO") ioCounts.AO += 1;
  }

  // Also detect multiple OUTPUT_QO / OUTPUT_AO blocks driving the exact same address/symbol!
  const outputDriversByTarget = new Map<string, CompactNode[]>();
  for (const node of model.nodes) {
    if (
      (node.blockType === "OUTPUT_QO" || node.blockType === "OUTPUT_AO") &&
      typeof node.params.address === "string" &&
      node.params.address.trim() !== ""
    ) {
      const targetAddr = node.params.address.trim().toUpperCase();
      const list = outputDriversByTarget.get(targetAddr) ?? [];
      list.push(node);
      outputDriversByTarget.set(targetAddr, list);
    }
  }
  for (const [addr, drivers] of outputDriversByTarget.entries()) {
    if (drivers.length > 1) {
      for (const drv of drivers) {
        diagnostics.push(
          makeDiag({
            id: nextId("short-out"),
            severity: "error",
            code: "OUTPUT_SHORT_CIRCUIT",
            messageKey: "compactStudio.diag.outputShortCircuit",
            message: `Saída em curto lógico: múltiplos blocos escrevem no endereço "${addr}".`,
            pageId: drv.pageId,
            nodeId: drv.id,
          }),
        );
      }
    }
  }

  // 3. Validate connections: dangling endpoints, type mismatch, multiple drivers on same input port
  const driversByInputPort = new Map<string, CompactProgramModel["connections"][number][]>();
  const connectedInputPortKeys = new Set<string>();

  for (const conn of model.connections) {
    const fromNode = nodeById.get(conn.fromNodeId);
    const toNode = nodeById.get(conn.toNodeId);
    const fromPort: CompactPortInstance | undefined = fromNode?.outputs.find(
      (p) => p.id === conn.fromPortId,
    );
    const toPort: CompactPortInstance | undefined = toNode?.inputs.find(
      (p) => p.id === conn.toPortId,
    );

    if (!fromNode || !toNode || !fromPort || !toPort) {
      diagnostics.push(
        makeDiag({
          id: nextId("dangling"),
          severity: "error",
          code: "DANGLING_CONNECTION",
          messageKey: "compactStudio.diag.danglingConnection",
          message: `Conexão inválida ou desconectada (${conn.fromNodeId}.${conn.fromPortId} -> ${conn.toNodeId}.${conn.toPortId}).`,
          pageId: conn.pageId,
          connectionId: conn.id,
        }),
      );
      continue;
    }

    if (!areSignalTypesCompatible(fromPort.signalType, toPort.signalType)) {
      diagnostics.push(
        makeDiag({
          id: nextId("type-err"),
          severity: "error",
          code: "TYPE_MISMATCH",
          messageKey: "compactStudio.diag.typeMismatch",
          message: `Tipos incompatíveis entre "${fromNode.instanceName}.${fromPort.name}" (${fromPort.signalType}) e "${toNode.instanceName}.${toPort.name}" (${toPort.signalType}).`,
          pageId: conn.pageId,
          nodeId: toNode.id,
          portId: toPort.id,
          connectionId: conn.id,
        }),
      );
    }

    const inputKey = `${conn.toNodeId}::${conn.toPortId}`;
    connectedInputPortKeys.add(inputKey);
    const list = driversByInputPort.get(inputKey) ?? [];
    list.push(conn);
    driversByInputPort.set(inputKey, list);
  }

  for (const [inputKey, conns] of driversByInputPort.entries()) {
    if (conns.length > 1) {
      const [nodeId, portId] = inputKey.split("::");
      const node = nodeById.get(nodeId);
      diagnostics.push(
        makeDiag({
          id: nextId("multi-drv"),
          severity: "error",
          code: "MULTIPLE_DRIVERS",
          messageKey: "compactStudio.diag.multipleDrivers",
          message: `Entrada "${node?.instanceName ?? nodeId}.${portId}" acionada por ${conns.length} saídas simultâneas (curto de sinal).`,
          pageId: node?.pageId,
          nodeId,
          portId,
        }),
      );
    }
  }

  // 4. Required unconnected inputs
  for (const node of model.nodes) {
    for (const inputPort of node.inputs) {
      if (!inputPort.required) continue;
      const inputKey = `${node.id}::${inputPort.id}`;
      const hasDefaultParam =
        node.params[inputPort.name] !== undefined && node.params[inputPort.name] !== "";
      if (!connectedInputPortKeys.has(inputKey) && !hasDefaultParam) {
        diagnostics.push(
          makeDiag({
            id: nextId("unconn-req"),
            severity: "warning",
            code: "UNCONNECTED_REQUIRED_INPUT",
            messageKey: "compactStudio.diag.unconnectedRequiredInput",
            message: `Entrada obrigatória sem conexão em "${node.instanceName}.${inputPort.name}".`,
            pageId: node.pageId,
            nodeId: node.id,
            portId: inputPort.id,
          }),
        );
      }
    }
  }

  // 5. Feedback cycles without memory element (Tarjan SCC / DFS over non-memory nodes)
  const nonMemoryAdj = new Map<string, string[]>();
  for (const node of model.nodes) {
    if (!MEMORY_HOLDING_BLOCKS.has(node.blockType)) {
      nonMemoryAdj.set(node.id, []);
    }
  }
  for (const conn of model.connections) {
    if (nonMemoryAdj.has(conn.fromNodeId) && nonMemoryAdj.has(conn.toNodeId)) {
      nonMemoryAdj.get(conn.fromNodeId)?.push(conn.toNodeId);
    }
  }
  const color = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 visiting, 2 done
  const cycleReported = new Set<string>();
  const dfsCycle = (u: string): void => {
    color.set(u, 1);
    for (const v of nonMemoryAdj.get(u) ?? []) {
      const c = color.get(v) ?? 0;
      if (c === 1 && !cycleReported.has(v)) {
        cycleReported.add(v);
        const node = nodeById.get(v);
        diagnostics.push(
          makeDiag({
            id: nextId("loop-err"),
            severity: "error",
            code: "FEEDBACK_WITHOUT_MEMORY",
            messageKey: "compactStudio.diag.feedbackWithoutMemory",
            message: `Realimentação combinacional sem elemento de memória passando por "${node?.instanceName ?? v}". Insira marcador (M), flip-flop (SR/RS) ou temporizador retentivo.`,
            pageId: node?.pageId,
            nodeId: v,
          }),
        );
      } else if (c === 0) {
        dfsCycle(v);
      }
    }
    color.set(u, 2);
  };
  for (const nodeId of nonMemoryAdj.keys()) {
    if ((color.get(nodeId) ?? 0) === 0) {
      dfsCycle(nodeId);
    }
  }

  // 6. Inter-page connectors pairing validation
  const pageOutNames = new Set<string>();
  const pageInNodes: CompactNode[] = [];
  for (const node of model.nodes) {
    const key = String(node.params.connectorKey ?? node.instanceName).trim();
    if (node.blockType === "PAGE_OUT") pageOutNames.add(key);
    if (node.blockType === "PAGE_IN") pageInNodes.push(node);
  }
  for (const pinNode of pageInNodes) {
    const key = String(pinNode.params.connectorKey ?? pinNode.instanceName).trim();
    if (!pageOutNames.has(key)) {
      diagnostics.push(
        makeDiag({
          id: nextId("orphan-conn"),
          severity: "warning",
          code: "ORPHAN_PAGE_CONNECTOR",
          messageKey: "compactStudio.diag.orphanPageConnector",
          message: `Conector de entrada de página "${key}" não possui origem PAGE_OUT correspondente.`,
          pageId: pinNode.pageId,
          nodeId: pinNode.id,
        }),
      );
    }
  }

  // 7. Hardware limits (block count, retentive memory, I/O capacity)
  if (programBlockCount > model.hardware.maxBlocks) {
    diagnostics.push(
      makeDiag({
        id: nextId("hw-blocks"),
        severity: "error",
        code: "HARDWARE_BLOCK_LIMIT_EXCEEDED",
        messageKey: "compactStudio.diag.hardwareBlockLimit",
        message: `Quantidade de blocos (${programBlockCount}) excede o limite do controlador ${model.hardware.basePartCode} (${model.hardware.maxBlocks}).`,
      }),
    );
  }
  if (estimatedRetentiveBytes > model.hardware.retentiveMemoryBytes) {
    diagnostics.push(
      makeDiag({
        id: nextId("hw-mem"),
        severity: "error",
        code: "HARDWARE_MEMORY_EXCEEDED",
        messageKey: "compactStudio.diag.hardwareMemoryLimit",
        message: `Memória retentiva estimada (${estimatedRetentiveBytes} bytes) excede a capacidade (${model.hardware.retentiveMemoryBytes} bytes).`,
      }),
    );
  }

  const slotTotals = model.hardware.slots.reduce(
    (acc, s) => ({
      DI: acc.DI + s.digitalInputs,
      DO: acc.DO + s.digitalOutputs,
      AI: acc.AI + s.analogInputs,
      AO: acc.AO + s.analogOutputs,
    }),
    { DI: 0, DO: 0, AI: 0, AO: 0 },
  );

  if (
    ioCounts.DI > slotTotals.DI ||
    ioCounts.DO > slotTotals.DO ||
    ioCounts.AI > slotTotals.AI ||
    ioCounts.AO > slotTotals.AO
  ) {
    diagnostics.push(
      makeDiag({
        id: nextId("hw-io"),
        severity: "warning",
        code: "IO_CAPACITY_EXCEEDED",
        messageKey: "compactStudio.diag.ioCapacityExceeded",
        message: `E/S simbólicas utilizadas (DI:${ioCounts.DI}/${slotTotals.DI}, DO:${ioCounts.DO}/${slotTotals.DO}, AI:${ioCounts.AI}/${slotTotals.AI}, AO:${ioCounts.AO}/${slotTotals.AO}) excedem os módulos configurados no hardware.`,
      }),
    );
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    blockCount: programBlockCount,
    estimatedRetentiveBytes,
    diagnostics,
  };
}
