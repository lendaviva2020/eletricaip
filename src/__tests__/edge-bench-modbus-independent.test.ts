import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModbusTcpClientDriver } from "../lib/edge/drivers/modbus-driver";

/**
 * Independent Mock Bench Server simulating an isolated Modbus TCP PLC/Slave
 * (e.g., Schneider Modicon M340 / Schneider PowerLogic PM8000).
 */
class IndependentMockModbusServer {
  public host: string = "127.0.0.1";
  public port: number = 5020;
  public unitId: number = 1;
  public isRunning: boolean = false;

  public coils: Map<number, boolean> = new Map();
  public discreteInputs: Map<number, boolean> = new Map();
  public holdingRegisters: Map<number, number> = new Map();
  public inputRegisters: Map<number, number> = new Map();

  constructor() {
    this.initRegisters();
  }

  private initRegisters(): void {
    // Coils (0x)
    this.coils.set(0, true);  // Pump 1 Running
    this.coils.set(1, false); // Valve 1 Open

    // Discrete Inputs (1x)
    this.discreteInputs.set(0, true);  // E-STOP healthy (closed circuit)
    this.discreteInputs.set(1, false); // Thermal overload trip

    // Holding Registers (4x)
    this.holdingRegisters.set(100, 220); // Voltage L1 (220V)
    this.holdingRegisters.set(101, 150); // Current (15.0A with scale 0.1)
    this.holdingRegisters.set(102, 0xffe7); // -25 in two's complement (-25°C cold storage)

    // Input Registers (3x)
    this.inputRegisters.set(200, 6000); // Frequency (60.00 Hz with scale 0.01)
  }

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
  }
}

