// Lightweight client-side counter for /_serverFn responses.
// Installs a fetch interceptor (once) and exposes a zustand store with totals
// + the last N error events, so the diagnostics panel can render live data.
import { create } from "zustand";

export type DiagnosticsKind = "serverFn" | "ssr";

export interface ServerFnEvent {
  ts: number;
  status: number;
  path: string; // last segment of the serverFn id, decoded best-effort
  durationMs: number;
  /** Origem do erro: chamada de server function ou navegação/documento SSR. */
  kind: DiagnosticsKind;
}


interface DiagnosticsState {
  total: number;
  ok: number;
  count500: number;
  count503: number;
  count4xx: number;
  countOtherErr: number;
  recentErrors: ServerFnEvent[];
  reset: () => void;
  _record: (ev: {
    status: number;
    path: string;
    durationMs: number;
    kind?: DiagnosticsKind;
  }) => void;

}

export const useDiagnosticsCounter = create<DiagnosticsState>((set) => ({
  total: 0,
  ok: 0,
  count500: 0,
  count503: 0,
  count4xx: 0,
  countOtherErr: 0,
  recentErrors: [],
  reset: () =>
    set({
      total: 0,
      ok: 0,
      count500: 0,
      count503: 0,
      count4xx: 0,
      countOtherErr: 0,
      recentErrors: [],
    }),
  _record: ({ status, path, durationMs, kind = "serverFn" }) =>
    set((s) => {
      const isOk = status >= 200 && status < 300;
      const next: Partial<DiagnosticsState> = {
        total: s.total + 1,
        ok: s.ok + (isOk ? 1 : 0),
        count500: s.count500 + (status === 500 ? 1 : 0),
        count503: s.count503 + (status === 503 ? 1 : 0),
        count4xx: s.count4xx + (status >= 400 && status < 500 ? 1 : 0),
        countOtherErr:
          s.countOtherErr +
          (!isOk && status !== 500 && status !== 503 && !(status >= 400 && status < 500) ? 1 : 0),
      };
      if (!isOk) {
        const ev: ServerFnEvent = { ts: Date.now(), status, path, durationMs, kind };

        next.recentErrors = [ev, ...s.recentErrors].slice(0, 25);
      }
      return next as DiagnosticsState;
    }),
}));

function decodeServerFnPath(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    const id = u.pathname.split("/_serverFn/")[1] ?? u.pathname;
    try {
      const decoded = JSON.parse(atob(id));
      if (decoded?.export) return String(decoded.export).replace("_createServerFn_handler", "");
      if (decoded?.file) return String(decoded.file).split("/").pop() ?? id;
    } catch {
      /* ignore */
    }
    return id.slice(0, 32);
  } catch {
    return url.slice(0, 32);
  }
}

function shortPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

let installed = false;


export function installDiagnosticsInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isServerFn = url.includes("/_serverFn/");
    const isSameOrigin = url.startsWith("/") || url.startsWith(window.location.origin);
    // Fora de server functions só nos interessam falhas 5xx de SSR/navegação
    // (documento ou payload de rota), para separar "500 de SSR" de "500 de server fn".
    if (!isServerFn && !isSameOrigin) return orig(input as RequestInfo, init);

    const started = performance.now();
    const kind: DiagnosticsKind = isServerFn ? "serverFn" : "ssr";
    const path = isServerFn ? decodeServerFnPath(url) : shortPath(url);
    try {
      const res = await orig(input as RequestInfo, init);
      if (isServerFn || res.status >= 500) {
        useDiagnosticsCounter.getState()._record({
          status: res.status,
          path,
          durationMs: Math.round(performance.now() - started),
          kind,
        });
      }
      return res;
    } catch (e) {
      if (isServerFn) {
        useDiagnosticsCounter.getState()._record({
          status: 0,
          path,
          durationMs: Math.round(performance.now() - started),
          kind,
        });
      }
      throw e;
    }
  };

}
