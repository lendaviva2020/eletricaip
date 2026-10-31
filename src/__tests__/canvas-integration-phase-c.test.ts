import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMultifilarCommands,
  detectMultifilarPhaseMismatches,
  equipmentIdOf,
  syncMultifilarCommands,
} from "@/lib/diagram/multifilar";
import { applyCommand } from "@/lib/diagram/commands";
import { createEmptyDoc, makeEdge, makeNode } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { newRung } from "@/lib/ladder/types";
import { usePlcStore } from "@/lib/plc/store";
import { useProjectStore } from "@/lib/project-store";
import {
  analyzeControlBridge,
  applyControlBridgeToModel,
  useRuntimeStore,
  useUnifiedProjectStore,
} from "@/lib/model";
import { deriveStudyDefaultsFromModel } from "@/components/simulation/electrical-study-panel";

function applyAll(
  doc: DiagramDoc,
  commands: ReturnType<typeof buildMultifilarCommands>,
): DiagramDoc {
  let cur = doc;
  for (const c of commands) {
    cur = applyCommand(cur, c);
  }
  return cur;
}

describe("Fase C — Integração Incremental dos Canvases (Contratos 1 a 7)", () => {
  beforeEach(() => {
    useUnifiedProjectStore.getState().resetUnifiedDoc({
      id: "proj-phase-c",
      name: "Projeto Fase C",
    });
    useRuntimeStore.getState().resetRuntime();
  });

  describe("Contrato 1 — Unifilar ↔ Multifilar incremental e validação de fases", () => {
    it("preserva ui.equipmentId e posições manuais no syncMultifilarCommands", () => {
      let doc = createEmptyDoc();
      const qf1 = makeNode({
        id: "qf1",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF1",
        params: {
          kind: "breaker",
          tag: "QF1",
          in_A: 32,
          curve: "C",
          poles: 3,
          icc_kA: 10,
        },
      });
      const m1 = makeNode({
        id: "m1",
        sheet: "unifilar",
        position: { x: 100, y: 260 },
        label: "M1",
        params: {
          kind: "motor",
          tag: "M1",
          power_kW: 7.5,
          voltage_V: 380,
          startMethod: "DOL",
        },
      });
      const e1 = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "qf1",
        target: "m1",
        sourcePort: "out",
        targetPort: "in",
        kind: "power",
      });
      doc = applyAll(doc, [
        { type: "AddNode", node: qf1 },
        { type: "AddNode", node: m1 },
        { type: "AddEdge", edge: e1 },
      ]);

      // 1. Geração inicial do multifilar
      doc = applyAll(doc, buildMultifilarCommands(doc));
      const mfQf1 = doc.nodes["mf_qf1"];
      const mfM1 = doc.nodes["mf_m1"];
      expect(mfQf1).toBeDefined();
      expect(mfM1).toBeDefined();
      expect(equipmentIdOf(mfQf1)).toBe("qf1");
      expect(equipmentIdOf(mfM1)).toBe("m1");

      // 2. Usuário move manualmente o nó mf_m1 no canvas multifilar
      doc = applyCommand(doc, {
        type: "MoveNode",
        nodeId: "mf_m1",
        from: mfM1.position,
        to: { x: 420, y: 580 },
      });
      expect(doc.nodes["mf_m1"].position).toEqual({ x: 420, y: 580 });

      // 3. No unifilar, usuário altera potência de M1 de 7.5 kW para 15 kW e rótulo
      const updatedParams = { ...m1.params, power_kW: 15 };
      doc = applyAll(doc, [
        { type: "UpdateNodeParams", nodeId: "m1", from: m1.params, to: updatedParams },
        { type: "UpdateNodeLabel", nodeId: "m1", from: "M1", to: "M1-15kW" },
      ]);

      // 4. Sincronização incremental atualiza parâmetros e rótulo SEM resetar posição
      const syncCmds = syncMultifilarCommands(doc);
      doc = applyAll(doc, syncCmds);

      expect(doc.nodes["mf_m1"].position).toEqual({ x: 420, y: 580 });
      expect(doc.nodes["mf_m1"].label).toBe("M1-15kW");
      expect(
        doc.nodes["mf_m1"].params.kind === "motor" ? doc.nodes["mf_m1"].params.power_kW : 0,
      ).toBe(15);
    });

    it("detecta divergência de pólos/fases (MULTIFILAR_PHASE_MISMATCH) quando disjuntor 1P alimenta motor 3F", () => {
      let doc = createEmptyDoc();
      const qf1Mono = makeNode({
        id: "qf1",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF1",
        params: {
          kind: "breaker",
          tag: "QF1",
          in_A: 16,
          curve: "C",
          poles: 1,
          icc_kA: 6,
        },
      });
      const m1Tri = makeNode({
        id: "m1",
        sheet: "unifilar",
        position: { x: 100, y: 260 },
        label: "M1",
        params: {
          kind: "motor",
          tag: "M1",
          power_kW: 5.5,
          voltage_V: 380,
          startMethod: "DOL",
        },
      });
      const e1 = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "qf1",
        target: "m1",
        sourcePort: "out",
        targetPort: "in",
        kind: "power",
      });
      doc = applyAll(doc, [
        { type: "AddNode", node: qf1Mono },
        { type: "AddNode", node: m1Tri },
        { type: "AddEdge", edge: e1 },
      ]);

      const mismatches = detectMultifilarPhaseMismatches(doc);
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].code).toBe("MULTIFILAR_PHASE_MISMATCH");
      expect(mismatches[0].availablePoles).toBe(1);
      expect(mismatches[0].requiredPoles).toBe(3);
      expect(mismatches[0].entityIds).toEqual(["qf1", "m1"]);
    });
  });

  describe("Contrato 2 — Ponte Unifilar → Controle (Ladder/FBD) e Diagnósticos de Topologia", () => {
    it("cria ControlBindings quando o ramo de partida direta (QF + KM + FR + M) é inequívoco", () => {
      const store = useUnifiedProjectStore.getState();
      store.upsertEquipment({
        id: "qf1",
        tagCode: "QF1",
        displayName: "Disjuntor QF1",
        catalogType: "breaker",
        category: "protection",
        phases: "3F",
        terminals: [],
        specs: { nominalCurrentA: 25, poles: 3 },
      });
      store.upsertEquipment({
        id: "km1",
        tagCode: "KM1",
        displayName: "Contator KM1",
        catalogType: "contactor",
        category: "switching",
        phases: "3F",
        terminals: [],
        specs: { coilVoltageV: 24 },
      });
      store.upsertEquipment({
        id: "fr1",
        tagCode: "FR1",
        displayName: "Relé Térmico FR1",
        catalogType: "relay",
        category: "protection",
        phases: "3F",
        terminals: [],
        specs: {},
      });
      store.upsertEquipment({
        id: "m1",
        tagCode: "M1",
        displayName: "Motor Bomba",
        catalogType: "motor",
        category: "load",
        phases: "3F+N+PE",
        terminals: [],
        specs: { powerKw: 5.5, voltageV: 380, startingMethod: "DOL" },
      });

      store.connectTerminals({
        id: "c1",
        fromEquipmentId: "qf1",
        fromTerminalId: "qf1:2",
        toEquipmentId: "km1",
        toTerminalId: "km1:1",
        kind: "power",
      });
      store.connectTerminals({
        id: "c2",
        fromEquipmentId: "km1",
        fromTerminalId: "km1:2",
        toEquipmentId: "fr1",
        toTerminalId: "fr1:1",
        kind: "power",
      });
      store.connectTerminals({
        id: "c3",
        fromEquipmentId: "fr1",
        fromTerminalId: "fr1:2",
        toEquipmentId: "m1",
        toTerminalId: "m1:U1",
        kind: "power",
      });

      const analysis = analyzeControlBridge(useUnifiedProjectStore.getState().doc);
      expect(analysis.diagnostics).toHaveLength(0);

      const summary = applyControlBridgeToModel(analysis);
      expect(summary.bindingsCreated).toBe(2);
      expect(summary.diagnosticsRecorded).toBe(0);

      const bindings = useUnifiedProjectStore.getState().doc.engineering.controlBindings;
      expect(bindings["cb_km1_main_contactor_coil"]).toBeDefined();
      expect(bindings["cb_km1_main_contactor_coil"].equipmentId).toBe("km1");
      expect(bindings["cb_fr1_overload_trip_nc"]).toBeDefined();
      expect(bindings["cb_fr1_overload_trip_nc"].equipmentId).toBe("fr1");
    });

    it("emite diagnósticos quando faltam contator/proteção ou quando há 2 contatores ambíguos no mesmo ramo", () => {
      const store = useUnifiedProjectStore.getState();
      // Motor M1 sem contator e sem proteção
      store.upsertEquipment({
        id: "m_lonely",
        tagCode: "M_SOLO",
        displayName: "Motor Solo",
        catalogType: "motor",
        category: "load",
        phases: "3F",
        terminals: [],
        specs: { powerKw: 3.7, voltageV: 380, startingMethod: "DOL" },
      });

      // Motor M2 com 2 contatores no mesmo ramo (ambiguidade reversora vs estrela-triângulo)
      store.upsertEquipment({
        id: "qf2",
        tagCode: "QF2",
        displayName: "QF2",
        catalogType: "breaker",
        category: "protection",
        phases: "3F",
        terminals: [],
        specs: { nominalCurrentA: 32 },
      });
      store.upsertEquipment({
        id: "km2a",
        tagCode: "KM2A",
        displayName: "KM2A",
        catalogType: "contactor",
        category: "switching",
        phases: "3F",
        terminals: [],
        specs: {},
      });
      store.upsertEquipment({
        id: "km2b",
        tagCode: "KM2B",
        displayName: "KM2B",
        catalogType: "contactor",
        category: "switching",
        phases: "3F",
        terminals: [],
        specs: {},
      });
      store.upsertEquipment({
        id: "m_amb",
        tagCode: "M_AMB",
        displayName: "Motor Ambíguo",
        catalogType: "motor",
        category: "load",
        phases: "3F",
        terminals: [],
        specs: { powerKw: 7.5, voltageV: 380, startingMethod: "DOL" },
      });
      store.connectTerminals({
        id: "ca",
        fromEquipmentId: "qf2",
        fromTerminalId: "qf2:2",
        toEquipmentId: "km2a",
        toTerminalId: "km2a:1",
        kind: "power",
      });
      store.connectTerminals({
        id: "cb",
        fromEquipmentId: "km2a",
        fromTerminalId: "km2a:2",
        toEquipmentId: "m_amb",
        toTerminalId: "m_amb:U1",
        kind: "power",
      });
      store.connectTerminals({
        id: "cc",
        fromEquipmentId: "km2b",
        fromTerminalId: "km2b:2",
        toEquipmentId: "m_amb",
        toTerminalId: "m_amb:U1",
        kind: "power",
      });

      const analysis = analyzeControlBridge(useUnifiedProjectStore.getState().doc);
      const codes = analysis.diagnostics.map((d) => d.code);
      expect(codes).toContain("CONTROL_BRIDGE_MISSING_CONTACTOR");
      expect(codes).toContain("CONTROL_BRIDGE_MISSING_PROTECTION");
      expect(codes).toContain("CONTROL_BRIDGE_AMBIGUOUS_STARTER_TOPOLOGY");

      const summary = applyControlBridgeToModel(analysis);
      // Nenhum vínculo inventado para ramos ambíguos ou sem contator
      expect(summary.bindingsCreated).toBe(0);
      expect(summary.diagnosticsRecorded).toBe(3);
    });
  });

  describe("Contratos 3 e 4 — Isolamento de Runtime (RungGrid) e Sincronização de Blocos PLC", () => {
    it("setRungsRuntime atualiza energização sem marcar UnifiedProjectStore como dirty nem incrementar revisão", () => {
      useUnifiedProjectStore.getState().markSaved();
      const revBefore = useUnifiedProjectStore.getState().doc.metadata.revision;
      expect(useUnifiedProjectStore.getState().dirty).toBe(false);

      const rungs = useEditorStore.getState().rungs;
      const energizedRungs = rungs.map((r) => ({
        ...r,
        poweredOut: true,
        cells: r.cells.map((row) => row.map((c) => ({ ...c, energized: true }))),
      }));

      useEditorStore.getState().setRungsRuntime(energizedRungs);

      expect(useEditorStore.getState().rungs[0].poweredOut).toBe(true);
      expect(useUnifiedProjectStore.getState().dirty).toBe(false);
      expect(useUnifiedProjectStore.getState().doc.metadata.revision).toBe(revBefore);
    });

    it("sincroniza edições estruturais de Ladder no bloco PLC ativo sem sobrescrever blocos FBD", () => {
      usePlcStore.getState().addBlock({
        id: "fb_pid_1",
        name: "Bloco_PID",
        type: "FB",
        number: 1,
        language: "fbd",
        code: "",
        comment: "Bloco FBD",
      });
      const fbdBlock = usePlcStore
        .getState()
        .project.programBlocks.find((b) => b.id === "fb_pid_1")!;
      expect(fbdBlock).toBeDefined();

      useUnifiedProjectStore.getState().setActiveProgramBlock(fbdBlock.id);
      useEditorStore.getState().setFbdAll(
        [
          {
            id: "fbd_n1",
            type: "ADD",
            position: { x: 80, y: 80 },
            data: { label: "ADD" },
          },
        ],
        [],
      );

      // Alterna para o OB1 ("pb-1", Ladder) e adiciona uma rung
      useUnifiedProjectStore.getState().setActiveProgramBlock("pb-1");
      const currentRungs = useEditorStore.getState().rungs;
      useEditorStore.getState().setRungs([...currentRungs, newRung(currentRungs.length)]);

      const unifiedBlocks = useUnifiedProjectStore.getState().doc.plc.project.programBlocks;
      const ob1 = unifiedBlocks.find((b) => b.id === "pb-1");
      const syncedFbd = unifiedBlocks.find((b) => b.id === fbdBlock.id);

      expect(ob1?.ladder?.rungs.length).toBeGreaterThanOrEqual(2);
      expect(syncedFbd?.fbd?.nodes).toHaveLength(1);
      expect((syncedFbd?.fbd?.nodes[0] as { id: string }).id).toBe("fbd_n1");
    });
  });

  describe("Contrato 7 — Derivação de Parâmetros de Estudos e Invalidação Automática (Stale)", () => {
    it("extrai parâmetros do modelo canônico e marca estudo como stale quando equipamento muda no WebGL", () => {
      // 1. Usuário adiciona transformador e motor no WebGL (useDiagramStore)
      const diagramStore = useDiagramStore.getState();
      diagramStore.dispatch({
        type: "AddNode",
        node: makeNode({
          id: "tr_main",
          sheet: "unifilar",
          position: { x: 100, y: 60 },
          label: "TR1",
          params: {
            kind: "transformer",
            tag: "TR1",
            kVA: 1000,
            primary_V: 13800,
            secondary_V: 380,
            vector: "Dyn11",
          },
        }),
      });
      diagramStore.dispatch({
        type: "AddNode",
        node: makeNode({
          id: "m_pump",
          sheet: "unifilar",
          position: { x: 100, y: 260 },
          label: "M1",
          params: {
            kind: "motor",
            tag: "M1",
            power_kW: 22,
            voltage_V: 380,
            startMethod: "DOL",
          },
        }),
      });

      const docAfterAdd = useUnifiedProjectStore.getState().doc;
      // Verifica que useProjectStore também recebeu os nós do WebGL (ponte não destrutiva)
      expect(useProjectStore.getState().nodes.some((n) => n.id === "tr_main")).toBe(true);
      expect(useProjectStore.getState().nodes.some((n) => n.id === "m_pump")).toBe(true);

      // 2. Derivação automática de parâmetros para curto-circuito
      const scDefaults = deriveStudyDefaultsFromModel(docAfterAdd, "short_circuit");
      expect(scDefaults.values.power_kVA).toBe("1000");
      expect(scDefaults.values.secondary_V).toBe("380");
      expect(scDefaults.inputEquipmentIds).toEqual(["tr_main"]);

      // 3. Registra estudo de curto-circuito como válido
      useUnifiedProjectStore.getState().upsertStudy({
        id: "study_short_circuit",
        studyType: "short_circuit",
        title: "Curto-circuito (IEC 60909)",
        inputEquipmentIds: scDefaults.inputEquipmentIds,
        status: "valid",
        parameters: scDefaults.values,
        results: { shortCircuit: { Ik3ph_kA: 27.6 } },
      });
      expect(useUnifiedProjectStore.getState().doc.studies["study_short_circuit"].status).toBe(
        "valid",
      );

      // 4. Arco elétrico aproveita Ik3ph_kA do estudo de curto-circuito
      const afDefaults = deriveStudyDefaultsFromModel(
        useUnifiedProjectStore.getState().doc,
        "arc_flash",
      );
      expect(afDefaults.values.ik_kA).toBe("27.6");

      // 5. Usuário altera a potência do transformador TR1 de 1000 kVA para 1500 kVA no WebGL
      const prevTr = useDiagramStore.getState().doc.nodes["tr_main"];
      if (prevTr.params.kind === "transformer") {
        diagramStore.dispatch({
          type: "UpdateNodeParams",
          nodeId: "tr_main",
          from: prevTr.params,
          to: { ...prevTr.params, kVA: 1500 },
        });
      }

      // 6. Estudo dependente passa automaticamente para "stale"
      expect(useUnifiedProjectStore.getState().doc.studies["study_short_circuit"].status).toBe(
        "stale",
      );
    });
  });
});
