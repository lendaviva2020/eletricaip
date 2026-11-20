// Download do pacote do ElétricAi Runtime (só o alvo do dispositivo ou o que ele
// já executa). O gateway confere o hash antes de executar.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import {
  RuntimeHttpError,
  authenticateDevice,
  bearerToken,
  handlePackage,
  tokenKey,
} from "@/lib/runtime/runtime-cloud.server";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const Route = createFileRoute("/api/public/runtime/package")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = bearerToken(request);
          const rl = await checkRateLimit("api", `runtime-pkg:${tokenKey(token || "anon")}`);
          if (!rl.allowed || rl.failClosed) return json(429, { error: "rate_limited" });
          const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
          if (!id.success) return json(400, { error: "bad_input" });
          const device = await authenticateDevice(token);
          return json(200, await handlePackage(device, id.data));
        } catch (e) {
          if (e instanceof RuntimeHttpError) return json(e.status, { error: e.code });
          console.error("[runtime.package]", e instanceof Error ? e.message : e);
          return json(500, { error: "internal" });
        }
      },
    },
  },
});
