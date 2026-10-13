// Testes da ponte Unifilar → Ladder (análise pura, sem I/O).
// A persistência (saveMappings/loadMappings) fica fora do escopo aqui — ela
// depende de rede; o que se garante é que a análise e a geração de programa
// são determinísticas e produzem ST/IL importáveis pelo editor Ladder.
import { describe, expect, it } from "vitest";
import {
  analyzeUnifilarForLadder,
  generateILFromMappings,
  generateSTFromMappings,
  type UnifilarLadderMapping,
} from "@/lib/simulation/unifilar-ladder-bridge";
import { importLadderProgram } from "@/lib/ladder/importer";
import type { IndustrialEdge, IndustrialNode } from "@/lib/project-store";

function node(
  id: string,
  kind: IndustrialNode["kind"],
  label: string,
  category: IndustrialNode["category"] = "power",
): IndustrialNode {
  return { id, kind, label, category, position: { x: 0, y: 0 }, params: {} };
}

function edge(source: string, target: string): IndustrialEdge {
  return { id: `e_${source}_${target}`, source, target, kind: "power" };
}

const PLANT: IndustrialNode[] = [
  node("n_bus", "busbar", "Barra 380V"),
  node("n_m01", "motor", "M01"),
  node("n_m02", "motor", "M02"),
  node("n_p01", "pump", "Bomba P01"),
  node("n_ex01", "motor", "Exaustor EX01"),
  node("n_ex02", "motor", "Exaustor 2"),
  node("n_q1", "breaker", "Q1"),
  node("n_vfd1", "vfd", "FI-01"),
  node("n_es", "estop", "PS-01"),
];

const PLANT_EDGES: IndustrialEdge[] = [
  edge("n_bus", "n_m01"),
  edge("n_bus", "n_m02"),
  edge("n_bus", "n_p01"),
  edge("n_bus", "n_ex01"),
  edge("n_bus", "n_ex02"),
];

describe("analyzeUnifilarForLadder", () => {
  it("rejeita diagrama vazio", () => {
    const r = analyzeUnifilarForLadder([], []);
    expect(r.success).toBe(false);
    expect(r.mappings).toHaveLength(0);
    expect(r.errors).toContain("Diagrama unifilar vazio");
  });

  it("classifica cargas motoras e separa exaustores por rótulo", () => {
    const r = analyzeUnifilarForLadder(PLANT, PLANT_EDGES);

    const motors = r.mappings.filter((m) => m.equipmentType === "motor");
    const exhaustors = r.mappings.filter((m) => m.equipmentType === "exhaustor");

    // M01, M02 e P01 são cargas motoras; os dois exaustores saem da lista.
    expect(motors).toHaveLength(3);
    expect(exhaustors).toHaveLength(2);
    expect(motors.map((m) => m.unifilarNodeId)).toEqual(["n_m01", "n_m02", "n_p01"]);
    expect(exhaustors.map((m) => m.unifilarNodeId)).toEqual(["n_ex01", "n_ex02"]);
  });

  it("detecta exaustores mesmo quando o kind é genérico (NodeKind não tem 'exhaustor')", () => {
    const nodes = [
      node("n_fan", "conveyor", "Ventilador de teto"),
      node("n_ex", "screw", "EX-204 exaustor de fumaça"),
      node("n_belt", "conveyor", "Esteira 1"),
    ];
    const r = analyzeUnifilarForLadder(nodes, []);
    const kinds = r.mappings.map((m) => `${m.unifilarNodeId}:${m.equipmentType}`);

    expect(kinds).toContain("n_fan:exhaustor");
    expect(kinds).toContain("n_ex:exhaustor");
    expect(kinds).toContain("n_belt:motor");
  });

  it("gera tags únicas e com prefixo por tipo", () => {
    const r = analyzeUnifilarForLadder(PLANT, PLANT_EDGES);
    const tags = r.mappings.map((m) => m.ladderTagName);

    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.some((t) => t.startsWith("MTR_"))).toBe(true);
    expect(tags.some((t) => t.startsWith("EXO_"))).toBe(true);
    expect(tags.some((t) => t.startsWith("BRK_"))).toBe(true);
    expect(tags.some((t) => t.startsWith("VFD_"))).toBe(true);
    expect(tags.some((t) => t.startsWith("ES_"))).toBe(true);
  });

  it("sinaliza carga sem conexão de potência de origem", () => {
    const nodes = [node("n_m01", "motor", "M01")];
    const r = analyzeUnifilarForLadder(nodes, []);
    expect(r.warnings.some((w) => w.includes("sem conexão de potência"))).toBe(true);
  });

  it("limita o programa gerado a 8 cargas motoras e avisa", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      node(`n_m${i}`, "motor", `M${String(i + 1).padStart(2, "0")}`),
    );
    const edges = many.map((n) => edge("n_bus", n.id));
    const r = analyzeUnifilarForLadder([node("n_bus", "busbar", "Barra"), ...many], edges);

    expect(r.warnings.some((w) => w.includes("cargas motoras"))).toBe(true);
    expect(r.mappings.filter((m) => m.equipmentType === "motor")).toHaveLength(8);
  });

  it("falha quando nenhum componente é reconhecível", () => {
    const r = analyzeUnifilarForLadder([node("n_x", "label", "Nota")], []);
    expect(r.success).toBe(false);
    expect(r.errors[0]).toContain("Nenhum equipamento reconhecível");
  });

  it("é determinístico: mesma entrada → mesmo resultado", () => {
    expect(analyzeUnifilarForLadder(PLANT, PLANT_EDGES)).toEqual(
      analyzeUnifilarForLadder(PLANT, PLANT_EDGES),
    );
  });

  it("o programa ST gerado é importável pelo editor Ladder", () => {
    const r = analyzeUnifilarForLadder(PLANT, PLANT_EDGES);
    expect(r.ladderProgram).toBeDefined();

    const imported = importLadderProgram(r.ladderProgram!.stCode, "ST");
    expect(imported.rungs.length).toBeGreaterThan(0);
    expect(imported.rungs.length).toBe(r.ladderProgram!.rungsCount);
  });
});

