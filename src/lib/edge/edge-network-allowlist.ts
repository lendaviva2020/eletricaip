// ELÉTRICAI INDUSTRIAL OS — EDGE GATEWAY NETWORK ALLOWLIST & DNS GUARD
// @edge-only: Runs STRICTLY inside the on-premise Edge Gateway / Edge daemon / Edge test harness.
// Cloud Server Functions MUST NEVER import or execute DNS resolution or raw TCP sockets toward OT.

import dns from "node:dns";
import {
  isHostAllowed,
  isEdgeOtHostAllowed,
  isOpcuaEndpointAllowed,
  parseAndValidateOpcuaEndpoint,
  authorizeCloudToEdgeReadTarget,
  PROTOCOL_LAYER_CLASSIFICATION,
  type EdgeExecutionMode,
  type TagProvenance,
  type ProtocolImplementationClass,
  type ProtocolLayerDescriptor,
  type EdgeTargetAuthorizationInput,
  type EdgeTargetAuthorizationResult,
} from "./protocol-classification";

export {
  isHostAllowed,
  isEdgeOtHostAllowed,
  isOpcuaEndpointAllowed,
  parseAndValidateOpcuaEndpoint,
  authorizeCloudToEdgeReadTarget,
  PROTOCOL_LAYER_CLASSIFICATION,
  type EdgeExecutionMode,
  type TagProvenance,
  type ProtocolImplementationClass,
  type ProtocolLayerDescriptor,
  type EdgeTargetAuthorizationInput,
  type EdgeTargetAuthorizationResult,
};

/**
 * Edge-only DNS resolver with post-resolution SSRF rebinding protection.
 * Blocks any hostname that resolves to loopback, IMDS (169.254.0.0/16), public IPv4s, or 0.0.0.0/8.
 */
export async function resolveToAllowedIPv4(host: string): Promise<string> {
  const h = host.trim().toLowerCase();

  // Logical "simulation" and validated IPv4 literals bypass DNS lookup cleanly.
  if (h === "simulation") return host;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
    if (!isHostAllowed(h)) {
      throw new Error(
        `Host "${host}" não permitido pela política de rede OT/Edge (RFC1918 requerido).`,
      );
    }
    return host;
  }

  let addresses: string[];
  try {
    addresses = await dns.promises.resolve4(h);
  } catch {
    throw new Error(`Não foi possível resolver o host "${host}".`);
  }

  if (addresses.length === 0) {
    throw new Error(`Host "${host}" não resolveu para nenhum endereço IPv4.`);
  }

  const disallowed = addresses.find((ip) => !isHostAllowed(ip));
  if (disallowed) {
    throw new Error(
      `Host "${host}" resolve para um endereço não permitido (${disallowed}). Conexão bloqueada por política de segurança.`,
    );
  }

  return addresses[0];
}
