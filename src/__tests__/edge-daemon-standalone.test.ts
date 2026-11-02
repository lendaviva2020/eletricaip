// ELÉTRICAI INDUSTRIAL OS — GATE 3.1A STANDALONE DAEMON HOMOLOGATION
// Verification of Autonomous Linux Daemon, Health HTTP Server, Secret Redaction & Lifecycle
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, POSIX Daemon Standards

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EdgeDaemon } from "@/edge-daemon/daemon";
import { EdgeLogger } from "@/edge-daemon/logger";
import { DEFAULT_CONFIG, type EdgeDaemonConfig } from "@/edge-daemon/config";

describe("GATE 3.1A — Autonomous Linux Edge Daemon Homologation", () => {
  const testBaseDir = path.resolve(process.cwd(), "data/test_daemon_runs");
  let daemon: EdgeDaemon;
  let currentPort: number;

  beforeEach(() => {
    if (!fs.existsSync(testBaseDir)) {
      fs.mkdirSync(testBaseDir, { recursive: true });
    }

    currentPort = 9100 + Math.floor(Math.random() * 500);
    const uniqueId = crypto.randomUUID().substring(0, 8);
    const testDbPath = path.join(testBaseDir, `outbox_${uniqueId}.db`);

    const config: EdgeDaemonConfig = {
      ...DEFAULT_CONFIG,
      gatewayId: `egw_test_daemon_${uniqueId}`,
      storage: {
        ...DEFAULT_CONFIG.storage,
        dbPath: testDbPath,
      },
      logging: {
        level: "debug",
        console: false, // Suppress test noise
      },
      healthServer: {
        enabled: true,
        host: "127.0.0.1",
        port: currentPort,
      },
      drivers: [
        {
          id: "drv_modbus_lab",
          protocol: "MODBUS_TCP",
          connectionId: "conn_modbus_lab",
          enabled: true,
          modbus: {
            host: "127.0.0.1",
            port: 50299,
          },
        },
      ],
      tagMappings: [
        {
          driverId: "drv_modbus_lab",
          sourceAddress: "40001",
          targetTagName: "PUMP_01_PRESSAO",
          projectId: "proj_lab",
        },
      ],
    };

    daemon = new EdgeDaemon(config);
  });

  afterEach(async () => {
    if (daemon && daemon.getState() === "RUNNING") {
      await daemon.stop("TEST_CLEANUP");
    }
  });

  afterAll(() => {
    if (fs.existsSync(testBaseDir)) {
      try {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      } catch {
        // Safe cleanup on Windows
      }
    }
  });

  it("1. Executável Independente: Inicializa e transiciona para RUNNING sem depender de React ou Vite", async () => {
    expect(daemon.getState()).toBe("INITIALIZING");

    await daemon.initialize();
    expect(daemon.getState()).toBe("INITIALIZING");

    await daemon.start();
    expect(daemon.getState()).toBe("RUNNING");
    expect(daemon.config.gatewayId).toContain("egw_test_daemon_");
  });

  it("2. Health Check Server: Responde 200 OK em /healthz com telemetria e bloqueio físico estrito", async () => {
    await daemon.initialize();
    await daemon.start();

    const response = await new Promise<{ statusCode: number; body: any }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${currentPort}/healthz`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode || 0,
              body: JSON.parse(data),
            });
          });
        })
        .on("error", reject);
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("HEALTHY");
    expect(response.body.daemonState).toBe("RUNNING");
    expect(response.body.isPhysicalControlAllowed).toBe(false);
    expect(response.body.version).toBe("3.1.0-industrial");
    expect(response.body.telemetry).toBeDefined();
    expect(response.body.telemetry.gatewayId).toContain("egw_test_daemon_");
  });

  it("3. Prometheus Metrics: Responde 200 OK em /metrics com contadores do outbox e uptime", async () => {
    await daemon.initialize();
    await daemon.start();

    const response = await new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${currentPort}/metrics`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode || 0,
              text: data,
            });
          });
        })
        .on("error", reject);
    });

    expect(response.statusCode).toBe(200);
    expect(response.text).toContain("eletricai_edge_uptime_seconds");
    expect(response.text).toContain("eletricai_outbox_stored_total");
    expect(response.text).toContain("eletricai_outbox_pending_total");
  });

  it("4. Proteção de Segredos em Logs (IEC 62443): Mascara tokens, senhas e chaves privadas", () => {
    const logger = new EdgeLogger({ enableConsole: false });

    const rawToken = "EGW-PROV-A1B2C3D4E5F67890";
    const rawAuth = "egw_sec_0123456789abcdef0123456789abcdef";
    const rawPass = 'password="super_secret_industrial_pass"';
    const rawPem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";

    const sanitizedToken = logger.redactSecrets(`Tentativa de uso de token ${rawToken}`);
    const sanitizedAuth = logger.redactSecrets(`Sessão autenticada com ${rawAuth}`);
    const sanitizedPass = logger.redactSecrets(`Configuração recebida: ${rawPass}`);
    const sanitizedPem = logger.redactSecrets(`Carregando certificado: ${rawPem}`);

    expect(sanitizedToken).not.toContain(rawToken);
    expect(sanitizedToken).toContain("[REDACTED_PROVISIONING_TOKEN]");

    expect(sanitizedAuth).not.toContain(rawAuth);
    expect(sanitizedAuth).toContain("[REDACTED_AUTH_TOKEN]");

    expect(sanitizedPass).not.toContain("super_secret_industrial_pass");
    expect(sanitizedPass).toContain('password="[REDACTED]"');

    expect(sanitizedPem).not.toContain("MIIEowIBAAKCAQEA");
    expect(sanitizedPem).toContain("[REDACTED_PRIVATE_KEY]");
  });

  it("5. Encerramento Gracioso (Graceful Shutdown): Fecha HTTP, desconecta drivers e encerra WAL", async () => {
    await daemon.initialize();
    await daemon.start();

    expect(daemon.getState()).toBe("RUNNING");

    await daemon.stop("SIGTERM");
    expect(daemon.getState()).toBe("STOPPED");

    // Verify health server is closed
    await expect(
      new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${currentPort}/healthz`, resolve);
        req.on("error", reject);
      })
    ).rejects.toThrow();
  });
});
