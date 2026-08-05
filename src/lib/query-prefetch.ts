import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Dispara o fetch de uma query em paralelo ao carregamento da rota, para que o
 * dado não espere o mount do componente no client.
 *
 * Regras importantes:
 * - Server functions protegidas exigem bearer token; durante SSR/prerender não
 *   existe sessão, então o prefetch só roda no browser.
 * - Erros nunca derrubam a rota: o `useQuery` do componente continua sendo a
 *   fonte de verdade de loading/erro.
 */
export function prefetchRouteQuery<T>(
  queryClient: QueryClient,
  options: { queryKey: QueryKey; queryFn: () => Promise<T> },
): void {
  if (typeof window === "undefined") return;
  void queryClient.ensureQueryData(options).catch(() => undefined);
}
