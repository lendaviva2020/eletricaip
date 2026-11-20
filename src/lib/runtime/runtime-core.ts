// Núcleo de execução do ElétricAi Runtime — PURO (sem rede, sem relógio global).
//
// Ciclo IEC 61131-3: (1) imagem das entradas congelada no início do ciclo,
// (2) Ladder e FB Electric Studio executados com os MESMOS motores dos editores
// (o resultado no gateway é idêntico ao do simulador), (3) saídas calculadas
// entregues à guarda de escrita. A rede (drivers) fica fora daqui: quem chama
// alimenta `applyInputs` e recebe as escritas decididas.
import {
  createScanState,
  scanRungsPure,
  type PureTags,
  type ScanState,
} from "@/lib/ladder/scan-core";
import type { LadderRung } from "@/lib/ladder/types";
import { CompactExecutionEngine } from "@/lib/compact-studio/runtime/compact-execution-engine";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import type { RuntimePackage } from "./program-package";
import type { IoPoint } from "./io-map";
import { WriteGuard, type GuardDecision, type SafetyConditions } from "./write-guard";

export type TagValue = boolean | number;

export interface InputSample {
  tag: string;
  value: TagValue;
  ok: boolean;
  at: number;
}

export interface ScanOutcome {
  scan: number;
  durationMs: number;
  overrun: boolean;
  decision: GuardDecision;
  /** Saídas calculadas pela lógica (tag → valor), escritas ou não. */
  desired: Record<string, TagValue>;
  faults: string[];
}

/** Ciclo acima disso é estouro (watchdog de software). */
export const OVERRUN_FACTOR = 2;
/**
 * Piso do watchdog: pausas curtas do sistema operacional/coletor de lixo não
 * derrubam o processo; travamento real (≥ 250 ms sem varrer) sim.
 */
export const WATCHDOG_FLOOR_MS = 250;
export function watchdogLimitMs(scanMs: number): number {
  return Math.max(OVERRUN_FACTOR * scanMs, WATCHDOG_FLOOR_MS);
}
/** Entrada sem leitura boa há mais que isso = comunicação perdida. */
export function inputStaleAfterMs(pkg: RuntimePackage): number {
  const polls = pkg.ioMap.connections.map((c) => (c.kind === "modbus_tcp" ? c.pollMs : 0));
  return Math.max(500, 3 * Math.max(pkg.scanMs, ...polls));
}

export class RuntimeCore {
  readonly pkg: RuntimePackage;
  readonly guard: WriteGuard;
  private image: PureTags;
  private ladderState: ScanState = createScanState();
  private readonly studio: CompactExecutionEngine | null;
  private readonly inputs: IoPoint[];
  private readonly outputs: IoPoint[];
  private readonly lastGood = new Map<string, number>();
  private readonly mappedTags: Set<string>;
  private scanCount = 0;
  private lastScanAt: number | null = null;
  private approved = false;
  private hashVerified = false;
  private overrun = false;

  constructor(pkg: RuntimePackage) {
    this.pkg = pkg;
    this.guard = new WriteGuard(pkg.ioMap);
    this.inputs = pkg.ioMap.points.filter((p) => p.direction === "input");
    this.outputs = pkg.ioMap.points.filter((p) => p.direction === "output");
    this.mappedTags = new Set(pkg.ioMap.points.map((p) => p.tag));
    this.image = { ...pkg.initialTags };
    for (const p of this.outputs) {
      // Saídas começam no valor seguro (ou desligadas) — nunca num valor herdado.
      this.image[p.tag] = p.safeValue ?? (p.dataType === "BOOL" ? false : 0);
    }
    for (const p of this.inputs) {
      if (!(p.tag in this.image)) this.image[p.tag] = p.dataType === "BOOL" ? false : 0;
    }
    this.studio = pkg.studio
      ? new CompactExecutionEngine(pkg.studio as CompactProgramModel, 0)
      : null;
  }

  /** Registro da aprovação conferida (nuvem) e do hash recalculado (local). */
  setTrust(approved: boolean, hashVerified: boolean): void {
    this.approved = approved;
    this.hashVerified = hashVerified;
  }

  get studioCompileOk(): boolean {
    return this.studio?.compileOk ?? true;
  }

  applyInputs(samples: readonly InputSample[]): void {
    for (const s of samples) {
      if (!this.inputs.some((p) => p.tag === s.tag)) continue; // só entradas mapeadas
      if (s.ok) {
        this.image[s.tag] = s.value;
        this.lastGood.set(s.tag, s.at);
      }
    }
  }

