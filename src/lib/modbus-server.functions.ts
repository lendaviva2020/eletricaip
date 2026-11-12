// ELÉTRICAI INDUSTRIAL OS — CLOUD MODBUS SERVER FUNCTIONS (PURE RPC BOUNDARY)
// All server-only Node modules live inside `./edge/modbus-handlers.server` and are dynamically
// imported ONLY inside `.handler(...)` so client bundles remain 100% free of `node:*` built-ins.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  ModbusConnectionStatus,
  ModbusGatewayConfig,
  ModbusRegisterValue,
} from "./edge/modbus-handlers.server";
import { isHostAllowed } from "./edge/protocol-classification";

export type { ModbusConnectionStatus, ModbusGatewayConfig, ModbusRegisterValue };

const ConnectSchema = z.object({
  mode: z.enum(["SIMULATOR", "EDGE_READ_ONLY"]).default("SIMULATOR"),
  host: z.string().min(1).max(253).default("simulation").refine(isHostAllowed, {
    message:
      "Host bloqueado pela política de rede OT. Use 'simulation' no modo simulador ou um host OT autorizado via Edge Gateway.",
  }),
  port: z.number().int().min(1).max(65535).default(502),
  unitId: z.number().int().min(1).max(247).default(1),
  gatewayId: z.string().min(1).max(128).optional(),
  timeoutMs: z.number().min(1000).max(30000).default(5000),
});

export const connectModbus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeConnectModbus } = await import("./edge/modbus-handlers.server");
    return executeConnectModbus(data, context);
  });

export const disconnectModbus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { executeDisconnectModbus } = await import("./edge/modbus-handlers.server");
    return executeDisconnectModbus(context);
  });

export const getModbusStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { executeGetModbusStatus } = await import("./edge/modbus-handlers.server");
    return executeGetModbusStatus(context);
  });

const ReadRegistersSchema = z.object({
  address: z.number().int().min(0).max(65535),
  count: z.number().int().min(1).max(125).default(10),
  type: z
    .enum(["holding_register", "input_register", "coil", "discrete_input"])
    .default("holding_register"),
});

export const readModbusRegisters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadRegistersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeReadModbusRegisters } = await import("./edge/modbus-handlers.server");
    return executeReadModbusRegisters(data, context);
  });

const WriteRegisterSchema = z.object({
  address: z.number().int().min(0).max(65535),
  value: z.number().int().min(0).max(65535),
  type: z.enum(["coil", "holding_register"]).default("holding_register"),
});

export const writeModbusRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WriteRegisterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeWriteModbusRegister } = await import("./edge/modbus-handlers.server");
    return executeWriteModbusRegister(data, context);
  });

const TestModbusSchema = z.object({
  mode: z.enum(["SIMULATOR", "EDGE_READ_ONLY"]).default("SIMULATOR"),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(502),
  gatewayId: z.string().min(1).max(128).optional(),
});

export const testModbusHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TestModbusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeTestModbusHost } = await import("./edge/modbus-handlers.server");
    return executeTestModbusHost(data, context);
  });
