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

    if (!authHeader.startsWith("Bearer ")) {
      throw new Response("Unauthorized: Only Bearer tokens are supported", { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
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

    // Use getUser() instead of getClaims() for more reliable auth validation
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Response("Unauthorized: Invalid token", { status: 401 });
    }

    if (!data.user.id) {
      throw new Response("Unauthorized: No user ID found in token", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user.app_metadata ?? {},
      } satisfies AuthContext,
    });
  },
);
