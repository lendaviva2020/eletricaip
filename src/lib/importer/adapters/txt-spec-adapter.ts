// Plain Text / Markdown Technical Specification Adapter for ElétricAi Canvas
// Parses structured engineering specifications, bullet lists, and Markdown tables.
// Zero Trust, 100% deterministic, 0 AI credits.

import { resolveComponentKind } from "../bundle-schema";
import { validatePayloadSize, scanPayloadSecurity } from "../security-validator";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleEdge,
  type BundleNode,
  type EletricAiCanvasBundle,
  type ImportIssue,
  type ImporterLimits,
} from "../types";

export interface TxtSpecAdapterResult {
  success: boolean;
  bundle?: EletricAiCanvasBundle;
  issues: ImportIssue[];
}

export function parseTxtSpecification(
  rawText: string,
  customLimits?: Partial<ImporterLimits>,
): TxtSpecAdapterResult {
  const issues: ImportIssue[] = [];

  // 1. Limites de tamanho e linhas
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

  // 2. Verificação de segurança
  const secCheck = scanPayloadSecurity(rawText, customLimits);
  if (!secCheck.isSafe) {
    return {
      success: false,
      issues: secCheck.violations.map((v, idx) => ({
        id: `sec-txt-${idx}`,
        severity: "critical",
        category: "security",
        message: v,
        rejected: true,
      })),
    };
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim());

  let projectName = "Projeto Especificado em TXT";
  let systemVoltageV = 380;
  let frequencyHz: 50 | 60 = 60;
  const standards: string[] = ["NBR_5410"];

  const nodes: BundleNode[] = [];
  const edges: BundleEdge[] = [];
  const existingNodeIds = new Set<string>();

  // Detectar se é uma tabela Markdown (linhas contendo '|')
  const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (tableLines.length >= 2) {
    // Processar tabela Markdown
    const headerCols = tableLines[0]
      .split("|")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    // Identificar índices das colunas
    const tagIdx = headerCols.findIndex((c) => c.includes("tag") || c.includes("id") || c.includes("identificador") || c.includes("nome"));
    const typeIdx = headerCols.findIndex((c) => c.includes("tipo") || c.includes("kind") || c.includes("componente"));
    const powerIdx = headerCols.findIndex((c) => c.includes("pot") || c.includes("kw") || c.includes("kva") || c.includes("power"));
    const voltIdx = headerCols.findIndex((c) => c.includes("tens") || c.includes("volt") || c.includes("v"));
    const currIdx = headerCols.findIndex((c) => c.includes("corr") || c.includes("amper") || c.includes("in"));
    const feederIdx = headerCols.findIndex((c) => c.includes("aliment") || c.includes("origem") || c.includes("fonte") || c.includes("painel"));

    // Pular linha 0 (header) e linha 1 (divisor |---|---|)
    for (let i = 1; i < tableLines.length; i++) {
      const line = tableLines[i];
      if (/^[|\s:-]+$/.test(line)) continue; // linha divisória

      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length);

      if (cols.length === 0) continue;

      const tag = tagIdx >= 0 && cols[tagIdx] ? cols[tagIdx] : `COMP_${nodes.length + 1}`;
      const rawType = typeIdx >= 0 && cols[typeIdx] ? cols[typeIdx] : "load";
      const resolvedKind = resolveComponentKind(rawType) || "load";

      const props: Record<string, any> = { tag };
      if (powerIdx >= 0 && cols[powerIdx]) {
        const pNum = parseFloat(cols[powerIdx].replace(/[^\d.]/g, ""));
        if (!isNaN(pNum)) props.power_kW = pNum;
      }
      if (voltIdx >= 0 && cols[voltIdx]) {
        const vNum = parseFloat(cols[voltIdx].replace(/[^\d.]/g, ""));
        if (!isNaN(vNum)) props.voltage_V = vNum;
      }
      if (currIdx >= 0 && cols[currIdx]) {
        const cNum = parseFloat(cols[currIdx].replace(/[^\d.]/g, ""));
        if (!isNaN(cNum)) props.in_A = cNum;
      }

      const x = 100 + (nodes.length % 6) * 160;
      const y = 100 + Math.floor(nodes.length / 6) * 140;

      nodes.push({
        id: tag,
        type: resolvedKind,
        label: tag,
        position: { x, y },
        properties: props,
      });
      existingNodeIds.add(tag);

      if (feederIdx >= 0 && cols[feederIdx]) {
        const feederTag = cols[feederIdx].trim();
        if (feederTag && feederTag !== "-" && feederTag.toLowerCase() !== "n/a") {
          edges.push({
            id: `edge_${feederTag}_${tag}`,
            source: feederTag,
            target: tag,
            kind: "power",
          });
        }
      }
    }
  } else {
    // Processar formato Bloco / Chave-Valor / Linhas com marcadores
    let currentSection: "meta" | "components" | "connections" = "meta";

    for (const line of lines) {
      if (!line || line.startsWith("#")) {
        // Título de cabeçalho Markdown
        if (line.startsWith("# ")) {
          projectName = line.replace(/^#+\s*/, "").trim();
        }
        continue;
      }

      // Detecção de cabeçalhos de seção
      if (/^(PROJETO|PROJECT):\s*(.*)/i.test(line)) {
        const match = line.match(/^(?:PROJETO|PROJECT):\s*(.*)/i);
        if (match && match[1]) projectName = match[1].trim();
        continue;
      }
      if (/^(TENSAO|VOLTAGE):\s*(\d+)/i.test(line)) {
        const match = line.match(/^(?:TENSAO|VOLTAGE):\s*(\d+)/i);
        if (match && match[1]) systemVoltageV = parseInt(match[1], 10);
        continue;
      }
      if (/^(NORMA|STANDARDS?):\s*(.*)/i.test(line)) {
        const match = line.match(/^(?:NORMA|STANDARDS?):\s*(.*)/i);
        if (match && match[1]) standards.push(match[1].trim());
        continue;
      }
      if (/^(COMPONENTES|CARGAS|EQUIPAMENTOS|NODES):/i.test(line)) {
        currentSection = "components";
        continue;
      }
      if (/^(LIGACOES|CONEXOES|CIRCUITOS|EDGES):/i.test(line)) {
        currentSection = "connections";
        continue;
      }

      // Conexões: "SRC -> TGT" ou "- SRC -> TGT"
      const connMatch = line.match(/^[-*]?\s*([a-zA-Z0-9_]+)\s*(?:->|PARA|TO)\s*([a-zA-Z0-9_]+)(?:\s*\((power|signal|pipe)\))?/i);
      if (connMatch) {
        const src = connMatch[1];
        const tgt = connMatch[2];
        const kind = (connMatch[3]?.toLowerCase() as "power" | "signal" | "pipe") || "power";

        edges.push({
          id: `edge_${src}_${tgt}`,
          source: src,
          target: tgt,
          kind,
        });
        continue;
      }

      // Componentes: "- Q1: disjuntor | In=100A | polos=3" ou "- M1: motor 15kW"
      if (line.startsWith("-") || line.startsWith("*") || currentSection === "components") {
        const cleanItem = line.replace(/^[-*]\s*/, "");
        const colonIdx = cleanItem.indexOf(":");

        let tag = "";
        let remainder = cleanItem;

        if (colonIdx > 0 && colonIdx < 30) {
          tag = cleanItem.substring(0, colonIdx).trim();
          remainder = cleanItem.substring(colonIdx + 1).trim();
        } else {
          const parts = cleanItem.split(/\s+/);
          tag = parts[0] || `COMP_${nodes.length + 1}`;
          remainder = parts.slice(1).join(" ");
        }

        // Dividir propriedades por '|' ou vírgula
        const propParts = remainder.split(/[|,;]/).map((p) => p.trim()).filter(Boolean);
        const rawKind = propParts[0] || remainder;
        const resolvedKind = resolveComponentKind(rawKind) || "load";

        const props: Record<string, any> = { tag };

        for (const p of propParts) {
          const pLower = p.toLowerCase();
          // Detectar potência (ex: 15kW, 75kVA, power=15)
          const pMatch = pLower.match(/(\d+(?:\.\d+)?)\s*(kw|kva|cv|hp)/i);
          if (pMatch) {
            let kw = parseFloat(pMatch[1]);
            const unit = pMatch[2].toLowerCase();
            if (unit === "cv" || unit === "hp") kw = kw * 0.7355;
            props.power_kW = parseFloat(kw.toFixed(2));
          }

          // Detectar corrente (ex: 63A, In=63A)
          const inMatch = pLower.match(/(?:in\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*a\b/i);
          if (inMatch) {
            props.in_A = parseFloat(inMatch[1]);
          }

          // Detectar tensão (ex: 380V, 220V, 13.8kV)
          const vMatch = pLower.match(/(?:tensao|v\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*(v|kv)\b/i);
          if (vMatch) {
            let v = parseFloat(vMatch[1]);
            if (vMatch[2].toLowerCase() === "kv") v = v * 1000;
            props.voltage_V = v;
          }

          // Detectar polos (ex: polos=3, 3P, trifasico)
          if (pLower.includes("3p") || pLower.includes("trifas")) props.poles = 3;
          else if (pLower.includes("2p") || pLower.includes("bifas")) props.poles = 2;
          else if (pLower.includes("1p") || pLower.includes("monofas")) props.poles = 1;
        }

        if (tag && !existingNodeIds.has(tag)) {
          const x = 100 + (nodes.length % 6) * 160;
          const y = 100 + Math.floor(nodes.length / 6) * 140;

          nodes.push({
            id: tag,
            type: resolvedKind,
            label: tag,
            position: { x, y },
            properties: props,
          });
          existingNodeIds.add(tag);
        }
      }
    }
  }

  // Garantir que os nós das conexões existam
  for (const e of edges) {
    if (!existingNodeIds.has(e.source)) {
      const x = 100 + (nodes.length % 6) * 160;
      const y = 100 + Math.floor(nodes.length / 6) * 140;
      nodes.push({
        id: e.source,
        type: resolveComponentKind(e.source) || "busbar",
        label: e.source,
        position: { x, y },
      });
      existingNodeIds.add(e.source);
    }
    if (!existingNodeIds.has(e.target)) {
      const x = 100 + (nodes.length % 6) * 160;
      const y = 100 + Math.floor(nodes.length / 6) * 140;
      nodes.push({
        id: e.target,
        type: resolveComponentKind(e.target) || "load",
        label: e.target,
        position: { x, y },
      });
      existingNodeIds.add(e.target);
    }
  }

  if (nodes.length === 0) {
    return {
      success: false,
      issues: [
        {
          id: "txt-no-nodes",
          severity: "critical",
          category: "schema",
          message: "Nenhum componente ou especificação elétrica reconhecida no texto fornecido.",
          rejected: true,
        },
      ],
    };
  }

  const bundle: EletricAiCanvasBundle = {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    project: {
      name: projectName,
      diagramType: "unifilar",
      standards,
      systemVoltageV,
      frequencyHz,
      description: `Importado de especificação técnica TXT (${nodes.length} nós, ${edges.length} conexões)`,
    },
    nodes,
    edges,
    metadata: {
      author: "ElétricAi TXT Spec Adapter",
      generator: "txt-spec-adapter",
      generatedAt: new Date().toISOString(),
    },
  };

  return {
    success: true,
    bundle,
    issues,
  };
}
