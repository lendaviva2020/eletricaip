// ELÉTRICAI INDUSTRIAL OS — GATE 4.3.1
// Honest Protocol Layer Classification, Data Provenance & Cloud–Edge Network Policy
// Zero Node.js built-ins: 100% isomorphic for Cloud, Edge, and UI consumption.

export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;

export type EdgeExecutionMode = "SIMULATOR" | "EDGE_READ_ONLY";

export type TagProvenance =
  | "PHYSICAL_READ_ONLY"
  | "SIMULATED"
  | "FORCED_SIMULATED"
  | "CALCULATED"
  | "STALE"
  | "BAD"
  | "NOT_CONNECTED"
  | "UNKNOWN";

export type ProtocolImplementationClass =
  "PARSER" | "SIMULATOR" | "LAB_EDGE_ADAPTER" | "EDGE_TRANSPORT" | "PHYSICAL_COMMUNICATION";

export interface ProtocolLayerDescriptor {
  id: string;
  modulePath: string;
  protocol: "MODBUS_TCP" | "OPC_UA" | "MQTT_SPARKPLUG_B" | "HTTPS_MTLS_FLEET";
  implementationClass: ProtocolImplementationClass;
  runtimeLocation: "CLOUD" | "EDGE_GATEWAY" | "SHARED_PURE";
  allowsDirectCloudToOtSocket: false;
  allowsPhysicalWrites: false;
  supportedProvenances: readonly TagProvenance[];
  description: string;
}

