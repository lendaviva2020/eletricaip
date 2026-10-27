// Universal Deterministic Importer for ElétricAi Canvas
// Detects format, validates Zero Trust security, synthesizes preview reports,
// and converts external AI bundles into real, editable Canvas elements with 0 AI credits consumed.

import { ulid } from "ulid";
import type { DiagramDoc, DiagramEdge, DiagramNode, NodeKind, NodeParams } from "@/lib/diagram/schema";
import { makeEdge, makeNode } from "@/lib/diagram/model";
import type { IndustrialEdge, IndustrialNode } from "@/lib/project-store";
import { type LadderRung, type LadderCell, normalizeLadderRungs } from "@/lib/ladder/types";
import { parseJsonBundle } from "./adapters/json-adapter";
import { parseYamlBundle } from "./adapters/yaml-adapter";
import { parseCsvProject } from "./adapters/csv-adapter";
import { parsePlcopenXml } from "./adapters/plcopen-adapter";
import { parseNetlistProject } from "./adapters/netlist-adapter";
import { parseStructuredText } from "./adapters/st-adapter";
import { parseTxtSpecification } from "./adapters/txt-spec-adapter";
import { resolveComponentKind } from "./bundle-schema";
import {
  DEFAULT_IMPORTER_LIMITS,
  type EletricAiCanvasBundle,
  type ImportApplicationMode,
  type ImportValidationReport,
  type ImportIssue,
  type ImporterLimits,
  type SupportedImporterFormat,
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

export function detectFormat(raw: string): SupportedImporterFormat {
  const trimmed = cleanExternalPayloadText(raw);
  if (trimmed.startsWith("<?xml") || (trimmed.startsWith("<") && /<(project|tc6_xml)\b/i.test(trimmed))) {
    return "plcopen-xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json-bundle";
  }
  if (
    /^format:\s*["']?eletricai\.canvas-bundle["']?/m.test(trimmed) ||
    (/^nodes:\s*$/m.test(trimmed) && !trimmed.includes("{")) ||
    /^schemaVersion:\s*/m.test(trimmed)
  ) {
    return "yaml-bundle";
  }
  // Structured Text IEC 61131-3 / Siemens SCL
  if (
    /\b(PROGRAM|FUNCTION_BLOCK|VAR_INPUT|VAR_OUTPUT|VAR_GLOBAL|END_VAR|END_PROGRAM)\b/i.test(trimmed) &&
    trimmed.includes(";")
  ) {
    return "st-program";
  }
  // Se contiver delimitadores CSV e quebras de linha com cabeçalhos conhecidos
  const firstLine = trimmed.split("\n")[0] || "";
  if ((firstLine.includes(",") || firstLine.includes(";")) && /(tag|tipo|kind|identificador|descricao|power_kw)/i.test(firstLine)) {
    return "csv-table";
  }
  // Especificação técnica em TXT / Tabela Markdown
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim());
  const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (
    tableLines.length >= 2 ||
    /^(PROJETO|PROJECT|TENSAO|COMPONENTES|LIGACOES):/im.test(trimmed) ||
    /^[-*]\s*[a-zA-Z0-9_]+:\s*(disjuntor|motor|contator|rele|breaker|load|chave)/im.test(trimmed)
  ) {
    return "txt-spec";
  }
  // Se contiver linhas de Netlist SPICE / circuito elétrico (ex: Q1 N1 N2 63A, KM1 N2 N3)
  if (/^\s*([VvIiRrCcLlMmQqDd]\w*|[A-Za-z]+)\s+\w+\s+\w+/m.test(trimmed) && trimmed.includes("\n")) {
    return "netlist";
  }
  return "unknown";
}

export function validateAndParseExternalPayload(
  rawContent: string,
  customLimits?: Partial<ImporterLimits>,
): ImportValidationReport {
  const startTime = performance.now();
  const limits: ImporterLimits = { ...DEFAULT_IMPORTER_LIMITS, ...customLimits };
  const cleaned = cleanExternalPayloadText(rawContent);
  const format = detectFormat(rawContent);

  const lineCount = rawContent.split(/\r?\n/).length;
  const payloadBytes = typeof rawContent === "string" ? new Blob([rawContent]).size : 0;

  let adapterResult: { success: boolean; bundle?: EletricAiCanvasBundle; issues: ImportIssue[] };

  switch (format) {
    case "json-bundle":
      adapterResult = parseJsonBundle(cleaned, limits);
      break;
    case "yaml-bundle":
      adapterResult = parseYamlBundle(cleaned, limits);
      break;
    case "csv-table":
      adapterResult = parseCsvProject(rawContent, limits);
      break;
    case "plcopen-xml":
      adapterResult = parsePlcopenXml(rawContent, limits);
      break;
    case "st-program":
      adapterResult = parseStructuredText(rawContent, limits);
      break;
    case "txt-spec":
      adapterResult = parseTxtSpecification(rawContent, limits);
      break;
    case "netlist":
      adapterResult = parseNetlistProject(cleaned, limits);
      break;
    default:
      // Tentar JSON primeiro como fallback com texto limpo
      try {
        adapterResult = parseJsonBundle(cleaned, limits);
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
            lineCount,
            payloadBytes,
            processingTimeMs: Math.round(performance.now() - startTime),
          },
          issues: [
            {
              id: "unsupported-format",
              severity: "critical",
              category: "schema",
              message:
                "Formato não reconhecido. Forneça um arquivo JSON Canvas Bundle, YAML, CSV, PLCopen XML, Structured Text (.st) ou especificação técnica em TXT.",
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
        lineCount,
        payloadBytes,
        processingTimeMs: Math.round(performance.now() - startTime),
      },
      issues,
    };
  }

  // Verificar limites de nós e edges configurados
  if (bundle.nodes.length > limits.maxNodes) {
    issues.push({
      id: "node-limit-exceeded",
      severity: "critical",
      category: "schema",
      message: `Quantidade de componentes (${bundle.nodes.length.toLocaleString()}) excede o limite configurado de ${limits.maxNodes.toLocaleString()} nós.`,
      rejected: true,
    });
  }

  if (bundle.edges.length > limits.maxEdges) {
    issues.push({
      id: "edge-limit-exceeded",
      severity: "critical",
      category: "connection",
      message: `Quantidade de conexões (${bundle.edges.length.toLocaleString()}) excede o limite configurado de ${limits.maxEdges.toLocaleString()} ligações.`,
      rejected: true,
    });
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
    isValid: adapterResult.success && criticalIssuesCount === 0,
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
      lineCount,
      payloadBytes,
      processingTimeMs: Math.round(performance.now() - startTime),
    },
    issues,
    bundle,
  };
}

