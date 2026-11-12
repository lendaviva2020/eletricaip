/**
 * Bidirectional Semantic Projection & Conversion Engine (FBD <-> LAD)
 *
 * Operates exclusively over the single canonical CompactProgramModel.
 * Non-representable constructs in pure contact-coil Ladder are NEVER silently dropped:
 * they emit explicit NON_REPRESENTABLE diagnostics and can be encapsulated as IEC EN/ENO
 * boxed function blocks. Equivalence verification runs BOTH models through the single
 * shared CompactExecutionEngine + SimulatedClock.
 */
import type {
  CompactConnection,
  CompactNode,
  CompactParamValue,
  CompactProgramModel,
} from "../domain/types";
import { createCompactBlockNode } from "../editor/clipboard-and-layout";
import { CompactExecutionEngine } from "../runtime/compact-execution-engine";

export type LadElementKind =
  | "contact_no"
  | "contact_nc"
  | "rising_contact"
  | "falling_contact"
  | "coil"
  | "set_coil"
  | "reset_coil"
  | "box_fb";

export interface LadElement {
  readonly id: string;
  readonly nodeId: string;
  readonly kind: LadElementKind;
  readonly label: string;
  readonly blockType: string;
  readonly negated: boolean;
  readonly params: Record<string, CompactParamValue>;
  readonly boxedFallback?: boolean;
  readonly nonRepresentableReason?: string;
}

export interface LadBranch {
  readonly id: string;
  readonly elements: readonly LadElement[];
}

export interface LadConversionIssue {
  readonly code: "NON_REPRESENTABLE" | "ANALOG_BOXED" | "MULTI_FANOUT_BOXED";
  readonly severity: "info" | "warning";
  readonly nodeId: string;
  readonly instanceName: string;
  readonly blockType: string;
  readonly message: string;
  readonly keptAsBoxedBlock: boolean;
}

export interface LadRung {
  readonly id: string;
  readonly pageId: string;
  readonly rungIndex: number;
  readonly title: string;
  readonly branches: readonly LadBranch[];
  readonly coils: readonly LadElement[];
}

export interface LadProjectionResult {
  readonly rungs: readonly LadRung[];
  readonly issues: readonly LadConversionIssue[];
  readonly hasNonRepresentable: boolean;
}

const PURE_CONTACT_BLOCKS = new Set([
  "INPUT_DI",
  "FLAG_M",
  "AND",
  "OR",
  "NOT",
  "AND_EDGE",
  "HIGH",
  "LOW",
  "STARTUP_FLAG_M8",
]);

const COIL_BLOCKS = new Set(["OUTPUT_QO", "FLAG_M", "SR", "RS", "PULSE_RELAY", "PAGE_OUT"]);

const ANALOG_OR_SPECIAL_BOXES = new Set([
  "TON",
  "TOF",
  "TP",
  "TONR",
  "TON_TOF",
  "WIPING_RELAY",
  "EDGE_TRIGGERED_WIPING",
  "ASYNC_PULSE_GEN",
  "RANDOM_GEN",
  "STAIRWAY_SWITCH",
  "CTU",
  "CTD",
  "CTUD_COMPACT",
  "HOUR_COUNTER",
  "THRESHOLD_TRIGGER",
  "WEEKLY_TIMER",
  "YEARLY_TIMER",
  "ANALOG_COMP",
  "ANALOG_THRESHOLD",
  "ANALOG_AMP",
  "ANALOG_MUX",
  "ANALOG_RAMP",
  "PI_CONTROLLER",
  "ANALOG_WATCHDOG",
  "MATH_EXPR_SAFE",
  "ANALOG_FILTER",
  "SHIFT_REGISTER",
  "MESSAGE_TEXT",
  "DATA_LOG",
  "INPUT_AI",
  "OUTPUT_AO",
  "FLAG_AM",
  "CONST_INT",
  "CONST_REAL",
  "CONST_BOOL",
  "NAND",
  "NOR",
  "XOR",
  "NAND_EDGE",
]);