describe("geração de programa", () => {
  const mappings: UnifilarLadderMapping[] = [
    {
      unifilarNodeId: "n_m01",
      ladderTagName: "MTR_M01_CMD",
      equipmentType: "motor",
      equipmentId: "M01",
      mappingType: "command",
      isPrimary: true,
    },
    {
      unifilarNodeId: "n_es",
      ladderTagName: "ES_SISTEMA",
      equipmentType: "estop",
      equipmentId: "SISTEMA",
      mappingType: "protection",
      isPrimary: true,
    },
    {
      unifilarNodeId: "n_q1",
      ladderTagName: "BRK_01",
      equipmentType: "breaker",
      equipmentId: "01",
      mappingType: "protection",
      isPrimary: false,
    },
    {
      unifilarNodeId: "n_pt",
      ladderTagName: "SNS_01",
      equipmentType: "sensor",
      equipmentId: "01",
      mappingType: "feedback",
      isPrimary: false,
    },
  ];

  it("o ST inclui a sela de partida com corte por E-STOP", () => {
    const st = generateSTFromMappings(mappings, false);
    const rung = st.split("\n").find((l) => l.startsWith("SISTEMA_ON :="));

    expect(rung).toBeDefined();
    expect(rung).toContain("SISTEMA_START");
    expect(rung).toContain("SISTEMA_STOP");
    expect(rung).toContain("ES_SISTEMA");
    expect(rung).toContain("NOT");
  });

  it("gera uma linha por mapeamento com o sufixo adequado ao tipo", () => {
    const st = generateSTFromMappings(mappings, false);
    expect(st).toContain("MTR_M01_CMD := SISTEMA_ON;");
    expect(st).toContain("BRK_01_PERM := BRK_01 AND SISTEMA_ON;");
    expect(st).toContain("SNS_01_OK := SNS_01;");
  });

  it("inclui o rung térmico dos exaustores só quando solicitado", () => {
    expect(generateSTFromMappings(mappings, true)).toContain("EXO_TERMICO");
    expect(generateSTFromMappings(mappings, false)).not.toContain("EXO_TERMICO");
  });

  it("gera IL equivalente no dialeto do importador (LD/ST/AND/OR/NOT)", () => {
    const il = generateILFromMappings(mappings, false);

    expect(il).toContain("LD SISTEMA_START");
    expect(il).toContain("AND NOT ES_SISTEMA");
    expect(il).toContain("ST SISTEMA_ON");
    expect(il).toContain("ST MTR_M01_CMD");

    const imported = importLadderProgram(il, "IL");
    expect(imported.rungs.length).toBeGreaterThan(0);
  });
});
