import { describe, expect, it } from "vitest";
import type {
  CanonicalEquipment,
  ElectricalConnection,
  UnifiedProjectDoc,
} from "@/lib/model/unified-schema";
import { getCanonicalTerminalsForEquipment } from "@/lib/diagram/connection/terminal-library";
import type { NodeKind } from "@/lib/diagram/schema";
import {
  buildCrossReference,
  buildPanelDocumentation,
  buildWiring,
  designateDevices,
  extractLadderUsages,
  formatDesignation,
  parseDesignation,
} from "@/lib/documentation";

function eq(
  id: string,
  kind: NodeKind,
  tagCode: string,
  extra: Partial<CanonicalEquipment> = {},
): CanonicalEquipment {
  const category =
    kind === "motor"
      ? "load"
      : kind === "breaker"
        ? "protection"
        : kind === "contactor"
          ? "switching"
          : kind === "vfd"
            ? "drive"
            : kind === "transformer" || kind === "busbar"
              ? "source"
              : "protection";
  return {
    id,
    tagCode,
    displayName: id,
    catalogType: kind,
    category,
    phases: "3F",
    terminals: getCanonicalTerminalsForEquipment(id, kind),
    specs: {},
    ...extra,
  } as CanonicalEquipment;
}

function conn(
  id: string,
  from: string,
  to: string,
  extra: Partial<ElectricalConnection> = {},
): ElectricalConnection {
  return {
    id,
    fromEquipmentId: from,
    fromTerminalId: `${from}:out`,
    toEquipmentId: to,
    toTerminalId: `${to}:in`,
    kind: "power",
    ...extra,
  } as ElectricalConnection;
}

/** TR1 → Q0 → barramento W1 → (Q1 → K1 → F1 → M1) e (Q2 → T2 inversor → M2). */
function plant() {
  const equipments: CanonicalEquipment[] = [
    eq("tr", "transformer", "TR-1"),
    eq("q0", "breaker", "Q0"),
    eq("bus", "busbar", "W1"),
    eq("q1", "breaker", "Q1"),
    eq("k1", "contactor", "K1"),
    eq("f1", "thermal_relay", "F1"),
    eq("m1", "motor", "M1"),
    eq("q2", "breaker", "Q2"),
    eq("vfd", "vfd", "nó-sem-tag"),
    eq("m2", "motor", "M2"),
  ];
  const cable = { crossSectionMm2: 4, material: "Cu", insulation: "PVC", lengthM: 30 } as const;
  const connections: ElectricalConnection[] = [
    conn("c1", "tr", "q0", { circuitConfig: "3F+N+PE" }),
    conn("c2", "q0", "bus", { circuitConfig: "3F+N+PE" }),
    conn("c3", "bus", "q1", { circuitConfig: "3F" }),
    conn("c4", "q1", "k1", { circuitConfig: "3F" }),
    conn("c5", "k1", "f1", { circuitConfig: "3F" }),
    conn("c6", "f1", "m1", { conductor: { ...cable, installationMethod: "B1" } }),
    conn("c7", "bus", "q2", { circuitConfig: "3F" }),
    conn("c8", "q2", "vfd", { circuitConfig: "3F" }),
    conn("c9", "vfd", "m2"),
  ];
  const byId = Object.fromEntries(equipments.map((e) => [e.id, e]));
  return { equipments, connections, byId };
}

describe("identificação IEC 81346 (=planta +local -tag)", () => {
  it("formata e lê a designação completa", () => {
    expect(formatDesignation({ plant: "ETE", location: "QGBT", tag: "K3" })).toBe("=ETE+QGBT-K3");
    expect(formatDesignation({ tag: "-K3" })).toBe("-K3");
    expect(parseDesignation("=ETE+QGBT-K3")).toEqual({ plant: "ETE", location: "QGBT", tag: "K3" });
    expect(parseDesignation("=ETE+QGBT")).toBeNull();
  });

  it("não renomeia tags do usuário; sugere só para quem não tem tag válida, sem colidir", () => {
    const { equipments } = plant();
    const { devices, issues } = designateDevices(equipments, { plant: "ETE", location: "CCM1" });
    const vfd = devices.find((d) => d.equipmentId === "vfd")!;
    expect(vfd.suggested).toBe(true);
    expect(vfd.tag).toBe("T1"); // classe T (conversor) IEC 81346-2
    const tr = devices.find((d) => d.equipmentId === "tr")!;
    expect(tr.tag).toBe("TR-1"); // tag do usuário preservada
    expect(tr.suggested).toBe(false);
    expect(devices.find((d) => d.equipmentId === "k1")!.designation).toBe("=ETE+CCM1-K1");
    expect(devices.find((d) => d.equipmentId === "k1")!.suggested).toBe(false);
    expect(issues.some((i) => i.code === "INVALID_TAG")).toBe(true);
  });

  it("acusa designação duplicada, mas aceita a mesma tag em painéis diferentes", () => {
    const a = eq("a", "contactor", "K1");
    const b = eq("b", "contactor", "K1");
    expect(designateDevices([a, b]).issues.some((i) => i.code === "DUPLICATE_TAG")).toBe(true);
    const c = eq("c", "contactor", "K1", { specs: { custom: { location: "QD2" } } });
    expect(designateDevices([a, c]).issues.some((i) => i.code === "DUPLICATE_TAG")).toBe(false);
  });

  it("limpa caracteres perigosos dos aspectos (vão para planilha e PDF)", () => {
    expect(formatDesignation({ plant: '=cmd|"/c calc"', tag: "K1" })).toBe("=cmdccalc-K1");
  });
});

