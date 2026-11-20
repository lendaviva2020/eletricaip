// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { parseHmiCode } from "@/lib/hmi/hmi-dsl";
import type { HmiDoc } from "@/lib/hmi/hmi-model";
import { buildHmiLayout, rotatePort } from "@/lib/hmi/hmi-layout";
import {
  equipmentStatesFromTags,
  parseSymbolStateKey,
  symbolStateKey,
} from "@/lib/hmi/hmi-tag-state";
import { renderHmiSymbolSvg } from "@/lib/runtime/node/hmi-symbol-svg";
import { buildRuntimePackage } from "@/lib/runtime/program-package";
import { RuntimeDaemon } from "@/lib/runtime/node/runtime-daemon";
import { createWebVisuServer } from "@/lib/runtime/node/webvisu-server";

const PLANT = `tela "Fábrica de óleo e farinha"
equipamento MG1 moega "Moega de recepção" em 40,40
equipamento RT1 rosca "Rosca alimentadora" em 220,80 tag RT_101
equipamento CZ1 cozinhador "Cozinhador" em 480,80
equipamento PR1 prensa "Prensa" em 760,80 girar 90
equipamento TO1 tanque_oleo "Tanque de óleo" em 800,260
ligar MG1.saida -> RT1.entrada farinha
ligar RT1.saida -> CZ1.entrada produto
ligar CZ1.saida -> PR1.entrada
ligar PR1.oleo -> TO1.entrada oleo
`;

function doc(): HmiDoc {
  const r = parseHmiCode(PLANT);
  if (!r.doc) throw new Error(r.issues.map((i) => i.message).join("; "));
  return r.doc;
}

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("geometria da tela", () => {
  it("todas as ligações válidas saem e chegam nas portas, com traçado ortogonal", () => {
    const L = buildHmiLayout(doc());
    expect(L.equipment).toHaveLength(5);
    expect(L.links).toHaveLength(4);
    for (const l of L.links) {
      for (let i = 1; i < l.points.length; i++) {
        const [a, b] = [l.points[i - 1], l.points[i]];
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true); // só segmentos retos
      }
    }
    const pr = L.equipment.find((e) => e.id === "PR1")!;
    expect([pr.w, pr.h]).toEqual([pr.symbolH, pr.symbolW]); // girado 90°
  });

  it("rotação das portas igual à do editor", () => {
    expect(rotatePort("left", 0.3, 90)).toEqual({ side: "top", at: 0.7 });
  });
});

describe("estado pelas tags reais", () => {
  it("sem tag = sem sinal; com tag = o que ela diz (nada deduzido)", () => {
    const s = equipmentStatesFromTags(doc(), { "RT_101.LIGADO": true, "RT_101.VELOCIDADE": 140 });
    expect(s.RT1.hasSignal).toBe(true);
    expect(s.RT1.state.running).toBe(true);
    expect(s.RT1.state.speedPct).toBe(100); // limitado a 100 %
    expect(s.CZ1.hasSignal).toBe(false);
    expect(s.CZ1.state.running).toBe(false);
    // tag sem sufixo também vale para ligado
    expect(equipmentStatesFromTags(doc(), { RT_101: true }).RT1.state.running).toBe(true);
  });

  it("chave do desenho ida e volta e recusa lixo", () => {
    const st = { running: true, reverse: false, speedPct: 55.4, open: false, levelPct: 3 };
    const k = symbolStateKey(st);
    expect(parseSymbolStateKey(k)).toEqual({ ...st, speedPct: 55 });
    expect(parseSymbolStateKey("1-0-555-0-0")).toBeNull();
    expect(parseSymbolStateKey("<script>")).toBeNull();
  });
});

describe("símbolo no gateway", () => {
  it("é o desenho do editor, autônomo, sem script e com animação embutida", () => {
    const svg = renderHmiSymbolSvg("rosca", parseSymbolStateKey("1-0-100-0-0")!, "1-0-100-0-0")!;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain("@keyframes hmi-spin");
    expect(svg).toContain("hmi-steel");
    expect(svg).not.toMatch(/<script|on[a-z]+=/i);
    expect(
      renderHmiSymbolSvg("nao_existe", parseSymbolStateKey("0-0-0-0-0")!, "0-0-0-0-0"),
    ).toBeNull();
  });
});

describe("WebVisu com a tela completa", () => {
  it("entrega geometria + estado e o símbolo como imagem com CSP própria", async () => {
    const built = await buildRuntimePackage({
      projectId: "00000000-0000-4000-8000-0000000000ee",
      projectName: "Tela",
      scanMs: 50,
      rungs: [
        {
          id: "r",
          label: "liga rosca",
          cols: 2,
          cells: [
            [
              { kind: "XIC", operand: "LIGA" },
              { kind: "OTE", operand: "RT_101.LIGADO" },
            ],
          ],
        },
      ],
      studio: null,
      hmi: doc(),
      ioMap: { connections: [], points: [] },
    });
    if (!built.ok) throw new Error(built.errors.join());
    const daemon = new RuntimeDaemon();
    await daemon.offerPackage(built.pkg, false);
    daemon.start();
    const web = createWebVisuServer(daemon, { host: "127.0.0.1", port: 0, pin: "482913" });
    const port = await web.listen();
    cleanups.push(() => daemon.stop(), web.close);
    const base = `http://127.0.0.1:${port}`;
    const H = { "Content-Type": "application/json", "x-eletricai-webvisu": "1" };
    // sem sessão, nem o símbolo sai
    expect((await fetch(`${base}/api/hmi/symbol?type=rosca&s=0-0-100-0-0`)).status).toBe(401);
    const login = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ pin: "482913" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const get = (p: string) => fetch(base + p, { headers: { cookie } });

    await fetch(`${base}/api/command`, {
      method: "POST",
      headers: { ...H, cookie },
      body: JSON.stringify({ tag: "LIGA", value: true }),
    });
    await new Promise((r) => setTimeout(r, 200));
    const state = (await (await get("/api/state")).json()) as {
      hmi: {
        layout: { equipment: unknown[]; links: unknown[] };
        states: Record<string, { key: string; hasSignal: boolean }>;
      };
    };
    expect(state.hmi.layout.equipment).toHaveLength(5);
    expect(state.hmi.layout.links).toHaveLength(4);
    expect(state.hmi.states.RT1).toMatchObject({ key: "1-0-100-0-0", hasSignal: true });
    expect(state.hmi.states.CZ1.hasSignal).toBe(false);

    const sym = await get(`/api/hmi/symbol?type=rosca&s=${state.hmi.states.RT1.key}`);
    expect(sym.status).toBe(200);
    expect(sym.headers.get("content-type")).toContain("image/svg+xml");
    expect(sym.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect((await get("/api/hmi/symbol?type=rosca&s=9")).status).toBe(404);
    expect((await get("/api/hmi/symbol?type=../x&s=0-0-0-0-0")).status).toBe(404);
  });
});

describe("traçado das ligações", () => {
  it("saída para baixo com destino acima contorna pelo lado (não corta a origem)", async () => {
    const { orthogonalRoute } = await import("@/lib/hmi/hmi-layout");
    // moega: porta de saída embaixo em (100,200); rosca: entrada em cima em (300,100)
    const pts = orthogonalRoute([100, 200], "bottom", [300, 100], "top");
    // nenhum ponto intermediário sobe pela coluna x=100 acima da saída
    expect(pts.some(([x, y]) => x === 100 && y < 200)).toBe(false);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i - 1][0] === pts[i][0] || pts[i - 1][1] === pts[i][1]).toBe(true);
    }
  });
});
