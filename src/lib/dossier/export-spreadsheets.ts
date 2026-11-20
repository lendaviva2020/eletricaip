// Spreadsheets Exporter (Excel .xlsx and CSV) for Industrial Engineering Dossier
// Uses 'xlsx' for rich multi-sheet engineering workbooks and standard CSV formats.

import { XLSX, sanitizeSpreadsheetFormulaString } from "@/lib/security/safe-xlsx";
import type { CompleteEngineeringDossier } from "./types";
import { BOM_GROUP_NAMES } from "./types";

type Cell = string | number | boolean | null | undefined;

/**
 * Saneia toda célula de texto: tags, descrições e nomes vêm do projeto do
 * usuário. Sem isso `=HYPERLINK(...)` / `+cmd|...` vira fórmula ao abrir no
 * Excel (CSV/Formula Injection — OWASP). Números continuam números.
 */
/**
 * Designação IEC 81346 estrita (`-Q1`, `=ETE+QGBT-K3`): só letras, dígitos, `_` e
 * `.` entre os prefixos de aspecto. Sem `(`, `|`, aspas ou `!` não há chamada
 * de função, DDE nem link externo — e a célula do .xlsx é gravada como TEXTO
 * (tipo "s"), que o Excel não avalia. Exibimos sem o apóstrofo que estragaria
 * a identificação. No CSV (avaliado pelo Excel) o saneamento continua total.
 */
const PLAIN_DESIGNATION_RE = /^(?:[=+-][A-Za-z0-9_.]{1,24}){1,3}$/;

function safeText(v: string): string {
  const text = v.slice(0, 1000);
  return PLAIN_DESIGNATION_RE.test(text) ? text : sanitizeSpreadsheetFormulaString(text);
}

function safeRows(
  rows: ReadonlyArray<Record<string, Cell>>,
): Record<string, string | number | boolean>[] {
  return rows.map((row) => {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) out[k] = "";
      else if (typeof v === "string") out[k] = safeText(v);
      else out[k] = v;
    }
    return out;
  });
}

function sheet(rows: ReadonlyArray<Record<string, Cell>>) {
  return XLSX.utils.json_to_sheet(safeRows(rows));
}

/** Campo CSV: neutraliza fórmula e escapa aspas (RFC 4180). */
function csvField(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const text = sanitizeSpreadsheetFormulaString(String(v).slice(0, 1000));
  return `"${text.replace(/"/g, '""')}"`;
}

const PENDING = "PENDENTE";

