// Universal Deterministic Importer for ElétricAi Canvas
// Detects format, validates Zero Trust security, synthesizes preview reports,
// and converts external AI bundles into real, editable Canvas elements with 0 AI credits consumed.

import { ulid } from "ulid";
import type { DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "@/lib/diagram/schema";
import { makeEdge, makeNode } from "@/lib/diagram/model";
import type { IndustrialEdge, IndustrialNode } from "@/lib/project-store";
import type { LadderRung, LadderCell } from "@/lib/ladder/types";
import { parseJsonBundle } from "./adapters/json-adapter";
import { parseYamlBundle } from "./adapters/yaml-adapter";
import { parseCsvProject } from "./adapters/csv-adapter";
import { parsePlcopenXml } from "./adapters/plcopen-adapter";
import { parseNetlistProject } from "./adapters/netlist-adapter";
import { resolveComponentKind } from "./bundle-schema";
import type {
  EletricAiCanvasBundle,
  ImportApplicationMode,
  ImportValidationReport,
  ImportIssue,
} from "./types";

/**
 * Remove delimitadores de bloco de código markdown (```json ... ``` ou ```yaml ... ```)
 * frequentemente inseridos por modelos de linguagem (ChatGPT, Claude, DeepSeek).
 */
export function cleanExternalPayloadText(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_\-]*\s*\r?\n?/, "");
    cleaned = cleaned.replace(/\r?\n?```\s*$/, "");
  }
  return cleaned.trim();
}

export function detectFormat(raw: string): "json-bundle" | "yaml-bundle" | "csv-table" | "plcopen-xml" | "netlist" | "unknown" {
  const trimmed = cleanExternalPayloadText(raw);
  if (trimmed.startsWith("<?xml") || (trimmed.startsWith("<") && /<project\b/i.test(trimmed))) {
    return "plcopen-xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json-bundle";
  }
  if (/^format:\s*["']?eletricai\.canvas-bundle["']?/m.test(trimmed) || /^nodes:\s*$/m.test(trimmed)) {
    return "yaml-bundle";
  }
  // Se contiver delimitadores CSV e quebras de linha com cabeçalhos conhecidos
  const firstLine = trimmed.split("\n")[0] || "";
  if ((firstLine.includes(",") || firstLine.includes(";")) && /(tag|tipo|kind|identificador|descricao)/i.test(firstLine)) {
    return "csv-table";
  }
  // Se contiver linhas de Netlist SPICE / circuito elétrico (ex: Q1 N1 N2 63A, KM1 N2 N3)
  if (/^\s*([VvIiRrCcLlMmQqDd]\w*|[A-Za-z]+)\s+\w+\s+\w+/m.test(trimmed) && trimmed.includes("\n")) {
    return "netlist";
  }
  return "unknown";
}

export function validateAndParseExternalPayload(rawContent: string): ImportValidationReport {
  const cleaned = cleanExternalPayloadText(rawContent);
  const format = detectFormat(rawContent);
  let adapterResult: { success: boolean; bundle?: EletricAiCanvasBundle; issues: ImportIssue[] };

  switch (format) {
    case "json-bundle":
      adapterResult = parseJsonBundle(cleaned);
      break;
    case "yaml-bundle":
      adapterResult = parseYamlBundle(cleaned);
      break;
    case "csv-table":
      adapterResult = parseCsvProject(rawContent);
      break;
    case "plcopen-xml":
      adapterResult = parsePlcopenXml(rawContent);
      break;
    case "netlist":
      adapterResult = parseNetlistProject(cleaned);
      break;
    default:
      // Tentar JSON primeiro como fallback com texto limpo
      try {
        adapterResult = parseJsonBundle(cleaned);
      } catch {
        return {
          isValid: false,
          canImport: false,
          detectedFormat: "unknown",
          stats: {
            totalNodes: 0,
            recognizedNodes: 0,
            rejectedNodes: 0,
            totalEdges: 0,
            validEdges: 0,
            rejectedEdges: 0,
            ladderRungsCount: 0,
            tagsCount: 0,
          },
          issues: [
            {
              id: "unsupported-format",
              severity: "critical",
              category: "schema",
              message:
                "Formato não reconhecido. Forneça um arquivo JSON Canvas Bundle, YAML seguro, CSV ou PLCopen XML.",
              rejected: true,
            },
          ],
        };
      }
  }

  const issues = [...adapterResult.issues];
  const bundle = adapterResult.bundle;

  if (!bundle) {
    return {
      isValid: false,
      canImport: false,
      detectedFormat: format,
      stats: {
        totalNodes: 0,
        recognizedNodes: 0,
        rejectedNodes: 0,
        totalEdges: 0,
        validEdges: 0,
        rejectedEdges: 0,
        ladderRungsCount: 0,
        tagsCount: 0,
      },
      issues,
    };
  }

  // Análise estrutural e de componentes
  let recognizedNodes = 0;
  let rejectedNodes = 0;

  for (const n of bundle.nodes) {
    const kind = resolveComponentKind(n.type);
    if (kind) {
      recognizedNodes++;
    } else {
      rejectedNodes++;
      issues.push({
        id: `unsupported-node-${n.id}`,
        severity: "warning",
        category: "component",
        entityId: n.id,
        message: `Componente "${n.id}" possui tipo não suportado "${n.type}".`,
      });
    }

    // Alertas elétricos determinísticos
    if (kind === "motor" && !n.properties?.power_kW && !n.properties?.P) {
      issues.push({
        id: `motor-no-power-${n.id}`,
        severity: "warning",
        category: "electrical",
        entityId: n.id,
        message: `Motor "${n.label || n.id}" não especifica potência nominal (kW). O dimensionamento utilizará valor padrão de 5,5 kW.`,
      });
    }
  }

  const validEdges = bundle.edges.length;
  const criticalIssuesCount = issues.filter((i) => i.severity === "critical" && i.rejected).length;
  const canImport = criticalIssuesCount === 0 && (bundle.nodes.length > 0 || (bundle.ladder?.rungs.length ?? 0) > 0 || (bundle.tags?.length ?? 0) > 0);

  return {
    isValid: adapterResult.success,
    canImport,
    detectedFormat: format,
    stats: {
      totalNodes: bundle.nodes.length,
      recognizedNodes,
      rejectedNodes,
      totalEdges: bundle.edges.length,
      validEdges,
      rejectedEdges: issues.filter((i) => i.category === "connection" && i.rejected).length,
      ladderRungsCount: bundle.ladder?.rungs.length ?? 0,
      tagsCount: bundle.tags?.length ?? 0,
    },
    issues,
    bundle,
  };
}

/**
 * Converte o Bundle validado para o modelo interno real `DiagramDoc` (WebGL Canvas).
 */
export function convertBundleToDiagramDoc(
  bundle: EletricAiCanvasBundle,
  baseDoc?: DiagramDoc,
  mode: ImportApplicationMode = "replace",
): DiagramDoc {
  let doc: DiagramDoc =
    mode === "merge" && baseDoc
      ? JSON.parse(JSON.stringify(baseDoc))
      : {
          version: 1,
          id: `doc_${ulid().slice(-8)}`,
          metadata: { title: bundle.project.name || "Diagrama Importado", norms: ["NBR 5410"] },
          sheets: ["unifilar"],
          nodes: {},
          edges: {},
        };

  // Calcular deslocamento para o modo "merge" (evitar sobreposição)
  let offsetX = 0;
  let offsetY = 0;
  if (mode === "merge" && baseDoc && baseDoc.nodes) {
    const existingXs = Object.values(baseDoc.nodes)
      .map((n) => n?.position?.x)
      .filter((x): x is number => typeof x === "number" && !isNaN(x));
    if (existingXs.length > 0) {
      const maxX = Math.max(...existingXs);
      offsetX = maxX + 250;
    }
  }

  const idMap = new Map<string, string>();

  // 1. Inserir nós
  for (const n of bundle.nodes) {
    const kind = (resolveComponentKind(n.type) || "load") as NodeKind;
    const finalId = mode === "merge" && doc.nodes[n.id] ? `${n.id}_${ulid().slice(-4)}` : n.id;
    idMap.set(n.id, finalId);

    const newNode = makeNode({
      sheet: "unifilar",
      params: { kind } as any,
      position: {
        x: n.position.x + offsetX,
        y: n.position.y + offsetY,
      },
      id: finalId,
      label: n.label || (n.properties?.tag ? String(n.properties?.tag) : finalId),
      rotation: n.rotation || 0,
    });
    (newNode as any).kind = kind;

    // Mesclar propriedades nos params
    const rawP = n.properties ?? {};
    const paramsPatch: Record<string, any> = { ...newNode.params };

    if (rawP.power_kW !== undefined) paramsPatch.power_kW = Number(rawP.power_kW);
    if (rawP.P !== undefined) paramsPatch.P = Number(rawP.P);
    if (rawP.voltage_V !== undefined) paramsPatch.voltage_V = Number(rawP.voltage_V);
    if (rawP.U !== undefined) paramsPatch.U = Number(rawP.U);
    if (rawP.in_A !== undefined) paramsPatch.in_A = Number(rawP.in_A);
    if (rawP.In !== undefined) paramsPatch.In = Number(rawP.In);
    if (rawP.poles !== undefined) paramsPatch.poles = Number(rawP.poles);
    if (rawP.curve !== undefined) paramsPatch.curve = String(rawP.curve);
    if (rawP.startMethod !== undefined) paramsPatch.startMethod = String(rawP.startMethod);
    if (rawP.tag !== undefined) paramsPatch.tag = String(rawP.tag);

    newNode.params = paramsPatch as any;
    doc.nodes[finalId] = newNode;
  }

  // 2. Inserir edges
  for (let i = 0; i < bundle.edges.length; i++) {
    const e = bundle.edges[i];
    const srcId = idMap.get(e.source) || e.source;
    const tgtId = idMap.get(e.target) || e.target;

    if (!doc.nodes[srcId] || !doc.nodes[tgtId]) continue;

    const edgeId = mode === "merge" ? `edge_imp_${ulid().slice(-6)}` : e.id || `edge_${i + 1}`;
    const circuitConfig = e.circuitConfig === "3F+PE" ? "3F+N+PE" : e.circuitConfig;
    const newEdge = makeEdge({
      id: edgeId,
      source: srcId,
      target: tgtId,
      kind: e.kind || "power",
      sheet: "unifilar",
      circuitConfig: circuitConfig as any,
    });
    doc.edges[edgeId] = newEdge;
  }

  return doc;
}

/**
 * Converte o Bundle para os modelos de simulação `IndustrialNode` e `IndustrialEdge`.
 */
export function convertBundleToIndustrialElements(
  bundle: EletricAiCanvasBundle,
): { nodes: IndustrialNode[]; edges: IndustrialEdge[] } {
  const nodes: IndustrialNode[] = [];
  const edges: IndustrialEdge[] = [];

  for (const n of bundle.nodes) {
    const kind = (resolveComponentKind(n.type) || "load") as any;
    nodes.push({
      id: n.id,
      kind,
      category: "power",
      label: n.label || n.id,
      position: { x: n.position.x, y: n.position.y },
      params: (n.properties as Record<string, any>) ?? {},
    });
  }

  for (let i = 0; i < bundle.edges.length; i++) {
    const e = bundle.edges[i];
    edges.push({
      id: e.id || `e_${i + 1}`,
      source: e.source,
      target: e.target,
      kind: e.kind === "pipe" ? "pipe" : e.kind === "signal" ? "signal" : "power",
    });
  }

  return { nodes, edges };
}

/**
 * Converte rungs do Bundle para o modelo interno de Ladder `LadderRung[]`.
 */
export function convertBundleToLadderRungs(bundle: EletricAiCanvasBundle): LadderRung[] {
  if (!bundle.ladder?.rungs) return [];
  return bundle.ladder.rungs.map((r) => {
    const cells: LadderCell[][] = r.branches.map((b, rowIdx) => {
      const row: LadderCell[] = b.map((c) => ({
        kind: c.kind as any,
        operand: c.operand,
      }));
      if (rowIdx === 0) {
        row.push({
          kind: r.output.kind as any,
          operand: r.output.operand,
          preset: typeof r.output.params?.preset === "number" ? r.output.params.preset : undefined,
        });
      }
      return row;
    });

    const rung: LadderRung = {
      id: r.id,
      label: r.comment || r.id,
      cells:
        cells.length > 0
          ? cells
          : [
              [
                {
                  kind: r.output.kind as any,
                  operand: r.output.operand,
                  preset:
                    typeof r.output.params?.preset === "number" ? r.output.params.preset : undefined,
                },
              ],
            ],
    };
    (rung as any).output = r.output;
    return rung;
  });
}
