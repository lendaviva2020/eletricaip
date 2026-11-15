// TanStack Start Server Functions for the ElétricAi AI Gateway,
// Provider Configuration, Health Checks, Capability Validation, and Engineering Agent Tools.
import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  requireAiQuota,
  requireBurstLimit,
} from "@/integrations/supabase/ai-rate-limit-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertProjectTenantAccess } from "../memory.server";
import {
  gatewayGenerateStructured,
  gatewayTestConnection,
  gatewayValidateCapabilities,
  getFullAiGatewayHealthStatus,
} from "./ai-gateway.server";
import { recordCredentialRotationEvent } from "./credential-security.server";
import {
  ENGINEERING_TOOL_NAMES,
  executeAuthorizedEngineeringTool,
  getEngineeringToolRevisions,
} from "./engineering-tools.server";
import { configureProviderRuntime, probeOllamaLocal } from "./provider-registry.server";
import { AI_PROVIDER_IDS } from "./types";

export const getAiGatewayStatusServerFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        runLivePing: z.boolean().optional(),
        probeOllama: z.boolean().optional(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data }) => {
    return await getFullAiGatewayHealthStatus({
      runLivePing: data?.runLivePing ?? false,
      probeOllama: data?.probeOllama ?? false,
    });
  });

export const configureAiGatewayProviderServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        provider: z.enum(AI_PROVIDER_IDS),
        model: z.string().min(1).max(120).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxOutputTokens: z.number().int().min(64).max(16384).optional(),
        timeoutMs: z.number().int().min(3000).max(120000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    configureProviderRuntime(data);
    return await getFullAiGatewayHealthStatus({ runLivePing: false });
  });

export const testAiGatewayConnectionServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireBurstLimit])
  .inputValidator((input) =>
    z
      .object({
        provider: z.enum(AI_PROVIDER_IDS).optional(),
        model: z.string().min(1).max(120).optional(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data }) => {
    return await gatewayTestConnection({
      provider: data?.provider,
      model: data?.model,
    });
  });

export const validateAiModelCapabilitiesServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireBurstLimit])
  .inputValidator((input) =>
    z
      .object({
        provider: z.enum(AI_PROVIDER_IDS).optional(),
        model: z.string().min(1).max(120).optional(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data }) => {
    return await gatewayValidateCapabilities({
      provider: data?.provider,
      model: data?.model,
    });
  });

const StructuredTestOutputSchema = z.object({
  projectCode: z.string(),
  standard: z.string(),
  nominalVoltageV: z.number(),
  protectionBreakerA: z.number(),
  status: z.enum(["OK", "REVIEW"]),
});

export const testAiStructuredResponseServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireBurstLimit])
  .inputValidator((input) =>
    z
      .object({
        provider: z.enum(AI_PROVIDER_IDS).optional(),
        model: z.string().min(1).max(120).optional(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data }) => {
    const res = await gatewayGenerateStructured(
      {
        operation: "structured_output_verification",
        module: "validation",
        provider: data?.provider,
        model: data?.model,
        messages: [
          {
            role: "user",
            content:
              'Retorne exclusivamente um objeto JSON para o projeto AGRO-OF-001 com: {"projectCode":"AGRO-OF-001","standard":"ABNT NBR 5410","nominalVoltageV":380,"protectionBreakerA":125,"status":"OK"}',
          },
        ],
        responseJsonSchema: {
          type: "object",
          properties: {
            projectCode: { type: "string" },
            standard: { type: "string" },
            nominalVoltageV: { type: "number" },
            protectionBreakerA: { type: "number" },
            status: { type: "string", enum: ["OK", "REVIEW"] },
          },
          required: ["projectCode", "standard", "nominalVoltageV", "protectionBreakerA", "status"],
        },
        maxOutputTokens: 256,
        temperature: 0,
      },
      StructuredTestOutputSchema,
    );
    return res;
  });

export const probeLocalOllamaServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return await probeOllamaLocal();
  });

export const rotateProviderCredentialServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ provider: z.enum(AI_PROVIDER_IDS) }).parse(input))
  .handler(async ({ data }) => {
    return recordCredentialRotationEvent(data.provider);
  });

export const executeEngineeringToolServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input) =>
    z
      .object({
        toolName: z.enum(ENGINEERING_TOOL_NAMES),
        args: z.record(z.string(), z.unknown()).default({}),
        projectId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.projectId) {
      await assertProjectTenantAccess(context.supabase, context.userId, data.projectId);
    }
    const toolRes = await executeAuthorizedEngineeringTool(data.toolName, {
      ...data.args,
      ...(data.projectId ? { projectId: data.projectId } : {}),
    });
    // Retorno serializável: o resultado da ferramenta é JSON puro.
    return { ...toolRes, result: toolRes.result as Json | undefined };
  });

export const listEngineeringToolRevisionsServerFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return getEngineeringToolRevisions();
  });
