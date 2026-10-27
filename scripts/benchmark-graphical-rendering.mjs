// Automated Graphical Rendering & Interaction Responsiveness Benchmark
// Measures Unifilar, FBD, and Ladder Canvas performance across escalating node/connection scales.
// Operates via Chrome DevTools Protocol (CDP) on the live running application.

import { spawn } from "child_process";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Users\\98911\\AppData\\Local\\ms-playwright\\chromium-1194\\chrome-win\\chrome.exe";
const TARGET_URL = "http://localhost:8081/workspace?projectId=00000000-0000-4000-a000-000000000001&devAuth=1";
const DEBUG_PORT = 9286;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBenchmark() {
  console.log("=== INICIANDO BENCHMARK DE RENDERIZAÇÃO GRÁFICA DO CANVAS ===");
  console.log(`Conectando ao Chrome em http://localhost:${DEBUG_PORT}...`);

  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--window-size=1440,900",
      "--force-device-scale-factor=1",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);

  const putRes = await fetch(
    `http://localhost:${DEBUG_PORT}/json/new?` + encodeURIComponent(TARGET_URL),
    { method: "PUT" }
  );
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

  console.log("Aguardando carregamento e hidratação da aplicação...");
  await sleep(5000);

  // Executa medição detalhada no contexto da página
  const results = await call("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const measurements = {
        unifilar: [],
        fbd: [],
        ladder: [],
        system: {
          userAgent: navigator.userAgent,
          devicePixelRatio: window.devicePixelRatio,
          memoryMb: window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) : null
        }
      };

      // Importar módulos necessários do aplicativo
      const { useDiagramStore } = await import('/src/lib/diagram/store.ts');
      const { useEditorStore } = await import('/src/lib/editor/store.ts');
      const { createEmptyDoc } = await import('/src/lib/diagram/model.ts');

      // Helper para aguardar frames de renderização (next 2 rAFs)
      function nextFrame() {
        return new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      }

      function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      async function waitForSelector(sel, timeoutMs = 6000) {
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
          if (document.querySelector(sel)) return true;
          await sleep(50);
        }
        return false;
      }

      // =========================================================================
      // 1. BENCHMARK UNIFILAR (Diagram Canvas WebGL)
      // =========================================================================
      console.log("[Benchmark] Testando Unifilar Canvas...");
      document.querySelector('[data-tour="mode-unifilar"]')?.click();
      await sleep(1000);

      const unifilarScales = [
        { label: "Escala 1 (Pequeno)", count: 20 },
        { label: "Escala 2 (Médio)", count: 100 },
        { label: "Escala 3 (Grande)", count: 300 },
        { label: "Escala 4 (Industrial Máximo)", count: 1075 }
      ];

      for (const scale of unifilarScales) {
        const doc = createEmptyDoc();
        const types = ["breaker", "contactor", "motor", "transformer", "busbar"];

        for (let i = 0; i < scale.count; i++) {
          const row = Math.floor(i / 15);
          const col = i % 15;
          const nodeId = "unifilar-node-" + i;
          doc.nodes[nodeId] = {
            id: nodeId,
            type: types[i % types.length],
            sheetId: doc.activeSheetId,
            position: { x: 100 + col * 120, y: 100 + row * 150 },
            rotation: 0,
            params: { voltage: 380, power_kW: 7.5 }
          };

          if (i > 0 && i % 2 === 1) {
            const edgeId = "unifilar-edge-" + i;
            doc.edges[edgeId] = {
              id: edgeId,
              sheetId: doc.activeSheetId,
              from: { nodeId: "unifilar-node-" + (i - 1), portId: "out" },
              to: { nodeId, portId: "in" }
            };
          }
        }

        // Medir tempo de montagem / loadDoc até renderização de frames
        const tStart = performance.now();
        useDiagramStore.getState().loadDoc(doc);
        await nextFrame();
        const renderTimeMs = Math.round((performance.now() - tStart) * 100) / 100;

        // Medir quantidade de elementos DOM gerados
        const canvasContainer = document.querySelector(".flex-1.relative") || document.body;
        const domElements = canvasContainer.querySelectorAll("*").length;

        // Testar responsividade ao Zoom (wheel event com ctrlKey)
        const canvasEl = document.querySelector("canvas") || canvasContainer;
        const tZoomStart = performance.now();
        if (canvasEl) {
          canvasEl.dispatchEvent(new WheelEvent("wheel", {
            deltaY: -100,
            ctrlKey: true,
            bubbles: true,
            clientX: 500,
            clientY: 400
          }));
        }
        await nextFrame();
        const zoomLatencyMs = Math.round((performance.now() - tZoomStart) * 100) / 100;

        const heapMb = window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) : null;

        measurements.unifilar.push({
          scale: scale.label,
          nodes: scale.count,
          edges: Object.keys(doc.edges).length,
          renderTimeMs,
          domElements,
          zoomLatencyMs,
          heapMb
        });
      }

      // =========================================================================
      // 2. BENCHMARK FBD (React Flow Canvas)
      // =========================================================================
      console.log("[Benchmark] Testando FBD Canvas (React Flow)...");
      document.querySelector('[data-tour="mode-fbd"]')?.click();
      await waitForSelector(".react-flow");
      await sleep(1000);

      const fbdScales = [
        { label: "Escala 1 (Pequeno)", blockCount: 15 },
        { label: "Escala 2 (Médio)", blockCount: 50 },
        { label: "Escala 3 (Grande)", blockCount: 150 },
        { label: "Escala 4 (Industrial)", blockCount: 300 }
      ];

      for (const scale of fbdScales) {
        const blocks = [];
        const connections = [];
        const types = ["AND", "OR", "TON", "CTU", "SR", "PID"];

        for (let i = 0; i < scale.blockCount; i++) {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const blockId = "fbd-blk-" + i;
          blocks.push({
            id: blockId,
            type: "fbdBlock",
            position: { x: 80 + col * 200, y: 80 + row * 160 },
            data: {
              label: types[i % types.length] + " " + (i + 1),
              type: types[i % types.length],
              inputs: [
                { id: "IN1", label: "IN1", type: "BOOL" },
                { id: "IN2", label: "IN2", type: "BOOL" }
              ],
              outputs: [
                { id: "OUT", label: "OUT", type: "BOOL" }
              ],
              params: { pt: "T#5s" }
            }
          });

          if (i > 0 && i % 2 === 1) {
            connections.push({
              id: "fbd-edge-" + i,
              source: "fbd-blk-" + (i - 1),
              sourceHandle: "OUT",
              target: blockId,
              targetHandle: "IN1"
            });
          }
        }

        const tStart = performance.now();
        useEditorStore.getState().setFbdAll(blocks, connections);
        await nextFrame();
        await sleep(50);
        const renderTimeMs = Math.round((performance.now() - tStart) * 100) / 100;

        // Medir elementos React Flow no DOM
        const rfNodes = document.querySelectorAll(".react-flow__node").length;
        const rfEdges = document.querySelectorAll(".react-flow__edge").length;
        const totalDom = document.querySelector(".react-flow")?.querySelectorAll("*").length || 0;

        // Medir responsividade ao Pan no React Flow
        const rfPane = document.querySelector(".react-flow__pane");
        const tPanStart = performance.now();
        if (rfPane) {
          rfPane.dispatchEvent(new MouseEvent("mousedown", { clientX: 300, clientY: 300, bubbles: true }));
          rfPane.dispatchEvent(new MouseEvent("mousemove", { clientX: 350, clientY: 350, bubbles: true }));
          rfPane.dispatchEvent(new MouseEvent("mouseup", { clientX: 350, clientY: 350, bubbles: true }));
        }
        await nextFrame();
        const panLatencyMs = Math.round((performance.now() - tPanStart) * 100) / 100;

        const heapMb = window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) : null;

        measurements.fbd.push({
          scale: scale.label,
          blocks: scale.blockCount,
          connections: connections.length,
          renderTimeMs,
          rfNodes,
          rfEdges,
          totalDomElements: totalDom,
          panLatencyMs,
          heapMb
        });
      }

      // =========================================================================
      // 3. BENCHMARK LADDER (Rung Grid)
      // =========================================================================
      console.log("[Benchmark] Testando Ladder Canvas (Rungs)...");
      document.querySelector('[data-tour="mode-ladder"]')?.click();
      await waitForSelector(".rung-grid, [data-tour='rung-grid'], table, .ladder-rung");
      await sleep(1000);

      const ladderScales = [
        { label: "Escala 1 (Pequeno)", rungCount: 10 },
        { label: "Escala 2 (Médio)", rungCount: 50 },
        { label: "Escala 3 (Grande)", rungCount: 120 },
        { label: "Escala 4 (Industrial Máximo)", rungCount: 265 }
      ];

      for (const scale of ladderScales) {
        const rungs = [];
        for (let r = 0; r < scale.rungCount; r++) {
          rungs.push({
            id: "ladder-rung-" + r,
            number: r + 1,
            label: "Rung Motor M" + String(r + 1).padStart(3, "0"),
            comment: "Intertravamento de segurança",
            branches: [],
            cells: [
              { id: "c1-" + r, kind: "contact_no", operand: "START_M" + (r + 1), address: "%IX0.0" },
              { id: "c2-" + r, kind: "contact_nc", operand: "ESTOP", address: "%IX1.0" },
              { id: "c3-" + r, kind: "contact_nc", operand: "OVERLOAD_M" + (r + 1), address: "%IX0.1" }
            ],
            output: {
              id: "out-" + r,
              kind: "OTE",
              operand: "KM_M" + (r + 1),
              address: "%QX0.0"
            }
          });
        }

        const tStart = performance.now();
        useEditorStore.getState().setRungs(rungs);
        await nextFrame();
        await sleep(50);
        const renderTimeMs = Math.round((performance.now() - tStart) * 100) / 100;

        // Medir elementos do Ladder no DOM
        const rungElements = document.querySelectorAll("tr, [data-rung-id], .ladder-cell").length;
        const totalLadderDom = document.querySelector(".rung-grid, [data-tour='rung-grid'], .flex-1.relative")?.querySelectorAll("*").length || 0;

        // Medir fluidez de rolagem
        const scrollContainer = document.querySelector(".overflow-auto, .overflow-y-auto");
        const tScrollStart = performance.now();
        if (scrollContainer) {
          scrollContainer.scrollTop = 500;
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
        await nextFrame();
        const scrollLatencyMs = Math.round((performance.now() - tScrollStart) * 100) / 100;

        const heapMb = window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) : null;

        measurements.ladder.push({
          scale: scale.label,
          rungs: scale.rungCount,
          totalInstructions: scale.rungCount * 4,
          renderTimeMs,
          domElements: rungElements || totalLadderDom,
          scrollLatencyMs,
          heapMb
        });
      }

      return measurements;
    })()`,
  });

  chrome.kill();

  if (results.exceptionDetails) {
    console.error("Erro durante o benchmark no navegador:", results.exceptionDetails);
    process.exit(1);
  }

  const data = results.result.value;

  console.log("\n================================================================================");
  console.log("            RESULTADOS REAIS DO BENCHMARK DE RENDERIZAÇÃO GRÁFICA               ");
  console.log("================================================================================");
  console.log("Memória Heap Inicial:", data.system.memoryMb, "MB");

  console.log("\n--- 1. EDITOR UNIFILAR (WebGL / Canvas Gráfico) ---");
  console.table(data.unifilar);

  console.log("\n--- 2. EDITOR FBD (React Flow Canvas) ---");
  console.table(data.fbd);

  console.log("\n--- 3. EDITOR LADDER (Rung Grid) ---");
  console.table(data.ladder);

  console.log("================================================================================");
  console.log("Benchmark gráfico finalizado com sucesso!");
}

runBenchmark().catch((err) => {
  console.error("Falha ao executar benchmark:", err);
  process.exit(1);
});
