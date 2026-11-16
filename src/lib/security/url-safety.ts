/**
 * Validação de URLs EXTERNAS (links de datasheet, callbacks OAuth).
 *
 * `isSafeRedirect` (safe-redirect.ts) cobre redirects RELATIVOS pós-login.
 * Aqui tratamos o caso oposto: destinos legitimamente externos, onde o risco é
 * o esquema (`javascript:`, `data:`, `vbscript:`, `file:`) virar XSS armazenado
 * ou a URL carregar credenciais (`https://user:pass@host`) para phishing.
 * Isomorfo: sem `window`, funciona em SSR e em server functions.
 */

const MAX_URL_LENGTH = 2048;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  // Caracteres de controle podem ser removidos pelo navegador e mascarar o esquema
  // (ex.: "java\tscript:"). Rejeita antes de interpretar.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Retorna a URL normalizada se for http(s) sem credenciais; senão `null`.
 * Use para todo `href` vindo de dados (importação, banco, IA).
 */
export function toSafeExternalHref(raw: unknown): string | null {
  const url = parseUrl(raw);
  if (!url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.toString();
}

/**
 * Destino de redirect de um fluxo OAuth (callback do cliente). Exige HTTPS;
 * HTTP só para loopback (clientes nativos/CLI em desenvolvimento, RFC 8252 §7.3).
 */
export function isSafeOAuthRedirect(raw: unknown): raw is string {
  const url = parseUrl(raw);
  if (!url) return false;
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return Boolean(url.hostname);
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
  return false;
}
