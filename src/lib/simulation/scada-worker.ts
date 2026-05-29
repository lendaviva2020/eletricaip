// SCADA scripting sandbox — runs untrusted JS off the main thread.
// The worker has NO DOM, NO fetch (we re-stub it), NO postMessage to network.
// It exposes only `tags` (mutable object) and a safe `console` to the script.

type Req = {
  reqId: number;
  script: string;
  tags: Record<string, unknown>;
};

type Res =
  | { reqId: number; ok: true; tags: Record<string, unknown>; logs: string[] }
  | { reqId: number; ok: false; error: string; logs: string[] };

// Strip dangerous globals best-effort. Workers already lack `window`/`document`.
// We also block network access from inside the script.
const blocked = ["fetch", "XMLHttpRequest", "WebSocket", "importScripts", "indexedDB", "caches"];
for (const k of blocked) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any)[k] = undefined;
  } catch {
    /* noop */
  }
}

self.addEventListener("message", (ev: MessageEvent<Req>) => {
  const { reqId, script, tags } = ev.data;
  const logs: string[] = [];
  const safeConsole = {
    log: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
    warn: (...a: unknown[]) => logs.push("[warn] " + a.map(String).join(" ")),
    error: (...a: unknown[]) => logs.push("[err]  " + a.map(String).join(" ")),
  };

  try {
    const next: Record<string, unknown> = { ...tags };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function("tags", "console", `"use strict";\n${script}`);
    fn(next, safeConsole);
    const res: Res = { reqId, ok: true, tags: next, logs };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: Res = {
      reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      logs,
    };
    (self as unknown as Worker).postMessage(res);
  }
});

export {};
