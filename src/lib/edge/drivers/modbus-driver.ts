// ELÉTRICAI INDUSTRIAL OS — EDGE MODBUS TCP CLIENT DRIVER (READ-ONLY)
// Standards: Modbus Application Protocol Specification V1.1b3, Modbus Messaging on TCP/IP V1.0b
// Official Spec: https://www.modbus.org/modbus-specifications
// Security Boundary: Strictly Read-Only Allowlist (FC1, FC2, FC3, FC4). All other codes are denied by default.

import crypto from "node:crypto";
import type {
  IndustrialDriver,
  IndustrialProtocol,
  DriverCapabilities,
  DriverDiagnostics,
  EdgeConnectionState,
  ReadResult,
  SubscriptionCallback,
} from "../types";
import type { TagQuality, TagDataType } from "../../scada/types";

export type ModbusArea = "COIL" | "DISCRETE_INPUT" | "INPUT_REGISTER" | "HOLDING_REGISTER";

export type ModbusEndianness =
  | "BIG_ENDIAN" // ABCD (Standard Modbus)
  | "LITTLE_ENDIAN" // DCBA
  | "WORD_SWAPPED" // CDAB (Mid-Big)
  | "BYTE_SWAPPED"; // BADC (Mid-Little)

export enum ModbusExceptionCode {
  ILLEGAL_FUNCTION = 0x01,
  ILLEGAL_DATA_ADDRESS = 0x02,
  ILLEGAL_DATA_VALUE = 0x03,
  SERVER_DEVICE_FAILURE = 0x04,
  ACKNOWLEDGE = 0x05,
  SERVER_DEVICE_BUSY = 0x06,
  GATEWAY_PATH_UNAVAILABLE = 0x0a,
  GATEWAY_TARGET_DEVICE_FAILED_TO_RESPOND = 0x0b,
}

export interface ModbusAddressConfig {
  area: ModbusArea;
  address: number; // 0-based or 1-based as specified
  isZeroBased?: boolean;
  unitId?: number; // Slave ID (1-247)
  dataType: TagDataType | "INT16" | "UINT16" | "INT32" | "UINT32" | "FLOAT32" | "FLOAT64";
  endianness?: ModbusEndianness;
  scaleMultiplier?: number;
  scaleOffset?: number;
  engineeringUnit?: string;
  quantity?: number;
}

export interface ModbusDriverConfig {
  driverId: string;
  connectionId: string;
  host: string;
  port?: number; // 502 standard, 802 Modbus Security
  unitId?: number; // Default Unit Identifier (Slave ID)
  timeoutMs?: number;
  retryCount?: number;
  useTls?: boolean; // Modbus Security (Port 802)
}

// Strict allowlist: ONLY Read Function Codes permitted (Deny-by-default)
export const ALLOWED_MODBUS_FUNCTION_CODES = new Set([1, 2, 3, 4]);

export class ModbusTcpClientDriver implements IndustrialDriver {
  public readonly driverId: string;
  public readonly protocol: IndustrialProtocol = "MODBUS_TCP";
  public readonly connectionId: string;
  public readonly endpoint: string;
  public readonly capabilities: DriverCapabilities = {
    supportsRead: true,
    supportsSubscribe: false, // Modbus is polled, but simulated subscriptions are supported via periodic polling
    supportsWrite: false, // STRICTLY READ-ONLY IN GATE 3.2
  };

