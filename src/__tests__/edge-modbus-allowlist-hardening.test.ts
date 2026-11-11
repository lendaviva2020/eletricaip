import { describe, it, expect, beforeEach } from "vitest";
import { ModbusTcpClientDriver } from "../lib/edge/drivers/modbus-driver";

describe("GATE 3.2A — Modbus TCP Deny-by-Default Allowlist & Protocol Hardening", () => {
  let driver: ModbusTcpClientDriver;

  beforeEach(async () => {
    driver = new ModbusTcpClientDriver({
      driverId: "drv_modbus_hardening",
      connectionId: "conn_modbus_hardening",
      host: "127.0.0.1",
      port: 502,
      unitId: 1,
    });
    await driver.connect();
  });

  describe("1. Function Code Allowlist Enforcement (FC1..FC4 ONLY)", () => {
    it("permite exclusivamente Function Codes de Leitura (FC1, FC2, FC3, FC4)", () => {
      expect(() => driver.validateFunctionCode(1)).not.toThrow(); // Read Coils
      expect(() => driver.validateFunctionCode(2)).not.toThrow(); // Read Discrete Inputs
      expect(() => driver.validateFunctionCode(3)).not.toThrow(); // Read Holding Registers
      expect(() => driver.validateFunctionCode(4)).not.toThrow(); // Read Input Registers
    });

    it("rejeita FC5 (Write Single Coil) com PHYSICAL_CONTROL_BLOCKED e Modbus Exception 0x01", () => {
      expect(() => driver.validateFunctionCode(5)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Function Code Modbus \[5\] não autorizado.*Modbus Exception: 0x01 \(ILLEGAL_FUNCTION\)/,
      );
    });

    it("rejeita FC6 (Write Single Register) com PHYSICAL_CONTROL_BLOCKED e Modbus Exception 0x01", () => {
      expect(() => driver.validateFunctionCode(6)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Function Code Modbus \[6\] não autorizado.*Modbus Exception: 0x01 \(ILLEGAL_FUNCTION\)/,
      );
    });

    it("rejeita FC15 (Write Multiple Coils) com PHYSICAL_CONTROL_BLOCKED e Modbus Exception 0x01", () => {
      expect(() => driver.validateFunctionCode(15)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Function Code Modbus \[15\] não autorizado.*Modbus Exception: 0x01 \(ILLEGAL_FUNCTION\)/,
      );
    });

    it("rejeita FC16 (Write Multiple Registers) com PHYSICAL_CONTROL_BLOCKED e Modbus Exception 0x01", () => {
      expect(() => driver.validateFunctionCode(16)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Function Code Modbus \[16\] não autorizado.*Modbus Exception: 0x01 \(ILLEGAL_FUNCTION\)/,
      );
    });

    it("rejeita FC22 (Mask Write Register) e FC23 (Read/Write Multiple Registers)", () => {
      expect(() => driver.validateFunctionCode(22)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED.*Modbus Exception: 0x01/,
      );
      expect(() => driver.validateFunctionCode(23)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED.*Modbus Exception: 0x01/,
      );
    });

    it("rejeita Function Codes proprietários ou não padronizados (ex: FC99, FC100, FC0)", () => {
      expect(() => driver.validateFunctionCode(0)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED.*Modbus Exception: 0x01/,
      );
      expect(() => driver.validateFunctionCode(99)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED.*Modbus Exception: 0x01/,
      );
      expect(() => driver.validateFunctionCode(127)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED.*Modbus Exception: 0x01/,
      );
    });
  });

  describe("2. Parameter Range & PDU Boundary Validation", () => {
    it("valida Unit ID estritamente entre 1 e 247 (rejeita 0 broadcast e >247 reservado)", () => {
      expect(() =>
        driver.validateParameters({ unitId: 1, address: 0, area: "HOLDING_REGISTER" }),
      ).not.toThrow();

      expect(() =>
        driver.validateParameters({ unitId: 247, address: 0, area: "HOLDING_REGISTER" }),
      ).not.toThrow();

      expect(() =>
        driver.validateParameters({ unitId: 0, address: 0, area: "HOLDING_REGISTER" }),
      ).toThrow(/MODBUS_INVALID_UNIT_ID.*Unit ID \[0\].*Modbus Exception: 0x03/);

      expect(() =>
        driver.validateParameters({ unitId: 248, address: 0, area: "HOLDING_REGISTER" }),
      ).toThrow(/MODBUS_INVALID_UNIT_ID.*Unit ID \[248\].*Modbus Exception: 0x03/);
    });

    it("valida limites de endereço de 0 a 65535 (rejeita negativos e >65535)", () => {
      expect(() =>
        driver.validateParameters({ unitId: 1, address: 0, area: "HOLDING_REGISTER" }),
      ).not.toThrow();

      expect(() =>
        driver.validateParameters({ unitId: 1, address: 65535, area: "HOLDING_REGISTER" }),
      ).not.toThrow();

      expect(() =>
        driver.validateParameters({ unitId: 1, address: -1, area: "HOLDING_REGISTER" }),
      ).toThrow(/MODBUS_INVALID_ADDRESS.*Endereço \[-1\].*Modbus Exception: 0x02/);

      expect(() =>
        driver.validateParameters({ unitId: 1, address: 65536, area: "HOLDING_REGISTER" }),
      ).toThrow(/MODBUS_INVALID_ADDRESS.*Endereço \[65536\].*Modbus Exception: 0x02/);
    });

    it("valida quantidade máxima de registradores por requisição (máximo 125 registradores / PDU)", () => {
      expect(() =>
        driver.validateParameters({
          unitId: 1,
          address: 100,
          area: "HOLDING_REGISTER",
          quantity: 125,
        }),
      ).not.toThrow();

      expect(() =>
        driver.validateParameters({
          unitId: 1,
          address: 100,
          area: "HOLDING_REGISTER",
          quantity: 126,
        }),
      ).toThrow(/MODBUS_INVALID_QUANTITY.*126.*excede o limite máximo PDU de 125/);
    });

    it("valida quantidade máxima de coils/discrete inputs por requisição (máximo 2000 bits / PDU)", () => {
      expect(() =>
        driver.validateParameters({ unitId: 1, address: 100, area: "COIL", quantity: 2000 }),
      ).not.toThrow();

      expect(() =>
        driver.validateParameters({ unitId: 1, address: 100, area: "COIL", quantity: 2001 }),
      ).toThrow(/MODBUS_INVALID_QUANTITY.*2001.*excede o limite máximo PDU de 2000/);
    });
  });

  describe("3. Driver Write Actuation Rejection", () => {
    it("writeCoil() rejeita com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.writeCoil()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Modbus FC5\/FC15/,
      );
    });

    it("writeRegister() rejeita com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.writeRegister()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Modbus FC6\/FC16/,
      );
    });

    it("write() rejeita com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.write()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Modbus bloqueada/,
      );
    });
  });
});
