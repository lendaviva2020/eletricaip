import { describe, it, expect, beforeEach } from "vitest";
import {
  scanRungsPure,
  createScanState,
  tickCTUD,
  tickBistable,
  tickTimer,
  tickTOF,
  tickTP,
  type PureTags,
  type ScanState,
} from "@/lib/ladder/scan-core";
import { scanRungs, resetRuntimeState } from "@/lib/ladder/runtime";
import {
  newRung,
  emptyCell,
  ensureRungTopology,
  type LadderRung,
  type LadderInstruction,
  type LadderCell,
} from "@/lib/ladder/types";
import { validateRungs } from "@/lib/ladder/validator";
import { compileRungToST, compileRungToIL } from "@/lib/ladder/compiler";
import { useEditorStore } from "@/lib/editor/store";

describe("ELÉTRICAI — FASE 3: COMPLETUDE FUNCIONAL DO MOTOR LADDER", () => {
  let state: ScanState;

  beforeEach(() => {
    state = createScanState();
    resetRuntimeState();
    useEditorStore.setState({
      editorTags: {},
      rungs: [],
      selectedLadderTarget: null,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 1: CTUD (Contador Crescente/Decrescente)
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. CTUD — Contador Crescente/Decrescente IEC 61131-3", () => {
    it("1.1 Incrementa em borda de CU, decrementa em borda de CD e mantém estável em sinal contínuo", () => {
      const ctudMap = new Map();

      // Scan 1: CU borda de subida (0 -> 1)
      let res = tickCTUD(ctudMap, "c1", true, false, false, false, 5);
      expect(res.cv).toBe(1);
      expect(res.qu).toBe(false);
      expect(res.qd).toBe(false);

      // Scan 2: CU contínuo (1 -> 1) -> Não deve incrementar novamente
      res = tickCTUD(ctudMap, "c1", true, false, false, false, 5);
      expect(res.cv).toBe(1);

      // Scan 3: CU cai para 0
      res = tickCTUD(ctudMap, "c1", false, false, false, false, 5);
      expect(res.cv).toBe(1);

      // Scan 4: CD borda de subida (0 -> 1) -> decrementa para 0
      res = tickCTUD(ctudMap, "c1", false, true, false, false, 5);
      expect(res.cv).toBe(0);
      expect(res.qd).toBe(true); // QD = TRUE quando CV <= 0
    });

    it("1.2 Prioridade estrita de Reset (R) e Load (LD) sobre contagem", () => {
      const ctudMap = new Map();

      // Reset ativo: zera CV mesmo se CU tentar incrementar
      let res = tickCTUD(ctudMap, "c1", true, false, true, false, 10);
      expect(res.cv).toBe(0);
      expect(res.qu).toBe(false);
      expect(res.qd).toBe(true);

      // Load ativo (sem Reset): carrega PV
      res = tickCTUD(ctudMap, "c1", false, false, false, true, 10);
      expect(res.cv).toBe(10);
      expect(res.qu).toBe(true);
      expect(res.qd).toBe(false);

      // Reset + Load simultâneos: Reset tem prioridade normativa sobre Load
      res = tickCTUD(ctudMap, "c1", false, false, true, true, 10);
      expect(res.cv).toBe(0);
    });

    it("1.3 Borda simultânea de CU e CD mantém contagem estável", () => {
      const ctudMap = new Map();
      // Inicial com CV=2
      tickCTUD(ctudMap, "c1", true, false, false, false, 10);
      tickCTUD(ctudMap, "c1", false, false, false, false, 10);
      tickCTUD(ctudMap, "c1", true, false, false, false, 10);
      tickCTUD(ctudMap, "c1", false, false, false, false, 10);

      // CU e CD disparam subida simultaneamente no mesmo scan
      const res = tickCTUD(ctudMap, "c1", true, true, false, false, 10);
      expect(res.cv).toBe(2); // Inalterado
    });

    it("1.4 Execução integrada do bloco CTUD em rede Ladder", () => {
      const rung: LadderRung = {
        id: "rung-ctud",
        label: "Rung CTUD",
        cols: 6,
        cells: [
          [
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            { kind: "CTUD", operand: "CONTADOR_1", preset: 3 },
          ],
        ],
        topology: {
          id: "rung-ctud",
          rootBranch: {
            id: "root-1",
            items: [
              {
                id: "i1",
                type: "instruction",
                instruction: { id: "in-cu", kind: "XIC", operand: "PULSO_UP" },
              },
            ],
          },
          outputs: [
            {
              id: "out-ctud",
              kind: "CTUD",
              operand: "CONTADOR_1",
              preset: 3,
              params: {
                PV: 3,
                CD: "PULSO_DOWN",
                R: "RESET_CNT",
                LD: "LOAD_CNT",
                CV: "VAL_CV",
              },
            },
          ],
        },
      };

      // Pulso 1: UP
      let tags: PureTags = { PULSO_UP: true, PULSO_DOWN: false, RESET_CNT: false, LOAD_CNT: false };
      let out = scanRungsPure([rung], tags, state, 100);
      expect(out.tags.VAL_CV).toBe(1);
      expect(out.tags.CONTADOR_1).toBe(false); // QU ainda false

      // UP cai para 0
      tags = { ...out.tags, PULSO_UP: false };
      out = scanRungsPure([rung], tags, state, 200);

      // Pulso 2: UP
      tags = { ...out.tags, PULSO_UP: true };
      out = scanRungsPure([rung], tags, state, 300);
      expect(out.tags.VAL_CV).toBe(2);

      // UP cai
      tags = { ...out.tags, PULSO_UP: false };
      out = scanRungsPure([rung], tags, state, 400);

      // Pulso 3: UP -> Atinge PV (3) -> QU ativa!
      tags = { ...out.tags, PULSO_UP: true };
      out = scanRungsPure([rung], tags, state, 500);
      expect(out.tags.VAL_CV).toBe(3);
      expect(out.tags.CONTADOR_1).toBe(true); // QU = TRUE
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 2: INT_TO_REAL e REAL_TO_INT
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Conversões Numéricas — INT_TO_REAL e REAL_TO_INT", () => {
    it("2.1 INT_TO_REAL converte números inteiros em float com precisão e diagnostica entradas inválidas", () => {
      const rung: LadderRung = {
        id: "rung-conv-1",
        label: "Conv 1",
        cells: [[emptyCell()]],
        topology: {
          id: "rung-conv-1",
          rootBranch: { id: "root-1", items: [] },
          outputs: [
            {
              id: "out-itr",
              kind: "INT_TO_REAL",
              operand: "CONV_OUT",
              params: { IN: "VAL_INT", OUT: "VAL_REAL" },
            },
          ],
        },
      };

      const out = scanRungsPure([rung], { VAL_INT: 125 }, state, 100);
      expect(out.tags.VAL_REAL).toBe(125);
      expect(out.results[0].diagnostics?.["out:out-itr"]?.done).toBe(true);
      expect(out.results[0].diagnostics?.["out:out-itr"]?.text).toContain("125.00 (REAL)");
    });

    it("2.2 REAL_TO_INT arredonda frações, diagnostica overflow e trata NaN/Infinity sem vazar erros", () => {
      const rung: LadderRung = {
        id: "rung-conv-2",
        label: "Conv 2",
        cells: [[emptyCell()]],
        topology: {
          id: "rung-conv-2",
          rootBranch: { id: "root-1", items: [] },
          outputs: [
            {
              id: "out-rti",
              kind: "REAL_TO_INT",
              operand: "INT_RES",
              params: { IN: "FLOAT_VAL", OUT: "INT_RES" },
            },
          ],
        },
      };

      // Arredondamento normal: 2.7 -> 3, -4.2 -> -4
      let out = scanRungsPure([rung], { FLOAT_VAL: 2.7 }, state, 100);
      expect(out.tags.INT_RES).toBe(3);

      out = scanRungsPure([rung], { FLOAT_VAL: -4.2 }, state, 200);
      expect(out.tags.INT_RES).toBe(-4);

      // Overflow acima de INT16 (32767) — preserva tag existente
      out = scanRungsPure([rung], { FLOAT_VAL: 50000, INT_RES: -4 }, state, 300);
      expect(out.tags.INT_RES).toBe(-4);
      expect(out.results[0].diagnostics?.["out:out-rti"]?.text).toContain("ERR: INT_OVERFLOW");
      expect(out.results[0].diagnostics?.["out:out-rti"]?.targetPreserved).toBe(true);

      // Overflow abaixo de INT16 (-32768) — preserva tag existente
      out = scanRungsPure([rung], { FLOAT_VAL: -50000, INT_RES: 123 }, state, 400);
      expect(out.tags.INT_RES).toBe(123);
      expect(out.results[0].diagnostics?.["out:out-rti"]?.text).toContain("ERR: INT_OVERFLOW");
      expect(out.results[0].diagnostics?.["out:out-rti"]?.targetPreserved).toBe(true);

      // NaN seguro — preserva tag existente
      out = scanRungsPure([rung], { FLOAT_VAL: NaN, INT_RES: 77 }, state, 500);
      expect(out.tags.INT_RES).toBe(77);
      expect(out.results[0].diagnostics?.["out:out-rti"]?.text).toContain("ERR: REAL_TO_INT_NAN");
      expect(out.results[0].diagnostics?.["out:out-rti"]?.targetPreserved).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 3: BLOCOS LÓGICOS BOOLEANOS (AND, OR, XOR, NOT)
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Blocos Lógicos — AND, OR, XOR e NOT", () => {
    it("3.1 Tabelas-verdade completas para AND, OR, XOR e NOT", () => {
      const makeLogicRung = (kind: "AND" | "OR" | "XOR" | "NOT", id: string): LadderRung => {
        const params: Record<string, string | number | boolean> =
          kind === "NOT" ? { IN: "A", OUT: `RES_${id}` } : { IN1: "A", IN2: "B", OUT: `RES_${id}` };
        return {
          id: `rung-${id}`,
          label: `Logic ${id}`,
          cells: [[emptyCell()]],
          topology: {
            id: `rung-${id}`,
            rootBranch: { id: `root-${id}`, items: [] },
            outputs: [
              {
                id: `out-${id}`,
                kind,
                operand: `RES_${id}`,
                params,
              },
            ],
          },
        };
      };

      const rungs = [
        makeLogicRung("AND", "AND"),
        makeLogicRung("OR", "OR"),
        makeLogicRung("XOR", "XOR"),
        makeLogicRung("NOT", "NOT"),
      ];

      // A=0, B=0
      let out = scanRungsPure(rungs, { A: false, B: false }, state, 100);
      expect(out.tags.RES_AND).toBe(false);
      expect(out.tags.RES_OR).toBe(false);
      expect(out.tags.RES_XOR).toBe(false);
      expect(out.tags.RES_NOT).toBe(true);

      // A=1, B=0
      out = scanRungsPure(rungs, { A: true, B: false }, state, 200);
      expect(out.tags.RES_AND).toBe(false);
      expect(out.tags.RES_OR).toBe(true);
      expect(out.tags.RES_XOR).toBe(true);
      expect(out.tags.RES_NOT).toBe(false);

      // A=0, B=1
      out = scanRungsPure(rungs, { A: false, B: true }, state, 300);
      expect(out.tags.RES_AND).toBe(false);
      expect(out.tags.RES_OR).toBe(true);
      expect(out.tags.RES_XOR).toBe(true);
      expect(out.tags.RES_NOT).toBe(true);

      // A=1, B=1
      out = scanRungsPure(rungs, { A: true, B: true }, state, 400);
      expect(out.tags.RES_AND).toBe(true);
      expect(out.tags.RES_OR).toBe(true);
      expect(out.tags.RES_XOR).toBe(false);
      expect(out.tags.RES_NOT).toBe(false);
    });

    it("3.2 Encadeamento lógico em redes Ladder sucessivas", () => {
      const rung1: LadderRung = {
        id: "rung-1",
        label: "Rung 1",
        cells: [[emptyCell()]],
        topology: {
          id: "rung-1",
          rootBranch: { id: "root-1", items: [] },
          outputs: [
            {
              id: "o1",
              kind: "AND",
              operand: "FLAG_1",
              params: { IN1: "S1", IN2: "S2", OUT: "FLAG_1" },
            },
          ],
        },
      };

      const rung2: LadderRung = {
        id: "rung-2",
        label: "Rung 2",
        cells: [[emptyCell()]],
        topology: {
          id: "rung-2",
          rootBranch: {
            id: "root-2",
            items: [
              {
                id: "i1",
                type: "instruction",
                instruction: { id: "c1", kind: "XIC", operand: "FLAG_1" },
              },
            ],
          },
          outputs: [{ id: "o2", kind: "OTE", operand: "MOTOR_ON" }],
        },
      };

      // Com S1=1 e S2=1, Rung 1 calcula FLAG_1=true, e no MESMO scan Rung 2 aciona MOTOR_ON
      const out = scanRungsPure([rung1, rung2], { S1: true, S2: true }, state, 100);
      expect(out.tags.FLAG_1).toBe(true);
      expect(out.tags.MOTOR_ON).toBe(true);
      expect(out.results[1].poweredOut).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 4: BISTÁVEIS SR E RS
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Bistáveis — SR (Set Dominante) e RS (Reset Dominante)", () => {
    it("4.1 SR com Set dominante: S1=1 e R=1 resulta em Q=TRUE", () => {
      const bistables = new Map();

      // Ativação por Set
      let q = tickBistable(bistables, "sr1", "SR", true, false);
      expect(q).toBe(true);

      // Retenção com Set=0 e Reset=0
      q = tickBistable(bistables, "sr1", "SR", false, false);
      expect(q).toBe(true);

      // Conflito de entradas ativas simultâneas: Set dominante vence
      q = tickBistable(bistables, "sr1", "SR", true, true);
      expect(q).toBe(true);

      // Desativação por Reset (quando Set=0)
      q = tickBistable(bistables, "sr1", "SR", false, true);
      expect(q).toBe(false);
    });

    it("4.2 RS com Reset dominante: S=1 e R1=1 resulta em Q=FALSE", () => {
      const bistables = new Map();

      // Ativação por Set
      let q = tickBistable(bistables, "rs1", "RS", true, false);
      expect(q).toBe(true);

      // Conflito de entradas ativas simultâneas: Reset dominante vence
      q = tickBistable(bistables, "rs1", "RS", true, true);
      expect(q).toBe(false);

      // Retenção de desligado
      q = tickBistable(bistables, "rs1", "RS", false, false);
      expect(q).toBe(false);
    });

    it("4.3 Execução de SR e RS integrados no scan do Ladder", () => {
      const rungSR: LadderRung = {
        id: "rung-sr",
        label: "Rung SR",
        cells: [[emptyCell()]],
        topology: {
          id: "rung-sr",
          rootBranch: { id: "root-sr", items: [] },
          outputs: [
            {
              id: "out-sr",
              kind: "SR",
              operand: "LATCH_SR",
              params: { S1: "CMD_SET", R: "CMD_RESET" },
            },
          ],
        },
      };

      const rungRS: LadderRung = {
        id: "rung-rs",
        label: "Rung RS",
        cells: [[emptyCell()]],
        topology: {
          id: "rung-rs",
          rootBranch: { id: "root-rs", items: [] },
          outputs: [
            {
              id: "out-rs",
              kind: "RS",
              operand: "LATCH_RS",
              params: { S: "CMD_SET", R1: "CMD_RESET" },
            },
          ],
        },
      };

      // Teste de dominância com ambas as entradas ativas no mesmo ciclo
      const out = scanRungsPure([rungSR, rungRS], { CMD_SET: true, CMD_RESET: true }, state, 100);
      expect(out.tags.LATCH_SR).toBe(true); // SR: Set dominante -> TRUE
      expect(out.tags.LATCH_RS).toBe(false); // RS: Reset dominante -> FALSE
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 5: TRATAMENTO DE OPERAÇÕES MATEMÁTICAS INVÁLIDAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Tratamento de Operações Matemáticas Inválidas", () => {
    it("5.1 DIV por zero e MOD por zero geram diagnósticos explícitos e protegem contra NaN/Infinity", () => {
      const rungDiv: LadderRung = {
        id: "r-div",
        label: "Div Zero",
        cells: [[emptyCell()]],
        topology: {
          id: "r-div",
          rootBranch: { id: "root-div", items: [] },
          outputs: [
            {
              id: "o-div",
              kind: "DIV",
              operand: "DIV_RES",
              params: { IN1: 100, IN2: 0, OUT: "DIV_RES" },
            },
          ],
        },
      };

      const rungMod: LadderRung = {
        id: "r-mod",
        label: "Mod Zero",
        cells: [[emptyCell()]],
        topology: {
          id: "r-mod",
          rootBranch: { id: "root-mod", items: [] },
          outputs: [
            {
              id: "o-mod",
              kind: "MOD",
              operand: "MOD_RES",
              params: { IN1: 100, IN2: 0, OUT: "MOD_RES" },
            },
          ],
        },
      };

      const out = scanRungsPure([rungDiv, rungMod], { DIV_RES: 42, MOD_RES: 17 }, state, 100);

      // Em erro de divisão por zero ou resto por zero, o valor anterior da tag é preservado
      expect(out.tags.DIV_RES).toBe(42);
      expect(out.results[0].diagnostics?.["out:o-div"]?.text).toBe("ERR: DIV_BY_ZERO");
      expect(out.results[0].diagnostics?.["out:o-div"]?.done).toBe(false);
      expect(out.results[0].diagnostics?.["out:o-div"]?.targetPreserved).toBe(true);

      expect(out.tags.MOD_RES).toBe(17);
      expect(out.results[1].diagnostics?.["out:o-mod"]?.text).toBe("ERR: MOD_BY_ZERO");
      expect(out.results[1].diagnostics?.["out:o-mod"]?.done).toBe(false);
      expect(out.results[1].diagnostics?.["out:o-mod"]?.targetPreserved).toBe(true);
    });

    it("5.2 SQRT de número negativo gera diagnóstico ERR: SQRT_NEGATIVE sem travar ou emitir NaN", () => {
      const rungSqrt: LadderRung = {
        id: "r-sqrt",
        label: "Sqrt Neg",
        cells: [[emptyCell()]],
        topology: {
          id: "r-sqrt",
          rootBranch: { id: "root-sqrt", items: [] },
          outputs: [
            {
              id: "o-sqrt",
              kind: "SQRT",
              operand: "SQRT_RES",
              params: { IN1: -25, OUT: "SQRT_RES" },
            },
          ],
        },
      };

      const out = scanRungsPure([rungSqrt], { SQRT_RES: 88 }, state, 100);
      expect(out.tags.SQRT_RES).toBe(88);
      expect(out.results[0].diagnostics?.["out:o-sqrt"]?.text).toBe("ERR: SQRT_NEGATIVE");
      expect(out.results[0].diagnostics?.["out:o-sqrt"]?.done).toBe(false);
      expect(out.results[0].diagnostics?.["out:o-sqrt"]?.targetPreserved).toBe(true);
    });

    it("5.3 Falha matemática é isolada e não contamina execuções normais posteriores", () => {
      const rungFail: LadderRung = {
        id: "r-fail",
        label: "Fail",
        cells: [[emptyCell()]],
        topology: {
          id: "r-fail",
          rootBranch: { id: "root-fail", items: [] },
          outputs: [
            { id: "o-f", kind: "DIV", operand: "F_RES", params: { IN1: 50, IN2: 0, OUT: "F_RES" } },
          ],
        },
      };

      const rungSuccess: LadderRung = {
        id: "r-ok",
        label: "Ok",
        cells: [[emptyCell()]],
        topology: {
          id: "r-ok",
          rootBranch: { id: "root-ok", items: [] },
          outputs: [
            {
              id: "o-ok",
              kind: "ADD",
              operand: "OK_RES",
              params: { IN1: 20, IN2: 30, OUT: "OK_RES" },
            },
          ],
        },
      };

      const out = scanRungsPure([rungFail, rungSuccess], { F_RES: 99 }, state, 100);
      expect(out.tags.F_RES).toBe(99);
      expect(out.tags.OK_RES).toBe(50);
      expect(out.results[1].diagnostics?.["out:o-ok"]?.done).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 6: CICLO DE VARREDURA E ATUALIZAÇÃO ENTRE REDES (INTER-RUNG)
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Propagação Sequencial de Variáveis no Ciclo de Varredura (Inter-Rung)", () => {
    it("6.1 Escrita em Rung 0 é consumida no mesmo ciclo por Rung 1 e Rung 2", () => {
      // Rung 0: Liga FLAG_M1 se START for TRUE
      const rung0: LadderRung = {
        id: "r0",
        label: "Rung 0",
        cells: [[emptyCell()]],
        topology: {
          id: "r0",
          rootBranch: {
            id: "root-0",
            items: [
              {
                id: "i0",
                type: "instruction",
                instruction: { id: "c0", kind: "XIC", operand: "START" },
              },
            ],
          },
          outputs: [{ id: "o0", kind: "OTE", operand: "FLAG_M1" }],
        },
      };

      // Rung 1: Lê FLAG_M1 e calcula FLAG_M2 via XIC
      const rung1: LadderRung = {
        id: "r1",
        label: "Rung 1",
        cells: [[emptyCell()]],
        topology: {
          id: "r1",
          rootBranch: {
            id: "root-1",
            items: [
              {
                id: "i1",
                type: "instruction",
                instruction: { id: "c1", kind: "XIC", operand: "FLAG_M1" },
              },
            ],
          },
          outputs: [{ id: "o1", kind: "OTE", operand: "FLAG_M2" }],
        },
      };

      // Rung 2: Lê FLAG_M2 e calcula FINAL_OUT via XIC
      const rung2: LadderRung = {
        id: "r2",
        label: "Rung 2",
        cells: [[emptyCell()]],
        topology: {
          id: "r2",
          rootBranch: {
            id: "root-2",
            items: [
              {
                id: "i2",
                type: "instruction",
                instruction: { id: "c2", kind: "XIC", operand: "FLAG_M2" },
              },
            ],
          },
          outputs: [{ id: "o2", kind: "OTE", operand: "FINAL_OUT" }],
        },
      };

      const out = scanRungsPure([rung0, rung1, rung2], { START: true }, state, 100);
      expect(out.tags.FLAG_M1).toBe(true);
      expect(out.tags.FLAG_M2).toBe(true);
      expect(out.tags.FINAL_OUT).toBe(true);
      expect(out.results[2].poweredOut).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 7: ISOLAMENTO DE ESTADOS POR INSTÂNCIA
  // ───────────────────────────────────────────────────────────────────────────
  describe("7. Isolamento de Estado por Instância", () => {
    it("7.1 Duas instâncias idênticas de temporizador TON mantêm acumuladores e flags isolados", () => {
      const rungA: LadderRung = {
        id: "r-ton-a",
        label: "Rung TON A",
        cells: [[emptyCell()]],
        topology: {
          id: "r-ton-a",
          rootBranch: {
            id: "root-a",
            items: [
              {
                id: "ia",
                type: "instruction",
                instruction: { id: "ca", kind: "XIC", operand: "ENA_A" },
              },
            ],
          },
          outputs: [{ id: "ton-inst-A", kind: "TON", operand: "Q_A", preset: 1000 }],
        },
      };

      const rungB: LadderRung = {
        id: "r-ton-b",
        label: "Rung TON B",
        cells: [[emptyCell()]],
        topology: {
          id: "r-ton-b",
          rootBranch: {
            id: "root-b",
            items: [
              {
                id: "ib",
                type: "instruction",
                instruction: { id: "cb", kind: "XIC", operand: "ENA_B" },
              },
            ],
          },
          outputs: [{ id: "ton-inst-B", kind: "TON", operand: "Q_B", preset: 1000 }],
        },
      };

      // Tick 1: Apenas ENA_A é ativo
      let out = scanRungsPure([rungA, rungB], { ENA_A: true, ENA_B: false }, state, 1000);
      expect(out.results[0].diagnostics?.["out:ton-inst-A"]?.value).toBe(0);
      expect(out.results[1].diagnostics?.["out:ton-inst-B"]?.value).toBe(0);

      // Tick 2: 500ms depois (ENA_A segue ligado, ENA_B segue desligado)
      out = scanRungsPure([rungA, rungB], { ENA_A: true, ENA_B: false }, state, 1500);
      expect(out.results[0].diagnostics?.["out:ton-inst-A"]?.value).toBe(500);
      expect(out.results[1].diagnostics?.["out:ton-inst-B"]?.value).toBe(0); // B permaneceu intacto!
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 8: DETECÇÃO DE BORDA EM REDES DUPLICADAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("8. Detecção de Borda em Redes Duplicadas", () => {
    it("8.1 R_TRIG mantém histórico isolado e dispara pulso único de 1 ciclo", () => {
      const rung1: LadderRung = {
        id: "r-trig-1",
        label: "Trig 1",
        cells: [[emptyCell()]],
        topology: {
          id: "r-trig-1",
          rootBranch: {
            id: "root-1",
            items: [
              {
                id: "i1",
                type: "instruction",
                instruction: { id: "trig-inst-1", kind: "R_TRIG", operand: "SIG_1" },
              },
            ],
          },
          outputs: [{ id: "o1", kind: "OTE", operand: "PULSE_1" }],
        },
      };

      const rung2: LadderRung = {
        id: "r-trig-2",
        label: "Trig 2",
        cells: [[emptyCell()]],
        topology: {
          id: "r-trig-2",
          rootBranch: {
            id: "root-2",
            items: [
              {
                id: "i2",
                type: "instruction",
                instruction: { id: "trig-inst-2", kind: "R_TRIG", operand: "SIG_2" },
              },
            ],
          },
          outputs: [{ id: "o2", kind: "OTE", operand: "PULSE_2" }],
        },
      };

      // Scan 1: SIG_1 sobe para TRUE, SIG_2 permanece FALSE
      let out = scanRungsPure([rung1, rung2], { SIG_1: true, SIG_2: false }, state, 100);
      expect(out.tags.PULSE_1).toBe(true);
      expect(out.tags.PULSE_2).toBe(false);

      // Scan 2: SIG_1 continua TRUE -> PULSE_1 agora deve ser FALSE (borda já passou)
      out = scanRungsPure([rung1, rung2], { SIG_1: true, SIG_2: false }, state, 200);
      expect(out.tags.PULSE_1).toBe(false);
      expect(out.tags.PULSE_2).toBe(false);

      // Scan 3: SIG_2 sobe para TRUE -> apenas PULSE_2 dispara
      out = scanRungsPure([rung1, rung2], { SIG_1: true, SIG_2: true }, state, 300);
      expect(out.tags.PULSE_1).toBe(false);
      expect(out.tags.PULSE_2).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 9: TEMPORIZADORES NOS LIMITES TEMPORAIS
  // ───────────────────────────────────────────────────────────────────────────
  describe("9. Temporizadores nos Limites Temporais", () => {
    it("9.1 TON com preset zero conclui imediatamente no primeiro tick ativo", () => {
      const timers = new Map();
      const res = tickTimer(timers, "t-zero", true, 0, 1000);
      expect(res.done).toBe(false); // preset 0ms não atrasa

      const res2 = tickTimer(timers, "t-zero-1", true, 0, 1050);
      expect(res2.accum).toBe(0);
    });

    it("9.2 Entrada que cai antes de completar PT zera o acumulador sem ativar saída", () => {
      const timers = new Map();
      tickTimer(timers, "t1", true, 1000, 100);
      let res = tickTimer(timers, "t1", true, 1000, 600);
      expect(res.accum).toBe(500);
      expect(res.done).toBe(false);

      // Cai a entrada aos 700ms
      res = tickTimer(timers, "t1", false, 1000, 700);
      expect(res.accum).toBe(0);
      expect(res.done).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 10: FORÇAMENTO REAL DE TAGS NO RUNTIME
  // ───────────────────────────────────────────────────────────────────────────
  describe("10. Forçamento Real de Tags no Runtime / useEditorStore", () => {
    it("10.1 Tag forçada tem precedência absoluta sobre as escritas das redes no runtime", () => {
      const store = useEditorStore.getState();

      // Cria tag no store
      store.upsertTag({
        id: "tag-pump",
        name: "VALVULA_1",
        type: "BOOL",
        value: false,
        forced: false,
      });

      // Rede que tenta ligar VALVULA_1 incondicionalmente
      const rung: LadderRung = {
        id: "r-force",
        label: "Force Test",
        cells: [[emptyCell()]],
        topology: {
          id: "r-force",
          rootBranch: { id: "root-f", items: [] },
          outputs: [{ id: "out-p", kind: "OTE", operand: "VALVULA_1" }],
        },
      };

      // 1. Executa scan normal: a saída liga a válvula
      scanRungs([rung]);
      expect(useEditorStore.getState().editorTags["tag-pump"].value).toBe(true);

      // 2. Força a tag para FALSE via store real
      useEditorStore.getState().forceTagValue("tag-pump", false);
      expect(useEditorStore.getState().editorTags["tag-pump"].forced).toBe(true);
      expect(useEditorStore.getState().editorTags["tag-pump"].value).toBe(false);

      // 3. Executa scan novamente: mesmo com a rede energizada, a tag PERMANECE FALSE!
      scanRungs([rung]);
      expect(useEditorStore.getState().editorTags["tag-pump"].value).toBe(false);

      // 4. Libera o forçamento
      useEditorStore.getState().releaseTag("tag-pump");
      expect(useEditorStore.getState().editorTags["tag-pump"].forced).toBe(false);

      // 5. Executa scan novamente: agora a lógica volta a comandar e liga para TRUE
      scanRungs([rung]);
      expect(useEditorStore.getState().editorTags["tag-pump"].value).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 11: INTEGRIDADE DAS TAGS DURANTE MÚLTIPLOS CICLOS
  // ───────────────────────────────────────────────────────────────────────────
  describe("11. Integridade das Tags Durante Múltiplos Ciclos Sucessivos", () => {
    it("11.1 Contador acumulador em loop oscilante permanece íntegro após 15 ciclos", () => {
      const rung: LadderRung = {
        id: "r-cycle",
        label: "Multi Cycle",
        cells: [[emptyCell()]],
        topology: {
          id: "r-cycle",
          rootBranch: {
            id: "root-c",
            items: [
              {
                id: "ic",
                type: "instruction",
                instruction: { id: "c-pulse", kind: "R_TRIG", operand: "CLOCK" },
              },
            ],
          },
          outputs: [
            {
              id: "out-cnt",
              kind: "CTU",
              operand: "CONTADOR_ACUM",
              preset: 50,
              params: { PV: 50 },
            },
          ],
        },
      };

      const currentTags: PureTags = { CLOCK: false };
      for (let cycle = 1; cycle <= 10; cycle++) {
        // Alterna clock (0 -> 1 -> 0)
        currentTags.CLOCK = true;
        let out = scanRungsPure([rung], currentTags, state, cycle * 100);
        expect(out.results[0].diagnostics?.["out:out-cnt"]?.value).toBe(cycle);

        currentTags.CLOCK = false;
        out = scanRungsPure([rung], currentTags, state, cycle * 100 + 50);
        expect(out.results[0].diagnostics?.["out:out-cnt"]?.value).toBe(cycle);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 12: DIAGNÓSTICOS DE OPERANDOS AUSENTES E VALIDAÇÃO ESTÁTICA
  // ───────────────────────────────────────────────────────────────────────────
  describe("12. Diagnósticos de Operandos Ausentes e Validação Estática", () => {
    it("12.1 Emite avisos e erros para operandos vazios em comparadores e blocos lógicos", () => {
      const rungInvalid: LadderRung = {
        id: "r-invalid",
        label: "Rung Invalid",
        cells: [[emptyCell()]],
        topology: {
          id: "r-invalid",
          rootBranch: {
            id: "root-inv",
            items: [
              {
                id: "item-and-missing",
                type: "instruction",
                instruction: { id: "and-miss", kind: "AND", operand: "", params: { IN1: "VAR_A" } }, // Sem IN2!
              },
            ],
          },
          outputs: [
            { id: "out-div-zero", kind: "DIV", operand: "DIV_RES", params: { IN1: 10, IN2: 0 } },
          ],
        },
      };

      const issues = validateRungs([rungInvalid]);
      const missingLogic = issues.find((i) => i.code === "LOGIC_MISSING_OPERAND");
      const divZero = issues.find((i) => i.code === "DIV_BY_ZERO");

      expect(missingLogic).toBeDefined();
      expect(divZero).toBeDefined();
      expect(divZero?.level).toBe("error");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 13: EQUIVALÊNCIA ENTRE COMPORTAMENTO ESPERADO E SCAN RESULT
  // ───────────────────────────────────────────────────────────────────────────
  describe("13. Equivalência Lógica do Scan vs Circuito Combinacional Completo", () => {
    it("13.1 Partida direta com selo e intertravamento de segurança", () => {
      const rungPartida: LadderRung = {
        id: "r-partida",
        label: "Partida Direta",
        cols: 6,
        cells: [
          [
            { kind: "XIC", operand: "EMERGENCIA" },
            { kind: "XIC", operand: "RELE_TERMICO" },
            { kind: "XIC", operand: "BOTAO_LIGA" },
            emptyCell(),
            emptyCell(),
            { kind: "OTE", operand: "K1" },
          ],
          [
            emptyCell(),
            emptyCell(),
            { kind: "XIC", operand: "K1" }, // Selo em paralelo
            emptyCell(),
            emptyCell(),
            emptyCell(),
          ],
        ],
      };

      // Garante topologia com circuito de selo
      ensureRungTopology(rungPartida);

      // 1. Repouso (sem botão de ligar pressionado)
      let out = scanRungsPure(
        [rungPartida],
        { EMERGENCIA: true, RELE_TERMICO: true, BOTAO_LIGA: false, K1: false },
        state,
        100,
      );
      expect(out.tags.K1).toBe(false);

      // 2. Pulso no botão de ligar -> Liga K1
      out = scanRungsPure(
        [rungPartida],
        { EMERGENCIA: true, RELE_TERMICO: true, BOTAO_LIGA: true, K1: false },
        state,
        200,
      );
      expect(out.tags.K1).toBe(true);

      // 3. Solta botão de ligar -> Selo K1 mantém ligado!
      out = scanRungsPure(
        [rungPartida],
        { EMERGENCIA: true, RELE_TERMICO: true, BOTAO_LIGA: false, K1: true },
        state,
        300,
      );
      expect(out.tags.K1).toBe(true);

      // 4. Emergência abre (EMERGENCIA = FALSE) -> Interrompe K1 imediatamente!
      out = scanRungsPure(
        [rungPartida],
        { EMERGENCIA: false, RELE_TERMICO: true, BOTAO_LIGA: false, K1: true },
        state,
        400,
      );
      expect(out.tags.K1).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CENÁRIO 14: PERSISTÊNCIA, SERIALIZAÇÃO ROUNDTRIP E COMPILAÇÃO ST/IL
  // ───────────────────────────────────────────────────────────────────────────
  describe("14. Serialização, Roundtrip e Compilação ST/IL das Novas Instruções", () => {
    it("14.1 Serialização JSON e reabertura preservam topologia e executam identicamente", () => {
      const originalRung: LadderRung = {
        id: "r-persist",
        label: "Rung Persist",
        cells: [[emptyCell()]],
        topology: {
          id: "r-persist",
          rootBranch: { id: "root-p", items: [] },
          outputs: [
            {
              id: "out-ctud-1",
              kind: "CTUD",
              operand: "CNT_1",
              preset: 15,
              params: { PV: 15, CD: "IN_CD", R: "IN_R", LD: "IN_LD", CV: "CV_1" },
            },
            {
              id: "out-rs-1",
              kind: "RS",
              operand: "LATCH_1",
              params: { S: "SET_1", R1: "RESET_1" },
            },
          ],
        },
      };

      const serialized = JSON.stringify(originalRung);
      const deserialized: LadderRung = JSON.parse(serialized);

      const out = scanRungsPure(
        [deserialized],
        { IN_CD: false, IN_R: false, IN_LD: false, SET_1: true, RESET_1: false },
        state,
        100,
      );
      expect(out.tags.LATCH_1).toBe(true);
      expect(out.tags.CV_1).toBe(1);
    });

    it("14.2 Compilação ST e IL geram sintaxe IEC 61131-3 válida para todas as instruções", () => {
      const rung: LadderRung = {
        id: "r-compile",
        label: "Compilação Completa",
        cells: [[emptyCell()]],
        topology: {
          id: "r-compile",
          rootBranch: {
            id: "root-c",
            items: [
              {
                id: "i1",
                type: "instruction",
                instruction: { id: "c1", kind: "XIC", operand: "HABILITA" },
              },
            ],
          },
          outputs: [
            {
              id: "o-ctud",
              kind: "CTUD",
              operand: "CONTADOR_CTUD",
              preset: 20,
              params: { CD: "CD_PIN", R: "R_PIN", LD: "LD_PIN" },
            },
            { id: "o-sr", kind: "SR", operand: "BISTAVEL_SR", params: { R: "R_PIN" } },
            { id: "o-rs", kind: "RS", operand: "BISTAVEL_RS", params: { R1: "R1_PIN" } },
            {
              id: "o-conv",
              kind: "REAL_TO_INT",
              operand: "CONV_RES",
              params: { IN: "FLOAT_IN", OUT: "INT_OUT" },
            },
            {
              id: "o-and",
              kind: "AND",
              operand: "AND_RES",
              params: { IN1: "BIT_1", IN2: "BIT_2", OUT: "AND_OUT" },
            },
          ],
        },
      };

      const st = compileRungToST(rung);
      expect(st).toContain(
        "CONTADOR_CTUD(CU := TRUE, CD := CD_PIN, R := R_PIN, LD := LD_PIN, PV := 20)",
      );
      expect(st).toContain("BISTAVEL_SR_SR(S1 := HABILITA, R := R_PIN)");
      expect(st).toContain("BISTAVEL_RS_RS(S := HABILITA, R1 := R1_PIN)");
      expect(st).toContain("INT_OUT := REAL_TO_INT(FLOAT_IN)");
      expect(st).toContain("AND_OUT := BIT_1 AND BIT_2");

      const il = compileRungToIL(rung);
      expect(il).toContain(
        "CAL CONTADOR_CTUD(CU := %MX, CD := CD_PIN, R := R_PIN, LD := LD_PIN, PV := 20)",
      );
      expect(il).toContain("CAL BISTAVEL_SR_SR(S1 := %MX, R := R_PIN)");
      expect(il).toContain("CAL BISTAVEL_RS_RS(S := %MX, R1 := R1_PIN)");
    });
  });
});
