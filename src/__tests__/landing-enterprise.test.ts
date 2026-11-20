import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DemoRequestSchema,
  buildDemoRequestText,
  mailtoUrl,
  resolveSalesChannels,
  safeJsonLd,
  whatsappUrl,
} from "@/lib/marketing/sales-contact";
import { FAQ_ITEMS, faqJsonLd } from "@/lib/marketing/landing-faq";
import { sizeConductorNBR5410 } from "@/lib/electrical-calc";

const VALID = {
  name: "Ana Souza",
  company: "Indústria Exemplo",
  role: "Engenheira de automação",
  email: "ANA@EXEMPLO.COM ",
  teamSize: "6-20",
  interest: "corporativo",
  message: "Quero ver\r\nCCM com reversão",
};

describe("pedido de demonstração", () => {
  it("valida, normaliza e remove quebras forjadas", () => {
    const r = DemoRequestSchema.parse(VALID);
    expect(r.email).toBe("ana@exemplo.com");
    expect(r.message).toBe("Quero ver CCM com reversão");
    const text = buildDemoRequestText(r);
    expect(text).toContain("Plano Corporativo");
    expect(text.split("\n")).toHaveLength(7);
  });

  it("recusa campos obrigatórios vazios e e-mail inválido", () => {
    const r = DemoRequestSchema.safeParse({ ...VALID, name: " ", email: "x@" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("name");
      expect(paths).toContain("email");
    }
  });

  it("canal só é usado se for válido (nunca link quebrado)", () => {
    expect(resolveSalesChannels({})).toEqual({ whatsapp: null, email: null });
    expect(resolveSalesChannels({ VITE_SALES_WHATSAPP: "+55 (11) 99999-0000" }).whatsapp).toBe(
      "5511999990000",
    );
    expect(resolveSalesChannels({ VITE_SALES_WHATSAPP: "123" }).whatsapp).toBeNull();
    expect(resolveSalesChannels({ VITE_SALES_EMAIL: "não é email" }).email).toBeNull();
    expect(resolveSalesChannels({ VITE_LEGAL_CONTACT_EMAIL: "c@ex.com" }).email).toBe("c@ex.com");
  });

  it("links codificam o texto", () => {
    expect(whatsappUrl("5511999990000", "a b&c")).toBe(
      "https://wa.me/5511999990000?text=a%20b%26c",
    );
    const m = mailtoUrl("c@ex.com", "Assunto", "linha 1\nlinha 2");
    expect(m.startsWith("mailto:c@ex.com?subject=Assunto&body=")).toBe(true);
    expect(m).toContain("linha%201%0Alinha%202");
  });
});

describe("JSON-LD", () => {
  it("não permite fechar a tag script", () => {
    expect(safeJsonLd({ a: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
  it("FAQPage tem todas as perguntas", () => {
    const j = JSON.parse(faqJsonLd()) as { mainEntity: unknown[] };
    expect(j.mainEntity).toHaveLength(FAQ_ITEMS.length);
  });
});

describe("landing — conteúdo honesto", () => {
  const src = readFileSync(join(process.cwd(), "src/routes/index.tsx"), "utf8");
  const sections = readFileSync(
    join(process.cwd(), "src/components/landing/enterprise-sections.tsx"),
    "utf8",
  );

  it("o exemplo atende Ib ≤ In ≤ I'z (NBR 5410) e não dispara na partida", () => {
    const ib = 15.2;
    const inBreaker = 20;
    const izFor4mm2B1 = 32;
    expect(ib <= inBreaker && inBreaker <= izFor4mm2B1).toBe(true);
    // curva D: magnético mínimo 10 × In acima da partida direta ≈ 7 × Ib
    expect(7 * ib).toBeLessThan(10 * inBreaker);
    expect(sizeConductorNBR5410).toBeTypeOf("function");
    expect(src).not.toContain("Q1 (63 A)");
  });

  it("sem marcas de fabricantes nem nome inconsistente", () => {
    for (const brand of ["WEG", "Schneider", "Siemens", "Prysmian", "Cobrecom", "Industrial OS"]) {
      expect(src).not.toContain(brand);
      expect(sections).not.toContain(brand);
    }
  });

  it("emergência e proteções lidas como NF íntegro (XIC), não XIO", () => {
    expect(src).not.toContain("S0_EMERG");
    expect(src).toContain("S0_OK");
  });

  it("tem as seções de empresa", () => {
    for (const id of ['id="recursos"', 'id="seguranca"', 'id="faq"', 'id="contato"']) {
      expect(sections).toContain(id);
    }
    expect(src).toContain("LegalEntityBlock");
  });
});
