// Pipeline estruturado de extração e validação de documentos de briefing (Fase 6 — Tarefa 6.1)
// Suporta CSV, TXT/MD/JSON e extração textual de PDF, convertendo listas de motores e cargas
// em especificações validadas via Zod e sintetizando/reconciliando o snapshot elétrico
// em conformidade com NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3.

import Papa from "papaparse";
import { z } from "zod";
import { calcMotor, type InstallationMethod, type InsulationType } from "@/lib/electrical-calc";
import { sanitizePromptText } from "@/lib/ai/context-sanitizer";
import { runVerification } from "@/lib/ai/verify-architecture";
import { summarizeVerification, type VerificationReport } from "@/lib/ai/verification-types";
import { AiDiagramPatchSchema, type AiDiagramPatch } from "@/lib/diagram/schema";

export const StartMethodSchema = z.enum(["DOL", "SOFT", "VFD"]);
export type StartMethod = z.infer<typeof StartMethodSchema>;

export const InstallationMethodSchema = z.enum(["A1", "A2", "B1", "B2", "C", "D", "E", "F"]);
export const InsulationTypeSchema = z.enum(["PVC", "EPR", "XLPE"]);

export const ParsedBriefingMotorSchema = z.object({
  id: z.string().min(1).max(64),
  power_kW: z.number().positive().max(10000),
  voltage_V: z.number().int().positive().default(380),
  startMethod: StartMethodSchema.default("DOL"),
  role: z.string().max(200).default("Carga industrial"),
  installationMethod: InstallationMethodSchema.default("B1"),
  insulation: InsulationTypeSchema.default("PVC"),
  ambientTemp_C: z.number().min(0).max(80).default(30),
  groupedCircuits: z.number().int().min(1).max(20).default(1),
  cableLength_m: z.number().min(1).max(2000).default(25),
});

export type ParsedBriefingMotor = z.infer<typeof ParsedBriefingMotorSchema>;

export const BriefingDocumentInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(120).optional(),
  content: z.string().min(1).max(500_000),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

export type BriefingDocumentInput = z.infer<typeof BriefingDocumentInputSchema>;

export const ParsedBriefingResultSchema = z.object({
  fileName: z.string(),
  format: z.enum(["csv", "txt", "json", "pdf"]),
  extractedText: z.string(),
  motors: z.array(ParsedBriefingMotorSchema),
  formattedPromptBlock: z.string(),
  warnings: z.array(z.string()),
});

export type ParsedBriefingResult = z.infer<typeof ParsedBriefingResultSchema>;

const COMMERCIAL_TRAFO_KVA = [45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500];

function pickCommercialTrafoKva(totalKw: number): number {
  const minKva = Math.max(45, Math.ceil((totalKw / 0.85 / 0.88) * 1.15));
  return COMMERCIAL_TRAFO_KVA.find((k) => k >= minKva) ?? Math.ceil(minKva / 100) * 100;
}

function normalizeStartMethod(raw: unknown): StartMethod {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (/VFD|INV|CFW|FREQ|VARIADOR/.test(s)) return "VFD";
  if (/SOFT|SUAVE|SSW|ESTRELA|Y-D|STAR/.test(s)) return "SOFT";
  return "DOL";
}

function normalizeInstallMethod(raw: unknown): InstallationMethod {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (["A1", "A2", "B1", "B2", "C", "D", "E", "F"].includes(s)) {
    return s as InstallationMethod;
  }
  return "B1";
}

function normalizeInsulation(raw: unknown): InsulationType {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "XLPE" || s === "EPR" || s === "PVC") return s;
  return "PVC";
}

function parseNumericField(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.trim().replace(",", ".");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const val = Number.parseFloat(match[0]);
  return Number.isFinite(val) ? val : undefined;
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_");
}