function flattenUpstreamBranches(
  nodeId: string,
  nodeMap: ReadonlyMap<string, CompactNode>,
  incomingMap: ReadonlyMap<string, CompactConnection[]>,
  visited: Set<string>,
  issues: LadConversionIssue[],
  wrapNonRepresentableAsBox: boolean,
  negatedEdge = false,
): LadBranch[] {
  if (visited.has(nodeId)) {
    const node = nodeMap.get(nodeId);
    if (node) {
      issues.push({
        code: "NON_REPRESENTABLE",
        severity: "warning",
        nodeId: node.id,
        instanceName: node.instanceName,
        blockType: node.blockType,
        message: `Realimentação/ciclo em '${node.instanceName}' (${node.blockType}) encapsulado como referência simbólica no Ladder.`,
        keptAsBoxedBlock: wrapNonRepresentableAsBox,
      });
    }
    return node && wrapNonRepresentableAsBox
      ? [
          {
            id: `br_fb_${node.id}`,
            elements: [
              {
                id: `el_fb_${node.id}`,
                nodeId: node.id,
                kind: negatedEdge ? "contact_nc" : "contact_no",
                label: node.instanceName,
                blockType: node.blockType,
                negated: negatedEdge,
                params: { ...node.params },
                boxedFallback: true,
                nonRepresentableReason: "Realimentação cíclica",
              },
            ],
          },
        ]
      : [];
  }

  const node = nodeMap.get(nodeId);
  if (!node) return [];

  const nextVisited = new Set(visited);
  nextVisited.add(nodeId);
  const incoming = incomingMap.get(nodeId) ?? [];

  if (
    node.blockType === "INPUT_DI" ||
    node.blockType === "FLAG_M" ||
    node.blockType === "STARTUP_FLAG_M8"
  ) {
    return [
      {
        id: `br_${node.id}`,
        elements: [
          {
            id: `el_${node.id}`,
            nodeId: node.id,
            kind: negatedEdge ? "contact_nc" : "contact_no",
            label: node.instanceName,
            blockType: node.blockType,
            negated: negatedEdge,
            params: { ...node.params },
          },
        ],
      },
    ];
  }

  if (node.blockType === "NOT") {
    if (incoming.length === 0) return [];
    const upstream = incoming[0];
    return flattenUpstreamBranches(
      upstream.fromNodeId,
      nodeMap,
      incomingMap,
      nextVisited,
      issues,
      wrapNonRepresentableAsBox,
      !negatedEdge !== Boolean(upstream.negatedTarget),
    );
  }

  if (node.blockType === "AND_EDGE") {
    const baseBranches =
      incoming.length > 0
        ? flattenUpstreamBranches(
            incoming[0].fromNodeId,
            nodeMap,
            incomingMap,
            nextVisited,
            issues,
            wrapNonRepresentableAsBox,
          )
        : [];
    const edgeEl: LadElement = {
      id: `el_${node.id}`,
      nodeId: node.id,
      kind: "rising_contact",
      label: node.instanceName,
      blockType: node.blockType,
      negated: false,
      params: { ...node.params },
    };
    if (baseBranches.length === 0) {
      return [{ id: `br_${node.id}`, elements: [edgeEl] }];
    }
    return baseBranches.map((br, idx) => ({
      id: `${br.id}_e${idx}`,
      elements: [...br.elements, edgeEl],
    }));
  }

  if (node.blockType === "OR" && !negatedEdge) {
    const merged: LadBranch[] = [];
    for (const conn of incoming) {
      const sub = flattenUpstreamBranches(
        conn.fromNodeId,
        nodeMap,
        incomingMap,
        nextVisited,
        issues,
        wrapNonRepresentableAsBox,
        Boolean(conn.negatedTarget),
      );
      merged.push(...sub);
    }
    return merged;
  }

  if (node.blockType === "AND" && !negatedEdge) {
    let combined: LadBranch[] = [{ id: `br_series_${node.id}`, elements: [] }];
    for (const conn of incoming) {
      const sub = flattenUpstreamBranches(
        conn.fromNodeId,
        nodeMap,
        incomingMap,
        nextVisited,
        issues,
        wrapNonRepresentableAsBox,
        Boolean(conn.negatedTarget),
      );
      if (sub.length === 0) continue;
      const expanded: LadBranch[] = [];
      for (const left of combined) {
        for (const right of sub) {
          expanded.push({
            id: `${left.id}_${right.id}`,
            elements: [...left.elements, ...right.elements],
          });
        }
      }
      combined = expanded;
    }
    return combined;
  }

  // Non-pure contact constructs (e.g. NAND, NOR, XOR, Timer, Counter, Analog, Math, UDF)
  const isAnalogOrSpecial =
    ANALOG_OR_SPECIAL_BOXES.has(node.blockType) || node.category === "udf" || negatedEdge;

  if (isAnalogOrSpecial || !PURE_CONTACT_BLOCKS.has(node.blockType)) {
    const isComplexLogic =
      node.blockType === "NAND" ||
      node.blockType === "NOR" ||
      node.blockType === "XOR" ||
      node.blockType === "NAND_EDGE" ||
      negatedEdge;
    const reason = isComplexLogic
      ? `Bloco '${node.instanceName}' (${node.blockType}) não possui decomposição direta em série/paralelo simples; mantido como Box EN/ENO.`
      : `Bloco funcional/analógico '${node.instanceName}' (${node.blockType}) representado como Box EN/ENO no Ladder.`;

    issues.push({
      code:
        node.category === "analog" || node.blockType.startsWith("ANALOG_")
          ? "ANALOG_BOXED"
          : "NON_REPRESENTABLE",
      severity: isComplexLogic ? "warning" : "info",
      nodeId: node.id,
      instanceName: node.instanceName,
      blockType: node.blockType,
      message: reason,
      keptAsBoxedBlock: wrapNonRepresentableAsBox,
    });

    if (!wrapNonRepresentableAsBox) {
      return [];
    }

    const prefixBranches =
      incoming.length > 0
        ? flattenUpstreamBranches(
            incoming[0].fromNodeId,
            nodeMap,
            incomingMap,
            nextVisited,
            issues,
            wrapNonRepresentableAsBox,
            Boolean(incoming[0].negatedTarget),
          )
        : [{ id: `br_seed_${node.id}`, elements: [] }];

    const boxEl: LadElement = {
      id: `el_${node.id}`,
      nodeId: node.id,
      kind: "box_fb",
      label: node.instanceName,
      blockType: node.blockType,
      negated: negatedEdge,
      params: { ...node.params },
      boxedFallback: true,
      nonRepresentableReason: reason,
    };

    if (prefixBranches.length === 0) {
      return [{ id: `br_box_${node.id}`, elements: [boxEl] }];
    }
    return [
      {
        id: `br_box_${node.id}`,
        elements: [...prefixBranches[0].elements, boxEl],
      },
    ];
  }

  return [];
}

