// Verificação dos artefatos de release do ElétricAi Edge Daemon.
// Rodar DEPOIS de `bun run build:edge:all` (pipeline de release).
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.cwd(), "dist-edge");
const expected = [
  ["eletricai-edge-daemon-linux-x64", 70 * 1024 * 1024],
  ["eletricai-edge-daemon-linux-arm64", 70 * 1024 * 1024],
  ["eletricai-edge-daemon.js", 50 * 1024],
];
let failed = false;
for (const [name, minBytes] of expected) {
  const file = path.join(dist, name);
  if (!fs.existsSync(file)) {
    console.error(`FALTA: ${file}`);
    failed = true;
    continue;
  }
  const size = fs.statSync(file).size;
  if (size < minBytes) {
    console.error(`PEQUENO DEMAIS: ${name} tem ${size} bytes (mínimo ${minBytes})`);
    failed = true;
  } else {
    console.log(`OK ${name} (${(size / 1048576).toFixed(1)} MB)`);
  }
}
process.exit(failed ? 1 : 0);
