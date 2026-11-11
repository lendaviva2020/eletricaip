import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "node:crypto";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import { isValidIpLiteral, normalizeIpAddress } from "@/lib/security/client-ip-guard";
import { logSecurityEvent } from "@/lib/security/security-audit-log.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  device_external_id: z.string().min(1).max(128),
  value: z.number().finite(),
  quality: z.string().max(16).optional(),
  message_id: z.string().max(128).optional(),
  ttl_ms: z.number().int().min(100).max(60_000).optional(),
});

function cors(request?: Request): Record<string, string> {
  const configuredOrigin = (process.env.PUBLIC_APP_URL || "https://eletricaip.vercel.app").replace(
    /\/$/,
    "",
  );
  const reqOrigin = request?.headers.get("origin")?.trim().replace(/\/$/, "");
  const allowed = new Set<string>([configuredOrigin, "https://eletricaip.vercel.app"]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  const allowOrigin = reqOrigin && allowed.has(reqOrigin) ? reqOrigin : configuredOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
}

function extractClientIpKey(request: Request): string {
  const candidates = [
    request.headers.get("x-vercel-forwarded-for"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const normalized = normalizeIpAddress(raw);
    if (isValidIpLiteral(normalized)) return normalized;
  }
  return "unknown_ip";
}

export const Route = createFileRoute("/api/public/iot/ingest")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request) }),
      POST: async ({ request }) => {
        const headers = cors(request);

        // 1. Pre-auth IP rate limiting prevents API key brute-force/rotation bypasses
        const clientIp = extractClientIpKey(request);
        const ipRl = await checkRateLimit("iot", `ip:${clientIp}`);
        if (!ipRl.allowed || ipRl.failClosed) {
          logSecurityEvent({
            category: "RATE_LIMIT_TRIGGERED",
            severity: "WARNING",
            route: "/api/public/iot/ingest",
            reason: "IP rate limit exceeded",
            metadata: { clientIp },
          });
          return new Response(
            JSON.stringify({ ok: false, error: "rate_limited", code: "BURST_LIMIT_429" }),
            {
              status: 429,
              headers: { ...headers, "Retry-After": String(ipRl.retryAfterSeconds) },
            },
          );
        }

        const auth = request.headers.get("authorization") || "";
        const apiKey = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!apiKey || apiKey.length < 16) {
          return new Response(JSON.stringify({ ok: false, error: "missing_api_key" }), {
            status: 401,
            headers,
          });
        }

        // 2. Per-API-key rate limiting
        const keyId = createHash("sha256").update(apiKey).digest("hex");
        const rl = await checkRateLimit("iot", `key:${keyId}`);
        if (!rl.allowed || rl.failClosed) {
          return new Response(
            JSON.stringify({ ok: false, error: "rate_limited", code: "BURST_LIMIT_429" }),
            {
              status: 429,
              headers: { ...headers, "Retry-After": String(rl.retryAfterSeconds) },
            },
          );
        }

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "bad_input" }), {
            status: 400,
            headers,
          });
        }
        const { data, error } = await supabaseAdmin.rpc("ingest_iot_reading", {
          p_api_key: apiKey,
          p_device_external_id: body.device_external_id,
          p_value: body.value,
          p_quality: body.quality ?? "GOOD",
          p_message_id: body.message_id ?? undefined,
          p_ttl_ms: body.ttl_ms ?? 5000,
        });
        if (error) {
          console.error("[iot.ingest] rpc error:", error.message);
          const msg = error.message || "";
          const isAuthErr = /unauthorized|invalid_api_key/.test(msg);
          const isPlanErr = /plan_required/.test(msg);
          const status = isAuthErr ? 401 : isPlanErr ? 402 : 400;
          const safeCode = isAuthErr
            ? "unauthorized"
            : isPlanErr
              ? "plan_required"
              : "ingest_error";
          return new Response(JSON.stringify({ ok: false, error: safeCode }), {
            status,
            headers,
          });
        }
        return new Response(JSON.stringify(data ?? { ok: true }), { status: 200, headers });
      },
    },
  },
});
