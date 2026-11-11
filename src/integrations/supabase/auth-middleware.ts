// Auth middleware for server functions — valida o Bearer token localmente
// (JWKS do projeto Supabase, sem round-trip de rede por invocação) e injeta
// supabase client + userId no contexto.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Database } from "./types";
import { getSupabasePublicEnv } from "./env";

// Usa o helper compartilhado (com fallback para o URL/anon key públicos do projeto)
// para evitar 500 quando o runtime serverless não injeta as envs SUPABASE_*.
function getServerSupabasePublicEnv() {
  const { url, anonKey } = getSupabasePublicEnv();
  return { url, anonKey };
}

// JWKS cacheado em memória entre invocações (o próprio createRemoteJWKSet faz
// cache + rotação de chaves; aqui garantimos uma única instância por URL).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string) {
  const jwksUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: 24 * 60 * 60 * 1000,
      cooldownDuration: 30_000,
    });
    jwksCache.set(jwksUrl, jwks);
  }
  return jwks;
}

export interface AuthContext {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
  sessionId?: string;
  token?: string;
}

export interface ActiveSessionContext extends AuthContext {
  activeUser: import("@supabase/supabase-js").User;
  isSessionConfirmedActive: true;
}

/**
 * Valida se o bypass de desenvolvimento local é estritamente permitido.
 * Requisitos de segurança Gate 4.2.1:
 * 1. O bypass somente pode existir em ambiente local de desenvolvimento ou teste.
 * 2. Em produção (process.env.NODE_ENV === "production"), é permanentemente desabilitado.
 * 3. Falha fechado: se NODE_ENV for indefinido, ausente ou diferente de 'development'/'test', rejeita.
 */
export function isDevAuthAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") {
    return false;
  }
  const env = process.env.NODE_ENV;
  if (!env || env === "production") {
    return false;
  }
  return env === "development" || env === "test";
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getServerSupabasePublicEnv();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
        ...(!SUPABASE_ANON_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
      console.error(`[Supabase] ${message}`);
      throw new Response(message, { status: 500 });
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Response("Unauthorized: No request headers available", { status: 401 });
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      throw new Response("Unauthorized: No authorization header provided", { status: 401 });
    }

    const bearerMatch = /^Bearer\s+([^\s,]+)$/i.exec(authHeader.trim());
    if (!bearerMatch) {
      throw new Response("Unauthorized: Invalid or unsupported authorization header", { status: 401 });
    }

    const token = bearerMatch[1];
    if (!token) {
      throw new Response("Unauthorized: No token provided", { status: 401 });
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let userId: string | undefined;
    let claims: Record<string, unknown> = {};
    let sessionId: string | undefined;

    if (token === "dev-access-token") {
      if (!isDevAuthAllowed()) {
        console.warn("[Security] Tentativa de dev-access-token rejeitada em ambiente de produção.");
        throw new Response(
          "Unauthorized: Development bypass tokens are permanently forbidden in production",
          { status: 401 },
        );
      }
      userId = "00000000-0000-4000-a000-000000000001";
      claims = {
        role: "authenticated",
        email: "auditor@eletricai.com",
        isDevBypass: true,
      };
      sessionId = "dev-session-id";
    }

    const applyPayload = (payload: Record<string, unknown>) => {
      userId = typeof payload.sub === "string" ? payload.sub : undefined;
      sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
      claims = {
        ...((payload["app_metadata"] as Record<string, unknown> | undefined) ?? {}),
        email: payload["email"],
        sessionId,
      };
    };

    const issuer = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;

    if (!userId) {
      try {
        const { payload } = await jwtVerify(token, getJwks(SUPABASE_URL), {
          issuer,
          audience: "authenticated",
          algorithms: ["ES256", "RS256"],
        });
        if (payload["role"] !== "authenticated") {
          throw new Error("Invalid token role claim");
        }
        applyPayload(payload as Record<string, unknown>);
      } catch {
        const legacySecret = process.env["SUPABASE_JWT_SECRET"];
        if (legacySecret) {
          try {
            const { payload } = await jwtVerify(token, new TextEncoder().encode(legacySecret), {
              issuer,
              audience: "authenticated",
              algorithms: ["HS256"],
            });
            if (payload["role"] === "authenticated") {
              applyPayload(payload as Record<string, unknown>);
            }
          } catch {
            /* cai no fallback remoto abaixo */
          }
        }

        if (!userId) {
          const { data, error } = await supabase.auth.getUser(token);
          if (error || !data.user) {
            throw new Response("Unauthorized: Invalid token", { status: 401 });
          }
          userId = data.user.id;
          claims = {
            ...((data.user.app_metadata as Record<string, unknown> | undefined) ?? {}),
            email: data.user.email,
          };
        }
      }
    }

    if (!userId) {
      throw new Response("Unauthorized: No user ID found in token", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId,
        claims,
        sessionId,
        token,
      } satisfies AuthContext,
    });
  },
);

/**
 * Middleware para operações críticas e sensíveis que exigem garantia
 * de sessão ativa no Supabase Auth em tempo real (ex.: exclusão de conta/projeto,
 * faturamento, alterações de planos e privilégios administrativos).
 *
 * Ao contrário do `requireSupabaseAuth` (que verifica a assinatura criptográfica
 * do JWT e o tempo de expiração 'exp' localmente sem chamadas de rede para máxima
 * performance), o `requireActiveSession` realiza validação em tempo real com o
 * Supabase Auth (`supabase.auth.getUser(token)`).
 * Caso o usuário tenha efetuado logout ou a sessão tenha sido revogada no servidor,
 * o token pré-logout é imediatamente rejeitado com HTTP 401, impedindo ações com
 * tokens vazados dentro de sua janela de validade restante (TTL).
 */
export const requireActiveSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const authCtx = context as unknown as AuthContext;
    const { supabase, token: contextToken } = authCtx;

    let token = contextToken;
    if (!token) {
      const request = getRequest();
      token = request?.headers?.get("authorization")?.replace("Bearer ", "")?.trim();
    }

    if (!token) {
      throw new Response("Unauthorized: No token provided", { status: 401 });
    }

    // Consulta autoritativa ao GoTrue do Supabase para validar a sessão ativa
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Response(
        `Unauthorized: Session has been revoked or is no longer active (${error?.message ?? "session_revoked"})`,
        { status: 401 },
      );
    }

    return next({
      context: {
        ...authCtx,
        activeUser: data.user,
        isSessionConfirmedActive: true as const,
      } satisfies ActiveSessionContext,
    });
  });
