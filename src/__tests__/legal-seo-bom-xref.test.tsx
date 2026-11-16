// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { fillLegalTokens, termsAcceptanceRecord, TERMS_VERSION } from "@/lib/legal";
import { planBomPricing } from "@/lib/catalog/bom-pricing";
import { buildLadderXrefFromUsages } from "@/lib/ladder/cross-reference";
import { LadderCrossReferencePanel } from "@/components/editor/sidebars/ladder-xref-panel";
import { useEditorStore } from "@/lib/editor/store";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("documentos legais sem dados inventados", () => {
  it("os .md não têm CNPJ, endereço ou telefone fictícios", () => {
    for (const f of ["terms-of-service.md", "privacy-policy.md"]) {
      const md = read(`../../public/legal/${f}`);
      expect(md, f).not.toMatch(/00\.000\.000\/0001-00|Av\. Paulista|0000-0000|@eletricai\.com/);
      expect(md, f).toContain("{{CNPJ}}");
    }
  });

  it("sem configuração aparece 'a informar'; com dados, os reais", () => {
    expect(fillLegalTokens("CNPJ: {{CNPJ}} v{{TERMS_VERSION}}")).toBe(
      `CNPJ: a informar v${TERMS_VERSION}`,
    );
    expect(
      fillLegalTokens("{{LEGAL_NAME}} {{CNPJ}}", {
        legalName: "Empresa X Ltda",
        cnpj: "12.345.678/0001-90",
        address: "-",
        contactEmail: "-",
        privacyEmail: "-",
      }),
    ).toBe("Empresa X Ltda 12.345.678/0001-90");
  });

  it("aceite gravado com versões e data", () => {
    const r = termsAcceptanceRecord(new Date("2026-11-16T12:00:00Z"));
    expect(r).toEqual({
      terms_version: TERMS_VERSION,
      privacy_version: expect.any(String),
      terms_accepted_at: "2026-11-16T12:00:00.000Z",
    });
    const signup = read("../routes/signup.tsx");
    expect(signup).toContain("...termsAcceptanceRecord()");
  });

  it("termos descrevem o vencimento real (3 dias) e o arrependimento do CDC", () => {
    const md = read("../../public/legal/terms-of-service.md");
    expect(md).toContain("3 dias após o vencimento");
    expect(md).toContain("art. 49");
  });
});

describe("páginas por público (SEO)", () => {
  it("rotas públicas com título, descrição, canonical e dados estruturados", () => {
    for (const [file, perfil] of [
      ["para-empresas", "empresa"],
      ["para-autonomos", "autonomo"],
    ] as const) {
      const src = read(`../routes/${file}.tsx`);
      expect(src).toContain('name: "description"');
      expect(src).toContain('rel: "canonical"');
      expect(src).toContain("application/ld+json");
      expect(src).toContain(`perfil: "${perfil}"`);
    }
    const root = read("../routes/__root.tsx");
    expect(root).toContain('"/para-empresas"');
    expect(root).toContain('"/para-autonomos"');
    expect(read("../../public/sitemap.xml")).toContain("/para-autonomos");
    expect(read("../../public/robots.txt")).toContain("Disallow: /settings");
  });
});