function extractMotorFromRow(
  row: Record<string, unknown>,
  index: number,
): ParsedBriefingMotor | null {
  const normRow: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    normRow[normalizeHeaderKey(k)] = v;
  }

  const rawId =
    normRow.id ??
    normRow.tag ??
    normRow.motor ??
    normRow.codigo ??
    normRow.equipamento ??
    normRow.carga ??
    normRow.name ??
    normRow.nome;

  // Power in kW or CV/HP
  const rawKw =
    normRow.power_kw ??
    normRow.kw ??
    normRow.potencia_kw ??
    normRow.potencia ??
    normRow.power ??
    normRow.p_kw ??
    normRow.p;
  const rawCv = normRow.cv ?? normRow.potencia_cv;
  const rawHp = normRow.hp ?? normRow.potencia_hp;

  let powerKw = parseNumericField(rawKw);
  if (powerKw === undefined && rawCv !== undefined) {
    const cv = parseNumericField(rawCv);
    if (cv !== undefined) powerKw = Math.round(cv * 0.7355 * 100) / 100;
  }
  if (powerKw === undefined && rawHp !== undefined) {
    const hp = parseNumericField(rawHp);
    if (hp !== undefined) powerKw = Math.round(hp * 0.7457 * 100) / 100;
  }
  // Check if the power string itself contains "cv" or "hp"
  if (powerKw !== undefined && typeof rawKw === "string") {
    if (/\bcv\b/i.test(rawKw)) powerKw = Math.round(powerKw * 0.7355 * 100) / 100;
    else if (/\bhp\b/i.test(rawKw)) powerKw = Math.round(powerKw * 0.7457 * 100) / 100;
  }

  if (!powerKw || powerKw <= 0) return null;

  const idStr =
    typeof rawId === "string" && rawId.trim().length > 0
      ? rawId.trim()
      : `M-${String(index + 1).padStart(2, "0")}`;

  const rawVoltage =
    normRow.voltage_v ??
    normRow.tensao_v ??
    normRow.tensao ??
    normRow.voltage ??
    normRow.v ??
    normRow.volts ??
    normRow.u;
  const voltageV = Math.round(parseNumericField(rawVoltage) ?? 380);

  const rawStart =
    normRow.startmethod ??
    normRow.start_method ??
    normRow.partida ??
    normRow.metodo_partida ??
    normRow.acionamento ??
    normRow.start;
  const startMethod = normalizeStartMethod(rawStart);

  const rawRole =
    normRow.role ??
    normRow.funcao ??
    normRow.descricao ??
    normRow.aplicacao ??
    normRow.description ??
    normRow.setor;
  const role =
    typeof rawRole === "string" && rawRole.trim().length > 0
      ? rawRole.trim().slice(0, 200)
      : `Motor ${idStr}`;

  const rawInstall =
    normRow.installationmethod ??
    normRow.installation_method ??
    normRow.metodo_instalacao ??
    normRow.instalacao ??
    normRow.method;
  const installationMethod = normalizeInstallMethod(rawInstall);

  const rawIns = normRow.insulation ?? normRow.isolacao ?? normRow.isolamento;
  const insulation = normalizeInsulation(rawIns);

  const ambientTemp_C =
    parseNumericField(normRow.ambienttemp_c ?? normRow.temp_c ?? normRow.temperatura) ?? 30;
  const groupedCircuits = Math.max(
    1,
    Math.round(parseNumericField(normRow.groupedcircuits ?? normRow.agrupamento) ?? 1),
  );
  const cableLength_m = Math.max(
    1,
    parseNumericField(
      normRow.cablelength_m ?? normRow.length_m ?? normRow.comprimento_m ?? normRow.distancia_m,
    ) ?? 25,
  );

  const parsed = ParsedBriefingMotorSchema.safeParse({
    id: idStr,
    power_kW: powerKw,
    voltage_V: voltageV > 0 ? voltageV : 380,
    startMethod,
    role,
    installationMethod,
    insulation,
    ambientTemp_C,
    groupedCircuits,
    cableLength_m,
  });

  return parsed.success ? parsed.data : null;
}

