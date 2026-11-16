/**
 * Gateway da bancada Arduino: o navegador lê o Uno pela Web Serial e envia as
 * leituras REAIS para cá; o servidor grava em `iot_readings` (que publica no
 * Realtime).
 *
 * Camadas de proteção: sessão (`requireSupabaseAuth`), limite de taxa por
 * usuário, validação Zod e, no banco (`ingest_bench_telemetry`, só service
 * role), empresa do usuário, papel com permissão, plano com IoT e limite de
 * dispositivos. O cliente nunca informa a empresa: ela vem do perfil.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import {
  BENCH_METRIC_PATTERN,
  BENCH_DEVICE_ID_PATTERN,
  MAX_BENCH_BATCH,
  mapBenchIngestError,
  type BenchIngestErrorCode,
} from "@/lib/hardware/bench-telemetry";

const ReadingSchema = z.object({
  metric: z.string().regex(BENCH_METRIC_PATTERN),
  value: z.number().finite().min(-1e9).max(1e9),
  unit: z.string().max(12).optional(),
  quality: z.enum(["GOOD", "UNCERTAIN", "BAD"]).default("GOOD"),
});

const InputSchema = z.object({
  deviceExternalId: z.string().regex(BENCH_DEVICE_ID_PATTERN),
  deviceName: z.string().trim().min(1).max(80),
  firmware: z
    .string()
    .max(40)
    .regex(/^[\w .:-]*$/)
    .optional(),
  readings: z.array(ReadingSchema).min(1).max(MAX_BENCH_BATCH),
});

export type BenchIngestResult =
  | { ok: true; inserted: number; deviceId: string }
  | { ok: false; code: BenchIngestErrorCode; retryAfterSeconds?: number };

export const ingestBenchTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<BenchIngestResult> => {
    const rl = await checkRateLimit("iot", `bench:${context.userId}`);
    if (!rl.allowed || rl.failClosed) {
      return { ok: false, code: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds };
    }

    // RPC nova ainda fora dos tipos gerados: chamada sem genérico; a resposta é validada.
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const { data: result, error } = await admin.rpc("ingest_bench_telemetry", {
      p_user_id: context.userId,
      p_device_external_id: data.deviceExternalId,
      p_device_name: data.deviceName,
      p_readings: data.readings,
      p_metadata: data.firmware ? { firmware: data.firmware } : {},
    });
    if (error) {
      const code = mapBenchIngestError(error.message ?? "");
      if (code === "server_error" || code === "not_enabled") {
        console.error("[bench.ingest] rpc error:", error.code, error.message);
      }
      return { ok: false, code };
    }
    const parsed = z
      .object({ ok: z.literal(true), inserted: z.number().int(), device_id: z.string() })
      .safeParse(result);
    if (!parsed.success) return { ok: false, code: "server_error" };
    return { ok: true, inserted: parsed.data.inserted, deviceId: parsed.data.device_id };
  });
