/**
 * Controlador da conexão serial com a bancada (singleton por aba).
 *
 * Vive fora dos componentes React: trocar de editor (unifilar → SCADA) não
 * derruba a conexão. Estado em `useBenchStore` (zustand). A porta é injetável
 * (`SerialLike`) para teste sem hardware.
 *
 * Fluxo: requestPort (filtro CH340/Arduino) → open 115200 → o Uno reinicia
 * (DTR) e o bootloader leva ~1,6 s → espera HELLO (pede CFG? se não vier) →
 * PING periódico (o firmware desliga tudo sem host) → laço de leitura.
 */
import { create } from "zustand";
import {
  LineAccumulator,
  SERIAL_BAUD_RATE,
  encodeCommand,
  parseDeviceLine,
  type DeviceFrame,
  type HostCommand,
} from "./protocol";
import {
  UNO_USB_FILTERS,
  describeUsbVendor,
  getWebSerial,
  type SerialLike,
  type SerialPortLike,
} from "./web-serial";

export type BenchStatus = "idle" | "connecting" | "connected" | "error";

type HelloFrame = Extract<DeviceFrame, { kind: "hello" }>;
type DataFrame = Extract<DeviceFrame, { kind: "data" }>;

export interface BenchLogEntry {
  readonly at: number;
  readonly dir: "rx" | "tx" | "info";
  readonly text: string;
}

export interface BenchState {
  status: BenchStatus;
  portLabel: string | null;
  hello: HelloFrame | null;
  data: DataFrame | null;
  dataAt: number | null;
  lastError: string | null;
  /** Linhas recebidas com checksum/formato inválido (qualidade do enlace). */
  badFrames: number;
  log: BenchLogEntry[];
}

const LOG_MAX = 60;

export const useBenchStore = create<BenchState>(() => ({
  status: "idle",
  portLabel: null,
  hello: null,
  data: null,
  dataAt: null,
  lastError: null,
  badFrames: 0,
  log: [],
}));

function pushLog(dir: BenchLogEntry["dir"], text: string) {
  useBenchStore.setState((s) => ({
    log: [...s.log, { at: Date.now(), dir, text: text.slice(0, 120) }].slice(-LOG_MAX),
  }));
}

export type CommandResult = { ok: true } | { ok: false; error: string };

