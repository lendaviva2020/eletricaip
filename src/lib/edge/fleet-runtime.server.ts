// ELÉTRICAI INDUSTRIAL OS — PERSISTENT SERVER FLEET RUNTIME WIRING (SERVER-ONLY)
// Connects all Fleet singletons (`cloudGatewayRegistry`, `edgeFleetManager`, `fleetAuditManager`,
// `fleetCertificateManager`, `remoteConfigManager`, `signedUpdateManager`, `edgeProvisioningService`)
// to either:
//   - Authoritative Cloud PostgreSQL (`SupabaseFleetStorageBackend`) in multi-instance serverless Cloud
//   - Local disk `SqliteFleetStorageBackend` (WAL) strictly for local dev / Edge / explicit single-node volume / isolated tests
// Fails CLOSED in serverless Cloud (`VERCEL=1` / `VERCEL_ENV=production`) if Cloud DB credentials are missing.

import { isSupabaseAdminConfigured } from "@/integrations/supabase/client.server";
import { cloudGatewayRegistry, CloudGatewayRegistry } from "./cloud-gateway-registry";
import { fleetAuditManager, FleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager, FleetCertificateManager } from "./fleet-certificates";
import { edgeFleetManager, EdgeFleetManager } from "./fleet-manager";
import {
  createSqliteFleetStorage,
  resolveDefaultFleetDbPath,
  SqliteFleetStorageBackend,
} from "./fleet-persistent-store.server";
import { SupabaseFleetStorageBackend } from "./fleet-supabase-store.server";
import { EdgeProvisioningService } from "./provisioning";
import { remoteConfigManager, RemoteConfigManager } from "./remote-config";
import { signedUpdateManager, SignedUpdateManager } from "./signed-updates";
import type { AsyncFleetStorageBackend, FleetAuditEvent } from "./types";

export type FleetStorageBackendMode = "supabase_postgresql" | "sqlite_wal" | "sqlite_memory";

let activeStore: SqliteFleetStorageBackend | undefined;
let activeCloudStore: SupabaseFleetStorageBackend | undefined;
let initialized = false;

export function isServerlessCloudRuntime(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  return process.env["VERCEL"] === "1" || process.env["VERCEL_ENV"] === "production";
}

export function getFleetStorageBackendMode(): FleetStorageBackendMode {
  const proc = typeof process !== "undefined" && process.env ? process.env : {};
  const explicit = proc["ELETRICAI_FLEET_STORAGE_BACKEND"]?.trim().toLowerCase();
  const explicitDbPath = proc["ELETRICAI_FLEET_DB_PATH"]?.trim();
  const isVitest = Boolean(proc["VITEST"]);

  if (explicit === "supabase") {
    return "supabase_postgresql";
  }

  if (explicit !== "sqlite" && isServerlessCloudRuntime() && !explicitDbPath) {
    if (!isSupabaseAdminConfigured()) {
      throw new Error(
        "CLOUD_PERSISTENCE_UNCONFIGURED: Serverless Cloud requires SUPABASE_SERVICE_ROLE_KEY for authoritative PostgreSQL persistence; ephemeral SQLite fallback is prohibited.",
      );
    }
    return "supabase_postgresql";
  }

  // Non-test Cloud environments with Supabase Admin configured should prefer PostgreSQL unless SQLite is explicitly chosen
  if (
    !isVitest &&
    explicit !== "sqlite" &&
    !explicitDbPath &&
    proc["NODE_ENV"] === "production" &&
    isSupabaseAdminConfigured()
  ) {
    return "supabase_postgresql";
  }

  return resolveDefaultFleetDbPath() === ":memory:" ? "sqlite_memory" : "sqlite_wal";
}

export function getCloudSupabaseFleetStore(): AsyncFleetStorageBackend | undefined {
  const mode = getFleetStorageBackendMode();
  if (mode !== "supabase_postgresql") return undefined;
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "CLOUD_PERSISTENCE_UNCONFIGURED: SUPABASE_SERVICE_ROLE_KEY ausente para SupabaseFleetStorageBackend.",
    );
  }
  if (!activeCloudStore) {
    activeCloudStore = new SupabaseFleetStorageBackend();
  }
  return activeCloudStore;
}

