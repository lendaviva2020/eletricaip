// Lightweight client-side counter for /_serverFn responses.
// Installs a fetch interceptor (once) and exposes a zustand store with totals
// + the last N error events, so the diagnostics panel can render live data.
import { create } from "zustand";

export interface ServerFnEvent {
  ts: number;
  status: number;
  path: string; // last segment of the serverFn id, decoded best-effort
  durationMs: number;
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
  _record: (ev: { status: number; path: string; durationMs: number }) => void;
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
  _record: ({ status, path, durationMs }) =>
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
        const ev: ServerFnEvent = { ts: Date.now(), status, path, durationMs };
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

let installed = false;

export function installDiagnosticsInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const isServerFn = url.includes("/_serverFn/");
    if (!isServerFn) return orig(input as RequestInfo, init);
    const started = performance.now();
    try {
      const res = await orig(input as RequestInfo, init);
      useDiagnosticsCounter.getState()._record({
        status: res.status,
        path: decodeServerFnPath(url),
        durationMs: Math.round(performance.now() - started),
      });
      return res;
    } catch (e) {
      useDiagnosticsCounter.getState()._record({
        status: 0,
        path: decodeServerFnPath(url),
        durationMs: Math.round(performance.now() - started),
      });
      throw e;
    }
  };
}