/**
 * Extrai motores a partir de CSV estruturado (com cabeçalho ou posicional).
 */
export function parseMotorsFromCsv(csvText: string): ParsedBriefingMotor[] {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const result = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const motors: ParsedBriefingMotor[] = [];
  if (Array.isArray(result.data) && result.data.length > 0) {
    result.data.forEach((row, idx) => {
      const m = extractMotorFromRow(row, idx);
      if (m) motors.push(m);
    });
  }

  if (motors.length > 0) return motors;

  // Fallback para CSV sem cabeçalho explícito: id, power_kW, voltage_V, startMethod, role
  const rawRows = Papa.parse<string[]>(trimmed, {
    header: false,
    skipEmptyLines: true,
  });
  if (Array.isArray(rawRows.data)) {
    rawRows.data.forEach((cols, idx) => {
      if (!Array.isArray(cols) || cols.length < 2) return;
      const p = parseNumericField(cols[1]);
      if (!p || p <= 0) return;
      const m = extractMotorFromRow(
        {
          id: cols[0],
          power_kw: cols[1],
          voltage_v: cols[2] ?? "380",
          start_method: cols[3] ?? "DOL",
          role: cols[4] ?? `Motor ${cols[0]}`,
        },
        idx,
      );
      if (m) motors.push(m);
    });
  }

  return motors;
}

/**
 * Extrai motores descritos em texto livre / linhas de memorial (TXT, MD ou texto de PDF).
 * Exemplo suportado: "M-01: 15 kW, 380V, VFD - Bomba recalque"
 */
export function parseMotorsFromFreeText(text: string): ParsedBriefingMotor[] {
  const lines = text.split(/\r?\n/);
  const motors: ParsedBriefingMotor[] = [];
  const lineRegex =
    /\b([A-Za-z]{1,6}[-_]?\d{1,4})\b[^\d\n]{0,30}(\d+(?:[.,]\d+)?)\s*(kW|cv|hp)\b(?:[^\n]*?\b(220|380|440|480)\s*V\b)?(?:[^\n]*?\b(DOL|SOFT|VFD|DIRETA|INVERSOR|SOFT[- ]?STARTER)\b)?/i;

  lines.forEach((line, idx) => {
    const m = line.match(lineRegex);
    if (!m) return;
    const [, rawId, rawPower, unit, rawVolt, rawStart] = m;
    const row: Record<string, unknown> = {
      id: rawId.toUpperCase(),
      power_kw: `${rawPower} ${unit}`,
      voltage_v: rawVolt ?? "380",
      start_method: rawStart ?? "DOL",
      role: line.trim().slice(0, 140),
    };
    const parsed = extractMotorFromRow(row, idx);
    if (parsed) motors.push(parsed);
  });

  return motors;
}

/**
 * Extrai texto legível de conteúdo PDF (texto plano ou operadores PDF BT..ET / Tj / TJ).
 */
export function extractTextFromPdfPayload(content: string, encoding: "utf8" | "base64"): string {
  let raw = content;
  if (encoding === "base64") {
    try {
      if (typeof Buffer !== "undefined") {
        raw = Buffer.from(content, "base64").toString("latin1");
      } else if (typeof atob === "function") {
        raw = atob(content);
      }
    } catch {
      raw = content;
    }
  }

  // Se não começa com cabeçalho PDF (%PDF-), já é texto extraído
  if (!raw.startsWith("%PDF-")) {
    return raw.trim();
  }

  const fragments: string[] = [];

  // Extrai literais entre parênteses seguidos de Tj ou dentro de arrays TJ
  const tjLiteralRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjLiteralRegex.exec(raw)) !== null) {
    fragments.push(decodePdfString(match[1]));
  }

  const tjArrayRegex = /\[((?:[^\]]*?))\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(raw)) !== null) {
    const inner = match[1];
    const subRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    let sub: RegExpExecArray | null;
    const lineParts: string[] = [];
    while ((sub = subRegex.exec(inner)) !== null) {
      lineParts.push(decodePdfString(sub[1]));
    }
    if (lineParts.length > 0) fragments.push(lineParts.join(""));
  }

  return fragments
    .join("\n")
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

