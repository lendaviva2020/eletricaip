// JSON Adapter for ElétricAi Canvas Bundle
// Supports both strict EletricAiCanvasBundle and forgiving LLM-generated JSON shapes.
// 100% deterministic, no AI credits consumed.

import {
  EletricAiCanvasBundleSchema,
  resolveComponentKind,
} from "../bundle-schema";
import {
  scanObjectForSecurityViolations,
  validatePayloadSize,
} from "../security-validator";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type EletricAiCanvasBundle,
  type ImportIssue,
} from "../types";

export interface JsonAdapterResult {
  success: boolean;
  bundle?: EletricAiCanvasBundle;
  issues: ImportIssue[];
}

export function parseJsonBundle(rawText: string): JsonAdapterResult {
  const issues: ImportIssue[] = [];

  // 1. Limite de tamanho de carga útil
  const sizeCheck = validatePayloadSize(rawText);
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

  // 2. Parse JSON (com suporte a remoção de markdown fences ```json ... ```)
  const cleaned = rawText
    .trim()
    .replace(/^```[a-zA-Z0-9_\-]*\s*\r?\n?/, "")
    .replace(/\r?\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return {
      success: false,
      issues: [
        {
          id: "parse-json-syntax",
          severity: "critical",
          category: "schema",
          message: `Sintaxe JSON inválida: ${err.message}`,
          rejected: true,
        },
      ],
    };
  }

  // 3. Verificação Zero Trust de Segurança (Prototype Pollution, XSS, etc.)
  const secCheck = scanObjectForSecurityViolations(parsed);
  if (!secCheck.isSafe) {
    return {
      success: false,
      issues: secCheck.violations.map((v, i) => ({
        id: `sec-violation-${i}`,
        severity: "critical",
        category: "security",
        message: v,
        rejected: true,
      })),
    };
  }

  // 4. Normalização para o contrato ElétricAi Canvas Bundle
  const rawObj = parsed as Record<string, any>;
  const format = rawObj.format || CANVAS_BUNDLE_FORMAT;
  const schemaVersion = rawObj.schemaVersion || CURRENT_BUNDLE_VERSION;

  const projectMeta = {
    name: String(rawObj.project?.name || rawObj.name || "Projeto Importado de IA Externa"),
    diagramType: rawObj.project?.diagramType || rawObj.diagramType || "unifilar",
    units: rawObj.project?.units || "metric",
    description: rawObj.project?.description || rawObj.description || "",
    standards: Array.isArray(rawObj.project?.standards) ? rawObj.project.standards : ["NBR_5410", "NR-10", "NR-12"],
    systemVoltageV: Number(rawObj.project?.systemVoltageV || rawObj.voltage_V || 380),
    frequencyHz: rawObj.project?.frequencyHz === 50 ? 50 : 60,
  };

  // Normalizar nós
  const rawNodes = Array.isArray(rawObj.nodes) ? rawObj.nodes : [];
  const normalizedNodes: any[] = [];
  const seenNodeIds = new Set<string>();

  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i];
    if (!n || typeof n !== "object") continue;

    const rawId = String(n.id || `node_${i + 1}`).trim();
    if (seenNodeIds.has(rawId)) {
      issues.push({
        id: `dup-id-${rawId}`,
        severity: "warning",
        category: "schema",
        entityId: rawId,
        message: `ID de nó duplicado "${rawId}". O ID foi renomeado para "${rawId}_${i}".`,
      });
    }
    const cleanId = seenNodeIds.has(rawId) ? `${rawId}_${i}` : rawId;
    seenNodeIds.add(cleanId);

    const resolvedKind = resolveComponentKind(n.type || n.kind);
    if (!resolvedKind) {
      issues.push({
        id: `unsupported-kind-${cleanId}`,
        severity: "warning",
        category: "component",
        entityId: cleanId,
        message: `Tipo de componente "${n.type || n.kind}" não reconhecido. Mapeado para carga genérica "load".`,
      });
    }

    const posX = Number.isFinite(n.position?.x) ? Number(n.position.x) : 100 + (i % 5) * 160;
    const posY = Number.isFinite(n.position?.y) ? Number(n.position.y) : 100 + Math.floor(i / 5) * 160;

    normalizedNodes.push({
      id: cleanId,
      type: resolvedKind || "load",
      label: String(n.label || n.properties?.tag || n.tag || cleanId),
      position: { x: posX, y: posY },
      rotation: Number.isFinite(n.rotation) ? Number(n.rotation) : 0,
      properties: n.properties && typeof n.properties === "object" ? n.properties : {},
    });
  }

  // Normalizar edges
  const rawEdges = Array.isArray(rawObj.edges) ? rawObj.edges : [];
  const normalizedEdges: any[] = [];
  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i];
    if (!e || typeof e !== "object") continue;

    const src = String(e.source || e.from || "").trim();
    const tgt = String(e.target || e.to || "").trim();

    if (!src || !tgt) {
      issues.push({
        id: `invalid-edge-${i}`,
        severity: "warning",
        category: "connection",
        message: `Ligação ${i + 1} ignorada: origem ou destino ausente.`,
        rejected: true,
      });
      continue;
    }

    if (!seenNodeIds.has(src) || !seenNodeIds.has(tgt)) {
      issues.push({
        id: `orphan-edge-${i}`,
        severity: "warning",
        category: "connection",
        message: `Ligação conecta nó inexistente ("${src}" → "${tgt}"). Descartada para preservar integridade.`,
        rejected: true,
      });
      continue;
    }

    normalizedEdges.push({
      id: e.id ? String(e.id) : `edge_${i + 1}`,
      source: src,
      target: tgt,
      fromTerminal: e.fromTerminal ? String(e.fromTerminal) : undefined,
      toTerminal: e.toTerminal ? String(e.toTerminal) : undefined,
      kind: ["power", "signal", "pipe", "ground"].includes(e.kind) ? e.kind : "power",
      circuitConfig: e.circuitConfig,
    });
  }

  // Montar objeto candidato
  const candidateBundle = {
    format,
    schemaVersion,
    project: projectMeta,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    ladder: rawObj.ladder,
    plc: rawObj.plc,
    tags: Array.isArray(rawObj.tags) ? rawObj.tags : undefined,
    metadata: rawObj.metadata,
  };

  // Validar com Zod Schema
  const parseResult = EletricAiCanvasBundleSchema.safeParse(candidateBundle);
  if (!parseResult.success) {
    const zodErrors = parseResult.error.issues.map((err) => ({
      id: `zod-${err.path.join(".")}`,
      severity: "critical" as const,
      category: "schema" as const,
      message: `Erro no campo "${err.path.join(".")}": ${err.message}`,
      rejected: true,
    }));
    return {
      success: false,
      issues: [...issues, ...zodErrors],
    };
  }

  return {
    success: true,
    bundle: parseResult.data as EletricAiCanvasBundle,
    issues,
  };
}
