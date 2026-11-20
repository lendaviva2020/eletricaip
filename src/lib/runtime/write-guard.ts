// Guarda de escrita em campo do ElétricAi Runtime — PURO.
//
// Arquitetura de autorização exigida pela regra 21 (AGENTS.md) e NR-10/NR-12:
// uma saída só é escrita no campo com TODAS as condições abaixo verdadeiras.
//   1. pacote APROVADO na nuvem por owner/admin/engenheiro e hash conferido;
//   2. ARME LOCAL no gateway (ação presencial com PIN — a nuvem NÃO arma);
//   3. emergência do campo mapeada e íntegra (contato NF, 1 = ok);
//   4. todas as entradas com leitura recente (comunicação ok);
//   5. ciclo de varredura dentro do orçamento (sem estouro);
//   6. a saída tem `writeEnabled` e o valor está dentro dos limites.
// Qualquer falha com o Runtime em operação TRAVA em SEGURO: escreve o
// `safeValue` de todas as saídas habilitadas e exige novo arme local (rearme
// manual e intencional; nunca religa sozinho). Um botão de software NÃO
// substitui o circuito físico de emergência.
import type { IoMap, IoPoint } from "./io-map";
import { writableOutputs } from "./io-map";

export type RuntimeMode =
  /** Nunca armado: lê, executa e mostra; não escreve nada no campo. */
  | "SHADOW"
  /** Armado: escreve as saídas calculadas. */
  | "RUN"
  /** Falha com o Runtime armado: saídas no valor seguro, aguardando rearme local. */
  | "SAFE";

export interface SafetyConditions {
  packageApproved: boolean;
  hashVerified: boolean;
  /** null = emergência não mapeada; false = atuada ou sem leitura. */
  estopOk: boolean | null;
  inputsFresh: boolean;
  scanOverrun: boolean;
}

export interface FieldWrite {
  point: IoPoint;
  value: boolean | number;
}

export interface GuardDecision {
  mode: RuntimeMode;
  writes: FieldWrite[];
  /** Por que não está em RUN (vazio em RUN). */
  blockers: string[];
  /** Mudança de modo neste ciclo (para auditoria), ou null. */
  transition: { from: RuntimeMode; to: RuntimeMode; reason: string } | null;
}

export function blockersFor(map: IoMap, c: SafetyConditions): string[] {
  const b: string[] = [];
  if (!c.packageApproved) b.push("pacote não aprovado na nuvem");
  if (!c.hashVerified) b.push("hash do pacote não conferido");
  if (!map.estopTag) b.push("emergência do campo não mapeada");
  else if (c.estopOk !== true) b.push("emergência atuada ou sem leitura");
  if (!c.inputsFresh) b.push("comunicação com o campo perdida");
  if (c.scanOverrun) b.push("ciclo de varredura estourado");
  if (writableOutputs(map).length === 0) b.push("nenhuma saída com escrita habilitada");
  return b;
}

function coerce(point: IoPoint, raw: unknown): boolean | number | null {
  if (point.dataType === "BOOL") return Boolean(raw);
  const n = typeof raw === "boolean" ? (raw ? 1 : 0) : Number(raw);
  if (!Number.isFinite(n)) return null;
  return point.dataType === "INT" ? Math.round(n) : n;
}

function inLimits(point: IoPoint, v: boolean | number): boolean {
  if (typeof v !== "number") return true;
  if (point.min !== undefined && v < point.min) return false;
  if (point.max !== undefined && v > point.max) return false;
  return true;
}

export function safeWrites(map: IoMap): FieldWrite[] {
  return writableOutputs(map)
    .filter((p) => p.safeValue !== undefined)
    .map((p) => ({ point: p, value: p.safeValue as boolean | number }));
}

/**
 * Máquina de estados do arme. `armRequested` vem SÓ da ação local no gateway;
 * `disarmRequested` pode vir de qualquer lugar (parar é sempre permitido).
 */
export class WriteGuard {
  private mode: RuntimeMode = "SHADOW";
  private lastFault: string | null = null;

  constructor(private readonly map: IoMap) {}

  get currentMode(): RuntimeMode {
    return this.mode;
  }

  get fault(): string | null {
    return this.lastFault;
  }

  /** Arme local: só entra em RUN se nada bloquear. */
  arm(c: SafetyConditions): { ok: true } | { ok: false; blockers: string[] } {
    const blockers = blockersFor(this.map, c);
    if (blockers.length > 0) return { ok: false, blockers };
    this.mode = "RUN";
    this.lastFault = null;
    return { ok: true };
  }

  /** Desarme intencional: vai a SEGURO (escreve os valores seguros uma vez). */
  disarm(reason = "desarme do operador"): void {
    if (this.mode === "RUN") {
      this.mode = "SAFE";
      this.lastFault = reason;
    }
  }

  /**
   * Decide o que escrever neste ciclo a partir das saídas calculadas pela
   * lógica (`desired`, tag → valor).
   */
  decide(desired: Readonly<Record<string, unknown>>, c: SafetyConditions): GuardDecision {
    const from = this.mode;
    if (this.mode === "SHADOW") {
      return { mode: "SHADOW", writes: [], blockers: blockersFor(this.map, c), transition: null };
    }
    if (this.mode === "SAFE") {
      return {
        mode: "SAFE",
        writes: safeWrites(this.map),
        blockers: [this.lastFault ?? "aguardando rearme local"],
        transition: null,
      };
    }
    // RUN
    const blockers = blockersFor(this.map, c);
    const writes: FieldWrite[] = [];
    for (const p of writableOutputs(this.map)) {
      const v = coerce(p, desired[p.tag]);
      if (v === null) {
        blockers.push(`${p.tag}: valor calculado inválido`);
        continue;
      }
      if (!inLimits(p, v)) {
        blockers.push(`${p.tag}: ${v} fora dos limites ${p.min ?? "-∞"}…${p.max ?? "+∞"}`);
        continue;
      }
      writes.push({ point: p, value: v });
    }
    if (blockers.length > 0) {
      this.mode = "SAFE";
      this.lastFault = blockers[0];
      return {
        mode: "SAFE",
        writes: safeWrites(this.map),
        blockers,
        transition: { from, to: "SAFE", reason: blockers[0] },
      };
    }
    return { mode: "RUN", writes, blockers: [], transition: null };
  }
}
