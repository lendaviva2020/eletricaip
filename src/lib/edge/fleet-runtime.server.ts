// ELÉTRICAI INDUSTRIAL OS — PERSISTENT SERVER FLEET RUNTIME WIRING (SERVER-ONLY)
// Connects all Fleet singletons (`cloudGatewayRegistry`, `edgeFleetManager`, `fleetAuditManager`,
// `fleetCertificateManager`, `remoteConfigManager`, `signedUpdateManager`, `edgeProvisioningService`)
// to one authoritative `SqliteFleetStorageBackend` in WAL mode.
// Isolated in `.server.ts` so browser client bundles never pull `node:sqlite` or `node:fs`.

import { cloudGatewayRegistry, CloudGatewayRegistry } from "./cloud-gateway-registry";
import { fleetAuditManager, FleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager, FleetCertificateManager } from "./fleet-certificates";
import { edgeFleetManager, EdgeFleetManager } from "./fleet-manager";
import {
  createSqliteFleetStorage,
  resolveDefaultFleetDbPath,
  SqliteFleetStorageBackend,
} from "./fleet-persistent-store.server";
import { EdgeProvisioningService } from "./provisioning";
import { remoteConfigManager, RemoteConfigManager } from "./remote-config";
import { signedUpdateManager, SignedUpdateManager } from "./signed-updates";

let activeStore: SqliteFleetStorageBackend | undefined;
let initialized = false;

export function ensurePersistentFleetRuntime(): SqliteFleetStorageBackend {
  if (initialized && activeStore) {
    return activeStore;
  }

  const dbPath = resolveDefaultFleetDbPath();
  const store = createSqliteFleetStorage(dbPath);
  fleetAuditManager.attachStorageBackend(store);
  cloudGatewayRegistry.attachStorageBackend(store);
  fleetCertificateManager.attachStorageBackend(store);
  edgeFleetManager.attachStorageBackend(store);
  remoteConfigManager.attachStorageBackend(store);
  signedUpdateManager.attachStorageBackend(store);

  activeStore = store;
  initialized = true;
  return store;
}

export interface PersistentFleetContainer {
  store: SqliteFleetStorageBackend;
  auditManager: FleetAuditManager;
  registry: CloudGatewayRegistry;
  certManager: FleetCertificateManager;
  fleetManager: EdgeFleetManager;
  configManager: RemoteConfigManager;
  updateManager: SignedUpdateManager;
  provisioningService: EdgeProvisioningService;
  close: () => void;
}

/**
 * Instantiates a completely isolated cohesive Fleet container backed by the given SQLite DB path.
 * Ideal for cold-start recovery tests without touching global server singletons.
 */
export function createIsolatedPersistentFleetContainer(
  dbPath: string,
  options?: {
    configSigningSecret?: string;
    releasePublicKeysByKeyId?: Record<string, string>;
    releasePrivateKeyPem?: string;
  },
): PersistentFleetContainer {
  const store = createSqliteFleetStorage(dbPath);
  const auditManager = new FleetAuditManager({ store });
  const registry = new CloudGatewayRegistry({ store });
  const certManager = new FleetCertificateManager({ store, auditManager, registry });
  const fleetManager = new EdgeFleetManager({ store, auditManager, certManager });
  const configManager = new RemoteConfigManager({
    signingSecret: options?.configSigningSecret,
    store,
    auditManager,
  });
  const updateManager = new SignedUpdateManager({
    publicKeysByKeyId: options?.releasePublicKeysByKeyId,
    privateSigningKeyPem: options?.releasePrivateKeyPem,
    store,
    auditManager,
  });
  const provisioningService = new EdgeProvisioningService({ store });

  return {
    store,
    auditManager,
    registry,
    certManager,
    fleetManager,
    configManager,
    updateManager,
    provisioningService,
    close: () => store.close(),
  };
}
