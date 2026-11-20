// Kits de partida (direta, estrela-triângulo, reversão) → ramal ligado com tags
// únicas → Ladder com a função de cada contator.
import { describe, expect, it } from "vitest";
import { createEmptyDoc } from "@/lib/diagram/model";
import type { DiagramDoc, NodeKind } from "@/lib/diagram/schema";
import { assignKitTags, buildStarterKit, type StarterKitKind } from "@/lib/diagram/starter-kits";
import { buildLadderFromUnifilar } from "@/lib/ladder/from-unifilar";
import { buildMotorFleet } from "@/lib/simulation/motor-fleet";
import { scanRungsPure, createScanState, type PureTags } from "@/lib/ladder/scan-core";

const PARAMS: Partial<Record<NodeKind, Record<string, unknown>>> = {
  breaker: { kind: "breaker", in_A: 25, curve: "D", poles: 3 },
  contactor: { kind: "contactor", in_A: 25, coil_V: 24 },
  thermal_relay: { kind: "thermal_relay", in_A: 16, trip_class: "10A" },
  motor: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
};

function kitDoc(kind: StarterKitKind): DiagramDoc {
  const base = createEmptyDoc();
  const kit = assignKitTags(
    base,
    buildStarterKit(kind, { x: 400, y: 100 }, "unifilar", (k) => ({ ...PARAMS[k] })),
  );
  return {
    ...base,
    nodes: Object.fromEntries(kit.nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(kit.edges.map((e) => [e.id, e])),
  };
}

const tagsOf = (r: ReturnType<typeof buildLadderFromUnifilar>) =>
  Object.fromEntries(r.tags.map((t) => [t.name, t.value])) as PureTags;

describe("kits de partida", () => {
  it("tags únicas IEC 81346 e o ramal encontra disjuntor, térmico e contatores", () => {
    const d = kitDoc("reversing");
    const tags = Object.values(d.nodes).map((n) => n.params.tag);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toEqual(expect.arrayContaining(["Q1", "K1", "K2", "F1", "M1"]));
    const [m] = buildMotorFleet(d);
    expect(m.chain.breakerId).toBeDefined();
    expect(m.chain.thermalRelayId).toBeDefined();
    expect(m.chain.contactorIds).toHaveLength(2);
    expect(m.config.startMethod).toBe("REVERSING");
  });

  it("reversão: um sentido por vez (intertravamento) e parada antes de inverter", () => {
    const r = buildLadderFromUnifilar(kitDoc("reversing"));
    expect(r.rungs.map((x) => x.id).some((id) => id.endsWith("-fwd"))).toBe(true);
    const st = createScanState();
    let t: PureTags = { ...tagsOf(r), M1_HORARIO: true };
    t = scanRungsPure(r.rungs, t, st, 0).tags;
    expect(t.K1).toBe(true);
    // Pede anti-horário com o horário ligado: bloqueado.
    t = scanRungsPure(r.rungs, { ...t, M1_HORARIO: false, M1_ANTI_HORARIO: true }, st, 10).tags;
    expect(t.K1).toBe(true);
    expect(t.K2).toBe(false);
    // Para, depois inverte.
    t = scanRungsPure(r.rungs, { ...t, M1_ANTI_HORARIO: false, M1_PARAR: false }, st, 20).tags;
    expect(t.K1).toBe(false);
    t = scanRungsPure(r.rungs, { ...t, M1_PARAR: true, M1_ANTI_HORARIO: true }, st, 30).tags;
    expect(t.K2).toBe(true);
    expect(t.K1).toBe(false);
  });

  it("estrela-triângulo: usa os contatores reais do desenho (sem nomes inventados)", () => {
    const r = buildLadderFromUnifilar(kitDoc("star_delta"));
    const ops = new Set(r.rungs.flatMap((x) => x.cells.flat().map((c) => c.operand)));
    expect([...ops].some((o) => o.endsWith("_Y") || o.endsWith("_D"))).toBe(false);
    expect(ops.has("K1") && ops.has("K2") && ops.has("K3")).toBe(true);
    const st = createScanState();
    let t: PureTags = { ...tagsOf(r), M1_PARTIR: true };
    t = scanRungsPure(r.rungs, t, st, 0).tags;
    t = scanRungsPure(r.rungs, { ...t, M1_PARTIR: false }, st, 6000).tags;
    t = scanRungsPure(r.rungs, t, st, 6010).tags;
    // Linha K1 ligada; triângulo (função "delta") ligado; estrela desligada.
    const roleTag = (role: string) =>
      Object.values(kitDoc("star_delta").nodes).find(
        (n) => (n.params as { role?: string }).role === role,
      )!.params.tag as string;
    expect(t[roleTag("line")]).toBe(true);
    expect(t[roleTag("delta")]).toBe(true);
    expect(t[roleTag("star")]).toBe(false);
  });

  it("valores do kit entram como não confirmados quando a biblioteca marca", () => {
    const kit = buildStarterKit("dol", { x: 0, y: 0 }, "unifilar", (k) => ({
      ...PARAMS[k],
      unconfirmed: ["in_A"],
    }));
    expect(kit.nodes.every((n) => (n.params as { unconfirmed?: string[] }).unconfirmed)).toBe(true);
  });
});

import { createEmptyCompactProgramModel } from "@/lib/compact-studio/domain";
import { CompactExecutionEngine } from "@/lib/compact-studio/runtime";
import { validateCompactProgram } from "@/lib/compact-studio/domain/validation";
import {
  UF_PAGE_ID,
  autoSyncStudioFromUnifilar,
  syncMotorLogicFromUnifilar,
} from "@/lib/compact-studio/integration/unifilar-motor-program";

const NOW = "2026-01-01T00:00:00.000Z";
const studioBase = () => ({
  ...createEmptyCompactProgramModel({ nowIso: NOW }),
  hardware: {
    ...createEmptyCompactProgramModel().hardware,
    maxDigitalInputs: 64,
    maxDigitalOutputs: 32,
  },
});

describe("FB Electric Studio acompanha o unifilar", () => {
  it("reversão no Studio: mesmos nomes do Ladder e intertravamento entre sentidos", () => {
    const { model } = syncMotorLogicFromUnifilar(studioBase(), kitDoc("reversing"), NOW);
    const names = model.ioSymbols.map((s) => s.symbolicName);
    expect(names).toEqual(
      expect.arrayContaining([
        "S0_OK",
        "Q1_OK",
        "F1_OK",
        "M1_PARAR",
        "M1_HORARIO",
        "M1_ANTI_HORARIO",
        "K1",
        "K2",
      ]),
    );
    const e = new CompactExecutionEngine(model);
    expect(e.compileOk).toBe(true);
    expect(validateCompactProgram(model).diagnostics.filter((x) => x.severity === "error")).toEqual(
      [],
    );
    e.step(20);
    e.setInput("M1_HORARIO", true);
    e.step(20);
    e.setInput("M1_HORARIO", false);
    let v = e.step(20).variables;
    expect(v.K1).toBe(true);
    e.setInput("M1_ANTI_HORARIO", true);
    e.step(20);
    v = e.step(20).variables;
    expect(v.K2).toBe(false); // bloqueado enquanto K1 ligado
    expect(v.K1).toBe(true);
  });

  it("sincronização: atualiza com o unifilar, nada se igual, e respeita edição do engenheiro", () => {
    const d = kitDoc("dol");
    const first = autoSyncStudioFromUnifilar(studioBase(), d, NOW);
    expect(first.status).toBe("updated");
    const model = (first as { model: ReturnType<typeof studioBase> }).model;
    expect(model.pages.some((p) => p.id === UF_PAGE_ID)).toBe(true);
    expect(autoSyncStudioFromUnifilar(model, d, NOW).status).toBe("unchanged");
    // Mover bloco não é editar a lógica.
    const moved = {
      ...model,
      layout: { ...model.layout, fbd: { ...model.layout.fbd, uf_rs_M1: { x: 999, y: 999 } } },
    };
    expect(autoSyncStudioFromUnifilar(moved, d, NOW).status).toBe("unchanged");
    // Engenheiro muda a lógica (troca parâmetro de um bloco) → página é dele.
    const edited = {
      ...model,
      nodes: model.nodes.map((n) => (n.id === "uf_rs_M1" ? { ...n, instanceName: "MEU_SELO" } : n)),
    };
    expect(autoSyncStudioFromUnifilar(edited, kitDoc("reversing"), NOW).status).toBe(
      "edited_by_user",
    );
    // Unifilar mudou (partida direta → reversão) e a página não foi editada → atualiza.
    const r = autoSyncStudioFromUnifilar(model, kitDoc("reversing"), NOW);
    expect(r.status).toBe("updated");
  });
});

import { buildMultifilarCommands, conductorLabelsFor } from "@/lib/diagram/multifilar";
import { applyCommand } from "@/lib/diagram/commands";

describe("multifilar da reversão", () => {
  it("saída do contator anti-horário tem L1↔L3 trocados", () => {
    let d = kitDoc("reversing");
    for (const c of buildMultifilarCommands(d)) d = applyCommand(d, c);
    const rev = Object.values(d.nodes).find(
      (n) => n.sheet === "unifilar" && (n.params as { role?: string }).role === "reverse",
    )!;
    const fwd = Object.values(d.nodes).find(
      (n) => n.sheet === "unifilar" && (n.params as { role?: string }).role === "forward",
    )!;
    const mf = Object.values(d.edges).filter((e) => e.sheet === "multifilar");
    const fromRev = mf.find((e) => e.source === `mf_${rev.id}`)!;
    const fromFwd = mf.find((e) => e.source === `mf_${fwd.id}`)!;
    expect(fromRev.phaseSwap).toBe(true);
    expect(fromFwd.phaseSwap).toBeUndefined();
    expect(conductorLabelsFor(fromRev.circuitConfig!, true).slice(0, 3)).toEqual([
      "L3",
      "L2",
      "L1",
    ]);
  });
});
