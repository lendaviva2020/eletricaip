/**
 * Liberação de comandos para a bancada (arquitetura de autorização da regra 21
 * do AGENTS.md para equipamento real).
 *
 * DESLIGAR é sempre permitido (direção segura). LIGAR só é liberado quando
 * TODAS as condições abaixo valem — cada bloqueio vem com o motivo:
 *   1. comando de campo habilitado explicitamente na sessão (`armed`);
 *   2. Arduino conectado e telemetria recente (o estado exibido é real);
 *   3. E-STOP físico liberado;
 *   4. intertravamento: a saída parceira está desligada;
 *   5. disjuntor do circuito fechado (contato auxiliar), quando configurado;
 *   6. NBR 5410 §5.3.4.1: Ib ≤ In ≤ I'z e I2 ≤ 1,45·I'z (condutor × disjuntor);
 *   7. corrente da carga ≤ capacidade do contato do relé/contator.
 * Dado ausente NÃO é presumido: vira aviso de verificação incompleta.
 *
 * Esta lógica é uma camada de software. A segurança de pessoas é do circuito
 * físico (E-STOP cabeado, NR-10/NR-12) — o firmware também desliga tudo
 * sozinho no E-STOP, no watchdog e sem host.
 */
import { correctedAmpacityIz, verifyOverloadCoordination } from "@/lib/electrical-calc";
import type { BenchConfig, BenchOutput } from "./bench-config";
import { pinBit } from "./serial/protocol";

export interface LiveState {
  readonly connected: boolean;
  /** Idade da última telemetria (ms). */
  readonly telemetryAgeMs: number | null;
  readonly estop: boolean;
  readonly inputsMask: number;
  readonly outputsMask: number;
}

export interface GuardFinding {
  readonly code:
    | "NOT_ARMED"
    | "DISCONNECTED"
    | "STALE"
    | "ESTOP"
    | "INTERLOCK"
    | "BREAKER_OPEN"
    | "NBR5410_COORDINATION"
    | "CONTACT_RATING"
    | "NBR5410_INCOMPLETE";
  readonly message: string;
}

export interface GuardDecision {
  readonly allowed: boolean;
  readonly blocking: readonly GuardFinding[];
  readonly warnings: readonly GuardFinding[];
}

/** Telemetria mais velha que isto não serve para liberar comando. */
export function staleLimitMs(cfg: Pick<BenchConfig, "telemetryMs">): number {
  return Math.max(1000, cfg.telemetryMs * 4);
}

/** Verificação NBR 5410 do circuito comandado por uma saída (sem presumir dados). */
export function checkCircuitNbr5410(out: BenchOutput): {
  ok: boolean | null;
  message: string;
  izA?: number;
} {
  if (
    out.loadCurrentA === undefined ||
    out.conductorMm2 === undefined ||
    out.breakerA === undefined
  ) {
    return {
      ok: null,
      message: `${out.label}: informe corrente da carga, seção do condutor e disjuntor para verificar a NBR 5410.`,
    };
  }
  const iz = correctedAmpacityIz(out.conductorMm2);
  const coord = verifyOverloadCoordination(out.loadCurrentA, out.breakerA, iz);
  if (coord.coordinated) {
    return {
      ok: true,
      message: `${out.label}: Ib ${out.loadCurrentA} A ≤ In ${out.breakerA} A ≤ I'z ${iz} A (${out.conductorMm2} mm²).`,
      izA: iz,
    };
  }
  const why = !coord.condition1_Ib_le_In_le_Iz
    ? out.loadCurrentA > out.breakerA
      ? `corrente da carga ${out.loadCurrentA} A maior que o disjuntor ${out.breakerA} A`
      : `disjuntor ${out.breakerA} A maior que a capacidade do condutor ${out.conductorMm2} mm² (I'z ${iz} A)`
    : `I2 ${coord.I2_A} A acima de 1,45·I'z (${coord.maxAllowedI2_A} A)`;
  return { ok: false, message: `${out.label}: NBR 5410 §5.3.4.1 não atendida — ${why}.`, izA: iz };
}

