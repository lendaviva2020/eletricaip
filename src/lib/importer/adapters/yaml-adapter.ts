// Safe YAML Adapter for ElétricAi Canvas Bundle
// Prohibits custom tags, constructors, functions, or execution.
// Converts safe YAML structures to the Canvas Bundle format.

import { parseJsonBundle, type JsonAdapterResult } from "./json-adapter";
import { validatePayloadSize } from "../security-validator";
import type { ImportIssue, ImporterLimits } from "../types";

const FORBIDDEN_YAML_KEYS = new Set(["__proto__", "constructor", "prototype", "<<"]);

/**
 * Parser determinístico e seguro para subconjunto de YAML (chave: valor, listas '-', indentação).
 * Não suporta tags customizadas (!<tag>), proíbe âncoras/aliases (&anchor, *alias — CVE-2026-84375),
 * referências circulares, Prototype Pollution e execução.
 */
export function safeParseYaml(yamlText: string): unknown {
  // 1. Proibir tags personalizadas ou executáveis do YAML
  if (/!\w+/g.test(yamlText)) {
    throw new Error(
      "Tags customizadas do YAML (!tag) são estritamente proibidas por motivos de segurança.",
    );
  }

  // 2. Proibir âncoras (&anchor), aliases (*alias) e merge keys (<<:) — proteção contra Billion Laughs / DoS (CVE-2026-84375)
  if (/(?:^|\s)[&*][a-zA-Z0-9_-]+/m.test(yamlText) || /(?:^|\s)<<\s*:/m.test(yamlText)) {
    throw new Error(
      "Âncoras, aliases (&/*) e merge keys (<<:) do YAML são proibidos (proteção contra DoS / Billion Laughs).",
    );
  }

  const lines = yamlText.split(/\r?\n/);
  const root: Record<string, any> = {};
  const stack: { indent: number; obj: any; key?: string }[] = [{ indent: -1, obj: root }];

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    // Remove comentários inline
    const lineWithoutComment = rawLine.replace(/#.*$/, "");
    if (!lineWithoutComment.trim()) continue;

    const indent = rawLine.search(/\S/);
    const content = lineWithoutComment.trim();

    // Volta no stack até encontrar o nível de indentação pai
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length > 20) {
      throw new Error("Profundidade máxima de aninhamento YAML excedida (limite: 20 níveis).");
    }
    const currentParent = stack[stack.length - 1].obj;

    // Item de lista: "- valor" ou "- chave: valor"
    if (content.startsWith("-")) {
      const itemContent = content.substring(1).trim();
      if (!Array.isArray(currentParent)) {
        // Se o pai não for array, pode ser um array pendente na chave anterior
        continue;
      }

      if (itemContent.includes(":")) {
        const objItem: Record<string, any> = {};
        currentParent.push(objItem);
        stack.push({ indent, obj: objItem });

        const [k, ...vParts] = itemContent.split(":");
        const kClean = k.trim();
        if (FORBIDDEN_YAML_KEYS.has(kClean.toLowerCase())) {
          throw new Error(
            `Propriedade proibida detectada no YAML ("${kClean}") — proteção contra Prototype Pollution.`,
          );
        }
        const vClean = vParts.join(":").trim();
        if (vClean) {
          objItem[kClean] = parseYamlScalar(vClean);
        }
      } else if (itemContent) {
        currentParent.push(parseYamlScalar(itemContent));
      } else {
        const nested: any = [];
        currentParent.push(nested);
        stack.push({ indent, obj: nested });
      }
      continue;
    }

    // Chave: valor
    const colonIdx = content.indexOf(":");
    if (colonIdx > 0) {
      const key = content.substring(0, colonIdx).trim();
      if (FORBIDDEN_YAML_KEYS.has(key.toLowerCase())) {
        throw new Error(
          `Propriedade proibida detectada no YAML ("${key}") — proteção contra Prototype Pollution.`,
        );
      }
      const valStr = content.substring(colonIdx + 1).trim();

      if (valStr) {
        currentParent[key] = parseYamlScalar(valStr);
      } else {
        // Objeto ou lista aninhada na próxima linha
        const nextLine = lines[idx + 1] ? lines[idx + 1].trim() : "";
        const isNextList = nextLine.startsWith("-");
        const nextContainer = isNextList ? [] : {};
        currentParent[key] = nextContainer;
        stack.push({ indent, obj: nextContainer, key });
      }
    }
  }

  return root;
}

function parseYamlScalar(val: string): any {
  const v = val.trim();
  if (v === "true" || v === "True") return true;
  if (v === "false" || v === "False") return false;
  if (v === "null" || v === "~") return null;

  // Aspas simples ou duplas
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.substring(1, v.length - 1);
  }

  // Número
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    return parseFloat(v);
  }

  return v;
}

export function parseYamlBundle(
  rawYaml: string,
  customLimits?: Partial<ImporterLimits>,
): JsonAdapterResult {
  const sizeCheck = validatePayloadSize(rawYaml, customLimits);
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

  try {
    const cleaned = rawYaml
      .trim()
      .replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, "")
      .replace(/\r?\n?```\s*$/, "")
      .trim();
    const parsedObj = safeParseYaml(cleaned);
    return parseJsonBundle(JSON.stringify(parsedObj), customLimits);
  } catch (err: any) {
    return {
      success: false,
      issues: [
        {
          id: "parse-yaml-error",
          severity: "critical",
          category: "schema",
          message: `Falha ao processar YAML seguro: ${err.message}`,
          rejected: true,
        },
      ],
    };
  }
}
