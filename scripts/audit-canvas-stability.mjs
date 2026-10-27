import { spawn } from "child_process";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Users\\98911\\AppData\\Local\\ms-playwright\\chromium-1194\\chrome-win\\chrome.exe";
const TARGET_URL = "http://localhost:8081/workspace?projectId=00000000-0000-4000-a000-000000000001&devAuth=1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("================================================================================");
  console.log("       ELÉTRICAI — AUDITORIA COMPLEMENTAR PÓS-CORREÇÃO DO CANVAS (CDP)         ");
  console.log("================================================================================");

  const debugPort = 9250;
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      "--window-size=1440,900",
      "--force-device-scale-factor=1",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);

  let ws;
  try {
    const putRes = await fetch(`http://localhost:${debugPort}/json/new?` + encodeURIComponent(TARGET_URL), {
      method: "PUT",
    });
    const tabData = await putRes.json();
    ws = new WebSocket(tabData.webSocketDebuggerUrl);
  } catch (err) {
    console.error("Falha ao conectar no Chrome headless:", err);
    chrome.kill();
    process.exit(1);
  }

  let msgId = 1;
  const pending = new Map();
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const allLogs = [];
  const reactFlowWarnings = [];
  const consoleErrors = [];

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      const entry = `[${msg.params.type}] ${text}`;
      allLogs.push(entry);

      if (text.includes("React Flow") || text.includes("nodeTypes") || text.includes("edgeTypes")) {
        reactFlowWarnings.push(entry);
      }
      if (msg.params.type === "error") {
        consoleErrors.push(entry);
      }
    } else if (msg.method === "Runtime.exceptionThrown") {
      const text = msg.params.exceptionDetails?.text || "Exception";
      const desc = msg.params.exceptionDetails?.exception?.description || "";
      const entry = `[EXCEPTION] ${text}: ${desc}`;
      consoleErrors.push(entry);
    }

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

  async function evaluate(fnStr) {
    const res = await call("Runtime.evaluate", {
      expression: `(${fnStr})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  console.log("Aguardando carregamento da aplicação e inicialização do workspace...");
  await sleep(3500);

  const initialUrl = await evaluate(`() => window.location.href`);
  console.log("URL atual do navegador:", initialUrl);

  // ============================================================================
  // TESTE 1: ALTERNÂNCIA PARA MODO FBD E MONTAGEM INICIAL COM NÓS
  // ============================================================================
  console.log("\n[TESTE FBD] 1. Clicando na aba FBD e configurando nós pré-existentes na montagem inicial...");

  await evaluate(`() => {
    document.querySelector('[data-tour="mode-fbd"]')?.click();
  }`);
  await sleep(1500);

  const fbdInitResult = await evaluate(`() => {
    const store = window.__editorStore;
    const initialNodes = [
      {
        id: "AND_1",
        type: "fbdBlock",
        position: { x: 100, y: 150 },
        data: { label: "AND_1", type: "AND", inputs: [{ id: "in1", name: "IN1", type: "BOOL" }, { id: "in2", name: "IN2", type: "BOOL" }], outputs: [{ id: "out", name: "OUT", type: "BOOL" }] },
      },
      {
        id: "OR_1",
        type: "fbdBlock",
        position: { x: 350, y: 150 },
        data: { label: "OR_1", type: "OR", inputs: [{ id: "in1", name: "IN1", type: "BOOL" }, { id: "in2", name: "IN2", type: "BOOL" }], outputs: [{ id: "out", name: "OUT", type: "BOOL" }] },
      }
    ];
    const initialEdges = [
      { id: "e1", source: "AND_1", sourceHandle: "out", target: "OR_1", targetHandle: "in1" }
    ];
    store.getState().setFbdAll(initialNodes, initialEdges);

    const container = document.querySelector(".react-flow");
    return {
      activeMode: store.getState().activeMode,
      nodesCount: store.getState().fbdNodes.length,
      edgesCount: store.getState().fbdEdges.length,
      containerFound: !!container,
      containerWidth: container?.clientWidth || 0,
      containerHeight: container?.clientHeight || 0,
    };
  }`);
  console.log("Resultado da montagem FBD:", fbdInitResult);

  await sleep(1000);

  const fbdViewportCheck1 = await evaluate(`() => {
    const viewport = document.querySelector(".react-flow__viewport");
    return {
      viewportTransform: viewport?.style.transform || "",
    };
  }`);
  console.log("Viewport após fitView inicial:", fbdViewportCheck1);

  // Verificação de render loop:
  const preLogs = allLogs.length;
  await sleep(1500);
  const postLogs = allLogs.length;
  const loopDetected = postLogs - preLogs > 10;
  console.log(`Verificação de loop: logs gerados em 1.5s = ${postLogs - preLogs} (loop: ${loopDetected})`);

  // ============================================================================
  // TESTE 2: CARREGAMENTO SUBSEQUENTE DE PROJETO SALVO (HYDRATE SNAPSHOT)
  // ============================================================================
  console.log("\n[TESTE FBD] 2. Carregando snapshot de projeto salvo subsequentemente (hydrateSnapshot)...");
  const subsequentLoadResult = await evaluate(`() => {
    const store = window.__editorStore;
    const snapshot = {
      rungs: [
        { id: "rung_audit_1", label: "Rede 1", cols: 8, cells: [[{ kind: "NO", operand: "%I0.0" }, { kind: "COIL", operand: "%Q0.0" }]] }
      ],
      fbdNodes: [
        { id: "TON_1", type: "fbdBlock", position: { x: 50, y: 80 }, data: { label: "TON_1", type: "TON", inputs: [{ id: "in", name: "IN", type: "BOOL" }, { id: "pt", name: "PT", type: "TIME" }], outputs: [{ id: "q", name: "Q", type: "BOOL" }, { id: "et", name: "ET", type: "TIME" }] } },
        { id: "SR_1", type: "fbdBlock", position: { x: 300, y: 80 }, data: { label: "SR_1", type: "SR", inputs: [{ id: "s1", name: "S1", type: "BOOL" }, { id: "r", name: "R", type: "BOOL" }], outputs: [{ id: "q1", name: "Q1", type: "BOOL" }] } },
        { id: "ADD_1", type: "fbdBlock", position: { x: 100, y: 300 }, data: { label: "ADD_1", type: "ADD", inputs: [{ id: "in1", name: "IN1", type: "INT" }, { id: "in2", name: "IN2", type: "INT" }], outputs: [{ id: "out", name: "OUT", type: "INT" }] } },
        { id: "MUL_1", type: "fbdBlock", position: { x: 350, y: 300 }, data: { label: "MUL_1", type: "MUL", inputs: [{ id: "in1", name: "IN1", type: "INT" }, { id: "in2", name: "IN2", type: "INT" }], outputs: [{ id: "out", name: "OUT", type: "INT" }] } },
      ],
      fbdEdges: [
        { id: "e_ton_sr", source: "TON_1", sourceHandle: "q", target: "SR_1", targetHandle: "s1" },
        { id: "e_add_mul", source: "ADD_1", sourceHandle: "out", target: "MUL_1", targetHandle: "in1" }
      ],
      editorTags: {
        "tag_1": { id: "tag_1", name: "START_CMD", type: "BOOL", value: true, forced: false }
      }
    };

    store.getState().hydrateSnapshot(snapshot);
    return {
      loadedNodes: store.getState().fbdNodes.length,
      loadedEdges: store.getState().fbdEdges.length,
      loadedRungs: store.getState().rungs.length,
    };
  }`);
  console.log("Resultado da carga subsequente:", subsequentLoadResult);

  await sleep(1000);
  const fbdViewportCheck2 = await evaluate(`() => {
    const viewport = document.querySelector(".react-flow__viewport");
    return {
      viewportTransform: viewport?.style.transform || "",
    };
  }`);
  console.log("Viewport após carga subsequente:", fbdViewportCheck2);

  // ============================================================================
  // TESTE 3: AUDITORIA DE ONERROR — ERROS REAIS CONTINUAM VISÍVEIS
  // ============================================================================
  console.log("\n[TESTE ERROS REAIS] 3. Injetando bloco com tipo desconhecido para comprovar que erros reais NÃO são suprimidos...");
  await evaluate(`() => {
    const store = window.__editorStore;
    store.getState().setFbdAll(
      (nodes) => [...nodes, { id: "BOGUS_NODE", type: "completelyUnknownBlockType", position: { x: 500, y: 500 }, data: {} }],
      (edges) => edges
    );
  }`);

  await sleep(800);

  // Remove o nó bogus
  await evaluate(`() => {
    const store = window.__editorStore;
    store.getState().setFbdAll(
      (nodes) => nodes.filter(n => n.id !== "BOGUS_NODE"),
      (edges) => edges
    );
  }`);

  await sleep(500);
  const bogusErrorCaught = reactFlowWarnings.some(w => w.includes("completelyUnknownBlockType") || w.includes("001") || w.includes("Node type"));
  console.log(`Erro real capturado transparentemente no console (código 001): ${bogusErrorCaught}`);

  // ============================================================================
  // TESTE 4: DIMENSÕES DO CONTÊINER E ALTERNÂNCIA DE PAINÉIS / EDITORES
  // ============================================================================
  console.log("\n[TESTE DIMENSÕES & PAINÉIS] 4. Testando redimensionamento, toggle de painéis e alternância de editores...");
  const panelTestResult = await evaluate(`async () => {
    const store = window.__editorStore;
    const container = document.querySelector(".react-flow");
    const initialW = container?.clientWidth || 0;
    const initialH = container?.clientHeight || 0;

    // 1. Colapsa painel esquerdo
    store.getState().toggleLeftPanel();
    await new Promise(r => setTimeout(r, 200));
    const wAfterLeftCollapse = container?.clientWidth || 0;

    // 2. Colapsa painel direito
    store.getState().toggleRightPanel();
    await new Promise(r => setTimeout(r, 200));
    const wAfterBothCollapse = container?.clientWidth || 0;

    // 3. Abre console inferior
    store.getState().setConsoleOpen(true);
    await new Promise(r => setTimeout(r, 200));
    const hWithConsoleOpen = container?.clientHeight || 0;

    // 4. Fecha console inferior
    store.getState().setConsoleOpen(false);
    await new Promise(r => setTimeout(r, 200));
    const hWithConsoleClosed = container?.clientHeight || 0;

    // 5. Restaura painéis
    store.getState().setPanelsCollapsed(false, false);
    await new Promise(r => setTimeout(r, 200));
    const finalW = container?.clientWidth || 0;

    return {
      initialDimensions: { w: initialW, h: initialH },
      afterLeftCollapseWidth: wAfterLeftCollapse,
      afterBothCollapseWidth: wAfterBothCollapse,
      consoleOpenHeight: hWithConsoleOpen,
      consoleClosedHeight: hWithConsoleClosed,
      restoredWidth: finalW,
      allPositive: initialW > 0 && initialH > 0 && wAfterLeftCollapse > 0 && wAfterBothCollapse > 0 && hWithConsoleOpen > 0,
      widthExpandedOnCollapse: wAfterBothCollapse > initialW,
    };
  }`);
  console.log("Resultado do teste de dimensões de painéis:", panelTestResult);

  // Alternância entre editores reais: FBD -> Ladder -> Unifilar -> FBD
  console.log("\n[TESTE ALTERNÂNCIA DE EDITORES] Testando FBD -> Ladder -> Unifilar -> FBD...");

  // Switch to Ladder
  await evaluate(`() => { document.querySelector('[data-tour="mode-ladder"]')?.click(); }`);
  await sleep(1000);
  const ladderCheck = await evaluate(`() => {
    const el = document.querySelector("[data-testid='ladder-rung-grid']") || document.querySelector(".ladder-editor") || document.querySelector(".workspace-layout") || document.querySelector(".flex-1");
    return {
      activeMode: window.__editorStore.getState().activeMode,
      w: el?.clientWidth || 0,
      h: el?.clientHeight || 0,
    };
  }`);

  // Switch to Unifilar
  await evaluate(`() => { document.querySelector('[data-tour="mode-unifilar"]')?.click(); }`);
  await sleep(1000);
  const unifilarCheck = await evaluate(`() => {
    const el = document.querySelector("canvas") || document.querySelector(".diagram-stage") || document.querySelector(".workspace-canvas") || document.querySelector(".flex-1");
    return {
      activeMode: window.__editorStore.getState().activeMode,
      w: el?.clientWidth || 0,
      h: el?.clientHeight || 0,
    };
  }`);

  // Switch back to FBD
  await evaluate(`() => { document.querySelector('[data-tour="mode-fbd"]')?.click(); }`);
  await sleep(1000);
  const fbdCheck = await evaluate(`() => {
    const el = document.querySelector(".react-flow");
    return {
      activeMode: window.__editorStore.getState().activeMode,
      w: el?.clientWidth || 0,
      h: el?.clientHeight || 0,
    };
  }`);

  console.log("Resultado da alternância de editores:", {
    ladder: ladderCheck,
    unifilar: unifilarCheck,
    fbd: fbdCheck,
  });

  // ============================================================================
  // TESTE 5: PRESERVAÇÃO DE DADOS (LADDER, FBD, UNIFILAR)
  // ============================================================================
  console.log("\n[TESTE PRESERVAÇÃO DE DADOS] 5. Validando integridade de IDs, instruções, conexões e componentes...");
  const dataPreservationResult = await evaluate(`() => {
    const store = window.__editorStore;
    
    // Ladder checks
    const rungs = store.getState().rungs;
    const rungIds = rungs.map(r => r.id);
    const uniqueRungIds = new Set(rungIds).size === rungIds.length;
    const firstRungInstruction = rungs[0]?.cells?.[0]?.[0]?.kind;
    const firstRungOperand = rungs[0]?.cells?.[0]?.[0]?.operand;

    // Duplica rede e move
    store.getState().setRungs((prev) => {
      const cloned = prev.map(r => ({ ...r, cells: r.cells.map(row => row.map(c => ({ ...c }))) }));
      cloned.push({
        id: "rung_audit_dup_1",
        label: "Rede Duplicada Auditoria",
        cols: 8,
        cells: [[{ kind: "NC", operand: "%I0.1" }, { kind: "COIL", operand: "%Q0.1" }]]
      });
      return cloned;
    });

    const updatedRungs = store.getState().rungs;
    const updatedRungIds = updatedRungs.map(r => r.id);
    const updatedUnique = new Set(updatedRungIds).size === updatedRungIds.length;

    // FBD checks
    const fbdNodes = store.getState().fbdNodes;
    const fbdEdges = store.getState().fbdEdges;
    const fbdNodeIds = fbdNodes.map(n => n.id);
    const fbdUnique = new Set(fbdNodeIds).size === fbdNodeIds.length;

    return {
      initialRungsCount: rungs.length,
      initialRungsUniqueIds: uniqueRungIds,
      firstRungPreserved: firstRungInstruction === "NO" && firstRungOperand === "%I0.0",
      afterDuplicationCount: updatedRungs.length,
      afterDuplicationUniqueIds: updatedUnique,
      fbdNodesCount: fbdNodes.length,
      fbdEdgesCount: fbdEdges.length,
      fbdUniqueNodeIds: fbdUnique,
      fbdEdgePreserved: fbdEdges[0]?.id === "e_ton_sr",
    };
  }`);
  console.log("Resultado da preservação de dados:", dataPreservationResult);

  // ============================================================================
  // TESTE 6: ISOLAMENTO DE ZOOM E PAN
  // ============================================================================
  console.log("\n[TESTE ZOOM & PAN] 6. Verificando que zoom e pan afetam apenas o canvas e NÃO a interface externa...");
  const zoomPanIsolationResult = await evaluate(`() => {
    const docEl = document.documentElement;
    const body = document.body;
    const header = document.querySelector("header");
    const sidebar = document.querySelector("aside");

    const preScrollX = window.scrollX;
    const preScrollY = window.scrollY;
    const preBodyRect = body.getBoundingClientRect();
    const preHeaderRect = header?.getBoundingClientRect() || { width: 0, height: 0 };
    const preSidebarRect = sidebar?.getBoundingClientRect() || { width: 0, height: 0 };

    // Dispara evento wheel simulando zoom dentro do canvas React Flow
    const canvasEl = document.querySelector(".react-flow");
    if (canvasEl) {
      const wheelEvent = new WheelEvent("wheel", {
        deltaY: -100,
        clientX: 400,
        clientY: 300,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      canvasEl.dispatchEvent(wheelEvent);
    }

    const postScrollX = window.scrollX;
    const postScrollY = window.scrollY;
    const postBodyRect = body.getBoundingClientRect();
    const postHeaderRect = header?.getBoundingClientRect() || { width: 0, height: 0 };
    const postSidebarRect = sidebar?.getBoundingClientRect() || { width: 0, height: 0 };

    return {
      windowScrollZero: postScrollX === 0 && postScrollY === 0,
      bodyRectUnchanged: Math.abs(postBodyRect.width - preBodyRect.width) < 1 && Math.abs(postBodyRect.height - preBodyRect.height) < 1,
      headerDimensionsUnchanged: Math.abs(postHeaderRect.height - preHeaderRect.height) < 1,
      sidebarDimensionsUnchanged: Math.abs(postSidebarRect.width - preSidebarRect.width) < 1,
      windowZoomLevel: window.devicePixelRatio,
    };
  }`);
  console.log("Resultado do isolamento de zoom/pan:", zoomPanIsolationResult);

  // ============================================================================
  // RESUMO DE AVISOS E ERROS CAPTURADOS DURANTE TODA A EXECUÇÃO
  // ============================================================================
  console.log("\n================================================================================");
  console.log("                RELATÓRIO DE MONITORAMENTO DO CONSOLE                         ");
  console.log("================================================================================");
  console.log(`Total de logs capturados: ${allLogs.length}`);
  console.log(`Avisos React Flow capturados: ${reactFlowWarnings.length}`);
  reactFlowWarnings.forEach(w => console.log("   -", w));

  const has004 = reactFlowWarnings.some(w => w.includes("parent container needs a width and a height") || w.includes("004"));
  console.log(`Aviso 004 (contêiner sem dimensões): ${has004 ? "DETECTADO!" : "AUSENTE (DIMENSÕES VÁLIDAS)"}`);
  console.log(`Erros de runtime capturados: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.log("   -", e));
  }

  console.log("\nAuditoria finalizada com sucesso.");
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro durante a execução do script de auditoria:", err);
  process.exit(1);
});