export function ensurePersistentFleetRuntime(): SqliteFleetStorageBackend {
  const mode = getFleetStorageBackendMode();
  if (mode === "supabase_postgresql" && isServerlessCloudRuntime()) {
    throw new Error(
      "CLOUD_SYNC_SQLITE_FORBIDDEN: Operação síncrona em SQLite efêmero bloqueada em Cloud serverless; utilize ensurePersistentFleetRuntimeAsync().",
    );
  }

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
 * Ideal for cold-start recovery & multi-instance WAL tests without touching global server singletons.
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

/**
 * Hydrates a fresh isolated Fleet container from authoritative Cloud PostgreSQL (`AsyncFleetStorageBackend`),
 * executes `fn`, and commits all newly generated state & audit events atomically back to PostgreSQL.
 * Guarantees multi-instance serverless consistency with zero stale in-memory cache leakage.
 */
export async function withCloudFleetRuntimeAsync<T>(
  cloudStore: AsyncFleetStorageBackend,
  fn: (container: PersistentFleetContainer) => Promise<T> | T,
  options?: {
    configSigningSecret?: string;
    releasePublicKeysByKeyId?: Record<string, string>;
    releasePrivateKeyPem?: string;
  },
): Promise<T> {
  const workingStore = createSqliteFleetStorage(":memory:");
  try {
    const [
      auditEvents,
      registeredGateways,
      fleetGateways,
      certificates,
      remoteConfigs,
      otaCampaigns,
      otaSigningKeys,
      provisioningState,
    ] = await Promise.all([
      cloudStore.loadAuditEvents(),
      cloudStore.loadRegisteredGateways(),
      cloudStore.loadFleetGateways(),
      cloudStore.loadCertificates(),
      cloudStore.loadRemoteConfigs(),
      cloudStore.loadOtaCampaigns(),
      cloudStore.loadOtaSigningKeys(),
      cloudStore.loadProvisioningState(),
    ]);

    const initialAuditCount = auditEvents.length;
    if (auditEvents.length > 0) {
      let prev = "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";
      for (const ev of auditEvents) {
        workingStore.appendAuditEvent(ev, prev);
        prev = ev.tamperProofHash;
      }
    }
    for (const rg of registeredGateways) {
      workingStore.saveRegisteredGateway(rg.gateway, rg.authTokenDigest, rg.lastBatchSequence);
    }
    for (const fg of fleetGateways) {
      workingStore.saveFleetGateway(fg);
    }
    for (const c of certificates) {
      workingStore.saveCertificate(c.gatewayId, c.cert, c.popKey);
    }
    for (const [gwId, entry] of Object.entries(remoteConfigs)) {
      for (const cfg of entry.history) {
        workingStore.appendRemoteConfigMonotonic(gwId, cfg);
      }
      if (entry.lkgc) {
        workingStore.setLkgcConfig(gwId, entry.lkgc);
      }
    }
    for (const [cmpId, cmp] of Object.entries(otaCampaigns)) {
      const typed = cmp as { organizationId?: string; targetPlantId?: string };
      workingStore.saveOtaCampaign(
        cmpId,
        typed.organizationId ?? "org_sp_industrial",
        typed.targetPlantId ?? "plant_ete_central",
        cmp,
      );
    }
    for (const k of otaSigningKeys) {
      workingStore.saveOtaSigningKey(k);
    }
    for (const tok of provisioningState.tokens) {
      workingStore.saveProvisioningToken(tok);
    }

    const auditManager = new FleetAuditManager({ store: workingStore });
    const registry = new CloudGatewayRegistry({ store: workingStore });
    const certManager = new FleetCertificateManager({
      store: workingStore,
      auditManager,
      registry,
    });
    const fleetManager = new EdgeFleetManager({
      store: workingStore,
      auditManager,
      certManager,
    });
    const configManager = new RemoteConfigManager({
      signingSecret: options?.configSigningSecret,
      store: workingStore,
      auditManager,
    });
    const updateManager = new SignedUpdateManager({
      publicKeysByKeyId: options?.releasePublicKeysByKeyId,
      privateSigningKeyPem: options?.releasePrivateKeyPem,
      store: workingStore,
      auditManager,
    });
    const provisioningService = new EdgeProvisioningService({ store: workingStore });

    // Persist first-boot defaults if PostgreSQL tables were empty
    if (fleetGateways.length === 0) {
      for (const fg of workingStore.loadFleetGateways()) {
        await cloudStore.saveFleetGateway(fg);
      }
    }
    if (registeredGateways.length === 0) {
      for (const rg of workingStore.loadRegisteredGateways()) {
        await cloudStore.saveRegisteredGateway(
          rg.gateway,
          rg.authTokenDigest,
          rg.lastBatchSequence,
        );
      }
    }
    if (certificates.length === 0) {
      for (const c of workingStore.loadCertificates()) {
        await cloudStore.saveCertificate(c.gatewayId, c.cert, c.popKey);
      }
    }

    const container: PersistentFleetContainer = {
      store: workingStore,
      auditManager,
      registry,
      certManager,
      fleetManager,
      configManager,
      updateManager,
      provisioningService,
      close: () => workingStore.close(),
    };

    const result = await fn(container);

    // Flush authoritative state changes to PostgreSQL
    const priorSeqByGw = new Map<string, number>();
    for (const rg of registeredGateways) {
      priorSeqByGw.set(rg.gateway.gatewayId, rg.lastBatchSequence);
    }

    for (const fg of workingStore.loadFleetGateways()) {
      await cloudStore.saveFleetGateway(fg);
    }
    for (const rg of workingStore.loadRegisteredGateways()) {
      await cloudStore.saveRegisteredGateway(rg.gateway, rg.authTokenDigest, rg.lastBatchSequence);
      const prevSeq = priorSeqByGw.get(rg.gateway.gatewayId) ?? 0;
      const latestSamples = workingStore.loadLatestTelemetryForGateway(rg.gateway.gatewayId);
      if (latestSamples.length > 0 || rg.lastBatchSequence > prevSeq) {
        const dedupKeys = latestSamples.map(
          (s) => `${rg.gateway.gatewayId}:${s.tagName}:${s.sourceTimestamp}`,
        );
        await cloudStore.recordIngestedBatchAtomic({
          gatewayId: rg.gateway.gatewayId,
          organizationId: rg.gateway.organizationId,
          plantId: rg.gateway.plantId,
          expectedMinSequence: prevSeq,
          newSequence: rg.lastBatchSequence,
          acceptedSamples: latestSamples,
          dedupKeys,
        });
      }
    }
    for (const c of workingStore.loadCertificates()) {
      await cloudStore.saveCertificate(c.gatewayId, c.cert, c.popKey);
    }
    const nextRemote = workingStore.loadRemoteConfigs();
    for (const [gwId, entry] of Object.entries(nextRemote)) {
      const priorVersions = new Set(
        (remoteConfigs[gwId]?.history ?? []).map((h) => h.configVersion),
      );
      for (const cfg of entry.history) {
        if (!priorVersions.has(cfg.configVersion)) {
          await cloudStore.appendRemoteConfigMonotonic(gwId, cfg);
        }
      }
      if (entry.lkgc && entry.lkgc.configVersion !== remoteConfigs[gwId]?.lkgc?.configVersion) {
        await cloudStore.setLkgcConfig(gwId, entry.lkgc);
      }
    }
    const nextCampaigns = workingStore.loadOtaCampaigns();
    for (const [cmpId, cmp] of Object.entries(nextCampaigns)) {
      const typed = cmp as { organizationId?: string; targetPlantId?: string };
      await cloudStore.saveOtaCampaign(
        cmpId,
        typed.organizationId ?? "org_sp_industrial",
        typed.targetPlantId ?? "plant_ete_central",
        cmp,
      );
    }
    for (const k of workingStore.loadOtaSigningKeys()) {
      await cloudStore.saveOtaSigningKey(k);
    }

    // Flush newly emitted audit blocks atomically with tip re-sync on concurrent conflict
    const allWorkingAudit = workingStore.loadAuditEvents();
    const newEvents: FleetAuditEvent[] = allWorkingAudit.slice(initialAuditCount);
    for (const ev of newEvents) {
      let attemptEv = { ...ev };
      let committed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const expectedPrev =
          attemptEv.previousHash ?? "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";
        const res = await cloudStore.appendAuditEventAtomic(attemptEv, expectedPrev);
        if (res.accepted) {
          committed = true;
          break;
        }
        // Another Cloud instance appended concurrently: recompute hash against authoritative PostgreSQL tip
        const recomputedHash = auditManager.recomputeHashForTip(res.currentTipHash, attemptEv);
        attemptEv = {
          ...attemptEv,
          previousHash: res.currentTipHash,
          tamperProofHash: recomputedHash,
        };
      }
      if (!committed) {
        throw new Error(
          `CLOUD_AUDIT_ATOMIC_APPEND_FAILED: Conflito persistente ao gravar evento ${ev.id} em PostgreSQL.`,
        );
      }
    }

    return result;
  } finally {
    workingStore.close();
  }
}

export function resetFleetRuntimeForTesting(): void {
  activeStore?.close();
  activeStore = undefined;
  activeCloudStore = undefined;
  initialized = false;
}
