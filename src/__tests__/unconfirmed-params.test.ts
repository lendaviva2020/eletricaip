import { describe, expect, it } from "vitest";
import {
  confirmAllValues,
  confirmValue,
  markAllUnconfirmed,
  markChangedUnconfirmed,
  ratingKeysOf,
} from "@/lib/diagram/unconfirmed-params";

describe("valores não confirmados", () => {
  it("ignora chaves que não são dado nominal", () => {
    expect(
      ratingKeysOf({ kind: "motor", tag: "M1", notes: "x", power_kW: 5.5, model: "" }),
    ).toEqual(["power_kW"]);
  });

  it("marcar tudo é idempotente e preserva pendências anteriores", () => {
    const p = markAllUnconfirmed(
      markAllUnconfirmed({ kind: "motor", power_kW: 5.5, voltage_V: 380 }),
    );
    expect(p.unconfirmed).toEqual(["power_kW", "voltage_V"]);
  });

  it("confirmar um campo e confirmar tudo removem a lista", () => {
    const p = markAllUnconfirmed({ kind: "motor", power_kW: 5.5, voltage_V: 380 });
    expect(confirmValue(p, "power_kW").unconfirmed).toEqual(["voltage_V"]);
    expect("unconfirmed" in confirmAllValues(p)).toBe(false);
  });

  it("mudança de valor pela IA volta a ficar pendente", () => {
    const prev = { kind: "motor", power_kW: 5.5, voltage_V: 380 };
    const next = markChangedUnconfirmed(prev, { ...prev, power_kW: 7.5 });
    expect(next.unconfirmed).toEqual(["power_kW"]);
  });
});
