// Supabase env (TanStack Start + Vite). Client uses VITE_* via import.meta.env;
// server fallbacks read process.env (VITE_* or unprefixed names injected at runtime).
// The URL and anon/publishable key are public by design. Keeping these as a
// final fallback prevents a blank runtime if the managed Vite env injection is
// temporarily unavailable, without exposing any server-only secret.

const SUPABASE_URL_FALLBACK = "https://rvaaxvdimggztjxoktvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YWF4dmRpbWdnenRqeG9rdHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDU2MjgsImV4cCI6MjEwNzQyMTYyOH0.VzLIHrXPm_PRjvhPmtWDxbxbIFmK0tS2RdE9HaI9_jo";

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const isClient = typeof window !== "undefined";

  const fromProc = (k: string) =>
    typeof process !== "undefined" && process.env ? (process.env[k] ?? "") : "";

  const url =
    (isClient
      ? (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
      : fromProc("VITE_SUPABASE_URL") ||
        fromProc("SUPABASE_URL") ||
        fromProc("NEXT_PUBLIC_SUPABASE_URL")) || SUPABASE_URL_FALLBACK;

  const anonKey =
    (isClient
      ? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
        import.meta.env.VITE_SUPABASE_ANON_KEY ??
        import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        "")
      : fromProc("VITE_SUPABASE_PUBLISHABLE_KEY") ||
        fromProc("VITE_SUPABASE_ANON_KEY") ||
        fromProc("SUPABASE_PUBLISHABLE_KEY") ||
        fromProc("SUPABASE_ANON_KEY") ||
        fromProc("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
        fromProc("NEXT_PUBLIC_SUPABASE_ANON_KEY")) || SUPABASE_PUBLISHABLE_KEY_FALLBACK;

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
