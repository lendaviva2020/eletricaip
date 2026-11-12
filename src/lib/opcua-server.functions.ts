// ELÉTRICAI INDUSTRIAL OS — CLOUD OPC-UA SERVER FUNCTIONS (PURE RPC BOUNDARY)
// All server-only Node modules live inside `./edge/opcua-handlers.server` and are dynamically
// imported ONLY inside `.handler(...)` so client bundles remain 100% free of `node:*` built-ins.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  OpcuaConnectionStatus,
  OpcuaServerConfig,
  OpcuaTagValue,
} from "./edge/opcua-handlers.server";
import { isOpcuaEndpointAllowed } from "./edge/protocol-classification";

export type { OpcuaConnectionStatus, OpcuaServerConfig, OpcuaTagValue };

const ConnectSchema = z.object({
  mode: z.enum(["SIMULATOR", "EDGE_READ_ONLY"]).default("SIMULATOR"),
  endpoint: z
    .string()
    .min(1)
    .max(512)
    .default("opc.tcp://simulation:4840")
    .refine(isOpcuaEndpointAllowed, {
      message:
        "Endpoint OPC-UA bloqueado pela política de rede OT. Use opc.tcp://simulation:4840 em SIMULATOR ou endpoint autorizado via Edge Gateway.",
    }),
  securityMode: z.enum(["None", "Sign", "SignAndEncrypt"]).default("None"),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  gatewayId: z.string().min(1).max(128).optional(),
  timeoutMs: z.number().min(1000).max(30000).default(5000),
});

export const connectOpcua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeConnectOpcua } = await import("./edge/opcua-handlers.server");
    return executeConnectOpcua(data, context);
  });

export const disconnectOpcua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { executeDisconnectOpcua } = await import("./edge/opcua-handlers.server");
    return executeDisconnectOpcua(context);
  });

export const getOpcuaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { executeGetOpcuaStatus } = await import("./edge/opcua-handlers.server");
    return executeGetOpcuaStatus(context);
  });

const ReadTagsSchema = z.object({
  nodeIds: z.array(z.string()).min(1).max(100),
});

export const readOpcuaTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadTagsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeReadOpcuaTags } = await import("./edge/opcua-handlers.server");
    return executeReadOpcuaTags(data, context);
  });

const WriteTagSchema = z.object({
  nodeId: z.string().min(1),
  value: z.union([z.number(), z.boolean(), z.string()]),
});

export const writeOpcuaTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WriteTagSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeWriteOpcuaTag } = await import("./edge/opcua-handlers.server");
    return executeWriteOpcuaTag(data, context);
  });

const TestOpcuaSchema = z.object({
  mode: z.enum(["SIMULATOR", "EDGE_READ_ONLY"]).default("SIMULATOR"),
  endpoint: z.string().min(5).max(512),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  securityMode: z.enum(["None", "Sign", "SignAndEncrypt"]).optional(),
  gatewayId: z.string().min(1).max(128).optional(),
});

export const testOpcuaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TestOpcuaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { executeTestOpcuaConnection } = await import("./edge/opcua-handlers.server");
    return executeTestOpcuaConnection(data, context);
  });
