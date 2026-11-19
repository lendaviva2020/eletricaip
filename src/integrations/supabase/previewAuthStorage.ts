// Storage da sessão Supabase no navegador.
//
// Em produção o app sempre usa o `localStorage` do navegador. SSR-safe: no
// servidor não há `window`, então o Supabase usa seu storage interno em
// memória (retornamos `undefined`).
export function brokeredPreviewStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
