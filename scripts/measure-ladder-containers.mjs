import { spawn } from "child_process";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Users\\98911\\AppData\\Local\\ms-playwright\\chromium-1194\\chrome-win\\chrome.exe";
const TARGET_URL = "http://localhost:8081/workspace?projectId=00000000-0000-4000-a000-000000000001&devAuth=1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureViewport(width, height, label) {
  console.log(`\n--- Testando viewport: ${label} (${width}x${height}) ---`);
  const debugPort = 9260;
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--window-size=${width},${height}`,
      "--force-device-scale-factor=1",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);

  const putRes = await fetch(`http://localhost:${debugPort}/json/new?` + encodeURIComponent(TARGET_URL), {
    method: "PUT",
  });
  const tabData = await putRes.json();
  const ws = new WebSocket(tabData.webSocketDebuggerUrl);

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
  await call("Page.enable");
  await call("Runtime.enable");

  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 1024,
  });

  await sleep(3500);

  // Switch to Ladder mode
  await call("Runtime.evaluate", {
    expression: `(() => {
      document.querySelector('[data-tour="mode-ladder"]')?.click();
    })()`,
  });
  await sleep(1500);

  // Measure all related elements
  const res = await call("Runtime.evaluate", {
    expression: `(() => {
      const ladderCanvas = document.querySelector('[data-testid="ladder-canvas"]');
      const ladderGrid = document.querySelector('[data-testid="ladder-rung-grid"]');
      const scanOverlay = document.querySelector('.scan-overlay');
      const maxW5xl = document.querySelector('.max-w-5xl');
      const sidebarNav = document.querySelector('aside nav.flex-1');
      const appSidebar = document.querySelector('aside');
      const workspaceContent = document.querySelector('.workspace-content') || document.querySelector('.flex-1.flex.flex-col.min-w-0.h-full');

      const rect = (el) => el ? {
        tag: el.tagName,
        className: el.className,
        w: el.clientWidth,
        h: el.clientHeight,
        rect: {
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height),
        }
      } : null;

      return {
        ladderCanvas: rect(ladderCanvas),
        ladderGrid: rect(ladderGrid),
        scanOverlay: rect(scanOverlay),
        maxW5xl: rect(maxW5xl),
        sidebarNav: rect(sidebarNav),
        appSidebar: rect(appSidebar),
        workspaceContent: rect(workspaceContent),
      };
    })()`,
    returnByValue: true,
  });

  chrome.kill();
  return res.result?.value;
}

async function main() {
  console.log("================================================================================");
  console.log("       ELÉTRICAI — INVESTIGAÇÃO DE DIMENSÕES DO LADDER (DESKTOP & TABLET)       ");
  console.log("================================================================================");

  const desktop = await measureViewport(1440, 900, "Desktop");
  console.log("Medições Desktop (1440x900):", JSON.stringify(desktop, null, 2));

  const tabletLandscape = await measureViewport(1024, 768, "Tablet Landscape");
  console.log("Medições Tablet Landscape (1024x768):", JSON.stringify(tabletLandscape, null, 2));

  const tabletPortrait = await measureViewport(768, 1024, "Tablet Portrait");
  console.log("Medições Tablet Portrait (768x1024):", JSON.stringify(tabletPortrait, null, 2));

  console.log("\n================================================================================");
  console.log("                            ANÁLISE COMPARATIVA                                ");
  console.log("================================================================================");
  console.log(`Desktop (1440x900):`);
  console.log(`   - Contêiner Ladder Canvas: ${desktop?.ladderCanvas?.w}px × ${desktop?.ladderCanvas?.h}px`);
  console.log(`   - Grid de Execução Ladder: ${desktop?.ladderGrid?.w}px × ${desktop?.ladderGrid?.h}px`);
  console.log(`   - Superfície Scan Overlay: ${desktop?.scanOverlay?.w}px × ${desktop?.scanOverlay?.h}px`);
  console.log(`   - Sidebar de Navegação:    ${desktop?.sidebarNav?.w}px × ${desktop?.sidebarNav?.h}px`);

  console.log(`\nTablet Landscape (1024x768):`);
  console.log(`   - Contêiner Ladder Canvas: ${tabletLandscape?.ladderCanvas?.w}px × ${tabletLandscape?.ladderCanvas?.h}px`);
  console.log(`   - Grid de Execução Ladder: ${tabletLandscape?.ladderGrid?.w}px × ${tabletLandscape?.ladderGrid?.h}px`);
  console.log(`   - Superfície Scan Overlay: ${tabletLandscape?.scanOverlay?.w}px × ${tabletLandscape?.scanOverlay?.h}px`);
  console.log(`   - Sidebar de Navegação:    ${tabletLandscape?.sidebarNav?.w ?? 0}px (recolhido em tablet)`);

  console.log(`\nTablet Portrait (768x1024):`);
  console.log(`   - Contêiner Ladder Canvas: ${tabletPortrait?.ladderCanvas?.w}px × ${tabletPortrait?.ladderCanvas?.h}px`);
  console.log(`   - Grid de Execução Ladder: ${tabletPortrait?.ladderGrid?.w}px × ${tabletPortrait?.ladderGrid?.h}px`);
  console.log(`   - Superfície Scan Overlay: ${tabletPortrait?.scanOverlay?.w}px × ${tabletPortrait?.scanOverlay?.h}px`);
  console.log(`   - Sidebar de Navegação:    ${tabletPortrait?.sidebarNav?.w ?? 0}px (recolhido em tablet)`);

  process.exit(0);
}

main().catch(console.error);
