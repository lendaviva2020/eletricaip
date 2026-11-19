import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/index";

describe("i18n scada2 (telas SCADA Fases 2/3)", () => {
  it("resolve chaves em pt-BR e en (sem vazar a chave crua)", () => {
    for (const key of [
      "scada2.health.alarm",
      "scada2.kind.tripped",
      "scada2.tree.searchPlaceholder",
      "scada2.statusBar.physicalOff",
      "scada2.overview.assets",
      "scada2.overview.noDeviation",
      "scada2.alarms.tabActive",
      "scada2.alarms.noRationale",
      "scada2.faceplate.command",
      "scada2.faceplate.noFieldWrite",
    ]) {
      expect(translate(key, undefined, "pt-BR")).not.toBe(key);
      expect(translate(key, undefined, "en")).not.toBe(key);
    }
  });

  it("interpola parâmetros", () => {
    expect(translate("scada2.overview.summary", { n: 3, areas: 2 }, "pt-BR")).toContain("3");
    expect(translate("scada2.statusBar.drivers", { label: "Simulação" }, "en")).toContain(
      "Simulação",
    );
  });
});