/**
 * Constrói NodeParams canônico estritamente válido e conforme o DiagramNodeSchema (NBR 5410/Zod).
 * Garante que campos obrigatórios (ex.: in_A em breaker/contactor, power_kW em motor)
 * nunca sejam undefined, convertendo sinônimos (In -> in_A, P -> power_kW, U -> voltage_V).
 */
export function buildCanonicalDiagramParams(
  kind: NodeKind,
  rawProps: Record<string, any> = {},
): NodeParams {
  const tag = rawProps.tag ? String(rawProps.tag) : undefined;
  // Corrente nominal: aceita in_A, In, current_A ou nominalCurrentA
  const inRaw = rawProps.in_A ?? rawProps.In ?? rawProps.current_A ?? rawProps.nominalCurrentA;
  const in_A = Number(inRaw);
  // Potência nominal: aceita power_kW, P, kW ou powerKw
  const pRaw = rawProps.power_kW ?? rawProps.P ?? rawProps.kW ?? rawProps.powerKw;
  const power_kW = Number(pRaw);
  // Tensão nominal: aceita voltage_V, U, V ou voltageV
  const uRaw = rawProps.voltage_V ?? rawProps.U ?? rawProps.V ?? rawProps.voltageV;
  const voltage_V = Number(uRaw);

  switch (kind) {
    case "breaker": {
      const polesNum = Number(rawProps.poles);
      const poles = polesNum >= 1 && polesNum <= 4 ? polesNum : 3;
      const curveStr = String(rawProps.curve || "C").toUpperCase();
      const curve = ["B", "C", "D"].includes(curveStr) ? (curveStr as "B" | "C" | "D") : "C";
      return {
        kind: "breaker",
        tag,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 32,
        curve,
        poles,
        icc_kA: rawProps.icc_kA ? Number(rawProps.icc_kA) : undefined,
      };
    }
    case "contactor":
      return {
        kind: "contactor",
        tag,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 25,
        coil_V: Number(rawProps.coil_V) > 0 ? Number(rawProps.coil_V) : 24,
      };
    case "rcd": {
      const polesNum = Number(rawProps.poles);
      const poles = polesNum >= 2 && polesNum <= 4 ? polesNum : 4;
      return {
        kind: "rcd",
        tag,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 40,
        sensitivity_mA: Number(rawProps.sensitivity_mA) > 0 ? Number(rawProps.sensitivity_mA) : 30,
        poles,
      };
    }
    case "fuse":
      return {
        kind: "fuse",
        tag,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 32,
      };
    case "disconnector":
      return {
        kind: "disconnector",
        tag,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 63,
      };
    case "transformer": {
      const kvaRaw = rawProps.kVA ?? rawProps.apparentPowerKva ?? rawProps.P;
      const kVA = Number(kvaRaw);
      return {
        kind: "transformer",
        tag,
        kVA: Number.isFinite(kVA) && kVA > 0 ? kVA : 75,
        primary_V: Number(rawProps.primary_V ?? rawProps.primaryV ?? 13800),
        secondary_V: Number(rawProps.secondary_V ?? rawProps.secondaryV ?? (voltage_V > 0 ? voltage_V : 380)),
        vector: String(rawProps.vector || "Dyn11"),
      };
    }
    case "psu":
      return {
        kind: "psu",
        tag,
        output_V: Number(rawProps.output_V ?? rawProps.voltage_V ?? 24),
        output_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 10,
      };
    case "vfd":
      return {
        kind: "vfd",
        tag,
        power_kW: Number.isFinite(power_kW) && power_kW > 0 ? power_kW : 7.5,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
      };
    case "softstarter":
      return {
        kind: "softstarter",
        tag,
        power_kW: Number.isFinite(power_kW) && power_kW > 0 ? power_kW : 7.5,
      };
    case "busbar":
      return {
        kind: "busbar",
        tag,
        current_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 63,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
      };
    case "ccm":
      return {
        kind: "ccm",
        tag,
        columns: Number(rawProps.columns ?? 1),
        cells: Number(rawProps.cells ?? 4),
      };
    case "motor": {
      const sm = String(rawProps.startMethod || "DOL").toUpperCase();
      const startMethod = sm.includes("SOFT") ? "SOFT" : sm.includes("VFD") || sm.includes("INV") ? "VFD" : "DOL";
      return {
        kind: "motor",
        tag,
        power_kW: Number.isFinite(power_kW) && power_kW > 0 ? power_kW : 5.5,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
        fla_A: Number.isFinite(in_A) && in_A > 0 ? in_A : undefined,
        startMethod,
      };
    }
    case "load":
      return {
        kind: "load",
        tag,
        power_W: Number(rawProps.power_W ?? (power_kW > 0 ? power_kW * 1000 : 1000)),
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 220,
        fp: Number(rawProps.fp ?? 0.92),
      };
    case "lamp":
      return {
        kind: "lamp",
        tag,
        power_W: Number(rawProps.power_W ?? (power_kW > 0 ? power_kW * 1000 : 100)),
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 220,
      };
    case "socket":
      return {
        kind: "socket",
        tag,
        current_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 10,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 220,
      };
    case "pt100":
      return { kind: "pt100", tag, range_C: [-50, 200] };
    case "pressure":
      return { kind: "pressure", tag, range_bar: [0, 10] };
    case "flow":
      return { kind: "flow", tag, range: [0, 100] };
    case "level":
      return { kind: "level", tag, range_pct: [0, 100] };
    case "encoder":
      return { kind: "encoder", tag, ppr: Number(rawProps.ppr ?? 1024) };
    case "estop":
      return { kind: "estop", tag, category: "1" };
    case "lightcurtain":
      return { kind: "lightcurtain", tag, resolution_mm: 14 };
    case "ground":
      return { kind: "ground", tag };
    case "neutral":
      return { kind: "neutral", tag };
    case "terminal":
      return { kind: "terminal", tag };
    case "relay":
      return {
        kind: "relay",
        tag,
        coil_V: Number(rawProps.coil_V) > 0 ? Number(rawProps.coil_V) : 24,
        contacts: Number(rawProps.contacts) > 0 ? Number(rawProps.contacts) : 2,
      };
    default:
      return {
        kind: "load",
        tag,
        power_W: 1000,
        voltage_V: 220,
        fp: 0.92,
      };
  }
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

    const canonicalParams = buildCanonicalDiagramParams(kind, n.properties ?? {});

    const newNode = makeNode({
      sheet: "unifilar",
      params: canonicalParams,
      position: {
        x: n.position.x + offsetX,
        y: n.position.y + offsetY,
      },
      id: finalId,
      label: n.label || (n.properties?.tag ? String(n.properties?.tag) : finalId),
      rotation: n.rotation || 0,
    });
    (newNode as any).kind = kind;
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
  const rawRungs: LadderRung[] = bundle.ladder.rungs.map((r, idx) => {
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
      id: r.id || `rung_${idx}`,
      label: r.comment || r.id || `Rung ${idx + 1}`,
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
  return normalizeLadderRungs(rawRungs);
}