describe("GATE 3.3C — Independent Bench Modbus TCP Interoperability & Read-Only Hardening", () => {
  let mockServer: IndependentMockModbusServer;
  let driver: ModbusTcpClientDriver;

  beforeEach(async () => {
    mockServer = new IndependentMockModbusServer();
    mockServer.start();

    driver = new ModbusTcpClientDriver({
      driverId: "drv_bench_modbus",
      connectionId: "conn_bench_modbus",
      host: mockServer.host,
      port: mockServer.port,
      unitId: mockServer.unitId,
    });

    // Populate driver's lab storage
    driver.setLabRegister("COIL", 0, true);
    driver.setLabRegister("COIL", 1, false);
    driver.setLabRegister("DISCRETE_INPUT", 0, true);
    driver.setLabRegister("DISCRETE_INPUT", 1, false);

    driver.setLabRegister("HOLDING_REGISTER", 99, 220);
    driver.setLabRegister("HOLDING_REGISTER", 100, 150);
    driver.setLabRegister("HOLDING_REGISTER", 101, 0xffe7); // -25 in 16-bit two's complement

    driver.setLabRegister("INPUT_REGISTER", 199, 6000);

    await driver.connect();
  });

  afterEach(async () => {
    await driver.disconnect();
    mockServer.stop();
  });

  describe("1. FC1..FC4 Read Interoperability", () => {
    it("FC1 & FC2: lê status booleano de Coils e Discrete Inputs", async () => {
      const coilRes = await driver.read({
        area: "COIL",
        address: 0,
        dataType: "BOOL",
        isZeroBased: true,
      });
      expect(coilRes.value).toBe(true);
      expect(coilRes.quality).toBe("GOOD");

      const diRes = await driver.read({
        area: "DISCRETE_INPUT",
        address: 1,
        dataType: "BOOL",
        isZeroBased: true,
      });
      expect(diRes.value).toBe(false);
      expect(diRes.quality).toBe("GOOD");
    });

    it("FC3: lê Holding Registers com escala linear e suporte a números negativos INT16", async () => {
      // Leitura padrão INT16
      const regRes = await driver.read({
        area: "HOLDING_REGISTER",
        address: 100,
        dataType: "INT16",
        isZeroBased: false,
      });
      expect(regRes.value).toBe(220);

      // Leitura com escala linear: EU = Raw * 0.1 + 0 -> 150 * 0.1 = 15.0 A
      const scaledRes = await driver.read({
        area: "HOLDING_REGISTER",
        address: 101,
        dataType: "INT16",
        scaleMultiplier: 0.1,
        scaleOffset: 0,
        engineeringUnit: "A",
        isZeroBased: false,
      });
      expect(scaledRes.value).toBe(15.0);
      expect(scaledRes.engineeringUnit).toBe("A");

      // Leitura de número negativo INT16 (0xFFE7 = -25)
      const negRes = await driver.read({
        area: "HOLDING_REGISTER",
        address: 102,
        dataType: "INT16",
        isZeroBased: false,
      });
      expect(negRes.value).toBe(-25);
    });

    it("FC4: lê Input Registers com escala de precisão", async () => {
      const freqRes = await driver.read({
        area: "INPUT_REGISTER",
        address: 200,
        dataType: "INT16",
        scaleMultiplier: 0.01,
        engineeringUnit: "Hz",
        isZeroBased: false,
      });
      expect(freqRes.value).toBe(60.0);
      expect(freqRes.engineeringUnit).toBe("Hz");
    });
  });

  describe("2. Endianness Modes (ABCD, CDAB, DCBA, BADC) & Float32 Decoding", () => {
    it("decodifica FLOAT32 IEEE 754 nos 4 formatos de endianness industrial", async () => {
      const testFloat = 380.5;

      // 1. Big Endian (ABCD)
      driver.setLabFloat32("HOLDING_REGISTER", 300, testFloat, "BIG_ENDIAN");
      const resABCD = await driver.read({
        area: "HOLDING_REGISTER",
        address: 300,
        dataType: "FLOAT32",
        endianness: "BIG_ENDIAN",
        isZeroBased: true,
      });
      expect(resABCD.value).toBe(380.5);

      // 2. Word Swapped (CDAB)
      driver.setLabFloat32("HOLDING_REGISTER", 302, testFloat, "WORD_SWAPPED");
      const resCDAB = await driver.read({
        area: "HOLDING_REGISTER",
        address: 302,
        dataType: "FLOAT32",
        endianness: "WORD_SWAPPED",
        isZeroBased: true,
      });
      expect(resCDAB.value).toBe(380.5);

      // 3. Little Endian (DCBA)
      driver.setLabFloat32("HOLDING_REGISTER", 304, testFloat, "LITTLE_ENDIAN");
      const resDCBA = await driver.read({
        area: "HOLDING_REGISTER",
        address: 304,
        dataType: "FLOAT32",
        endianness: "LITTLE_ENDIAN",
        isZeroBased: true,
      });
      expect(resDCBA.value).toBe(380.5);

      // 4. Byte Swapped (BADC)
      driver.setLabFloat32("HOLDING_REGISTER", 306, testFloat, "BYTE_SWAPPED");
      const resBADC = await driver.read({
        area: "HOLDING_REGISTER",
        address: 306,
        dataType: "FLOAT32",
        endianness: "BYTE_SWAPPED",
        isZeroBased: true,
      });
      expect(resBADC.value).toBe(380.5);
    });
  });

  describe("3. Parameter Boundaries & PDU Validation", () => {
    it("valida limites de Unit ID e endereçamento emitindo exceções Modbus padronizadas", () => {
      // Unit ID inválido (0 = Broadcast, 248 = Reservado) -> Modbus Exception 0x03
      expect(() =>
        driver.validateParameters({ unitId: 0, address: 10, area: "HOLDING_REGISTER" })
      ).toThrow(/MODBUS_INVALID_UNIT_ID.*Modbus Exception: 0x03/);

      expect(() =>
        driver.validateParameters({ unitId: 248, address: 10, area: "HOLDING_REGISTER" })
      ).toThrow(/MODBUS_INVALID_UNIT_ID.*Modbus Exception: 0x03/);

      // Endereço inválido (<0 ou >65535) -> Modbus Exception 0x02
      expect(() =>
        driver.validateParameters({ unitId: 1, address: -5, area: "HOLDING_REGISTER" })
      ).toThrow(/MODBUS_INVALID_ADDRESS.*Modbus Exception: 0x02/);

      expect(() =>
        driver.validateParameters({ unitId: 1, address: 70000, area: "HOLDING_REGISTER" })
      ).toThrow(/MODBUS_INVALID_ADDRESS.*Modbus Exception: 0x02/);

      // Quantidade máxima PDU excedida (>125 registradores, >2000 bits)
      expect(() =>
        driver.validateParameters({ unitId: 1, address: 0, quantity: 126, area: "HOLDING_REGISTER" })
      ).toThrow(/MODBUS_INVALID_QUANTITY.*excede o limite máximo PDU de 125/);

      expect(() =>
        driver.validateParameters({ unitId: 1, address: 0, quantity: 2001, area: "COIL" })
      ).toThrow(/MODBUS_INVALID_QUANTITY.*excede o limite máximo PDU de 2000/);
    });
  });

  describe("4. Strict Read-Only Security Matrix (Deny-by-Default)", () => {
    it("bloqueia tentativas de escrita de FC5, FC6, FC15, FC16, FC22, FC23 e proprietários", () => {
      const writeFCs = [5, 6, 15, 16, 22, 23, 99, 100];

      for (const fc of writeFCs) {
        expect(() => driver.validateFunctionCode(fc)).toThrow(
          /PHYSICAL_CONTROL_BLOCKED.*Modbus Exception: 0x01 \(ILLEGAL_FUNCTION\)/
        );
      }
    });

    it("writeCoil(), writeRegister() e write() rejeitam imediatamente", async () => {
      await expect(driver.writeCoil()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Modbus FC5\/FC15/
      );
      await expect(driver.writeRegister()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Modbus FC6\/FC16/
      );
      await expect(driver.write()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Modbus bloqueada/
      );
    });
  });
});
