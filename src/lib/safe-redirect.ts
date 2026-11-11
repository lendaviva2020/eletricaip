/**
 * Caminhos de autenticação que nunca devem ser destino de redirect pós-login,
 * evitando ciclos como /login?redirect=/login.
 */
const UNSAFE_AUTH_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export const DEFAULT_POST_LOGIN_REDIRECT = "/dashboard";

/**
 * Valida que um destino de redirect pós-login é um caminho relativo seguro
 * — nunca uma URL absoluta ou protocol-relative (`//host/...`), que o
 * browser trataria como navegação cross-origin em window.location.assign,
 * e nunca páginas de autenticação que causariam loops.
 * Isomorfo (sem depender de `window`) para funcionar em validateSearch,
 * que também roda durante SSR.
 */
const SAFE_REDIRECT_BASE_ORIGIN = "https://eletricai.local";

function hasControlSpaceOrBackslash(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || code === 0x5c) {
      return true;
    }
  }
  return false;
}

export function isSafeRedirect(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path.length === 0 || path.length > 2048) return false;
  if (!path.startsWith("/")) return false;

  // Bloqueia qualquer caractere de controle ASCII, espaço de controle (\t, \r, \n, \0) ou barra invertida
  if (hasControlSpaceOrBackslash(path)) return false;

  // Bloqueia protocol-relative ("//evil.com") e userinfo ("/@evil.com")
  if (/^\/[\\/@]/.test(path)) return false;

  const rawPathSegment = path.split("?")[0].split("#")[0];
  let decodedPathSegment: string;
  try {
    decodedPathSegment = decodeURIComponent(rawPathSegment);
  } catch {
    return false;
  }

  // Rejeita bypasses via percent-encoding (ex: /%09/evil.com, /%5cevil.com, /%2f/evil.com)
  if (hasControlSpaceOrBackslash(decodedPathSegment)) return false;
  if (/^\/[\\/@]/.test(decodedPathSegment) || rawPathSegment.startsWith("//")) return false;

  let parsed: URL;
  try {
    parsed = new URL(path, SAFE_REDIRECT_BASE_ORIGIN);
  } catch {
    return false;
  }

  if (parsed.origin !== SAFE_REDIRECT_BASE_ORIGIN) return false;
  if (parsed.username !== "" || parsed.password !== "") return false;
  if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return false;
  if (parsed.pathname.includes("\\")) return false;

  const normalizedPathname = parsed.pathname.toLowerCase();
  if (
    UNSAFE_AUTH_PREFIXES.some(
      (prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(prefix + "/"),
    )
  ) {
    return false;
  }

  return true;
}

export function getSafeRedirect(path: unknown, fallback = DEFAULT_POST_LOGIN_REDIRECT): string {
  return isSafeRedirect(path) ? path : fallback;
}
