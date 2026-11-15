import { describe, expect, it } from "vitest";
import { compactBlockDefinitions } from "@/lib/compact-studio/runtime/compact-blocks";
import type { BlockDefinition, BlockState, ExecContext, FbdValue } from "@/lib/fbd/engine";

function harness(type: string, params: Record<string, FbdValue> = {}) {
  const def = compactBlockDefinitions().find((d) => d.type === type) as BlockDefinition;
  if (!def) throw new Error(`bloco ${type} ausente`);
  const state: BlockState = def.initState ? def.initState() : {};
  return (inputs: Record<string, FbdValue>, dtMs = 100) => {
    const ctx: ExecContext = {
      inputs,
      params,
      state,
      dtMs,
      binding: null,
      io: { read: () => undefined, write: () => undefined } as unknown as ExecContext["io"],
      fault: () => undefined,
    };
    return def.execute(ctx);
  };
}

describe("eletric Studio — regressões de blocos", () => {
  it("HOUR_COUNTER não alarma no 1º scan e o R apaga o alarme preservando OT", () => {
    const run = harness("HOUR_COUNTER", { maintenanceMinutes: 1 });
    expect(run({ EN_COUNT: true }).Q).toBe(false);
    let out = run({ EN_COUNT: true }, 60_000);
    expect(out.Q).toBe(true); // intervalo vencido
    out = run({ EN_COUNT: true, R: true });
    expect(out.Q).toBe(false); // reset de manutenção apaga
    expect(out.OT_MIN).toBe(1); // horímetro total preservado
    out = run({ EN_COUNT: true }, 30_000);
    expect(out.Q).toBe(false);
  });

  it("RANDOM_GEN aplica atraso também na ligação", () => {
    const run = harness("RANDOM_GEN", { minMs: 1000, maxMs: 1000 });
    expect(run({ TRG: true }).Q).toBe(false); // borda: ainda desligado
    expect(run({ TRG: true }, 500).Q).toBe(false);
    expect(run({ TRG: true }, 600).Q).toBe(true); // após 1 s liga
  });

  it("PI_CONTROLLER: transferência Manual→Auto sem degrau (bumpless)", () => {
    const run = harness("PI_CONTROLLER", { kc: 5, tiMs: 10_000, minOut: 0, maxOut: 1000 });
    const manual = run({ A_M: false, PV: 400, SP: 500, MQ: 300 });
    expect(manual.AQ).toBe(300);
    const firstAuto = run({ A_M: true, PV: 400, SP: 500 }, 100);
    // Só a parcela integral de um scan (Kc·e·dt/Ti = 5·100·100/10000 = 5).
    expect(Math.abs(Number(firstAuto.AQ) - 300)).toBeLessThanOrEqual(5.01);
  });

  it("PI_CONTROLLER: reset respeita minOut", () => {
    const run = harness("PI_CONTROLLER", { kc: 1, tiMs: 1000, minOut: 200, maxOut: 1000 });
    expect(run({ R: true, A_M: true, PV: 0, SP: 0 }).AQ).toBe(200);
  });
});
