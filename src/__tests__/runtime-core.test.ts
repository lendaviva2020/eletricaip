import { describe, expect, it } from "vitest";
import { emptyCell, type LadderCell, type LadderRung } from "@/lib/ladder/types";
import { IoMapSchema, parseIoMap, type IoMap } from "@/lib/runtime/io-map";
import {
  buildRuntimePackage,
  runtimePackageHash,
  verifyRuntimePackage,
  type RuntimePackage,
} from "@/lib/runtime/program-package";
import { RuntimeCore } from "@/lib/runtime/runtime-core";

const PROJECT = "00000000-0000-4000-8000-0000000000aa";

/** Partida direta com selo: (PARTIR ∥ K1) · PARAR · S0_OK → K1 */
function starterRung(): LadderRung {
  const row0: LadderCell[] = Array.from({ length: 4 }, emptyCell);
  row0[0] = { kind: "XIC", operand: "M1_PARTIR" };
  row0[1] = { kind: "XIC", operand: "M1_PARAR" };
  row0[2] = { kind: "XIC", operand: "S0_OK" };
  row0[3] = { kind: "OTE", operand: "K1" };
  const row1: LadderCell[] = Array.from({ length: 4 }, emptyCell);
  row1[0] = { kind: "XIC", operand: "K1" };
  return { id: "r1", label: "M1", cols: 4, cells: [row0, row1] };
}

const IO: IoMap = IoMapSchema.parse({
  connections: [{ id: "io1", kind: "modbus_tcp", host: "192.168.0.10" }],
  points: [
    {
      tag: "S0_OK",
      direction: "input",
      dataType: "BOOL",
      connectionId: "io1",
      modbus: { area: "discrete_input", address: 0 },
    },
    {
      tag: "M1_PARAR",
      direction: "input",
      dataType: "BOOL",
      connectionId: "io1",
      modbus: { area: "discrete_input", address: 1 },
    },
    {
      tag: "K1",
      direction: "output",
      dataType: "BOOL",
      connectionId: "io1",
      modbus: { area: "coil", address: 0 },
      writeEnabled: true,
      safeValue: false,
    },
  ],
  estopTag: "S0_OK",
});

async function pkg(io: unknown = IO): Promise<RuntimePackage> {
  const r = await buildRuntimePackage({
    projectId: PROJECT,
    projectName: "Bancada",
    scanMs: 20,
    rungs: [starterRung()],
    studio: null,
    hmi: null,
    ioMap: io,
  });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.pkg;
}

function feed(core: RuntimeCore, at: number, s0: boolean, parar = true) {
  core.applyInputs([
    { tag: "S0_OK", value: s0, ok: true, at },
    { tag: "M1_PARAR", value: parar, ok: true, at },
  ]);
}

