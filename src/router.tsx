import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { routeTree } from "./routeTree.gen";
import { CSP_NONCE_HEADER, isValidCspNonce } from "./lib/security/csp";

// Nonce da CSP (auditoria F0.8). No servidor vem do header interno definido por
// src/server.ts para a requisição atual; no cliente é lido do próprio documento
// (o browser expõe `nonce` só via propriedade, nunca via atributo serializado).
const getCspNonce = createIsomorphicFn()
  .server((): string | undefined => {
    const value = getRequest()?.headers.get(CSP_NONCE_HEADER);
    return isValidCspNonce(value) ? value : undefined;
  })
  .client((): string | undefined => {
    const value = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    return isValidCspNonce(value) ? value : undefined;
  });

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ssr: { nonce: getCspNonce() },
  });

  return router;
};
