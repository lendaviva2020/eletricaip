/**
 * Tipos mínimos da Web Serial API (o lib.dom do TypeScript ainda não os
 * inclui) e detecção de suporte. Funciona em Chrome/Edge no computador
 * (HTTPS); Firefox e Safari não suportam.
 */

export interface SerialPortInfoLike {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
}

export interface SerialPortLike {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: "none";
  }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfoLike;
}

export interface SerialLike {
  requestPort(options?: { filters?: SerialPortInfoLike[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(type: "disconnect", listener: (ev: Event) => void): void;
  removeEventListener(type: "disconnect", listener: (ev: Event) => void): void;
}

/**
 * Fabricantes USB das placas Uno: WCH (CH340, clones SMD), Arduino (16U2)
 * e Arduino.org. Filtrar evita o usuário escolher a porta errada.
 */
export const UNO_USB_FILTERS: readonly SerialPortInfoLike[] = [
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x2341 },
  { usbVendorId: 0x2a03 },
];

export function describeUsbVendor(info: SerialPortInfoLike): string {
  switch (info.usbVendorId) {
    case 0x1a86:
      return "CH340 (WCH)";
    case 0x2341:
    case 0x2a03:
      return "Arduino";
    default:
      return info.usbVendorId ? `USB 0x${info.usbVendorId.toString(16)}` : "porta serial";
  }
}

export function getWebSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  const serial = (navigator as Navigator & { serial?: SerialLike }).serial;
  return serial ?? null;
}

export function webSerialSupport(): { supported: boolean; reason?: string } {
  if (typeof window === "undefined") return { supported: false, reason: "Sem navegador." };
  if (!window.isSecureContext) {
    return { supported: false, reason: "A Web Serial exige HTTPS." };
  }
  if (!getWebSerial()) {
    return {
      supported: false,
      reason: "Este navegador não tem Web Serial. Use Chrome ou Edge no computador.",
    };
  }
  return { supported: true };
}