export function buildDossierExcelWorkbook(dossier: CompleteEngineeringDossier): Uint8Array {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Lista de Materiais (BOM) ────────────────────────────────────
  const bomRows = dossier.bom.map((b) => ({
    Grupo: BOM_GROUP_NAMES[b.category]?.pt || b.category,
    Tag: b.tag,
    "Descrição Técnica": b.description,
    Qtd: b.quantity,
    Unidade: b.unit,
    "Tensão Nominal": b.nominalVoltage ?? "—",
    "Corrente Nominal": b.nominalCurrent ?? "—",
    "Potência Nominal": b.nominalPower ?? "—",
    "Polos / Fases": b.poles ?? "—",
    "Icu / Capacidade": b.breakingCapacityKa ? `${b.breakingCapacityKa} kA` : "—",
    Curva: b.tripCurve ?? "—",
    "Grau Prot.": b.protectionDegree ?? "—",
    "Circuito Ref.": b.circuitRef ?? "—",
    Origem: b.sourceKind,
    Validação: b.validationStatus,
    Observações: b.notes ?? "",
  }));
  const wsBom = sheet(bomRows);
  XLSX.utils.book_append_sheet(wb, wsBom, "Lista de Materiais");

  // ── Sheet 2: Cabos e Condutores ──────────────────────────────────────────
  const condRows = dossier.conductorsSchedule.map((c) => ({
    Circuito: c.circuitCode,
    Identificador: c.wireTag,
    Função: c.phaseOrFunction,
    "Seção (mm²)": c.crossSectionMm2 ?? PENDING,
    Material: c.material,
    Isolação: c.insulation,
    "De (Origem)": `${c.fromEquipment} [${c.fromTerminal}]`,
    "Para (Destino)": `${c.toEquipment} [${c.toTerminal}]`,
    "Comprimento (m)": c.lengthM ?? PENDING,
  }));
  const wsCond = sheet(condRows);
  XLSX.utils.book_append_sheet(wb, wsCond, "Cabos e Condutores");

  // ── Sheet 3: Régua de Bornes ─────────────────────────────────────────────
  const termRows = dossier.terminalsSchedule.map((t) => ({
    "Borneira / Bloco": t.blockId,
    "Nº Borne": t.terminalNumber,
    "Tag do Fio": t.wireTag,
    "Conexão Interna (Painel)": `${t.internalEquipment}:${t.internalTerminal}`,
    "Conexão Externa (Campo)": `${t.externalEquipment}:${t.externalTerminal}`,
    "Tipo de Sinal": t.signalType.toUpperCase(),
  }));
  const wsTerm = sheet(termRows);
  XLSX.utils.book_append_sheet(wb, wsTerm, "Régua de Bornes");

  // ── Sheet 4: Mapa de I/O do CLP ──────────────────────────────────────────
  const ioRows = dossier.plcProgram.ioMappings.map((io) => ({
    Endereço: io.address,
    Canal: io.channel,
    Direção: io.direction,
    "Tag Simbólica": io.symbolicTag,
    "Descrição Funcional": io.description,
    "Tipo de Sinal": io.signalType,
    Slot: io.slotNumber,
    "Módulo CLP": io.modulePartNumber ?? "—",
  }));
  const wsIo = sheet(ioRows);
  XLSX.utils.book_append_sheet(wb, wsIo, "Mapa IO CLP");

  // ── Sheet 5: Memória de Cálculo Elétrico ─────────────────────────────────
  const calcRows = dossier.calculationMemory.circuits.map((c) => ({
    Circuito: c.circuitCode,
    Descrição: c.description,
    Fases: c.phases,
    "Potência (kW)": c.powerKw,
    "Tensão (V)": c.voltageV,
    "cos φ": c.powerFactor,
    "Ib (A)": c.designCurrentIbA,
    "Cabo (mm²)": c.selectedCableMm2,
    "Iz Corrigido (A)": c.correctedAmpacityIzA,
    "Disjuntor In (A)": c.breakerRatingInA,
    "Curva Disj.": c.breakerCurve,
    "ΔV (%)": c.voltageDropPct ?? PENDING,
    "ΔV Limite (%)": c.maxAllowedVoltageDropPct,
    "Neutro (mm²)": c.neutralCableMm2,
    "PE (mm²)": c.peCableMm2,
    Coordenação: c.protectionCoordinationPass ? "CONFORME" : "FALHA",
  }));
  const wsCalc = sheet(calcRows);
  XLSX.utils.book_append_sheet(wb, wsCalc, "Memória de Cálculo");

  // ── Abas de documentação de painel: dispositivos, cabos, referência cruzada, verificação ────
  const doc = dossier.panelDocumentation;
  if (doc) {
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        doc.devices.map((d) => ({
          Designação: d.designation,
          Tag: d.tag,
          "Tag sugerida": d.suggested ? "SIM — aplicar no desenho" : "",
          Tipo: d.catalogType,
          Descrição: d.displayName,
          "Planta (=)": d.plant ?? "",
          "Local (+)": d.location ?? "",
        })),
      ),
      "Dispositivos",
    );
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        doc.cables.map((c) => ({
          Cabo: c.cable,
          De: c.from,
          Para: c.to,
          Composição: c.composition,
          Condutores: c.functions.join(" "),
          "Seção (mm²)": c.sectionMm2 ?? PENDING,
          "Comprimento (m)": c.lengthM ?? PENDING,
          Isolação: c.insulation ?? "",
        })),
      ),
      "Lista de Cabos",
    );
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        doc.crossReference.flatMap((r) =>
          r.contacts.length
            ? r.contacts.map((c) => ({
                Dispositivo: r.designation,
                Bobina: r.coilLocations.join(", ") || "—",
                Contato: c.terminals,
                Tipo: c.type === "POWER" ? "Potência" : c.type === "NO" ? "NA" : "NF",
                "Usado em": c.location,
                Resumo: r.summary,
              }))
            : [
                {
                  Dispositivo: r.designation,
                  Bobina: r.coilLocations.join(", ") || "—",
                  Contato: "—",
                  Tipo: "—",
                  "Usado em": "—",
                  Resumo: r.summary,
                },
              ],
        ),
      ),
      "Referência Cruzada",
    );
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        doc.issues.map((i) => ({
          Severidade: i.severity === "error" ? "ERRO" : i.severity === "warning" ? "AVISO" : "INFO",
          Código: i.code,
          Referência: i.ref,
          Mensagem: i.message,
        })),
      ),
      "Verificação",
    );
  }

  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(wbOut);
}

export function buildBomCsv(dossier: CompleteEngineeringDossier): string {
  const rows = [
    [
      "Grupo",
      "Tag",
      "Descricao",
      "Quantidade",
      "Unidade",
      "Tensao",
      "Corrente",
      "Potencia",
      "Icu_kA",
      "Curva",
      "Circuito",
      "Origem",
      "Validacao",
    ],
  ];

  for (const b of dossier.bom) {
    rows.push([
      csvField(BOM_GROUP_NAMES[b.category]?.pt || b.category),
      csvField(b.tag),
      csvField(b.description),
      csvField(b.quantity),
      csvField(b.unit),
      csvField(b.nominalVoltage ?? ""),
      csvField(b.nominalCurrent ?? ""),
      csvField(b.nominalPower ?? ""),
      b.breakingCapacityKa ? csvField(b.breakingCapacityKa) : "",
      csvField(b.tripCurve ?? ""),
      csvField(b.circuitRef ?? ""),
      csvField(b.sourceKind),
      csvField(b.validationStatus),
    ]);
  }

  return rows.map((r) => r.join(";")).join("\n");
}