describe("fiação: terminais reais, potenciais, bornes e cabos", () => {
  const { equipments, connections, byId } = plant();
  const { devices } = designateDevices(equipments);
  const w = buildWiring(byId, connections, devices);

  it("usa os terminais IEC 60947 de cada equipamento (não 'L1' genérico)", () => {
    const k1f1 = w.wires.filter((x) => x.connectionId === "c5");
    expect(k1f1.map((x) => `${x.fromTerminal}>${x.toTerminal}`)).toEqual([
      "2/T1>1/L1",
      "4/T2>3/L2",
      "6/T3>5/L3",
    ]);
    const vfdMotor = w.wires.filter((x) => x.connectionId === "c9" && x.function !== "PE");
    expect(vfdMotor.map((x) => `${x.fromTerminal}>${x.toTerminal}`)).toEqual([
      "U>U1",
      "V>V1",
      "W>W1",
    ]);
  });

  it("mesmo potencial = mesmo número (o barramento equipotencializa por fase)", () => {
    const l1 = (id: string) => w.wires.find((x) => x.connectionId === id && x.function === "L1")!;
    expect(l1("c2").wireNumber).toBe(l1("c3").wireNumber);
    expect(l1("c3").wireNumber).toBe(l1("c7").wireNumber);
    // depois do disjuntor é outro potencial
    expect(l1("c4").wireNumber).not.toBe(l1("c3").wireNumber);
    // fases diferentes nunca compartilham potencial
    const l2 = w.wires.find((x) => x.connectionId === "c3" && x.function === "L2")!;
    expect(l2.wireNumber).not.toBe(l1("c3").wireNumber);
    expect(w.wires.filter((x) => x.function === "PE").every((x) => x.wireNumber === "PE")).toBe(
      true,
    );
  });

  it("motor DOL: 4 bornes (U1, V1, W1, PE) vindos do relé térmico REAL, não de um contator inventado", () => {
    const m1 = w.terminals.filter((t) => t.fieldSide.endsWith("-M1"));
    expect(m1.map((t) => t.fieldTerminal)).toEqual(["U1", "V1", "W1", "PE"]);
    expect(m1.slice(0, 3).map((t) => t.panelSide)).toEqual(["-F1", "-F1", "-F1"]);
    expect(m1.slice(0, 3).map((t) => t.panelTerminal)).toEqual(["2/T1", "4/T2", "6/T3"]);
    expect(m1[3].panelSide).toBe("-PE"); // barra PE do painel
    expect(new Set(w.terminals.map((t) => `${t.strip}:${t.terminal}`)).size).toBe(
      w.terminals.length,
    ); // bornes únicos
  });

  it("motor com inversor: bornes ligados às saídas U/V/W do inversor", () => {
    const m2 = w.terminals.filter((t) => t.fieldSide.endsWith("-M2") && t.function !== "PE");
    expect(m2.map((t) => t.panelTerminal)).toEqual(["U", "V", "W"]);
    // o PE do motor vai ao PE_OUT do inversor (terminal real), não à barra
    const pe = w.terminals.find((t) => t.fieldSide.endsWith("-M2") && t.function === "PE")!;
    expect(pe.panelTerminal).toBe("PE_OUT");
  });

  it("lista de cabos: composição EPLAN (4G4 mm²) e alimentador do trafo sem borne", () => {
    const m1Cable = w.cables.find((c) => c.connectionId === "c6")!;
    expect(m1Cable.composition).toBe("4G4 mm²");
    expect(m1Cable.lengthM).toBe(30);
    const feeder = w.cables.find((c) => c.connectionId === "c1")!;
    expect(feeder.composition).toBe("5G? mm²");
    expect(w.terminals.some((t) => t.cable === feeder.cable)).toBe(false);
    // fiação interna do painel (Q1→K1) não é cabo
    expect(w.cables.some((c) => c.connectionId === "c4")).toBe(false);
  });

  it("seção/comprimento ausentes viram pendência (nada inventado)", () => {
    const m2Cable = w.cables.find((c) => c.connectionId === "c9")!;
    expect(m2Cable.sectionMm2).toBeNull();
    expect(m2Cable.lengthM).toBeNull();
    expect(w.issues.some((i) => i.code === "MISSING_SECTION" && i.connectionId === "c9")).toBe(
      true,
    );
    expect(w.issues.some((i) => i.code === "MISSING_LENGTH" && i.connectionId === "c9")).toBe(true);
  });

  it("motor alimentado sem PE explícito é erro normativo (NBR 5410)", () => {
    const bad = buildWiring(byId, [conn("x", "f1", "m1", { circuitConfig: "3F" })], devices);
    expect(bad.issues.some((i) => i.code === "MISSING_PE" && i.severity === "error")).toBe(true);
  });

  it("ligação para equipamento inexistente é sinalizada e ignorada", () => {
    const bad = buildWiring(byId, [conn("ghost", "q1", "nao-existe")], devices);
    expect(bad.wires).toHaveLength(0);
    expect(bad.issues[0].code).toBe("DANGLING_CONNECTION");
  });

  it("sinal de comando vira condutor único na régua -X2", () => {
    const pb = eq("s1", "estop", "S1", { category: "safety" });
    const all = { ...byId, s1: pb };
    const d = designateDevices(Object.values(all)).devices;
    const r = buildWiring(all, [conn("sig", "k1", "s1", { kind: "signal" })], d);
    expect(r.wires).toHaveLength(1);
    expect(r.wires[0].wireNumber).toBe("C1");
    expect(r.terminals[0].strip).toBe("-X2");
  });
});

