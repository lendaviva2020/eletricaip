/**
 * ElétricAi Industrial OS — Industrial Communication & Protocol Engine
 * Paridade funcional aos drivers de barramento de campo do CODESYS V3.5:
 * Modbus TCP/RTU com validação de frames PDU e CRC16,
 * OPC UA (NodeId, Assinaturas e StatusCodes) e MQTT / Sparkplug B.
 *
 * Invariante de Segurança Inviolável:
 * IS_PHYSICAL_CONTROL_ALLOWED = false
 */

import {
  IndustrialProtocol,
  ProtocolConfiguration,
  IS_PHYSICAL_CONTROL_ALLOWED,
} from "../canonical/types";

// ============================================================================
// 1. Modbus TCP & RTU PDU / Frame Engine
// ============================================================================

export type ModbusFunctionCode = 1 | 2 | 3 | 4 | 5 | 6 | 15 | 16;

export interface ModbusRequestPDU {
  functionCode: ModbusFunctionCode;
  startingAddress: number;
  quantityOrValue: number;
  dataBytes?: Uint8Array;
}

export interface ModbusResponsePDU {
  functionCode: ModbusFunctionCode;
  byteCount: number;
  registersOrCoils: number[];
  isException: boolean;
  exceptionCode?: number;
}

export class ModbusProtocolEngine {
  /**
   * Cálculo de CRC16 para frames Modbus RTU (Polinômio 0xA001)
   */
  public static calculateCRC16(data: Uint8Array): number {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x0001) !== 0) {
          crc = (crc >> 1) ^ 0xa001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    return crc & 0xffff;
  }

  /**
   * Valida e decodifica um frame Modbus TCP (MBAP + PDU)
   */
  public static parseModbusTCPFrame(
    frame: Uint8Array,
    options: { allowVirtualWrite?: boolean } = {},
  ): {
    transactionId: number;
    protocolId: number;
    length: number;
    unitId: number;
    pdu: ModbusRequestPDU;
  } {
    if (frame.length < 12) {
      throw new Error(
        `Frame Modbus TCP inválido: tamanho mínimo 12 bytes, recebido ${frame.length}.`,
      );
    }

    const transactionId = (frame[0] << 8) | frame[1];
    const protocolId = (frame[2] << 8) | frame[3];
    const length = (frame[4] << 8) | frame[5];
    const unitId = frame[6];
    const functionCode = frame[7] as ModbusFunctionCode;
    const startingAddress = (frame[8] << 8) | frame[9];
    const quantityOrValue = (frame[10] << 8) | frame[11];

    if (protocolId !== 0) {
      throw new Error(
        `Protocol ID deve ser 0x0000 para Modbus TCP, recebido 0x${protocolId.toString(16)}.`,
      );
    }

    // Barreira ativa de segurança física (IS_PHYSICAL_CONTROL_ALLOWED = false)
    if (
      [5, 6, 15, 16].includes(functionCode) &&
      !options.allowVirtualWrite &&
      !IS_PHYSICAL_CONTROL_ALLOWED
    ) {
      throw new Error(
        "[SAFETY_VIOLATION] Physical write blocked: IS_PHYSICAL_CONTROL_ALLOWED=false. Operational mode is OBSERVATIONAL_ONLY.",
      );
    }

    return {
      transactionId,
      protocolId,
      length,
      unitId,
      pdu: {
        functionCode,
        startingAddress,
        quantityOrValue,
        dataBytes: frame.slice(12),
      },
    };
  }

  /**
   * Bloqueio incondicional de envio de comando de escrita física
   */
  public static sendPhysicalWrite(pdu: ModbusRequestPDU): never {
    throw new Error(
      "[SAFETY_VIOLATION] Physical write blocked: IS_PHYSICAL_CONTROL_ALLOWED=false. Operational mode is OBSERVATIONAL_ONLY.",
    );
  }

  /**
   * Simula a execução de leitura ou escrita Modbus em uma tabela de registradores virtuais
   */
  public static executeVirtualModbus(
    pdu: ModbusRequestPDU,
    virtualHoldingRegisters: Map<number, number>,
  ): ModbusResponsePDU {
    const fc = pdu.functionCode;

    // Leitura de Holding Registers (FC03)
    if (fc === 3 || fc === 4) {
      const results: number[] = [];
      for (let i = 0; i < pdu.quantityOrValue; i++) {
        const addr = pdu.startingAddress + i;
        results.push(virtualHoldingRegisters.get(addr) ?? 0);
      }
      return {
        functionCode: fc,
        byteCount: results.length * 2,
        registersOrCoils: results,
        isException: false,
      };
    }

    // Escrita em Registrador Único (FC06) em memória virtual de simulação
    if (fc === 6) {
      virtualHoldingRegisters.set(pdu.startingAddress, pdu.quantityOrValue);
      return {
        functionCode: fc,
        byteCount: 2,
        registersOrCoils: [pdu.quantityOrValue],
        isException: false,
      };
    }

    // Exceção: Função Não Suportada
    return {
      functionCode: fc,
      byteCount: 0,
      registersOrCoils: [],
      isException: true,
      exceptionCode: 0x01, // Illegal Function
    };
  }
}

