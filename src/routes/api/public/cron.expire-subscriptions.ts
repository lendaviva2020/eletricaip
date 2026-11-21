/**
 * Cron diário (Vercel Cron, ver vercel.json): rebaixa para "free" as
 * assinaturas por pagamento avulso (Mercado Pago) vencidas há mais de 3 dias.
 *
 * Autenticação: a Vercel envia `Authorization: Bearer <CRON_SECRET>`. Sem o
 * segredo configurado a rota responde 503 (nunca roda aberta).
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/cron/expire-subscriptions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = { "Content-Type": "application/json" };
        const secret = process.env.CRON_SECRET?.trim();
        if (!secret) {
          return new Response(JSON.stringify({ ok: false, error: "cron_not_configured" }), {
            status: 503,
            headers,
          });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (!safeEqual(auth, `Bearer ${secret}`)) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers,
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("expire_overdue_subscriptions");
        if (error) {
          console.error("[cron.expire-subscriptions]", error.message);
          return new Response(JSON.stringify({ ok: false, error: "rpc_failed" }), {
            status: 500,
            headers,
          });
        }
        return new Response(JSON.stringify({ ok: true, expired: Number(data ?? 0) }), {
          status: 200,
          headers,
        });
      },
    },
  },
});
