// CSV Tabular Adapter for ElétricAi Canvas Bundle
// Imports component lists, I/O maps, and cable tables using PapaParse.
// Synthesizes a valid, structured Canvas Bundle with clean coordinates.

import Papa from "papaparse";
import { resolveComponentKind } from "../bundle-schema";
import { validatePayloadSize } from "../security-validator";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleNode,
  type BundleTag,
  type EletricAiCanvasBundle,
  type ImportIssue,
  type ImporterLimits,
} from "../types";

export interface CsvAdapterResult {
  success: boolean;
  bundle?: EletricAiCanvasBundle;
  issues: ImportIssue[];
}

export function parseCsvProject(
  rawCsv: string,
  customLimits?: Partial<ImporterLimits>,
): CsvAdapterResult {
  const issues: ImportIssue[] = [];

  const sizeCheck = validatePayloadSize(rawCsv, customLimits);
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

  const parsed = Papa.parse<Record<string, string>>(rawCsv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors.slice(0, 5)) {
      issues.push({
        id: `csv-err-${err.row ?? 0}`,
        severity: "warning",
        category: "schema",
        message: `Linha ${err.row ?? 0}: ${err.message}`,
      });
    }
  }

  const rows = parsed.data;
  if (!rows || rows.length === 0) {
    return {
      success: false,
      issues: [
        {
          id: "csv-empty",
          severity: "critical",
          category: "schema",
          message: "O arquivo CSV está vazio ou não possui cabeçalhos válidos.",
          rejected: true,
        },
      ],
    };
  }

  const nodes: BundleNode[] = [];
  const tags: BundleTag[] = [];
  let colIndex = 0;
  let rowIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Localizar campos com suporte a diferentes grafias em PT-BR e EN
    const tag = r.Tag || r.tag || r.TAG || r.Identificador || r.Codigo || `ITEM_${i + 1}`;
    const rawKind = r.Tipo || r.tipo || r.Kind || r.kind || r.Categoria || r.Descricao || "load";
    const label = r.Descricao || r.descricao || r.Description || r.label || tag;
    const powerStr = r.Potencia || r.potencia || r.power_kW || r.P || r.kW;
    const voltStr = r.Tensao || r.tensao || r.voltage_V || r.U || r.V;
    const currStr = r.Corrente || r.corrente || r.in_A || r.In || r.A;
    const addr = r.Endereco || r.endereco || r.Address || r.address;

    const kind = resolveComponentKind(rawKind) || "load";
    const x = 120 + colIndex * 180;
    const y = 100 + rowIndex * 160;

    colIndex++;
    if (colIndex >= 5) {
      colIndex = 0;
      rowIndex++;
    }

    const properties: Record<string, string | number | boolean> = {
      tag,
    };
    if (powerStr) properties.power_kW = parseFloat(powerStr) || 0;
    if (voltStr) properties.voltage_V = parseFloat(voltStr) || 380;
    if (currStr) properties.in_A = parseFloat(currStr) || 0;

    nodes.push({
      id: tag.replace(/[^a-zA-Z0-9_\-\.]/g, "_"),
      type: kind,
      label,
      position: { x, y },
      properties,
    });

    if (addr && addr.startsWith("%")) {
      tags.push({
        name: tag,
        type: addr.startsWith("%I") || addr.startsWith("%Q") ? "BOOL" : "INT",
        address: addr,
        description: label,
      });
    }
  }

  const bundle: EletricAiCanvasBundle = {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    project: {
      name: "Tabela CSV Importada",
      diagramType: "unifilar",
      units: "metric",
      description: `Importação de tabela CSV contendo ${nodes.length} itens.`,
      standards: ["NBR_5410", "NR-10"],
      systemVoltageV: 380,
      frequencyHz: 60,
    },
    nodes,
    edges: [],
    tags: tags.length > 0 ? tags : undefined,
  };

  return {
    success: true,
    bundle,
    issues,
  };
}
