import { describe, it, expect, beforeEach } from "vitest";
import {
  scanRungsPure,
  createScanState,
  roundToNearestEven,
  clampInt16,
  clampDint32,
  toReal32,
  toLReal64,
  getProfileIntLimits,
  INT16_MIN,
  INT16_MAX,
  DINT32_MIN,
  DINT32_MAX,
  tickCTUD,
  type ScanState,
  type PureTags,
} from "../lib/ladder/scan-core";
import {
  compileProgram,
  compileRungToIL,
  compileRungToST,
  IL_LEGACY_WARNING_HEADER,
} from "../lib/ladder/compiler";
import { parseIlProgram, parseStProgram } from "../lib/ladder/importer";
import type { LadderRung, LadderInstruction } from "../lib/ladder/types";
import { emptyCell } from "../lib/ladder/types";

describe("ELÉTRICAI — FASE 4.1: HOMOLOGAÇÃO TÉCNICA E SEMÂNTICA DO LADDER", () => {
  let state: ScanState;

  beforeEach(() => {
    state = createScanState();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OBJETIVO A: REAL_TO_INT, TIES-TO-EVEN (BANKER'S ROUNDING) E PRECISÃO NUMÉRICA
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Arredondamento Normativo IEC 61131-3 / IEEE 754 (Banker's Rounding / Ties to Even)", () => {
    it("1.1 Função roundToNearestEven elimina o viés de Math.round e arredonda ties para o par mais próximo", () => {
      // Casos normativos exatos exigidos pela IEC 61131-3 / IEEE 754:
      expect(roundToNearestEven(1.5)).toBe(2);
      expect(roundToNearestEven(2.5)).toBe(2);
      expect(roundToNearestEven(3.5)).toBe(4);
      expect(roundToNearestEven(4.5)).toBe(4);
      expect(roundToNearestEven(-1.5)).toBe(-2);
      expect(roundToNearestEven(-2.5)).toBe(-2);
      expect(roundToNearestEven(-3.5)).toBe(-4);
      expect(roundToNearestEven(-4.5)).toBe(-4);
      expect(roundToNearestEven(1.4)).toBe(1);
      expect(roundToNearestEven(1.6)).toBe(2);
      expect(roundToNearestEven(-1.4)).toBe(-1);
      expect(roundToNearestEven(-1.6)).toBe(-2);
      expect(roundToNearestEven(0.0)).toBe(0);
      expect(roundToNearestEven(-0.0)).toBe(0);

      // Casos de proximidade estrita comprovando ausência de tolerâncias artificiais (Math.abs(diff - 0.5) < 1e-9)
      expect(roundToNearestEven(2.5000000001)).toBe(3); // fração > 0.5 -> arredonda para cima
      expect(roundToNearestEven(-1.4999999999)).toBe(-1); // fração > 0.5 -> arredonda para cima (-1)
      // Em IEEE 754 float64, 2.5 + Number.EPSILON avalia exatamente para 2.5 (pois em [2, 4) o ULP é 2*EPSILON)
      expect(roundToNearestEven(2.5 + Number.EPSILON)).toBe(2);
      expect(roundToNearestEven(2.5 - Number.EPSILON)).toBe(2);
      // Com o ULP efetivo em 2.5 (2 * Number.EPSILON):
      expect(roundToNearestEven(2.5 + 2 * Number.EPSILON)).toBe(3);
      expect(roundToNearestEven(2.5 - 2 * Number.EPSILON)).toBe(2);
      // Em 1.5, onde o ULP de float64 é exatamente Number.EPSILON:
      expect(roundToNearestEven(1.5 + Number.EPSILON)).toBe(2);
      expect(roundToNearestEven(1.5 - Number.EPSILON)).toBe(1);

      // Entradas não finitas retornam null (sem substituição arbitrária por zero)
      expect(roundToNearestEven(NaN)).toBeNull();
      expect(roundToNearestEven(Number.POSITIVE_INFINITY)).toBeNull();
      expect(roundToNearestEven(Number.NEGATIVE_INFINITY)).toBeNull();
    });

    it("1.2 Execução de REAL_TO_INT no scan: arredondamento correto de frações e paridade", () => {
      const rungRTI: LadderRung = {
        id: "rung-rti",
        label: "REAL to INT Ties",
        cells: [[emptyCell()]],
        topology: {
          id: "r-rti",
          rootBranch: { id: "root-rti", items: [] },
          outputs: [
            {
              id: "out-rti",
              kind: "REAL_TO_INT",
              operand: "INT_OUT",
              params: { IN: "FLOAT_VAL", OUT: "INT_OUT" },
            },
          ],
        },
      };

      // 1.5 -> 2
      let out = scanRungsPure([rungRTI], { FLOAT_VAL: 1.5, INT_OUT: 0 }, state, 100);
      expect(out.tags.INT_OUT).toBe(2);
      expect(out.results[0].diagnostics?.["out:out-rti"]?.done).toBe(true);
      expect(out.results[0].poweredOut).toBe(true);

      // 2.5 -> 2
      out = scanRungsPure([rungRTI], { FLOAT_VAL: 2.5, INT_OUT: 0 }, state, 200);
      expect(out.tags.INT_OUT).toBe(2);

      // -1.5 -> -2
      out = scanRungsPure([rungRTI], { FLOAT_VAL: -1.5, INT_OUT: 0 }, state, 300);
      expect(out.tags.INT_OUT).toBe(-2);

      // -2.5 -> -2
      out = scanRungsPure([rungRTI], { FLOAT_VAL: -2.5, INT_OUT: 0 }, state, 400);
      expect(out.tags.INT_OUT).toBe(-2);

      // 2.5000000001 -> 3
      out = scanRungsPure([rungRTI], { FLOAT_VAL: 2.5000000001, INT_OUT: 0 }, state, 500);
      expect(out.tags.INT_OUT).toBe(3);
    });

    it("1.3 Contrato de Limites de REAL_TO_INT APÓS arredondamento e preservação de tags", () => {
      const rungRTI: LadderRung = {
        id: "rung-rti-overflow",
        label: "REAL to INT Boundary & Overflow",
        cells: [[emptyCell()]],
        topology: {
          id: "r-rtio",
          rootBranch: { id: "root-rtio", items: [] },
          outputs: [
            {
              id: "out-rtio",
              kind: "REAL_TO_INT",
              operand: "MY_INT",
              params: { IN: "INPUT_REAL", OUT: "MY_INT" },
            },
          ],
        },
      };

      // Tag pré-existente válida: 777
      // 1. 32767.4 arredonda para 32767 -> Válido em INT16!
      let out = scanRungsPure([rungRTI], { INPUT_REAL: 32767.4, MY_INT: 777 }, state, 100);
      expect(out.tags.MY_INT).toBe(32767);
      expect(out.results[0].poweredOut).toBe(true);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.isErr).toBe(false);

      // 2. 32767.5 arredonda para 32768 (par) -> OVERFLOW em INT16!
      // Tag destino PRESERVADA em 777, ENO desligado, erro INT_OVERFLOW
      out = scanRungsPure([rungRTI], { INPUT_REAL: 32767.5, MY_INT: 777 }, state, 200);
      expect(out.tags.MY_INT).toBe(777); // PRESERVADO, nunca sobrescrito por zero ou 32767
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.isErr).toBe(true);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.errCode).toBe("INT_OVERFLOW");
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.targetPreserved).toBe(true);

      // 3. -32768.4 arredonda para -32768 -> Válido em INT16!
      out = scanRungsPure([rungRTI], { INPUT_REAL: -32768.4, MY_INT: 777 }, state, 300);
      expect(out.tags.MY_INT).toBe(-32768);
      expect(out.results[0].poweredOut).toBe(true);

      // 4. -32768.5 arredonda para -32768 (par mais próximo) -> Válido em INT16!
      out = scanRungsPure([rungRTI], { INPUT_REAL: -32768.5, MY_INT: 777 }, state, 400);
      expect(out.tags.MY_INT).toBe(-32768);
      expect(out.results[0].poweredOut).toBe(true);

      // 5. -32768.6 arredonda para -32769 -> OVERFLOW em INT16!
      out = scanRungsPure([rungRTI], { INPUT_REAL: -32768.6, MY_INT: 777 }, state, 500);
      expect(out.tags.MY_INT).toBe(777); // PRESERVADO
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.isErr).toBe(true);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.errCode).toBe("INT_OVERFLOW");
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.targetPreserved).toBe(true);

      // 6. Entrada NaN
      out = scanRungsPure([rungRTI], { INPUT_REAL: NaN, MY_INT: 777 }, state, 600);
      expect(out.tags.MY_INT).toBe(777); // PRESERVADO
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.isErr).toBe(true);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.errCode).toBe("REAL_TO_INT_NAN");
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.targetPreserved).toBe(true);

      // 7. Entrada +Infinity
      out = scanRungsPure(
        [rungRTI],
        { INPUT_REAL: Number.POSITIVE_INFINITY, MY_INT: 777 },
        state,
        700,
      );
      expect(out.tags.MY_INT).toBe(777); // PRESERVADO
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.isErr).toBe(true);

      // 8. Recuperação natural no scan seguinte com valor válido
      out = scanRungsPure([rungRTI], { INPUT_REAL: 12.5, MY_INT: 777 }, state, 800);
      expect(out.tags.MY_INT).toBe(12); // Ties-to-even: 12.5 -> 12
      expect(out.results[0].poweredOut).toBe(true); // ENO reenergizado
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.isErr).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-rtio"]?.targetPreserved).toBe(false);
    });

    it("1.4 Limites numéricos por perfil de execução: generic (INT16) vs rockwell (DINT32)", () => {
      const genericLimits = getProfileIntLimits("generic");
      expect(genericLimits.min).toBe(INT16_MIN);
      expect(genericLimits.max).toBe(INT16_MAX);

      const siemensLimits = getProfileIntLimits("siemens");
      expect(siemensLimits.min).toBe(INT16_MIN);
      expect(siemensLimits.max).toBe(INT16_MAX);

      const rockwellLimits = getProfileIntLimits("rockwell");
      expect(rockwellLimits.min).toBe(DINT32_MIN);
      expect(rockwellLimits.max).toBe(DINT32_MAX);

      const rungRTI: LadderRung = {
        id: "rung-rti-dint",
        label: "Rockwell DINT test",
        cells: [[emptyCell()]],
        topology: {
          id: "r-rtid",
          rootBranch: { id: "root-rtid", items: [] },
          outputs: [
            {
              id: "out-rtid",
              kind: "REAL_TO_INT",
              operand: "VAL_INT",
              params: { IN: "VAL_REAL", OUT: "VAL_INT" },
            },
          ],
        },
      };

      // 50000.0 estoura INT16 no perfil generic
      let out = scanRungsPure(
        [rungRTI],
        { VAL_REAL: 50000.0, VAL_INT: 10 },
        state,
        100,
        undefined,
        "generic",
      );
      expect(out.tags.VAL_INT).toBe(10); // Preservado por erro de overflow
      expect(out.results[0].diagnostics?.["out:out-rtid"]?.isErr).toBe(true);

      // 50000.0 é VÁLIDO no perfil rockwell (DINT32 suporta até 2147483647)
      out = scanRungsPure(
        [rungRTI],
        { VAL_REAL: 50000.0, VAL_INT: 10 },
        state,
        200,
        undefined,
        "rockwell",
      );
      expect(out.tags.VAL_INT).toBe(50000);
      expect(out.results[0].diagnostics?.["out:out-rtid"]?.isErr).toBe(false);
      expect(out.results[0].poweredOut).toBe(true);

      // Limites de DINT32 após arredondamento: 2147483647.4 -> válido; 2147483647.5 -> overflow
      out = scanRungsPure(
        [rungRTI],
        { VAL_REAL: 2147483647.4, VAL_INT: 10 },
        state,
        300,
        undefined,
        "rockwell",
      );
      expect(out.tags.VAL_INT).toBe(2147483647);
      expect(out.results[0].poweredOut).toBe(true);

      out = scanRungsPure(
        [rungRTI],
        { VAL_REAL: 2147483647.5, VAL_INT: 10 },
        state,
        400,
        undefined,
        "rockwell",
      );
      expect(out.tags.VAL_INT).toBe(10); // Preservado
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-rtid"]?.isErr).toBe(true);
    });

    it("1.5 Precisão numérica IEEE 754: REAL (binary32) vs LREAL (binary64), perda em inteiros grandes e overflow 1e39", () => {
      const highPrec = 1.3333333333333333;
      const real32 = toReal32(highPrec);
      const lreal64 = toLReal64(highPrec);

      expect(real32).not.toBe(lreal64);
      expect(real32).toBe(Math.fround(highPrec));
      expect(lreal64).toBe(highPrec);

      // Perda de precisão em inteiros grandes:
      // 16777217 (2^24 + 1) perde o bit menos significativo em REAL (float32 de 24 bits)
      expect(toReal32(16777217)).toBe(16777216);
      expect(toLReal64(16777217)).toBe(16777217);

      // Detecção de resultado finito em JS que transborda para Infinity em binary32 (1e39 > 3.4028235e+38)
      const rungAddOverflow: LadderRung = {
        id: "r-add-overflow",
        label: "Float32 Overflow (1e39)",
        cells: [[emptyCell()]],
        topology: {
          id: "t-add-ovf",
          rootBranch: { id: "b-add-ovf", items: [] },
          outputs: [
            {
              id: "out-add-ovf",
              kind: "ADD",
              operand: "F32_OUT",
              params: { IN1: 5e38, IN2: 6e38, OUT: "F32_OUT", TYPE: "REAL" },
            },
          ],
        },
      };

      const outOvf = scanRungsPure([rungAddOverflow], { F32_OUT: 123.45 }, state, 500);
      expect(outOvf.tags.F32_OUT).toBe(123.45); // Tag PRESERVADA!
      expect(outOvf.results[0].poweredOut).toBe(false);
      expect(outOvf.results[0].diagnostics?.["out:out-add-ovf"]?.isErr).toBe(true);
      expect(outOvf.results[0].diagnostics?.["out:out-add-ovf"]?.errCode).toBe("OVERFLOW");

      // Com LREAL (binary64), 1.1e39 é perfeitamente suportado
      const rungAddLReal: LadderRung = {
        id: "r-add-lreal",
        label: "LREAL Float64 Precision",
        cells: [[emptyCell()]],
        topology: {
          id: "t-add-lr",
          rootBranch: { id: "b-add-lr", items: [] },
          outputs: [
            {
              id: "out-add-lr",
              kind: "ADD",
              operand: "F64_OUT",
              params: { IN1: 5e38, IN2: 6e38, OUT: "F64_OUT", TYPE: "LREAL" },
            },
          ],
        },
      };
      const outLR = scanRungsPure([rungAddLReal], { F64_OUT: 0 }, state, 600);
      expect(outLR.tags.F64_OUT).toBe(1.1e39);
      expect(outLR.results[0].poweredOut).toBe(true);

      // ABS do menor inteiro INT16_MIN (-32768) produz OVERFLOW em 16 bits
      const rungAbsMin: LadderRung = {
        id: "r-abs-min",
        label: "ABS of INT16_MIN",
        cells: [[emptyCell()]],
        topology: {
          id: "t-abs-min",
          rootBranch: { id: "b-abs-min", items: [] },
          outputs: [
            {
              id: "out-abs-min",
              kind: "ABS",
              operand: "ABS_OUT",
              params: { IN1: -32768, OUT: "ABS_OUT", TYPE: "INT" },
            },
          ],
        },
      };
      const outAbs = scanRungsPure(
        [rungAbsMin],
        { ABS_OUT: 999 },
        state,
        700,
        undefined,
        "generic",
      );
      expect(outAbs.tags.ABS_OUT).toBe(999); // Preservado!
      expect(outAbs.results[0].poweredOut).toBe(false);
      expect(outAbs.results[0].diagnostics?.["out:out-abs-min"]?.isErr).toBe(true);
      expect(outAbs.results[0].diagnostics?.["out:out-abs-min"]?.errCode).toBe("OVERFLOW");

      // INT_TO_REAL converte para binary32 ou LREAL
      const rungITR: LadderRung = {
        id: "rung-itr",
        label: "INT to REAL",
        cells: [[emptyCell()]],
        topology: {
          id: "r-itr",
          rootBranch: { id: "root-itr", items: [] },
          outputs: [
            {
              id: "out-itr",
              kind: "INT_TO_REAL",
              operand: "F_OUT",
              params: { IN: "I_IN", OUT: "F_OUT" },
            },
          ],
        },
      };

      let out = scanRungsPure([rungITR], { I_IN: 1234 }, state, 800);
      expect(out.tags.F_OUT).toBe(1234);
      expect(out.results[0].poweredOut).toBe(true);

      // Entrada não-finita no INT_TO_REAL preserva a tag de destino
      out = scanRungsPure([rungITR], { I_IN: NaN, F_OUT: 99.5 }, state, 900);
      expect(out.tags.F_OUT).toBe(99.5); // Preservado!
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:out-itr"]?.isErr).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OBJETIVO B: EXPORTAÇÃO IL E DELIMITAÇÃO COMO FORMATO LEGADO
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Exportação IL Sequencial e Delimitação como Formato Legado (IEC 61131-3:2025)", () => {
    it("2.1 Compilação sequencial real em dialeto IL com LD, AND, ANDN, OR, ST", () => {
      const rungStartStop: LadderRung = {
        id: "rung-ss",
        label: "Partida com Parada e Selo",
        cells: [[emptyCell()]],
        topology: {
          id: "r-ss",
          rootBranch: {
            id: "b-series",
            items: [
              {
                id: "b-par",
                type: "parallel",
                branches: [
                  {
                    id: "br1",
                    items: [
                      {
                        id: "c-start",
                        type: "instruction",
                        instruction: { id: "c-start", kind: "XIC", operand: "BOTAO_START" },
                      },
                    ],
                  },
                  {
                    id: "br2",
                    items: [
                      {
                        id: "c-selo",
                        type: "instruction",
                        instruction: { id: "c-selo", kind: "XIC", operand: "MOTOR_K1" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "c-stop",
                type: "instruction",
                instruction: { id: "c-stop", kind: "XIO", operand: "EMERGENCIA_NF" },
              },
            ],
          },
          outputs: [{ id: "o-mot", kind: "OTE", operand: "MOTOR_K1" }],
        },
      };

      const il = compileRungToIL(rungStartStop);

      // Deve gerar instruções IL sequenciais reais e NÃO expressões ST entre parênteses
      expect(il).toContain("LD    BOTAO_START");
      expect(il).toContain("OR    MOTOR_K1");
      expect(il).toContain("ANDN  EMERGENCIA_NF");
      expect(il).toContain("ST    MOTOR_K1");
      expect(il).not.toContain("LD  (BOTAO_START");
    });

    it("2.2 compileProgram inclui cabeçalho normativo de legado da IEC 61131-3:2025 ao exportar IL", () => {
      const simpleRung: LadderRung = {
        id: "r1",
        label: "Rung 1",
        cells: [[emptyCell()]],
        topology: {
          id: "t1",
          rootBranch: {
            id: "b1",
            items: [
              {
                id: "i1",
                type: "instruction",
                instruction: { id: "i1", kind: "XIC", operand: "S1" },
              },
            ],
          },
          outputs: [{ id: "o1", kind: "OTE", operand: "L1" }],
        },
      };

      const fullIL = compileProgram([simpleRung], "IL");
      expect(fullIL).toContain(IL_LEGACY_WARNING_HEADER);
      expect(fullIL).toContain("AVISO NORMATIVO IEC 61131-3 (FORMATO HISTÓRICO / LEGADO)");
      expect(fullIL).toContain("IEC 61131-3:2025");
      expect(fullIL).toContain("Structured Text (ST)");
      expect(fullIL).toContain("LD    S1");
      expect(fullIL).toContain("ST    L1");

      const fullST = compileProgram([simpleRung], "ST");
      expect(fullST).not.toContain(IL_LEGACY_WARNING_HEADER);
      expect(fullST).toContain("L1 := S1;");
    });

    it("2.3 Roundtrip: importador parseIlProgram lê o IL sequencial exportado com o cabeçalho de aviso", () => {
      const rungOrig: LadderRung = {
        id: "r-orig",
        label: "Rung Roundtrip",
        cells: [[emptyCell()]],
        topology: {
          id: "t-orig",
          rootBranch: {
            id: "b-orig",
            items: [
              {
                id: "c1",
                type: "instruction",
                instruction: { id: "c1", kind: "XIC", operand: "SENSOR_A" },
              },
              {
                id: "c2",
                type: "instruction",
                instruction: { id: "c2", kind: "XIO", operand: "SENSOR_B" },
              },
            ],
          },
          outputs: [{ id: "out1", kind: "OTE", operand: "VALVULA_Y1" }],
        },
      };

      const exportedIL = compileProgram([rungOrig], "IL");
      const imported = parseIlProgram(exportedIL);

      expect(imported.warnings.length).toBe(0);
      expect(imported.rungs.length).toBe(1);
      const cells = imported.rungs[0].cells[0];
      expect(cells[0].kind).toBe("XIC");
      expect(cells[0].operand).toBe("SENSOR_A");
      expect(cells[1].kind).toBe("XIO");
      expect(cells[1].operand).toBe("SENSOR_B");
      expect(cells[cells.length - 1].kind).toBe("OTE");
      expect(cells[cells.length - 1].operand).toBe("VALVULA_Y1");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OBJETIVO C: PROPAGAÇÃO CORRETA DE ERROS MATEMÁTICOS E PRESERVAÇÃO DE TAGS
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Propagação Correta de Erros Matemáticos (DIV/0, MOD/0, SQRT negativo, OVERFLOW)", () => {
    it("3.1 DIV_BY_ZERO: Preserva valor anterior da tag de destino, desenergiza ENO e recupera", () => {
      const rungDiv: LadderRung = {
        id: "r-div",
        label: "Divisão Segura",
        cells: [[emptyCell()]],
        topology: {
          id: "t-div",
          rootBranch: { id: "b-div", items: [] },
          outputs: [
            {
              id: "o-div",
              kind: "DIV",
              operand: "RESULTADO_DIV",
              params: { IN1: "NUM", IN2: "DENOM", OUT: "RESULTADO_DIV" },
            },
          ],
        },
      };

      // 1. Execução normal: 100 / 4 = 25
      let out = scanRungsPure([rungDiv], { NUM: 100, DENOM: 4, RESULTADO_DIV: 0 }, state, 100);
      expect(out.tags.RESULTADO_DIV).toBe(25);
      expect(out.results[0].poweredOut).toBe(true);
      expect(out.results[0].diagnostics?.["out:o-div"]?.done).toBe(true);

      // 2. Divisão por zero: DENOM = 0 -> tag de destino deve PRESERVAR 25!
      out = scanRungsPure([rungDiv], { NUM: 50, DENOM: 0, RESULTADO_DIV: 25 }, state, 200);
      expect(out.tags.RESULTADO_DIV).toBe(25); // PRESERVADO, não sobrescreve com 0!
      expect(out.results[0].poweredOut).toBe(false); // ENO desativado
      expect(out.results[0].diagnostics?.["out:o-div"]?.isErr).toBe(true);
      expect(out.results[0].diagnostics?.["out:o-div"]?.errCode).toBe("DIV_BY_ZERO");
      expect(out.results[0].diagnostics?.["out:o-div"]?.targetPreserved).toBe(true);

      // 3. Recuperação no scan seguinte: DENOM = 5 -> 50 / 5 = 10
      out = scanRungsPure([rungDiv], { NUM: 50, DENOM: 5, RESULTADO_DIV: 25 }, state, 300);
      expect(out.tags.RESULTADO_DIV).toBe(10);
      expect(out.results[0].poweredOut).toBe(true);
      expect(out.results[0].diagnostics?.["out:o-div"]?.isErr).toBe(false);
    });

    it("3.2 MOD_BY_ZERO e SQRT_NEGATIVE: Proteção e preservação estruturada", () => {
      const rungMod: LadderRung = {
        id: "r-mod",
        label: "Mod Seguro",
        cells: [[emptyCell()]],
        topology: {
          id: "t-mod",
          rootBranch: { id: "b-mod", items: [] },
          outputs: [
            {
              id: "o-mod",
              kind: "MOD",
              operand: "MOD_TAG",
              params: { IN1: 20, IN2: "DIVISOR", OUT: "MOD_TAG" },
            },
          ],
        },
      };

      const rungSqrt: LadderRung = {
        id: "r-sqrt",
        label: "Sqrt Seguro",
        cells: [[emptyCell()]],
        topology: {
          id: "t-sqrt",
          rootBranch: { id: "b-sqrt", items: [] },
          outputs: [
            {
              id: "o-sqrt",
              kind: "SQRT",
              operand: "SQRT_TAG",
              params: { IN1: "RADICANDO", OUT: "SQRT_TAG" },
            },
          ],
        },
      };

      // MOD por zero preserva tag existente
      let out = scanRungsPure([rungMod], { DIVISOR: 0, MOD_TAG: 99 }, state, 100);
      expect(out.tags.MOD_TAG).toBe(99);
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:o-mod"]?.errCode).toBe("MOD_BY_ZERO");
      expect(out.results[0].diagnostics?.["out:o-mod"]?.targetPreserved).toBe(true);

      // SQRT de número negativo preserva tag existente
      out = scanRungsPure([rungSqrt], { RADICANDO: -100, SQRT_TAG: 55 }, state, 200);
      expect(out.tags.SQRT_TAG).toBe(55);
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[0].diagnostics?.["out:o-sqrt"]?.errCode).toBe("SQRT_NEGATIVE");
      expect(out.results[0].diagnostics?.["out:o-sqrt"]?.targetPreserved).toBe(true);
    });

    it("3.3 Falha matemática em uma rede não contamina redes subsequentes nem variáveis independentes", () => {
      const rungErr: LadderRung = {
        id: "r-err",
        label: "Rede com erro",
        cells: [[emptyCell()]],
        topology: {
          id: "t-err",
          rootBranch: { id: "b-err", items: [] },
          outputs: [
            {
              id: "o-err",
              kind: "DIV",
              operand: "ERR_VAR",
              params: { IN1: 10, IN2: 0, OUT: "ERR_VAR" },
            },
          ],
        },
      };

      const rungOk: LadderRung = {
        id: "r-ok",
        label: "Rede sadia",
        cells: [[emptyCell()]],
        topology: {
          id: "t-ok",
          rootBranch: { id: "b-ok", items: [] },
          outputs: [
            {
              id: "o-ok",
              kind: "ADD",
              operand: "OK_VAR",
              params: { IN1: 30, IN2: 70, OUT: "OK_VAR" },
            },
          ],
        },
      };

      const out = scanRungsPure([rungErr, rungOk], { ERR_VAR: 88, OK_VAR: 0 }, state, 100);
      expect(out.tags.ERR_VAR).toBe(88); // Preservada
      expect(out.tags.OK_VAR).toBe(100); // Executada perfeitamente!
      expect(out.results[0].poweredOut).toBe(false);
      expect(out.results[1].poweredOut).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OBJETIVO D: SEMÂNTICA NORMATIVA DE CTUD (UP/DOWN COUNTER)
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Semântica Normativa de CTUD (IEC 61131-3)", () => {
    it("4.1 Borda de subida em CU incrementa, CD decrementa e nível contínuo mantém estabilidade", () => {
      const ctudMap = new Map();

      // Scan 1: CU sobe de 0 para 1 -> CV passa de 0 para 1
      let res = tickCTUD(ctudMap, "c1", true, false, false, false, 5);
      expect(res.cv).toBe(1);
      expect(res.qu).toBe(false);
      expect(res.qd).toBe(false);

      // Scan 2: CU permanece em nível alto (1) -> Estabilidade (sem contagem repetida)
      res = tickCTUD(ctudMap, "c1", true, false, false, false, 5);
      expect(res.cv).toBe(1);

      // Scan 3: CU desce para 0 -> CV permanece 1
      res = tickCTUD(ctudMap, "c1", false, false, false, false, 5);
      expect(res.cv).toBe(1);

      // Scan 4: CD sobe de 0 para 1 -> CV decrementa de 1 para 0
      res = tickCTUD(ctudMap, "c1", false, true, false, false, 5);
      expect(res.cv).toBe(0);
      expect(res.qd).toBe(true); // CV <= 0 aciona QD
    });

    it("4.2 Borda simultânea de CU e CD no mesmo scan mantém CV inalterado", () => {
      const ctudMap = new Map();
      // Inicializa com CV = 3
      tickCTUD(ctudMap, "c2", false, false, false, true, 3); // Load PV=3

      // Borda simultânea: CU e CD sobem juntos no mesmo scan
      const res = tickCTUD(ctudMap, "c2", true, true, false, false, 5);
      expect(res.cv).toBe(3); // Inalterado
    });

    it("4.3 Prioridade normativa estrita: Reset (R) > Load (LD) > Contagem (CU/CD)", () => {
      const ctudMap = new Map();

      // Se R for TRUE, zera CV mesmo se LD=true e mesmo com borda em CU
      const res = tickCTUD(ctudMap, "c3", true, false, true, true, 10);
      expect(res.cv).toBe(0);
      expect(res.qd).toBe(true); // 0 <= 0
      expect(res.qu).toBe(false);

      // Quando R cai para false, se LD for TRUE, carrega PV (10)
      const res2 = tickCTUD(ctudMap, "c3", true, false, false, true, 10);
      expect(res2.cv).toBe(10);
      expect(res2.qu).toBe(true); // 10 >= 10
    });

    it("4.4 Caso particular PV = 0: Se CV = 0, ambas as saídas QU e QD ficam ativas simultaneamente", () => {
      const ctudMap = new Map();
      const res = tickCTUD(ctudMap, "c4", false, false, true, false, 0); // Reset com PV=0
      expect(res.cv).toBe(0);
      expect(res.qu).toBe(true); // CV >= PV (0 >= 0)
      expect(res.qd).toBe(true); // CV <= 0 (0 <= 0)
    });

    it("4.5 Instâncias de CTUD mantêm estados totalmente isolados e independentes", () => {
      const ctudMap = new Map();

      // Instância A
      const resA = tickCTUD(ctudMap, "instA", true, false, false, false, 10);
      expect(resA.cv).toBe(1);

      // Instância B
      const resB = tickCTUD(ctudMap, "instB", false, false, false, true, 50);
      expect(resB.cv).toBe(50);

      // Verifica que A continua com seu próprio valor independente
      const resA2 = tickCTUD(ctudMap, "instA", false, false, false, false, 10);
      expect(resA2.cv).toBe(1);
    });

    it("4.6 Saturação em limites: CV satura em INT16_MAX e INT16_MIN (ou DINT32)", () => {
      const ctudMap = new Map();
      // Teste saturação positiva: inicializa em INT16_MAX
      tickCTUD(ctudMap, "c-sat", false, false, false, true, INT16_MAX);
      const res = tickCTUD(ctudMap, "c-sat", true, false, false, false, INT16_MAX, {
        min: INT16_MIN,
        max: INT16_MAX,
      });
      expect(res.cv).toBe(INT16_MAX); // Não transborda além do teto

      // Teste saturação negativa: inicializa em INT16_MIN
      tickCTUD(ctudMap, "c-sat-neg", false, false, false, true, INT16_MIN);
      const resNeg = tickCTUD(ctudMap, "c-sat-neg", false, true, false, false, INT16_MAX, {
        min: INT16_MIN,
        max: INT16_MAX,
      });
      expect(resNeg.cv).toBe(INT16_MIN); // Não transborda além do piso
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OBJETIVO E: POLÍTICA DE VARREDURA E PERFIS DE EXECUÇÃO
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Política de Varredura Top-Down, Propagação Sequencial e Precedência de Tags Forçadas", () => {
    it("5.1 Atualização imediata no mesmo scan: Rung 0 escreve tag consumida por Rung 1", () => {
      const rung0: LadderRung = {
        id: "r0",
        label: "Rung 0: Liga FLAG_A",
        cells: [[emptyCell()]],
        topology: {
          id: "t0",
          rootBranch: {
            id: "b0",
            items: [
              {
                id: "c0",
                type: "instruction",
                instruction: { id: "c0", kind: "XIC", operand: "IN_START" },
              },
            ],
          },
          outputs: [{ id: "out0", kind: "OTE", operand: "FLAG_A" }],
        },
      };

      const rung1: LadderRung = {
        id: "r1",
        label: "Rung 1: Usa FLAG_A para ligar MOTOR",
        cells: [[emptyCell()]],
        topology: {
          id: "t1",
          rootBranch: {
            id: "b1",
            items: [
              {
                id: "c1",
                type: "instruction",
                instruction: { id: "c1", kind: "XIC", operand: "FLAG_A" },
              },
            ],
          },
          outputs: [{ id: "out1", kind: "OTE", operand: "MOTOR" }],
        },
      };

      const out = scanRungsPure(
        [rung0, rung1],
        { IN_START: true, FLAG_A: false, MOTOR: false },
        state,
        100,
      );

      // No mesmo ciclo de scan, Rung 1 já lê FLAG_A = true gerado por Rung 0
      expect(out.tags.FLAG_A).toBe(true);
      expect(out.tags.MOTOR).toBe(true);
      expect(out.results[0].poweredOut).toBe(true);
      expect(out.results[1].poweredOut).toBe(true);
    });

    it("5.2 Última escrita vence (last write wins) em bobinas OTE duplicadas com diagnóstico de aviso", () => {
      const rung0: LadderRung = {
        id: "r0",
        label: "Rung 0: Escreve TRUE em COIL_X",
        cells: [[emptyCell()]],
        topology: {
          id: "t0",
          rootBranch: { id: "b0", items: [] }, // sempre alimentado
          outputs: [{ id: "out0", kind: "OTE", operand: "COIL_X" }],
        },
      };

      const rung1: LadderRung = {
        id: "r1",
        label: "Rung 1: Escreve FALSE em COIL_X",
        cells: [[emptyCell()]],
        topology: {
          id: "t1",
          rootBranch: {
            id: "b1",
            items: [
              {
                id: "c-off",
                type: "instruction",
                instruction: { id: "c-off", kind: "XIC", operand: "SINAL_FALSO" },
              },
            ],
          },
          outputs: [{ id: "out1", kind: "OTE", operand: "COIL_X" }],
        },
      };

      const out = scanRungsPure([rung0, rung1], { SINAL_FALSO: false }, state, 100);

      // Política normativa: a última rede que escreve determina o valor final da tag no scan
      expect(out.tags.COIL_X).toBe(false);
      // Diagnóstico acusa aviso de bobina duplicada na segunda escrita
      expect(out.results[1].diagnostics?.["out:out1"]?.text).toContain("[WARN: DOUBLE_COIL]");
    });

    it("5.3 Precedência absoluta de tags forçadas (forcedTags) sobre qualquer escrita lógica", () => {
      const rungForce: LadderRung = {
        id: "r-force",
        label: "Tenta desligar tag forçada",
        cells: [[emptyCell()]],
        topology: {
          id: "t-force",
          rootBranch: { id: "b-f", items: [] }, // alimentado
          outputs: [{ id: "out-f", kind: "OTE", operand: "VALVULA_SEGURA" }],
        },
      };

      const forcedSet = new Set(["VALVULA_SEGURA"]);

      // A simulação força VALVULA_SEGURA = false manualmente
      const out = scanRungsPure([rungForce], { VALVULA_SEGURA: false }, state, 100, forcedSet);

      // Mesmo que o rung tenha alimentado OTE, a tag forçada prevalece inalterada
      expect(out.tags.VALVULA_SEGURA).toBe(false);
    });
  });
});
