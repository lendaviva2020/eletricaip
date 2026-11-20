// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { IoMapSchema, type IoPoint } from "@/lib/runtime/io-map";
import { decodeWords, encodeWords, planReads } from "@/lib/runtime/modbus-codec";
import { ModbusTcpClient, ModbusError } from "@/lib/runtime/node/modbus-tcp-client";
import { createModbusMemory, startModbusServer } from "@/lib/runtime/node/modbus-tcp-server";
import { FieldIo } from "@/lib/runtime/node/field-io";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function point(
  p: Partial<IoPoint> & Pick<IoPoint, "tag" | "dataType">,
  area: string,
  address: number,
) {
  return IoMapSchema.parse({
    connections: [{ id: "c", kind: "modbus_tcp", host: "127.0.0.1" }],
    points: [
      {
        direction: "input",
        connectionId: "c",
        ...p,
        modbus: { area, address, ...(p.modbus ?? {}) },
      },
    ],
  }).points[0];
}

describe("codec Modbus", () => {
  it("INT com sinal, escala e REAL nas duas ordens de palavra", () => {
    const i = point(
      { tag: "T", dataType: "INT", modbus: { scale: 0.1, offset: 0 } as never },
      "holding_register",
      0,
    );
    expect(decodeWords(i, [0xfffe])).toBeCloseTo(-0.2);
    expect(encodeWords(i, 25.3)).toEqual([253]);
    expect(() => encodeWords(i, 5000)).toThrow(/não cabe/);
    for (const order of ["ABCD", "CDAB"] as const) {
      const r = point(
        { tag: "R", dataType: "REAL", modbus: { wordOrder: order } as never },
        "holding_register",
        0,
      );
      expect(decodeWords(r, encodeWords(r, 3.5))).toBe(3.5);
    }
  });

  it("agrupa endereços próximos numa só leitura e separa distantes", () => {
    const pts = [0, 1, 5, 300].map((a, k) =>
      point({ tag: `D${k}`, dataType: "BOOL" }, "discrete_input", a),
    );
    const reg = [0, 200].map((a, k) =>
      point({ tag: `H${k}`, dataType: "INT" }, "holding_register", a),
    );
    const blocks = planReads([...pts, ...reg]);
    expect(blocks.map((b) => [b.area, b.start, b.count])).toEqual([
      ["discrete_input", 0, 6],
      ["discrete_input", 300, 1],
      ["holding_register", 0, 1],
      ["holding_register", 200, 1],
    ]);
  });
});

describe("cliente e E/S de campo contra escravo Modbus TCP real (socket)", () => {
  it("lê entradas, escreve saídas e confere eco", async () => {
    const mem = createModbusMemory();
    mem.discreteInputs.set(0, true);
    mem.input.set(4, 1234);
    const srv = await startModbusServer(mem, 0);
    cleanups.push(srv.close);
    const map = IoMapSchema.parse({
      connections: [
        { id: "io", kind: "modbus_tcp", host: "127.0.0.1", port: srv.port, timeoutMs: 500 },
      ],
      points: [
        {
          tag: "S0_OK",
          direction: "input",
          dataType: "BOOL",
          connectionId: "io",
          modbus: { area: "discrete_input", address: 0 },
        },
        {
          tag: "PT1",
          direction: "input",
          dataType: "INT",
          connectionId: "io",
          modbus: { area: "input_register", address: 4, scale: 0.01 },
        },
        {
          tag: "K1",
          direction: "output",
          dataType: "BOOL",
          connectionId: "io",
          modbus: { area: "coil", address: 7 },
          writeEnabled: true,
          safeValue: false,
        },
        {
          tag: "SP",
          direction: "output",
          dataType: "REAL",
          connectionId: "io",
          modbus: { area: "holding_register", address: 10 },
          writeEnabled: true,
          safeValue: 0,
        },
      ],
      estopTag: "S0_OK",
    });
    const io = new FieldIo(map);
    cleanups.push(() => io.close());
    const inputs = await io.readInputs();
    expect(inputs.find((s) => s.tag === "S0_OK")).toMatchObject({ value: true, ok: true });
    expect(inputs.find((s) => s.tag === "PT1")?.value).toBeCloseTo(12.34);

    const errs = await io.writeOutputs([
      { point: map.points[2], value: true },
      { point: map.points[3], value: 42.5 },
    ]);
    expect(errs).toEqual([]);
    expect(mem.coils.get(7)).toBe(true);
    expect(decodeWords(map.points[3], [mem.holding.get(10)!, mem.holding.get(11)!])).toBe(42.5);
    expect(io.connectionStatus()[0].ok).toBe(true);
  });

  it("exceção do escravo e escravo fora do ar viram erro (sem travar)", async () => {
    const mem = createModbusMemory();
    const srv = await startModbusServer(mem, 0);
    const client = new ModbusTcpClient({
      host: "127.0.0.1",
      port: srv.port,
      unitId: 1,
      timeoutMs: 300,
    });
    cleanups.push(() => client.close());
    await expect(client.request(Buffer.from([0x2b, 0, 0, 0, 0]))).rejects.toMatchObject({
      code: "EXCEPTION",
      exceptionCode: 1,
    });
    client.close();
    await srv.close();
    const other = new ModbusTcpClient({
      host: "127.0.0.1",
      port: srv.port,
      unitId: 1,
      timeoutMs: 300,
    });
    cleanups.push(() => other.close());
    await expect(other.readCoils(0, 1)).rejects.toBeInstanceOf(ModbusError);
  });
});
