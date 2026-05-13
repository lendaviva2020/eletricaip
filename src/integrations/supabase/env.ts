type SupabasePublicEnv = {
  url?: string;
  publishableKey?: string;
};

function readProcessEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return {
    url:
      import.meta.env.VITE_SUPABASE_URL ||
      readProcessEnv("VITE_SUPABASE_URL") ||
      readProcessEnv("SUPABASE_URL"),
    publishableKey:
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      readProcessEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
      readProcessEnv("SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getMissingSupabasePublicEnv(env = getSupabasePublicEnv()) {
  return [
    ...(!env.url ? ["VITE_SUPABASE_URL"] : []),
    ...(!env.publishableKey ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
}