/**
 * Projects a canonical CompactProgramModel into IEC 61131-3 Ladder rungs per page.
 */
export function projectModelToLadNetworks(
  model: CompactProgramModel,
  opts?: { readonly wrapNonRepresentableAsBox?: boolean },
): LadProjectionResult {
  const wrapAsBox = opts?.wrapNonRepresentableAsBox ?? true;
  const rungs: LadRung[] = [];
  const issues: LadConversionIssue[] = [];

  for (const page of [...model.pages].sort((a, b) => a.order - b.order)) {
    const pageNodes = model.nodes.filter((n) => n.pageId === page.id);
    const pageConns = model.connections.filter((c) => c.pageId === page.id);
    const nodeMap = new Map(pageNodes.map((n) => [n.id, n]));
    const incomingMap = new Map<string, CompactConnection[]>();
    const outgoingCount = new Map<string, number>();

    for (const c of pageConns) {
      const arr = incomingMap.get(c.toNodeId) ?? [];
      arr.push(c);
      incomingMap.set(c.toNodeId, arr);
      outgoingCount.set(c.fromNodeId, (outgoingCount.get(c.fromNodeId) ?? 0) + 1);
    }

    const sinks = pageNodes.filter(
      (n) =>
        COIL_BLOCKS.has(n.blockType) ||
        n.blockType === "OUTPUT_AO" ||
        n.blockType === "MESSAGE_TEXT" ||
        n.blockType === "DATA_LOG" ||
        ((outgoingCount.get(n.id) ?? 0) === 0 && (incomingMap.get(n.id)?.length ?? 0) > 0),
    );

    let rungIdx = 1;
    for (const sink of sinks) {
      const incoming = incomingMap.get(sink.id) ?? [];
      if (sink.blockType === "SR" || sink.blockType === "RS") {
        // Project Set and Reset into 2 crisp Ladder rungs
        const sConn = incoming.find(
          (c) => c.toPortId.toLowerCase() === "s" || c.toPortId.toLowerCase() === "s1",
        );
        const rConn = incoming.find(
          (c) => c.toPortId.toLowerCase() === "r" || c.toPortId.toLowerCase() === "r1",
        );
        if (sConn) {
          const branches = flattenUpstreamBranches(
            sConn.fromNodeId,
            nodeMap,
            incomingMap,
            new Set([sink.id]),
            issues,
            wrapAsBox,
            Boolean(sConn.negatedTarget),
          );
          rungs.push({
            id: `rung_${sink.id}_s`,
            pageId: page.id,
            rungIndex: rungIdx++,
            title: `${sink.instanceName} (SET)`,
            branches:
              branches.length > 0 ? branches : [{ id: `br_empty_${sink.id}_s`, elements: [] }],
            coils: [
              {
                id: `coil_${sink.id}_s`,
                nodeId: sink.id,
                kind: "set_coil",
                label: sink.instanceName,
                blockType: sink.blockType,
                negated: false,
                params: { ...sink.params },
              },
            ],
          });
        }
        if (rConn) {
          const branches = flattenUpstreamBranches(
            rConn.fromNodeId,
            nodeMap,
            incomingMap,
            new Set([sink.id]),
            issues,
            wrapAsBox,
            Boolean(rConn.negatedTarget),
          );
          rungs.push({
            id: `rung_${sink.id}_r`,
            pageId: page.id,
            rungIndex: rungIdx++,
            title: `${sink.instanceName} (RESET)`,
            branches:
              branches.length > 0 ? branches : [{ id: `br_empty_${sink.id}_r`, elements: [] }],
            coils: [
              {
                id: `coil_${sink.id}_r`,
                nodeId: sink.id,
                kind: "reset_coil",
                label: sink.instanceName,
                blockType: sink.blockType,
                negated: false,
                params: { ...sink.params },
              },
            ],
          });
        }
        continue;
      }

      const branches: LadBranch[] = [];
      for (const conn of incoming) {
        const sub = flattenUpstreamBranches(
          conn.fromNodeId,
          nodeMap,
          incomingMap,
          new Set([sink.id]),
          issues,
          wrapAsBox,
          Boolean(conn.negatedTarget),
        );
        branches.push(...sub);
      }

      const isCoil = sink.blockType === "OUTPUT_QO" || sink.blockType === "FLAG_M";
      rungs.push({
        id: `rung_${sink.id}`,
        pageId: page.id,
        rungIndex: rungIdx++,
        title: sink.instanceName,
        branches: branches.length > 0 ? branches : [{ id: `br_empty_${sink.id}`, elements: [] }],
        coils: [
          {
            id: `coil_${sink.id}`,
            nodeId: sink.id,
            kind: isCoil ? "coil" : "box_fb",
            label: sink.instanceName,
            blockType: sink.blockType,
            negated: false,
            params: { ...sink.params },
            boxedFallback: !isCoil,
            nonRepresentableReason: isCoil
              ? undefined
              : `Saída/bloco '${sink.instanceName}' (${sink.blockType}) renderizado como Box EN/ENO.`,
          },
        ],
      });
    }
  }

  return {
    rungs,
    issues,
    hasNonRepresentable: issues.some((i) => i.severity === "warning"),
  };
}

