// E/S de campo do Runtime: lê as entradas e grava as saídas decididas pela
// guarda, por conexão. Node.js apenas.
import type { IoMap, IoPoint, ModbusTcpConnection } from "../io-map";
import type { InputSample, TagValue } from "../runtime-core";
import type { FieldWrite } from "../write-guard";
import { decodeWords, encodeWords, planReads } from "../modbus-codec";
import { ModbusTcpClient } from "./modbus-tcp-client";

export interface ConnectionStatus {
  id: string;
  kind: string;
  ok: boolean;
  lastError: string | null;
  lastOkAt: number | null;
}

/** Reescreve o mesmo valor periodicamente (corrige escravo reiniciado). */
export const WRITE_REFRESH_MS = 1000;

export class FieldIo {
  private readonly clients = new Map<string, ModbusTcpClient>();
  private readonly status = new Map<string, ConnectionStatus>();
  private readonly lastWritten = new Map<string, { value: TagValue; at: number }>();
  /** E/S simulada (bancada virtual): valores definidos localmente. */
  private readonly simulated = new Map<string, TagValue>();

  constructor(
    private readonly map: IoMap,
    private readonly now: () => number = () => Date.now(),
  ) {
    for (const c of map.connections) {
      this.status.set(c.id, {
        id: c.id,
        kind: c.kind,
        ok: c.kind === "simulated",
        lastError: null,
        lastOkAt: null,
      });
      if (c.kind === "modbus_tcp") {
        this.clients.set(
          c.id,
          new ModbusTcpClient({
            host: c.host,
            port: c.port,
            unitId: c.unitId,
            timeoutMs: c.timeoutMs,
          }),
        );
      }
    }
  }

  connectionStatus(): ConnectionStatus[] {
    return [...this.status.values()].map((s) => ({ ...s }));
  }

  /** Bancada virtual: define o valor de uma entrada simulada. */
  setSimulatedInput(tag: string, value: TagValue): boolean {
    const p = this.map.points.find((x) => x.tag === tag && x.direction === "input");
    if (!p) return false;
    const c = this.map.connections.find((x) => x.id === p.connectionId);
    if (c?.kind !== "simulated") return false;
    this.simulated.set(tag, value);
    return true;
  }

  private mark(id: string, ok: boolean, err?: unknown): void {
    const s = this.status.get(id);
    if (!s) return;
    s.ok = ok;
    if (ok) {
      s.lastOkAt = this.now();
      s.lastError = null;
    } else {
      s.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async readInputs(): Promise<InputSample[]> {
    const out: InputSample[] = [];
    const tasks = this.map.connections.map(async (c) => {
      const pts = this.map.points.filter((p) => p.direction === "input" && p.connectionId === c.id);
      if (pts.length === 0) return;
      if (c.kind === "simulated") {
        const at = this.now();
        for (const p of pts) {
          out.push({
            tag: p.tag,
            value: this.simulated.get(p.tag) ?? (p.dataType === "BOOL" ? false : 0),
            ok: true,
            at,
          });
        }
        return;
      }
      await this.readModbus(c, pts, out);
    });
    await Promise.all(tasks);
    return out;
  }

  private async readModbus(
    c: ModbusTcpConnection,
    pts: IoPoint[],
    out: InputSample[],
  ): Promise<void> {
    const client = this.clients.get(c.id)!;
    try {
      for (const b of planReads(pts)) {
        const at = this.now();
        if (b.area === "coil" || b.area === "discrete_input") {
          const bits =
            b.area === "coil"
              ? await client.readCoils(b.start, b.count)
              : await client.readDiscreteInputs(b.start, b.count);
          for (const p of b.points)
            out.push({ tag: p.tag, value: bits[p.modbus!.address - b.start], ok: true, at });
        } else {
          const words =
            b.area === "holding_register"
              ? await client.readHoldingRegisters(b.start, b.count)
              : await client.readInputRegisters(b.start, b.count);
          for (const p of b.points) {
            const i = p.modbus!.address - b.start;
            const v = decodeWords(p, words.slice(i, i + (p.dataType === "REAL" ? 2 : 1)));
            // Valor de ENGENHARIA (com escala): INT com escala 0,01 vira decimal de propósito.
            out.push({ tag: p.tag, value: v, ok: Number.isFinite(v), at });
          }
        }
      }
      this.mark(c.id, true);
    } catch (e) {
      this.mark(c.id, false, e);
      for (const p of pts) out.push({ tag: p.tag, value: 0, ok: false, at: this.now() });
    }
  }

  /**
   * Grava as saídas decididas. Só escreve quando muda ou a cada
   * WRITE_REFRESH_MS; devolve as falhas (a guarda vai a SEGURO no próximo ciclo
   * porque a conexão fica marcada como falha).
   */
  async writeOutputs(writes: readonly FieldWrite[], force = false): Promise<string[]> {
    const errors: string[] = [];
    const now = this.now();
    for (const w of writes) {
      const prev = this.lastWritten.get(w.point.tag);
      if (!force && prev && prev.value === w.value && now - prev.at < WRITE_REFRESH_MS) continue;
      const c = this.map.connections.find((x) => x.id === w.point.connectionId);
      if (!c) continue;
      if (c.kind === "simulated") {
        this.lastWritten.set(w.point.tag, { value: w.value, at: now });
        continue;
      }
      const client = this.clients.get(c.id)!;
      const m = w.point.modbus!;
      try {
        if (m.area === "coil") {
          await client.writeSingleCoil(m.address, Boolean(w.value));
        } else if (m.area === "holding_register") {
          const words = encodeWords(w.point, Number(w.value));
          if (words.length === 1) await client.writeSingleRegister(m.address, words[0]);
          else await client.writeMultipleRegisters(m.address, words);
        } else {
          throw new Error(`${w.point.tag}: área ${m.area} não aceita escrita`);
        }
        this.lastWritten.set(w.point.tag, { value: w.value, at: now });
        this.mark(c.id, true);
      } catch (e) {
        this.lastWritten.delete(w.point.tag);
        this.mark(c.id, false, e);
        errors.push(`${w.point.tag}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return errors;
  }

  /** Últimos valores efetivamente escritos (para telemetria/WebVisu). */
  written(): Record<string, TagValue> {
    const out: Record<string, TagValue> = {};
    for (const [k, v] of this.lastWritten) out[k] = v.value;
    return out;
  }

  close(): void {
    for (const c of this.clients.values()) c.close();
  }
}