/**
 * Processa e valida qualquer documento de briefing (CSV, TXT, JSON, PDF) via Zod.
 */
export function parseBriefingDocument(input: BriefingDocumentInput): ParsedBriefingResult {
  const validInput = BriefingDocumentInputSchema.parse(input);
  const lowerName = validInput.fileName.toLowerCase();
  const warnings: string[] = [];

  let format: "csv" | "txt" | "json" | "pdf" = "txt";
  if (lowerName.endsWith(".csv") || validInput.mimeType === "text/csv") {
    format = "csv";
  } else if (lowerName.endsWith(".json") || validInput.mimeType === "application/json") {
    format = "json";
  } else if (lowerName.endsWith(".pdf") || validInput.mimeType === "application/pdf") {
    format = "pdf";
  }

  let extractedText = "";
  let motors: ParsedBriefingMotor[] = [];

  if (format === "pdf") {
    extractedText = extractTextFromPdfPayload(validInput.content, validInput.encoding);
    if (!extractedText) {
      warnings.push(
        "PDF sem camada de texto extraível (provável imagem escaneada). Envie CSV/TXT ou PDF com texto selecionável.",
      );
    } else {
      motors = parseMotorsFromFreeText(extractedText);
      if (motors.length === 0) {
        motors = parseMotorsFromCsv(extractedText);
      }
    }
  } else if (format === "csv") {
    extractedText =
      validInput.encoding === "base64" && typeof Buffer !== "undefined"
        ? Buffer.from(validInput.content, "base64").toString("utf8")
        : validInput.content;
    motors = parseMotorsFromCsv(extractedText);
    if (motors.length === 0) {
      warnings.push("Nenhum motor estruturado identificado nas colunas do CSV; usando texto bruto.");
    }
  } else if (format === "json") {
    extractedText =
      validInput.encoding === "base64" && typeof Buffer !== "undefined"
        ? Buffer.from(validInput.content, "base64").toString("utf8")
        : validInput.content;
    try {
      const parsedJson = JSON.parse(extractedText);
      const rows = Array.isArray(parsedJson)
        ? parsedJson
        : Array.isArray(parsedJson?.motors)
          ? parsedJson.motors
          : [];
      rows.forEach((r: Record<string, unknown>, idx: number) => {
        if (r && typeof r === "object") {
          const m = extractMotorFromRow(r, idx);
          if (m) motors.push(m);
        }
      });
    } catch {
      warnings.push("JSON inválido; processando como texto descritivo.");
    }
  } else {
    extractedText =
      validInput.encoding === "base64" && typeof Buffer !== "undefined"
        ? Buffer.from(validInput.content, "base64").toString("utf8")
        : validInput.content;
    motors = parseMotorsFromFreeText(extractedText);
    if (motors.length === 0) {
      motors = parseMotorsFromCsv(extractedText);
    }
  }

  const safeText = sanitizePromptText(extractedText, 12000);
  const motorSummaryLines = motors.map((m, idx) => {
    const dim = calcMotor({
      id: m.id,
      power_kW: m.power_kW,
      voltage_V: m.voltage_V,
      startMethod: m.startMethod,
      installationMethod: m.installationMethod,
      insulation: m.insulation,
      ambientTemp_C: m.ambientTemp_C,
      groupedCircuits: m.groupedCircuits,
      cableLength_m: m.cableLength_m,
    });
    return `${idx + 1}. ID: ${m.id} | Potência: ${m.power_kW} kW | Tensão: ${m.voltage_V} V | Partida: ${m.startMethod} | Função: ${m.role} | Pré-dimensionamento NBR 5410: In=${dim.In_A}A, Cabo=${dim.cable_mm2}mm² (${m.insulation}, método ${m.installationMethod}), Disjuntor=${dim.breaker_A}A`;
  });

  const formattedPromptBlock = [
    `[DOCUMENTO DE BRIEFING: ${ sanitizePromptText(validInput.fileName, 120) } (${format.toUpperCase()})]`,
    motors.length > 0
      ? `LISTA ESTRUTURADA DE MOTORES EXTRAÍDA (${motors.length} motores obrigatórios):\n${motorSummaryLines.join("\n")}\n\nOBRIGATÓRIO: O projeto gerado DEVE conter EXATAMENTE todos os ${motors.length} motores listados acima (${motors.map((m) => m.id).join(", ")}) com suas respectivas potências, proteções NBR 5410 e interlocks E-STOP NR-12.`
      : `CONTEÚDO EXTRAÍDO DO BRIEFING:\n${safeText}`,
  ].join("\n\n");

  return ParsedBriefingResultSchema.parse({
    fileName: validInput.fileName,
    format,
    extractedText: safeText,
    motors,
    formattedPromptBlock,
    warnings,
  });
}

