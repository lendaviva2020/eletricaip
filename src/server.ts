import "./lib/error-capture";

import {
  captureException,
  consumeLastCapturedError,
  maskSensitiveString,
} from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { CSP_NONCE_HEADER, buildContentSecurityPolicy, generateCspNonce } from "./lib/security/csp";
import { EXPECTED_SUPABASE_PROJECT_REF, getSupabasePublicEnv } from "./integrations/supabase/env";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  requestUrl: string,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const safeUrl = maskSensitiveString(requestUrl);
  const captured =
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error at ${safeUrl}: ${body}`);
  const event = captureException(
    captured,
    { source: "ssr:500", url: safeUrl, status: response.status },
    "fatal",
  );
  console.error(`[ssr:500] ${safeUrl} (eventId=${event.eventId})`);
  console.error(event.stack ?? event.message);
  return brandedErrorResponse();
}

/**
 * Recria a requisição com o nonce no header interno. `set` sobrescreve qualquer
 * valor enviado pelo cliente, que não pode escolher o próprio nonce.
 */
function withCspNonce(request: Request, nonce: string): { request: Request; ok: boolean } {
  // 1) O runtime (srvx/Nitro) entrega uma Request própria; os headers dela
  //    costumam ser mutáveis e preservam propriedades do runtime (ip, waitUntil).
  try {
    request.headers.set(CSP_NONCE_HEADER, nonce);
    if (request.headers.get(CSP_NONCE_HEADER) === nonce) return { request, ok: true };
  } catch {
    /* headers imutáveis — tenta recriar abaixo */
  }
  // 2) Recria a Request a partir de primitivas (não da instância estrangeira).
  try {
    const headers = new Headers(request.headers);
    headers.set(CSP_NONCE_HEADER, nonce);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const rebuilt = new Request(request.url, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      signal: request.signal,
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
    return { request: rebuilt, ok: true };
  } catch {
    return { request, ok: false };
  }
}

function resolveSupabaseOriginForCsp(): string {
  try {
    return new URL(getSupabasePublicEnv().url).origin;
  } catch {
    return `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
  }
}

/**
 * Aplica a CSP com nonce às respostas HTML (F0.8). Em produção a política é
 * aplicada; fora dela vai como Report-Only, porque o Vite dev injeta scripts
 * inline próprios (HMR) sem nonce.
 */
function applyDocumentCsp(response: Response, nonce: string, nonceInjected: boolean): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  const policy = buildContentSecurityPolicy(nonce, {
    supabaseOrigin: resolveSupabaseOriginForCsp(),
  });
  // Se o nonce não chegou ao router, os scripts sairiam sem ele; nesse caso
  // a política vai como Report-Only para não derrubar a aplicação.
  const enforce = process.env.NODE_ENV === "production" && nonceInjected;
  const headerName = enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
  const secured = new Response(response.body, response);
  secured.headers.set(headerName, policy);
  return secured;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = generateCspNonce();
    const injected = withCspNonce(request, nonce);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(injected.request, env, ctx);
      return applyDocumentCsp(
        await normalizeCatastrophicSsrResponse(response, request.url),
        nonce,
        injected.ok,
      );
    } catch (error) {
      const safeUrl = maskSensitiveString(request.url);
      const event = captureException(error, { source: "ssr:throw", url: safeUrl }, "fatal");
      console.error(`[ssr:throw] ${safeUrl} (eventId=${event.eventId})`);
      console.error(event.stack ?? event.message);
      return applyDocumentCsp(brandedErrorResponse(), nonce, injected.ok);
    }
  },
};
