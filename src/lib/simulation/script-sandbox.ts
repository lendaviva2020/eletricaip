// Host wrapper around scada-worker.ts.
// - Per-call timeout (default 250ms) → terminates rogue scripts (infinite loop).
// - Auto-restart of the worker after a timeout/crash.
// - Single-flight: never queues more than one in-flight request to keep tick cadence honest.

export interface SandboxResult {
  ok: boolean;
  tags: Record<string, unknown>;
  logs: string[];
  error: string | null;
  durationMs: number;
}

export class ScriptSandbox {
  private worker: Worker | null = null;
  private nextId = 1;
  private inflight: {
    reqId: number;
    resolve: (r: SandboxResult) => void;
    started: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private timeoutMs = 250) {}

  private spawn(): Worker {
    const w = new Worker(new URL("./scada-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent) => {
      const data = ev.data as {
        reqId: number;
        ok: boolean;
        tags?: Record<string, unknown>;
        logs?: string[];
        error?: string;
      };
      const cur = this.inflight;
      if (!cur || cur.reqId !== data.reqId) return;
      clearTimeout(cur.timer);
      this.inflight = null;
      cur.resolve({
        ok: data.ok,
        tags: data.tags ?? {},
        logs: data.logs ?? [],
        error: data.ok ? null : (data.error ?? "Erro desconhecido"),
        durationMs: performance.now() - cur.started,
      });
    };
    w.onerror = (e) => {
      const cur = this.inflight;
      if (!cur) return;
      clearTimeout(cur.timer);
      this.inflight = null;
      cur.resolve({
        ok: false,
        tags: {},
        logs: [],
        error: (e as ErrorEvent).message || "Worker error",
        durationMs: performance.now() - cur.started,
      });
      this.recycle();
    };
    return w;
  }

  private recycle() {
    try {
      this.worker?.terminate();
    } catch {
      /* noop */
    }
    this.worker = null;
  }

  /** Returns the latest result; if busy, drops the call (returns null). */
  async run(script: string, tags: Record<string, unknown>): Promise<SandboxResult | null> {
    if (this.inflight) return null; // single-flight
    if (!this.worker) this.worker = this.spawn();

    const reqId = this.nextId++;
    const started = performance.now();
    return new Promise<SandboxResult>((resolve) => {
      const timer = setTimeout(() => {
        if (this.inflight?.reqId !== reqId) return;
        this.inflight = null;
        this.recycle();
        resolve({
          ok: false,
          tags: {},
          logs: [],
          error: `Timeout (${this.timeoutMs}ms) — script abortado`,
          durationMs: performance.now() - started,
        });
      }, this.timeoutMs);
      this.inflight = { reqId, resolve, started, timer };
      this.worker!.postMessage({ reqId, script, tags });
    });
  }

  dispose() {
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight = null;
    }
    this.recycle();
  }
}
