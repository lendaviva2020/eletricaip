/**
 * Protocolo serial EletricAI ↔ Arduino Uno R3 (ATmega328P, 2 KB de SRAM).
 *
 * Texto ASCII, uma mensagem por linha (`\n`), campos separados por `:` e
 * checksum opcional estilo NMEA no fim (`*HH` = XOR dos bytes antes do `*`, em
 * hexadecimal). Sem JSON e sem `String` no firmware: o parser do lado do
 * Arduino usa um buffer estático de 48 bytes.
 *
 * Host → Arduino
 *   PING                       — keep-alive (o firmware desliga as saídas sem host)
 *   CMD:<pino>:<0|1>           — comando de saída (relé)
 *   ALL:0                      — desliga todas as saídas
 *   RST                        — rearme após E-STOP (só com E-STOP liberado)
 *   CFG?                       — pede a identificação
 *
 * Arduino → Host
 *   HELLO:<fw>:<placa>:<saídas>:<entradas>:<analógicas>
 *   ACK:<pino>:<0|1>
 *   ERR:<código>[:<detalhe>]   — ESTOP | ILK | PIN | FMT | CRC | HOST
 *   DATA:<seq>:<médias>:<rms>:<entradas>:<saídas>:<estop>
 *        médias/rms = contagens ADC ×10 separadas por vírgula (A0..A5);
 *        entradas/saídas = máscara de bits por pino (bit n = pino Dn).
 */

export const SERIAL_BAUD_RATE = 115_200;
export const MAX_LINE_LENGTH = 120;
/** Firmware e host concordam neste limite (buffer estático do ATmega328P). */
export const MAX_COMMAND_LENGTH = 47;

export type ErrorCode = "ESTOP" | "ILK" | "PIN" | "FMT" | "CRC" | "HOST" | "UNKNOWN";

export type DeviceFrame =
  | {
      readonly kind: "hello";
      readonly firmware: string;
      readonly board: string;
      readonly outputs: readonly number[];
      readonly inputs: readonly number[];
      readonly analogChannels: number;
    }
  | { readonly kind: "ack"; readonly pin: number; readonly state: boolean }
  | { readonly kind: "error"; readonly code: ErrorCode; readonly detail: string }
  | {
      readonly kind: "data";
      readonly seq: number;
      /** Média das contagens ADC (0–1023) por canal A0..A5. */
      readonly analogMean: readonly number[];
      /** Valor eficaz da componente CA, em contagens ADC, por canal. */
      readonly analogAcRms: readonly number[];
      readonly inputsMask: number;
      readonly outputsMask: number;
      readonly estop: boolean;
    };

export type HostCommand =
  | { readonly kind: "ping" }
  | { readonly kind: "set"; readonly pin: number; readonly state: boolean }
  | { readonly kind: "allOff" }
  | { readonly kind: "reset" }
  | { readonly kind: "identify" };

/** XOR de todos os bytes (ASCII) — mesmo cálculo do firmware. */
export function checksum(payload: string): string {
  let x = 0;
  for (let i = 0; i < payload.length; i++) x ^= payload.charCodeAt(i) & 0xff;
  return x.toString(16).toUpperCase().padStart(2, "0");
}

/** Pinos digitais utilizáveis no Uno: D2..D13 (D0/D1 são a serial USB). */
export function isValidDigitalPin(pin: number): boolean {
  return Number.isInteger(pin) && pin >= 2 && pin <= 13;
}

export function encodeCommand(cmd: HostCommand): string {
  let body: string;
  switch (cmd.kind) {
    case "ping":
      body = "PING";
      break;
    case "allOff":
      body = "ALL:0";
      break;
    case "reset":
      body = "RST";
      break;
    case "identify":
      body = "CFG?";
      break;
    case "set":
      if (!isValidDigitalPin(cmd.pin)) throw new RangeError(`Pino inválido: D${cmd.pin}`);
      body = `CMD:${cmd.pin}:${cmd.state ? 1 : 0}`;
      break;
  }
  const line = `${body}*${checksum(body)}`;
  if (line.length > MAX_COMMAND_LENGTH)
    throw new RangeError("Comando maior que o buffer do firmware");
  return `${line}\n`;
}

