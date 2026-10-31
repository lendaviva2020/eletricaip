// Industrial Technical Engineering Dossier PDF Builder (jsPDF)
// Generates professional, multi-page, print-ready electrical engineering dossier.
// Strict styling, header/footer pagination, formal engineering stamp and complete traceability.

import jsPDF from "jspdf";
import type { CompleteEngineeringDossier } from "./types";
import { BOM_GROUP_NAMES } from "./types";

export function generateEngineeringDossierPdf(dossier: CompleteEngineeringDossier): jsPDF {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  function drawHeaderFooter(pageTitle: string, pageNum: number, totalPages: number) {
    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text("ELÉTRICAI INDUSTRIAL OS · DOSSIÊ TÉCNICO DE ENGENHARIA", margin, 10);
    doc.setFont("helvetica", "normal");
    doc.text(`Projeto: ${dossier.projectName} · Rev. ${dossier.revision}`, pageW - margin, 10, {
      align: "right",
    });
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, 12, pageW - margin, 12);

    // Footer
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
      `Conforme ABNT NBR 5410, NR-10, NR-12 e IEC 61131-3 · Emissão: ${dossier.approval.issueDate || new Date().toLocaleDateString("pt-BR")}`,
      margin,
      pageH - 8,
    );
    doc.text(`Página ${pageNum} de ${totalPages}`, pageW - margin, pageH - 8, {
      align: "right",
    });
    doc.setTextColor(0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1: CAPA TÉCNICA E FOLHA DE ROSTO
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(15, 23, 42); // Navy Dark
  doc.rect(margin, margin, contentW, 42, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("DOSSIÊ TÉCNICO DE ENGENHARIA ELÉTRICA", margin + 6, margin + 16);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(
    "PROJETO EXECUTIVO · MEMÓRIA DE CÁLCULO · BOM INDUSTRIAL · VALIDAÇÃO NORMATIVA",
    margin + 6,
    margin + 26,
  );

  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    "Ambiente Integrado ElétricAi Industrial OS · Conectado à Topologia do Canvas",
    margin + 6,
    margin + 34,
  );

  // Bloco de Identificação
  let y = margin + 50;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 65, "FD");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("IDENTIFICAÇÃO DO PROJETO E INSTALAÇÃO", margin + 6, y + 8);

  doc.setFontSize(9);
  const ident = [
    ["Projeto:", dossier.projectName],
    ["Cliente / Planta:", dossier.clientName || "Não especificado"],
    ["Escopo Técnico:", dossier.scope.toUpperCase()],
    ["Código do Projeto:", dossier.projectId],
    ["Data de Emissão:", dossier.approval.issueDate || new Date().toLocaleDateString("pt-BR")],
    ["Revisão:", `Rev. ${dossier.revision}`],
    ["Responsável Técnico:", dossier.approval.engineerName || "Engenheiro Responsável"],
    [
      "Registro Profissional:",
      dossier.approval.professionalRegistration || "CREA / CFT — Pendente de ART",
    ],
  ];

  let iy = y + 17;
  for (let i = 0; i < ident.length; i++) {
    const col = i % 2 === 0 ? margin + 6 : margin + contentW / 2 + 2;
    doc.setFont("helvetica", "bold");
    doc.text(ident[i][0], col, iy);
    doc.setFont("helvetica", "normal");
    doc.text(ident[i][1], col + 38, iy);
    if (i % 2 === 1) iy += 8;
  }

  // Carimbo de Aprovação Formal
  y += 75;
  const isApproved = dossier.approval.isApproved;
  doc.setDrawColor(isApproved ? 34 : 220, isApproved ? 197 : 38, isApproved ? 94 : 38);
  doc.setFillColor(isApproved ? 240 : 254, isApproved ? 253 : 242, isApproved ? 244 : 242);
  doc.rect(margin, y, contentW, 40, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(isApproved ? 21 : 185, isApproved ? 128 : 28, isApproved ? 61 : 28);
  doc.text(
    isApproved
      ? "✓ PROJETO APROVADO PARA EMISSÃO E FABRICAÇÃO"
      : "⚠ MINUTA TÉCNICA — PENDENTE DE ASSINATURA / REVISÃO DO RESPONSÁVEL",
    margin + 6,
    y + 10,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const stampText = isApproved
    ? `Certifico que os cálculos elétricos, diagramas e dimensionamentos atendem às normas ABNT NBR 5410, NR-10 e NR-12.\nResponsável: ${dossier.approval.engineerName} (${dossier.approval.professionalRegistration}) em ${dossier.approval.issueDate}.`
    : `Este documento constitui minuta de engenharia extraída diretamente do Canvas. A liberação para compras e montagem de painel exige homologação do responsável técnico habilitado com respectiva ART/CFT.`;
  doc.text(stampText, margin + 6, y + 18);

  // Sumário Executivo na capa
  y += 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("SUMÁRIO DO SISTEMA ELÉTRICO", margin, y);

  y += 5;
  const sm = dossier.calculationMemory.summary;
  const summaryBox = [
    ["Potência Instalada:", `${sm.totalInstalledPowerKw} kW`],
    ["Demanda Total Estimada:", `${sm.totalDemandPowerKw} kW`],
    ["Potência Aparente:", `${sm.totalApparentPowerKva} kVA`],
    ["Tensão / Frequência:", `${sm.systemVoltageV} V / ${sm.nominalFrequencyHz} Hz`],
    ["Esquema de Aterramento:", sm.earthingScheme],
    ["Trafo Recomendado:", `${sm.recommendedTransformerKva} kVA`],
    ["Disjuntor Geral:", `${sm.mainBreakerRatingInA} A (Icu ${sm.mainBreakerIcuKa} kA)`],
    ["Alimentador Geral:", `${sm.mainFeederCableMm2} mm² Cu (EPR)`],
  ];

  doc.setFontSize(8.5);
  let sy = y + 4;
  for (let i = 0; i < summaryBox.length; i++) {
    const col = i % 2 === 0 ? margin : margin + contentW / 2;
    doc.setFont("helvetica", "bold");
    doc.text(summaryBox[i][0], col, sy);
    doc.setFont("helvetica", "normal");
    doc.text(summaryBox[i][1], col + 44, sy);
    if (i % 2 === 1) sy += 6;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2: MEMÓRIA DE CÁLCULO ELÉTRICO (NBR 5410 / IEC 60909)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = margin + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("MEMÓRIA DE CÁLCULO E DIMENSIONAMENTO DE CIRCUITOS", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Critérios: ABNT NBR 5410:2004 (Ampacidade Tabelas 36-38, Queda de Tensão §6.2.7 c/ reatância XL=0,08 mΩ/m e Proteção PE Tab. 58)",
    margin,
    y,
  );

  y += 6;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Tabela de Circuitos
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);

  const headers = [
    "Circuito",
    "Descrição",
    "P (kW)",
    "Ib (A)",
    "Cabo mm²",
    "I'z (A)",
    "Disj.",
    "ΔV %",
    "PE mm²",
    "Status",
  ];
  const colXs = [
    margin,
    margin + 20,
    margin + 62,
    margin + 76,
    margin + 94,
    margin + 110,
    margin + 125,
    margin + 140,
    margin + 155,
    margin + 170,
  ];

  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], colXs[i], y);
  }
  y += 3;
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  for (const c of dossier.calculationMemory.circuits) {
    if (y > pageH - 25) {
      doc.addPage();
      y = margin + 10;
    }
    doc.text(c.circuitCode.slice(0, 10), colXs[0], y);
    doc.text(c.description.slice(0, 26), colXs[1], y);
    doc.text(String(c.powerKw), colXs[2], y);
    doc.text(String(c.designCurrentIbA), colXs[3], y);
    doc.text(`${c.selectedCableMm2} Cu`, colXs[4], y);
    doc.text(String(c.correctedAmpacityIzA), colXs[5], y);
    doc.text(`${c.breakerRatingInA}A (${c.breakerCurve})`, colXs[6], y);
    doc.text(`${c.voltageDropPct}%`, colXs[7], y);
    doc.text(`${c.peCableMm2}`, colXs[8], y);
    doc.setTextColor(
      c.ampacityCheckPass && c.voltageDropPass ? 22 : 220,
      c.ampacityCheckPass && c.voltageDropPass ? 101 : 38,
      52,
    );
    doc.text(c.ampacityCheckPass && c.voltageDropPass ? "OK" : "FALHA", colXs[9], y);
    doc.setTextColor(15, 23, 42);
    y += 5;
  }

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Premissas e Critérios Normativos Adotados:", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(70);
  for (const asm of dossier.calculationMemory.calculationAssumptions) {
    doc.text(`• ${asm}`, margin + 3, y);
    y += 4.5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 3: LISTA COMPLETA DE MATERIAIS — BOM (10 GRUPOS)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = margin + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("LISTA COMPLETA DE MATERIAIS (BOM) — 10 GRUPOS INDUSTRIAIS", margin, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Vinculada diretamente aos nós e ligações do Canvas e aos componentes derivados do cálculo.",
    margin,
    y,
  );
  y += 6;

  // Agrupar BOM por categoria
  const groups = [
    "1_protecao_eletrica",
    "2_manobra_comando",
    "3_motores_acionamentos",
    "4_clp_modulos_interfaces",
    "5_sensores_instrumentacao",
    "6_cabos_condutores",
    "7_bornes_acessorios",
    "8_paineis_barramentos_montagem",
    "9_dispositivos_seguranca",
    "10_identificacao_documentacao",
  ] as const;

  for (const grp of groups) {
    const itemsInGrp = dossier.bom.filter((b) => b.category === grp);
    if (itemsInGrp.length === 0) continue;

    if (y > pageH - 30) {
      doc.addPage();
      y = margin + 10;
    }

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(BOM_GROUP_NAMES[grp]?.pt || grp, margin + 3, y + 4.2);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const item of itemsInGrp) {
      if (y > pageH - 20) {
        doc.addPage();
        y = margin + 10;
      }
      doc.setFont("helvetica", "bold");
      doc.text(item.tag, margin + 2, y);
      doc.setFont("helvetica", "normal");
      doc.text(item.description.slice(0, 80), margin + 24, y);
      doc.text(`${item.quantity} ${item.unit}`, pageW - margin - 22, y, { align: "right" });
      doc.text(item.validationStatus.slice(0, 10), pageW - margin, y, { align: "right" });
      y += 4.5;
    }
    y += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 4: FIAÇÃO, RÉGUA DE BORNES E AUTOMAÇÃO CLP
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = margin + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("DOCUMENTAÇÃO DE FIAÇÃO, BORNES E AUTOMAÇÃO CLP", margin, y);

  y += 6;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Régua de Bornes (Terminal Schedule)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Régua de Bornes de Interface Painel-Campo (Borneira X1)", margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 5, "F");
  doc.text("Borne", margin + 3, y + 3.5);
  doc.text("Tag Fio", margin + 18, y + 3.5);
  doc.text("Origem (Painel)", margin + 45, y + 3.5);
  doc.text("Destino (Campo)", margin + 95, y + 3.5);
  doc.text("Tipo Sinal", margin + 145, y + 3.5);
  y += 6;

  for (const t of dossier.terminalsSchedule.slice(0, 12)) {
    doc.setFont("helvetica", "normal");
    doc.text(`${t.blockId}:${t.terminalNumber}`, margin + 3, y);
    doc.text(t.wireTag, margin + 18, y);
    doc.text(`${t.internalEquipment} [${t.internalTerminal}]`, margin + 45, y);
    doc.text(`${t.externalEquipment} [${t.externalTerminal}]`, margin + 95, y);
    doc.text(t.signalType.toUpperCase(), margin + 145, y);
    y += 4.5;
  }

  y += 6;
  // Mapa de I/O do CLP
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Mapeamento de Canais de I/O do CLP (${dossier.plcProgram.cpuModel})`, margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 5, "F");
  doc.text("Endereço", margin + 3, y + 3.5);
  doc.text("Tipo", margin + 25, y + 3.5);
  doc.text("Tag Simbólica", margin + 40, y + 3.5);
  doc.text("Descrição do Sinal / Atuador", margin + 85, y + 3.5);
  y += 6;

  for (const io of dossier.plcProgram.ioMappings.slice(0, 14)) {
    doc.setFont("helvetica", "normal");
    doc.text(io.address, margin + 3, y);
    doc.text(io.direction, margin + 25, y);
    doc.text(io.symbolicTag, margin + 40, y);
    doc.text(io.description.slice(0, 55), margin + 85, y);
    y += 4.5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 5: RELATÓRIO DE VALIDAÇÃO NORMATIVA
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = margin + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("RELATÓRIO DE VALIDAÇÃO TÉCNICA E CONFORMIDADE NORMATIVA", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Auditoria automática contra NBR 5410:2004, NR-10:2019, NR-12:2019, IEC 60204-1 e IEC 61131-3",
    margin,
    y,
  );
  y += 6;
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const rep = dossier.normativeReport;
  for (const f of rep.findings) {
    if (y > pageH - 32) {
      doc.addPage();
      y = margin + 10;
    }

    const isOk = f.status === "VALIDADO";
    const isWarn = f.severity === "warning" || f.status === "REVISAO_PROFISSIONAL_NECESSARIA";

    doc.setDrawColor(
      isOk ? 187 : isWarn ? 254 : 254,
      isOk ? 247 : isWarn ? 240 : 202,
      isOk ? 208 : isWarn ? 138 : 202,
    );
    doc.setFillColor(
      isOk ? 240 : isWarn ? 254 : 254,
      isOk ? 253 : isWarn ? 252 : 242,
      isOk ? 244 : isWarn ? 232 : 242,
    );
    doc.rect(margin, y, contentW, 18, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(
      isOk ? 22 : isWarn ? 161 : 220,
      isOk ? 101 : isWarn ? 98 : 38,
      isOk ? 52 : isWarn ? 7 : 38,
    );
    doc.text(`[${f.status}] ${f.standard} ${f.clause}: ${f.title}`, margin + 3, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(f.description.slice(0, 110), margin + 3, y + 9);
    doc.text(`Ação: ${f.correctiveAction.slice(0, 110)}`, margin + 3, y + 13.5);

    y += 21;
  }

  // Numerar páginas e adicionar cabeçalho/rodapé
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawHeaderFooter(dossier.projectName, p, totalPages);
  }

  return doc;
}
