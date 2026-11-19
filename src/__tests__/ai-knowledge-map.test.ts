import { describe, expect, it } from "vitest";
import { buildDiagramSystemPrompt } from "@/lib/diagram/ai.functions";
import { getArchitectSystemPrompt } from "@/lib/ai-architect.functions";
import { getChatSystemPrompt } from "@/lib/ai-chat.functions";
import { ALL_EDITORS, editorRules } from "@/lib/ai/knowledge/engineering-rules";
import { IEC_81346_CLASS } from "@/lib/documentation/device-designation";

const LOCALES = ["pt-BR", "en"] as const;

describe("mapa de conhecimento da IA — fonte única por editor", () => {
  it.each(LOCALES)("patch do canvas (%s) recebe as regras de unifilar e multifilar", (l) => {
    const p = buildDiagramSystemPrompt(l);
    expect(p).toContain(editorRules(["unifilar"], l));
    expect(p).toContain(editorRules(["multifilar"], l));
    // cabo na ligação, nunca como nó; comprimento só do usuário
    expect(p).toMatch(/updateEdges\[\]\.cable/);
    expect(p).toMatch(/NUNCA crie nó "cabo"|NEVER create a "cable"/);
  });

  it.each(LOCALES)("Arquiteto (%s) recebe unifilar + ladder + Studio", (l) => {
    const p = getArchitectSystemPrompt(l);
    for (const e of ["unifilar", "ladder", "studio"] as const) {
      expect(p).toContain(editorRules([e], l));
    }
  });

  it.each(LOCALES)("chat (%s) recebe o mapa de TODOS os editores", (l) => {
    expect(getChatSystemPrompt(l)).toContain(editorRules(ALL_EDITORS, l));
  });

  it.each(LOCALES)(
    "E-STOP fail-safe (%s): nenhum prompt manda ler entrada de segurança com XIO",
    (l) => {
      const arch = getArchitectSystemPrompt(l);
      expect(arch).not.toMatch(/contato NF \(XIO\) do operand|NC contact \(XIO\) of the E-STOP/);
      expect(arch).toMatch(/XIC \((nunca|never) XIO\)/);
      expect(arch).toMatch(/S0_OK/);
    },
  );

  it("exemplo do patch usa tags IEC 81346 (Q/K/F/M/W), não QF-01/KM-01", () => {
    const p = buildDiagramSystemPrompt("pt-BR");
    expect(p).not.toMatch(/"label": "(QF|KM|F|M)-01/);
    expect(p).toMatch(/"tag": "Q1"/);
    expect(p).toMatch(/"tag": "K1"/);
  });

  it("letras de classe ensinadas à IA são as mesmas da numeração automática", () => {
    const rules = editorRules(["unifilar"], "pt-BR");
    const expectations: Array<[string, string]> = [
      ["breaker", "disjuntor/seccionadora Q"],
      ["thermal_relay", "relé térmico F"],
      ["contactor", "contator/relé K"],
      ["busbar", "barramento W"],
      ["motor", "motor M"],
    ];
    for (const [kind, phrase] of expectations) {
      expect(rules).toContain(phrase);
      expect(phrase.endsWith(IEC_81346_CLASS[kind])).toBe(true);
    }
  });
});
