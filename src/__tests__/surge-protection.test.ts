// DPS (proteção contra surtos) — NBR 5410 §5.4.2 / §6.3.5.2, IEC 61643-11.
import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import { DiagramNodeSchema } from "@/lib/diagram/schema";
import {
  analyzeSurgeProtection,
  maxUpForPhaseVoltage,
} from "@/lib/diagram/connection/surge-protection";
import { sizeDiagramCables } from "@/lib/diagram/connection/cable-sizing";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { IEC_81346_CLASS } from "@/lib/documentation/device-designation";

const n = (id: string, params: DiagramNode["params"], y: number): DiagramNode => ({
  id,
  sheet: "unifilar",
  position: { x: 400, y },
  rotation: 0,
  label: id,
  params,
});
const e = (id: string, s: string, t: string, cable?: DiagramEdge["cable"]): DiagramEdge => ({
  id,
  sheet: "unifilar",
  source: s,
  target: t,
  kind: "power",
  circuitConfig: "3F+N+PE",
  ...(cable ? { cable } : {}),
});

type SpdParams = Extract<DiagramNode["params"], { kind: "spd" }>;
function plant(
  opts: {
    spd?: Partial<SpdParams> | null;
    backup?: boolean;
    network?: DiagramDoc["metadata"]["network"];
  } = {},
): DiagramDoc {
  const nodes: DiagramNode[] = [
    n(
      "tr",
      {
        kind: "transformer",
        kVA: 150,
        primary_V: 13800,
        secondary_V: 380,
        vector: "Dyn11",
        tag: "T1",
      },
      0,
    ),
    n("q0", { kind: "breaker", in_A: 250, curve: "C", poles: 3, tag: "Q0" }, 100),
    n("w1", { kind: "busbar", current_A: 250, voltage_V: 380, tag: "W1" }, 200),
    n("q1", { kind: "breaker", in_A: 40, curve: "D", poles: 3, tag: "Q1" }, 300),
    n("m1", { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL", tag: "M1" }, 400),
  ];
  const edges: DiagramEdge[] = [
    e("e1", "tr", "q0"),
    e("e2", "q0", "w1"),
    e("e3", "w1", "q1"),
    e("e4", "q1", "m1"),
  ];
  if (opts.spd !== null) {
    nodes.push(
      n(
        "f9",
        {
          kind: "spd",
          spd_class: "II",
          uc_V: 275,
          up_kV: 1.5,
          in_kA: 20,
          poles: 4,
          tag: "F9",
          ...(opts.spd ?? {}),
        } as SpdParams,
        300,
      ),
    );
    if (opts.backup !== false) {
      nodes.push(n("f8", { kind: "fuse", in_A: 32, tag: "F8" }, 250));
      edges.push(e("s1", "w1", "f8"), e("s2", "f8", "f9"));
    } else {
      edges.push(e("s1", "w1", "f9"));
    }
  }
  return {
    version: 1,
    id: "d",
    metadata: {
      title: "t",
      norms: ["NBR 5410"],
      ...(opts.network ? { network: opts.network } : {}),
    },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
    edges: Object.fromEntries(edges.map((x) => [x.id, x])),
  };
}
const codes = (d: DiagramDoc) => analyzeSurgeProtection(d).findings.map((f) => f.code);

describe("DPS no unifilar", () => {
  it("é um tipo próprio, designado F (IEC 81346)", () => {
    expect(DiagramNodeSchema.safeParse(plant().nodes.f9).success).toBe(true);
    expect(IEC_81346_CLASS.spd).toBe("F");
  });

  it("DPS classe II correto no barramento com fusível: nenhuma pendência", () => {
    const r = analyzeSurgeProtection(plant({ network: { overheadSupply: true } }));
    expect(r.originSpdIds).toEqual(["f9"]);
    expect(r.findings).toHaveLength(0);
  });

  it("sem DPS: erro com alimentação aérea, aviso quando não informado", () => {
    const req = analyzeSurgeProtection(
      plant({ spd: null, network: { overheadSupply: true } }),
    ).findings;
    expect(req.find((f) => f.code === "SPD_MISSING_AT_ORIGIN")?.severity).toBe("error");
    const unk = analyzeSurgeProtection(plant({ spd: null })).findings;
    expect(unk.find((f) => f.code === "SPD_MISSING_AT_ORIGIN")?.severity).toBe("warning");
  });

  it("SPDA exige classe I com Iimp ≥ 12,5 kA", () => {
    expect(codes(plant({ network: { lightningProtection: true } }))).toContain(
      "SPD_CLASS_I_REQUIRED",
    );
    expect(
      codes(
        plant({
          spd: { spd_class: "I", iimp_kA: 7, in_kA: undefined },
          network: { lightningProtection: true },
        }),
      ),
    ).toContain("SPD_IIMP_LOW");
    expect(
      codes(
        plant({ spd: { spd_class: "I", iimp_kA: 12.5 }, network: { lightningProtection: true } }),
      ),
    ).toHaveLength(0);
  });

  it("Uc, Up e In fora dos limites", () => {
    expect(codes(plant({ spd: { uc_V: 230 } }))).toContain("SPD_UC_LOW"); // < 1,1 × 219 V
    expect(codes(plant({ spd: { up_kV: 4 } }))).toContain("SPD_UP_HIGH");
    expect(codes(plant({ spd: { in_kA: 3 } }))).toContain("SPD_IN_LOW");
    expect(codes(plant({ spd: { uc_V: 275 }, network: { earthing: "IT" } }))).toContain(
      "SPD_UC_LOW",
    );
    expect(maxUpForPhaseVoltage(127)).toBe(1.5);
    expect(maxUpForPhaseVoltage(220)).toBe(2.5);
  });

  it("dado de catálogo ausente vira pendência, nunca valor presumido", () => {
    expect(codes(plant({ spd: { uc_V: undefined, up_kV: undefined } }))).toContain(
      "SPD_DATA_MISSING",
    );
  });

  it("DPS sem proteção própria", () => {
    expect(codes(plant({ backup: false }))).toContain("SPD_NO_BACKUP");
  });

  it("cabos do DPS: mínimo 4 mm² (16 mm² classe I), não pelo In do geral", () => {
    const rows = sizeDiagramCables(plant()).rows;
    expect(rows.find((r) => r.edgeId === "s2")?.required_mm2).toBe(4);
    const cls1 = sizeDiagramCables(plant({ spd: { spd_class: "I", iimp_kA: 25 } })).rows;
    expect(cls1.find((r) => r.edgeId === "s2")?.required_mm2).toBe(16);
  });

  it("achados entram no diagnóstico sem invalidar a conectividade", () => {
    const d = runDiagramDiagnostics(plant({ spd: null, network: { overheadSupply: true } }));
    expect(d.some((a) => a.id.startsWith("spd_spd_missing_at_origin"))).toBe(true);
  });
});
