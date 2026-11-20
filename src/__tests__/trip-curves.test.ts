// Curvas de disparo (IEC 60898-1 / 60947-4-1), seletividade amperimétrica e
// partida de motor × disparo magnético.
import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import {
  breakerBand,
  cableDamageTime,
  motorStartChecks,
  protectionChain,
  selectivityByCurves,
  thermalRelayBand,
} from "@/lib/diagram/connection/trip-curves";
import { analyzeProtectionCoordination } from "@/lib/diagram/connection/protection-coordination";

const brk = (id: string, In: number, curve: "B" | "C" | "D", y = 0): DiagramNode => ({
  id,
  sheet: "unifilar",
  position: { x: 400, y },
  rotation: 0,
  label: id,
  params: { kind: "breaker", in_A: In, curve, poles: 3, tag: id.toUpperCase() },
});
const node = (id: string, params: DiagramNode["params"], y: number): DiagramNode => ({
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
const doc = (nodes: DiagramNode[], edges: DiagramEdge[]): DiagramDoc => ({
  version: 1,
  id: "d",
  metadata: { title: "t", norms: ["NBR 5410"] },
  sheets: ["unifilar"],
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  edges: Object.fromEntries(edges.map((x) => [x.id, x])),
});

describe("bandas da norma", () => {
  it("disjuntor C16 respeita os pontos da IEC 60898-1", () => {
    const b = breakerBand(brk("q", 16, "C"))!;
    expect(b.tMin(16 * 1.13)).toBe(Infinity); // não dispara
    expect(b.tMax(16 * 1.45)).toBeLessThanOrEqual(3600 * 1.01); // dispara em < 1 h
    expect(b.tMin(16 * 2.55)).toBeCloseTo(1, 0);
    expect(b.tMax(16 * 2.55)).toBeCloseTo(60, -1);
    expect(b.tMin(16 * 4.9)).toBeGreaterThanOrEqual(0.1); // abaixo de 5×In não é instantâneo
    expect(b.tMax(16 * 10)).toBeLessThanOrEqual(0.1); // acima de 10×In abre em ≤ 0,1 s
  });
  it("relé térmico classe 10A dispara entre 2 e 10 s em 7,2 × Ir", () => {
    const r = thermalRelayBand(
      node("f", { kind: "thermal_relay", in_A: 10, trip_class: "10A" }, 0),
    )!;
    expect(r.tMin(10.5)).toBe(Infinity);
    expect(r.tMin(72)).toBeCloseTo(2, 1);
    expect(r.tMax(72)).toBeCloseTo(10, 1);
  });
  it("dano adiabático do cabo: (k·S/I)²", () => {
    const t = cableDamageTime(e("x", "a", "b", { section_mm2: 4, insulation: "PVC" }), 1000);
    expect(t).toBeCloseTo((115 * 4) ** 2 / 1e6, 4);
  });
});

describe("seletividade amperimétrica", () => {
  it("C125 → D40: parcial até o magnético mínimo de montante (625 A)", () => {
    const s = selectivityByCurves(brk("u", 125, "C"), brk("d", 40, "D"), 7000)!;
    expect(s.verdict).toBe("parcial");
    expect(s.limit_A).toBe(625);
    expect(s.overloadRatio).toBeGreaterThan(1.6);
  });
  it("curto do ponto abaixo do limite = total", () => {
    expect(selectivityByCurves(brk("u", 125, "C"), brk("d", 16, "C"), 500)!.verdict).toBe("total");
  });
  it("mesma corrente nominal = nenhuma", () => {
    expect(selectivityByCurves(brk("u", 40, "C"), brk("d", 40, "C"), 500)!.verdict).toBe("nenhuma");
  });
});

describe("partida do motor × disjuntor", () => {
  const plant = (curve: "B" | "C" | "D", start: "DOL" | "VFD" | "STAR_DELTA" = "DOL") =>
    doc(
      [
        brk("q1", 40, curve, 0),
        node("k1", { kind: "contactor", in_A: 32, coil_V: 24 }, 100),
        node("m1", { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: start }, 200),
      ],
      [e("a", "q1", "k1"), e("b", "k1", "m1")],
    );
  it("curva B desarma na partida direta", () => {
    expect(motorStartChecks(plant("B"))[0].verdict).toBe("dispara");
    expect(analyzeProtectionCoordination(plant("B")).findings.map((f) => f.code)).toContain(
      "BREAKER_TRIPS_ON_START",
    );
  });
  it("curva D só tem risco no pico; estrela-triângulo e inversor não", () => {
    expect(motorStartChecks(plant("D"))[0].verdict).toBe("risco_pico");
    expect(motorStartChecks(plant("D", "STAR_DELTA"))[0].verdict).toBe("ok");
    expect(motorStartChecks(plant("B", "VFD"))).toHaveLength(0);
  });
  it("cadeia de proteção da carga, de montante para jusante", () => {
    const c = protectionChain(plant("C"), "m1");
    expect(c.devices.map((d) => d.id)).toEqual(["q1"]);
  });
});
