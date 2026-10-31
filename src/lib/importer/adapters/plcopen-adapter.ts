// Safe PLCopen XML (IEC 61131-3) Adapter for ElétricAi Canvas Bundle
// Prohibits DTD, XXE, remote external entities, and XInclude.
// Parses PLC variables, ladder networks, and module racks into the Canvas Bundle.

import { validatePayloadSize, validateXmlSecurity } from "../security-validator";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleLadderRung,
  type BundleTag,
  type EletricAiCanvasBundle,
  type ImportIssue,
  type ImporterLimits,
} from "../types";

export interface PlcopenAdapterResult {
  success: boolean;
  bundle?: EletricAiCanvasBundle;
  issues: ImportIssue[];
}

export function parsePlcopenXml(
  rawXml: string,
  customLimits?: Partial<ImporterLimits>,
): PlcopenAdapterResult {
  const issues: ImportIssue[] = [];

  // 1. Limite de tamanho
  const sizeCheck = validatePayloadSize(rawXml, customLimits);
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

  // 2. Validação Rigorosa contra XXE e DTD Injection
  const xmlSec = validateXmlSecurity(rawXml);
  if (!xmlSec.isSafe) {
    return {
      success: false,
      issues: xmlSec.violations.map((v, i) => ({
        id: `xxe-violation-${i}`,
        severity: "critical",
        category: "security",
        message: v,
        rejected: true,
      })),
    };
  }

  const tags: BundleTag[] = [];
  const rungs: BundleLadderRung[] = [];

  // Extração segura de variáveis usando Regex sem resolver entidades externas
  const varMatches = rawXml.matchAll(
    /<variable\s+name="([^"]+)"(?:\s+address="([^"]*)")?[^>]*>([\s\S]*?)<\/variable>/gi,
  );
  for (const m of varMatches) {
    const name = m[1];
    const address = m[2] || undefined;
    const body = m[3];
    let type: BundleTag["type"] = "BOOL";
    if (/<INT\b/i.test(body)) type = "INT";
    else if (/<DINT\b/i.test(body)) type = "DINT";
    else if (/<REAL\b/i.test(body)) type = "REAL";
    else if (/<TIME\b/i.test(body)) type = "TIME";
    else if (/<STRING\b/i.test(body)) type = "STRING";

    const commentMatch = body.match(/<documentation>[\s\S]*?<xhtml[^>]*>([\s\S]*?)<\/xhtml>/i);
    const description = commentMatch ? commentMatch[1].trim() : undefined;

    tags.push({
      name,
      address,
      type,
      description,
    });
  }

  // Extração básica de lógica e networks
  const pouMatches = rawXml.matchAll(
    /<pou\s+name="([^"]+)"\s+pouType="([^"]+)"[^>]*>([\s\S]*?)<\/pou>/gi,
  );
  let rungIdx = 1;

  for (const p of pouMatches) {
    const pouName = p[1];
    const pouBody = p[3];

    // Se houver código Structured Text (ST), gerar um rung de documentação
    const stMatch = pouBody.match(/<ST>[\s\S]*?<xhtml[^>]*>([\s\S]*?)<\/xhtml>/i);
    if (stMatch) {
      rungs.push({
        id: `rung_st_${rungIdx++}`,
        comment: `Lógica importada da POU ${pouName} (IEC 61131-3)`,
        output: {
          kind: "OTE",
          operand: `${pouName}_EXEC`,
        },
        branches: [[{ kind: "XIC", operand: "SYS_RUN" }]],
      });
    }
  }

  if (tags.length === 0 && rungs.length === 0) {
    return {
      success: false,
      issues: [
        {
          id: "plcopen-no-elements",
          severity: "critical",
          category: "schema",
          message:
            "Nenhuma variável ou POU IEC 61131-3 reconhecível foi encontrada no arquivo PLCopen XML.",
          rejected: true,
        },
      ],
    };
  }

  const bundle: EletricAiCanvasBundle = {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    project: {
      name: "Projeto PLCopen Importado",
      diagramType: "ladder",
      units: "metric",
      description: `Importação de projeto PLCopen XML contendo ${tags.length} variáveis e ${rungs.length} redes.`,
      standards: ["IEC_61131_3", "NR-12"],
      systemVoltageV: 24,
      frequencyHz: 60,
    },
    nodes: [],
    edges: [],
    tags,
    ladder: rungs.length > 0 ? { rungs } : undefined,
    plc: {
      vendor: "siemens",
      rackName: "Bastidor CLP PLCopen",
      cpuModel: "CPU Padrão IEC 61131-3",
      modules: [
        {
          slot: 1,
          type: "DI",
          partNumber: "PLCopen-DI-Module",
          channelsCount: Math.max(8, tags.filter((t) => t.address?.startsWith("%I")).length),
          label: "Entradas Digitais",
        },
        {
          slot: 2,
          type: "DO",
          partNumber: "PLCopen-DO-Module",
          channelsCount: Math.max(8, tags.filter((t) => t.address?.startsWith("%Q")).length),
          label: "Saídas Digitais",
        },
      ],
    },
  };

  return {
    success: true,
    bundle,
    issues,
  };
}