export const PROTOCOL_LAYER_CLASSIFICATION: readonly ProtocolLayerDescriptor[] = [
  {
    id: "cloud-modbus-server-functions",
    modulePath: "src/lib/modbus-server.functions.ts",
    protocol: "MODBUS_TCP",
    implementationClass: "SIMULATOR",
    runtimeLocation: "CLOUD",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: [
      "SIMULATED",
      "FORCED_SIMULATED",
      "PHYSICAL_READ_ONLY",
      "STALE",
      "NOT_CONNECTED",
    ],
    description:
      "Funções Cloud Modbus operando exclusivamente em modo SIMULATOR em memória ou leitura passiva mediada por Edge Gateway (EDGE_READ_ONLY). Sockets TCP e DNS na Cloud estão permanentemente desativados.",
  },
  {
    id: "cloud-opcua-server-functions",
    modulePath: "src/lib/opcua-server.functions.ts",
    protocol: "OPC_UA",
    implementationClass: "SIMULATOR",
    runtimeLocation: "CLOUD",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: [
      "SIMULATED",
      "FORCED_SIMULATED",
      "PHYSICAL_READ_ONLY",
      "STALE",
      "NOT_CONNECTED",
    ],
    description:
      "Funções Cloud OPC-UA operando exclusivamente em modo SIMULATOR ou leitura passiva mediada por Edge Gateway (EDGE_READ_ONLY). Conexões diretas da Cloud para rede OT são proibidas.",
  },
  {
    id: "studio-modbus-protocol-engine",
    modulePath: "src/lib/studio/communication/protocol-engine.ts#ModbusProtocolEngine",
    protocol: "MODBUS_TCP",
    implementationClass: "PARSER",
    runtimeLocation: "SHARED_PURE",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["SIMULATED", "FORCED_SIMULATED", "CALCULATED"],
    description:
      "Parser puro de frames MBAP/CRC-16 e simulador virtual de banco de registradores. Nunca estabelece conexão TCP real.",
  },
  {
    id: "studio-opcua-protocol-engine",
    modulePath: "src/lib/studio/communication/protocol-engine.ts#OPCUAProtocolEngine",
    protocol: "OPC_UA",
    implementationClass: "PARSER",
    runtimeLocation: "SHARED_PURE",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["SIMULATED", "NOT_CONNECTED", "BAD"],
    description:
      "Parser de NodeId e buffer de nós OPC-UA em memória para simulação de estúdio. Não implementa sessão TCP/UA binária real.",
  },
  {
    id: "studio-sparkplug-mqtt-engine",
    modulePath: "src/lib/studio/communication/protocol-engine.ts#SparkplugBProtocolEngine",
    protocol: "MQTT_SPARKPLUG_B",
    implementationClass: "PARSER",
    runtimeLocation: "SHARED_PURE",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["SIMULATED", "PHYSICAL_READ_ONLY", "CALCULATED"],
    description:
      "Codec de tópicos Sparkplug B (NBIRTH/DBIRTH/NDATA/DDATA) e roteamento lógico local sem broker TCP acoplado.",
  },
  {
    id: "edge-modbus-driver",
    modulePath: "src/lib/edge/drivers/modbus-driver.ts",
    protocol: "MODBUS_TCP",
    implementationClass: "LAB_EDGE_ADAPTER",
    runtimeLocation: "EDGE_GATEWAY",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["SIMULATED", "PHYSICAL_READ_ONLY", "STALE", "BAD", "NOT_CONNECTED"],
    description:
      "Adapter Edge Gateway Modbus read-only em modo laboratório/simulação de bancada com allowlist SSRF e bloqueio físico permanente de escrita.",
  },
  {
    id: "edge-opcua-driver",
    modulePath: "src/lib/edge/drivers/opcua-driver.ts",
    protocol: "OPC_UA",
    implementationClass: "LAB_EDGE_ADAPTER",
    runtimeLocation: "EDGE_GATEWAY",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["SIMULATED", "PHYSICAL_READ_ONLY", "STALE", "BAD", "NOT_CONNECTED"],
    description:
      "Adapter Edge Gateway OPC-UA read-only com catálogo de nós virtuais de laboratório e bloqueio físico permanente de escrita.",
  },
  {
    id: "edge-sparkplug-driver",
    modulePath: "src/lib/edge/drivers/sparkplug-driver.ts",
    protocol: "MQTT_SPARKPLUG_B",
    implementationClass: "LAB_EDGE_ADAPTER",
    runtimeLocation: "EDGE_GATEWAY",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["SIMULATED", "PHYSICAL_READ_ONLY", "STALE", "BAD", "NOT_CONNECTED"],
    description:
      "Adapter Edge Gateway Sparkplug B read-only para assinatura lógica de telemetria e detecção de sequence gaps.",
  },
  {
    id: "cloud-edge-fleet-transport",
    modulePath: "src/lib/edge/cloud-gateway-registry.ts",
    protocol: "HTTPS_MTLS_FLEET",
    implementationClass: "EDGE_TRANSPORT",
    runtimeLocation: "CLOUD",
    allowsDirectCloudToOtSocket: false,
    allowsPhysicalWrites: false,
    supportedProvenances: ["PHYSICAL_READ_ONLY", "SIMULATED", "STALE", "BAD"],
    description:
      "Transporte unidirecional Edge → Cloud via HTTPS autenticado por token/certificado de gateway, deduplicação idempotente e persistência SQL.",
  },
] as const;

const BLOCKED_METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "instance-data",
]);

function isDisallowedHostnameOrLiteral(h: string): boolean {
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.includes(":")) return true; // IPv6 literal — block loopback/link-local/ULA

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const parts = ipv4.slice(1, 5).map((p) => Number(p));
    if (parts.some((p) => p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this" network
    if (a === 169 && b === 254) return true; // link-local / cloud metadata IMDS
    if (a >= 224) return true; // multicast / reserved / broadcast
    const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    return !isPrivate;
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h)) {
    return true;
  }

  if (
    BLOCKED_METADATA_HOSTS.has(h) ||
    h.endsWith(".internal") ||
    h.endsWith(".nip.io") ||
    h.endsWith(".sslip.io") ||
    h.endsWith(".xip.io") ||
    h.endsWith(".localtest.me") ||
    /^(\d{1,3}\.){3}\d{1,3}\./.test(h)
  ) {
    return true;
  }

  return false;
}

/**
 * Validates whether a host string is safe inside Edge Gateway network policies.
 * Allows exact logical target `"simulation"` and valid private RFC1918 / non-rebinding OT DNS names.
 * Blocks loopback, localhost, link-local / cloud IMDS, public IPv4s, IPv6, and rebinding suffixes.
 */
