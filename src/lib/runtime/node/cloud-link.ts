// Ligação do Runtime com a nuvem ElétricAi: relata estado/telemetria e baixa o
// pacote APROVADO. Node.js. A resposta da nuvem é DADO NÃO CONFIÁVEL: o pacote
// só é aceito com o hash conferido; a nuvem pode pedir PARADA, nunca arme.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { verifyRuntimePackage } from "../program-package";
import type { RuntimeDaemon, RuntimeEvent } from "./runtime-daemon";

export interface CloudLinkOptions {
  cloudUrl: string;
  token: string;
  stateDir: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ReportReply = z.object({
  desired: z
    .object({
      packageId: z.string().uuid(),
      hash: z.string().regex(/^[0-9a-f]{64}$/),
      approved: z.boolean(),
    })
    .nullable(),
  stop: z.boolean().default(false),
});

const PackageReply = z.object({
  package: z.unknown(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  approved: z.boolean(),
});

/** Só HTTPS (ou localhost para desenvolvimento): o token não trafega em claro. */
export function validateCloudUrl(raw: string): string {
  const u = new URL(raw);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) {
    throw new Error("ELETRICAI_CLOUD_URL precisa ser https://");
  }
  return u.origin;
}

const MAX_REPORT_TAGS = 500;

export class CloudLink {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  lastError: string | null = null;
  lastOkAt: number | null = null;

  constructor(
    private readonly daemon: RuntimeDaemon,
    private readonly opts: CloudLinkOptions,
  ) {
    this.base = validateCloudUrl(opts.cloudUrl);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const r = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        redirect: "error",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const text = await r.text();
      if (text.length > 3_000_000) throw new Error("resposta grande demais");
      const body: unknown = text ? JSON.parse(text) : {};
      if (!r.ok) {
        const msg = (body as { error?: string }).error ?? `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return body;
    } finally {
      clearTimeout(t);
    }
  }

  /** Um ciclo de sincronização. Nunca lança: erros ficam em `lastError`. */
  async sync(): Promise<void> {
    const status = this.daemon.status();
    const events: RuntimeEvent[] = this.daemon.takeUnsentEvents();
    const mapped = new Set([...status.inputs, ...status.outputs]);
    const tags = Object.fromEntries(
      Object.entries(status.tags)
        .filter(([k]) => mapped.has(k))
        .slice(0, MAX_REPORT_TAGS),
    );
    try {
      const reply = ReportReply.parse(
        await this.call("/api/public/runtime/report", {
          method: "POST",
          body: JSON.stringify({
            mode: status.mode,
            blockers: status.blockers.slice(0, 20),
            packageHash: status.packageHash,
            scans: status.scans,
            lastScanMs: status.lastScanMs,
            connections: status.connections.slice(0, 32),
            faults: status.faults.slice(0, 20),
            tags,
            events: events.slice(-100),
          }),
        }),
      );
      this.lastOkAt = Date.now();
      this.lastError = null;
      if (reply.stop) this.daemon.disarm("parada solicitada pela nuvem");
      const d = reply.desired;
      if (d && (d.hash !== status.packageHash || d.approved !== status.approved)) {
        await this.fetchPackage(d.packageId, d.hash);
      }
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      // Eventos voltam para a fila (serão reenviados).
      this.daemon.requeueEvents(events);
    }
  }

  private async fetchPackage(id: string, expectedHash: string): Promise<void> {
    const reply = PackageReply.parse(
      await this.call(`/api/public/runtime/package?id=${encodeURIComponent(id)}`),
    );
    if (reply.hash !== expectedHash) throw new Error("hash divergente entre relatório e pacote");
    const v = await verifyRuntimePackage(reply.package, reply.hash);
    if (!v.ok) throw new Error(v.error);
    await this.daemon.offerPackage(v.pkg, reply.approved);
    await this.saveCache({ package: v.pkg, hash: reply.hash, approved: reply.approved });
  }

  private async saveCache(c: { package: unknown; hash: string; approved: boolean }): Promise<void> {
    await mkdir(this.opts.stateDir, { recursive: true, mode: 0o700 });
    const tmp = join(this.opts.stateDir, "package.json.tmp");
    await writeFile(tmp, JSON.stringify(c), { mode: 0o600 });
    await rename(tmp, join(this.opts.stateDir, "package.json"));
  }
}

/** Pacote salvo da última sincronização (reinício sem internet). */
export async function loadCachedPackage(stateDir: string) {
  try {
    const raw = JSON.parse(await readFile(join(stateDir, "package.json"), "utf8")) as {
      package: unknown;
      hash: string;
      approved: boolean;
    };
    const v = await verifyRuntimePackage(raw.package, raw.hash);
    return v.ok ? { pkg: v.pkg, approved: raw.approved === true } : null;
  } catch {
    return null;
  }
}
