// Supabase env (TanStack Start + Vite). Client uses VITE_* via import.meta.env;
// server fallbacks read process.env (VITE_* or unprefixed names injected at runtime).

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const isClient = typeof window !== "undefined";

  const fromProc = (k: string) =>
    typeof process !== "undefined" && process.env ? (process.env[k] ?? "") : "";

  const url = isClient
    ? (import.meta.env.VITE_SUPABASE_URL ?? "")
    : (fromProc("VITE_SUPABASE_URL") || fromProc("SUPABASE_URL"));

  const anonKey = isClient
    ? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
        import.meta.env.VITE_SUPABASE_ANON_KEY ??
        "")
    : (fromProc("VITE_SUPABASE_PUBLISHABLE_KEY") ||
        fromProc("VITE_SUPABASE_ANON_KEY") ||
        fromProc("SUPABASE_PUBLISHABLE_KEY") ||
        fromProc("SUPABASE_ANON_KEY"));

  return { url, anonKey };
}

export function getMissingSupabasePublicEnv(
  env: SupabasePublicEnv = getSupabasePublicEnv(),
): string[] {
  const missing: string[] = [];
  if (!env.url) missing.push("VITE_SUPABASE_URL");
  if (!env.anonKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  return missing;
}