function parseIntStrict(s: string | undefined, min: number, max: number): number | null {
  if (s === undefined || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

function parseList(
  s: string | undefined,
  min: number,
  max: number,
  maxLen: number,
): number[] | null {
  if (s === undefined) return null;
  if (s === "") return [];
  const parts = s.split(",");
  if (parts.length > maxLen) return null;
  const out: number[] = [];
  for (const p of parts) {
    const n = parseIntStrict(p, min, max);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

const ERROR_CODES = new Set<ErrorCode>(["ESTOP", "ILK", "PIN", "FMT", "CRC", "HOST"]);

export type ParseResult =
  | { readonly ok: true; readonly frame: DeviceFrame }
  | {
      readonly ok: false;
      readonly reason: "empty" | "too_long" | "checksum" | "malformed" | "unknown";
    };

/**
 * Valida e interpreta UMA linha vinda do Arduino (dado não confiável: tamanho,
 * caracteres, checksum e faixas são todos conferidos).
 */
export function parseDeviceLine(raw: string): ParseResult {
  const line = raw.replace(/\r$/, "").trim();
  if (!line) return { ok: false, reason: "empty" };
  if (line.length > MAX_LINE_LENGTH) return { ok: false, reason: "too_long" };
  if (!/^[\x20-\x7e]+$/.test(line)) return { ok: false, reason: "malformed" };

  let body = line;
  const star = line.lastIndexOf("*");
  if (star >= 0) {
    body = line.slice(0, star);
    const sent = line.slice(star + 1).toUpperCase();
    if (!/^[0-9A-F]{2}$/.test(sent) || sent !== checksum(body)) {
      return { ok: false, reason: "checksum" };
    }
  }

  const f = body.split(":");
  switch (f[0]) {
    case "HELLO": {
      // HELLO:<fw>:<placa>:<saídas>:<entradas>:<analógicas> — 6 campos.
      const outputs = parseList(f[3], 2, 13, 12);
      const inputs = parseList(f[4], 2, 13, 12);
      const analog = parseIntStrict(f[5], 0, 6);
      if (f.length !== 6 || !f[1] || !f[2] || !outputs || !inputs || analog === null) {
        return { ok: false, reason: "malformed" };
      }
      return {
        ok: true,
        frame: {
          kind: "hello",
          firmware: f[1].slice(0, 24),
          board: f[2].slice(0, 24),
          outputs,
          inputs,
          analogChannels: analog,
        },
      };
    }
    case "ACK": {
      const pin = parseIntStrict(f[1], 2, 13);
      const st = parseIntStrict(f[2], 0, 1);
      if (f.length !== 3 || pin === null || st === null) return { ok: false, reason: "malformed" };
      return { ok: true, frame: { kind: "ack", pin, state: st === 1 } };
    }
    case "ERR": {
      if (f.length < 2 || f.length > 3) return { ok: false, reason: "malformed" };
      const code = (ERROR_CODES.has(f[1] as ErrorCode) ? f[1] : "UNKNOWN") as ErrorCode;
      return { ok: true, frame: { kind: "error", code, detail: (f[2] ?? "").slice(0, 32) } };
    }
    case "DATA": {
      const seq = parseIntStrict(f[1], 0, 65535);
      const mean = parseList(f[2], 0, 10230, 6);
      const rms = parseList(f[3], 0, 10230, 6);
      const inputs = parseIntStrict(f[4], 0, 0x3fff);
      const outputs = parseIntStrict(f[5], 0, 0x3fff);
      const estop = parseIntStrict(f[6], 0, 1);
      if (
        f.length !== 7 ||
        seq === null ||
        !mean ||
        !rms ||
        mean.length !== rms.length ||
        inputs === null ||
        outputs === null ||
        estop === null
      ) {
        return { ok: false, reason: "malformed" };
      }
      return {
        ok: true,
        frame: {
          kind: "data",
          seq,
          analogMean: mean.map((v) => v / 10),
          analogAcRms: rms.map((v) => v / 10),
          inputsMask: inputs,
          outputsMask: outputs,
          estop: estop === 1,
        },
      };
    }
    default:
      return { ok: false, reason: "unknown" };
  }
}

/** Bit do pino Dn numa máscara do firmware. */
export function pinBit(mask: number, pin: number): boolean {
  return ((mask >> pin) & 1) === 1;
}

/**
 * Acumula bytes recebidos e devolve linhas completas. Linhas maiores que o
 * limite são descartadas (proteção contra ruído/porta errada).
 */
export class LineAccumulator {
  private buffer = "";
  private overflowed = false;

  push(chunk: string): string[] {
    const lines: string[] = [];
    for (const ch of chunk) {
      if (ch === "\n") {
        if (!this.overflowed && this.buffer) lines.push(this.buffer);
        this.buffer = "";
        this.overflowed = false;
      } else if (!this.overflowed) {
        this.buffer += ch;
        if (this.buffer.length > MAX_LINE_LENGTH) {
          this.buffer = "";
          this.overflowed = true;
        }
      }
    }
    return lines;
  }

  reset(): void {
    this.buffer = "";
    this.overflowed = false;
  }
}
