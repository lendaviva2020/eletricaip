// Testes da Fase 7: transparência de protocolos (7.1) e endurecimento do sandbox SCADA (7.2).
import { describe, expect, it } from "vitest";
import {
  FROZEN_INTRINSICS,
  SCADA_SCRIPT_TIMEOUT_MS,
  freezeIntrinsics,
} from "@/lib/simulation/sandbox-hardening";

describe("Fase 7.2 — hardening do sandbox SCADA", () => {
  it("define timeout rígido de 100 ms", () => {
    expect(SCADA_SCRIPT_TIMEOUT_MS).toBe(100);
  });

  it("congela intrínsecos e protótipos presentes no escopo", () => {
    const FakeObject = function () {} as unknown as Record<string, unknown>;
    (FakeObject as { prototype: object }).prototype = { toString() {} };
    const FakeArray = function () {} as unknown as Record<string, unknown>;
    (FakeArray as { prototype: object }).prototype = { push() {} };
    const scope: Record<string, unknown> = { Object: FakeObject, Array: FakeArray };

    const frozen = freezeIntrinsics(scope);

    expect(frozen).toEqual(expect.arrayContaining(["Object", "Array"]));
    expect(Object.isFrozen(FakeObject)).toBe(true);
    expect(Object.isFrozen((FakeObject as { prototype: object }).prototype)).toBe(true);
    expect(Object.isFrozen((FakeArray as { prototype: object }).prototype)).toBe(true);
  });

  it("script hostil não consegue poluir protótipo congelado (strict mode lança)", () => {
    const proto = { safe: 1 };
    const Fake = function () {} as unknown as { prototype: object };
    Fake.prototype = proto;
    freezeIntrinsics({ Object: Fake });

    const hostile = new Function("p", '"use strict"; p.evil = true;');
    expect(() => hostile(proto)).toThrow(TypeError);
    expect((proto as Record<string, unknown>).evil).toBeUndefined();
  });

  it("ignora entradas ausentes ou inválidas sem lançar", () => {
    expect(() => freezeIntrinsics({ Object: null, Array: 42 })).not.toThrow();
    expect(freezeIntrinsics({})).toEqual([]);
    expect(FROZEN_INTRINSICS).toContain("Function");
  });
});
