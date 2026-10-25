import jsPDF from "jspdf";
import type { SupportedLocale } from "@/lib/i18n/types";
import { formatDate, formatCurrency } from "@/lib/i18n/format";

interface BomItem {
  part_number: string | null;
  description?: string | null;
  manufacturer?: string | null;
  quantity: number | string;
  unit?: string | null;
  unit_price_brl?: number | string | null;
}

interface ProjectMeta {
  name: string;
  client?: string | null;
  description?: string | null;
  status?: string | null;
}

interface ConductorRow {
  config: string;
  circuits: number;
  conductorsPerCircuit: number;
  totalConductors: number;
  labels: string[];
}

export interface ConductorsSection {
  rows: ConductorRow[];
  totalCircuits: number;
  totalConductors: number;
}

export function buildProjectPdf(opts: {
  project: ProjectMeta;
  bom: BomItem[];
  totalBRL: number;
  authorName?: string | null;
  norm?: string;
  conductors?: ConductorsSection;
  locale?: SupportedLocale;
}): jsPDF {
  const isEn = opts.locale === "en";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(
    isEn ? "EletricAI · Engineering Calculation & Design Report" : "EletricAI · Memorial Descritivo",
    margin,
    y,
  );
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  const nowFormatted = formatDate(new Date(), isEn ? "en" : "pt-BR");
  doc.text(
    isEn
      ? `Generated on ${nowFormatted} · ${opts.norm ?? "NBR 5410 / IEC 60364"}`
      : `Gerado em ${nowFormatted} · ${opts.norm ?? "NBR 5410 / NBR 5444"}`,
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Project block
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(isEn ? "Project identification" : "Identificação do projeto", margin, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const meta: Array<[string, string]> = isEn
    ? [
        ["Project", opts.project.name],
        ["Client", opts.project.client ?? "—"],
        ["Status", opts.project.status ?? "—"],
        ["Engineer", opts.authorName ?? "—"],
      ]
    : [
        ["Projeto", opts.project.name],
        ["Cliente", opts.project.client ?? "—"],
        ["Status", opts.project.status ?? "—"],
        ["Responsável", opts.authorName ?? "—"],
      ];
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + (isEn ? 25 : 30), y);
    y += 5;
  }
  if (opts.project.description) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text(isEn ? "Description:" : "Descrição:", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(opts.project.description, pageW - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 5;
  }

  // Condutores (multifilar)
  const cond = opts.conductors;
  if (cond && cond.rows.length > 0) {
    y += 6;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(
      isEn ? "Multi-line diagram conductors" : "Condutores do diagrama multifilar",
      margin,
      y,
    );
    y += 6;

    const cCols = isEn
      ? [
          { label: "Configuration", w: 32 },
          { label: "Conductors (parallel lines)", w: 68 },
          { label: "Circuits", w: 25, align: "right" as const },
          { label: "Cond./circ.", w: 25, align: "right" as const },
          { label: "Total cond.", w: 25, align: "right" as const },
        ]
      : [
          { label: "Configuração", w: 32 },
          { label: "Condutores (linhas paralelas)", w: 68 },
          { label: "Circuitos", w: 25, align: "right" as const },
          { label: "Cond./circ.", w: 25, align: "right" as const },
          { label: "Total cond.", w: 25, align: "right" as const },
        ];
    doc.setFontSize(8);
    doc.setFillColor(235, 235, 235);
    doc.rect(margin, y - 4, pageW - 2 * margin, 6, "F");
    let cx = margin;
    doc.setFont("helvetica", "bold");
    for (const c of cCols) {
      doc.text(c.label, c.align === "right" ? cx + c.w - 2 : cx + 1, y, {
        align: c.align ?? "left",
      });
      cx += c.w;
    }
    y += 4;
    doc.setFont("helvetica", "normal");

    for (const r of cond.rows) {
      if (y > pageH - 30) {
        doc.addPage();
        y = margin;
      }
      const row = [
        r.config,
        r.labels.join(" · "),
        String(r.circuits),
        String(r.conductorsPerCircuit),
        String(r.totalConductors),
      ];
      cx = margin;
      cCols.forEach((c, i) => {
        const txt = doc.splitTextToSize(String(row[i]), c.w - 2);
        doc.text(txt[0] ?? "", c.align === "right" ? cx + c.w - 2 : cx + 1, y, {
          align: c.align ?? "left",
        });
        cx += c.w;
      });
      y += 5;
    }

    y += 1;
    doc.setFont("helvetica", "bold");
    doc.text(
      isEn
        ? `Total: ${cond.totalCircuits} circuits · ${cond.totalConductors} conductors`
        : `Total: ${cond.totalCircuits} circuitos · ${cond.totalConductors} condutores`,
      pageW - margin,
      y,
      { align: "right" },
    );
    doc.setFont("helvetica", "normal");
    y += 3;
  }

  // BOM
  y += 6;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(isEn ? "Bill of materials (BOM)" : "Lista de materiais (BOM)", margin, y);
  y += 6;

  const cols = isEn
    ? [
        { label: "Part Number", w: 38 },
        { label: "Description", w: 70 },
        { label: "Mfg.", w: 25 },
        { label: "Qty", w: 14, align: "right" as const },
        { label: "Unit price", w: 18, align: "right" as const },
        { label: "Subtotal", w: 20, align: "right" as const },
      ]
    : [
        { label: "Part Number", w: 38 },
        { label: "Descrição", w: 70 },
        { label: "Fab.", w: 25 },
        { label: "Qtd", w: 14, align: "right" as const },
        { label: "R$ unit.", w: 18, align: "right" as const },
        { label: "Subtotal", w: 20, align: "right" as const },
      ];
  doc.setFontSize(8);
  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y - 4, pageW - 2 * margin, 6, "F");
  let x = margin;
  doc.setFont("helvetica", "bold");
  for (const c of cols) {
    doc.text(c.label, c.align === "right" ? x + c.w - 2 : x + 1, y, {
      align: c.align ?? "left",
    });
    x += c.w;
  }
  y += 4;
  doc.setFont("helvetica", "normal");

  for (const it of opts.bom) {
    if (y > pageH - 30) {
      doc.addPage();
      y = margin;
    }
    const qty = Number(it.quantity);
    const price = Number(it.unit_price_brl ?? 0);
    const subtotal = qty * price;
    const row = [
      it.part_number ?? "—",
      it.description ?? "—",
      it.manufacturer ?? "—",
      qty.toString(),
      price ? price.toFixed(2) : "—",
      subtotal ? subtotal.toFixed(2) : "—",
    ];
    x = margin;
    cols.forEach((c, i) => {
      const txt = doc.splitTextToSize(String(row[i]), c.w - 2);
      doc.text(txt[0] ?? "", c.align === "right" ? x + c.w - 2 : x + 1, y, {
        align: c.align ?? "left",
      });
      x += c.w;
    });
    y += 5;
  }

  // Total
  y += 2;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(
    isEn
      ? `Estimated total: ${formatCurrency(opts.totalBRL, "en", "BRL")}`
      : `Total estimado: ${formatCurrency(opts.totalBRL, "pt-BR", "BRL")}`,
    pageW - margin,
    y,
    {
      align: "right",
    },
  );

  // Legal Disclaimer (Isenção de Responsabilidade Técnica — CREA / CFT / Licensed PE)
  y += 8;
  if (y > pageH - 35) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(90);
  const disclaimerText = isEn
    ? ENGINEERING_LEGAL_DISCLAIMER_EN
    : ENGINEERING_LEGAL_DISCLAIMER;
  const disclaimerLines = doc.splitTextToSize(disclaimerText, pageW - 2 * margin);
  doc.text(disclaimerLines, margin, y);
  doc.setTextColor(0);

  // Footer
  const footer = isEn
    ? "EletricAI · Engineering assistance (requires licensed PE/ART sign-off) · page "
    : "EletricAI · Apoio de engenharia (exige validação e ART/TRT CREA/CFT) · página ";
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${footer}${i}/${pages}`, pageW / 2, pageH - 8, { align: "center" });
  }

  return doc;
}

export const ENGINEERING_LEGAL_DISCLAIMER =
  "AVISO DE RESPONSABILIDADE TÉCNICA: Este memorial e os cálculos elétricos gerados pelo EletricAI servem exclusivamente como ferramenta de apoio à engenharia. A execução ou homologação de qualquer instalação exige conferência, validação presencial e emissão de ART/TRT por profissional legalmente habilitado (CREA/CFT), em conformidade com a ABNT NBR 5410, NBR 14039, NR-10 e NR-12.";

export const ENGINEERING_LEGAL_DISCLAIMER_EN =
  "TECHNICAL RESPONSIBILITY DISCLAIMER: This report and electrical calculations generated by ElétricAi are provided strictly as engineering design assistance. Execution or sign-off of any installation requires on-site verification and certification by a legally licensed professional engineer, in accordance with applicable engineering standards (ABNT NBR 5410, IEC 60364, NR-10, and NR-12).";