/**
 * Gera uma arquitetura elétrica industrial completa, determinística e 100% aderente
 * à NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3 a partir de uma lista de motores validada.
 */
export function buildArchitectureFromBriefingMotors(
  motors: ParsedBriefingMotor[],
  title = "Painel CCM Industrial — Briefing Importado",
): {
  system: {
    title: string;
    rationale: string;
    transformer: { kVA: number; primary_kV: number; secondary_V: number };
    ccm: { columns: number; cells: number };
    motors: Array<{
      id: string;
      power_kW: number;
      voltage_V: number;
      startMethod: StartMethod;
      role: string;
    }>;
    nodes: Array<{
      id: string;
      kind: string;
      category: "power" | "mech" | "inst" | "logic";
      label: string;
      params: Record<string, unknown>;
      position: { x: number; y: number };
    }>;
    edges: Array<{ source: string; target: string; kind: "power" | "signal" | "pipe" }>;
    plcLogic: {
      rungs: Array<{
        id: string;
        label: string;
        output: { kind: "OTE"; operand: string };
        branches: Array<Array<{ kind: "XIC" | "XIO"; operand: string }>>;
      }>;
    };
  };
  verification: VerificationReport;
} {
  const totalKw = motors.reduce((acc, m) => acc + m.power_kW, 0);
  const secondaryV = motors[0]?.voltage_V ?? 380;
  const trafoKva = pickCommercialTrafoKva(totalKw);
  const columns = Math.max(1, Math.ceil(motors.length / 3));
  const cells = Math.max(2, motors.length + 2);

  const nodes: Array<{
    id: string;
    kind: string;
    category: "power" | "mech" | "inst" | "logic";
    label: string;
    params: Record<string, unknown>;
    position: { x: number; y: number };
  }> = [
    {
      id: "TR-01",
      kind: "transformer",
      category: "power",
      label: `Trafo ${trafoKva} kVA`,
      params: { kVA: trafoKva, primary_kV: 13.8, secondary_V: secondaryV, uk_pct: 4.5 },
      position: { x: 420, y: 60 },
    },
    {
      id: "QS-LOTO",
      kind: "switch",
      category: "power",
      label: "Seccionadora Geral LOTO (NR-10)",
      params: { loto: true, lockout: true, in_A: Math.ceil((trafoKva * 1000) / (1.732 * secondaryV)) },
      position: { x: 420, y: 170 },
    },
    {
      id: "DR-GERAL",
      kind: "breaker",
      category: "power",
      label: "Disjuntor Geral c/ DR 300mA",
      params: {
        curve: "C",
        curva: "C",
        rcd: true,
        dr_mA: 300,
        in_A: Math.ceil((trafoKva * 1000) / (1.732 * secondaryV)),
      },
      position: { x: 420, y: 280 },
    },
    {
      id: "BUS-01",
      kind: "busbar",
      category: "power",
      label: `Barramento Principal ${secondaryV}V + Terra PE`,
      params: { voltage_V: secondaryV, ground: "PE", pe: true },
      position: { x: 420, y: 390 },
    },
    {
      id: "CCM-01",
      kind: "ccm",
      category: "power",
      label: `CCM Principal (${columns} col / ${cells} gavetas)`,
      params: { columns, cells, ground: "PE" },
      position: { x: 180, y: 390 },
    },
    {
      id: "CLP-01",
      kind: "psu",
      category: "logic",
      label: "PLC / CLP Segurança IEC 61131-3",
      params: { voltage_V: 24 },
      position: { x: 680, y: 280 },
    },
    {
      id: "ESTOP-01",
      kind: "estop",
      category: "inst",
      label: "E-STOP Geral NR-12",
      params: {
        category_nr12: 0,
        operand: "ESTOP_01",
        priority: "High",
        deadband: "2%",
      },
      position: { x: 680, y: 390 },
    },
  ];

  const edges: Array<{ source: string; target: string; kind: "power" | "signal" | "pipe" }> = [
    { source: "TR-01", target: "QS-LOTO", kind: "power" },
    { source: "QS-LOTO", target: "DR-GERAL", kind: "power" },
    { source: "DR-GERAL", target: "BUS-01", kind: "power" },
    { source: "BUS-01", target: "CCM-01", kind: "power" },
    { source: "ESTOP-01", target: "CLP-01", kind: "signal" },
  ];

  const rungs: Array<{
    id: string;
    label: string;
    output: { kind: "OTE"; operand: string };
    branches: Array<Array<{ kind: "XIC" | "XIO"; operand: string }>>;
  }> = [];

  motors.forEach((m, idx) => {
    const dim = calcMotor({
      id: m.id,
      power_kW: m.power_kW,
      voltage_V: m.voltage_V,
      startMethod: m.startMethod,
      installationMethod: m.installationMethod,
      insulation: m.insulation,
      ambientTemp_C: m.ambientTemp_C,
      groupedCircuits: m.groupedCircuits,
      cableLength_m: m.cableLength_m,
    });

    const colX = 180 + idx * 240;
    const cleanTag = m.id
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const brkId = `DJ-${m.id}`;
    const driveId = `KM-${m.id}`;
    const coilOperand = `KM_${cleanTag}`;
    const startOperand = `START_${cleanTag}`;

    const driveKind =
      m.startMethod === "VFD"
        ? "vfd"
        : m.startMethod === "SOFT"
          ? "softstarter"
          : "contactor";

    nodes.push(
      {
        id: brkId,
        kind: "breaker",
        category: "power",
        label: `Disjuntor ${brkId} (${dim.breaker_A}A Curva D)`,
        params: {
          in_A: dim.breaker_A,
          breaker_A: dim.breaker_A,
          curve: "D",
          curva: "D",
        },
        position: { x: colX, y: 520 },
      },
      {
        id: driveId,
        kind: "contactor",
        category: "power",
        label: `Contator ${driveId} (${m.startMethod})`,
        params: {
          in_A: dim.breaker_A,
          driveType: driveKind,
          operand: coilOperand,
          tag: coilOperand,
        },
        position: { x: colX, y: 650 },
      },
      {
        id: m.id,
        kind: "motor",
        category: "mech",
        label: `${m.id} — ${m.role} (${m.power_kW} kW)`,
        params: {
          power_kW: m.power_kW,
          P: m.power_kW,
          voltage_V: m.voltage_V,
          U: m.voltage_V,
          startMethod: m.startMethod,
          installationMethod: m.installationMethod,
          insulation: m.insulation,
          ambientTemp_C: m.ambientTemp_C,
          groupedCircuits: m.groupedCircuits,
          length_m: m.cableLength_m,
          cable_mm2: dim.cable_mm2,
          breaker_A: dim.breaker_A,
          In_A: dim.In_A,
          ground: "PE",
        },
        position: { x: colX, y: 790 },
      },
    );

    edges.push(
      { source: "BUS-01", target: brkId, kind: "power" },
      { source: brkId, target: driveId, kind: "power" },
      { source: driveId, target: m.id, kind: "power" },
      { source: "ESTOP-01", target: driveId, kind: "signal" },
    );

    rungs.push({
      id: `rung-estop-${cleanTag.toLowerCase()}`,
      label: `Interlock NR-12 E-STOP → ${m.id}`,
      output: { kind: "OTE", operand: coilOperand },
      branches: [
        [
          { kind: "XIO", operand: "ESTOP_01" },
          { kind: "XIC", operand: startOperand },
        ],
      ],
    });
  });

  const system = {
    title,
    rationale: `Dimensionamento normativo executado para ${motors.length} motor(es) do briefing (${motors.map((m) => `${m.id}: ${m.power_kW}kW/${m.voltage_V}V/${m.startMethod}`).join(", ")}), aplicando NBR 5410 (Tabelas 36–42, coordenação §5.3.4.1, DR 300mA §5.1.3.2), NBR 14039 (Trafo ${trafoKva} kVA), NR-10 (PE + LOTO) e NR-12 (interlock E-STOP em série no CLP).`,
    transformer: { kVA: trafoKva, primary_kV: 13.8, secondary_V: secondaryV },
    ccm: { columns, cells },
    motors: motors.map((m) => ({
      id: m.id,
      power_kW: m.power_kW,
      voltage_V: m.voltage_V,
      startMethod: m.startMethod,
      role: m.role,
    })),
    nodes,
    edges,
    plcLogic: { rungs },
  };

  const findings = runVerification(system);
  return {
    system,
    verification: {
      rounds: 0,
      findings,
      summary: summarizeVerification(findings),
    },
  };
}

