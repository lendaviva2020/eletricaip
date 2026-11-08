// Spreadsheets Exporter (Excel .xlsx and CSV) for Industrial Engineering Dossier
// Uses 'xlsx' for rich multi-sheet engineering workbooks and standard CSV formats.

import { XLSX } from "@/lib/security/safe-xlsx";
import type { CompleteEngineeringDossier } from "./types";
import { BOM_GROUP_NAMES } from "./types";

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
  const wsBom = XLSX.utils.json_to_sheet(bomRows);
  XLSX.utils.book_append_sheet(wb, wsBom, "Lista de Materiais");

  // ── Sheet 2: Cabos e Condutores ──────────────────────────────────────────
  const condRows = dossier.conductorsSchedule.map((c) => ({
    Circuito: c.circuitCode,
    Identificador: c.wireTag,
    Função: c.phaseOrFunction,
    "Seção (mm²)": c.crossSectionMm2,
    Material: c.material,
    Isolação: c.insulation,
    "De (Origem)": `${c.fromEquipment} [${c.fromTerminal}]`,
    "Para (Destino)": `${c.toEquipment} [${c.toTerminal}]`,
    "Comprimento (m)": c.lengthM,
  }));
  const wsCond = XLSX.utils.json_to_sheet(condRows);
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
  const wsTerm = XLSX.utils.json_to_sheet(termRows);
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
  const wsIo = XLSX.utils.json_to_sheet(ioRows);
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
    "ΔV (%)": c.voltageDropPct,
    "ΔV Limite (%)": c.maxAllowedVoltageDropPct,
    "Neutro (mm²)": c.neutralCableMm2,
    "PE (mm²)": c.peCableMm2,
    Coordenação: c.protectionCoordinationPass ? "CONFORME" : "FALHA",
  }));
  const wsCalc = XLSX.utils.json_to_sheet(calcRows);
  XLSX.utils.book_append_sheet(wb, wsCalc, "Memória de Cálculo");

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
      `"${BOM_GROUP_NAMES[b.category]?.pt || b.category}"`,
      `"${b.tag}"`,
      `"${b.description.replace(/"/g, '""')}"`,
      String(b.quantity),
      `"${b.unit}"`,
      `"${b.nominalVoltage ?? ""}"`,
      `"${b.nominalCurrent ?? ""}"`,
      `"${b.nominalPower ?? ""}"`,
      b.breakingCapacityKa ? String(b.breakingCapacityKa) : "",
      `"${b.tripCurve ?? ""}"`,
      `"${b.circuitRef ?? ""}"`,
      `"${b.sourceKind}"`,
      `"${b.validationStatus}"`,
    ]);
  }

  return rows.map((r) => r.join(";")).join("\n");
}
