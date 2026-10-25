import { beforeEach, describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getLocale,
  normalizeLocale,
  ptBR,
  en,
  recordMissingKey,
  getMissingKeys,
  clearMissingKeys,
  hasMissingKeys,
  t,
  useI18nStore,
} from "@/lib/i18n";

// Helper para percorrer recursivamente todas as chaves folha de um objeto
function getAllLeafKeys(obj: Record<string, any>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      keys = keys.concat(getAllLeafKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe("Fase E & F — Motor de Internacionalização Centralizado (pt-BR e en)", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("pt-BR", { syncProfile: false });
    clearMissingKeys();
  });

  it("garante simetria de 100% entre os catálogos pt-BR e en (zero chaves ausentes)", () => {
    const ptKeys = getAllLeafKeys(ptBR).sort();
    const enKeys = getAllLeafKeys(en).sort();

    expect(ptKeys.length).toBeGreaterThan(50);
    expect(enKeys.length).toEqual(ptKeys.length);

    // Nenhuma chave deve estar faltando no catálogo em inglês
    const missingInEn = ptKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);

    // Nenhuma chave extra órfã deve existir no catálogo em inglês
    const extraInEn = enKeys.filter((k) => !ptKeys.includes(k));
    expect(extraInEn).toEqual([]);
  });

  it("normaliza locales legados ('en-US', 'es-ES') para supported locales ('en', 'pt-BR')", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("EN-gb")).toBe("en");
    expect(normalizeLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeLocale("PT")).toBe("pt-BR");
    expect(normalizeLocale(null)).toBe("pt-BR");
    expect(normalizeLocale(undefined)).toBe("pt-BR");
    expect(normalizeLocale("es-ES")).toBe("pt-BR"); // fallback padrão seguro
  });

  it("traduz chaves com notação ponto e suporta interpolação dinâmica de parâmetros", () => {
    // Em pt-BR
    useI18nStore.getState().setLocale("pt-BR", { syncProfile: false });
    expect(t("common.save")).toBe("Salvar");
    expect(t("nav.projects")).toBe("Projetos");
    expect(t("workspace.modes.unifilar")).toBe("Unifilar");
    expect(t("reports.generatedAt", { date: "25/10/2026", norm: "NBR 5410" })).toBe(
      "Gerado em 25/10/2026 · NBR 5410",
    );

    // Em en
    useI18nStore.getState().setLocale("en", { syncProfile: false });
    expect(t("common.save")).toBe("Save");
    expect(t("nav.projects")).toBe("Projects");
    expect(t("workspace.modes.unifilar")).toBe("Single-Line");
    expect(t("reports.generatedAt", { date: "10/25/2026", norm: "NBR 5410" })).toBe(
      "Generated on 10/25/2026 · NBR 5410",
    );
  });

  it("detecta e registra chaves ausentes através do missingKeyDetector com fallback gracioso", () => {
    clearMissingKeys();
    expect(hasMissingKeys()).toBe(false);

    // Chave inexistente deve retornar a própria chave e registrar nos logs
    const result = t("non_existent_domain.missing_key");
    expect(result).toBe("non_existent_domain.missing_key");
    expect(hasMissingKeys()).toBe(true);
    expect(getMissingKeys()).toContain("[pt-BR] non_existent_domain.missing_key");
  });

  it("formata números, moedas e datas conforme o locale respeitando normas internacionais", () => {
    const val = 12500.5;

    // Números
    const numPt = formatNumber(val, "pt-BR");
    const numEn = formatNumber(val, "en");
    expect(numPt).toContain("12.500,5");
    expect(numEn).toContain("12,500.5");

    // Moeda (BRL)
    const curPt = formatCurrency(val, "pt-BR", "BRL");
    const curEn = formatCurrency(val, "en", "BRL");
    expect(curPt).toContain("12.500,50");
    expect(curEn).toContain("12,500.50");

    // Tempo relativo
    const now = Date.now();
    expect(formatRelativeTime(now - 3000, "pt-BR")).toBe("agora");
    expect(formatRelativeTime(now - 3000, "en")).toBe("just now");
    expect(formatRelativeTime(now - 120000, "pt-BR")).toContain("min");
    expect(formatRelativeTime(now - 120000, "en")).toContain("2m ago");
  });

  it("troca de idioma de forma reativa e atômica via toggleLocale()", () => {
    expect(getLocale()).toBe("pt-BR");
    useI18nStore.getState().toggleLocale();
    expect(getLocale()).toBe("en");
    expect(t("common.save")).toBe("Save");
    useI18nStore.getState().toggleLocale();
    expect(getLocale()).toBe("pt-BR");
    expect(t("common.save")).toBe("Salvar");
  });

  it("cobre com 100% de integridade as novas seções da Fase F (projects, bom, sidebars, canvases)", () => {
    // pt-BR
    useI18nStore.getState().setLocale("pt-BR", { syncProfile: false });
    expect(t("projects.title")).toBe("Projetos industriais");
    expect(t("projects.newProject")).toBe("Novo projeto");
    expect(t("bom.title")).toBe("Lista de Materiais (BOM)");
    expect(t("sidebars.unifilarTitle")).toBe("Componentes de Potência e Controle");
    expect(t("sidebars.ladderTitle")).toBe("Elementos Ladder (IEC 61131-3)");
    expect(t("canvases.alarms.colSev")).toBe("Sev.");
    expect(t("canvases.ladder.runScan")).toBe("Simular");
    expect(t("canvases.ladder.stopScan")).toBe("Parar scan");
    expect(t("bottomPanel.opcua")).toBe("OPC-UA");
    expect(t("rightPanel.props")).toBe("Propriedades");
    expect(t("catalogPage.title")).toBe("Catálogo de Componentes");

    // en
    useI18nStore.getState().setLocale("en", { syncProfile: false });
    expect(t("projects.title")).toBe("Industrial Projects");
    expect(t("projects.newProject")).toBe("New project");
    expect(t("bom.title")).toBe("Bill of Materials (BOM)");
    expect(t("sidebars.unifilarTitle")).toBe("Power and Control Components");
    expect(t("sidebars.ladderTitle")).toBe("Ladder Elements (IEC 61131-3)");
    expect(t("canvases.alarms.colSev")).toBe("Sev.");
    expect(t("canvases.ladder.runScan")).toBe("Simulate");
    expect(t("canvases.ladder.stopScan")).toBe("Stop scan");
    expect(t("bottomPanel.opcua")).toBe("OPC-UA");
    expect(t("rightPanel.props")).toBe("Properties");
    expect(t("catalogPage.title")).toBe("Component Catalog");
  });
});