  /**
   * Comando de operador (WebVisu/HMI): só em tags de MEMÓRIA (não mapeadas no
   * campo). Saídas físicas nunca são comandadas direto — a lógica decide.
   */
  setCommand(tag: string, value: TagValue): boolean {
    if (this.mappedTags.has(tag)) return false;
    if (!/^[A-Za-z_][A-Za-z0-9_.]{0,47}$/.test(tag)) return false;
    this.image[tag] = value;
    return true;
  }

  conditions(now: number): SafetyConditions {
    const staleAfter = inputStaleAfterMs(this.pkg);
    const inputsFresh = this.inputs.every((p) => {
      const t = this.lastGood.get(p.tag);
      return t !== undefined && now - t <= staleAfter;
    });
    const estopTag = this.pkg.ioMap.estopTag;
    let estopOk: boolean | null = null;
    if (estopTag) {
      const t = this.lastGood.get(estopTag);
      estopOk = t !== undefined && now - t <= staleAfter && this.image[estopTag] === true;
    }
    return {
      packageApproved: this.approved,
      hashVerified: this.hashVerified,
      estopOk,
      inputsFresh,
      scanOverrun: this.overrun,
    };
  }

  /** Executa UM ciclo. `now` em ms (monotônico); `clock()` mede a duração. */
  scan(now: number, clock: () => number = () => now): ScanOutcome {
    const started = clock();
    const faults: string[] = [];
    const dt = this.lastScanAt === null ? this.pkg.scanMs : Math.max(0, now - this.lastScanAt);
    // Atraso do laço (o processo "travou") também é estouro.
    const limit = watchdogLimitMs(this.pkg.scanMs);
    const late = this.lastScanAt !== null && dt > limit;
    this.lastScanAt = now;

    // 1. imagem das entradas congelada
    let tags: PureTags = { ...this.image };
    // 2a. Ladder
    if (this.pkg.ladder.rungs.length > 0) {
      try {
        tags = scanRungsPure(
          this.pkg.ladder.rungs as unknown as LadderRung[],
          tags,
          this.ladderState,
          now,
        ).tags;
      } catch (e) {
        faults.push(`Ladder: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // 2b. FB Electric Studio (mesma imagem de processo)
    if (this.studio) {
      if (!this.studio.compileOk) faults.push("FB Studio: programa não compila");
      for (const sym of this.pkg.studio?.ioSymbols ?? []) {
        const name = sym.symbolicName || sym.address;
        const v = tags[name];
        if (typeof v === "boolean" || typeof v === "number") this.studio.setInput(name, v);
      }
      const frame = this.studio.step(dt);
      for (const f of frame.faults) faults.push(`FB Studio: ${f.message}`);
      for (const sym of this.pkg.studio?.ioSymbols ?? []) {
        if (!["DO", "AO", "NQ", "NAQ"].includes(sym.ioKind)) continue;
        const name = sym.symbolicName || sym.address;
        const v = frame.variables[name];
        if (typeof v === "boolean" || typeof v === "number") tags[name] = v;
      }
    }
    // Entradas mapeadas não podem ser sobrescritas pela lógica.
    for (const p of this.inputs) tags[p.tag] = this.image[p.tag];
    for (const [k, v] of Object.entries(tags)) {
      if (typeof v === "boolean" || typeof v === "number") this.image[k] = v;
    }

    const durationMs = Math.max(0, clock() - started);
    this.overrun = late || durationMs > limit || faults.length > 0;
    if (late) faults.push(`laço atrasado: ${Math.round(dt)} ms (limite ${limit} ms)`);
    if (durationMs > limit) {
      faults.push(`varredura levou ${durationMs.toFixed(1)} ms (limite ${limit} ms)`);
    }

    const desired: Record<string, TagValue> = {};
    for (const p of this.outputs) {
      const v = this.image[p.tag];
      if (typeof v === "boolean" || typeof v === "number") desired[p.tag] = v;
    }
    const decision = this.guard.decide(desired, this.conditions(now));
    this.scanCount++;
    return { scan: this.scanCount, durationMs, overrun: this.overrun, decision, desired, faults };
  }

  /** Cópia da imagem de processo (para WebVisu/telemetria). */
  snapshot(): Record<string, TagValue> {
    const out: Record<string, TagValue> = {};
    for (const [k, v] of Object.entries(this.image)) {
      if (typeof v === "boolean" || typeof v === "number") out[k] = v;
    }
    return out;
  }

  get scans(): number {
    return this.scanCount;
  }
}
