import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LineAccumulator,
  checksum,
  encodeCommand,
  parseDeviceLine,
  pinBit,
} from "@/lib/hardware/serial/protocol";
import {
  BenchConfigSchema,
  DEFAULT_BENCH_CONFIG,
  toEngineering,
  type BenchConfig,
} from "@/lib/hardware/bench-config";
import { evaluateOutputCommand, type LiveState } from "@/lib/hardware/command-guard";
import { generateUnoFirmware, sanitizeComment } from "@/lib/hardware/firmware/uno-firmware";
import { benchConfigFromDiagram } from "@/lib/hardware/bench-from-diagram";
import { BenchController, useBenchStore } from "@/lib/hardware/serial/bench-controller";
import type { DiagramDoc } from "@/lib/diagram/schema";

/** Linhas REAIS emitidas pelo firmware base no simulador (scripts/test-firmware.sh). */
const REAL_HELLO = "HELLO:EAI-UNO-1.0:UNO-R3:4,5,6,7:8,9:2";
const REAL_DATA = "DATA:0:5120,5120:0,0:512:80:0*2E";

describe("protocolo serial", () => {
  it("interpreta as linhas reais do firmware", () => {
    const hello = parseDeviceLine(`${REAL_HELLO}*${checksum(REAL_HELLO)}`);
    expect(hello).toMatchObject({
      ok: true,
      frame: { kind: "hello", outputs: [4, 5, 6, 7], inputs: [8, 9], analogChannels: 2 },
    });
    const data = parseDeviceLine(REAL_DATA);
    expect(data.ok).toBe(true);
    if (data.ok && data.frame.kind === "data") {
      expect(data.frame.analogMean).toEqual([512, 512]);
      expect(pinBit(data.frame.outputsMask, 4)).toBe(true);
      expect(pinBit(data.frame.outputsMask, 6)).toBe(true);
      expect(pinBit(data.frame.inputsMask, 9)).toBe(true);
      expect(data.frame.estop).toBe(false);
    }
  });

  it("rejeita checksum errado, lixo e valores fora de faixa", () => {
    expect(parseDeviceLine("DATA:0:5120,5120:0,0:512:80:0*2F")).toEqual({
      ok: false,
      reason: "checksum",
    });
    expect(parseDeviceLine("ACK:1:1")).toEqual({ ok: false, reason: "malformed" });
    expect(parseDeviceLine("ACK:4:2")).toEqual({ ok: false, reason: "malformed" });
    expect(parseDeviceLine("DATA:0:99999:0:0:0:0")).toEqual({ ok: false, reason: "malformed" });
    expect(parseDeviceLine("X".repeat(200))).toEqual({ ok: false, reason: "too_long" });
    expect(parseDeviceLine("ACK:4:\u0001")).toEqual({ ok: false, reason: "malformed" });
  });

  it("codifica comandos com checksum e recusa pinos da serial", () => {
    expect(encodeCommand({ kind: "set", pin: 4, state: true })).toBe(
      `CMD:4:1*${checksum("CMD:4:1")}\n`,
    );
    expect(() => encodeCommand({ kind: "set", pin: 1, state: true })).toThrow(RangeError);
    expect(() => encodeCommand({ kind: "set", pin: 14, state: true })).toThrow(RangeError);
  });

  it("acumula linhas quebradas e descarta linha longa demais", () => {
    const acc = new LineAccumulator();
    expect(acc.push("ACK:4")).toEqual([]);
    expect(acc.push(":1\nPI")).toEqual(["ACK:4:1"]);
    expect(acc.push("X".repeat(300) + "\nOK\n")).toEqual(["OK"]);
  });
});

function live(over: Partial<LiveState> = {}): LiveState {
  // Q1 e Q2 fechados (bits 8 e 9 = 0), nenhuma saída ligada.
  return {
    connected: true,
    telemetryAgeMs: 100,
    estop: false,
    inputsMask: 0,
    outputsMask: 0,
    ...over,
  };
}