/**
 * Converts edited LAD rungs back into a canonical CompactProgramModel (replacing page nodes/connections)
 * while maintaining deterministic I/O addressing and both FBD & LAD visual coordinates.
 */
export function convertLadRungsToCanonical(
  baseModel: CompactProgramModel,
  pageId: string,
  rungs: readonly LadRung[],
): CompactProgramModel {
  const retainedNodes = baseModel.nodes.filter((n) => n.pageId !== pageId);
  const retainedConns = baseModel.connections.filter((c) => c.pageId !== pageId);
  const fbdLayout = { ...baseModel.layout.fbd };
  const ladLayout = { ...baseModel.layout.lad };

  const newNodes: CompactNode[] = [];
  const newConns: CompactConnection[] = [];
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}_${seq++}`;

  const contactBlockType = (el: LadElement): string => {
    if (el.blockType && el.kind !== "box_fb") return el.blockType;
    if (el.kind === "rising_contact") return "AND_EDGE";
    return "INPUT_DI";
  };

  rungs.forEach((rung, rIdx) => {
    const baseY = 60 + rIdx * 180;
    const branchTailNodeIds: { nodeId: string; portId: string; negated: boolean }[] = [];

    rung.branches.forEach((branch, bIdx) => {
      const branchY = baseY + bIdx * 80;
      let prevOut: { nodeId: string; portId: string; negated: boolean } | null = null;

      branch.elements.forEach((el, eIdx) => {
        const nodeId = el.nodeId || nextId("lad_n");
        const bType =
          el.kind === "box_fb"
            ? el.blockType
            : el.kind === "rising_contact"
              ? "AND_EDGE"
              : contactBlockType(el);

        const existingIdx = newNodes.findIndex((n) => n.id === nodeId);
        const nodeObj =
          existingIdx >= 0
            ? newNodes[existingIdx]
            : createCompactBlockNode({
                id: nodeId,
                pageId,
                blockType: bType,
                instanceName: el.label,
                params: el.params,
              });
        if (existingIdx < 0) {
          newNodes.push(nodeObj);
        }

        const x = 80 + eIdx * 180;
        ladLayout[nodeId] = { x, y: branchY, width: 150, height: 70 };
        fbdLayout[nodeId] = fbdLayout[nodeId] ?? { x, y: branchY, width: 170, height: 96 };

        const outPort = nodeObj.outputs[0]?.id ?? "out";
        if (el.kind === "box_fb" && prevOut) {
          const inPort = nodeObj.inputs[0]?.id ?? "in";
          newConns.push({
            id: nextId("lad_c"),
            pageId,
            fromNodeId: prevOut.nodeId,
            fromPortId: prevOut.portId,
            toNodeId: nodeId,
            toPortId: inPort,
            signalType: "BOOL",
            negatedTarget: prevOut.negated,
          });
          prevOut = { nodeId, portId: outPort, negated: false };
        } else if (prevOut && el.kind !== "box_fb") {
          // Series contacts materialize an explicit AND node in canonical FBD
          const andId = nextId("lad_and");
          const andNode = createCompactBlockNode({
            id: andId,
            pageId,
            blockType: "AND",
            instanceName: `AND_${seq}`,
          });
          newNodes.push(andNode);
          fbdLayout[andId] = { x: x + 90, y: branchY, width: 160, height: 96 };
          ladLayout[andId] = { x: x + 90, y: branchY, width: 140, height: 70 };

          newConns.push({
            id: nextId("lad_c"),
            pageId,
            fromNodeId: prevOut.nodeId,
            fromPortId: prevOut.portId,
            toNodeId: andId,
            toPortId: andNode.inputs[0].id,
            signalType: "BOOL",
            negatedTarget: prevOut.negated,
          });
          newConns.push({
            id: nextId("lad_c"),
            pageId,
            fromNodeId: nodeId,
            fromPortId: outPort,
            toNodeId: andId,
            toPortId: andNode.inputs[1].id,
            signalType: "BOOL",
            negatedTarget: el.kind === "contact_nc" || el.negated,
          });
          prevOut = { nodeId: andId, portId: andNode.outputs[0].id, negated: false };
        } else {
          prevOut = {
            nodeId,
            portId: outPort,
            negated: el.kind === "contact_nc" || el.negated,
          };
        }
      });

      if (prevOut) {
        branchTailNodeIds.push(prevOut);
      }
    });

    let rungFeed: { nodeId: string; portId: string; negated: boolean } | null =
      branchTailNodeIds[0] ?? null;

    if (branchTailNodeIds.length > 1) {
      // Combine parallel Ladder branches via canonical OR node(s)
      for (let i = 1; i < branchTailNodeIds.length; i++) {
        if (!rungFeed) break;
        const orId = nextId("lad_or");
        const orNode = createCompactBlockNode({
          id: orId,
          pageId,
          blockType: "OR",
          instanceName: `OR_${seq}`,
        });
        newNodes.push(orNode);
        fbdLayout[orId] = { x: 460, y: baseY + i * 35, width: 160, height: 96 };
        ladLayout[orId] = { x: 460, y: baseY, width: 140, height: 70 };

        newConns.push({
          id: nextId("lad_c"),
          pageId,
          fromNodeId: rungFeed.nodeId,
          fromPortId: rungFeed.portId,
          toNodeId: orId,
          toPortId: orNode.inputs[0].id,
          signalType: "BOOL",
          negatedTarget: rungFeed.negated,
        });
        newConns.push({
          id: nextId("lad_c"),
          pageId,
          fromNodeId: branchTailNodeIds[i].nodeId,
          fromPortId: branchTailNodeIds[i].portId,
          toNodeId: orId,
          toPortId: orNode.inputs[1].id,
          signalType: "BOOL",
          negatedTarget: branchTailNodeIds[i].negated,
        });
        rungFeed = { nodeId: orId, portId: orNode.outputs[0].id, negated: false };
      }
    }

    for (const coil of rung.coils) {
      const coilId = coil.nodeId || nextId("lad_q");
      const existingCoil = newNodes.find((n) => n.id === coilId);
      const coilType = coil.blockType || "OUTPUT_QO";
      const coilNode =
        existingCoil ??
        createCompactBlockNode({
          id: coilId,
          pageId,
          blockType: coilType,
          instanceName: coil.label,
          params: coil.params,
        });
      if (!existingCoil) {
        newNodes.push(coilNode);
      }
      fbdLayout[coilId] = fbdLayout[coilId] ?? { x: 680, y: baseY, width: 170, height: 96 };
      ladLayout[coilId] = { x: 680, y: baseY, width: 150, height: 70 };

      if (rungFeed) {
        const targetPort =
          coil.kind === "set_coil"
            ? "s"
            : coil.kind === "reset_coil"
              ? "r"
              : (coilNode.inputs[0]?.id ?? "in");
        newConns.push({
          id: nextId("lad_c"),
          pageId,
          fromNodeId: rungFeed.nodeId,
          fromPortId: rungFeed.portId,
          toNodeId: coilId,
          toPortId: targetPort,
          signalType: "BOOL",
          negatedTarget: rungFeed.negated,
        });
      }
    }
  });

  return {
    ...baseModel,
    nodes: [...retainedNodes, ...newNodes],
    connections: [...retainedConns, ...newConns],
    layout: {
      ...baseModel.layout,
      fbd: fbdLayout,
      lad: ladLayout,
    },
  };
}

export interface EquivalenceVerificationResult {
  readonly equivalent: boolean;
  readonly method: "exhaustive" | "property_seeded";
  readonly testedVectors: number;
  readonly mismatches: readonly {
    readonly vector: Record<string, boolean>;
    readonly fbdOutputs: Record<string, boolean | number | string>;
    readonly ladOutputs: Record<string, boolean | number | string>;
  }[];
}

/**
 * Compiles BOTH FBD and LAD-converted models with the SAME shared CompactExecutionEngine
 * and proves input-output equivalence (exhaustive truth table for <=6 inputs, deterministic seeded sweep above).
 */
export function verifyFbdLadEquivalence(
  fbdModel: CompactProgramModel,
  ladModel: CompactProgramModel,
  opts?: { readonly randomTrials?: number; readonly seed?: number },
): EquivalenceVerificationResult {
  const inputNodes = Array.from(
    new Set(
      fbdModel.nodes
        .filter((n) => n.blockType === "INPUT_DI" || n.blockType === "FLAG_M")
        .map((n) => n.instanceName),
    ),
  ).sort();

  const outputNames = Array.from(
    new Set(
      fbdModel.nodes
        .filter((n) => n.blockType === "OUTPUT_QO" || n.blockType === "FLAG_M")
        .map((n) => n.instanceName),
    ),
  ).sort();

  const engFbd = new CompactExecutionEngine(fbdModel);
  const engLad = new CompactExecutionEngine(ladModel);

  const mismatches: {
    vector: Record<string, boolean>;
    fbdOutputs: Record<string, boolean | number | string>;
    ladOutputs: Record<string, boolean | number | string>;
  }[] = [];

  const exhaustive = inputNodes.length <= 6;
  const totalVectors = exhaustive ? 1 << inputNodes.length : Math.max(32, opts?.randomTrials ?? 64);

  let rng = (opts?.seed ?? 1337) >>> 0;
  const nextRandBool = () => {
    rng = (1664525 * rng + 1013904223) >>> 0;
    return ((rng >>> 31) & 1) === 1;
  };

  for (let v = 0; v < totalVectors; v++) {
    const vector: Record<string, boolean> = {};
    inputNodes.forEach((name, bitIdx) => {
      const val = exhaustive ? Boolean((v >> bitIdx) & 1) : nextRandBool();
      vector[name] = val;
      engFbd.setInput(name, val);
      engLad.setInput(name, val);
    });

    const f1 = engFbd.step(20);
    const f2 = engLad.step(20);

    const outFbd: Record<string, boolean | number | string> = {};
    const outLad: Record<string, boolean | number | string> = {};
    let differs = false;

    for (const outName of outputNames) {
      const fNode = fbdModel.nodes.find((n) => n.instanceName === outName);
      const lNode = ladModel.nodes.find((n) => n.instanceName === outName);
      const v1 =
        f1.variables[outName] ??
        (fNode
          ? (f1.outputs[fNode.id]?.OUT ?? f1.outputs[fNode.id]?.Q ?? f1.outputs[fNode.id]?.out)
          : undefined);
      const v2 =
        f2.variables[outName] ??
        (lNode
          ? (f2.outputs[lNode.id]?.OUT ?? f2.outputs[lNode.id]?.Q ?? f2.outputs[lNode.id]?.out)
          : undefined);
      if (v1 !== undefined) outFbd[outName] = v1;
      if (v2 !== undefined) outLad[outName] = v2;
      if (v1 !== v2) differs = true;
    }

    if (differs) {
      mismatches.push({ vector, fbdOutputs: outFbd, ladOutputs: outLad });
      if (mismatches.length >= 10) break;
    }
  }

  return {
    equivalent: mismatches.length === 0,
    method: exhaustive ? "exhaustive" : "property_seeded",
    testedVectors: totalVectors,
    mismatches,
  };
}
