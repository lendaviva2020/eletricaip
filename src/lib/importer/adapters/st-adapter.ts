// Safe Structured Text (IEC 61131-3 ST / Siemens SCL) Adapter for ElétricAi Canvas
// Extracts variables, hardware I/O mapping, and boolean interlocks into Ladder Rungs & Tags.
// Zero Trust, 100% deterministic AST/regex parser, NEVER executes code in browser or Node.

import { validatePayloadSize, scanPayloadSecurity } from "../security-validator";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleEdge,
  type BundleLadderContact,
  type BundleLadderRung,
  type BundleNode,
  type BundlePlcConfig,
  type BundleTag,
  type EletricAiCanvasBundle,
  type ImportIssue,
  type ImporterLimits,
} from "../types";

export interface StAdapterResult {
  success: boolean;
  bundle?: EletricAiCanvasBundle;
  issues: ImportIssue[];
}

/**
 * Remove comentários de bloco (* ... *) e comentários de linha // ...
 */
function stripStComments(text: string): string {
  // Remove comentários de bloco (* ... *)
  let clean = text.replace(/\(\*[\s\S]*?\*\)/g, "");
  // Remove comentários de linha // ...
  clean = clean.replace(/\/\/.*$/gm, "");
  return clean;
}

export function parseStructuredText(
  rawSt: string,
  customLimits?: Partial<ImporterLimits>,
): StAdapterResult {
  const issues: ImportIssue[] = [];

  // 1. Verificação de tamanho e limites
  const sizeCheck = validatePayloadSize(rawSt, customLimits);
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

  // 2. Verificação de segurança (proibir scripts, tags html, prototype pollution)
  const secCheck = scanPayloadSecurity(rawSt, customLimits);
  if (!secCheck.isSafe) {
    return {
      success: false,
      issues: secCheck.violations.map((v, idx) => ({
        id: `sec-st-${idx}`,
        severity: "critical",
        category: "security",
        message: v,
        rejected: true,
      })),
    };
  }

  const cleanCode = stripStComments(rawSt);

  // 3. Extrair nome do Programa ou Bloco de Função
  const programMatch = cleanCode.match(/\b(PROGRAM|FUNCTION_BLOCK)\s+([a-zA-Z0-9_]+)/i);
  const projectName = programMatch ? programMatch[2] : "Programa ST Importado";

  const tags: BundleTag[] = [];
  const nodes: BundleNode[] = [];
  const edges: BundleEdge[] = [];
  const rungs: BundleLadderRung[] = [];

  let diCount = 0;
  let doCount = 0;
  let aiCount = 0;
  let aoCount = 0;

  // 4. Extração de variáveis em blocos VAR, VAR_INPUT, VAR_OUTPUT, VAR_GLOBAL
  const varBlockRegex =
    /\b(VAR|VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_GLOBAL)\b([\s\S]*?)\bEND_VAR\b/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = varBlockRegex.exec(cleanCode)) !== null) {
    const blockContent = blockMatch[2];
    const declLines = blockContent.split(";");

    for (const rawDecl of declLines) {
      const decl = rawDecl.trim();
      if (!decl) continue;

      // Exemplo: TagName AT %IX0.0 : BOOL := FALSE;
      // ou: Speed_RPM : REAL := 1750.0;
      const declMatch = decl.match(
        /^([a-zA-Z0-9_]+)\s*(?:AT\s+(%[IQM][XBWDL0-9.]+))?\s*:\s*([a-zA-Z0-9_]+)(?:\s*:=\s*([^;]+))?/i,
      );

      if (declMatch) {
        const name = declMatch[1];
        const address = declMatch[2]?.toUpperCase();
        const rawType = declMatch[3].toUpperCase();
        const initValRaw = declMatch[4]?.trim();

        let type: BundleTag["type"] = "BOOL";
        if (rawType.includes("INT")) type = "INT";
        else if (rawType.includes("REAL")) type = "REAL";
        else if (rawType.includes("TIME")) type = "TIME";
        else if (rawType.includes("STRING")) type = "STRING";

        let initialValue: boolean | number | string | undefined;
        if (initValRaw !== undefined) {
          if (initValRaw.toUpperCase() === "TRUE") initialValue = true;
          else if (initValRaw.toUpperCase() === "FALSE") initialValue = false;
          else if (!isNaN(Number(initValRaw))) initialValue = Number(initValRaw);
          else initialValue = initValRaw.replace(/^['"]|['"]$/g, "");
        }

        tags.push({
          name,
          type,
          address,
          initialValue,
          description: address ? `Endereço I/O ${address}` : undefined,
        });

        // Contabilizar contagens de I/O para PLC rack
        if (address?.startsWith("%IX")) diCount++;
        else if (address?.startsWith("%QX")) doCount++;
        else if (address?.startsWith("%IW")) aiCount++;
        else if (address?.startsWith("%QW")) aoCount++;

        // Dedução de nós elétricos/industriais baseados no nome da tag
        const lowerName = name.toLowerCase();
        let inferredKind: string | null = null;
        const inferredLabel = name;

        if (
          lowerName.includes("motor") ||
          lowerName.startsWith("m_") ||
          lowerName.startsWith("mot_")
        ) {
          inferredKind = "motor";
        } else if (lowerName.includes("km") || lowerName.includes("contator")) {
          inferredKind = "contactor";
        } else if (
          lowerName.includes("dj") ||
          lowerName.includes("disjuntor") ||
          lowerName.includes("q_")
        ) {
          inferredKind = "breaker";
        } else if (
          lowerName.includes("ft") ||
          lowerName.includes("rele") ||
          lowerName.includes("termico")
        ) {
          inferredKind = "relay";
        } else if (
          lowerName.includes("lamp") ||
          lowerName.includes("h_") ||
          lowerName.includes("sinal")
        ) {
          inferredKind = "lamp";
        } else if (lowerName.includes("estop") || lowerName.includes("emergencia")) {
          inferredKind = "estop";
        } else if (lowerName.includes("pt100") || lowerName.includes("temperatura")) {
          inferredKind = "pt100";
        }

        if (inferredKind) {
          const xPos = 80 + (nodes.length % 6) * 140;
          const yPos = 80 + Math.floor(nodes.length / 6) * 120;
          nodes.push({
            id: name,
            type: inferredKind,
            label: inferredLabel,
            position: { x: xPos, y: yPos },
            properties: {
              tag: name,
              address: address || null,
            },
          });
        }
      }
    }
  }

  // 5. Configurar PLC Racks se houver I/O mapeado
  let plcConfig: BundlePlcConfig | undefined;
  if (diCount > 0 || doCount > 0 || aiCount > 0 || aoCount > 0) {
    plcConfig = {
      vendor: "IEC 61131-3 Standard",
      cpuModel: "ElétricAi SoftPLC Core",
      rackName: "Rack_Principal",
      modules: [
        ...(diCount > 0
          ? [
              {
                slot: 1,
                type: "DI" as const,
                channelsCount: Math.max(8, Math.ceil(diCount / 8) * 8),
                label: "Módulo DI",
              },
            ]
          : []),
        ...(doCount > 0
          ? [
              {
                slot: 2,
                type: "DO" as const,
                channelsCount: Math.max(8, Math.ceil(doCount / 8) * 8),
                label: "Módulo DO",
              },
            ]
          : []),
        ...(aiCount > 0
          ? [
              {
                slot: 3,
                type: "AI" as const,
                channelsCount: Math.max(4, Math.ceil(aiCount / 4) * 4),
                label: "Módulo AI",
              },
            ]
          : []),
        ...(aoCount > 0
          ? [
              {
                slot: 4,
                type: "AO" as const,
                channelsCount: Math.max(4, Math.ceil(aoCount / 4) * 4),
                label: "Módulo AO",
              },
            ]
          : []),
      ],
    };
  }

  // 6. Extrair atribuições lógicas (assignments) e convertê-las em Ladder Rungs
  // Exemplo: Target := Expr;
  const assignRegex = /([a-zA-Z0-9_]+)\s*:=\s*([^;]+);/g;
  let assignMatch: RegExpExecArray | null;
  let rungCounter = 1;

  while ((assignMatch = assignRegex.exec(cleanCode)) !== null) {
    const target = assignMatch[1];
    const expr = assignMatch[2].trim();

    // Se a expressão contiver operadores lógicos AND / OR / NOT
    const isLogic = /\b(AND|OR|NOT)\b/i.test(expr) || tags.some((t) => t.name === target);
    if (!isLogic) continue;

    // Tratar ramos OR: A OR B -> múltiplos branches
    // Exemplo: (Start_PB OR KM_Motor1) AND NOT Stop_PB
    // Normalizar expressão simplificada em branches de contatos
    const branches: BundleLadderContact[][] = [];

    // Dividir em ramos OR no nível principal (fora de parênteses simples ou simplificado)
    const orParts = expr.includes(" OR ") ? expr.split(/\s+OR\s+/i) : [expr];

    for (const part of orParts) {
      const contacts: BundleLadderContact[] = [];
      // Limpar parênteses
      const cleanedPart = part.replace(/[()]/g, "").trim();
      const andParts = cleanedPart.split(/\s+AND\s+/i);

      for (const token of andParts) {
        const tTrim = token.trim();
        if (!tTrim) continue;

        if (tTrim.toUpperCase().startsWith("NOT ")) {
          const op = tTrim.substring(4).trim();
          contacts.push({ kind: "XIO", operand: op });
        } else {
          contacts.push({ kind: "XIC", operand: tTrim });
        }
      }

      if (contacts.length > 0) {
        branches.push(contacts);
      }
    }

    if (branches.length === 0) {
      branches.push([{ kind: "XIC", operand: expr }]);
    }

    rungs.push({
      id: `RUNG_${String(rungCounter).padStart(3, "0")}`,
      comment: `Lógica ST: ${target} := ${expr}`,
      output: {
        kind: "OTE",
        operand: target,
      },
      branches,
    });

    rungCounter++;
  }

  // 7. Extrair chamadas de Temporizadores TON/TOF
  // Exemplo: Timer1(IN := Start_Cmd, PT := T#5S);
  const timerRegex = /([a-zA-Z0-9_]+)\s*\(\s*IN\s*:=\s*([^,]+),\s*PT\s*:=\s*([^)]+)\)/gi;
  let timerMatch: RegExpExecArray | null;
  while ((timerMatch = timerRegex.exec(cleanCode)) !== null) {
    const timerName = timerMatch[1];
    const inSignal = timerMatch[2].trim();
    const ptValue = timerMatch[3].trim();

    // Converte T#5s em ms
    let ms = 5000;
    const timeMatch = ptValue.match(/T#([0-9.]+)(s|ms|m)/i);
    if (timeMatch) {
      const val = parseFloat(timeMatch[1]);
      const unit = timeMatch[2].toLowerCase();
      if (unit === "s") ms = val * 1000;
      else if (unit === "ms") ms = val;
      else if (unit === "m") ms = val * 60000;
    }

    rungs.push({
      id: `RUNG_${String(rungCounter).padStart(3, "0")}`,
      comment: `Temporizador ${timerName} (${ptValue})`,
      output: {
        kind: "TON",
        operand: timerName,
        params: { preset: ms },
      },
      branches: [[{ kind: "XIC", operand: inSignal }]],
    });

    rungCounter++;
  }

  if (tags.length === 0 && rungs.length === 0 && nodes.length === 0) {
    return {
      success: false,
      issues: [
        {
          id: "st-no-elements",
          severity: "critical",
          category: "schema",
          message:
            "Nenhuma variável, instrução I/O ou lógica reconhecida no código Structured Text fornecido.",
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
      diagramType: rungs.length > 0 ? "ladder" : "unifilar",
      description: `Importado de IEC 61131-3 Structured Text (${tags.length} variáveis, ${rungs.length} rungs)`,
      standards: ["IEC_61131_3", "NBR_5410"],
    },
    nodes,
    edges,
    ladder: {
      rungs,
    },
    plc: plcConfig,
    tags,
    metadata: {
      author: "ElétricAi ST Adapter",
      generator: "st-adapter",
      generatedAt: new Date().toISOString(),
    },
  };

  return {
    success: true,
    bundle,
    issues,
  };
}
