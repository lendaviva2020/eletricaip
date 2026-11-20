// @vitest-environment node
// Ponta a ponta: escravo Modbus TCP real (socket) ← Runtime (varredura + guarda)
// ← WebVisu HTTP (PIN, anti-CSRF, arme local).
import { afterEach, describe, expect, it } from "vitest";
import { emptyCell, type LadderCell, type LadderRung } from "@/lib/ladder/types";
import { buildRuntimePackage } from "@/lib/runtime/program-package";
import { createModbusMemory, startModbusServer } from "@/lib/runtime/node/modbus-tcp-server";
import { RuntimeDaemon } from "@/lib/runtime/node/runtime-daemon";
import { createWebVisuServer, webVisuHtml } from "@/lib/runtime/node/webvisu-server";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("tempo esgotado");
    await wait(20);
  }
}

function rung(): LadderRung {
  const r0: LadderCell[] = Array.from({ length: 4 }, emptyCell);
  r0[0] = { kind: "XIC", operand: "M1_PARTIR" };
  r0[1] = { kind: "XIC", operand: "M1_PARAR" };
  r0[2] = { kind: "XIC", operand: "S0_OK" };
  r0[3] = { kind: "OTE", operand: "K1" };
  const r1: LadderCell[] = Array.from({ length: 4 }, emptyCell);
  r1[0] = { kind: "XIC", operand: "K1" };
  return { id: "r1", label: "M1", cols: 4, cells: [r0, r1] };
}

async function setup() {
  const mem = createModbusMemory();
  mem.discreteInputs.set(0, true); // emergência íntegra (NF)
  mem.discreteInputs.set(1, true); // parada íntegra (NF)
  const srv = await startModbusServer(mem, 0);
  const built = await buildRuntimePackage({
    projectId: "00000000-0000-4000-8000-0000000000bb",
    projectName: "Bancada E2E",
    scanMs: 20,
    rungs: [rung()],
    studio: null,
    hmi: null,
    ioMap: {
      connections: [
        {
          id: "io",
          kind: "modbus_tcp",
          host: "127.0.0.1",
          port: srv.port,
          timeoutMs: 300,
          pollMs: 20,
        },
      ],
      points: [
        {
          tag: "S0_OK",
          direction: "input",
          dataType: "BOOL",
          connectionId: "io",
          modbus: { area: "discrete_input", address: 0 },
        },
        {
          tag: "M1_PARAR",
          direction: "input",
          dataType: "BOOL",
          connectionId: "io",
          modbus: { area: "discrete_input", address: 1 },
        },
        {
          tag: "K1",
          direction: "output",
          dataType: "BOOL",
          connectionId: "io",
          modbus: { area: "coil", address: 0 },
          writeEnabled: true,
          safeValue: false,
        },
      ],
      estopTag: "S0_OK",
    },
  });
  if (!built.ok) throw new Error(built.errors.join());
  const daemon = new RuntimeDaemon();
  await daemon.offerPackage(built.pkg, true);
  daemon.start();
  const web = createWebVisuServer(daemon, { host: "127.0.0.1", port: 0, pin: "482913" });
  const port = await web.listen();
  cleanups.push(srv.close, () => daemon.stop(), web.close);
  const base = `http://127.0.0.1:${port}`;
  let cookie = "";
  const api = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eletricai-webvisu": "1",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };
  return { mem, daemon, api, base };
}

describe("ElétricAi Runtime ponta a ponta", () => {
  it("sem PIN nada; com PIN arma, escreve no campo e a emergência derruba para SEGURO", async () => {
    const { mem, daemon, api } = await setup();
    expect((await api("/api/state")).status).toBe(401);
    expect((await api("/api/login", { pin: "000000" })).status).toBe(401);
    // anti-CSRF: sem o cabeçalho próprio, recusa
    expect(
      (await api("/api/login", { pin: "482913" }, { "x-eletricai-webvisu": "0" })).status,
    ).toBe(403);
    expect((await api("/api/login", { pin: "482913" })).status).toBe(200);

    // sombra: a lógica liga K1, mas o campo não recebe nada
    await until(() => daemon.status().scans > 3);
    expect((await api("/api/command", { tag: "M1_PARTIR", value: true })).status).toBe(200);
    await until(() => daemon.status().tags.K1 === true);
    await wait(80);
    expect(mem.coils.get(0)).toBeUndefined();
    // comando direto em saída do campo é recusado
    expect((await api("/api/command", { tag: "K1", value: true })).status).toBe(409);

    // arme exige o PIN de novo
    expect((await api("/api/arm", { pin: "111111" })).status).toBe(401);
    expect((await api("/api/arm", { pin: "482913" })).status).toBe(200);
    await until(() => mem.coils.get(0) === true);
    expect(daemon.mode).toBe("RUN");

    // emergência atuada no campo → SEGURO, K1 desligado e sem religar sozinho
    mem.discreteInputs.set(0, false);
    await until(() => daemon.mode === "SAFE");
    await until(() => mem.coils.get(0) === false);
    mem.discreteInputs.set(0, true);
    await wait(150);
    expect(daemon.mode).toBe("SAFE");
    expect(mem.coils.get(0)).toBe(false);

    const st = (await api("/api/state")).json as { status: { blockers: string[] } };
    expect(st.status.blockers.join()).toMatch(/emergência/);
  });

  it("PARAR pelo WebVisu sempre funciona e o PIN bloqueia após tentativas", async () => {
    const { mem, daemon, api } = await setup();
    await api("/api/login", { pin: "482913" });
    await until(() => daemon.status().scans > 3);
    await api("/api/command", { tag: "M1_PARTIR", value: true });
    expect((await api("/api/arm", { pin: "482913" })).status).toBe(200);
    await until(() => mem.coils.get(0) === true);
    expect((await api("/api/disarm", {})).status).toBe(200);
    await until(() => mem.coils.get(0) === false);
    expect(daemon.mode).toBe("SAFE");
    for (let i = 0; i < 5; i++) await api("/api/arm", { pin: "999999" });
    expect((await api("/api/arm", { pin: "482913" })).status).toBe(429);
  });

  it("a página não insere dados como HTML e usa CSP com nonce", () => {
    const html = webVisuHtml("abc");
    expect(html).not.toContain("innerHTML");
    expect(html).toContain('<script nonce="abc">');
    expect(html).not.toMatch(/style="/);
  });
});
