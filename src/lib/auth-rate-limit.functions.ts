// Rate-limit de camada de aplicação para os fluxos de autenticação (P-01 do
// pentest 2026-11-19 / RISK-006). As telas de login/cadastro/recuperação chamam
// o Supabase Auth direto do navegador; esta server function intermedia APENAS a
// verificação de taxa por IP ANTES da chamada de auth, sem proxiar o fluxo em si
// (PKCE/OAuth continuam no cliente). O bucket `auth` é fail-open com fallback
// local por instância, então uma falha de infraestrutura nunca bloqueia login
// legítimo (ver rate-limiter.server.ts).
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import { isValidIpLiteral, normalizeIpAddress } from "@/lib/security/client-ip-guard";

const InputSchema = z.object({
  action: z.enum(["login", "signup", "forgot-password", "reset-password"]),
});

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Resolve o IP do cliente a partir dos cabeçalhos de borda confiáveis. */
function resolveClientIp(): string {
  const candidates = [
    getRequestHeader("x-vercel-forwarded-for"),
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    getRequestHeader("x-forwarded-for")?.split(",")[0],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const normalized = normalizeIpAddress(raw);
    if (isValidIpLiteral(normalized)) return normalized;
  }
  return "unknown_ip";
}

/**
 * Verifica o limite de tentativas de autenticação para o IP do chamador.
 * Nunca lança: devolve `{ allowed }` para a UI decidir. A chave combina a ação
 * com o IP para que login/cadastro/recuperação tenham janelas independentes.
 */
export const checkAuthRateLimit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AuthRateLimitResult> => {
    const ip = resolveClientIp();
    const result = await checkRateLimit("auth", `${data.action}:${ip}`);
    return {
      allowed: result.allowed,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  });
