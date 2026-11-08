/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * Network Proxy, X-Forwarded-For & IP Address Validation Guard
 *
 * Mitigates and enforces regression defenses for:
 * - CVE-2026-90711 (CRITICAL): proxy-addr IP spoofing / untrusted header bypass
 * - CVE-2026-101911 (MEDIUM): ip-address DoS on malformed address parsing
 * - CVE-2026-101912 (MEDIUM): ip-address access control bypass on IPv4-mapped IPv6 comparison
 * - CVE-2026-111997 (MEDIUM): ip-address DoS via excessive percent (%) characters in IPv6 zone IDs
 */

import { Address4, Address6 } from "ip-address";

export const NETWORK_PROXY_GUARD_VERSION = "3.8.2-NET-PROXY-GUARD-v1.0";

export const MAX_IPV4_STRING_LENGTH = 15;
export const MAX_IPV6_STRING_LENGTH = 45;
export const MAX_XFF_HOPS = 16;
export const MAX_XFF_HEADER_LENGTH = 1024;

export interface ParsedIpInfo {
  canonicalIp: string;
  family: "IPv4" | "IPv6";
  wasIpv4Mapped: boolean;
  isLoopback: boolean;
  isPrivate: boolean;
}

export interface ClientIpResolutionResult {
  clientIp: string;
  family: "IPv4" | "IPv6";
  trustedProxyUsed: boolean;
  ignoredSpoofedHeaders: boolean;
  hopTrace: string[];
}

/**
 * Validates and normalizes an IPv4 or IPv6 address string.
 * Rejects excessive length, multiple/malicious `%` zone delimiters (CVE-2026-111997),
 * and canonicalizes IPv4-mapped IPv6 (`::ffff:a.b.c.d` or `::ffff:xxxx:xxxx`) to IPv4
 * so access control lists cannot be bypassed across address families (CVE-2026-101912).
 */
export function parseAndNormalizeIp(rawInput: string): ParsedIpInfo {
  if (typeof rawInput !== "string") {
    throw new TypeError("IP address must be a string.");
  }
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("IP address cannot be empty.");
  }

  // Block CVE-2026-111997: reject any percent-encoding or IPv6 zone index on external inputs
  if (trimmed.includes("%")) {
    throw new Error(
      "IPv6 zone identifiers and percent-encoded characters (%) are forbidden in network headers (CVE-2026-111997).",
    );
  }

  if (trimmed.length > MAX_IPV6_STRING_LENGTH) {
    throw new RangeError(
      `IP address length (${trimmed.length}) exceeds strict maximum (${MAX_IPV6_STRING_LENGTH}).`,
    );
  }

  // Reject whitespace or control characters
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) {
      throw new Error("IP address contains invalid whitespace or control characters.");
    }
  }

  // Check IPv4 first if it contains dots and no colons
  if (!trimmed.includes(":")) {
    if (trimmed.length > MAX_IPV4_STRING_LENGTH) {
      throw new RangeError("IPv4 address exceeds maximum length of 15 characters.");
    }
    // Reject octal/hex notation (e.g. 0177.0.0.1 or 0x7f.0.0.1) to prevent parser confusion
    const octets = trimmed.split(".");
    if (octets.length !== 4) {
      throw new Error(`Invalid IPv4 format: ${trimmed}`);
    }
    for (const octet of octets) {
      if (!/^(0|[1-9]\d{0,2})$/.test(octet)) {
        throw new Error(`Invalid or non-canonical IPv4 octet: ${octet}`);
      }
      const num = Number(octet);
      if (num < 0 || num > 255) {
        throw new Error(`IPv4 octet out of range: ${octet}`);
      }
    }
    const addr4 = new Address4(trimmed);
    const canonical = addr4.correctForm();
    return {
      canonicalIp: canonical,
      family: "IPv4",
      wasIpv4Mapped: false,
      isLoopback: isIpv4InCidr(canonical, "127.0.0.0/8"),
      isPrivate:
        isIpv4InCidr(canonical, "10.0.0.0/8") ||
        isIpv4InCidr(canonical, "172.16.0.0/12") ||
        isIpv4InCidr(canonical, "192.168.0.0/16") ||
        isIpv4InCidr(canonical, "169.254.0.0/16"),
    };
  }

  // IPv6 path
  const addr6 = new Address6(trimmed);
  if (addr6.is4()) {
    const mapped4 = addr6.to4().correctForm();
    return {
      canonicalIp: mapped4,
      family: "IPv4",
      wasIpv4Mapped: true,
      isLoopback: isIpv4InCidr(mapped4, "127.0.0.0/8"),
      isPrivate:
        isIpv4InCidr(mapped4, "10.0.0.0/8") ||
        isIpv4InCidr(mapped4, "172.16.0.0/12") ||
        isIpv4InCidr(mapped4, "192.168.0.0/16") ||
        isIpv4InCidr(mapped4, "169.254.0.0/16"),
    };
  }

  const canonical6 = addr6.correctForm();
  return {
    canonicalIp: canonical6,
    family: "IPv6",
    wasIpv4Mapped: false,
    isLoopback: canonical6 === "::1",
    isPrivate:
      canonical6.startsWith("fc") || canonical6.startsWith("fd") || canonical6.startsWith("fe80:"),
  };
}

