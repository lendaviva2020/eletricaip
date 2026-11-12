/**
 * Multi-page Engineering Documentation PDF Generator for Compact Studio (jsPDF).
 */
import jsPDF from "jspdf";
import { PRODUCT_NAME } from "../branding";
import type { CompactProgramModel } from "../domain/types";
import type { RackEngineeringReport } from "../hardware/hardware-engine";
import type { CrossReferenceSummary } from "./cross-reference";

export function buildCompactProgramPdf(
  model: CompactProgramModel,
  rackReport: RackEngineeringReport,
  crossRefs: readonly CrossReferenceSummary[],
): jsPDF {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const drawHeader = (subtitle: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(40, 45, 55);
    doc.text(`${PRODUCT_NAME} — Documentação Técnica de Projeto CLP`, margin, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${model.name} (${model.preferredNotation})`, pageW - margin, 11, { align: "right" });
    doc.setDrawColor(180);
    doc.line(margin, 13.5, pageW - margin, 13.5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(subtitle, margin, 21);
  };

  // Page 1: Summary & Hardware Rack + BOM
  drawHeader("1. Resumo do Projeto, Hardware e Lista de Materiais");
  let y = 29;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`CPU Base: ${model.hardware.basePartCode} · Ciclo: ${model.cycleTimeMs} ms`, margin, y);
  y += 6;
  doc.text(
    `Entradas/Saídas Alocadas: DI=${rackReport.totalDi} · DO=${rackReport.totalDo} · AI=${rackReport.totalAi} · AQ=${rackReport.totalAq}`,
    margin,
    y,
  );
  y += 6;
  doc.text(
    `Total de Páginas: ${model.pages.length} · Blocos: ${model.nodes.length}/${model.hardware.maxBlocks} · Conexões: ${model.connections.length}`,
    margin,
    y,
  );
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Lista de Materiais (BOM):", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  for (const item of rackReport.bom) {
    if (y > pageH - 20) {
      doc.addPage();
      drawHeader("1. Lista de Materiais (cont.)");
      y = 28;
    }
    doc.text(`• ${item.partCode} (x${item.quantity}) — ${item.description}`, margin + 2, y);
    y += 5.5;
  }

  // Page 2: Symbolic I/O Table & Cross-References
  doc.addPage();
  drawHeader("2. Tabela Simbólica de E/S e Referências Cruzadas");
  y = 29;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Símbolos Declarados:", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");

  if (model.ioSymbols.length === 0) {
    doc.text("(Nenhum símbolo declarado manualmente)", margin + 2, y);
    y += 6;
  } else {
    for (const sym of model.ioSymbols) {
      if (y > pageH - 20) {
        doc.addPage();
        drawHeader("2. Tabela Simbólica de E/S (cont.)");
        y = 28;
      }
      doc.text(
        `${sym.address} | ${sym.symbolicName} (${sym.signalType}) — ${sym.comment || "-"}`,
        margin + 2,
        y,
      );
      y += 5.5;
    }
  }

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Referências Cruzadas:", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  for (const ref of crossRefs) {
    if (y > pageH - 20) {
      doc.addPage();
      drawHeader("2. Referências Cruzadas (cont.)");
      y = 28;
    }
    const locs = ref.hits.map((h) => `${h.pageName}:${h.instanceName}(${h.role})`).join(", ");
    doc.text(`${ref.key} [${ref.kind}] (${ref.totalHits}x): ${locs}`, margin + 2, y);
    y += 5.5;
  }

  // Pages 3+: Program Pages
  for (const page of [...model.pages].sort((a, b) => a.order - b.order)) {
    doc.addPage();
    drawHeader(`3. Página de Lógica: ${page.name}`);
    y = 29;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const pageNodes = model.nodes.filter((n) => n.pageId === page.id);
    const pageConns = model.connections.filter((c) => c.pageId === page.id);
    doc.text(`Descrição: ${page.description || "-"} · Blocos: ${pageNodes.length} · Ligações: ${pageConns.length}`, margin, y);
    y += 8;

    for (const node of pageNodes) {
      if (y > pageH - 20) {
        doc.addPage();
        drawHeader(`3. Página ${page.name} (cont.)`);
        y = 28;
      }
      const note = node.comment ? ` // ${node.comment}` : "";
      doc.text(`[${node.blockType}] ${node.instanceName}${note}`, margin + 2, y);
      y += 5.5;
    }
  }

  // Stamp page numbers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.text(`${PRODUCT_NAME} · IEC 61131-3 Clean-Room Engineering`, margin, pageH - 8);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 8, { align: "right" });
  }

  return doc;
}