// ============================================================================
// 2. Motor de Sessão e Endereçamento OPC UA
// ============================================================================

export interface OPCUANodeId {
  namespaceIndex: number;
  identifierType: "NUMERIC" | "STRING" | "GUID" | "OPAQUE";
  identifier: string | number;
}

export type OPCUAStatusCode =
  "Good" | "Bad_NotFound" | "Bad_TypeMismatch" | "Bad_SecurityChecksFailed";

export class OPCUAProtocolEngine {
  /**
   * Faz o parsing de strings padronizadas de NodeId (ex: 'ns=2;s=Device1.TankLevel')
   */
  public static parseNodeId(nodeIdStr: string): OPCUANodeId {
    const parts = nodeIdStr.split(";");
    let ns = 0;
    let identType: "NUMERIC" | "STRING" | "GUID" | "OPAQUE" = "STRING";
    let ident: string | number = nodeIdStr;

    for (const p of parts) {
      const [key, val] = p.split("=");
      if (key === "ns") {
        ns = parseInt(val, 10);
      } else if (key === "s") {
        identType = "STRING";
        ident = val;
      } else if (key === "i") {
        identType = "NUMERIC";
        ident = parseInt(val, 10);
      } else if (key === "g") {
        identType = "GUID";
        ident = val;
      }
    }

    return { namespaceIndex: ns, identifierType: identType, identifier: ident };
  }

  /**
   * Executa leitura virtual de nós do OPC UA AddressSpace
   */
  public static readNode(
    nodeIdStr: string,
    virtualAddressSpace: Map<string, { value: any; dataType: string }>,
  ): { value: any; statusCode: OPCUAStatusCode; timestamp: string } {
    const node = virtualAddressSpace.get(nodeIdStr);
    if (!node) {
      return { value: null, statusCode: "Bad_NotFound", timestamp: new Date().toISOString() };
    }
    return { value: node.value, statusCode: "Good", timestamp: new Date().toISOString() };
  }

  /**
   * Bloqueio incondicional de escrita em nós físicos reais via OPC UA
   */
  public static writeNode(nodeIdStr: string, value: any): never {
    throw new Error(
      "[SAFETY_VIOLATION] Physical write blocked: IS_PHYSICAL_CONTROL_ALLOWED=false. Operational mode is OBSERVATIONAL_ONLY.",
    );
  }
}

// ============================================================================
// 3. Validador de Payloads MQTT / Sparkplug B
// ============================================================================

export interface SparkplugBMetric {
  name: string;
  timestamp: number;
  dataType: string;
  value: any;
  isTransient?: boolean;
}

export interface SparkplugBPayload {
  timestamp: number;
  metrics: SparkplugBMetric[];
  seq: number;
  uuid?: string;
}

export class SparkplugBProtocolEngine {
  /**
   * Valida tópicos no padrão Sparkplug B: spBv1.0/group_id/message_type/edge_node_id/[device_id]
   */
  public static parseTopic(topic: string): {
    namespace: string;
    groupId: string;
    messageType: "NBIRTH" | "NDEATH" | "DBIRTH" | "DDEATH" | "NDATA" | "DDATA" | "NCMD" | "DCMD";
    edgeNodeId: string;
    deviceId?: string;
  } {
    const segments = topic.split("/");
    if (segments.length < 4 || segments[0] !== "spBv1.0") {
      throw new Error(`Tópico inválido para especificação Sparkplug B: '${topic}'.`);
    }

    const messageType = segments[2] as any;
    if (["NCMD", "DCMD"].includes(messageType) && !IS_PHYSICAL_CONTROL_ALLOWED) {
      throw new Error(
        "[SAFETY_VIOLATION] Sparkplug B command blocked: IS_PHYSICAL_CONTROL_ALLOWED=false. Operational mode is OBSERVATIONAL_ONLY.",
      );
    }

    return {
      namespace: segments[0],
      groupId: segments[1],
      messageType,
      edgeNodeId: segments[3],
      deviceId: segments[4],
    };
  }

  /**
   * Converte um conjunto de métricas para payload Sparkplug B compatível
   */
  public static encodePayload(
    metrics: SparkplugBMetric[],
    sequenceNumber: number,
  ): SparkplugBPayload {
    return {
      timestamp: Date.now(),
      metrics,
      seq: sequenceNumber % 256, // Sparkplug B seq é 0-255 circular
    };
  }
}

// ============================================================================
// 4. Barreira de Comandos MQTT
// ============================================================================

export class MQTTProtocolEngine {
  public static publishCommand(topic: string, payload: any): never {
    throw new Error(
      "[SAFETY_VIOLATION] MQTT command publish blocked: IS_PHYSICAL_CONTROL_ALLOWED=false. Operational mode is OBSERVATIONAL_ONLY.",
    );
  }
}