interface PendingAck {
  pin: number;
  state: boolean;
  resolve: (r: CommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const ERROR_TEXT: Record<string, string> = {
  ESTOP: "E-STOP acionado no Arduino",
  ILK: "Intertravamento recusou o comando no firmware",
  PIN: "Pino não configurado como saída no firmware",
  FMT: "Comando mal formado",
  CRC: "Checksum inválido (ruído na serial?)",
  HOST: "Arduino ficou sem comunicação e desligou as saídas",
};

export class BenchController {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly encoder = new TextEncoder();
  private readonly lines = new LineAccumulator();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingAck | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly onUsbDisconnect = () => {
    pushLog("info", "Cabo USB desconectado");
    void this.disconnect("USB desconectado");
  };

  constructor(private readonly serialProvider: () => SerialLike | null = getWebSerial) {}

  async connect(opts: { allPorts?: boolean } = {}): Promise<void> {
    const serial = this.serialProvider();
    if (!serial) {
      useBenchStore.setState({
        status: "error",
        lastError: "Web Serial indisponível neste navegador.",
      });
      return;
    }
    if (this.port) await this.disconnect();
    useBenchStore.setState({
      status: "connecting",
      lastError: null,
      hello: null,
      data: null,
      dataAt: null,
      badFrames: 0,
    });
    try {
      const port = await serial.requestPort(opts.allPorts ? {} : { filters: [...UNO_USB_FILTERS] });
      await port.open({ baudRate: SERIAL_BAUD_RATE, dataBits: 8, stopBits: 1, parity: "none" });
      this.port = port;
      serial.addEventListener("disconnect", this.onUsbDisconnect);
      const label = describeUsbVendor(port.getInfo());
      useBenchStore.setState({ portLabel: label });
      pushLog(
        "info",
        `Porta aberta (${label}, ${SERIAL_BAUD_RATE} bps). Aguardando o Arduino reiniciar…`,
      );
      if (!port.writable || !port.readable) throw new Error("Porta sem leitura/escrita");
      this.writer = port.writable.getWriter();
      void this.readLoop(port);
      // O Uno reinicia ao abrir a porta; se o HELLO não chegar, pede identificação.
      this.helloTimer = setTimeout(() => void this.send({ kind: "identify" }), 2500);
      this.pingTimer = setInterval(() => void this.send({ kind: "ping" }), 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cancelled = /No port selected|cancel/i.test(msg);
      useBenchStore.setState({
        status: cancelled ? "idle" : "error",
        lastError: cancelled ? null : `Falha ao abrir a porta: ${msg}`,
      });
      await this.cleanup();
    }
  }

  private async readLoop(port: SerialPortLike): Promise<void> {
    if (!port.readable) return;
    const decoder = new TextDecoderStream();
    const readableClosed = port.readable
      .pipeTo(decoder.writable as WritableStream<Uint8Array>)
      .catch(() => undefined);
    this.reader = decoder.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) for (const line of this.lines.push(value)) this.handleLine(line);
      }
    } catch (err) {
      if (this.port) {
        useBenchStore.setState({
          lastError: `Leitura interrompida: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
      await readableClosed;
    }
  }

  /** Exposto para teste: processa uma linha recebida. */
  handleLine(line: string): void {
    const parsed = parseDeviceLine(line);
    if (!parsed.ok) {
      if (parsed.reason !== "empty") {
        useBenchStore.setState((s) => ({ badFrames: s.badFrames + 1 }));
        pushLog("rx", `descartada (${parsed.reason}): ${line}`);
      }
      return;
    }
    const f = parsed.frame;
    switch (f.kind) {
      case "hello":
        if (this.helloTimer) clearTimeout(this.helloTimer);
        this.helloTimer = null;
        useBenchStore.setState({ status: "connected", hello: f, lastError: null });
        pushLog(
          "rx",
          `Arduino ${f.board} ${f.firmware}: saídas ${f.outputs.join(",") || "—"}, entradas ${f.inputs.join(",") || "—"}`,
        );
        break;
      case "data":
        useBenchStore.setState((s) => ({
          data: f,
          dataAt: Date.now(),
          status: s.status === "connecting" ? "connected" : s.status,
        }));
        break;
      case "ack":
        pushLog("rx", `ACK D${f.pin} → ${f.state ? "ligado" : "desligado"}`);
        if (this.pending && this.pending.pin === f.pin && this.pending.state === f.state) {
          clearTimeout(this.pending.timer);
          this.pending.resolve({ ok: true });
          this.pending = null;
        }
        break;
      case "error": {
        const text = ERROR_TEXT[f.code] ?? `Erro ${f.code}`;
        pushLog("rx", `ERR ${f.code}${f.detail ? `:${f.detail}` : ""}`);
        if (this.pending) {
          clearTimeout(this.pending.timer);
          this.pending.resolve({ ok: false, error: text });
          this.pending = null;
        } else {
          useBenchStore.setState({ lastError: text });
        }
        break;
      }
    }
  }

  async send(cmd: HostCommand): Promise<void> {
    if (!this.writer) return;
    const line = encodeCommand(cmd);
    this.writeChain = this.writeChain.then(async () => {
      try {
        await this.writer?.write(this.encoder.encode(line));
        if (cmd.kind !== "ping") pushLog("tx", line.trim());
      } catch (err) {
        useBenchStore.setState({
          lastError: `Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
    return this.writeChain;
  }

  /** Envia comando de saída e espera ACK/ERR do firmware (até 1,5 s). */
  async setOutput(pin: number, on: boolean): Promise<CommandResult> {
    if (!this.writer) return { ok: false, error: "Arduino desconectado." };
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve({ ok: false, error: "Comando substituído por outro." });
      this.pending = null;
    }
    const result = new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending = null;
        resolve({ ok: false, error: "Arduino não confirmou o comando (sem ACK)." });
      }, 1500);
      this.pending = { pin, state: on, resolve, timer };
    });
    await this.send({ kind: "set", pin, state: on });
    return result;
  }

  async allOff(): Promise<void> {
    await this.send({ kind: "allOff" });
  }

  async resetEstop(): Promise<void> {
    await this.send({ kind: "reset" });
  }

  async disconnect(reason?: string): Promise<void> {
    if (this.writer) {
      try {
        // Falha segura: pede para desligar tudo antes de fechar.
        await this.writer.write(this.encoder.encode(encodeCommand({ kind: "allOff" })));
      } catch {
        // porta já fechada
      }
    }
    await this.cleanup();
    useBenchStore.setState({
      status: reason ? "error" : "idle",
      lastError: reason ?? null,
      data: null,
      dataAt: null,
    });
  }

  private async cleanup(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.pingTimer = null;
    this.helloTimer = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve({ ok: false, error: "Conexão encerrada." });
      this.pending = null;
    }
    this.serialProvider()?.removeEventListener("disconnect", this.onUsbDisconnect);
    try {
      await this.reader?.cancel();
    } catch {
      // ignorado
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // ignorado
    }
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      // ignorado
    }
    this.port = null;
    this.lines.reset();
  }
}

/** Instância única por aba. */
export const benchController = new BenchController();