export function evaluateOutputCommand(input: {
  readonly config: BenchConfig;
  readonly pin: number;
  readonly desiredOn: boolean;
  readonly live: LiveState;
  readonly armed: boolean;
}): GuardDecision {
  const { config, pin, desiredOn, live, armed } = input;
  if (!desiredOn)
    return {
      allowed: live.connected,
      blocking: live.connected ? [] : [disconnected()],
      warnings: [],
    };

  const blocking: GuardFinding[] = [];
  const warnings: GuardFinding[] = [];
  const out = config.outputs.find((o) => o.pin === pin);

  if (!armed) {
    blocking.push({
      code: "NOT_ARMED",
      message: "Comando de campo não habilitado nesta sessão (confirme o aviso de segurança).",
    });
  }
  if (!live.connected) blocking.push(disconnected());
  else if (live.telemetryAgeMs === null || live.telemetryAgeMs > staleLimitMs(config)) {
    blocking.push({
      code: "STALE",
      message: "Sem telemetria recente do Arduino — estado real desconhecido.",
    });
  }
  if (live.estop) {
    blocking.push({
      code: "ESTOP",
      message: "E-STOP físico acionado (ou fiação rompida). Libere e rearme.",
    });
  }
  if (!out) {
    blocking.push({ code: "INTERLOCK", message: `D${pin} não é uma saída configurada.` });
    return { allowed: false, blocking, warnings };
  }
  if (out.interlockPin !== undefined && pinBit(live.outputsMask, out.interlockPin)) {
    const partner = config.outputs.find((o) => o.pin === out.interlockPin);
    blocking.push({
      code: "INTERLOCK",
      message: `Intertravamento: desligue ${partner?.label ?? `D${out.interlockPin}`} antes de ligar ${out.label}.`,
    });
  }
  if (out.breakerAuxPin !== undefined) {
    // Entrada com pull-up: contato auxiliar fechado puxa para GND (bit = 0).
    const breakerClosed = !pinBit(live.inputsMask, out.breakerAuxPin);
    if (!breakerClosed) {
      blocking.push({
        code: "BREAKER_OPEN",
        message: `Disjuntor do circuito ${out.label} aberto (contato auxiliar em D${out.breakerAuxPin}).`,
      });
    }
  }
  const nbr = checkCircuitNbr5410(out);
  if (nbr.ok === false) blocking.push({ code: "NBR5410_COORDINATION", message: nbr.message });
  if (nbr.ok === null) warnings.push({ code: "NBR5410_INCOMPLETE", message: nbr.message });
  if (
    out.loadCurrentA !== undefined &&
    out.contactRatingA !== undefined &&
    out.loadCurrentA > out.contactRatingA
  ) {
    blocking.push({
      code: "CONTACT_RATING",
      message: `${out.label}: carga de ${out.loadCurrentA} A acima da capacidade do contato (${out.contactRatingA} A).`,
    });
  }
  return { allowed: blocking.length === 0, blocking, warnings };
}

function disconnected(): GuardFinding {
  return { code: "DISCONNECTED", message: "Arduino desconectado." };
}

/** Auditoria estática da configuração (antes de gerar firmware ou conectar). */
export function auditBenchConfig(config: BenchConfig): string[] {
  const notes: string[] = [];
  for (const o of config.outputs) {
    if (o.pin === 13) {
      notes.push(
        `${o.label} em D13: o LED/bootloader pisca D13 ao energizar — o relé pode bater no boot. Prefira D3–D12.`,
      );
    }
    const nbr = checkCircuitNbr5410(o);
    if (nbr.ok === false) notes.push(nbr.message);
  }
  if (config.outputs.length > 0) {
    notes.push(
      "Cada saída deve acionar um MÓDULO RELÉ optoacoplado de 5 V, nunca a bobina do contator direto: o pino do ATmega328P fornece no máximo 20 mA recomendados (40 mA absoluto) e o chip 200 mA no total.",
    );
  }
  return notes;
}
