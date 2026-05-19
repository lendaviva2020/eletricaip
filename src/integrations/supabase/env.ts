// Supabase environment variables — Next.js 15 compatible
// All public vars use NEXT_PUBLIC_ prefix for client-side access
// Server-only vars (service_role) are never exposed to the client

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  // TanStack Start (Vinxi) expõe variáveis NEXT_PUBLIC_ via import.meta.env no client
  // No server-side (SSR/Node), usa process.env
  const isClient = typeof window !== "undefined";

  const url = isClient
    ? import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    : (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : "") ?? "";

  const anonKey = isClient
    ? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    : (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : "") ?? "";

  return {
    url,
    anonKey,
  };
}

export function getMissingSupabasePublicEnv(
  env: SupabasePublicEnv = getSupabasePublicEnv(),
): string[] {
  const missing: string[] = [];
  if (!env.url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}
