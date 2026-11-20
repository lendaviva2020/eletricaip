// IA assistente por editor: contexto real, ações validadas e aplicadas no Ladder,
// prompt de engenheiro que conversa e age.
import { describe, expect, it } from "vitest";
import { createEmptyDoc } from "@/lib/diagram/model";
import type { DiagramDoc, NodeKind } from "@/lib/diagram/schema";
import { assignKitTags, buildStarterKit } from "@/lib/diagram/starter-kits";
import { buildLadderFromUnifilar } from "@/lib/ladder/from-unifilar";
import type { EditorTag } from "@/lib/editor/store";
import {
  buildDiagramContext,
  buildLadderContext,
  editorKeyFromMode,
} from "@/lib/ai/editor-context";
import { actionsForEditor, applyLadderActions, parseActions } from "@/lib/ai/editor-actions";
import { buildAssistantSystemPrompt } from "@/lib/ai/editor-assistant.functions";

const PARAMS: Partial<Record<NodeKind, Record<string, unknown>>> = {
  breaker: { kind: "breaker", in_A: 25, curve: "D", poles: 3 },
  contactor: { kind: "contactor", in_A: 25, coil_V: 24 },
  thermal_relay: { kind: "thermal_relay", in_A: 16, trip_class: "10A" },
  motor: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
};
function dolDoc(): DiagramDoc {
  const base = createEmptyDoc();
  const kit = assignKitTags(
    base,
    buildStarterKit("dol", { x: 0, y: 0 }, "unifilar", (k) => ({ ...PARAMS[k] })),
  );
  return {
    ...base,
    nodes: Object.fromEntries(kit.nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(kit.edges.map((e) => [e.id, e])),
  };
}
const tagMap = (tags: EditorTag[]) => Object.fromEntries(tags.map((t) => [t.id, t]));

describe("editores e conversas separadas", () => {
  it("cada modo tem a sua conversa (FBD = FB Studio)", () => {
    expect(editorKeyFromMode("ladder")).toBe("ladder");
    expect(editorKeyFromMode("fbd")).toBe("studio");
    expect(editorKeyFromMode("compactStudio")).toBe("studio");
    expect(editorKeyFromMode("unifilar")).not.toBe(editorKeyFromMode("ladder"));
  });
});

describe("contexto real do editor", () => {
  it("unifilar: equipamentos, ligações e diagnóstico reais", () => {
    const ctx = buildDiagramContext(dolDoc(), "unifilar");
    expect(ctx.summary).toContain("tag=M1");
    expect(ctx.summary).toContain("Diagnóstico");
    expect(ctx.issues.length).toBeGreaterThan(0); // sem fonte/cabos → pendências reais
  });

  it("ladder: explica a falha do motor pelo contato aberto", () => {
    const { rungs, tags } = buildLadderFromUnifilar(dolDoc());
    const map = tagMap(tags);
    map.F1_OK = { ...map.F1_OK, value: false }; // térmico disparado
    map.M1_FALHA = { id: "M1_FALHA", name: "M1_FALHA", type: "BOOL", value: true, forced: false };
    const ctx = buildLadderContext(rungs, map);
    expect(ctx.summary).toContain("bloqueada agora por: F1_OK=0");
    expect(ctx.issues.some((i) => i.text.includes("M1_FALHA ativo"))).toBe(true);
  });
});

describe("ações da IA", () => {
  it("valida, filtra por editor e descarta lixo", () => {
    const { actions, rejected } = parseActions([
      { type: "ladder_set_tag", name: "F1_OK", value: true },
      { type: "ladder_set_tag", name: "x; drop table", value: true },
      { type: "diagram_change", instruction: "ligar M2 ao barramento" },
      { type: "rm_rf" },
    ]);
    expect(rejected).toBe(2);
    expect(actionsForEditor("ladder", actions).map((a) => a.type)).toEqual(["ladder_set_tag"]);
    expect(actionsForEditor("unifilar", actions).map((a) => a.type)).toEqual(["diagram_change"]);
  });

  it("aplica no Ladder: rearma térmico (simulação) e cria rede com selo", () => {
    const { actions } = parseActions([
      { type: "ladder_set_tag", name: "F1_OK", value: true },
      {
        type: "ladder_upsert_rung",
        label: "Lâmpada de marcha",
        series: [{ kind: "XIC", operand: "K1" }],
        output: { kind: "OTE", operand: "H1" },
      },
    ]);
    const r = applyLadderActions([], actions, () => "ai-1");
    expect(r.tagValues).toEqual([{ name: "F1_OK", value: true }]);
    expect(r.rungs).toHaveLength(1);
    expect(r.rungs[0].cells[0].map((c) => c.operand)).toEqual(["K1", "", "H1"]);
  });

  it("alterar rede gerada do unifilar a torna do engenheiro (sem source)", () => {
    const { rungs } = buildLadderFromUnifilar(dolDoc());
    const target = rungs.find((r) => r.id.endsWith("-cmd"))!;
    const { actions } = parseActions([
      {
        type: "ladder_upsert_rung",
        id: target.id,
        label: "M1 com sinal de pronto",
        series: [
          { kind: "XIC", operand: "S0_OK" },
          { kind: "XIC", operand: "M1_PARTIR" },
        ],
        sealOperand: "K1",
        output: { kind: "OTE", operand: "K1" },
      },
    ]);
    const r = applyLadderActions(rungs, actions, () => "x");
    const updated = r.rungs.find((x) => x.id === target.id)!;
    expect(updated.source).toBeUndefined();
    expect(updated.cells).toHaveLength(2); // selo em paralelo
  });
});

describe("prompt do assistente", () => {
  it("conversa como engenheiro, não inventa dados e lista só as ações do editor", () => {
    const p = buildAssistantSystemPrompt("ladder", "pt-BR");
    expect(p).toMatch(/Oi! Tudo ótimo/);
    expect(p).toMatch(/Nunca invente/);
    expect(p).toContain("ladder_upsert_rung");
    expect(p).not.toContain('"type":"diagram_change"');
  });
});

import { buildMccDemoDiagram } from "@/lib/simulation/mcc-demo-plant";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { applyCommand } from "@/lib/diagram/commands";
import { buildDiagramValueCommand } from "@/lib/ai/editor-actions";

describe("IA corrige valores do diagrama", () => {
  it("ajuste do relé térmico pela tag elimina o aviso e fica a conferir", () => {
    const doc = buildMccDemoDiagram("2026-01-01T00:00:00.000Z");
    const before = runDiagramDiagnostics(doc).filter((d) => d.id.startsWith("coord_thermal"));
    expect(before.length).toBeGreaterThan(0);
    const f1 = Object.values(doc.nodes).find((n) => n.params.tag === "F1")!;
    const { actions } = parseActions([
      { type: "diagram_set_params", tag: "F1", params: { in_A: 14.4 } },
      { type: "diagram_set_network", earthing: "TN-S" },
      { type: "diagram_set_params", tag: "F1", params: { kind: "motor" } },
      { type: "diagram_set_params", tag: "NAO_EXISTE", params: { in_A: 1 } },
    ]);
    const r = buildDiagramValueCommand(doc, actions);
    expect(r.errors.some((e) => e.includes("NAO_EXISTE"))).toBe(true);
    const after = applyCommand(doc, r.command!);
    expect((after.nodes[f1.id].params as { in_A: number }).in_A).toBe(14.4);
    expect((after.nodes[f1.id].params as { unconfirmed?: string[] }).unconfirmed).toContain("in_A");
    expect(after.metadata.network?.earthing).toBe("TN-S");
    const ids = runDiagramDiagnostics(after).map((d) => d.id);
    expect(ids).not.toContain(`coord_thermal_setting_high_${f1.id}`);
    expect(ids).not.toContain("net_earthing_unknown_rede");
  });
});
