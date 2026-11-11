// ELÉTRICAI INDUSTRIAL OS — STANDALONE LINUX EDGE DAEMON
// Process Lifecycle, Graceful Shutdown, SQLite WAL Storage, Drivers & Health HTTP Server
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, POSIX Daemon Standards

import http from "node:http";
import type { EdgeDaemonConfig } from "./config";
import { EdgeLogger, logger } from "./logger";
import { PersistentEdgeOutbox } from "../lib/edge/buffer/sqlite-outbox";
import { MasterEdgeGatewayManager } from "../lib/edge/gateway-manager";
import { OpcUaClientDriver } from "../lib/edge/drivers/opcua-driver";
import { ModbusTcpClientDriver } from "../lib/edge/drivers/modbus-driver";
import { SparkplugBDriver } from "../lib/edge/drivers/sparkplug-driver";
import { IndustrialTagRuntime } from "../lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "../lib/scada/alarm-engine";
import type { GatewayIdentity, IndustrialDriver } from "../lib/edge/types";

export type DaemonState = "INITIALIZING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";

export class EdgeDaemon {
  public readonly config: EdgeDaemonConfig;
  public readonly logger: EdgeLogger;
  private state: DaemonState = "INITIALIZING";
  private outbox!: PersistentEdgeOutbox;
  private runtime!: IndustrialTagRuntime;
  private alarmEngine!: DeterministicAlarmEngine;
  private gatewayManager!: MasterEdgeGatewayManager;
  private drivers: Map<string, IndustrialDriver> = new Map();
  private healthServer?: http.Server;
  private startTime: number = 0;
  private signalTrapsInstalled: boolean = false;

  constructor(config: EdgeDaemonConfig) {
    this.config = config;
    this.logger = new EdgeLogger({
      level: config.logging.level,
      logDir: config.logging.logDir,
      enableConsole: config.logging.console,
    });
  }

  public getState(): DaemonState {
    return this.state;
  }

  public getGatewayManager(): MasterEdgeGatewayManager {
    return this.gatewayManager;
  }

  public getOutbox(): PersistentEdgeOutbox {
    return this.outbox;
  }

  public async initialize(): Promise<void> {
    this.logger.info("Inicializando ElétricAi Edge Daemon...", {
      gatewayId: this.config.gatewayId,
      version: this.config.version,
      plantId: this.config.plantId,
      stationId: this.config.stationId,
    });

    // 1. Initialize Persistent SQLite Outbox with WAL
    this.outbox = new PersistentEdgeOutbox({
      dbPath: this.config.storage.dbPath,
      maxSamples: this.config.storage.maxSamples,
      maxDiskBytes: this.config.storage.maxDiskBytes,
      synchronous: this.config.storage.synchronous,
      saturationPolicy: this.config.storage.saturationPolicy,
    });

    // 2. Initialize Tag Runtime & Alarm Engine
    this.runtime = new IndustrialTagRuntime();
    this.alarmEngine = new DeterministicAlarmEngine();

    // 3. Build Gateway Identity
    const identity: GatewayIdentity = {
      gatewayId: this.config.gatewayId,
      organizationId: this.config.organizationId,
      plantId: this.config.plantId,
      stationId: this.config.stationId,
      gatewayVersion: this.config.version,
      installationId: `inst_${this.config.plantId}_${this.config.stationId}`,
      certificateFingerprint: "sha256:daemon_local_fingerprint",
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      operationalState: "ONLINE",
    };

    // 4. Initialize Master Gateway Manager
    this.gatewayManager = new MasterEdgeGatewayManager({
      identity,
      outbox: this.outbox,
      runtime: this.runtime,
      alarmEngine: this.alarmEngine,
      cloudSyncUrl: this.config.cloud.endpoint,
      syncIntervalMs: this.config.cloud.syncIntervalMs,
    });

    // 5. Initialize configured drivers
    for (const d of this.config.drivers) {
      if (!d.enabled) continue;

      if (d.protocol === "OPC_UA" && d.opcua) {
        const driver = new OpcUaClientDriver({
          driverId: d.id,
          connectionId: d.connectionId,
          endpointUrl: d.opcua.endpointUrl,
          securityPolicy: (d.opcua.securityPolicy as any) ?? "Basic256Sha256",
        });
        this.drivers.set(d.id, driver);
        this.gatewayManager.registerDriver(driver);
      } else if (d.protocol === "MODBUS_TCP" && d.modbus) {
        const driver = new ModbusTcpClientDriver({
          driverId: d.id,
          connectionId: d.connectionId,
          host: d.modbus.host,
          port: d.modbus.port ?? 502,
          unitId: d.modbus.unitId ?? 1,
        });
        this.drivers.set(d.id, driver);
        this.gatewayManager.registerDriver(driver);
      } else if (d.protocol === "MQTT_SPARKPLUG_B" && d.sparkplug) {
        const driver = new SparkplugBDriver({
          driverId: d.id,
          connectionId: d.connectionId,
          brokerUrl: d.sparkplug.brokerUrl,
          clientId: d.sparkplug.clientId,
          groupId: d.sparkplug.groupId,
          edgeNodeId: d.sparkplug.edgeNodeId,
        });
        this.drivers.set(d.id, driver);
        this.gatewayManager.registerDriver(driver);
      }
    }

    // 6. Register tag mappings
    for (const m of this.config.tagMappings) {
      this.gatewayManager.mapTag({
        driverId: m.driverId,
        sourceAddress: m.sourceAddress,
        targetTagName: m.targetTagName,
        projectId: m.projectId,
        equipmentId: m.equipmentId,
      });
    }

    this.installSignalTraps();
  }