/**
 * Reconcilia a saída da IA com a lista de motores do briefing: se a IA omitir algum
 * motor do CSV ou deixar violação normativa crítica, garante a presença de todos os motores
 * do briefing com dimensionamento NBR 5410 e interlock NR-12 validados.
 */
export function reconcileArchitectureWithBriefing(
  aiParsed: unknown,
  briefingMotors: ParsedBriefingMotor[],
): { system: any; reconciled: boolean } {
  if (briefingMotors.length === 0) {
    return { system: aiParsed, reconciled: false };
  }

  const p = (aiParsed ?? {}) as Record<string, any>;
  const existingMotors: any[] = Array.isArray(p.motors) ? p.motors : [];
  const existingNodes: any[] = Array.isArray(p.nodes) ? p.nodes : [];

  const allMotorsPresent = briefingMotors.every((bm) => {
    const inMotors = existingMotors.some(
      (em) =>
        String(em?.id ?? "").toUpperCase() === bm.id.toUpperCase() &&
        Math.abs(Number(em?.power_kW) - bm.power_kW) < 0.5,
    );
    const inNodes = existingNodes.some(
      (en) =>
        en?.kind === "motor" && String(en?.id ?? "").toUpperCase() === bm.id.toUpperCase(),
    );
    return inMotors && inNodes;
  });

  const findings = runVerification(aiParsed);
  const hasErrors = findings.some((f) => f.severity === "error");

  if (allMotorsPresent && !hasErrors) {
    return { system: aiParsed, reconciled: false };
  }

  const deterministic = buildArchitectureFromBriefingMotors(
    briefingMotors,
    typeof p.title === "string" && p.title.trim() ? p.title : undefined,
  );
  return { system: deterministic.system, reconciled: true };
}

