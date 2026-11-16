// Regra do produto: as funcionalidades são da "Documentação EletricAI" /
// "Studio IEC EletricAI". Nenhuma marca de software de terceiros aparece no
// app (textos, componentes, comentários). Exceção: o identificador interno
// CODESYS_VIRTUAL, gravado em projetos salvos e nunca exibido.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const SELF = "no-third-party-brands.test.ts";

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.(ts|tsx)$/.test(name) && name !== SELF && name !== "routeTree.gen.ts") yield p;
  }
}

describe("sem marcas de terceiros no app", () => {
  it("nenhuma menção a EPLAN, PC|SCHEMATIC, ProfiCAD ou CODESYS (exceto o enum interno)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, "utf8").replace(/CODESYS_VIRTUAL/g, "");
      const m = text.match(/\beplan\b|pc\s*\|\s*schematic|proficad|codesys/i);
      if (m) offenders.push(`${file.slice(ROOT.length)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("o painel do editor e o dossiê usam o nome Documentação EletricAI", async () => {
    const { ptBR } = await import("@/lib/i18n/catalogs/pt-BR");
    const { en } = await import("@/lib/i18n/catalogs/en");
    expect(ptBR.docPanel.title).toBe("Documentação EletricAI");
    expect(en.docPanel.title).toBe("EletricAI Documentation");
    expect(ptBR.panelDoc.title).toContain("EletricAI");
  });
});
