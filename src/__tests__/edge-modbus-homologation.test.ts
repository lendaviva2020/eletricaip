// ELÉTRICAI INDUSTRIAL OS — GATE 3.6 MODBUS TCP HOMOLOGATION TEST SUITE
// Test Suite: Standalone Modbus TCP Read-Only Client Driver & Lab Validation
// Standards: Modbus V1.1b3, Modbus TCP V1.0b, IEC 62443

import { describe, it, expect, beforeEach } from "vitest";
import { ModbusTcpClientDriver, type ModbusAddressConfig } from "@/lib/edge/drivers/modbus-driver";

describe("GATE 3.6 — Modbus TCP Read-Only Driver Homologation", () => {
  let driver: ModbusTcpClientDriver;

  beforeEach(() => {
    driver = new ModbusTcpClientDriver({
      driverId: "drv_modbus_qgbt",
      connectionId: "conn_qgbt_multimeter_01",
      host: "192.168.10.120",
      port: 502,
      unitId: 1,
    });
  });

  it("1. Conexão TCP: Inicializa no estado DISCONNECTED e transiciona para CONNECTED", async () => {
    expect(driver.getState()).toBe("DISCONNECTED");
    const ok = await driver.connect();
    expect(ok).toBe(true);
    expect(driver.getState()).toBe("CONNECTED");
    expect(driver.getDiagnostics().connectionState).toBe("CONNECTED");
  });

  it("2. FC1 & FC2: Leitura de Coils e Discrete Inputs (Valores Booleanos)", async () => {
    await driver.connect();

    driver.setLabRegister("COIL", 5, true);
    driver.setLabRegister("COIL", 6, false);
    driver.setLabRegister("DISCRETE_INPUT", 12, true);

    const coilRes = await driver.read({
      area: "COIL",
      address: 5,
      isZeroBased: true,
      dataType: "BOOL",
    });

    expect(coilRes.value).toBe(true);
    expect(coilRes.dataType).toBe("BOOL");
    expect(coilRes.quality).toBe("GOOD");

    const diRes = await driver.read({
      area: "DISCRETE_INPUT",
      address: 12,
      isZeroBased: true,
      dataType: "BOOL",
    });

    expect(diRes.value).toBe(true);
    expect(diRes.quality).toBe("GOOD");
  });

  it("3. FC3: Leitura de Holding Registers (INT16 com sinal e UINT16 sem sinal)", async () => {
    await driver.connect();

    // Store signed -150 in 16-bit register (0xFF6A = 65386 unsigned)
    driver.setLabRegister("HOLDING_REGISTER", 100, 0xff6a);

    // Read as signed INT16
    const signedRes = await driver.read({
      area: "HOLDING_REGISTER",
      address: 100,
      isZeroBased: true,
      dataType: "INT16",
    });
    expect(signedRes.value).toBe(-150);

    // Read as unsigned UINT16
    const unsignedRes = await driver.read({
      area: "HOLDING_REGISTER",
      address: 100,
      isZeroBased: true,
      dataType: "UINT16",
    });
    expect(unsignedRes.value).toBe(65386);
  });

  it("4. FC4: Leitura de Input Registers com conversão de escala linear (EU = Raw * Mult + Offset)", async () => {
    await driver.connect();

    // Raw temperature register: 284 (represents 28.4 °C with factor 0.1)
    driver.setLabRegister("INPUT_REGISTER", 20, 284);

    const res = await driver.read({
      area: "INPUT_REGISTER",
      address: 20,
      isZeroBased: true,
      dataType: "INT16",
      scaleMultiplier: 0.1,
      scaleOffset: 0,
      engineeringUnit: "°C",
    });

    expect(res.value).toBe(28.4);
    expect(res.rawSampleValue).toBe(284);
    expect(res.engineeringUnit).toBe("°C");
  });

  it("5. Decodificação de FLOAT32 (IEEE 754) nos 4 padrões de Endianness", async () => {
    await driver.connect();
    const testFloat = 380.5; // Volts

    // Case A: BIG_ENDIAN (Standard ABCD)
    driver.setLabFloat32("HOLDING_REGISTER", 10, testFloat, "BIG_ENDIAN");
    const resA = await driver.read({
      area: "HOLDING_REGISTER",
      address: 10,
      isZeroBased: true,
      dataType: "FLOAT32",
      endianness: "BIG_ENDIAN",
    });
    expect(resA.value).toBe(380.5);

    // Case B: WORD_SWAPPED (CDAB)
    driver.setLabFloat32("HOLDING_REGISTER", 12, testFloat, "WORD_SWAPPED");
    const resB = await driver.read({
      area: "HOLDING_REGISTER",
      address: 12,
      isZeroBased: true,
      dataType: "FLOAT32",
      endianness: "WORD_SWAPPED",
    });
    expect(resB.value).toBe(380.5);

    // Case C: LITTLE_ENDIAN (DCBA)
    driver.setLabFloat32("HOLDING_REGISTER", 14, testFloat, "LITTLE_ENDIAN");
    const resC = await driver.read({
      area: "HOLDING_REGISTER",
      address: 14,
      isZeroBased: true,
      dataType: "FLOAT32",
      endianness: "LITTLE_ENDIAN",
    });
    expect(resC.value).toBe(380.5);

    // Case D: BYTE_SWAPPED (BADC)
    driver.setLabFloat32("HOLDING_REGISTER", 16, testFloat, "BYTE_SWAPPED");
    const resD = await driver.read({
      area: "HOLDING_REGISTER",
      address: 16,
      isZeroBased: true,
      dataType: "FLOAT32",
      endianness: "BYTE_SWAPPED",
    });
    expect(resD.value).toBe(380.5);
  });

  it("6. Mapeamento One-based vs Zero-based: Tratamento transparente da convenção de endereçamento", async () => {
    await driver.connect();

    driver.setLabRegister("HOLDING_REGISTER", 0, 42); // 0-based offset 0 is 1-based address 1

    const zeroBased = await driver.read({
      area: "HOLDING_REGISTER",
      address: 0,
      isZeroBased: true,
      dataType: "INT16",
    });
    expect(zeroBased.value).toBe(42);

    const oneBased = await driver.read({
      area: "HOLDING_REGISTER",
      address: 1,
      isZeroBased: false,
      dataType: "INT16",
    });
    expect(oneBased.value).toBe(42);
  });

  it("7. Desconexão, Reconexão e Diagnósticos", async () => {
    await driver.connect();
    expect(driver.getState()).toBe("CONNECTED");

    driver.simulateConnectionLoss();
    expect(driver.getState()).toBe("DISCONNECTED");
    expect(driver.getDiagnostics().reconnectCount).toBe(1);

    await expect(
      driver.read({ area: "HOLDING_REGISTER", address: 0, dataType: "INT16" }),
    ).rejects.toThrow(/MODBUS_NOT_CONNECTED/);

    await driver.connect();
    expect(driver.getState()).toBe("CONNECTED");
  });

  it("8. Segurança Física Rígida (Gate 3 Read-Only): Sem Function Codes de Escrita (FC5, FC6, FC15, FC16)", () => {
    expect(driver.capabilities.supportsRead).toBe(true);
    expect(driver.capabilities.supportsWrite).toBe(false);
    expect((driver as unknown as Record<string, unknown>).writeSingleCoil).toBeUndefined();
    expect((driver as unknown as Record<string, unknown>).writeSingleRegister).toBeUndefined();
    expect((driver as unknown as Record<string, unknown>).writeMultipleRegisters).toBeUndefined();
  });
});
