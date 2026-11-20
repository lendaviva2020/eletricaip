// Processo do ElétricAi Runtime no gateway (PC / Raspberry Pi / gateway Linux).
//
// Laços independentes: leitura do campo (pollMs), varredura (scanMs, com
// medição de atraso) e sincronização com a nuvem. A nuvem entrega pacotes
// APROVADOS e pode PARAR; nunca arma — o arme é local (WebVisu com PIN).
// Pacote novo só é carregado com o Runtime fora de operação (como o download
// de um CLP exige STOP).
import { RuntimeCore, type TagValue } from "../runtime-core";
import { runtimePackageHash, type RuntimePackage } from "../program-package";
import { FieldIo, type ConnectionStatus } from "./field-io";
import { blockersFor, type RuntimeMode } from "../write-guard";

export interface RuntimeEvent {
  at: string;
  kind: "ARM" | "DISARM" | "SAFE" | "PACKAGE_LOADED" | "WRITE_FAULT" | "COMMAND" | "LOGIN_FAILED";
  message: string;
}

export interface RuntimeStatus {
  mode: RuntimeMode;
  blockers: string[];
  packageHash: string | null;
  packageLabel: string | null;
  projectName: string | null;
  approved: boolean;
  pendingPackageHash: string | null;
  scans: number;
  lastScanMs: number;
  connections: ConnectionStatus[];
  faults: string[];
  tags: Record<string, TagValue>;
  inputs: string[];
  outputs: string[];
}

const MAX_EVENTS = 500;

export class RuntimeDaemon {
  private core: RuntimeCore | null = null;
  private io: FieldIo | null = null;
  private hash: string | null = null;
  private approved = false;
  private pending: { pkg: RuntimePackage; hash: string; approved: boolean } | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScanMs = 0;
  private faults: string[] = [];
  private writing = false;
  private readonly events: RuntimeEvent[] = [];
  private unsentEvents: RuntimeEvent[] = [];
  private running = false;

  constructor(
    private readonly clock: () => number = () => performance.now(),
    private readonly onEvent: (e: RuntimeEvent) => void = () => undefined,
  ) {}

  event(kind: RuntimeEvent["kind"], message: string): void {
    const e = { at: new Date().toISOString(), kind, message };
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.unsentEvents.push(e);
    if (this.unsentEvents.length > MAX_EVENTS) this.unsentEvents.shift();
    this.onEvent(e);
  }

  /** Eventos ainda não enviados à nuvem (e limpa a fila). */
  takeUnsentEvents(): RuntimeEvent[] {
    const out = this.unsentEvents;
    this.unsentEvents = [];
    return out;
  }

  /** Devolve à fila eventos cujo envio falhou (mantém a ordem). */
  requeueEvents(events: readonly RuntimeEvent[]): void {
    this.unsentEvents = [...events, ...this.unsentEvents].slice(-MAX_EVENTS);
  }

  recentEvents(): RuntimeEvent[] {
    return [...this.events].reverse().slice(0, 100);
  }

  get mode(): RuntimeMode {
    return this.core?.guard.currentMode ?? "SHADOW";
  }

  /**
   * Oferece um pacote (já verificado por hash). Carrega agora se o Runtime não
   * estiver em operação; senão fica pendente até o desarme.
   */
  async offerPackage(
    pkg: RuntimePackage,
    approved: boolean,
  ): Promise<"loaded" | "pending" | "same"> {
    const hash = await runtimePackageHash(pkg);
    if (hash === this.hash) {
      if (this.approved !== approved) {
        this.approved = approved;
        this.core?.setTrust(approved, true);
        if (!approved) this.disarm("aprovação revogada na nuvem");
      }
      return "same";
    }
    if (this.mode === "RUN") {
      this.pending = { pkg, hash, approved };
      return "pending";
    }
    this.load(pkg, hash, approved);
    return "loaded";
  }

  private load(pkg: RuntimePackage, hash: string, approved: boolean): void {
    this.stopLoops();
    this.io?.close();
    this.core = new RuntimeCore(pkg);
    this.core.setTrust(approved, true);
    this.io = new FieldIo(pkg.ioMap, () => this.clock());
    this.hash = hash;
    this.approved = approved;
    this.pending = null;
    this.faults = [];
    this.event("PACKAGE_LOADED", `${pkg.projectName} ${pkg.label} (${hash.slice(0, 12)})`);
    if (this.running) this.startLoops();
  }

  start(): void {
    this.running = true;
    this.startLoops();
  }