/**
 * Gera um AiDiagramPatch validado pelo Zod para o canvas WebGL a partir da lista de motores do briefing.
 */
export function buildDiagramPatchFromBriefingMotors(
  motors: ParsedBriefingMotor[],
): AiDiagramPatch {
  const totalKw = motors.reduce((acc, m) => acc + m.power_kW, 0);
  const secondaryV = motors[0]?.voltage_V ?? 380;
  const trafoKva = pickCommercialTrafoKva(totalKw);
  const mainCurrentA = Math.max(25, Math.ceil((trafoKva * 1000) / (1.732 * secondaryV)));

  const addNodes: AiDiagramPatch["addNodes"] = [
    {
      id: "n_tr01",
      sheet: "unifilar",
      position: { x: 400, y: 80 },
      label: `TR-01 ${trafoKva}kVA`,
      rotation: 0,
      params: {
        kind: "transformer",
        kVA: trafoKva,
        primary_V: 13800,
        secondary_V: secondaryV,
        vector: "Dyn11",
      },
    },
    {
      id: "n_rcd01",
      sheet: "unifilar",
      position: { x: 400, y: 220 },
      label: "DR-GERAL 30mA",
      rotation: 0,
      params: {
        kind: "rcd",
        in_A: mainCurrentA,
        sensitivity_mA: 30,
        poles: 4,
      },
    },
    {
      id: "n_bus01",
      sheet: "unifilar",
      position: { x: 400, y: 360 },
      label: `QGBT / CCM ${secondaryV}V`,
      rotation: 0,
      params: {
        kind: "busbar",
        current_A: mainCurrentA,
        voltage_V: secondaryV,
      },
    },
  ];

  const addEdges: AiDiagramPatch["addEdges"] = [
    { id: "e_tr_rcd", sheet: "unifilar", source: "n_tr01", target: "n_rcd01", kind: "power" },
    { id: "e_rcd_bus", sheet: "unifilar", source: "n_rcd01", target: "n_bus01", kind: "power" },
  ];

  motors.forEach((m, idx) => {
    const dim = calcMotor({
      id: m.id,
      power_kW: m.power_kW,
      voltage_V: m.voltage_V,
      startMethod: m.startMethod,
      installationMethod: m.installationMethod,
      insulation: m.insulation,
      ambientTemp_C: m.ambientTemp_C,
      groupedCircuits: m.groupedCircuits,
      cableLength_m: m.cableLength_m,
    });
    const slug = m.id.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const x = 160 + idx * 240;
    const djId = `n_dj_${slug}`;
    const kmId = `n_km_${slug}`;
    const motId = `n_mot_${slug}`;

    addNodes.push(
      {
        id: djId,
        sheet: "unifilar",
        position: { x, y: 500 },
        label: `DJ-${m.id} ${dim.breaker_A}A`,
        rotation: 0,
        params: {
          kind: "breaker",
          in_A: dim.breaker_A,
          curve: "D",
          poles: 3,
        },
      },
      {
        id: kmId,
        sheet: "unifilar",
        position: { x, y: 640 },
        label: `KM-${m.id}`,
        rotation: 0,
        params: {
          kind: "contactor",
          in_A: dim.breaker_A,
          coil_V: 24,
        },
      },
      {
        id: motId,
        sheet: "unifilar",
        position: { x, y: 780 },
        label: `${m.id} (${m.power_kW}kW)`,
        rotation: 0,
        params: {
          kind: "motor",
          power_kW: m.power_kW,
          voltage_V: m.voltage_V,
          startMethod: m.startMethod,
        },
      },
    );

    addEdges.push(
      { id: `e_bus_${slug}`, sheet: "unifilar", source: "n_bus01", target: djId, kind: "power" },
      { id: `e_dj_km_${slug}`, sheet: "unifilar", source: djId, target: kmId, kind: "power" },
      { id: `e_km_mot_${slug}`, sheet: "unifilar", source: kmId, target: motId, kind: "power" },
    );
  });

  return AiDiagramPatchSchema.parse({
    rationale: `Circuito gerado a partir do briefing com ${motors.length} motor(es) (${motors.map((m) => `${m.id}: ${m.power_kW}kW`).join(", ")}) conforme NBR 5410.`,
    addNodes,
    addEdges,
    removeNodeIds: [],
    removeEdgeIds: [],
    updateNodes: [],
  });
}
