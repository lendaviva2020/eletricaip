import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EdgeDaemon } from "../edge-daemon/daemon";
import { loadConfig } from "../edge-daemon/config";

describe("GATE 3.3A — Standalone Linux Daemon CLI, Configuration & System Lifecycle", () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;
  let daemon: EdgeDaemon | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-bench-daemon-"));
    dbPath = path.join(tempDir, "bench_outbox.db");
    configPath = path.join(tempDir, "gateway-test.json");

    const validConfig = {
      gatewayId: "gw_bench_linux_01",
      organizationId: "org_bench_eletricai",
      plantId: "plant_substation_01",
      stationId: "station_substation_01",
      version: "1.0.0-bench",
      storage: {
        dbPath,
        maxSamples: 10000,
        maxDiskBytes: 50 * 1024 * 1024,
        synchronous: "NORMAL" as const,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
      },
      logging: {
        level: "info" as const,
        console: false,
      },
      healthServer: {
        enabled: true,
        host: "127.0.0.1",
        port: 18090,
      },
      cloud: {
        endpoint: "https://mock-cloud.eletricai.com/v1/sync",
        syncIntervalMs: 500,
        authToken: "bench_secret_auth_token_xyz123",
      },
      drivers: [
        {
          id: "drv_bench_modbus",
          protocol: "MODBUS_TCP" as const,
          connectionId: "conn_modbus_bench",
          enabled: true,
          modbus: {
            host: "127.0.0.1",
            port: 5020,
            unitId: 1,
          },
        },
      ],
      tagMappings: [
        {
          driverId: "drv_bench_modbus",
          sourceAddress: "4x:100",
          targetTagName: "TRANSFORMER_CURRENT_L1",
          projectId: "proj_bench_01",
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2), "utf8");
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop();
      daemon = null;
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Windows file handle release
    }
  });

  describe("1. Configuration Parsing & CLI Validation", () => {
    it("carrega e valida arquivo de configuração JSON com sucesso", () => {
      const config = loadConfig(configPath);
      expect(config.gatewayId).toBe("gw_bench_linux_01");
      expect(config.organizationId).toBe("org_bench_eletricai");
      expect(config.plantId).toBe("plant_substation_01");
      expect(config.healthServer.port).toBe(18090);
      expect(config.drivers.length).toBe(1);
      expect(config.tagMappings.length).toBe(1);
    });

    it("rejeita arquivo de configuração inexistente com erro explícito", () => {
      const nonexistent = path.join(tempDir, "does-not-exist.json");
      expect(() => loadConfig(nonexistent)).toThrow(/CONFIG_FILE_NOT_FOUND/);
    });

    it("rejeita arquivo de configuração JSON corrompido / malformado", () => {
      const corruptPath = path.join(tempDir, "corrupt.json");
      fs.writeFileSync(corruptPath, "{ invalid json content: 123", "utf8");
      expect(() => loadConfig(corruptPath)).toThrow(/CONFIG_PARSE_ERROR/);
    });

    it("rejeita configuração sem campos obrigatórios (gatewayId, organizationId)", () => {
      const incompletePath = path.join(tempDir, "incomplete.json");
      fs.writeFileSync(incompletePath, JSON.stringify({ gatewayId: "gw_only" }), "utf8");
      expect(() => loadConfig(incompletePath)).toThrow(/CONFIG_VALIDATION_ERROR/);
    });
  });

  describe("2. Standalone Daemon Lifecycle & Graceful Shutdown", () => {
    it("inicializa o daemon, abre endpoints HTTP e encerra com SIGTERM gracioso", async () => {
      const config = loadConfig(configPath);
      daemon = new EdgeDaemon(config);

      await daemon.start();
      expect(daemon.getState()).toBe("RUNNING");

      // Valida HTTP Health Check em /healthz
      const healthRes = await fetch("http://127.0.0.1:18090/healthz");
      expect(healthRes.status).toBe(200);
      const healthData = (await healthRes.json()) as any;
      expect(healthData.status).toBe("HEALTHY");
      expect(healthData.isPhysicalControlAllowed).toBe(false);
      expect(healthData.gatewayId).toBe("gw_bench_linux_01");

      // Valida Endpoint Prometheus em /metrics
      const metricsRes = await fetch("http://127.0.0.1:18090/metrics");
      expect(metricsRes.status).toBe(200);
      const metricsText = await metricsRes.text();
      expect(metricsText).toContain("eletricai_edge_uptime_seconds");
      expect(metricsText).toContain("eletricai_edge_is_physical_control_allowed 0");

      // Encerramento gracioso
      await daemon.stop();
      expect(daemon.getState()).toBe("STOPPED");
    });
  });

  describe("3. Binary Integrity Verification", () => {
    it("valida integridade dos artefatos compilados no diretório dist-edge/", () => {
      const distDir = path.resolve(process.cwd(), "dist-edge");
      expect(fs.existsSync(distDir)).toBe(true);

      const linuxX64 = path.join(distDir, "eletricai-edge-daemon-linux-x64");
      const linuxArm64 = path.join(distDir, "eletricai-edge-daemon-linux-arm64");
      const jsBundle = path.join(distDir, "eletricai-edge-daemon.js");

      expect(fs.existsSync(linuxX64)).toBe(true);
      expect(fs.existsSync(linuxArm64)).toBe(true);
      expect(fs.existsSync(jsBundle)).toBe(true);

      const statX64 = fs.statSync(linuxX64);
      const statArm64 = fs.statSync(linuxArm64);
      const statJs = fs.statSync(jsBundle);

      expect(statX64.size).toBeGreaterThan(70 * 1024 * 1024); // Standalone binary with embedded runtime
      expect(statArm64.size).toBeGreaterThan(70 * 1024 * 1024);
      expect(statJs.size).toBeGreaterThan(50 * 1024); // JS bundle >50KB
    });
  });
});
