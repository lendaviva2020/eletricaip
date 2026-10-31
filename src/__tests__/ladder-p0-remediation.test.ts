import { describe, it, expect, beforeEach } from "vitest";
import {
  type LadderRung,
  type LadderCell,
  type RungTopology,
  buildTopologyFromCells,
  ensureRungTopology,
  emptyCell,
} from "../lib/ladder/types";
import { scanRungsPure, createScanState, type PureTags } from "../lib/ladder/scan-core";
import { compileRungToST } from "../lib/ladder/compiler";
import { useEditorStore } from "../lib/editor/store";

describe("Ladder P0 Remediation — Type Integrity, AST Synchronization & Legacy Topology", () => {
  beforeEach(() => {
    useEditorStore.getState().hydrateSnapshot({
      editorTags: {},
      rungs: [],
      fbdNodes: [],
      fbdEdges: [],
    });
  });

  describe("a) Desynchronization & Single Source of Truth", () => {
    it("synchronizes rung.cells and rung.topology when an instruction operand is updated", () => {
      // Criação de um rung inicial
      const initialRung: LadderRung = {
        id: "rung-desync-test",
        label: "Teste Dessincronizacao",
        cols: 4,
        cells: [
          [
            { id: "c-0-0", kind: "XIC", operand: "SENSOR_A" },
            { id: "c-0-1", kind: "XIC", operand: "PERMISSAO_GERAL" },
            emptyCell(),
            { id: "c-0-3", kind: "OTE", operand: "VALVULA_V1" },
          ],
        ],
      };

      useEditorStore.getState().setRungs([initialRung]);

      const storedRung = useEditorStore.getState().rungs[0];
      const initialTopology = ensureRungTopology(storedRung);
      expect(initialTopology.rootBranch.items).toHaveLength(2);
      expect(initialTopology.rootBranch.items[0]).toMatchObject({
        type: "instruction",
        instruction: { operand: "SENSOR_A" },
      });

      // Simulação inicial com SENSOR_A = true -> ativado
      const state = createScanState();
      let res = scanRungsPure([storedRung], { SENSOR_A: true, PERMISSAO_GERAL: true }, state, 1000);
      expect(res.results[0].poweredOut).toBe(true);
      expect(res.tags["VALVULA_V1"]).toBe(true);

      // Mutação: Altera SENSOR_A -> SENSOR_B
      // Simula a mutação exata aplicada pelo rung-grid e ladder-property-panel
      const nextCell: LadderCell = { id: "c-0-0", kind: "XIC", operand: "SENSOR_B" };
      useEditorStore.getState().setRungs((prev) =>
        prev.map((r) => {
          if (r.id !== "rung-desync-test") return r;
          const cells = r.cells.map((row, ri) =>
            ri === 0 ? row.map((c, ci) => (ci === 0 ? nextCell : c)) : row,
          );
          let topology: RungTopology | undefined = r.topology
            ? JSON.parse(JSON.stringify(r.topology))
            : undefined;
          if (topology) {
            for (const item of topology.rootBranch.items) {
              if (item.type === "instruction" && item.instruction?.id === "c-0-0") {
                item.instruction.operand = "SENSOR_B";
              }
            }
          } else {
            topology = buildTopologyFromCells({ ...r, cells });
          }
          return { ...r, cells, topology };
        }),
      );

      const updatedRung = useEditorStore.getState().rungs[0];

      // 1. Assert que r.topology reflete a alteração
      expect(updatedRung.cells[0][0].operand).toBe("SENSOR_B");
      expect(updatedRung.topology?.rootBranch.items[0]).toMatchObject({
        type: "instruction",
        instruction: { operand: "SENSOR_B" },
      });

      // 2. Assert que o scan engine avalia a nova instrução/operando
      // Se SENSOR_A estiver ativo mas SENSOR_B desligado -> saída DEVE ser falsa
      res = scanRungsPure(
        [updatedRung],
        { SENSOR_A: true, SENSOR_B: false, PERMISSAO_GERAL: true },
        state,
        2000,
      );
      expect(res.results[0].poweredOut).toBe(false);
      expect(res.tags["VALVULA_V1"]).toBe(false);

      // Com SENSOR_B ativo -> saída DEVE ser verdadeira
      res = scanRungsPure(
        [updatedRung],
        { SENSOR_A: false, SENSOR_B: true, PERMISSAO_GERAL: true },
        state,
        3000,
      );
      expect(res.results[0].poweredOut).toBe(true);
      expect(res.tags["VALVULA_V1"]).toBe(true);

      // 3. Assert que a exportação ST contém a alteração
      const st = compileRungToST(updatedRung);
      expect(st).toContain("SENSOR_B");
      expect(st).not.toContain("SENSOR_A");
      expect(st).toBe("VALVULA_V1 := SENSOR_B AND PERMISSAO_GERAL;");

      // 4. Assert de serialização e desserialização JSON (roundtrip)
      const serialized = JSON.stringify(updatedRung);
      const deserialized: LadderRung = JSON.parse(serialized);
      expect(deserialized.cells[0][0].operand).toBe("SENSOR_B");
      const roundtripTopology = ensureRungTopology(deserialized);
      expect(roundtripTopology.rootBranch.items[0]).toMatchObject({
        type: "instruction",
        instruction: { operand: "SENSOR_B" },
      });
    });

    it("synchronizes output coil mutations across cells, topology, scan writes and ST export", () => {
      const rung: LadderRung = {
        id: "rung-coil-mutation",
        label: "Mutacao de Bobina",
        cols: 3,
        cells: [
          [
            { id: "c1", kind: "XIC", operand: "IN_START" },
            emptyCell(),
            { id: "c_out", kind: "OTE", operand: "MOTOR_A" },
          ],
        ],
      };

      const topology = ensureRungTopology(rung);
      expect(topology.outputs[0].operand).toBe("MOTOR_A");

      // Modifica a bobina para MOTOR_B
      topology.outputs[0].operand = "MOTOR_B";
      rung.cells[0][2].operand = "MOTOR_B";

      const state = createScanState();
      const res = scanRungsPure([rung], { IN_START: true }, state, 1000);
      expect(res.results[0].poweredOut).toBe(true);
      expect(res.tags["MOTOR_B"]).toBe(true);
      expect(res.tags["MOTOR_A"]).toBeUndefined();

      const st = compileRungToST(rung);
      expect(st).toBe("MOTOR_B := IN_START;");
    });
  });

  describe("b) Legacy Topology Conversion & Safety Interlock Preservation", () => {
    it("converts multi-row legacy matrix into segmented parallel branches without bypassing series safety contacts", () => {
      // Matriz legada clássica de partida direta com selo:
      // Linha 0: [XIC B_PARTIDA, XIO E_PARADA_EMERG, XIO FALHA_SOBRECARGA, OTE BOMBA_MAIN]
      // Linha 1: [XIC B_STATUS_RUN, EMPTY, EMPTY, EMPTY]
      const legacyRung: LadderRung = {
        id: "rung-motor-starter-legacy",
        label: "Intertravamento Partida Direta",
        cols: 4,
        cells: [
          [
            { id: "c-0-0", kind: "XIC", operand: "B_PARTIDA" },
            { id: "c-0-1", kind: "XIO", operand: "E_PARADA_EMERG" },
            { id: "c-0-2", kind: "XIO", operand: "FALHA_SOBRECARGA" },
            { id: "c-0-3", kind: "OTE", operand: "BOMBA_MAIN" },
          ],
          [
            { id: "c-1-0", kind: "XIC", operand: "B_STATUS_RUN" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
          ],
        ],
      };

      // Executa a conversão pela função pura buildTopologyFromCells
      const topology = buildTopologyFromCells(legacyRung);

      // Comprova a estrutura do AST gerado
      expect(topology.outputs).toHaveLength(1);
      expect(topology.outputs[0]).toMatchObject({
        kind: "OTE",
        operand: "BOMBA_MAIN",
      });

      // A raiz DEVE conter exatamente 3 itens em série:
      // Item 0: Ramo paralelo (B_PARTIDA OU B_STATUS_RUN)
      // Item 1: Contato de emergência em série (XIO E_PARADA_EMERG)
      // Item 2: Relé de sobrecarga em série (XIO FALHA_SOBRECARGA)
      const items = topology.rootBranch.items;
      expect(items).toHaveLength(3);

      // Item 0: Bloco Paralelo
      expect(items[0]?.type).toBe("parallel");
      const item0 = items[0];
      if (item0 && item0.type === "parallel" && item0.branches) {
        expect(item0.branches).toHaveLength(2);
        // Ramo 0: B_PARTIDA
        expect(item0.branches[0]?.items[0]).toMatchObject({
          type: "instruction",
          instruction: { kind: "XIC", operand: "B_PARTIDA" },
        });
        // Ramo 1: B_STATUS_RUN
        expect(item0.branches[1]?.items[0]).toMatchObject({
          type: "instruction",
          instruction: { kind: "XIC", operand: "B_STATUS_RUN" },
        });
      }

      // Item 1: Parada de Emergência estritamente em série
      expect(items[1]).toMatchObject({
        type: "instruction",
        instruction: { kind: "XIO", operand: "E_PARADA_EMERG" },
      });

      // Item 2: Relé de Sobrecarga estritamente em série
      expect(items[2]).toMatchObject({
        type: "instruction",
        instruction: { kind: "XIO", operand: "FALHA_SOBRECARGA" },
      });

      // Confirma que a emergência e sobrecarga NÃO aparecem em nenhum ramo paralelo
      if (item0 && item0.type === "parallel" && item0.branches) {
        for (const br of item0.branches) {
          for (const it of br.items) {
            if (it.type === "instruction" && it.instruction) {
              expect(it.instruction.operand).not.toBe("E_PARADA_EMERG");
              expect(it.instruction.operand).not.toBe("FALHA_SOBRECARGA");
            }
          }
        }
      }

      // Confirma a exportação ST correta
      const st = compileRungToST({ ...legacyRung, topology });
      expect(st).toBe(
        "BOMBA_MAIN := (B_PARTIDA OR B_STATUS_RUN) AND NOT E_PARADA_EMERG AND NOT FALHA_SOBRECARGA;",
      );
    });
  });

  describe("c) Safety Interlock Truth-Table Verification", () => {
    it("evaluates all 16 combinations strictly according to (B_PARTIDA OR B_STATUS_RUN) AND NOT E_PARADA_EMERG AND NOT FALHA_SOBRECARGA", () => {
      const legacyRung: LadderRung = {
        id: "rung-truth-table",
        label: "Tabela Verdade Intertravamento",
        cols: 4,
        cells: [
          [
            { id: "c-0-0", kind: "XIC", operand: "B_PARTIDA" },
            { id: "c-0-1", kind: "XIO", operand: "E_PARADA_EMERG" },
            { id: "c-0-2", kind: "XIO", operand: "FALHA_SOBRECARGA" },
            { id: "c-0-3", kind: "OTE", operand: "BOMBA_MAIN" },
          ],
          [
            { id: "c-1-0", kind: "XIC", operand: "B_STATUS_RUN" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
          ],
        ],
      };

      const topology = ensureRungTopology(legacyRung);
      const testRung: LadderRung = { ...legacyRung, topology };

      const state = createScanState();

      // Teste das 16 combinações possíveis (2^4)
      for (let partida = 0; partida <= 1; partida++) {
        for (let selo = 0; selo <= 1; selo++) {
          for (let parada = 0; parada <= 1; parada++) {
            for (let sobrecarga = 0; sobrecarga <= 1; sobrecarga++) {
              const bPartida = partida === 1;
              const bSelo = selo === 1;
              const eParada = parada === 1;
              const fSobrecarga = sobrecarga === 1;

              // Lógica de segurança de engenharia:
              // Para ligar: (partida OU selo) E NÃO parada E NÃO sobrecarga
              const expectedOutput = (bPartida || bSelo) && !eParada && !fSobrecarga;

              const tags: PureTags = {
                B_PARTIDA: bPartida,
                B_STATUS_RUN: bSelo,
                E_PARADA_EMERG: eParada,
                FALHA_SOBRECARGA: fSobrecarga,
              };

              const res = scanRungsPure([testRung], tags, state, 1000);
              const actualPoweredOut = res.results[0].poweredOut;
              const actualCoilWrite = Boolean(res.tags["BOMBA_MAIN"]);

              expect(actualPoweredOut).toBe(expectedOutput);
              expect(actualCoilWrite).toBe(expectedOutput);
            }
          }
        }
      }

      // Verificação específica do cenário crítico que causou o apontamento da auditoria:
      // Motor em rotação (selo = 1), operador aperta Parada de Emergência (parada = 1)
      const criticalEmergencyPress: PureTags = {
        B_PARTIDA: false,
        B_STATUS_RUN: true,
        E_PARADA_EMERG: true, // Botão de emergência acionado (NF aberto)
        FALHA_SOBRECARGA: false,
      };
      const resEmergency = scanRungsPure([testRung], criticalEmergencyPress, state, 2000);
      expect(resEmergency.results[0].poweredOut).toBe(false);
      expect(resEmergency.tags["BOMBA_MAIN"]).toBe(false);

      // Cenário de sobrecarga térmica atuada durante a operação com selo:
      const criticalThermalTrip: PureTags = {
        B_PARTIDA: false,
        B_STATUS_RUN: true,
        E_PARADA_EMERG: false,
        FALHA_SOBRECARGA: true, // Relé térmico desarmado
      };
      const resThermal = scanRungsPure([testRung], criticalThermalTrip, state, 3000);
      expect(resThermal.results[0].poweredOut).toBe(false);
      expect(resThermal.tags["BOMBA_MAIN"]).toBe(false);

      // Cenário de ambos acionados simultaneamente:
      const resBothTripped = scanRungsPure(
        [testRung],
        { B_PARTIDA: true, B_STATUS_RUN: true, E_PARADA_EMERG: true, FALHA_SOBRECARGA: true },
        state,
        4000,
      );
      expect(resBothTripped.results[0].poweredOut).toBe(false);
      expect(resBothTripped.tags["BOMBA_MAIN"]).toBe(false);
    });
  });

  describe("d) Full Roundtrip: Legacy JSON -> Normalization -> Edition -> ST Export -> Re-execution", () => {
    it("completes a full persistence roundtrip and logical re-execution without losing integrity", () => {
      // 1. JSON legado puro (sem campo topology)
      const legacyRawJson = JSON.stringify({
        id: "rung-roundtrip-42",
        label: "Rede Legada V1",
        cols: 4,
        cells: [
          [
            { id: "c-0", kind: "XIC", operand: "TAG_START_LEGACY" },
            { id: "c-1", kind: "XIO", operand: "ESTOP_LEGACY" },
            emptyCell(),
            { id: "c-out", kind: "OTE", operand: "COIL_LEGACY" },
          ],
          [
            { id: "c-seal", kind: "XIC", operand: "SEAL_LEGACY" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
          ],
        ],
      });

      // 2. Desserialização e normalização
      const parsedRung: LadderRung = JSON.parse(legacyRawJson);
      const normalizedTopology = ensureRungTopology(parsedRung);
      expect(normalizedTopology).toBeDefined();
      expect(normalizedTopology.outputs[0].operand).toBe("COIL_LEGACY");

      // 3. Edição: renomeia operandos industriais
      // Renomeia COIL_LEGACY -> BOMBA_RECALQUE_01
      // Renomeia TAG_START_LEGACY -> B_START_PULSE
      normalizedTopology.outputs[0].operand = "BOMBA_RECALQUE_01";
      parsedRung.cells[0][3].operand = "BOMBA_RECALQUE_01";

      const firstItem = normalizedTopology.rootBranch.items[0];
      if (
        firstItem &&
        firstItem.type === "parallel" &&
        firstItem.branches &&
        firstItem.branches[0]
      ) {
        firstItem.branches[0].items[0] = {
          id: "item-renamed",
          type: "instruction",
          instruction: { id: "inst-renamed", kind: "XIC", operand: "B_START_PULSE" },
        };
      }
      parsedRung.cells[0][0].operand = "B_START_PULSE";

      // 4. Exportação para Linguagem Estruturada (ST)
      const stExport = compileRungToST({ ...parsedRung, topology: normalizedTopology });
      expect(stExport).toBe(
        "BOMBA_RECALQUE_01 := (B_START_PULSE OR SEAL_LEGACY) AND NOT ESTOP_LEGACY;",
      );

      // 5. Re-execução com motor puro
      const state = createScanState();
      // Teste com pulso de partida e emergência desarmada -> liga
      const scan1 = scanRungsPure(
        [{ ...parsedRung, topology: normalizedTopology }],
        { B_START_PULSE: true, SEAL_LEGACY: false, ESTOP_LEGACY: false },
        state,
        1000,
      );
      expect(scan1.results[0].poweredOut).toBe(true);
      expect(scan1.tags["BOMBA_RECALQUE_01"]).toBe(true);

      // Teste com selo mantido e emergência acionada -> desliga imediatamente
      const scan2 = scanRungsPure(
        [{ ...parsedRung, topology: normalizedTopology }],
        { B_START_PULSE: false, SEAL_LEGACY: true, ESTOP_LEGACY: true },
        state,
        2000,
      );
      expect(scan2.results[0].poweredOut).toBe(false);
      expect(scan2.tags["BOMBA_RECALQUE_01"]).toBe(false);

      // 6. Serialização final para persistência no banco / local storage
      const finalJson = JSON.stringify({ ...parsedRung, topology: normalizedTopology });
      const rehydratedRung: LadderRung = JSON.parse(finalJson);
      expect(rehydratedRung.topology?.outputs[0].operand).toBe("BOMBA_RECALQUE_01");
      expect(compileRungToST(rehydratedRung)).toBe(
        "BOMBA_RECALQUE_01 := (B_START_PULSE OR SEAL_LEGACY) AND NOT ESTOP_LEGACY;",
      );
    });
  });
});
