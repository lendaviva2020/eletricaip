// Cliente Modbus TCP REAL do ElétricAi Runtime (Node.js, `node:net`).
//
// Só é carregado pelo processo do Runtime no gateway — nunca pelo navegador nem
// pela nuvem. Uma requisição por vez (muitos escravos não aceitam pipeline),
// tempo-limite por requisição; qualquer erro de transporte derruba a conexão e
// a próxima chamada reconecta. Resposta é DADO NÃO CONFIÁVEL: MBAP, função,
// tamanho e eco de escrita são conferidos.
import net from "node:net";

export class ModbusError extends Error {
  constructor(
    message: string,
    readonly code: "TIMEOUT" | "TRANSPORT" | "EXCEPTION" | "PROTOCOL",
    readonly exceptionCode?: number,
  ) {
    super(message);
    this.name = "ModbusError";
  }
}

const EXCEPTION_NAMES: Record<number, string> = {
  1: "função ilegal",
  2: "endereço ilegal",
  3: "valor ilegal",
  4: "falha no escravo",
  6: "escravo ocupado",
  10: "gateway sem caminho",
  11: "gateway: escravo não respondeu",
};

export interface ModbusTcpClientOptions {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
}

interface Pending {
  tid: number;
  fc: number;
  resolve: (pdu: Buffer) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ModbusTcpClient {
  private socket: net.Socket | null = null;
  private connecting: Promise<void> | null = null;
  private rx = Buffer.alloc(0);
  private tid = 0;
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(readonly opts: ModbusTcpClientOptions) {}

  get connected(): boolean {
    return !!this.socket && !this.socket.destroyed && !this.connecting;
  }

  private connect(): Promise<void> {
    if (this.closed) return Promise.reject(new ModbusError("cliente fechado", "TRANSPORT"));
    if (this.socket && !this.socket.destroyed && !this.connecting) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host: this.opts.host, port: this.opts.port });
      s.setNoDelay(true);
      const timer = setTimeout(() => {
        s.destroy();
        reject(
          new ModbusError(
            `tempo esgotado ao conectar em ${this.opts.host}:${this.opts.port}`,
            "TIMEOUT",
          ),
        );
      }, this.opts.timeoutMs);
      s.once("connect", () => {
        clearTimeout(timer);
        this.socket = s;
        this.rx = Buffer.alloc(0);
        resolve();
      });
      s.on("data", (chunk: Buffer) => this.onData(chunk));
      s.on("error", (err) => {
        clearTimeout(timer);
        this.fail(new ModbusError(`transporte: ${err.message}`, "TRANSPORT"));
        reject(new ModbusError(`transporte: ${err.message}`, "TRANSPORT"));
      });
      s.on("close", () => {
        if (this.socket === s) this.socket = null;
        this.fail(new ModbusError("conexão fechada pelo escravo", "TRANSPORT"));
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private fail(e: Error): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.reject(e);
  }

  private onData(chunk: Buffer): void {
    this.rx = Buffer.concat([this.rx, chunk]);
    if (this.rx.length > 4096) {
      // Lixo/flood: derruba a conexão.
      this.socket?.destroy();
      this.rx = Buffer.alloc(0);
      return;
    }
    while (this.rx.length >= 7) {
      const len = this.rx.readUInt16BE(4);
      if (len < 2 || len > 254) {
        this.socket?.destroy();
        this.rx = Buffer.alloc(0);
        this.fail(new ModbusError("cabeçalho MBAP inválido", "PROTOCOL"));
        return;
      }
      if (this.rx.length < 6 + len) return;
      const frame = this.rx.subarray(0, 6 + len);
      this.rx = this.rx.subarray(6 + len);
      const tid = frame.readUInt16BE(0);
      const proto = frame.readUInt16BE(2);
      const p = this.pending;
      if (!p || tid !== p.tid || proto !== 0) continue; // resposta atrasada/alheia
      const pdu = Buffer.from(frame.subarray(7));
      this.pending = null;
      clearTimeout(p.timer);
      const fc = pdu[0];
      if (fc === (p.fc | 0x80)) {
        const code = pdu[1] ?? 0;
        p.reject(
          new ModbusError(
            `exceção Modbus ${code} (${EXCEPTION_NAMES[code] ?? "desconhecida"})`,
            "EXCEPTION",
            code,
          ),
        );
      } else if (fc !== p.fc) {
        p.reject(new ModbusError(`função ${fc} inesperada (pedida ${p.fc})`, "PROTOCOL"));
      } else {
        p.resolve(pdu);
      }
    }
  }

  /** Envia um PDU e espera a resposta (serializado). */
  request(pdu: Buffer): Promise<Buffer> {
    const run = async (): Promise<Buffer> => {
      await this.connect();
      const socket = this.socket;
      if (!socket) throw new ModbusError("sem conexão", "TRANSPORT");
      this.tid = (this.tid + 1) & 0xffff;
      const tid = this.tid;
      const header = Buffer.alloc(7);
      header.writeUInt16BE(tid, 0);
      header.writeUInt16BE(0, 2);
      header.writeUInt16BE(pdu.length + 1, 4);
      header.writeUInt8(this.opts.unitId, 6);
      return new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pending?.tid === tid) this.pending = null;
          // Resposta que chegar depois corromperia a próxima: reconecta.
          socket.destroy();
          reject(new ModbusError(`sem resposta em ${this.opts.timeoutMs} ms`, "TIMEOUT"));
        }, this.opts.timeoutMs);
        this.pending = { tid, fc: pdu[0], resolve, reject, timer };
        socket.write(Buffer.concat([header, pdu]));
      });
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private static checkRange(address: number, qty: number, max: number): void {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusError(`endereço ${address} inválido`, "PROTOCOL");
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > max || address + qty > 65536) {
      throw new ModbusError(`quantidade ${qty} inválida`, "PROTOCOL");
    }
  }

  private async readBits(fc: 1 | 2, address: number, qty: number): Promise<boolean[]> {
    ModbusTcpClient.checkRange(address, qty, 2000);
    const req = Buffer.alloc(5);
    req.writeUInt8(fc, 0);
    req.writeUInt16BE(address, 1);
    req.writeUInt16BE(qty, 3);
    const res = await this.request(req);
    const byteCount = res[1];
    if (byteCount !== Math.ceil(qty / 8) || res.length !== 2 + byteCount) {
      throw new ModbusError("resposta de bits com tamanho errado", "PROTOCOL");
    }
    const out: boolean[] = [];
    for (let i = 0; i < qty; i++) out.push(((res[2 + (i >> 3)] >> (i & 7)) & 1) === 1);
    return out;
  }

  private async readWords(fc: 3 | 4, address: number, qty: number): Promise<number[]> {
    ModbusTcpClient.checkRange(address, qty, 125);
    const req = Buffer.alloc(5);
    req.writeUInt8(fc, 0);
    req.writeUInt16BE(address, 1);
    req.writeUInt16BE(qty, 3);
    const res = await this.request(req);
    if (res[1] !== qty * 2 || res.length !== 2 + qty * 2) {
      throw new ModbusError("resposta de registradores com tamanho errado", "PROTOCOL");
    }
    const out: number[] = [];
    for (let i = 0; i < qty; i++) out.push(res.readUInt16BE(2 + i * 2));
    return out;
  }

  readCoils(address: number, qty: number) {
    return this.readBits(1, address, qty);
  }
  readDiscreteInputs(address: number, qty: number) {
    return this.readBits(2, address, qty);
  }
  readHoldingRegisters(address: number, qty: number) {
    return this.readWords(3, address, qty);
  }
  readInputRegisters(address: number, qty: number) {
    return this.readWords(4, address, qty);
  }

  /** FC5 — o escravo ecoa o pedido; eco diferente é erro. */
  async writeSingleCoil(address: number, value: boolean): Promise<void> {
    ModbusTcpClient.checkRange(address, 1, 1);
    const req = Buffer.alloc(5);
    req.writeUInt8(5, 0);
    req.writeUInt16BE(address, 1);
    req.writeUInt16BE(value ? 0xff00 : 0x0000, 3);
    const res = await this.request(req);
    if (!res.equals(req)) throw new ModbusError("eco de escrita de bobina não confere", "PROTOCOL");
  }

  /** FC6. */
  async writeSingleRegister(address: number, word: number): Promise<void> {
    ModbusTcpClient.checkRange(address, 1, 1);
    if (!Number.isInteger(word) || word < 0 || word > 0xffff) {
      throw new ModbusError(`valor ${word} fora de 16 bits`, "PROTOCOL");
    }
    const req = Buffer.alloc(5);
    req.writeUInt8(6, 0);
    req.writeUInt16BE(address, 1);
    req.writeUInt16BE(word, 3);
    const res = await this.request(req);
    if (!res.equals(req))
      throw new ModbusError("eco de escrita de registrador não confere", "PROTOCOL");
  }

  /** FC16. */
  async writeMultipleRegisters(address: number, words: readonly number[]): Promise<void> {
    ModbusTcpClient.checkRange(address, words.length, 123);
    const req = Buffer.alloc(6 + words.length * 2);
    req.writeUInt8(16, 0);
    req.writeUInt16BE(address, 1);
    req.writeUInt16BE(words.length, 3);
    req.writeUInt8(words.length * 2, 5);
    words.forEach((w, i) => {
      if (!Number.isInteger(w) || w < 0 || w > 0xffff) {
        throw new ModbusError(`valor ${w} fora de 16 bits`, "PROTOCOL");
      }
      req.writeUInt16BE(w, 6 + i * 2);
    });
    const res = await this.request(req);
    if (
      res.length !== 5 ||
      res.readUInt16BE(1) !== address ||
      res.readUInt16BE(3) !== words.length
    ) {
      throw new ModbusError("confirmação de escrita múltipla não confere", "PROTOCOL");
    }
  }

  close(): void {
    this.closed = true;
    this.fail(new ModbusError("cliente fechado", "TRANSPORT"));
    this.socket?.destroy();
    this.socket = null;
  }
}
