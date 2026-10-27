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
export function isSafeRedirect(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  // Bloqueia "//evil.com" (protocol-relative) e "/\evil.com" (alguns
  // parsers de URL tratam barra invertida como equivalente a "/").
  if (/^\/[\\/]/.test(path)) return false;

  // Extrai o pathname base desconsiderando query string e hash
  const pathname = path.split("?")[0].split("#")[0];
  if (
    UNSAFE_AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))
  ) {
    return false;
  }

  return true;
}

export function getSafeRedirect(path: unknown, fallback = DEFAULT_POST_LOGIN_REDIRECT): string {
  return isSafeRedirect(path) ? path : fallback;
}