describe("referência cruzada bobina ↔ contatos (IEC 60947-5-1)", () => {
  const { equipments, byId } = plant();
  const { devices } = designateDevices(equipments);

  const rungs = [
    // selo: K1 = (S_START OR K1) AND NOT S_STOP AND F1(NF)
    {
      id: "r1",
      output: { kind: "OTE", operand: "K1_COIL" },
      branches: [
        [
          { kind: "XIC", operand: "K1" },
          { kind: "XIO", operand: "F1" },
        ],
      ],
    },
    {
      id: "r2",
      output: { kind: "OTE", operand: "H1" },
      branches: [[{ kind: "XIC", operand: "K1" }]],
    },
    {
      id: "r3",
      output: { kind: "OTE", operand: "H2" },
      branches: [[{ kind: "XIO", operand: "K1" }]],
    },
  ];

  it("extrai usos de qualquer formato de rede, com limites contra dados hostis", () => {
    const u = extractLadderUsages(rungs);
    expect(u.filter((x) => x.role === "coil")).toHaveLength(3);
    expect(u.find((x) => x.operand === "F1")).toMatchObject({ role: "nc", location: "Rede 1" });
    // estrutura profundamente aninhada não estoura a pilha
    let deep: Record<string, unknown> = { kind: "XIC", operand: "K1" };
    for (let i = 0; i < 5000; i++) deep = { child: deep };
    expect(() => extractLadderUsages([deep])).not.toThrow();
  });

  it("imagem de contatos: potência 1-2/3-4/5-6, NA 13-14, NA 23-24, NF 31-32", () => {
    const { rows } = buildCrossReference({
      equipmentsById: byId,
      devices,
      usages: extractLadderUsages(rungs),
      poweredEquipmentIds: new Set(["k1"]),
    });
    const k1 = rows.find((r) => r.equipmentId === "k1")!;
    expect(k1.coilLocations).toEqual(["Rede 1"]);
    expect(k1.contacts.map((c) => c.terminals)).toEqual([
      "1-2",
      "3-4",
      "5-6",
      "13-14",
      "23-24",
      "31-32",
    ]);
    expect(k1.summary).toBe("3 NA de potência + 2 NA + 1 NF");
    const f1 = rows.find((r) => r.equipmentId === "f1")!;
    expect(f1.contacts).toEqual([{ terminals: "95-96", type: "NC", location: "Rede 1" }]);
  });

  it("aponta bobina dupla, contato sem bobina e bloco auxiliar necessário", () => {
    const usages = [
      { operand: "K1", role: "coil" as const, location: "Rede 1" },
      { operand: "K1", role: "coil" as const, location: "Rede 7" },
      { operand: "K1", role: "no" as const, location: "Rede 2" },
      { operand: "K1", role: "no" as const, location: "Rede 3" },
      { operand: "F1", role: "nc" as const, location: "Rede 1" },
      { operand: "F1", role: "nc" as const, location: "Rede 4" },
    ];
    const extra = eq("k9", "contactor", "K9");
    const all = { ...byId, k9: extra };
    const d = designateDevices(Object.values(all)).devices;
    const { issues } = buildCrossReference({
      equipmentsById: all,
      devices: d,
      usages: [...usages, { operand: "K9_FB", role: "no", location: "Rede 5" }],
    });
    const codes = issues.map((i) => `${i.code}:${i.equipmentId}`);
    expect(codes).toContain("DOUBLE_COIL:k1");
    expect(codes).toContain("AUX_BLOCK_REQUIRED:k1");
    expect(codes).toContain("CONTACTS_EXCEEDED:f1");
    expect(codes).toContain("CONTACT_WITHOUT_COIL:k9");
  });
});

