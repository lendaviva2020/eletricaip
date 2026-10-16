// Server-side Supabase client with service role key — bypasses RLS.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
// SECURITY: This file should NEVER be imported in client components.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { assertSupabaseProject } from "./env";

function resolveServerUrl(): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim();
}

function resolveServiceRoleKey(): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export function isSupabaseAdminConfigured(): boolean {
  if (typeof window !== "undefined") return false;
  return Boolean(resolveServerUrl() && resolveServiceRoleKey());
}

function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "[Supabase] Operação bloqueada: supabaseAdmin é restrito exclusivamente ao ambiente de servidor.",
    );
  }

  const SUPABASE_URL = resolveServerUrl();
  const SUPABASE_SERVICE_ROLE_KEY = resolveServiceRoleKey();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    const message = `[Supabase] Missing server-side env(s): ${missing.join(", ")}. Configure in .env or deployment dashboard.`;
    console.error(message);
    throw new Error(message);
  }

  assertSupabaseProject({ url: SUPABASE_URL, anonKey: SUPABASE_SERVICE_ROLE_KEY });

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export function resetSupabaseAdminCacheForTesting(): void {
  _supabaseAdmin = undefined;
}

// Server-side Supabase client with service role — bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
// Import like: import { supabaseAdmin } from "@/integrations/supabase/client.server";
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
