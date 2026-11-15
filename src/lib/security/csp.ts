// Content-Security-Policy com nonce por requisição (auditoria Fase 0 / F0.8).
//
// O servidor (src/server.ts) gera um nonce aleatório por requisição, injeta-o
// num header interno lido pelo router (ssr.nonce → <Scripts/>, <HeadContent/>,
// <ScriptOnce/>) e envia a CSP abaixo nas respostas HTML. Scripts inline sem o
// nonce (ex.: XSS refletido/armazenado) deixam de executar: não há mais
// 'unsafe-inline' em script-src.

/** Header interno (request) que carrega o nonce do server entry até o router. */
export const CSP_NONCE_HEADER = "x-eletricai-csp-nonce";

/** Gera um nonce base64 com 128 bits de entropia (Web Crypto). */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Nonce válido: base64 padrão, 16–64 caracteres. Rejeita qualquer outro valor. */
export function isValidCspNonce(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]{16,64}={0,2}$/.test(value);
}

export interface CspOptions {
  /** Origem do Supabase (https://<ref>.supabase.co) para connect-src. */
  supabaseOrigin: string;
}

/**
 * Monta a CSP de documentos HTML. Mantém as mesmas fontes que a política
 * anterior em vercel.json, exceto 'unsafe-inline' em script-src, substituído
 * pelo nonce da requisição. style-src mantém 'unsafe-inline' (estilos inline
 * de React/Tailwind e <style> do chart); isso não permite execução de script.
 */
export function buildContentSecurityPolicy(nonce: string, opts: CspOptions): string {
  if (!isValidCspNonce(nonce)) {
    throw new Error("CSP nonce inválido");
  }
  const supabase = new URL(opts.supabaseOrigin);
  const supabaseHttps = `https://${supabase.host}`;
  const supabaseWss = `wss://${supabase.host}`;
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "blob:"]],
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    ["font-src", ["'self'", "https://fonts.gstatic.com", "data:"]],
    ["connect-src", ["'self'", supabaseHttps, supabaseWss, "https://*.upstash.io"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "blob:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return [...directives.map(([k, v]) => `${k} ${v.join(" ")}`), "upgrade-insecure-requests"].join(
    "; ",
  );
}