describe("mapa de E/S", () => {
  it("recusa saída sem valor seguro, área errada e endereço duplicado", () => {
    const base = { connectionId: "c", dataType: "BOOL", direction: "output" } as const;
    const r = IoMapSchema.safeParse({
      connections: [{ id: "c", kind: "modbus_tcp", host: "10.0.0.2" }],
      points: [
        { ...base, tag: "A", modbus: { area: "coil", address: 3 }, writeEnabled: true },
        { ...base, tag: "B", modbus: { area: "discrete_input", address: 4 } },
        { ...base, tag: "C", modbus: { area: "coil", address: 3 }, safeValue: false },
      ],
    });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message).join(" | ");
    expect(msgs).toContain("valor seguro");
    expect(msgs).toContain("bobina");
    expect(msgs).toContain("mesmo endereço");
  });

  it("mapa inválido vira vazio (nunca escreve por engano)", () => {
    const r = parseIoMap({ connections: [], points: [{ tag: "X" }] });
    expect(r.map.points).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("pacote do programa", () => {
  it("hash estável e verificação detecta adulteração", async () => {
    const p = await pkg();
    const h = await runtimePackageHash(p);
    expect(await runtimePackageHash(JSON.parse(JSON.stringify(p)))).toBe(h);
    expect((await verifyRuntimePackage(p, h)).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(p)) as RuntimePackage;
    tampered.ioMap.points[2].safeValue = true;
    expect((await verifyRuntimePackage(tampered, h)).ok).toBe(false);
  });

  it("sem lógica não empacota", async () => {
    const r = await buildRuntimePackage({
      projectId: PROJECT,
      projectName: "x",
      scanMs: 20,
      rungs: [],
      studio: null,
      hmi: null,
      ioMap: IO,
    });
    expect(r.ok).toBe(false);
  });
});

describe("núcleo e guarda de escrita", () => {
  it("sombra: executa a lógica mas não escreve no campo", async () => {
    const core = new RuntimeCore(await pkg());
    core.setTrust(true, true);
    feed(core, 0, true);
    core.setCommand("M1_PARTIR", true);
    const out = core.scan(0);
    expect(out.desired.K1).toBe(true);
    expect(out.decision.mode).toBe("SHADOW");
    expect(out.decision.writes).toHaveLength(0);
  });

  it("não arma sem aprovação, sem emergência íntegra ou sem comunicação", async () => {
    const core = new RuntimeCore(await pkg());
    feed(core, 0, true);
    expect(core.guard.arm(core.conditions(0)).ok).toBe(false); // sem aprovação
    core.setTrust(true, true);
    feed(core, 0, false);
    const r = core.guard.arm(core.conditions(0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers.join()).toContain("emergência");
    feed(core, 0, true);
    expect(core.guard.arm(core.conditions(5000)).ok).toBe(false); // leitura velha
    expect(core.guard.arm(core.conditions(10)).ok).toBe(true);
  });

  it("armado escreve; emergência atuada trava em SEGURO e não religa sozinho", async () => {
    const core = new RuntimeCore(await pkg());
    core.setTrust(true, true);
    feed(core, 0, true);
    expect(core.guard.arm(core.conditions(0)).ok).toBe(true);
    core.setCommand("M1_PARTIR", true);
    let out = core.scan(0);
    expect(out.decision.mode).toBe("RUN");
    expect(out.decision.writes).toEqual([expect.objectContaining({ value: true })]);
    core.setCommand("M1_PARTIR", false);
    out = core.scan(20);
    expect(out.decision.writes[0].value).toBe(true); // selo mantém

    feed(core, 30, false); // emergência atuada
    out = core.scan(40);
    expect(out.decision.mode).toBe("SAFE");
    expect(out.decision.transition?.to).toBe("SAFE");
    expect(out.decision.writes[0].value).toBe(false);

    feed(core, 50, true); // emergência liberada
    out = core.scan(60);
    expect(out.decision.mode).toBe("SAFE"); // continua seguro até rearme local
    expect(out.decision.writes[0].value).toBe(false);
  });

  it("perda de comunicação em operação vai a SEGURO", async () => {
    const core = new RuntimeCore(await pkg());
    core.setTrust(true, true);
    feed(core, 0, true);
    core.guard.arm(core.conditions(0));
    expect(core.scan(0).decision.mode).toBe("RUN");
    const out = core.scan(2000); // nenhuma leitura nova há 2 s
    expect(out.decision.mode).toBe("SAFE");
    expect(out.decision.blockers.join()).toMatch(/comunicação|atrasado|estourado/);
  });

  it("comando de operador não atua direto em saída nem entrada do campo", async () => {
    const core = new RuntimeCore(await pkg());
    expect(core.setCommand("K1", true)).toBe(false);
    expect(core.setCommand("S0_OK", true)).toBe(false);
    expect(core.setCommand("M1_PARTIR", true)).toBe(true);
  });

  it("saída começa no valor seguro e valor fora do limite vai a SEGURO", async () => {
    const io = IoMapSchema.parse({
      connections: [{ id: "c", kind: "modbus_tcp", host: "10.0.0.3" }],
      points: [
        {
          tag: "S0_OK",
          direction: "input",
          dataType: "BOOL",
          connectionId: "c",
          modbus: { area: "discrete_input", address: 0 },
        },
        {
          tag: "VEL",
          direction: "output",
          dataType: "INT",
          connectionId: "c",
          modbus: { area: "holding_register", address: 10 },
          writeEnabled: true,
          safeValue: 0,
          min: 0,
          max: 100,
        },
      ],
      estopTag: "S0_OK",
    });
    const rung: LadderRung = {
      id: "m",
      label: "mov",
      cols: 2,
      cells: [
        [
          { kind: "XIC", operand: "S0_OK" },
          { kind: "OTE", operand: "K9" },
        ],
      ],
    };
    const r = await buildRuntimePackage({
      projectId: PROJECT,
      projectName: "a",
      scanMs: 20,
      rungs: [rung],
      studio: null,
      hmi: null,
      ioMap: io,
      initialTags: { VEL: 150 },
    });
    if (!r.ok) throw new Error(r.errors.join());
    const core = new RuntimeCore(r.pkg);
    core.setTrust(true, true);
    core.applyInputs([{ tag: "S0_OK", value: true, ok: true, at: 0 }]);
    expect(core.guard.arm(core.conditions(0)).ok).toBe(true);
    // a lógica não escreve VEL; o valor inicial (150) não pode sair para o campo
    // — só o valor seguro é carregado na imagem das saídas
    const out = core.scan(0);
    expect(out.decision.writes.find((w) => w.point.tag === "VEL")?.value).toBe(0);
    const d = core.guard.decide({ VEL: 150 }, core.conditions(0));
    expect(d.mode).toBe("SAFE");
    expect(d.blockers.join()).toContain("fora dos limites");
    expect(d.writes[0].value).toBe(0);
  });
});