describe("guarda de comando (regra 21 + NBR 5410)", () => {
  const cfg = DEFAULT_BENCH_CONFIG;

  it("exige habilitação explícita para ligar", () => {
    const d = evaluateOutputCommand({
      config: cfg,
      pin: 4,
      desiredOn: true,
      live: live(),
      armed: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.blocking.map((b) => b.code)).toContain("NOT_ARMED");
  });

  it("libera com tudo em ordem, avisando que faltam dados NBR 5410", () => {
    const d = evaluateOutputCommand({
      config: cfg,
      pin: 4,
      desiredOn: true,
      live: live(),
      armed: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.warnings.map((w) => w.code)).toContain("NBR5410_INCOMPLETE");
  });

  it("bloqueia com E-STOP, telemetria velha, disjuntor aberto e intertravamento", () => {
    const base = { config: cfg, desiredOn: true, armed: true } as const;
    expect(
      evaluateOutputCommand({ ...base, pin: 4, live: live({ estop: true }) }).blocking[0]?.code,
    ).toBe("ESTOP");
    expect(
      evaluateOutputCommand({ ...base, pin: 4, live: live({ telemetryAgeMs: 60_000 }) }).allowed,
    ).toBe(false);
    expect(
      evaluateOutputCommand({ ...base, pin: 4, live: live({ inputsMask: 1 << 8 }) }).blocking.map(
        (b) => b.code,
      ),
    ).toContain("BREAKER_OPEN");
    expect(
      evaluateOutputCommand({ ...base, pin: 7, live: live({ outputsMask: 1 << 6 }) }).blocking.map(
        (b) => b.code,
      ),
    ).toContain("INTERLOCK");
  });

  it("desligar é sempre permitido quando conectado, mesmo com E-STOP", () => {
    const d = evaluateOutputCommand({
      config: cfg,
      pin: 4,
      desiredOn: false,
      live: live({ estop: true, outputsMask: 1 << 4 }),
      armed: false,
    });
    expect(d.allowed).toBe(true);
  });

  it("recusa condutor subdimensionado e contato abaixo da carga", () => {
    const bad: BenchConfig = BenchConfigSchema.parse({
      outputs: [
        {
          pin: 4,
          label: "K1",
          loadCurrentA: 30,
          conductorMm2: 1.5,
          breakerA: 32,
          contactRatingA: 9,
        },
      ],
    });
    const codes = evaluateOutputCommand({
      config: bad,
      pin: 4,
      desiredOn: true,
      live: live(),
      armed: true,
    }).blocking.map((b) => b.code);
    expect(codes).toContain("NBR5410_COORDINATION");
    expect(codes).toContain("CONTACT_RATING");
  });
});

describe("configuração e sensores", () => {
  it("recusa pino repetido e intertravamento com pino que não é saída", () => {
    expect(
      BenchConfigSchema.safeParse({
        estopPin: 2,
        outputs: [{ pin: 2, label: "K1" }],
      }).success,
    ).toBe(false);
    expect(
      BenchConfigSchema.safeParse({ outputs: [{ pin: 4, label: "K1", interlockPin: 9 }] }).success,
    ).toBe(false);
  });

  it("converte ACS712 5 A: 2,5 V = 0 A; saturação sinalizada", () => {
    const ch = DEFAULT_BENCH_CONFIG.analog[0];
    const zero = toEngineering(ch, 0, 512, 0);
    expect(zero.unit).toBe("A");
    expect(Math.abs(zero.value ?? 99)).toBeLessThan(0.02);
    expect(toEngineering(ch, 0, 1023, 0).saturated).toBe(true);
    expect(toEngineering(undefined, 3, 300, 0).value).toBeNull();
  });
});

describe("gerador de firmware", () => {
  const fw = generateUnoFirmware(DEFAULT_BENCH_CONFIG);

  it("segue as restrições do ATmega328P", () => {
    expect(fw).not.toMatch(/\bString\b/);
    expect(fw).not.toMatch(/\bdelay\s*\(/);
    expect(fw).not.toMatch(/\bmalloc\b|\bnew\b/);
    expect(fw).toContain("<avr/wdt.h>");
    expect(fw).toContain("wdt_enable");
    expect(fw).toContain("millis()");
  });

  it("o .ino do repositório é exatamente a saída do gerador", () => {
    const committed = readFileSync(
      resolve(__dirname, "../../firmware/arduino-uno/eletricai_uno_base/eletricai_uno_base.ino"),
      "utf8",
    );
    expect(committed).toBe(fw);
  });

  it("é determinístico e não deixa rótulo quebrar o comentário C", () => {
    expect(generateUnoFirmware(DEFAULT_BENCH_CONFIG)).toBe(fw);
    expect(sanitizeComment("K1 */ system(1); /*")).not.toContain("*/");
  });
});

describe("unifilar → bancada", () => {
  it("mapeia contatores para relés e o disjuntor do ramal para entrada auxiliar", () => {
    const doc = {
      version: 2,
      sheets: ["unifilar"],
      nodes: {
        q1: {
          id: "q1",
          sheet: "unifilar",
          position: { x: 0, y: 0 },
          rotation: 0,
          label: "",
          params: { kind: "breaker", tag: "Q1", in_A: 16, curve: "C", poles: 3 },
        },
        k1: {
          id: "k1",
          sheet: "unifilar",
          position: { x: 0, y: 100 },
          rotation: 0,
          label: "",
          params: { kind: "contactor", tag: "K1", in_A: 18, coil_V: 24 },
        },
        m1: {
          id: "m1",
          sheet: "unifilar",
          position: { x: 0, y: 200 },
          rotation: 0,
          label: "",
          params: {
            kind: "motor",
            tag: "M1",
            power_kW: 5.5,
            voltage_V: 380,
            current_A: 11,
            startMethod: "DOL",
          },
        },
      },
      edges: {
        e1: { id: "e1", sheet: "unifilar", kind: "power", source: "q1", target: "k1" },
        e2: { id: "e2", sheet: "unifilar", kind: "power", source: "k1", target: "m1" },
      },
    } as unknown as DiagramDoc;
    const { config, skipped } = benchConfigFromDiagram(doc);
    expect(skipped).toEqual([]);
    expect(config.outputs).toHaveLength(1);
    expect(config.outputs[0]).toMatchObject({
      pin: 4,
      label: "K1",
      unifilarNodeId: "k1",
      loadCurrentA: 11,
      breakerA: 16,
      contactRatingA: 18,
      breakerAuxPin: 8,
    });
    expect(config.outputs[0]?.conductorMm2).toBeUndefined();
    expect(config.inputs[0]).toMatchObject({ pin: 8, role: "breaker_aux", unifilarNodeId: "q1" });
  });
});

describe("controlador serial", () => {
  it("conecta ao receber HELLO e resolve comando pelo ACK", async () => {
    const ctl = new BenchController(() => null);
    ctl.handleLine(`${REAL_HELLO}*${checksum(REAL_HELLO)}`);
    expect(useBenchStore.getState().status).toBe("connected");
    ctl.handleLine(REAL_DATA);
    expect(useBenchStore.getState().data?.outputsMask).toBe(80);
    ctl.handleLine("DATA:lixo*00");
    expect(useBenchStore.getState().badFrames).toBeGreaterThan(0);
    // Sem porta aberta não envia nada.
    await expect(ctl.setOutput(4, true)).resolves.toEqual({
      ok: false,
      error: "Arduino desconectado.",
    });
  });
});
