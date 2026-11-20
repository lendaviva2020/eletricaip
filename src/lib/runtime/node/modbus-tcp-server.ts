// Escravo Modbus TCP mínimo (Node.js) — bancada de teste do Runtime.
//
// Serve para testes automatizados e para o engenheiro validar o programa sem
// hardware ("eletricai-runtime --simular-campo"). Não é um equipamento real.
import net from "node:net";

export interface ModbusMemory {
  coils: Map<number, boolean>;
  discreteInputs: Map<number, boolean>;
  holding: Map<number, number>;
  input: Map<number, number>;
}

export function createModbusMemory(): ModbusMemory {
  return { coils: new Map(), discreteInputs: new Map(), holding: new Map(), input: new Map() };
}

function exception(fc: number, code: number): Buffer {
  return Buffer.from([fc | 0x80, code]);
}

export function handlePdu(mem: ModbusMemory, pdu: Buffer): Buffer {
  const fc = pdu[0];
  if (pdu.length < 5) return exception(fc, 3);
  const addr = pdu.readUInt16BE(1);
  switch (fc) {
    case 1:
    case 2: {
      const qty = pdu.readUInt16BE(3);
      if (qty < 1 || qty > 2000) return exception(fc, 3);
      const src = fc === 1 ? mem.coils : mem.discreteInputs;
      const bytes = Buffer.alloc(Math.ceil(qty / 8));
      for (let i = 0; i < qty; i++) if (src.get(addr + i)) bytes[i >> 3] |= 1 << (i & 7);
      return Buffer.concat([Buffer.from([fc, bytes.length]), bytes]);
    }
    case 3:
    case 4: {
      const qty = pdu.readUInt16BE(3);
      if (qty < 1 || qty > 125) return exception(fc, 3);
      const src = fc === 3 ? mem.holding : mem.input;
      const out = Buffer.alloc(2 + qty * 2);
      out[0] = fc;
      out[1] = qty * 2;
      for (let i = 0; i < qty; i++) out.writeUInt16BE((src.get(addr + i) ?? 0) & 0xffff, 2 + i * 2);
      return out;
    }
    case 5: {
      const v = pdu.readUInt16BE(3);
      if (v !== 0xff00 && v !== 0) return exception(fc, 3);
      mem.coils.set(addr, v === 0xff00);
      return Buffer.from(pdu.subarray(0, 5));
    }
    case 6:
      mem.holding.set(addr, pdu.readUInt16BE(3));
      return Buffer.from(pdu.subarray(0, 5));
    case 16: {
      const qty = pdu.readUInt16BE(3);
      if (qty < 1 || qty > 123 || pdu.length < 6 + qty * 2) return exception(fc, 3);
      for (let i = 0; i < qty; i++) mem.holding.set(addr + i, pdu.readUInt16BE(6 + i * 2));
      return Buffer.from(pdu.subarray(0, 5));
    }
    default:
      return exception(fc, 1);
  }
}

export function startModbusServer(
  mem: ModbusMemory,
  port: number,
  host = "127.0.0.1",
): Promise<{ server: net.Server; port: number; close: () => Promise<void> }> {
  const server = net.createServer((sock) => {
    let rx = Buffer.alloc(0);
    sock.on("data", (chunk: Buffer) => {
      rx = Buffer.concat([rx, chunk]);
      while (rx.length >= 7) {
        const len = rx.readUInt16BE(4);
        if (len < 2 || len > 254) return sock.destroy();
        if (rx.length < 6 + len) return;
        const frame = rx.subarray(0, 6 + len);
        rx = rx.subarray(6 + len);
        const res = handlePdu(mem, Buffer.from(frame.subarray(7)));
        const head = Buffer.alloc(7);
        frame.copy(head, 0, 0, 4);
        head.writeUInt16BE(res.length + 1, 4);
        head[6] = frame[6];
        sock.write(Buffer.concat([head, res]));
      }
    });
    sock.on("error", () => sock.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        server,
        port: actual,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
