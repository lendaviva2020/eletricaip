// Trusted Client IP & Proxy-Addr Guard — Gate 3.8.2
// Mitigates CVE-2026-90711 (CRITICAL): IP spoofing via IPv4-mapped IPv6 trust subnet
// in proxy-addr (< 2.0.8).

import proxyaddr from "proxy-addr";

export interface ClientIpResolutionOptions {
  /**
   * Lista de sub-redes/proxies explicitamente confiáveis.
   * Por padrão, apenas loopback (127.0.0.1/8, ::1/128) é confiável.
   */
  trustedProxies?: string[];
}

const DEFAULT_TRUSTED_PROXIES = ["127.0.0.1/8", "::1/128"];

// Mapeia IPv4-mapped IPv6 em formato dotted-quad (::ffff:192.0.2.1)
// ou formato hexadecimal (::ffff:7f00:1 ou ::ffff:c000:0201)
const IPV4_MAPPED_DECIMAL_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const IPV4_MAPPED_HEX_RE = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/**
 * Normaliza endereços IPv4-mapped IPv6 (ex.: ::ffff:127.0.0.1 ou ::ffff:7f00:0001)
 * para sua representação IPv4 canônica antes de qualquer avaliação de confiança,
 * eliminando ambiguidades de sub-rede exploradas no CVE-2026-90711.
 */
export function normalizeIpAddress(rawIp: string): string {
  const trimmed = rawIp.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) return "0.0.0.0";

  const decMatch = trimmed.match(IPV4_MAPPED_DECIMAL_RE);
  if (decMatch && decMatch[1]) {
    const octets = decMatch[1].split(".").map(Number);
    if (octets.length === 4 && octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)) {
      return octets.join(".");
    }
    return "0.0.0.0";
  }

  const hexMatch = trimmed.match(IPV4_MAPPED_HEX_RE);
  if (hexMatch && hexMatch[1] && hexMatch[2]) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    const o1 = (hi >> 8) & 0xff;
    const o2 = hi & 0xff;
    const o3 = (lo >> 8) & 0xff;
    const o4 = lo & 0xff;
    return `${o1}.${o2}.${o3}.${o4}`;
  }

  return trimmed;
}

/**
 * Valida se um IP é sintaticamente legítimo (IPv4 estrito ou IPv6 sem caracteres de injeção).
 */
export function isValidIpLiteral(ip: string): boolean {
  const normalized = normalizeIpAddress(ip);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    return normalized.split(".").every((part) => {
      const n = Number(part);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  // IPv6 literal básico
  if (/^[0-9a-fA-F:]+$/.test(normalized) && normalized.includes(":")) {
    return normalized.length <= 45;
  }
  return false;
}

/**
 * Resolve o endereço IP real do cliente de forma segura contra spoofing de X-Forwarded-For
 * e contra o bypass de sub-rede IPv4-mapped IPv6 (CVE-2026-90711).
 */
export function resolveTrustedClientIp(
  headers: Headers | Record<string, string | undefined>,
  socketPeerIp: string,
  options: ClientIpResolutionOptions = {},
): string {
  const normalizedPeer = normalizeIpAddress(socketPeerIp);
  if (!isValidIpLiteral(normalizedPeer)) {
    return "0.0.0.0";
  }

  const trustedProxies = options.trustedProxies ?? DEFAULT_TRUSTED_PROXIES;
  const trustFn = proxyaddr.compile(trustedProxies);

  // Se o peer imediato NÃO estiver na sub-rede confiável após normalização canônica,
  // ignoramos completamente qualquer cabeçalho X-Forwarded-For enviado pelo cliente.
  if (!trustFn(normalizedPeer, 0)) {
    return normalizedPeer;
  }

  const rawXff =
    headers instanceof Headers
      ? (headers.get("x-forwarded-for") ?? undefined)
      : (headers["x-forwarded-for"] ?? headers["X-Forwarded-For"]);

  if (!rawXff) {
    return normalizedPeer;
  }

  // Normaliza cada hop do X-Forwarded-For e rejeita entradas malformadas
  const sanitizedHops = rawXff
    .split(",")
    .map((h) => normalizeIpAddress(h))
    .filter((h) => isValidIpLiteral(h));

  if (sanitizedHops.length === 0) {
    return normalizedPeer;
  }

  const fakeReq = {
    headers: {
      "x-forwarded-for": sanitizedHops.join(", "),
    },
    connection: {
      remoteAddress: normalizedPeer,
    },
  };

  const resolved = proxyaddr(fakeReq as Parameters<typeof proxyaddr>[0], trustFn);
  return normalizeIpAddress(resolved);
}
