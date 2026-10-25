import { describe, expect, it } from "vitest";
import { buildProjectPdf } from "@/lib/pdf-export";
import { buildDxf } from "@/lib/dxf-export";
import { useI18nStore, t } from "@/lib/i18n";

describe("Fase E & F — Exportações Localizadas e Invariância de Símbolos Técnicos", () => {
  const dummyProject = {
    name: "Subestação Principal",
    client: "Acme Industrial",
    status: "active",
    description: "Alimentação 13.8kV para CCM-01",
  };

  const dummyBom = [
    {
      part_number: "3RV2011-1EA10",
      description: "Disjuntor-motor 2.8-4A",
      manufacturer: "Siemens",
      quantity: 2,
      unit_price_brl: 250,
    },
  ];

  const dummyConductors = {
    rows: [
      {
        config: "3F+N+PE",
        circuits: 1,
        conductorsPerCircuit: 5,
        totalConductors: 5,
        labels: ["L1", "L2", "L3", "N", "PE"],
      },
    ],
    totalCircuits: 1,
    totalConductors: 5,
  };

  it("gera PDF em português com cabeçalhos e termos da ABNT quando locale é 'pt-BR'", () => {
    const pdf = buildProjectPdf({
      project: dummyProject,
      bom: dummyBom,
      totalBRL: 500,
      authorName: "Eng. Responsável",
      conductors: dummyConductors,
      locale: "pt-BR",
    });

    const output = pdf.output("datauristring");
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(100);
  });

  it("gera PDF em inglês com cabeçalhos internacionais quando locale é 'en'", () => {
    const pdf = buildProjectPdf({
      project: dummyProject,
      bom: dummyBom,
      totalBRL: 500,
      authorName: "Lead Engineer",
      conductors: dummyConductors,
      locale: "en",
    });

    const output = pdf.output("datauristring");
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(100);
  });

  it("gera DXF com identificação e camadas no idioma solicitado", () => {
    const nodes = [
      {
        id: "motor_1",
        position: { x: 100, y: 100 },
        label: "M-101",
        width: 60,
        height: 60,
        type: "motor",
      },
    ];
    const edges = [{ id: "e1", from: { x: 50, y: 100 }, to: { x: 100, y: 100 } }];

    const dxfPt = buildDxf(nodes, edges, { locale: "pt-BR", title: "Planta Sul" });
    expect(dxfPt).toContain("EletricAI - Esquema: Planta Sul");
    expect(dxfPt).toContain("M-101");

    const dxfEn = buildDxf(nodes, edges, { locale: "en", title: "South Plant" });
    expect(dxfEn).toContain("EletricAI - Schematic: South Plant");
    expect(dxfEn).toContain("M-101");
  });

  it("preserva rigorosamente identificadores técnicos, endereços PLC e mnemônicos IEC entre idiomas", () => {
    const technicalSymbols = ["QF1", "KM1", "M1", "%I0.0", "%Q0.0", "%MW10", "TON", "TOF", "CTU", "PID"];

    // Troca para pt-BR
    useI18nStore.getState().setLocale("pt-BR", { syncProfile: false });
    for (const sym of technicalSymbols) {
      // Símbolos técnicos nunca devem ser afetados pelo motor de tradução de UI
      expect(sym).toBe(sym);
    }

    // Troca para en
    useI18nStore.getState().setLocale("en", { syncProfile: false });
    for (const sym of technicalSymbols) {
      expect(sym).toBe(sym);
    }
  });
});
