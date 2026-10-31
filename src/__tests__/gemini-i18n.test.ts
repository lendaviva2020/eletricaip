import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildDiagramSystemPrompt } from "@/lib/diagram/ai.functions";
import { getArchitectSystemPrompt, ARCHITECT_SYSTEM_PROMPT } from "@/lib/ai-architect.functions";
import { getChatSystemPrompt } from "@/lib/ai-chat.functions";
import { ptBR } from "@/lib/i18n/catalogs/pt-BR";
import { en } from "@/lib/i18n/catalogs/en";

describe("Fase G — Integração de Idioma com a IA Google Gemini", () => {
  describe("Diagram AI System Prompts e Invariância de Símbolos Técnicos", () => {
    it("injeta instruções e normas ABNT NBR em pt-BR", () => {
      const promptPt = buildDiagramSystemPrompt("pt-BR");
      expect(promptPt).toContain("Você é o EletricAI Architect");
      expect(promptPt).toContain("Aplique NBR 5410");
      expect(promptPt).toContain("rationale: curto em PT-BR citando as normas tocadas");
      expect(promptPt).toContain("REGRA DE INVARIÂNCIA DE SÍMBOLOS TÉCNICOS");
      expect(promptPt).toContain('"QF1", "KM1", "M1"');
      expect(promptPt).toContain('"%I0.0", "%Q0.0"');
    });

    it("injeta instruções e normas IEC/IEEE em en", () => {
      const promptEn = buildDiagramSystemPrompt("en");
      expect(promptEn).toContain("You are the EletricAI Architect");
      expect(promptEn).toContain("Apply IEC 60364 / IEEE standards");
      expect(promptEn).toContain("rationale: short in English citing touched standards");
      expect(promptEn).toContain("TECHNICAL SYMBOL INVARIANCE RULE");
      expect(promptEn).toContain('"QF1", "KM1", "M1"');
      expect(promptEn).toContain('"%I0.0", "%Q0.0"');
    });

    it("preserva estritamente os identificadores de catálogo e schema em ambos os idiomas", () => {
      const promptPt = buildDiagramSystemPrompt("pt-BR");
      const promptEn = buildDiagramSystemPrompt("en");

      // Invariância de sheets
      for (const sheet of ["unifilar", "multifilar", "ladder"]) {
        expect(promptPt).toContain(sheet);
        expect(promptEn).toContain(sheet);
      }

      // Invariância de kinds canônicos
      const criticalKinds = ["breaker", "rcd", "contactor", "transformer", "motor", "vfd", "estop"];
      for (const kind of criticalKinds) {
        expect(promptPt).toContain(kind);
        expect(promptEn).toContain(kind);
      }

      // Invariância de edge kinds
      for (const edgeKind of ["power", "signal", "pipe", "ground"]) {
        expect(promptPt).toContain(edgeKind);
        expect(promptEn).toContain(edgeKind);
      }
    });
  });

  describe("AI Architect System Prompts e Conformidade Normativa", () => {
    it("injeta diretivas ABNT (NBR 5410, NR-10, NR-12) no prompt pt-BR", () => {
      const promptPt = getArchitectSystemPrompt("pt-BR");
      expect(promptPt).toContain("engenheiro elétrico industrial sênior brasileiro");
      expect(promptPt).toContain("NBR 5410");
      expect(promptPt).toContain("NR-10");
      expect(promptPt).toContain("NR-12");
      expect(promptPt).toContain("REGRA DE INVARIÂNCIA DE SÍMBOLOS TÉCNICOS");
      expect(promptPt).toContain("OTE, OTL, OTU, TON, TOF, TP, CTU, XIC, XIO");
      expect(promptPt).toContain("%I0.0, %Q0.0, %M0.0, %MW10");
    });

    it("injeta diretivas internacionais (IEC 60364, NFPA 70E, ISO 13849) no prompt en", () => {
      const promptEn = getArchitectSystemPrompt("en");
      expect(promptEn).toContain(
        "senior industrial electrical engineer specializing in international standards",
      );
      expect(promptEn).toContain("IEC 60364");
      expect(promptEn).toContain("NFPA 70E");
      expect(promptEn).toContain("ISO 13849");
      expect(promptEn).toContain("TECHNICAL SYMBOL INVARIANCE RULE");
      expect(promptEn).toContain("OTE, OTL, OTU, TON, TOF, TP, CTU, XIC, XIO");
      expect(promptEn).toContain("%I0.0, %Q0.0, %M0.0, %MW10");
    });

    it("mantém retrocompatibilidade através de ARCHITECT_SYSTEM_PROMPT", () => {
      expect(ARCHITECT_SYSTEM_PROMPT).toBe(getArchitectSystemPrompt("pt-BR"));
    });
  });

  describe("AI Copilot Chat Prompts e Streaming", () => {
    it("gera system prompt conversacional adequado para pt-BR e en", () => {
      const chatPt = getChatSystemPrompt("pt-BR");
      expect(chatPt).toContain("EletricAI Copilot");
      expect(chatPt).toContain("PT-BR");
      expect(chatPt).toContain("NBR 5410");
      expect(chatPt).toContain("QF1, KM1, M1, %I0.0, %Q0.0");

      const chatEn = getChatSystemPrompt("en");
      expect(chatEn).toContain("EletricAI Copilot");
      expect(chatEn).toContain("Respond in English");
      expect(chatEn).toContain("IEC 60364");
      expect(chatEn).toContain("QF1, KM1, M1, %I0.0, %Q0.0");
    });
  });

  describe("Validação de Schema de Entrada para Funções Server de IA", () => {
    const LocaleSchema = z.enum(["pt-BR", "en"]).default("pt-BR");

    it("assume pt-BR por padrão quando omitido", () => {
      const parsed = LocaleSchema.parse(undefined);
      expect(parsed).toBe("pt-BR");
    });

    it("aceita explicitamente pt-BR e en", () => {
      expect(LocaleSchema.parse("pt-BR")).toBe("pt-BR");
      expect(LocaleSchema.parse("en")).toBe("en");
    });

    it("rejeita idiomas não suportados", () => {
      expect(() => LocaleSchema.parse("fr-FR")).toThrow();
      expect(() => LocaleSchema.parse("de")).toThrow();
    });
  });

  describe("Catálogos de Tradução i18n para IA (pt-BR e en)", () => {
    it("garante simetria das chaves de IA no RightPanel entre pt-BR e en", () => {
      const ptKeys = Object.keys(ptBR.rightPanel);
      const enKeys = Object.keys(en.rightPanel);
      expect(ptKeys).toEqual(enKeys);

      expect(ptBR.rightPanel.copilotTitle).toBe("EletricAI Copilot");
      expect(en.rightPanel.copilotTitle).toBe("EletricAI Copilot");
      expect(ptBR.rightPanel.applyBtn).toBe("Aplicar");
      expect(en.rightPanel.applyBtn).toBe("Apply");
    });

    it("garante todas as chaves do aiChat em ambos os catálogos", () => {
      const ptChat = ptBR.aiChat;
      const enChat = en.aiChat;
      expect(Object.keys(ptChat)).toEqual(Object.keys(enChat));

      expect(ptChat.title).toBe("NEXUSMIND AI CO-PILOT");
      expect(enChat.title).toBe("NEXUSMIND AI CO-PILOT");

      expect(ptChat.modePatch).toBe("Patch IA");
      expect(enChat.modePatch).toBe("AI Patch");

      expect(ptChat.allCompliant).toContain("NBR 5410");
      expect(enChat.allCompliant).toContain("IEC 60364");

      expect(ptChat.promptPlaceholder).toContain("NBR-5410");
      expect(enChat.promptPlaceholder).toContain("IEC 60364");

      expect(ptChat.quickDirectOnline).toBe("+ Partida Direta");
      expect(enChat.quickDirectOnline).toBe("+ DOL Motor Start");
    });
  });
});