export function isHostAllowed(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === "simulation") return true;
  return !isDisallowedHostnameOrLiteral(h);
}

/**
 * Stricter variant for physical/Edge OT host validation: rejects `"simulation"` literal.
 */
export function isEdgeOtHostAllowed(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h === "simulation") return false;
  return !isDisallowedHostnameOrLiteral(h);
}

/**
 * Parses and validates an OPC-UA endpoint (`opc.tcp://host[:port][/path]`) without credentials.
 */
export function parseAndValidateOpcuaEndpoint(
  endpoint: string,
):
  | { valid: true; host: string; port: number; isSimulationLiteral: boolean }
  | { valid: false; reason: string } {
  const raw = endpoint.trim();
  const normalized = raw.toLowerCase();
  if (!normalized.startsWith("opc.tcp://")) {
    return { valid: false, reason: "Apenas o esquema opc.tcp:// é permitido." };
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${raw.slice("opc.tcp://".length)}`);
  } catch {
    return { valid: false, reason: "URL OPC-UA malformada." };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: "Credenciais embutidas na URL OPC-UA são proibidas." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!isHostAllowed(host)) {
    return { valid: false, reason: "Endpoint OPC-UA bloqueado pela política de rede OT/Edge." };
  }

  const port = parsed.port ? Number(parsed.port) : 4840;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { valid: false, reason: "Porta OPC-UA inválida." };
  }

  return {
    valid: true,
    host,
    port,
    isSimulationLiteral: host === "simulation",
  };
}

export function isOpcuaEndpointAllowed(endpoint: string): boolean {
  return parseAndValidateOpcuaEndpoint(endpoint).valid;
}

export interface EdgeTargetAuthorizationInput {
  protocol: "MODBUS_TCP" | "OPC_UA";
  mode: EdgeExecutionMode;
  target: string;
  port?: number;
  gateway?: {
    gatewayId: string;
    organizationId: string;
    plantId: string;
    operationalState: string;
    connectivityState: string;
    authorizedEndpoints?: readonly string[];
  };
  actorOrganizationId?: string;
  actorPlantId?: string;
  isPlatformAdmin?: boolean;
}

export type EdgeTargetAuthorizationResult =
  | {
      allowed: true;
      mode: "SIMULATOR";
      provenance: "SIMULATED";
      normalizedTarget: string;
    }
  | {
      allowed: true;
      mode: "EDGE_READ_ONLY";
      provenance: "PHYSICAL_READ_ONLY" | "STALE" | "NOT_CONNECTED";
      normalizedTarget: string;
      gatewayId: string;
    }
  | {
      allowed: false;
      code:
        | "SSRF_POLICY_BLOCKED"
        | "CLOUD_DIRECT_OT_BLOCKED"
        | "SIMULATOR_TARGET_MISMATCH"
        | "GATEWAY_NOT_FOUND"
        | "TENANT_FORBIDDEN"
        | "PLANT_FORBIDDEN"
        | "ENDPOINT_NOT_ALLOWLISTED";
      message: string;
      httpStatus: 400 | 403 | 404;
    };

/**
 * Authorizes an inspection/connection request on the Cloud boundary.
 * Cloud NEVER opens sockets or resolves DNS toward OT networks (`ELÉTRICAI CLOUD -> EDGE GATEWAY -> REDE OT`).
 */
export function authorizeCloudToEdgeReadTarget(
  input: EdgeTargetAuthorizationInput,
): EdgeTargetAuthorizationResult {
  let host = input.target.trim().toLowerCase();
  let effectivePort = input.port;

  if (input.protocol === "OPC_UA") {
    const parsed = parseAndValidateOpcuaEndpoint(input.target);
    if (!parsed.valid) {
      return {
        allowed: false,
        code: "SSRF_POLICY_BLOCKED",
        message: parsed.reason,
        httpStatus: 400,
      };
    }
    host = parsed.host;
    effectivePort = parsed.port;
  } else {
    if (!isHostAllowed(host)) {
      return {
        allowed: false,
        code: "SSRF_POLICY_BLOCKED",
        message:
          "Host bloqueado pela política SSRF/OT. Loopback, IMDS (169.254.x.x), IPs públicos e domínios de rebinding são proibidos.",
        httpStatus: 400,
      };
    }
  }

  if (input.mode === "SIMULATOR") {
    if (host !== "simulation") {
      return {
        allowed: false,
        code: "SIMULATOR_TARGET_MISMATCH",
        message:
          input.protocol === "OPC_UA"
            ? 'Modo SIMULATOR exige o endpoint lógico exato "opc.tcp://simulation:4840". Alvos OT reais devem usar modo EDGE_READ_ONLY via Edge Gateway.'
            : 'Modo SIMULATOR exige o host lógico exato "simulation". Alvos OT reais devem usar modo EDGE_READ_ONLY via Edge Gateway.',
        httpStatus: 400,
      };
    }

    return {
      allowed: true,
      mode: "SIMULATOR",
      provenance: "SIMULATED",
      normalizedTarget:
        input.protocol === "OPC_UA"
          ? `opc.tcp://simulation:${effectivePort ?? 4840}`
          : "simulation",
    };
  }

  // mode === "EDGE_READ_ONLY"
  if (host === "simulation") {
    return {
      allowed: false,
      code: "CLOUD_DIRECT_OT_BLOCKED",
      message:
        'Modo EDGE_READ_ONLY não aceita o alvo virtual "simulation". Use modo SIMULATOR para simulações em memória.',
      httpStatus: 400,
    };
  }

  if (!input.gateway) {
    return {
      allowed: false,
      code: input.gateway === undefined ? "GATEWAY_NOT_FOUND" : "CLOUD_DIRECT_OT_BLOCKED",
      message:
        "Conexão direta Cloud -> OT é proibida. Informe um Edge Gateway provisionado e pertencente ao seu tenant.",
      httpStatus: 404,
    };
  }

  if (!input.isPlatformAdmin) {
    if (!input.actorOrganizationId || input.gateway.organizationId !== input.actorOrganizationId) {
      return {
        allowed: false,
        code: "TENANT_FORBIDDEN",
        message: "Acesso negado: Edge Gateway pertence a outro tenant/organização.",
        httpStatus: 403,
      };
    }
    if (input.actorPlantId && input.gateway.plantId !== input.actorPlantId) {
      return {
        allowed: false,
        code: "PLANT_FORBIDDEN",
        message: "Acesso negado: Edge Gateway pertence a outra planta industrial.",
        httpStatus: 403,
      };
    }
  }

  const normalizedEndpoint =
    input.protocol === "OPC_UA"
      ? `opc.tcp://${host}:${effectivePort ?? 4840}`
      : `${host}:${effectivePort ?? 502}`;

  if (
    input.gateway.authorizedEndpoints &&
    input.gateway.authorizedEndpoints.length > 0 &&
    !input.gateway.authorizedEndpoints.some(
      (ep) => ep.trim().toLowerCase() === normalizedEndpoint || ep.trim().toLowerCase() === host,
    )
  ) {
    return {
      allowed: false,
      code: "ENDPOINT_NOT_ALLOWLISTED",
      message: `Endpoint "${normalizedEndpoint}" não está na allowlist provisionada do gateway ${input.gateway.gatewayId}.`,
      httpStatus: 403,
    };
  }

  const provenance: "PHYSICAL_READ_ONLY" | "STALE" | "NOT_CONNECTED" =
    input.gateway.connectivityState === "CONNECTED" && input.gateway.operationalState === "ONLINE"
      ? "PHYSICAL_READ_ONLY"
      : input.gateway.operationalState === "DEGRADED"
        ? "STALE"
        : "NOT_CONNECTED";

  return {
    allowed: true,
    mode: "EDGE_READ_ONLY",
    provenance,
    normalizedTarget: normalizedEndpoint,
    gatewayId: input.gateway.gatewayId,
  };
}
