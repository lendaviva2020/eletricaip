#!/usr/bin/env node
// ElétricAi Runtime — processo do gateway (PC, Raspberry Pi, gateway Linux).
//
// Configuração SÓ por variáveis de ambiente locais do gateway (nunca no código):
//   ELETRICAI_CLOUD_URL      https://<seu app>          (opcional: sem ela, modo offline)
//   ELETRICAI_DEVICE_TOKEN   token do dispositivo, criado no editor CLP → Runtime
//   ELETRICAI_LOCAL_PIN      PIN do WebVisu (≥ 6 caracteres) — obrigatório
//   ELETRICAI_WEBVISU_HOST   padrão 0.0.0.0 (rede interna)   ELETRICAI_WEBVISU_PORT padrão 8080
//   ELETRICAI_TLS_CERT / ELETRICAI_TLS_KEY   caminhos opcionais para HTTPS local
//   ELETRICAI_STATE_DIR      padrão ./eletricai-runtime-state (cache do pacote aprovado)
//   ELETRICAI_PACKAGE_FILE + ELETRICAI_PACKAGE_HASH   pacote exportado (sem nuvem: só SOMBRA)
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { RuntimeDaemon } from "@/lib/runtime/node/runtime-daemon";
import { createWebVisuServer, MIN_PIN_LENGTH } from "@/lib/runtime/node/webvisu-server";
import { CloudLink, loadCachedPackage } from "@/lib/runtime/node/cloud-link";
import { verifyRuntimePackage } from "@/lib/runtime/program-package";

const SYNC_MS = 5000;

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function log(level: "INFO" | "WARN" | "ERROR", msg: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(
    `${JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra })}\n`,
  );
}

async function main(): Promise<void> {
  const pin = env("ELETRICAI_LOCAL_PIN");
  if (!pin || pin.length < MIN_PIN_LENGTH) {
    log("ERROR", `defina ELETRICAI_LOCAL_PIN com pelo menos ${MIN_PIN_LENGTH} caracteres`);
    process.exit(2);
  }
  const stateDir = env("ELETRICAI_STATE_DIR") ?? "./eletricai-runtime-state";
  const daemon = new RuntimeDaemon(undefined, (e) =>
    log(e.kind === "SAFE" ? "WARN" : "INFO", e.message, { event: e.kind }),
  );

  const file = env("ELETRICAI_PACKAGE_FILE");
  if (file) {
    const hash = env("ELETRICAI_PACKAGE_HASH") ?? "";
    const v = await verifyRuntimePackage(JSON.parse(await readFile(file, "utf8")), hash);
    if (!v.ok) {
      log("ERROR", `pacote local recusado: ${v.error}`);
      process.exit(3);
    }
    // Sem nuvem não há como conferir a aprovação: fica em SOMBRA.
    await daemon.offerPackage(v.pkg, false);
  } else {
    const cached = await loadCachedPackage(stateDir);
    if (cached) await daemon.offerPackage(cached.pkg, cached.approved);
  }
  daemon.start();

  const certPath = env("ELETRICAI_TLS_CERT");
  const keyPath = env("ELETRICAI_TLS_KEY");
  const web = createWebVisuServer(daemon, {
    host: env("ELETRICAI_WEBVISU_HOST") ?? "0.0.0.0",
    port: Number(env("ELETRICAI_WEBVISU_PORT") ?? 8080),
    pin,
    tls:
      certPath && keyPath
        ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
        : undefined,
  });
  const port = await web.listen();
  log("INFO", `WebVisu em ${certPath ? "https" : "http"}://<ip do gateway>:${port}`);

  const cloudUrl = env("ELETRICAI_CLOUD_URL");
  const token = env("ELETRICAI_DEVICE_TOKEN");
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  if (cloudUrl && token) {
    const link = new CloudLink(daemon, { cloudUrl, token, stateDir });
    const loop = async () => {
      await link.sync();
      if (link.lastError) log("WARN", `nuvem: ${link.lastError}`);
      syncTimer = setTimeout(loop, SYNC_MS);
    };
    void loop();
  } else {
    log("WARN", "sem ELETRICAI_CLOUD_URL/ELETRICAI_DEVICE_TOKEN: modo offline");
  }

  const shutdown = (sig: string) => {
    log("INFO", `${sig}: parando — saídas no valor seguro`);
    daemon.disarm(`processo encerrado (${sig})`);
    if (syncTimer) clearTimeout(syncTimer);
    // Dá tempo para os valores seguros saírem antes de fechar as conexões.
    setTimeout(() => {
      daemon.stop();
      void web.close().then(() => process.exit(0));
    }, 500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  log("ERROR", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