function ipv4ToUint32(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (
    (((parts[0]! << 24) >>> 0) +
      ((parts[1]! << 16) >>> 0) +
      ((parts[2]! << 8) >>> 0) +
      (parts[3]! >>> 0)) >>>
    0
  );
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [subnetStr, prefixStr] = cidr.split("/");
  if (!subnetStr || !prefixStr) return false;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToUint32(ip) & mask) >>> 0 === (ipv4ToUint32(subnetStr) & mask) >>> 0;
}

/**
 * Checks whether an IP address (IPv4, IPv6, or IPv4-mapped IPv6) matches a CIDR or exact IP.
 * Guarantees family-consistent comparison after normalizing IPv4-mapped IPv6 addresses.
 */
export function isIpInTrustedCidr(rawIp: string, cidrOrIp: string): boolean {
  const parsedIp = parseAndNormalizeIp(rawIp);
  const trimmedCidr = cidrOrIp.trim();

  if (!trimmedCidr.includes("/")) {
    const parsedTarget = parseAndNormalizeIp(trimmedCidr);
    return (
      parsedIp.family === parsedTarget.family && parsedIp.canonicalIp === parsedTarget.canonicalIp
    );
  }

  const [baseStr, prefixStr] = trimmedCidr.split("/");
  if (!baseStr || !prefixStr) {
    throw new Error(`Malformed CIDR specification: ${cidrOrIp}`);
  }
  const parsedBase = parseAndNormalizeIp(baseStr);
  if (parsedIp.family !== parsedBase.family) {
    return false;
  }

  if (parsedIp.family === "IPv4") {
    return isIpv4InCidr(parsedIp.canonicalIp, `${parsedBase.canonicalIp}/${prefixStr}`);
  }

  const subnet6 = new Address6(`${parsedBase.canonicalIp}/${prefixStr}`);
  const target6 = new Address6(parsedIp.canonicalIp);
  return target6.isInSubnet(subnet6);
}

/**
 * Resolves the authentic client IP using right-to-left evaluation of X-Forwarded-For
 * strictly against an explicit allowlist of trusted reverse proxy CIDRs (CVE-2026-90711).
 *
 * If the immediate socket peer (`socketRemoteAddress`) is NOT in `trustedProxyCidrs`,
 * any `X-Forwarded-For` header is ignored as a spoofing attempt.
 */
export function resolveTrustedClientIp(
  socketRemoteAddress: string,
  xForwardedForHeader: string | null | undefined,
  trustedProxyCidrs: readonly string[] = [],
): ClientIpResolutionResult {
  const socketParsed = parseAndNormalizeIp(socketRemoteAddress);

  const isSocketTrusted = trustedProxyCidrs.some((cidr) =>
    isIpInTrustedCidr(socketParsed.canonicalIp, cidr),
  );

  if (!xForwardedForHeader || !xForwardedForHeader.trim()) {
    return {
      clientIp: socketParsed.canonicalIp,
      family: socketParsed.family,
      trustedProxyUsed: false,
      ignoredSpoofedHeaders: false,
      hopTrace: [socketParsed.canonicalIp],
    };
  }

  // If the immediate socket peer is not a trusted reverse proxy, reject XFF spoofing
  if (!isSocketTrusted) {
    return {
      clientIp: socketParsed.canonicalIp,
      family: socketParsed.family,
      trustedProxyUsed: false,
      ignoredSpoofedHeaders: true,
      hopTrace: [socketParsed.canonicalIp],
    };
  }

  if (xForwardedForHeader.length > MAX_XFF_HEADER_LENGTH) {
    throw new RangeError(
      `X-Forwarded-For header length (${xForwardedForHeader.length}) exceeds maximum (${MAX_XFF_HEADER_LENGTH}).`,
    );
  }

  const rawHops = xForwardedForHeader
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  if (rawHops.length === 0) {
    return {
      clientIp: socketParsed.canonicalIp,
      family: socketParsed.family,
      trustedProxyUsed: false,
      ignoredSpoofedHeaders: false,
      hopTrace: [socketParsed.canonicalIp],
    };
  }

  if (rawHops.length > MAX_XFF_HOPS) {
    throw new RangeError(
      `X-Forwarded-For hop count (${rawHops.length}) exceeds maximum (${MAX_XFF_HOPS}).`,
    );
  }

  // Walk right-to-left: stop at the first non-trusted hop
  const chain = [...rawHops, socketParsed.canonicalIp];
  const normalizedChain: ParsedIpInfo[] = [];

  for (let i = chain.length - 1; i >= 0; i--) {
    let parsedHop: ParsedIpInfo;
    try {
      parsedHop = parseAndNormalizeIp(chain[i]!);
    } catch {
      // If an upstream header contains malformed/spoofed garbage, stop at the last verified hop
      break;
    }
    normalizedChain.unshift(parsedHop);
    const isHopTrusted = trustedProxyCidrs.some((cidr) =>
      isIpInTrustedCidr(parsedHop.canonicalIp, cidr),
    );
    if (!isHopTrusted) {
      return {
        clientIp: parsedHop.canonicalIp,
        family: parsedHop.family,
        trustedProxyUsed: true,
        ignoredSpoofedHeaders: i > 0,
        hopTrace: normalizedChain.map((h) => h.canonicalIp),
      };
    }
  }

  const leftmost = normalizedChain[0] ?? socketParsed;
  return {
    clientIp: leftmost.canonicalIp,
    family: leftmost.family,
    trustedProxyUsed: true,
    ignoredSpoofedHeaders: false,
    hopTrace: normalizedChain.map((h) => h.canonicalIp),
  };
}
