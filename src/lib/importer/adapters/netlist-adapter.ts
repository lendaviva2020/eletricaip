// SPICE / Electrical Netlist Adapter for ElétricAi Canvas
// Deterministic line-by-line parser for SPICE netlists (.cir, .net, .sp)
// Zero Trust, no eval, no arbitrary code execution, 0 AI credits.

import { resolveComponentKind } from "../bundle-schema";
import { validatePayloadSize } from "../security-validator";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleEdge,
  type BundleNode,
  type EletricAiCanvasBundle,
  type ImportIssue,
  type ImporterLimits,
} from "../types";

export interface NetlistAdapterResult {
  success: boolean;
  bundle?: EletricAiCanvasBundle;
  issues: ImportIssue[];
}

export function parseNetlistProject(
  rawText: string,
  customLimits?: Partial<ImporterLimits>,
): NetlistAdapterResult {
  const issues: ImportIssue[] = [];

  const sizeCheck = validatePayloadSize(rawText, customLimits);
  if (!sizeCheck.isSafe) {
    return {
      success: false,
      issues: sizeCheck.violations.map((v) => ({
        id: "sec-size",
        severity: "critical",
        category: "security",
        message: v,
        rejected: true,
      })),
    };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("*") && !l.startsWith("#") && !l.startsWith(";"));

  if (lines.length === 0) {
    return {
      success: false,
      issues: [
        {
          id: "netlist-empty",
          severity: "critical",
          category: "schema",
          message: "O texto de netlist está vazio ou contém apenas comentários.",
          rejected: true,
        },
      ],
    };
  }

  const nodes: BundleNode[] = [];
  const edges: BundleEdge[] = [];
  const busNodesSeen = new Map<string, string>(); // Netlist node name -> Canvas node ID

  let compIndex = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const tokens = line.split(/\s+/);
    if (tokens.length < 3) continue;

    const compName = tokens[0];
    const firstChar = compName[0].toUpperCase();
    const nodeA = tokens[1];
    const nodeB = tokens[2];
    const valToken = tokens.slice(3).join(" ");

    // Deduce component kind from netlist prefix or token
    let kindStr = "load";
    const properties: Record<string, string | number | boolean> = {
      tag: compName,
    };

    if (/^(DJ|CB|QF|DISJ)/i.test(compName) || firstChar === "Q") {
      kindStr = "breaker";
      const matchIn = valToken.match(/(\d+(?:\.\d+)?)\s*A?/i);
      if (matchIn) properties.In = parseFloat(matchIn[1]);
    } else if (/^(K|KM|CONT)/i.test(compName)) {
      kindStr = "contactor";
      const matchIn = valToken.match(/(\d+(?:\.\d+)?)\s*A?/i);
      if (matchIn) properties.In = parseFloat(matchIn[1]);
    } else if (/^(M|MOT|MTR)/i.test(compName)) {
      kindStr = "motor";
      const matchP = valToken.match(/(\d+(?:\.\d+)?)\s*k?W?/i);
      if (matchP) properties.power_kW = parseFloat(matchP[1]);
    } else if (/^(V|SRC|FONTE|ALIM)/i.test(compName)) {
      kindStr = "psu";
      const matchV = valToken.match(/(\d+(?:\.\d+)?)\s*V?/i);
      if (matchV) properties.voltage_V = parseFloat(matchV[1]);
    } else if (/^(TR|TRAFO)/i.test(compName)) {
      kindStr = "transformer";
      const matchP = valToken.match(/(\d+(?:\.\d+)?)\s*k?VA?/i);
      if (matchP) properties.kVA = parseFloat(matchP[1]);
    } else if (/^(ES|EMERG)/i.test(compName)) {
      kindStr = "estop";
    } else if (/^(DR|RCD)/i.test(compName)) {
      kindStr = "rcd";
    } else {
      kindStr = resolveComponentKind(compName) || "load";
    }

    const compId = compName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const posX = 150 + (compIndex % 4) * 220;
    const posY = 100 + Math.floor(compIndex / 4) * 180;
    compIndex++;

    nodes.push({
      id: compId,
      type: kindStr,
      label: compName,
      position: { x: posX, y: posY },
      properties,
    });

    // Create electrical connections between nodes
    if (nodeA !== "0" && nodeA.toLowerCase() !== "gnd") {
      if (!busNodesSeen.has(nodeA)) {
        busNodesSeen.set(nodeA, compId);
      } else {
        const sourceComp = busNodesSeen.get(nodeA)!;
        edges.push({
          id: `edge_nl_${edges.length + 1}`,
          source: sourceComp,
          target: compId,
          kind: "power",
          circuitConfig: "3F+N+PE",
        });
      }
    }

    if (nodeB !== "0" && nodeB.toLowerCase() !== "gnd") {
      busNodesSeen.set(nodeB, compId);
    }
  }

  const bundle: EletricAiCanvasBundle = {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    project: {
      name: "Circuito Netlist Importado",
      diagramType: "unifilar",
      units: "metric",
      standards: ["NBR 5410", "IEC 60947"],
    },
    nodes,
    edges,
    metadata: {
      author: "Netlist Parser Determinístico",
      generator: "eletricai-netlist-adapter",
      generatedAt: new Date().toISOString(),
    },
  };

  return {
    success: true,
    bundle,
    issues,
  };
}