describe("pacote completo", () => {
  it("monta tudo a partir do UnifiedProjectDoc e ordena erros primeiro", () => {
    const { equipments, connections } = plant();
    const doc = {
      engineering: {
        equipments: Object.fromEntries(equipments.map((e) => [e.id, e])),
        connections: Object.fromEntries(connections.map((c) => [c.id, c])),
        tags: {},
      },
      plc: { project: { programBlocks: [] } },
    } as unknown as UnifiedProjectDoc;
    const pkg = buildPanelDocumentation(doc, {
      plant: "ETE",
      location: "CCM1",
      ladderRungs: [{ output: { kind: "OTE", operand: "K1" } }],
    });
    expect(pkg.devices.length).toBe(10);
    expect(pkg.cables.length).toBeGreaterThan(0);
    expect(pkg.terminals.length).toBe(8); // M1 (4) + M2 (4)
    expect(pkg.crossReference.find((r) => r.equipmentId === "k1")?.coilLocations).toEqual([
      "Rede 1",
    ]);
    const firstNonError = pkg.issues.findIndex((i) => i.severity !== "error");
    expect(pkg.issues.slice(firstNonError).every((i) => i.severity !== "error")).toBe(true);
  });
});

describe("dossiê — planilha EPLAN e defesa contra injeção de fórmula", () => {
  it("abas novas presentes e nenhuma célula de texto começa com fórmula", async () => {
    const { assembleCompleteDossier } = await import("@/lib/dossier/dossier.functions");
    const { buildDossierExcelWorkbook, buildBomCsv } =
      await import("@/lib/dossier/export-spreadsheets");
    const { XLSX } = await import("@/lib/security/safe-xlsx");
    const hostile = '=HYPERLINK("http://evil","x")';
    const snapshot = {
      schemaVersion: 3,
      project: {
        nodes: [
          {
            id: "q1",
            kind: "breaker",
            label: hostile,
            params: { In: 32, poles: 3, tag: hostile },
            position: { x: 0, y: 0 },
          },
          {
            id: "m1",
            kind: "motor",
            label: "+cmd|calc",
            params: { P: 5.5 },
            position: { x: 0, y: 99 },
          },
        ],
        edges: [{ id: "e1", source: "q1", target: "m1", kind: "power" }],
        tags: {},
        scadaLayout: { nodes: [], edges: [] },
      },
      voltai: { components: [], edges: [] },
      editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
      plc: {
        vendor: "siemens",
        rack: { id: "r", label: "r", modules: [] },
        variables: [],
        programBlocks: [],
        cycleTimeMs: 10,
      },
    };
    const dossier = assembleCompleteDossier({
      projectId: "p",
      projectName: "P",
      snapshot: snapshot as never,
    });
    const wb = XLSX.read(buildDossierExcelWorkbook(dossier), { type: "array" });
    for (const name of ["Dispositivos", "Lista de Cabos", "Referência Cruzada", "Verificação"]) {
      expect(wb.SheetNames).toContain(name);
    }
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);
      for (const row of rows) {
        for (const v of Object.values(row)) {
          if (typeof v !== "string") continue;
          // designação EPLAN pura é permitida; qualquer outra coisa iniciando
          // com operador de fórmula precisa estar neutralizada
          const plainDesignation = /^(?:[=+-][A-Za-z0-9_.]{1,24}){1,3}$/.test(v);
          if (!plainDesignation) expect(v, `${name}: ${v}`).not.toMatch(/^[=+\-@\t\r|]/);
          expect(v, `${name}: ${v}`).not.toMatch(/^[=+\-@].*[(|!"]/);
        }
      }
    }
    const csv = buildBomCsv(dossier);
    for (const line of csv.split("\n").slice(1)) {
      for (const field of line.split(";")) {
        expect(field.replace(/^"/, "")).not.toMatch(/^[=+@]/);
      }
    }
  });
});
