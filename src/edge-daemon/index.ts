#!/usr/bin/env node
// ELÉTRICAI INDUSTRIAL OS — STANDALONE LINUX EDGE DAEMON ENTRYPOINT
// Executable Service Entry Point, CLI Arguments & Independent Process Bootstrapper

import { loadEdgeConfig } from "./config";
import { EdgeDaemon } from "./daemon";
import { logger } from "./logger";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
ElétricAi Industrial OS — Master Edge Gateway Daemon
Uso: eletricai-edge [opções]

Opções:
  --config <caminho>   Especifica o arquivo de configuração JSON (padrão: config/edge-gateway.json)
  --version, -v        Exibe a versão do Edge Gateway Daemon
  --health             Consulta o endpoint de health do daemon local
  --help, -h           Exibe esta mensagem de ajuda

Variáveis de Ambiente:
  ELETRICAI_EDGE_CONFIG   Caminho para o arquivo de configuração JSON
  ELETRICAI_LOG_LEVEL     Nível de log (debug, info, warn, error)
`);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("eletricai-edge-daemon v3.1.0-industrial (ARM64/x86_64)");
    process.exit(0);
  }

  let configPath: string | undefined;
  const configIndex = args.indexOf("--config");
  if (configIndex !== -1 && args[configIndex + 1]) {
    configPath = args[configIndex + 1];
  }

  try {
    const config = loadEdgeConfig(configPath);
    const daemon = new EdgeDaemon(config);

    await daemon.initialize();
    await daemon.start();

    logger.info("ElétricAi Edge Daemon rodando como processo independente.");
  } catch (err) {
    logger.error("Erro fatal ao inicializar ElétricAi Edge Daemon:", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

// Execute if run directly from CLI
main().catch((err) => {
  console.error("Unhandled fatal error:", err);
  process.exit(1);
});
