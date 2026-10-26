import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Users\\98911\\AppData\\Local\\ms-playwright\\chromium-1194\\chrome-win\\chrome.exe";
const FFMPEG_PATH = "C:\\Users\\98911\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe";
const TARGET_URL = "http://localhost:8080/workspace?projectId=00000000-0000-4000-a000-000000000001";
const FRAMES_DIR = path.resolve("./temp-recording-frames");
const OUTPUT_VIDEO = path.resolve("./public/media/eletricai-demo.webm");
const POSTER_IMAGE = path.resolve("./public/media/eletricai-demo-poster.jpg");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== INICIANDO GRAVAÇÃO REAL DO ELÉTRICAI ===");

  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  // Limpa frames antigos
  for (const file of fs.readdirSync(FRAMES_DIR)) {
    fs.unlinkSync(path.join(FRAMES_DIR, file));
  }

  // 1. Inicia Chrome Headless com porta de depuração
  console.log("Iniciando Chromium em 1280x720...");
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      "--window-size=1280,720",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--disable-gpu",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);

  // 2. Abre a aba diretamente no workspace via HTTP PUT
  console.log("Criando aba em:", TARGET_URL);
  const putRes = await fetch("http://localhost:9222/json/new?" + encodeURIComponent(TARGET_URL), {
    method: "PUT",
  });
  const tabData = await putRes.json();
  const wsUrl = tabData.webSocketDebuggerUrl;
  console.log("Conectado diretamente à página via WebSocket:", wsUrl);

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  await new Promise((res) => ws.once("open", res));

  console.log("Configurando viewport para 1280x720 e habilitando Page...");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await call("Page.enable");
  await call("Runtime.enable");

  // Aguarda carregamento do aplicativo
  console.log("Aguardando carregamento da interface e canvas...");
  await sleep(4000);

  // Injeta circuito de teste profissional industrial se estiver vazio
  console.log("Populando diagrama com circuito industrial real (Alimentação, QF1, KM1, FR1, Motor)...");
  await call("Runtime.evaluate", {
    expression: `
      (async () => {
        try {
          const { useDiagramStore } = await import('/src/lib/diagram/store.ts');
          const { convertBundleToDiagramDoc } = await import('/src/lib/importer/universal-importer.ts');
          
          const industrialCircuit = {
            format: "eletricai.canvas-bundle",
            schemaVersion: "1.0.0",
            project: {
              name: "Quadro de Distribuição Geral - CCM Linha 03",
              diagramType: "unifilar"
            },
            nodes: [
              { id: "ALIM-01", type: "supply", position: { x: 180, y: 70 }, properties: { tag: "REDE-380V", voltage_V: 380 } },
              { id: "BAR-01", type: "busbar", position: { x: 180, y: 150 }, properties: { tag: "BARRAMENTO-GERAL", current_A: 250, voltage_V: 380 } },
              { id: "DJ-GERAL", type: "breaker", position: { x: 180, y: 250 }, properties: { tag: "QF-01", in_A: 63, curve: "C", poles: 3 } },
              { id: "KM-MOTOR", type: "contactor", position: { x: 180, y: 350 }, properties: { tag: "KM-01", in_A: 32, coil_V: 24 } },
              { id: "REL-TERM", type: "relay", position: { x: 180, y: 450 }, properties: { tag: "FR-01", in_A: 28 } },
              { id: "MOT-01", type: "motor", position: { x: 180, y: 550 }, properties: { tag: "M-01", power_kW: 7.5, voltage_V: 380, poles: 4 } },

              { id: "DJ-RAMAL2", type: "breaker", position: { x: 380, y: 250 }, properties: { tag: "QF-02", in_A: 20, curve: "B", poles: 2 } },
              { id: "TR-01", type: "transformer", position: { x: 380, y: 350 }, properties: { tag: "TR-24V", power_kVA: 1.5, primary_V: 380, secondary_V: 24 } }
            ],
            edges: [
              { id: "e1", from: "ALIM-01", to: "BAR-01" },
              { id: "e2", from: "BAR-01", to: "DJ-GERAL" },
              { id: "e3", from: "DJ-GERAL", to: "KM-MOTOR" },
              { id: "e4", from: "KM-MOTOR", to: "REL-TERM" },
              { id: "e5", from: "REL-TERM", to: "MOT-01" },
              { id: "e6", from: "BAR-01", to: "DJ-RAMAL2" },
              { id: "e7", from: "DJ-RAMAL2", to: "TR-01" }
            ]
          };

          const doc = convertBundleToDiagramDoc(industrialCircuit);
          useDiagramStore.getState().loadDoc(doc);
          console.log("[DemoRecorder] Circuito industrial injetado!");
        } catch(e) {
          console.error("[DemoRecorder] Falha ao injetar circuito:", e);
        }
      })()
    `,
    awaitPromise: true,
  });

  await sleep(2500);

  // Captura o Poster Oficial
  console.log("Capturando poster de alta definição...");
  const posterRes = await call("Page.captureScreenshot", { format: "jpeg", quality: 90 });
  fs.writeFileSync(POSTER_IMAGE, Buffer.from(posterRes.data, "base64"));
  console.log("Poster salvo com sucesso em:", POSTER_IMAGE);

  let frameIndex = 0;
  async function recordFrame() {
    const res = await call("Page.captureScreenshot", { format: "jpeg", quality: 80 });
    const filename = `frame_${String(frameIndex++).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(FRAMES_DIR, filename), Buffer.from(res.data, "base64"));
  }

  console.log("Iniciando gravação de cenas do roteiro técnico real...");

  // CENA 1: Visão Geral do Canvas Unifilar (0s - 6s, 40 frames)
  console.log("Gravando Cena 1: Visão Geral do Workspace e Unifilar...");
  for (let i = 0; i < 40; i++) {
    await recordFrame();
    await sleep(65);
  }

  // CENA 2: Seleção do Disjuntor QF-01 e Inspeção de Propriedades (6s - 13s, 45 frames)
  console.log("Gravando Cena 2: Seleção de Disjuntor QF-01 e Painel de Propriedades...");
  await call("Runtime.evaluate", {
    expression: `
      (async () => {
        const { useDiagramStore } = await import('/src/lib/diagram/store.ts');
        useDiagramStore.getState().setSelection(["DJ-GERAL"]);
      })()
    `,
    awaitPromise: true,
  });

  for (let i = 0; i < 45; i++) {
    await recordFrame();
    await sleep(65);
  }

  // CENA 3: Seleção do Contator KM-01 e Motor Trifásico 7.5kW (13s - 19s, 40 frames)
  console.log("Gravando Cena 3: Inspeção de Contator KM-01 e Motor Trifásico 7.5kW...");
  await call("Runtime.evaluate", {
    expression: `
      (async () => {
        const { useDiagramStore } = await import('/src/lib/diagram/store.ts');
        useDiagramStore.getState().setSelection(["KM-MOTOR", "MOT-01"]);
      })()
    `,
    awaitPromise: true,
  });

  for (let i = 0; i < 40; i++) {
    await recordFrame();
    await sleep(65);
  }

  // CENA 4: Abertura do Dossiê Técnico de Engenharia e Lista de Materiais (19s - 27s, 50 frames)
  console.log("Gravando Cena 4: Abertura e Visualização do Dossiê de Engenharia (BOM)...");
  await call("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const dossierBtn = buttons.find(b => b.textContent && b.textContent.includes("Dossiê"));
        if (dossierBtn) dossierBtn.click();
      })()
    `,
  });

  for (let i = 0; i < 50; i++) {
    await recordFrame();
    await sleep(65);
  }

  // CENA 5: Transição para Lógica Ladder IEC 61131-3 (27s - 34s, 45 frames)
  console.log("Gravando Cena 5: Transição para Lógica Ladder IEC 61131-3...");
  await call("Runtime.evaluate", {
    expression: `
      (async () => {
        // Fecha modal
        const closeBtn = document.querySelector("[data-radix-collection-item], button[aria-label='Close'], button.close");
        if (closeBtn) closeBtn.click();
        
        const { useEditorStore } = await import('/src/components/editor/editor-store.ts');
        useEditorStore.getState().setActiveMode("ladder");
      })()
    `,
    awaitPromise: true,
  });

  for (let i = 0; i < 45; i++) {
    await recordFrame();
    await sleep(65);
  }

  // CENA 6: Vinheta de Encerramento Corporativa ElétricAi (34s - 38s, 35 frames)
  console.log("Gravando Cena 6: Vinheta de Encerramento Corporativa ElétricAi...");
  await call("Runtime.evaluate", {
    expression: `
      (() => {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.background = "#0B0E14";
        overlay.style.zIndex = "99999";
        overlay.style.display = "flex";
        overlay.style.flexDirection = "column";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.innerHTML = \`
          <div style="text-align: center;">
            <div style="display: inline-block; padding: 22px; border-radius: 28px; background: rgba(255, 107, 0, 0.08); border: 1.5px solid rgba(255, 107, 0, 0.35); box-shadow: 0 0 45px rgba(255, 107, 0, 0.2); margin-bottom: 24px;">
              <svg width="88" height="88" viewBox="0 0 120 120" fill="none">
                <path d="M 26 18 L 96 18 L 96 38 L 56 38 L 56 49 L 88 49 L 88 69 L 56 69 L 56 80 L 96 80 L 96 100 L 26 100 Z" fill="#E2E8F0" />
                <polygon points="82,8 34,62 58,62 16,114 46,114 94,54 70,54" fill="#FF6B00" />
                <polygon points="78,14 42,58 60,58 28,104 38,104 86,55 68,55" fill="#FFFFFF" opacity="0.9" />
              </svg>
            </div>
            <h1 style="font-size: 46px; font-weight: 800; font-family: system-ui, sans-serif; letter-spacing: -1.5px; margin: 0; color: #FFFFFF;">
              Elétric<span style="color: #FF6B00;">Ai</span>
            </h1>
            <p style="font-size: 13px; font-family: monospace; letter-spacing: 5px; color: #94A3B8; margin-top: 12px; text-transform: uppercase;">
              Engenharia Elétrica &amp; Automação Industrial
            </p>
          </div>
        \`;
        document.body.appendChild(overlay);
      })()
    `,
  });

  for (let i = 0; i < 35; i++) {
    await recordFrame();
    await sleep(65);
  }

  console.log(`Gravação finalizada! Total de ${frameIndex} frames capturados com sucesso.`);

  // 3. Fecha conexões e Chrome
  ws.close();
  chrome.kill();

  // 4. Codifica os frames com ffmpeg para WebM (VP8 de alta compatibilidade web)
  console.log("Codificando vídeo final com FFmpeg para WebM...");
  const ffmpeg = spawn(FFMPEG_PATH, [
    "-y",
    "-r", "12",
    "-i", path.join(FRAMES_DIR, "frame_%05d.jpg"),
    "-c:v", "libvpx",
    "-b:v", "1000k",
    "-crf", "28",
    "-auto-alt-ref", "0",
    OUTPUT_VIDEO,
  ]);

  await new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("FFmpeg finalizou com código " + code));
    });
  });

  console.log("=== VÍDEO CONCLUÍDO COM SUCESSO! ===");
  console.log("Arquivo de vídeo:", OUTPUT_VIDEO);
  console.log("Tamanho:", (fs.statSync(OUTPUT_VIDEO).size / 1024 / 1024).toFixed(2), "MB");

  // Limpa frames temporários
  for (const file of fs.readdirSync(FRAMES_DIR)) {
    fs.unlinkSync(path.join(FRAMES_DIR, file));
  }
  fs.rmdirSync(FRAMES_DIR);
}

main().catch((err) => {
  console.error("Erro na gravação:", err);
  process.exit(1);
});
