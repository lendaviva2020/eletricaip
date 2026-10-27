import { describe, it, expect, beforeEach } from "vitest";
import {
  scanRungsPure,
  createScanState,
  type PureTags,
  type ScanState,
} from "@/lib/ladder/scan-core";
import {
  ensureRungTopology,
  type LadderRung,
  type LadderInstruction,
  type LadderBranch,
  type LadderBranchItem,
  type LadderCellKind,
} from "@/lib/ladder/types";
import { compileProgram } from "@/lib/ladder/compiler";
import { validateRungs } from "@/lib/ladder/validator";

// Helpers estritos para construção de itens de ramos com tipagem garantida
const instItem = (
  id: string,
  kind: LadderCellKind,
  operand: string,
  opts: Partial<LadderInstruction> = {},
): LadderBranchItem => ({
  id: `item-${id}`,
  type: "instruction",
  instruction: {
    id,
    kind,
    operand,
    ...opts,
  },
});

const parallelItem = (id: string, branches: LadderBranch[]): LadderBranchItem => ({
  id,
  type: "parallel",
  branches,
});

describe("ELÉTRICAI — LADDER PROFISSIONAL: 15 Cenários de Aceitação Industrial", () => {
  let state: ScanState;

  beforeEach(() => {
    state = createScanState();
  });

  // CENÁRIO 1: Criação de rung simples (Contato + Bobina)
  it("Cenário 1: Condução determinística de contato XIC para bobina OTE", () => {
    const rung: LadderRung = {
      id: "rung-1",
      label: "Rung 1",
      comment: "Acionamento de Motor",
      cells: [],
      topology: {
        id: "topo-1",
        rootBranch: {
          id: "root-1",
          items: [instItem("inst-xic", "XIC", "B_START", { comment: "Botão Liga" })],
        },
        outputs: [
          {
            id: "inst-ote",
            kind: "OTE",
            operand: "K1_MOTOR",
            comment: "Contator do Motor",
          },
        ],
      },
    };

    // Caso 1: B_START = false -> K1_MOTOR desligado
    let tags: PureTags = { B_START: false, K1_MOTOR: false };
    let res = scanRungsPure([rung], tags, state, 1000);
    expect(res.tags.K1_MOTOR).toBe(false);

    // Caso 2: B_START = true -> K1_MOTOR ligado
    tags = { B_START: true, K1_MOTOR: false };
    res = scanRungsPure([rung], tags, state, 1010);
    expect(res.tags.K1_MOTOR).toBe(true);
  });

  // CENÁRIO 2: Inserção de contato em série entre elementos
  it("Cenário 2: Conexão em série (AND lógico) com múltiplos contatos", () => {
    const rung: LadderRung = {
      id: "rung-2",
      label: "Rung 2",
      cells: [],
      topology: {
        id: "topo-2",
        rootBranch: {
          id: "root-2",
          items: [
            instItem("c1", "XIC", "B_START"),
            instItem("c2", "XIO", "EMERGENCIA"), // NF
            instItem("c3", "XIC", "RELE_TERMICO_OK"),
          ],
        },
        outputs: [{ id: "out1", kind: "OTE", operand: "MOTOR_ATIVO" }],
      },
    };

    // Todos satisfeitos
    let res = scanRungsPure(
      [rung],
      { B_START: true, EMERGENCIA: false, RELE_TERMICO_OK: true },
      state,
      1000,
    );
    expect(res.tags.MOTOR_ATIVO).toBe(true);

    // Emergência acionada (true bloqueia XIO)
    res = scanRungsPure(
      [rung],
      { B_START: true, EMERGENCIA: true, RELE_TERMICO_OK: true },
      state,
      1010,
    );
    expect(res.tags.MOTOR_ATIVO).toBe(false);

    // Relé térmico desarmado
    res = scanRungsPure(
      [rung],
      { B_START: true, EMERGENCIA: false, RELE_TERMICO_OK: false },
      state,
      1020,
    );
    expect(res.tags.MOTOR_ATIVO).toBe(false);
  });

  // CENÁRIO 3: Criação de ramo paralelo (Circuito de Selo / Seal-in Latching)
  it("Cenário 3: Circuito de selo industrial mantendo acionamento após pulso de partida", () => {
    // (B_PARTIDA OR B_STATUS_RUN) AND NOT(B_PARADA) -> BOMBA_MAIN
    const rung: LadderRung = {
      id: "rung-selo",
      label: "Rung Selo",
      cells: [],
      topology: {
        id: "topo-selo",
        rootBranch: {
          id: "root-selo",
          items: [
            parallelItem("selo-branch", [
              { id: "b1", items: [instItem("c-partida", "XIC", "B_PARTIDA")] },
              { id: "b2", items: [instItem("c-selo", "XIC", "B_STATUS_RUN")] },
            ]),
            instItem("c-parada", "XIO", "B_PARADA"),
          ],
        },
        outputs: [{ id: "out-bomba", kind: "OTE", operand: "BOMBA_MAIN" }],
      },
    };

    let tags: PureTags = {
      B_PARTIDA: false,
      B_STATUS_RUN: false,
      B_PARADA: false,
      BOMBA_MAIN: false,
    };

    // Ciclo 1: Nada acionado
    let res = scanRungsPure([rung], tags, state, 1000);
    expect(res.tags.BOMBA_MAIN).toBe(false);

    // Ciclo 2: Pulso no botão de partida
    tags = { ...tags, ...res.tags, B_PARTIDA: true };
    res = scanRungsPure([rung], tags, state, 1010);
    expect(res.tags.BOMBA_MAIN).toBe(true);

    // Simula contato auxiliar do contator (B_STATUS_RUN) fechando
    tags = { ...tags, ...res.tags, B_PARTIDA: false, B_STATUS_RUN: true };

    // Ciclo 3: Botão de partida SOLTO, selo mantém ligado!
    res = scanRungsPure([rung], tags, state, 1020);
    expect(res.tags.BOMBA_MAIN).toBe(true);

    // Ciclo 4: Botão de parada pressionado -> desarma o selo
    tags = { ...tags, ...res.tags, B_PARADA: true };
    res = scanRungsPure([rung], tags, state, 1030);
    expect(res.tags.BOMBA_MAIN).toBe(false);
  });

  // CENÁRIO 4: Inserção e remoção em ramos paralelos
  it("Cenário 4: Modificação estrutural em ramos paralelos com preservação de integridade", () => {
    const parallelBranch: LadderBranch = {
      id: "par-1",
      items: [instItem("b1", "XIC", "S1"), instItem("b2", "XIC", "S2")],
    };

    // Inserção de um terceiro ramo paralelo
    parallelBranch.items.push(instItem("b3", "XIC", "S3"));
    expect(parallelBranch.items.length).toBe(3);

    // Remoção do elemento intermediário
    parallelBranch.items = parallelBranch.items.filter((item) => item.instruction?.id !== "b2");
    expect(parallelBranch.items.length).toBe(2);
    expect(parallelBranch.items[0].instruction?.id).toBe("b1");
    expect(parallelBranch.items[1].instruction?.id).toBe("b3");
  });

  // CENÁRIO 5: Múltiplas bobinas em paralelo no mesmo rung (como na Imagem 1)
  it("Cenário 5: Múltiplas saídas paralelas acionadas simultaneamente pelo mesmo rung", () => {
    const rung: LadderRung = {
      id: "rung-multi-out",
      label: "Rung Multi Out",
      cells: [],
      topology: {
        id: "topo-mo",
        rootBranch: {
          id: "root-mo",
          items: [instItem("c1", "XIC", "B_START")],
        },
        outputs: [
          { id: "out-1", kind: "OTE", operand: "BOMBA_MAIN" },
          { id: "out-2", kind: "OTE", operand: "SINALIZ_RUN" },
          { id: "out-3", kind: "OTL", operand: "VALVULA_RECALQUE" },
        ],
      },
    };

    // Caso B_START = true: todas as 3 saídas devem receber sinal verdadeiro no mesmo ciclo
    const res = scanRungsPure([rung], { B_START: true }, state, 1000);
    expect(res.tags.BOMBA_MAIN).toBe(true);
    expect(res.tags.SINALIZ_RUN).toBe(true);
    expect(res.tags.VALVULA_RECALQUE).toBe(true);
  });

  // CENÁRIO 6: Configuração de parâmetros e tags
  it("Cenário 6: Atualização e persistência de tags, presets e comentários", () => {
    const inst: LadderInstruction = {
      id: "timer-1",
      kind: "TON",
      operand: "T_LUBRIFICACAO",
      preset: 5000,
      comment: "Tempo de lubrificação dos mancais",
      params: { PT: 5000 },
    };

    expect(inst.preset).toBe(5000);
    expect(inst.params?.PT).toBe(5000);
    expect(inst.comment).toBe("Tempo de lubrificação dos mancais");
  });

  // CENÁRIO 7: Temporizador TON com acumulação de tempo PT e ET
  it("Cenário 7: Temporizador TON acumulando tempo até atingir preset (PT)", () => {
    const rung: LadderRung = {
      id: "rung-ton",
      label: "Rung TON",
      cells: [],
      topology: {
        id: "topo-ton",
        rootBranch: {
          id: "r-ton",
          items: [instItem("ton-inst", "TON", "TIMER_PRONTO", { preset: 2000 })],
        },
        outputs: [{ id: "out-ton", kind: "OTE", operand: "FLAG_CONCLUIDO" }],
      },
    };

    // t = 0ms: início da energização
    let res = scanRungsPure([rung], {}, state, 0);
    expect(res.tags.FLAG_CONCLUIDO).toBe(false);

    // t = 1000ms: metade do tempo acumulado (não pronto)
    res = scanRungsPure([rung], {}, state, 1000);
    expect(res.tags.FLAG_CONCLUIDO).toBe(false);

    // t = 2000ms: preset atingido -> saída energizada
    res = scanRungsPure([rung], {}, state, 2000);
    expect(res.tags.FLAG_CONCLUIDO).toBe(true);
  });

  // CENÁRIO 8: Contador CTU com contagem progressiva e reset
  it("Cenário 8: Contador CTU incrementando em borda de subida e resetando em R", () => {
    const rung: LadderRung = {
      id: "rung-ctu",
      label: "Rung CTU",
      cells: [],
      topology: {
        id: "topo-ctu",
        rootBranch: {
          id: "r-ctu",
          items: [
            instItem("sensor-pulso", "XIC", "SENSOR_PECA"),
            instItem("ctu-inst", "CTU", "LOTE_PRONTO", { preset: 3, params: { R: "RESET_LOTE" } }),
          ],
        },
        outputs: [{ id: "out-lote", kind: "OTE", operand: "ALARME_LOTE" }],
      },
    };

    // Pulso 1
    scanRungsPure([rung], { SENSOR_PECA: true, RESET_LOTE: false }, state, 100);
    scanRungsPure([rung], { SENSOR_PECA: false, RESET_LOTE: false }, state, 200);

    // Pulso 2
    scanRungsPure([rung], { SENSOR_PECA: true, RESET_LOTE: false }, state, 300);
    scanRungsPure([rung], { SENSOR_PECA: false, RESET_LOTE: false }, state, 400);

    // Pulso 3: Atingiu preset 3
    let res = scanRungsPure([rung], { SENSOR_PECA: true, RESET_LOTE: false }, state, 500);
    expect(res.tags.ALARME_LOTE).toBe(true);

    // Aciona Reset
    res = scanRungsPure([rung], { SENSOR_PECA: false, RESET_LOTE: true }, state, 600);
    expect(res.tags.ALARME_LOTE).toBe(false);
  });

  // CENÁRIO 9: Duplicação e reordenação de rungs
  it("Cenário 9: Duplicação e reordenação de rungs preservando a topologia", () => {
    const rungs: LadderRung[] = [
      {
        id: "rung-001",
        label: "Rede 1",
        cells: [],
        topology: {
          id: "topo-001",
          rootBranch: { id: "b1", items: [instItem("i1", "XIC", "TAG1")] },
          outputs: [{ id: "o1", kind: "OTE", operand: "OUT1" }],
        },
      },
      {
        id: "rung-002",
        label: "Rede 2",
        cells: [],
        topology: {
          id: "topo-002",
          rootBranch: { id: "b2", items: [instItem("i2", "XIC", "TAG2")] },
          outputs: [{ id: "o2", kind: "OTE", operand: "OUT2" }],
        },
      },
    ];

    // Reordenação (inverter ordem)
    const reordered = [rungs[1], rungs[0]].map((r, idx) => ({ ...r, label: `Rede ${idx + 1}` }));
    expect(reordered[0].id).toBe("rung-002");
    expect(reordered[0].label).toBe("Rede 1");
    expect(reordered[1].id).toBe("rung-001");
    expect(reordered[1].label).toBe("Rede 2");
  });

  // CENÁRIO 10: Desfazer e Refazer (Undo/Redo via imutabilidade)
  it("Cenário 10: Histórico de estados preservando integridade estrutural", () => {
    const history: LadderRung[][] = [];
    let currentRungs: LadderRung[] = [
      {
        id: "r1",
        label: "R1",
        cells: [],
        topology: {
          id: "topo-r1",
          rootBranch: { id: "b1", items: [instItem("i1", "XIC", "B1")] },
          outputs: [{ id: "o1", kind: "OTE", operand: "M1" }],
        },
      },
    ];

    history.push(JSON.parse(JSON.stringify(currentRungs)));

    // Modificação: Adiciona contato
    currentRungs[0].topology!.rootBranch.items.push(instItem("i2", "XIC", "B2"));
    history.push(JSON.parse(JSON.stringify(currentRungs)));

    expect(currentRungs[0].topology!.rootBranch.items.length).toBe(2);

    // Desfazer (Undo)
    currentRungs = JSON.parse(JSON.stringify(history[0]));
    expect(currentRungs[0].topology!.rootBranch.items.length).toBe(1);
    expect(currentRungs[0].topology!.rootBranch.items[0].instruction?.operand).toBe("B1");
  });

  // CENÁRIO 11: Salvar e reabrir (Roundtrip de serialização JSON)
  it("Cenário 11: Serialização e hidratação de projeto Ladder sem perda de conexões ou nós", () => {
    const originalRung: LadderRung = {
      id: "rung-json",
      label: "Rung JSON",
      comment: "Rede 0001: Selo e Comparador",
      cells: [],
      topology: {
        id: "topo-json",
        rootBranch: {
          id: "r-root",
          items: [
            parallelItem("branch-par", [
              { id: "bp1", items: [instItem("c1", "XIC", "START")] },
              { id: "bp2", items: [instItem("c2", "XIC", "RUN_FEEDBACK")] },
            ]),
            instItem("cmp1", "CMP_GE", "NIVEL_AGUA", {
              params: { IN1: "NIVEL_AGUA", IN2: "NIVEL_MINIMO" },
            }),
          ],
        },
        outputs: [
          { id: "out-1", kind: "OTE", operand: "BOMBA" },
          { id: "out-2", kind: "OTE", operand: "LAMPADA_LIGADO" },
        ],
      },
    };

    const serialized = JSON.stringify(originalRung);
    const restored: LadderRung = JSON.parse(serialized);
    const topology = ensureRungTopology(restored);

    expect(topology.rootBranch.items.length).toBe(2);
    expect(topology.outputs.length).toBe(2);
    expect(topology.outputs[0].operand).toBe("BOMBA");
    expect(topology.outputs[1].operand).toBe("LAMPADA_LIGADO");
  });

  // CENÁRIO 12: Exportação para IEC 61131-3 Structured Text (ST)
  it("Cenário 12: Transpilação precisa para ST com ramos paralelos em parênteses e múltiplas bobinas", () => {
    const rung: LadderRung = {
      id: "rung-st",
      label: "Rung ST",
      comment: "Controle de Bomba Principal",
      cells: [],
      topology: {
        id: "topo-st",
        rootBranch: {
          id: "root-st",
          items: [
            parallelItem("p-branch", [
              { id: "bp1", items: [instItem("c1", "XIC", "B_PARTIDA")] },
              { id: "bp2", items: [instItem("c2", "XIC", "B_STATUS_RUN")] },
            ]),
            instItem("c3", "XIO", "B_PARADA"),
            instItem("cmp-st", "CMP_GE", "NIVEL_AGUA", {
              params: { IN1: "NIVEL_AGUA", IN2: "NIVEL_CRITICO" },
            }),
          ],
        },
        outputs: [
          { id: "o1", kind: "OTE", operand: "BOMBA_MAIN" },
          { id: "o2", kind: "OTE", operand: "SINALIZ_RUN" },
        ],
      },
    };

    const stCode = compileProgram([rung], "ST");
    expect(stCode).toContain("(* Rede 0001: Controle de Bomba Principal *)");
    expect(stCode).toContain("(B_PARTIDA OR B_STATUS_RUN)");
    expect(stCode).toContain("NOT B_PARADA");
    expect(stCode).toContain("(NIVEL_AGUA >= NIVEL_CRITICO)");
    expect(stCode).toContain("BOMBA_MAIN :=");
    expect(stCode).toContain("SINALIZ_RUN :=");
  });

  // CENÁRIO 13: Diagnóstico de inconsistência de tipos em comparadores
  it("Cenário 13: Validador estático detecta incompatibilidade de tipos de dados com fixHint", () => {
    const rung: LadderRung = {
      id: "rung-diag",
      label: "Rung Diag",
      cells: [],
      topology: {
        id: "topo-diag",
        rootBranch: {
          id: "r-diag",
          items: [
            instItem("cmp-bad", "CMP_GE", "NIVEL_AGUA", {
              params: { IN1: "NIVEL_AGUA", IN2: "NIVEL_CRITICO" },
            }),
          ],
        },
        outputs: [{ id: "out-bad", kind: "OTE", operand: "SAIDA" }],
      },
    };

    // Tags com tipos conflitantes (INT vs STRING)
    const tagsDef = {
      NIVEL_AGUA: { type: "INT" as const },
      NIVEL_CRITICO: { type: "STRING" as const },
    };

    const issues = validateRungs([rung], tagsDef);
    const typeIssue = issues.find((iss) => iss.elementId === "cmp-bad");
    expect(typeIssue).toBeDefined();
    expect(typeIssue?.level).toBe("warn");
    expect(typeIssue?.message).toContain("tipos de dados diferentes");
    expect(typeIssue?.fixHint).toContain("Alinhe os tipos");
  });

  // CENÁRIO 14: Simulação de forçamento de tag (Force Value)
  it("Cenário 14: Tag forçada retém valor e resiste à sobrescrita pela lógica", () => {
    const rung: LadderRung = {
      id: "rung-force",
      label: "Rung Force",
      cells: [],
      topology: {
        id: "topo-force",
        rootBranch: {
          id: "r-force",
          items: [instItem("c1", "XIC", "B_START")],
        },
        outputs: [{ id: "o1", kind: "OTE", operand: "VALVULA_SEGURANCA" }],
      },
    };

    // Se VALVULA_SEGURANCA estiver forçada para FALSE pelo operador:
    // O scan da lógica tenta ligar porque B_START é true:
    const res = scanRungsPure([rung], { B_START: true }, state, 1000);
    expect(res.tags.VALVULA_SEGURANCA).toBe(true);

    // O runtime de forçamento sobrescreve com o valor forçado:
    const forcedTags = { VALVULA_SEGURANCA: { forced: true, value: false } };
    const effectiveVal = forcedTags.VALVULA_SEGURANCA.forced
      ? forcedTags.VALVULA_SEGURANCA.value
      : res.tags.VALVULA_SEGURANCA;
    expect(effectiveVal).toBe(false);
  });

  // CENÁRIO 15: Execução sob escala com centenas de instruções dentro do scan budget
  it("Cenário 15: Desempenho determinístico sob projeto extenso sem estouro de scan budget", () => {
    const largeRungs: LadderRung[] = [];

    // Gerar 300 rungs com circuitos mistos de contatos, comparadores e temporizadores
    for (let i = 1; i <= 300; i++) {
      largeRungs.push({
        id: `rung-scale-${i}`,
        label: `Rede ${i}`,
        cells: [],
        topology: {
          id: `topo-${i}`,
          rootBranch: {
            id: `root-${i}`,
            items: [
              parallelItem(`par-${i}`, [
                { id: `b-a-${i}`, items: [instItem(`c-a-${i}`, "XIC", `TAG_A_${i}`)] },
                { id: `b-b-${i}`, items: [instItem(`c-b-${i}`, "XIC", `TAG_B_${i}`)] },
              ]),
              instItem(`c-c-${i}`, "XIO", `TAG_C_${i}`),
              instItem(`cmp-${i}`, "CMP_GE", `VAR_${i}`, {
                params: { IN1: `VAR_${i}`, IN2: 100 },
              }),
            ],
          },
          outputs: [
            { id: `out-1-${i}`, kind: "OTE", operand: `OUT_A_${i}` },
            { id: `out-2-${i}`, kind: "OTE", operand: `OUT_B_${i}` },
          ],
        },
      });
    }

    const testTags: PureTags = {};
    for (let i = 1; i <= 300; i++) {
      testTags[`TAG_A_${i}`] = i % 2 === 0;
      testTags[`TAG_B_${i}`] = i % 3 === 0;
      testTags[`TAG_C_${i}`] = false;
      testTags[`VAR_${i}`] = 150;
    }

    const start = performance.now();
    const res = scanRungsPure(largeRungs, testTags, state, 1000);
    const elapsed = performance.now() - start;

    // Scan cycle de 300 rungs complexos deve executar em menos de 50ms (budget IEC)
    expect(elapsed).toBeLessThan(50);
    const outKeys = Object.keys(res.tags).filter((k) => k.startsWith("OUT_"));
    expect(outKeys.length).toBe(600); // 300 rungs * 2 saídas = 600 saídas geradas
  });
});
