// ELÉTRICAI INDUSTRIAL OS — STANDALONE EDGE DAEMON CONFIGURATION
// Schema, File Discovery, Environment Overrides & Validation

import fs from "node:fs";
import path from "node:path";

export interface StorageConfig {
  dbPath: string;
  maxSamples: number;
  maxDiskBytes: number;
  synchronous: "NORMAL" | "FULL" | "OFF";
  saturationPolicy: "DROP_OLDEST_NON_CRITICAL" | "DROP_NEWEST_WITH_ALARM";
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  logDir?: string;
  console: boolean;
}

export interface HealthServerConfig {
  enabled: boolean;
  host: string;
  port: number;
}

export interface CloudSyncConfig {
  endpoint: string;
  syncIntervalMs: number;
  authToken?: string;
}

export interface DriverInstanceConfig {
  id: string;
  protocol: "OPC_UA" | "MODBUS_TCP" | "MQTT_SPARKPLUG_B";
  connectionId: string;
  enabled: boolean;
  opcua?: {
    endpointUrl: string;
    securityPolicy?: string;
    securityMode?: string;
  };
  modbus?: {
    host: string;
    port?: number;
    unitId?: number;
  };
  sparkplug?: {
    brokerUrl: string;
    clientId: string;
    groupId: string;
    edgeNodeId: string;
  };
}

export interface TagMappingConfig {
  driverId: string;
  sourceAddress: string;
  targetTagName: string;
  projectId: string;
  equipmentId?: string;
  dataType?: string;
  engineeringUnit?: string;
}

export interface EdgeDaemonConfig {
  gatewayId: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  version: string;
  storage: StorageConfig;
  logging: LoggingConfig;
  healthServer: HealthServerConfig;
  cloud: CloudSyncConfig;
  drivers: DriverInstanceConfig[];
  tagMappings: TagMappingConfig[];
}

export const DEFAULT_CONFIG: EdgeDaemonConfig = {
  gatewayId: "egw_lab_default",
  organizationId: "org_eletricai_demo",
  plantId: "plant_ete_demo",
  stationId: "station_rack_01",
  version: "3.1.0-industrial",
  storage: {
    dbPath: "./data/buffer/outbox.db",
    maxSamples: 100000,
    maxDiskBytes: 250 * 1024 * 1024, // 250 MB
    synchronous: "NORMAL",
    saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
  },
  logging: {
    level: "info",
    logDir: "./logs",
    console: true,
  },
  healthServer: {
    enabled: true,
    host: "127.0.0.1",
    port: 9090,
  },
  cloud: {
    endpoint: "https://api.eletricai.com/v1/edge/sync",
    syncIntervalMs: 1000,
  },
  drivers: [],
  tagMappings: [],
};

export function loadEdgeConfig(explicitPath?: string): EdgeDaemonConfig {
  // Discovery chain:
  // 1. Explicit path passed via CLI (--config)
  // 2. Environment variable ELETRICAI_EDGE_CONFIG
  // 3. Local ./config/edge-gateway.json
  // 4. System /etc/eletricai/gateway.json
  // 5. Default in-memory configuration

  const candidatePaths: string[] = [];

  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(
        `CONFIG_FILE_NOT_FOUND: Arquivo de configuração explicitamente informado [${explicitPath}] não existe.`,
      );
    }
    candidatePaths.push(explicitPath);
  }
  if (process.env.ELETRICAI_EDGE_CONFIG) candidatePaths.push(process.env.ELETRICAI_EDGE_CONFIG);
  candidatePaths.push(path.resolve(process.cwd(), "config/edge-gateway.json"));
  candidatePaths.push(path.resolve(process.cwd(), "../config/edge-gateway.json"));
  candidatePaths.push("/etc/eletricai/gateway.json");

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = JSON.parse(raw);
        if (explicitPath && (!parsed.gatewayId || !parsed.organizationId)) {
          throw new Error(
            `CONFIG_VALIDATION_ERROR: Arquivo de configuração [${p}] não possui os campos obrigatórios gatewayId ou organizationId.`,
          );
        }
        return mergeWithDefaults(parsed);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes("CONFIG_VALIDATION_ERROR") ||
            err.message.includes("CONFIG_FILE_NOT_FOUND"))
        ) {
          throw err;
        }
        throw new Error(
          `CONFIG_PARSE_ERROR: Falha ao ler arquivo de configuração [${p}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { ...DEFAULT_CONFIG };
}

export { loadEdgeConfig as loadConfig };

function mergeWithDefaults(custom: Partial<EdgeDaemonConfig>): EdgeDaemonConfig {
  return {
    ...DEFAULT_CONFIG,
    ...custom,
    storage: {
      ...DEFAULT_CONFIG.storage,
      ...(custom.storage || {}),
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      ...(custom.logging || {}),
    },
    healthServer: {
      ...DEFAULT_CONFIG.healthServer,
      ...(custom.healthServer || {}),
    },
    cloud: {
      ...DEFAULT_CONFIG.cloud,
      ...(custom.cloud || {}),
    },
    drivers: custom.drivers ?? DEFAULT_CONFIG.drivers,
    tagMappings: custom.tagMappings ?? DEFAULT_CONFIG.tagMappings,
  };
}