  private startLoops(): void {
    const core = this.core;
    const io = this.io;
    if (!core || !io) return;
    const pollMs = Math.min(
      core.pkg.scanMs,
      ...core.pkg.ioMap.connections.map((c) =>
        c.kind === "modbus_tcp" ? c.pollMs : core.pkg.scanMs,
      ),
    );
    const poll = async () => {
      if (this.core !== core) return;
      try {
        core.applyInputs(await io.readInputs());
      } catch (e) {
        this.faults = [`leitura: ${e instanceof Error ? e.message : String(e)}`];
      }
      if (this.core === core) this.pollTimer = setTimeout(poll, pollMs);
    };
    const scan = () => {
      if (this.core !== core) return;
      const now = this.clock();
      const before = core.guard.currentMode;
      const out = core.scan(now, this.clock);
      this.lastScanMs = out.durationMs;
      this.faults = out.faults;
      if (out.decision.transition) {
        this.event("SAFE", `falha em operação: ${out.decision.transition.reason}`);
      }
      if (out.decision.mode !== "SHADOW" && !this.writing) {
        this.writing = true;
        const force = before !== out.decision.mode;
        void io
          .writeOutputs(out.decision.writes, force)
          .then((errs) => {
            if (errs.length && core.guard.currentMode === "RUN") {
              core.guard.disarm(`falha ao escrever: ${errs[0]}`);
              this.event("WRITE_FAULT", errs.join("; "));
            }
          })
          .finally(() => {
            this.writing = false;
          });
      }
      if (this.core === core) {
        const elapsed = this.clock() - now;
        this.scanTimer = setTimeout(scan, Math.max(0, core.pkg.scanMs - elapsed));
      }
    };
    void poll();
    this.scanTimer = setTimeout(scan, core.pkg.scanMs);
  }

  private stopLoops(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.scanTimer = this.pollTimer = null;
  }

  /** Arme LOCAL (chamado só pelo WebVisu após o PIN). */
  arm(): { ok: true } | { ok: false; blockers: string[] } {
    if (!this.core) return { ok: false, blockers: ["nenhum programa carregado"] };
    const r = this.core.guard.arm(this.core.conditions(this.clock()));
    if (r.ok) this.event("ARM", "Runtime armado localmente — escrita em campo habilitada");
    return r;
  }

  /** Parar é sempre permitido (local ou nuvem). Pacote pendente carrega depois. */
  disarm(reason: string): void {
    if (!this.core) return;
    if (this.core.guard.currentMode === "RUN") {
      this.core.guard.disarm(reason);
      this.event("DISARM", reason);
    }
    const p = this.pending;
    if (p) {
      // Dá um ciclo para os valores seguros saírem antes de trocar o programa.
      setTimeout(
        () => {
          if (this.pending === p && this.mode !== "RUN") this.load(p.pkg, p.hash, p.approved);
        },
        (this.core.pkg.scanMs ?? 50) * 3,
      );
    }
  }

  command(tag: string, value: TagValue): boolean {
    const ok = this.core?.setCommand(tag, value) ?? false;
    if (ok) this.event("COMMAND", `${tag} = ${String(value)}`);
    return ok;
  }

  /** Bancada virtual: entrada de conexão simulada. */
  setSimulatedInput(tag: string, value: TagValue): boolean {
    return this.io?.setSimulatedInput(tag, value) ?? false;
  }

  status(): RuntimeStatus {
    const core = this.core;
    const now = this.clock();
    return {
      mode: this.mode,
      blockers: core
        ? core.guard.currentMode === "SAFE"
          ? [core.guard.fault ?? "aguardando rearme local"]
          : core.guard.currentMode === "RUN"
            ? []
            : blockersFor(core.pkg.ioMap, core.conditions(now))
        : ["nenhum programa carregado"],
      packageHash: this.hash,
      packageLabel: core?.pkg.label ?? null,
      projectName: core?.pkg.projectName ?? null,
      approved: this.approved,
      pendingPackageHash: this.pending?.hash ?? null,
      scans: core?.scans ?? 0,
      lastScanMs: Math.round(this.lastScanMs * 100) / 100,
      connections: this.io?.connectionStatus() ?? [],
      faults: this.faults,
      tags: core?.snapshot() ?? {},
      inputs: core?.pkg.ioMap.points.filter((p) => p.direction === "input").map((p) => p.tag) ?? [],
      outputs:
        core?.pkg.ioMap.points.filter((p) => p.direction === "output").map((p) => p.tag) ?? [],
    };
  }

  get package(): RuntimePackage | null {
    return this.core?.pkg ?? null;
  }

  stop(): void {
    this.running = false;
    this.stopLoops();
    this.io?.close();
  }
}
