// Relatório periódico do ElétricAi Runtime (gateway → nuvem). Autenticado pelo
// token do dispositivo; responde o pacote aprovado desejado e pedido de parada.
import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import { MAX_REPORT_BYTES, RuntimeReportSchema } from "@/lib/runtime/runtime-cloud";
import {
  RuntimeHttpError,
  authenticateDevice,
  bearerToken,
  handleReport,
  tokenKey,
} from "@/lib/runtime/runtime-cloud.server";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const Route = createFileRoute("/api/public/runtime/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = bearerToken(request);
          const rl = await checkRateLimit("iot", `runtime:${tokenKey(token || "anon")}`);
          if (!rl.allowed || rl.failClosed) return json(429, { error: "rate_limited" });
          const len = Number(request.headers.get("content-length") ?? "0");
          if (len > MAX_REPORT_BYTES) return json(413, { error: "too_large" });
          const text = await request.text();
          if (text.length > MAX_REPORT_BYTES) return json(413, { error: "too_large" });
          const device = await authenticateDevice(token);
          let raw: unknown;
          try {
            raw = JSON.parse(text);
          } catch {
            return json(400, { error: "bad_input" });
          }
          const report = RuntimeReportSchema.safeParse(raw);
          if (!report.success) return json(400, { error: "bad_input" });
          return json(200, await handleReport(device, report.data));
        } catch (e) {
          if (e instanceof RuntimeHttpError) return json(e.status, { error: e.code });
          console.error("[runtime.report]", e instanceof Error ? e.message : e);
          return json(500, { error: "internal" });
        }
      },
    },
  },
});
