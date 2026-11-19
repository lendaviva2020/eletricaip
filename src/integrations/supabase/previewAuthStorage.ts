// Storage da sessão Supabase no navegador.
//
// Antes este arquivo fazia brokering da sessão para o editor Lovable via
// postMessage (preview). O Lovable foi removido do projeto; em produção o app
// sempre caía no `localStorage` de qualquer forma, então mantemos apenas isso.
// SSR-safe: no servidor não há `window`, então o Supabase usa seu storage
// interno em memória (retornamos `undefined`).
export function brokeredPreviewStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