  public async start(): Promise<void> {
    if (this.state === "RUNNING") return;

    if (!this.gatewayManager) {
      await this.initialize();
    }

    this.startTime = Date.now();
    this.state = "RUNNING";

    this.logger.info("Iniciando conexões industriais...", {
      activeDriversCount: this.drivers.size,
    });

    // Connect drivers
    for (const [id, driver] of this.drivers.entries()) {
      try {
        await driver.connect();
        this.logger.info(`Driver [${id}] conectado com sucesso ao endpoint [${driver.endpoint}].`);
      } catch (err) {
        this.logger.error(`Falha ao conectar driver [${id}]:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Start Gateway Manager
    this.gatewayManager.start();

    // Start HTTP Health & Diagnostics Server
    if (this.config.healthServer.enabled) {
      await this.startHealthServer();
    }

    this.logger.info("ElétricAi Edge Daemon em operação normal (READ-ONLY STRICT).");
  }

  private startHealthServer(): Promise<void> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        const url = req.url || "/";

        if (url === "/healthz" || url === "/health") {
          const telemetry = this.gatewayManager.getHealthTelemetry();
          const isHealthy = this.state === "RUNNING";

          res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: isHealthy ? "HEALTHY" : "DEGRADED",
              daemonState: this.state,
              version: this.config.version,
              uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
              gatewayId: this.config.gatewayId,
              isPhysicalControlAllowed: false,
              telemetry,
            }),
          );
          return;
        }

        if (url === "/metrics") {
          const stats = this.outbox.getStatistics();
          const uptime = Math.floor((Date.now() - this.startTime) / 1000);

          // Prometheus format
          const metrics = [
            `# HELP eletricai_edge_uptime_seconds Daemon uptime in seconds`,
            `# TYPE eletricai_edge_uptime_seconds gauge`,
            `eletricai_edge_uptime_seconds ${uptime}`,
            `# HELP eletricai_edge_is_physical_control_allowed Permanent physical safety interlock (0 = strictly read-only, physical write blocked)`,
            `# TYPE eletricai_edge_is_physical_control_allowed gauge`,
            `eletricai_edge_is_physical_control_allowed 0`,
            `# HELP eletricai_outbox_stored_total Total samples in persistent outbox`,
            `# TYPE eletricai_outbox_stored_total gauge`,
            `eletricai_outbox_stored_total ${stats.totalSamplesStored}`,
            `# HELP eletricai_outbox_pending_total Pending samples to upload`,
            `# TYPE eletricai_outbox_pending_total gauge`,
            `eletricai_outbox_pending_total ${stats.pendingUploadCount}`,
            `# HELP eletricai_outbox_in_flight_total Samples currently in transmission`,
            `# TYPE eletricai_outbox_in_flight_total gauge`,
            `eletricai_outbox_in_flight_total ${stats.inFlightCount}`,
            `# HELP eletricai_outbox_acknowledged_total Acknowledged samples`,
            `# TYPE eletricai_outbox_acknowledged_total counter`,
            `eletricai_outbox_acknowledged_total ${stats.acknowledgedCount}`,
            `# HELP eletricai_outbox_dropped_total Dropped samples on saturation`,
            `# TYPE eletricai_outbox_dropped_total counter`,
            `eletricai_outbox_dropped_total ${stats.droppedSaturationCount}`,
          ].join("\n");

          res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
          res.end(metrics);
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "NOT_FOUND" }));
      });

      this.healthServer = server;
      server.listen(this.config.healthServer.port, this.config.healthServer.host, () => {
        this.logger.info(
          `Servidor de Health/Métricas ativo em http://${this.config.healthServer.host}:${this.config.healthServer.port}/healthz`,
        );
        resolve();
      });
    });
  }

  public async stop(signal: string = "MANUAL"): Promise<void> {
    if (this.state === "STOPPING" || this.state === "STOPPED") return;
    this.state = "STOPPING";

    this.logger.info(`Encerrando ElétricAi Edge Daemon graciosamente (sinal: ${signal})...`);

    // Close HTTP Server
    if (this.healthServer) {
      await new Promise<void>((resolve) => this.healthServer?.close(() => resolve()));
    }

    // Stop Gateway Manager
    this.gatewayManager.stop();

    // Disconnect drivers
    for (const [id, driver] of this.drivers.entries()) {
      try {
        await driver.disconnect();
      } catch {
        // ignore on stop
      }
    }

    // Flush and truncate WAL on persistent SQLite outbox
    this.outbox.close();

    this.state = "STOPPED";
    this.logger.info("ElétricAi Edge Daemon encerrado com sucesso.");
  }

  private installSignalTraps(): void {
    if (this.signalTrapsInstalled) return;
    this.signalTrapsInstalled = true;

    const shutdownHandler = async (sig: string) => {
      this.logger.info(`Sinal de encerramento do sistema recebido: ${sig}`);
      await this.stop(sig);
      process.exit(0);
    };

    if (typeof process !== "undefined" && process.on) {
      process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
      process.on("SIGINT", () => shutdownHandler("SIGINT"));
      process.on("SIGHUP", () => {
        this.logger.info("SIGHUP recebido: Recarregando configurações...");
      });
    }
  }
}
