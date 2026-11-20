// Unifilar → Ladder: mesmas tags, função real de cada equipamento, fail-safe,
// e sincronização que respeita o que o engenheiro editou.
import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import {
  buildLadderFromUnifilar,
  mergeUnifilarRungs,
  isUserEditedUnifilarRung,
} from "@/lib/ladder/from-unifilar";
import { scanRungsPure, createScanState, type PureTags } from "@/lib/ladder/scan-core";
import type { LadderRung } from "@/lib/ladder/types";

const n = (id: string, params: DiagramNode["params"], y = 0): DiagramNode => ({
  id,
  sheet: "unifilar",
  position: { x: 0, y },
  rotation: 0,
  label: id,
  params,
});
const e = (id: string, s: string, t: string): DiagramEdge => ({
  id,
  sheet: "unifilar",
  source: s,
  target: t,
  kind: "power",
});
const doc = (nodes: DiagramNode[], edges: DiagramEdge[]): DiagramDoc => ({
  version: 1,
  id: "d",
  metadata: { title: "t", norms: [] },
  sheets: ["unifilar"],
  nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
  edges: Object.fromEntries(edges.map((x) => [x.id, x])),
});

const dol = () =>
  doc(
    [
      n("w", { kind: "busbar", current_A: 100, voltage_V: 380, tag: "W1" }),
      n("q1", { kind: "breaker", in_A: 25, curve: "D", poles: 3, tag: "Q1" }),
      n("k1", { kind: "contactor", in_A: 25, coil_V: 24, tag: "K1" }),
      n("f1", { kind: "thermal_relay", in_A: 20, trip_class: "10A", tag: "F1" }),
      n("m1", { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL", tag: "M1" }),
    ],
    [e("e1", "w", "q1"), e("e2", "q1", "k1"), e("e3", "k1", "f1"), e("e4", "f1", "m1")],
  );

function run(rungs: LadderRung[], tags: PureTags, scans = 1, now = 0) {
  let t = { ...tags };
  const st = createScanState();
  for (let i = 0; i < scans; i++) t = scanRungsPure(rungs, t, st, now + i * 10).tags;
  return t;
}

describe("Unifilar → Ladder", () => {
  it("partida direta: mesmas tags do unifilar e selo com proteções em série", () => {
    const r = buildLadderFromUnifilar(dol());
    const cmd = r.rungs.find((x) => x.id === "uf-m1-cmd")!;
    const ops = cmd.cells
      .flat()
      .map((c) => c.operand)
      .filter(Boolean);
    expect(ops).toEqual(
      expect.arrayContaining(["S0_OK", "Q1_OK", "F1_OK", "M1_PARAR", "M1_PARTIR", "K1"]),
    );
    const base = Object.fromEntries(r.tags.map((t) => [t.name, t.value])) as PureTags;
    // Pulso de partida liga e o selo mantém.
    let t = run(r.rungs, { ...base, M1_PARTIR: true });
    expect(t.K1).toBe(true);
    t = run(r.rungs, { ...t, M1_PARTIR: false });
    expect(t.K1).toBe(true);
    // Térmico disparado (NF aberto) desliga e acende falha; emergência também desliga.
    expect(run(r.rungs, { ...t, F1_OK: false }).K1).toBe(false);
    expect(run(r.rungs, { ...t, F1_OK: false }).M1_FALHA).toBe(true);
    expect(run(r.rungs, { ...t, S0_OK: false }).K1).toBe(false);
    expect(r.warnings.some((w) => w.includes("emergência"))).toBe(true);
  });

  it("inversor sem contator: comando de marcha do inversor com 'pronto'", () => {
    const d = doc(
      [
        n("q2", { kind: "breaker", in_A: 25, curve: "C", poles: 3, tag: "Q2" }),
        n("t2", { kind: "vfd", power_kW: 5.5, voltage_V: 380, tag: "T2" } as DiagramNode["params"]),
        n("m2", { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "VFD", tag: "M2" }),
      ],
      [e("a", "q2", "t2"), e("b", "t2", "m2")],
    );
    const cmd = buildLadderFromUnifilar(d).rungs.find((x) => x.id === "uf-m2-cmd")!;
    const ops = cmd.cells.flat().map((c) => c.operand);
    expect(ops).toContain("T2_MARCHA");
    expect(ops).toContain("T2_PRONTO");
  });

  it("estrela-triângulo: temporizador e intertravamento Y ↔ Δ", () => {
    const d = dol();
    (d.nodes.m1.params as { startMethod: string }).startMethod = "STAR_DELTA";
    const r = buildLadderFromUnifilar(d);
    const base = Object.fromEntries(r.tags.map((t) => [t.name, t.value])) as PureTags;
    const t0 = run(r.rungs, { ...base, M1_PARTIR: true });
    expect(t0.K1_Y).toBe(true);
    expect(t0.K1_D).toBe(false);
    const st = createScanState();
    let t: PureTags = { ...base, M1_PARTIR: true };
    t = scanRungsPure(r.rungs, t, st, 0).tags;
    t = scanRungsPure(r.rungs, { ...t, M1_PARTIR: false }, st, 6000).tags;
    t = scanRungsPure(r.rungs, t, st, 6010).tags;
    expect(t.K1_D).toBe(true);
    expect(t.K1_Y).toBe(false);
  });

  it("carga não motora com contator vira liga/desliga", () => {
    const d = doc(
      [
        n("q3", { kind: "breaker", in_A: 16, curve: "B", poles: 1, tag: "Q3" }),
        n("k3", { kind: "contactor", in_A: 16, coil_V: 24, tag: "K3" }),
        n("l3", { kind: "lamp", power_W: 400, voltage_V: 220, tag: "E1" } as DiagramNode["params"]),
      ],
      [e("a", "q3", "k3"), e("b", "k3", "l3")],
    );
    const ids = buildLadderFromUnifilar(d).rungs.map((r) => r.id);
    expect(ids).toContain("uf-l3-cmd");
  });

  it("sincronização: rede editada pelo engenheiro é preservada; não editada acompanha; do usuário intacta", () => {
    const gen = buildLadderFromUnifilar(dol()).rungs;
    const user: LadderRung = {
      id: "user-1",
      label: "Minha",
      cols: 3,
      cells: [
        [
          { kind: "XIC", operand: "A" },
          { kind: "EMPTY", operand: "" },
          { kind: "OTE", operand: "B" },
        ],
      ],
    };
    const merged = mergeUnifilarRungs([user], gen);
    expect(merged.map((r) => r.id)).toEqual([...gen.map((g) => g.id), "user-1"]);
    // Sem mudanças → mesma referência (não marca o projeto como alterado).
    expect(mergeUnifilarRungs(merged, gen)).toBe(merged);
    // Engenheiro edita a rede de comando.
    const edited = merged.map((r) =>
      r.id === "uf-m1-cmd"
        ? {
            ...r,
            cells: [
              r.cells[0].map((c, i) => (i === 0 ? { ...c, operand: "S9_OK" } : c)),
              ...r.cells.slice(1),
            ],
          }
        : r,
    );
    expect(isUserEditedUnifilarRung(edited.find((r) => r.id === "uf-m1-cmd")!)).toBe(true);
    const again = mergeUnifilarRungs(edited, gen);
    expect(again.find((r) => r.id === "uf-m1-cmd")!.cells[0][0].operand).toBe("S9_OK");
    // Motor removido do unifilar → rede gerada (não editada) sai.
    const after = mergeUnifilarRungs(merged, []);
    expect(after.map((r) => r.id)).toEqual(["user-1"]);
  });
});

describe("estilo do engenheiro", () => {
  it("bobina já programada numa rede própria não é gerada de novo (sem bobina dupla)", () => {
    const gen = buildLadderFromUnifilar(dol()).rungs;
    const mine: LadderRung = {
      id: "minha-k1",
      label: "K1 do meu jeito",
      cols: 3,
      cells: [
        [
          { kind: "XIC", operand: "BOTAO" },
          { kind: "EMPTY", operand: "" },
          { kind: "OTE", operand: "K1" },
        ],
      ],
    };
    const merged = mergeUnifilarRungs([mine], gen);
    expect(merged.some((r) => r.id === "uf-m1-cmd")).toBe(false);
    expect(merged.some((r) => r.id === "uf-m1-falha")).toBe(true);
  });
});

describe("edição detectada pela lógica efetiva", () => {
  it("editar só o comentário também torna a rede do engenheiro", () => {
    const gen = buildLadderFromUnifilar(dol()).rungs;
    const merged = mergeUnifilarRungs([], gen);
    const withComment = merged.map((r) =>
      r.id === "uf-m1-cmd" ? { ...r, comment: "Meu comentário", label: "Meu comentário" } : r,
    );
    const again = mergeUnifilarRungs(withComment, buildLadderFromUnifilar(dol()).rungs);
    expect(again.find((r) => r.id === "uf-m1-cmd")!.comment).toBe("Meu comentário");
  });

  it("rede gerada após execução do scan (topologia em cache) não conta como editada", () => {
    const gen = buildLadderFromUnifilar(dol()).rungs;
    scanRungsPure(gen, {}, createScanState(), 0);
    expect(gen.some(isUserEditedUnifilarRung)).toBe(false);
  });
});