describe("BOM ← catálogo da empresa", () => {
  const catalog = [
    { manufacturer: "Siemens", part_number: "3RT2016-1BB41", unit_price: 321.45, currency: "BRL" },
    { manufacturer: "WEG", part_number: "CWB9", unit_price: 99.9, currency: "BRL" },
    { manufacturer: "ABB", part_number: "CWB9", unit_price: 120, currency: "BRL" },
    { manufacturer: "Mouser", part_number: "LM358", unit_price: 0.5, currency: "USD" },
    { manufacturer: "Phoenix", part_number: "UT4", unit_price: null, currency: null },
  ];

  it("preenche só BRL, casando código (e fabricante quando houver)", () => {
    const plan = planBomPricing(
      [
        { id: "1", part_number: "3rt2016-1bb41", manufacturer: null, unit_price_brl: null },
        { id: "2", part_number: "CWB9", manufacturer: "WEG", unit_price_brl: null },
        { id: "3", part_number: "CWB9", manufacturer: null, unit_price_brl: null },
        { id: "4", part_number: "LM358", manufacturer: null, unit_price_brl: null },
        { id: "5", part_number: "UT4", manufacturer: null, unit_price_brl: null },
        { id: "6", part_number: "XYZ", manufacturer: null, unit_price_brl: null },
        { id: "7", part_number: "CWB9", manufacturer: "WEG", unit_price_brl: 80 },
      ],
      catalog,
    );
    expect(plan.updates).toEqual([
      { id: "1", unitPriceBRL: 321.45 },
      { id: "2", unitPriceBRL: 99.9 },
    ]);
    expect(plan).toMatchObject({
      ambiguous: 1,
      otherCurrency: 1,
      withoutPrice: 1,
      notFound: 1,
      keptExisting: 1,
    });
  });

  it("com 'sobrescrever', atualiza preço já digitado", () => {
    const plan = planBomPricing(
      [{ id: "7", part_number: "CWB9", manufacturer: "WEG", unit_price_brl: 80 }],
      catalog,
      { overwrite: true },
    );
    expect(plan.updates).toEqual([{ id: "7", unitPriceBRL: 99.9 }]);
  });
});

describe("referência cruzada no editor Ladder", () => {
  afterEach(() => cleanup());

  it("bobina dupla é erro; contato sem escrita só avisa se não for entrada física", () => {
    const xref = buildLadderXrefFromUsages(
      [
        { operand: "K1", role: "coil", location: "Rede 1" },
        { operand: "K1", role: "coil", location: "Rede 4" },
        { operand: "K1", role: "no", location: "Rede 2" },
        { operand: "B_PARTIDA", role: "no", location: "Rede 1" },
        { operand: "%I0.1", role: "nc", location: "Rede 1" },
        { operand: "AUX_ESQUECIDO", role: "no", location: "Rede 3" },
        { operand: "M_RET", role: "set", location: "Rede 5" },
        // mesma bobina vista 2x na MESMA rede (grade + topologia) não é bobina dupla
        { operand: "H9", role: "coil", location: "Rede 6" },
        { operand: "H9", role: "coil", location: "Rede 6" },
      ],
      { inputTags: new Set(["B_PARTIDA"]) },
    );
    const kinds = xref.issues.map((i) => `${i.kind}:${i.operand}`);
    expect(kinds).toContain("double_coil:K1");
    expect(kinds).toContain("read_never_written:AUX_ESQUECIDO");
    expect(kinds).toContain("set_without_reset:M_RET");
    expect(kinds).not.toContain("read_never_written:B_PARTIDA");
    expect(kinds).not.toContain("double_coil:H9");
    expect(kinds).not.toContain("read_never_written:%I0.1");
    expect(xref.issues[0].severity).toBe("error");
    const k1 = xref.rows.find((r) => r.operand === "K1");
    expect(k1).toMatchObject({ coils: ["Rede 1", "Rede 4"], contactsNo: ["Rede 2"] });
  });

  it("painel mostra as redes reais do editor e filtra", () => {
    useEditorStore.setState({
      editorTags: {},
      rungs: [
        {
          id: "r1",
          cells: [
            [
              { kind: "XIC", operand: "S1" },
              { kind: "OTE", operand: "K1" },
            ],
          ],
        },
        {
          id: "r2",
          cells: [
            [
              { kind: "XIC", operand: "K1" },
              { kind: "OTE", operand: "H1" },
            ],
          ],
        },
      ] as never,
    });
    render(<LadderCrossReferencePanel />);
    const panel = screen.getByTestId("ladder-xref");
    expect(within(panel).getByText("K1")).toBeTruthy();
    expect(within(panel).getByText("H1")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filtrar referência cruzada"), {
      target: { value: "h1" },
    });
    expect(within(panel).queryByText("K1")).toBeNull();
  });
});
