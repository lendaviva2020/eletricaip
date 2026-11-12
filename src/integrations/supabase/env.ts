// Supabase env (TanStack Start + Vite). Client uses VITE_* via import.meta.env;
// server fallbacks read process.env (VITE_* or unprefixed names injected at runtime).
// The URL and anon/publishable key are public by design. Keeping these as a
// final fallback prevents a blank runtime if the managed Vite env injection is
// temporarily unavailable, without exposing any server-only secret.
//
// Validação explícita: a URL e a chave ativas precisam pertencer ao projeto
// Supabase esperado. Uma configuração de outro projeto (ex.: variável antiga
// herdada de integração) gera erro claro em vez de ser usada silenciosamente.

const CONFIGURED_PROJECT_REF =
  (typeof process !== "undefined" &&
    process.env &&
    (process.env["SUPABASE_PROJECT_REF"] || process.env["VITE_SUPABASE_PROJECT_REF"])?.trim()) ||
  (typeof import.meta !== "undefined" &&
    (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    ).env?.VITE_SUPABASE_PROJECT_REF?.trim()) ||
  "";

export const EXPECTED_SUPABASE_PROJECT_REF = CONFIGURED_PROJECT_REF || "rvaaxvdimggztjxoktvy";

const SUPABASE_URL_FALLBACK = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
const SUPABASE_PUBLISHABLE_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YWF4dmRpbWdnenRqeG9rdHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDU2MjgsImV4cCI6MjEwNzQyMTYyOH0.VzLIHrXPm_PRjvhPmtWDxbxbIFmK0tS2RdE9HaI9_jo";

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

/** Extrai o project ref de `https://<ref>.supabase.co`. Retorna null para outros hosts. */
export function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]{20})\.supabase\.(co|in)$/i.exec(host);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(segment: string): string | null {
  try {
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    if (typeof atob === "function") return atob(padded);
    if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
    return null;
  } catch {
    return null;
  }
}

/**
 * Para chaves legadas (JWT anon), lê o claim `ref`. Chaves `sb_publishable_*`
 * não carregam o ref — retorna null (não verificável localmente).
 */
export function projectRefFromKey(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    const payload: unknown = JSON.parse(json);
    if (payload && typeof payload === "object" && "ref" in payload) {
      const ref = (payload as { ref: unknown }).ref;
      return typeof ref === "string" ? ref : null;
    }
    return null;
  } catch {
    return null;
  }
}

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/** Identifica URL loopback local autorizada apenas em ambiente local/teste controlado. */
export function isAuthorizedLocalSupabaseUrl(url: string): boolean {
  const proc = typeof process !== "undefined" ? process.env : undefined;
  const allowLocal =
    proc?.["ALLOW_LOCAL_SUPABASE"] === "true" ||
    proc?.["NODE_ENV"] === "test" ||
    Boolean(proc?.["VITEST"]);
  if (!allowLocal) return false;
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Valida que URL e chave pertencem ao projeto esperado. Lança
 * SupabaseConfigError com diagnóstico seguro (sem expor a chave).
 */
export function assertSupabaseProject(
  env: SupabasePublicEnv,
  expectedRef: string = EXPECTED_SUPABASE_PROJECT_REF,
): void {
  if (isAuthorizedLocalSupabaseUrl(env.url)) {
    return;
  }
  const urlRef = projectRefFromUrl(env.url);
  if (urlRef !== expectedRef) {
    throw new SupabaseConfigError(
      `[Supabase] Configuração inválida: a URL ativa aponta para o projeto "${urlRef ?? "desconhecido"}", ` +
        `mas o projeto esperado é "${expectedRef}". Corrija VITE_SUPABASE_URL / SUPABASE_URL ` +
        `nas variáveis de ambiente do deploy e gere um novo build.`,
    );
  }
  const keyRef = projectRefFromKey(env.anonKey);
  if (keyRef !== null && keyRef !== expectedRef) {
    throw new SupabaseConfigError(
      `[Supabase] Configuração inválida: a chave pública pertence ao projeto "${keyRef}", ` +
        `mas o projeto esperado é "${expectedRef}". Corrija VITE_SUPABASE_PUBLISHABLE_KEY ` +
        `nas variáveis de ambiente do deploy e gere um novo build.`,
    );
  }
}

function readRawEnv(): SupabasePublicEnv {
  const isClient = typeof window !== "undefined";

  const fromProc = (k: string) =>
    typeof process !== "undefined" && process.env ? (process.env[k] ?? "") : "";

  const url = isClient
    ? (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    : fromProc("VITE_SUPABASE_URL") ||
      fromProc("SUPABASE_URL") ||
      fromProc("NEXT_PUBLIC_SUPABASE_URL");

  const anonKey = isClient
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
      fromProc("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return { url, anonKey };
}

/**
 * Resolve URL + chave como um PAR coerente:
 * - Se nenhuma URL vier do ambiente, usa o par de fallback (URL + chave do mesmo projeto).
 * - Se a URL vier do ambiente, a chave também precisa vir do ambiente — exceto
 *   quando a URL é exatamente a do projeto esperado (então a chave de fallback é coerente).
 * O resultado é sempre validado contra EXPECTED_SUPABASE_PROJECT_REF.
 */
export function resolveSupabasePublicEnv(raw: SupabasePublicEnv): SupabasePublicEnv {
  const url = raw.url.trim();
  const key = raw.anonKey.trim();

  let resolved: SupabasePublicEnv;
  if (!url) {
    resolved = { url: SUPABASE_URL_FALLBACK, anonKey: key || SUPABASE_PUBLISHABLE_KEY_FALLBACK };
  } else if (!key && url.replace(/\/$/, "") === SUPABASE_URL_FALLBACK) {
    resolved = { url, anonKey: SUPABASE_PUBLISHABLE_KEY_FALLBACK };
  } else {
    resolved = { url, anonKey: key };
  }

  if (resolved.anonKey) assertSupabaseProject(resolved);
  return resolved;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return resolveSupabasePublicEnv(readRawEnv());
}

export function getMissingSupabasePublicEnv(
  env: SupabasePublicEnv = getSupabasePublicEnv(),
): string[] {
  const missing: string[] = [];
  if (!env.url) missing.push("VITE_SUPABASE_URL");
  if (!env.anonKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  return missing;
}