  /**
   * Hardware safety interlock: Physical write operations are permanently blocked (Deny-by-Default).
   */
  public async writeCoil(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Modbus FC5/FC15 (Write Coil) bloqueado. Gateway opera exclusivamente em modo READ-ONLY. Modbus Exception 0x01 (ILLEGAL_FUNCTION).",
    );
  }

  public async writeRegister(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Modbus FC6/FC16 (Write Register) bloqueado. Gateway opera exclusivamente em modo READ-ONLY. Modbus Exception 0x01 (ILLEGAL_FUNCTION).",
    );
  }

  public async write(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Modbus bloqueada. Gateway opera exclusivamente em modo READ-ONLY.",
    );
  }

  private state: EdgeConnectionState = "DISCONNECTED";
  private diagnostics: DriverDiagnostics;
  private config: ModbusDriverConfig;

  // Lab simulated register storage
  private coils: Map<number, boolean> = new Map();
  private discreteInputs: Map<number, boolean> = new Map();
  private holdingRegisters: Map<number, number> = new Map();
  private inputRegisters: Map<number, number> = new Map();

  private activePollers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: ModbusDriverConfig) {
    this.driverId = config.driverId;
    this.connectionId = config.connectionId;
    this.endpoint = `modbus://${config.host}:${config.port ?? 502}`;
    this.config = {
      port: 502,
      unitId: 1,
      timeoutMs: 3000,
      retryCount: 3,
      useTls: false,
      ...config,
    };

    this.diagnostics = {
      connectionState: "DISCONNECTED",
      lastReadTimestamp: null,
      lastError: null,
      requestsTotal: 0,
      requestsFailed: 0,
      rxBytes: 0,
      txBytes: 0,
      activeSubscriptions: 0,
      reconnectCount: 0,
    };
  }

  public getState(): EdgeConnectionState {
    return this.state;
  }

  public getDiagnostics(): DriverDiagnostics {
    return { ...this.diagnostics, connectionState: this.state };
  }

  public async connect(): Promise<boolean> {
    this.state = "CONNECTING";
    this.diagnostics.requestsTotal++;

    // Simulated TCP Handshake
    this.state = "CONNECTED";
    this.diagnostics.lastError = null;
    return true;
  }

  public async disconnect(): Promise<void> {
    for (const timer of this.activePollers.values()) {
      clearInterval(timer);
    }
    this.activePollers.clear();
    this.state = "STOPPED";
  }

  /**
   * Validates whether a requested Function Code is within the strict Read-Only allowlist.
   * Rejects FC5, FC6, FC15, FC16, FC22, FC23, and any unrecognized function code.
   */
  public validateFunctionCode(fc: number): void {
    if (!ALLOWED_MODBUS_FUNCTION_CODES.has(fc)) {
      this.diagnostics.requestsFailed++;
      throw new Error(
        `PHYSICAL_CONTROL_BLOCKED: Function Code Modbus [${fc}] não autorizado. Gateway opera sob política de negação por padrão (Permitidos exclusivamente FC1, FC2, FC3 e FC4). Modbus Exception: 0x01 (ILLEGAL_FUNCTION).`,
      );
    }
  }

  /**
   * Validates Modbus PDU bounds, addresses, Unit ID and register count.
   */
  public validateParameters(params: {
    unitId?: number;
    address: number;
    quantity?: number;
    area: ModbusArea;
  }): void {
    const unitId = params.unitId ?? this.config.unitId ?? 1;
    if (unitId < 1 || unitId > 247) {
      throw new Error(
        `MODBUS_INVALID_UNIT_ID: Unit ID [${unitId}] fora da faixa permitida (1-247). Modbus Exception: 0x03 (ILLEGAL_DATA_VALUE).`,
      );
    }

    if (params.address < 0 || params.address > 65535) {
      throw new Error(
        `MODBUS_INVALID_ADDRESS: Endereço [${params.address}] fora dos limites (0-65535). Modbus Exception: 0x02 (ILLEGAL_DATA_ADDRESS).`,
      );
    }

    const qty = params.quantity ?? 1;
    if (qty < 1) {
      throw new Error(
        `MODBUS_INVALID_QUANTITY: Quantidade deve ser maior ou igual a 1. Modbus Exception: 0x03 (ILLEGAL_DATA_VALUE).`,
      );
    }

    if (params.area === "COIL" || params.area === "DISCRETE_INPUT") {
      if (qty > 2000) {
        throw new Error(
          `MODBUS_INVALID_QUANTITY: Quantidade de bits (${qty}) excede o limite máximo PDU de 2000.`,
        );
      }
    } else {
      if (qty > 125) {
        throw new Error(
          `MODBUS_INVALID_QUANTITY: Quantidade de registradores (${qty}) excede o limite máximo PDU de 125.`,
        );
      }
    }
  }

  /**
   * Reads a Modbus variable according to explicit address configuration.
   * Enforces deny-by-default allowlist (FC1..FC4 only) and validates PDU parameters.
   */
  public async read(addressStringOrConfig: string | ModbusAddressConfig): Promise<ReadResult> {
    if (this.state !== "CONNECTED") {
      throw new Error(`MODBUS_NOT_CONNECTED: Não é possível ler no estado [${this.state}].`);
    }

    const cfg =
      typeof addressStringOrConfig === "string"
        ? this.parseAddressString(addressStringOrConfig)
        : addressStringOrConfig;

    // Validate FC based on Area
    const fc =
      cfg.area === "COIL"
        ? 1
        : cfg.area === "DISCRETE_INPUT"
          ? 2
          : cfg.area === "INPUT_REGISTER"
            ? 4
            : 3;

    this.validateFunctionCode(fc);
    this.validateParameters({
      unitId: cfg.unitId,
      address: cfg.address,
      quantity: cfg.quantity,
      area: cfg.area,
    });

    this.diagnostics.requestsTotal++;
    this.diagnostics.txBytes += 12; // MBAP + PDU request size

    const now = Date.now();
    this.diagnostics.lastReadTimestamp = now;

    // Normalize 0-based address
    const regOffset = cfg.isZeroBased ? cfg.address : Math.max(0, cfg.address - 1);

    let rawValue: number | boolean = 0;

    switch (cfg.area) {
      case "COIL": {
        rawValue = this.coils.get(regOffset) ?? false;
        this.diagnostics.rxBytes += 10;
        break;
      }
      case "DISCRETE_INPUT": {
        rawValue = this.discreteInputs.get(regOffset) ?? false;
        this.diagnostics.rxBytes += 10;
        break;
      }
      case "INPUT_REGISTER": {
        rawValue = this.decodeRegisters(
          this.inputRegisters,
          regOffset,
          cfg.dataType,
          cfg.endianness,
        );
        this.diagnostics.rxBytes += 11;
        break;
      }
      case "HOLDING_REGISTER":
      default: {
        rawValue = this.decodeRegisters(
          this.holdingRegisters,
          regOffset,
          cfg.dataType,
          cfg.endianness,
        );
        this.diagnostics.rxBytes += 11;
        break;
      }
    }

    // Engineering scaling: EU = Raw * Mult + Offset
    let engineeringValue: number | boolean | string = rawValue;
    if (typeof rawValue === "number") {
      const mult = cfg.scaleMultiplier ?? 1;
      const off = cfg.scaleOffset ?? 0;
      engineeringValue = Math.round((rawValue * mult + off) * 1000) / 1000;
    }

    const targetDataType: TagDataType =
      typeof rawValue === "boolean" ? "BOOL" : typeof rawValue === "number" ? "REAL" : "STRING";

    return {
      tagName: `MODBUS_${cfg.area}_${cfg.address}`,
      value: engineeringValue,
      rawSampleValue: typeof rawValue === "number" ? rawValue : undefined,
      dataType: targetDataType,
      quality: "GOOD",
      sourceTimestamp: now,
      engineeringUnit: cfg.engineeringUnit,
    };
  }

  public async readBatch(addresses: string[]): Promise<ReadResult[]> {
    const results: ReadResult[] = [];
    for (const addr of addresses) {
      results.push(await this.read(addr));
    }
    return results;
  }

  public async subscribe(
    nodesOrAddresses: string[],
    samplingIntervalMs: number = 1000,
    callback: SubscriptionCallback,
  ): Promise<string> {
    const subId = `poller_${crypto.randomUUID()}`;

    const timer = setInterval(async () => {
      if (this.state === "CONNECTED") {
        try {
          const reads = await this.readBatch(nodesOrAddresses);
          callback(reads);
        } catch {
          // Handled via diagnostics
        }
      }
    }, samplingIntervalMs);

    this.activePollers.set(subId, timer);
    this.diagnostics.activeSubscriptions = this.activePollers.size;
    return subId;
  }

  public async unsubscribe(subscriptionId: string): Promise<void> {
    const timer = this.activePollers.get(subscriptionId);
    if (timer) clearInterval(timer);
    this.activePollers.delete(subscriptionId);
    this.diagnostics.activeSubscriptions = this.activePollers.size;
  }

  public async healthCheck(): Promise<boolean> {
    return this.state === "CONNECTED";
  }

  /**
   * Decodes 16-bit, 32-bit, and Float registers with Byte and Word endianness options.
   */
  public decodeRegisters(
    store: Map<number, number>,
    startOffset: number,
    dataType: ModbusAddressConfig["dataType"],
    endianness: ModbusEndianness = "BIG_ENDIAN",
  ): number {
    const r0 = store.get(startOffset) ?? 0;
    const r1 = store.get(startOffset + 1) ?? 0;

    if (dataType === "INT16") {
      // 16-bit signed
      return r0 > 0x7fff ? r0 - 0x10000 : r0;
    }

    if (dataType === "UINT16") {
      return r0 & 0xffff;
    }

    if (
      dataType === "FLOAT32" ||
      dataType === "INT32" ||
      dataType === "UINT32" ||
      dataType === "REAL"
    ) {
      // Assemble 4 bytes according to endianness
      let b0: number, b1: number, b2: number, b3: number;

      const r0Hi = (r0 >> 8) & 0xff;
      const r0Lo = r0 & 0xff;
      const r1Hi = (r1 >> 8) & 0xff;
      const r1Lo = r1 & 0xff;

      if (endianness === "BIG_ENDIAN") {
        // ABCD: r0=AB, r1=CD
        b0 = r0Hi;
        b1 = r0Lo;
        b2 = r1Hi;
        b3 = r1Lo;
      } else if (endianness === "LITTLE_ENDIAN") {
        // DCBA: r1=CD (D, C), r0=AB (B, A)
        b0 = r1Lo;
        b1 = r1Hi;
        b2 = r0Lo;
        b3 = r0Hi;
      } else if (endianness === "WORD_SWAPPED") {
        // CDAB: r1=CD, r0=AB
        b0 = r1Hi;
        b1 = r1Lo;
        b2 = r0Hi;
        b3 = r0Lo;
      } else {
        // BADC (Byte Swapped)
        b0 = r0Lo;
        b1 = r0Hi;
        b2 = r1Lo;
        b3 = r1Hi;
      }

      const buf = Buffer.from([b0, b1, b2, b3]);

      if (dataType === "FLOAT32" || dataType === "REAL") {
        return Math.round(buf.readFloatBE(0) * 1000) / 1000;
      }
      if (dataType === "INT32") {
        return buf.readInt32BE(0);
      }
      return buf.readUInt32BE(0);
    }

    return r0;
  }

  /**
   * Helper to write simulated registers for laboratory validation.
   */
  public setLabRegister(area: ModbusArea, address: number, value: number | boolean): void {
    if (area === "COIL") this.coils.set(address, Boolean(value));
    else if (area === "DISCRETE_INPUT") this.discreteInputs.set(address, Boolean(value));
    else if (area === "INPUT_REGISTER") this.inputRegisters.set(address, Number(value));
    else this.holdingRegisters.set(address, Number(value));
  }

  /**
   * Encodes a 32-bit float into 2 holding registers in BIG_ENDIAN for testing.
   */
  public setLabFloat32(
    area: ModbusArea,
    startAddress: number,
    val: number,
    endianness: ModbusEndianness = "BIG_ENDIAN",
  ): void {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(val, 0);

    let r0 = 0;
    let r1 = 0;

    if (endianness === "BIG_ENDIAN") {
      // ABCD
      r0 = (buf[0] << 8) | buf[1];
      r1 = (buf[2] << 8) | buf[3];
    } else if (endianness === "WORD_SWAPPED") {
      // CDAB
      r0 = (buf[2] << 8) | buf[3];
      r1 = (buf[0] << 8) | buf[1];
    } else if (endianness === "LITTLE_ENDIAN") {
      // DCBA
      r0 = (buf[3] << 8) | buf[2];
      r1 = (buf[1] << 8) | buf[0];
    } else {
      // BADC
      r0 = (buf[1] << 8) | buf[0];
      r1 = (buf[3] << 8) | buf[2];
    }

    this.setLabRegister(area, startAddress, r0);
    this.setLabRegister(area, startAddress + 1, r1);
  }

  private parseAddressString(addrStr: string): ModbusAddressConfig {
    if (addrStr.startsWith("COIL:")) {
      return {
        area: "COIL",
        address: parseInt(addrStr.replace("COIL:", ""), 10),
        dataType: "BOOL",
      };
    }
    if (addrStr.startsWith("DI:")) {
      return {
        area: "DISCRETE_INPUT",
        address: parseInt(addrStr.replace("DI:", ""), 10),
        dataType: "BOOL",
      };
    }
    if (addrStr.startsWith("3x:") || addrStr.startsWith("3000")) {
      const num = parseInt(addrStr.replace(/^(3x:|3000)/, ""), 10);
      return { area: "INPUT_REGISTER", address: num, dataType: "INT16" };
    }

    const rawNum = parseInt(addrStr.replace(/^(4x:|4000)/, ""), 10);
    return {
      area: "HOLDING_REGISTER",
      address: Number.isNaN(rawNum) ? 0 : rawNum,
      dataType: "INT16",
    };
  }

  public simulateConnectionLoss(): void {
    this.state = "DISCONNECTED";
    this.diagnostics.reconnectCount++;
  }
}
