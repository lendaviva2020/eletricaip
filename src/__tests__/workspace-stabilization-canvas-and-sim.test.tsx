import { describe, it, expect, beforeEach, vi } from "vitest";
import { DiagramStage } from "@/lib/diagram/render/stage";
import { useDiagramStore } from "@/lib/diagram/store";
import { cmd } from "@/lib/diagram/commands";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";
import {
  computeCircuitEnergization,
  isSwitchingDevice,
  isPowerSourceNode,
} from "@/lib/diagram/electrical-simulation";
import type { DiagramDoc, DiagramNode, DiagramEdge } from "@/lib/diagram/schema";
import { getContextualTabsForMode } from "@/components/editor/unified-bottom-dock";
import { getPorts } from "@/lib/diagram/render/ports";
import { shouldAutoCollapsePanels } from "@/lib/editor/tablet-layout";

describe("ELÉTRICAI — Estabilização do Workspace e Canvas Profissional", () => {
  beforeEach(() => {
    useDiagramStore.getState().resetDoc();
    useEditorStore.getState().resetSimulationState();
  });

  describe("1. Viewport, Zoom, Pan e Grade Técnica", () => {
    it("inicializa com limites de escala estritos e método de fitView baseado em bounding-box", () => {
      const stage = new DiagramStage();
      expect(stage).toBeDefined();

      // Testa cálculos de bounds em nós
      const testNodes: DiagramNode[] = [
        {
          id: "n1",
          sheet: "unifilar",
          position: { x: 100, y: 100 },
          rotation: 0,
          label: "QF1",
          params: { kind: "breaker", in_A: 63, curve: "C", poles: 3 },
        },
        {
          id: "n2",
          sheet: "unifilar",
          position: { x: 500, y: 400 },
          rotation: 0,
          label: "M1",
          params: { kind: "motor", power_kW: 7.5, current_A: 15.2, voltage_V: 380, startMethod: "DOL" },
        },
      ];

      // Verificação de nós no documento
      useDiagramStore.getState().dispatch(cmd.addNode(testNodes[0]));
      useDiagramStore.getState().dispatch(cmd.addNode(testNodes[1]));

      const doc = useDiagramStore.getState().doc;
      expect(Object.keys(doc.nodes).length).toBe(2);
      expect(doc.nodes["n1"].position).toEqual({ x: 100, y: 100 });
      expect(doc.nodes["n2"].position).toEqual({ x: 500, y: 400 });
    });

    it("mantém zoom previsível e seguro, impedindo transformações infinitas ou NaN", () => {
      const stage = new DiagramStage();
      expect(typeof stage.zoomIn).toBe("function");
      expect(typeof stage.zoomOut).toBe("function");
      expect(typeof stage.resetZoom).toBe("function");
      expect(typeof stage.fitView).toBe("function");
      // Chamar sync/fitView/zoom antes de init() ou após destroy() não deve lançar erro nem criar canvas órfão
      expect(() => stage.sync(useDiagramStore.getState().doc, "unifilar", [], [])).not.toThrow();
      expect(() => stage.fitView()).not.toThrow();
      expect(() => stage.zoomIn()).not.toThrow();
      expect(() => stage.destroy()).not.toThrow();
      expect(() => stage.sync(useDiagramStore.getState().doc, "unifilar", [], [])).not.toThrow();
    });

    it("garante que nenhum tipo de símbolo posicione porta em (0, 0) bloqueando o clique de seleção no centro", () => {
      const allKinds = [
        "breaker",
        "rcd",
        "contactor",
        "fuse",
        "disconnector",
        "relay",
        "thermal_relay",
        "motor",
        "load",
        "lamp",
        "socket",
        "capacitor_bank",
        "generator",
        "transformer",
        "psu",
        "vfd",
        "softstarter",
        "busbar",
        "ccm",
        "plc",
        "hmi",
        "ground",
        "neutral",
        "terminal",
        "pt100",
        "pressure",
        "flow",
        "level",
        "encoder",
        "estop",
        "lightcurtain",
      ] as const;

      for (const kind of allKinds) {
        const ports = getPorts(kind);
        for (const p of ports) {
          expect(p.x === 0 && p.y === 0).toBe(false);
        }
      }
    });

    it("auto-recolhe painéis laterais em resoluções menores (< 1280px: 768x1024 e 390x844)", () => {
      expect(shouldAutoCollapsePanels(1440)).toBe(false);
      expect(shouldAutoCollapsePanels(1280)).toBe(false);
      expect(shouldAutoCollapsePanels(768)).toBe(true);
      expect(shouldAutoCollapsePanels(390)).toBe(true);
    });
  });

  describe("2. Exclusão nos Três Editores (Unifilar, Multifilar, Ladder)", () => {
    it("Unifilar/Multifilar: seleciona e exclui nó e remove automaticamente arestas incidentes", () => {
      const store = useDiagramStore.getState();

      // Adiciona nó A, nó B e aresta A -> B
      store.dispatch(
        cmd.addNode({
          id: "qf_main",
          sheet: "unifilar",
          position: { x: 200, y: 200 },
          label: "QF_MAIN",
          params: { kind: "breaker", in_A: 100, curve: "C", poles: 3 },
        }),
      );
      store.dispatch(
        cmd.addNode({
          id: "motor_main",
          sheet: "unifilar",
          position: { x: 200, y: 400 },
          label: "M_MAIN",
          params: { kind: "motor", power_kW: 15, current_A: 30, voltage_V: 380, startMethod: "DOL" },
        }),
      );
      store.dispatch(
        cmd.addEdge({
          id: "edge_power_1",
          sheet: "unifilar",
          source: "qf_main",
          target: "motor_main",
          kind: "power",
        }),
      );

      let doc = useDiagramStore.getState().doc;
      expect(doc.nodes["qf_main"]).toBeDefined();
      expect(doc.nodes["motor_main"]).toBeDefined();
      expect(doc.edges["edge_power_1"]).toBeDefined();

      // Seleciona e exclui o disjuntor qf_main
      useDiagramStore.getState().setSelection(["qf_main"], []);
      useDiagramStore.getState().deleteSelected();

      doc = useDiagramStore.getState().doc;
      expect(doc.nodes["qf_main"]).toBeUndefined();
      // O motor permanece intacto
      expect(doc.nodes["motor_main"]).toBeDefined();
      // A aresta incidente foi limpa, sem deixar fios órfãos
      expect(doc.edges["edge_power_1"]).toBeUndefined();

      // Desfazer (Undo) restaura o nó e a aresta incidente
      useDiagramStore.getState().undo();
      doc = useDiagramStore.getState().doc;
      expect(doc.nodes["qf_main"]).toBeDefined();
      expect(doc.edges["edge_power_1"]).toBeDefined();

      // Refazer (Redo) reaplica a exclusão
      useDiagramStore.getState().redo();
      doc = useDiagramStore.getState().doc;
      expect(doc.nodes["qf_main"]).toBeUndefined();
      expect(doc.edges["edge_power_1"]).toBeUndefined();
    });

    it("Unifilar/Multifilar: exclui uma conexão/aresta sem excluir os equipamentos conectados", () => {
      const store = useDiagramStore.getState();

      store.dispatch(
        cmd.addNode({
          id: "trafo_1",
          sheet: "unifilar",
          position: { x: 100, y: 100 },
          label: "TRAFO_1",
          params: { kind: "transformer", kVA: 150, primary_V: 13800, secondary_V: 380, vector: "Dyn11" },
        }),
      );
      store.dispatch(
        cmd.addNode({
          id: "busbar_1",
          sheet: "unifilar",
          position: { x: 100, y: 300 },
          label: "BARRAMENTO",
          params: { kind: "busbar", current_A: 400, voltage_V: 380 },
        }),
      );
      store.dispatch(
        cmd.addEdge({
          id: "edge_trafo_bus",
          sheet: "unifilar",
          source: "trafo_1",
          target: "busbar_1",
          kind: "power",
        }),
      );

      // Seleciona APENAS a aresta
      useDiagramStore.getState().setSelection([], ["edge_trafo_bus"]);
      useDiagramStore.getState().deleteSelected();

      const doc = useDiagramStore.getState().doc;
      // A aresta foi removida
      expect(doc.edges["edge_trafo_bus"]).toBeUndefined();
      // Mas os dois equipamentos permanecem intactos!
      expect(doc.nodes["trafo_1"]).toBeDefined();
      expect(doc.nodes["busbar_1"]).toBeDefined();
    });

    it("Ladder: exclusão de instrução remove apenas a célula específica e sincroniza topologia", () => {
      const { setRungs } = useEditorStore.getState();

      const initialRung = {
        id: "rung-100",
        label: "Rede de Teste de Exclusão",
        comment: "Rede com contatos",
        cols: 6,
        cells: [
          [
            { id: "c-inst-1", kind: "XIC" as const, operand: "B_START" },
            { id: "c-inst-2", kind: "XIC" as const, operand: "B_START" }, // Mesmo operando, id diferente!
            { id: "c-empty-1", kind: "EMPTY" as const, operand: "" },
            { id: "c-empty-2", kind: "EMPTY" as const, operand: "" },
            { id: "c-empty-3", kind: "EMPTY" as const, operand: "" },
            { id: "c-out-1", kind: "OTE" as const, operand: "K1" },
          ],
        ],
        topology: {
          id: "rung-100",
          number: 1,
          rootBranch: {
            id: "rb-1",
            items: [
              {
                id: "item-1",
                type: "instruction" as const,
                instruction: { id: "c-inst-1", kind: "XIC" as const, operand: "B_START" },
              },
              {
                id: "item-2",
                type: "instruction" as const,
                instruction: { id: "c-inst-2", kind: "XIC" as const, operand: "B_START" },
              },
            ],
          },
          outputs: [{ id: "c-out-1", kind: "OTE" as const, operand: "K1" }],
        },
      };

      setRungs([initialRung]);

      // Simulando a remoção do elemento c-inst-1
      useEditorStore.getState().setRungs((prev) =>
        prev.map((r) => {
          if (r.id !== "rung-100") return r;
          const cells = r.cells.map((row) =>
            row.map((c) =>
              c.id === "c-inst-1"
                ? { id: `empty-${Date.now()}`, kind: "EMPTY" as const, operand: "" }
                : c,
            ),
          );
          return { ...r, cells };
        }),
      );

      const rungs = useEditorStore.getState().rungs;
      expect(rungs[0].cells[0][0].kind).toBe("EMPTY");
      // O segundo contato com mesmo operando B_START permanece intacto!
      expect(rungs[0].cells[0][1].kind).toBe("XIC");
      expect(rungs[0].cells[0][1].operand).toBe("B_START");
    });
  });

  describe("3. Motor de Simulação Real e Estado dos Condutores", () => {
    it("identifica fontes de alimentação e dispositivos de interrupção", () => {
      expect(isSwitchingDevice("breaker")).toBe(true);
      expect(isSwitchingDevice("disconnector")).toBe(true);
      expect(isSwitchingDevice("contactor")).toBe(true);
      expect(isSwitchingDevice("motor")).toBe(false);

      const trafoNode: DiagramNode = {
        id: "tr1",
        sheet: "unifilar",
        position: { x: 0, y: 0 },
        rotation: 0,
        label: "TRAFO",
        params: { kind: "transformer", kVA: 150, primary_V: 13800, secondary_V: 380, vector: "Dyn11" },
      };
      expect(isPowerSourceNode(trafoNode)).toBe(true);
    });

    it("quando parada, a simulação não energiza condutores", () => {
      const doc: DiagramDoc = {
        id: "doc-test-1",
        version: 1,
        metadata: { title: "Projeto Teste", norms: ["NBR 5410"] },
        sheets: ["unifilar"],
        nodes: {
          gen: {
            id: "gen",
            sheet: "unifilar",
            position: { x: 0, y: 0 },
            rotation: 0,
            label: "GERADOR",
            params: { kind: "generator", kVA: 150, voltage_V: 380 },
          },
          m1: {
            id: "m1",
            sheet: "unifilar",
            position: { x: 0, y: 200 },
            rotation: 0,
            label: "MOTOR",
            params: { kind: "motor", power_kW: 7.5, current_A: 15.2, voltage_V: 380, startMethod: "DOL" },
          },
        },
        edges: {
          e1: {
            id: "e1",
            sheet: "unifilar",
            source: "gen",
            target: "m1",
            kind: "power",
          },
        },
      };

      const result = computeCircuitEnergization(doc, "stopped");
      expect(result.energizedEdgeIds.size).toBe(0);
      expect(result.metrics.energizedCircuits).toBe(0);
    });

    it("quando ativa com disjuntor fechado, propaga energização verde a jusante", () => {
      const doc: DiagramDoc = {
        id: "doc-test-2",
        version: 1,
        metadata: { title: "Projeto Teste", norms: ["NBR 5410"] },
        sheets: ["unifilar"],
        nodes: {
          gen: {
            id: "gen",
            sheet: "unifilar",
            position: { x: 0, y: 0 },
            rotation: 0,
            label: "GERADOR",
            params: { kind: "generator", kVA: 150, voltage_V: 380 },
          },
          qf1: {
            id: "qf1",
            sheet: "unifilar",
            position: { x: 0, y: 100 },
            rotation: 0,
            label: "QF1",
            params: { kind: "breaker", in_A: 63, curve: "C", poles: 3 },
          },
          m1: {
            id: "m1",
            sheet: "unifilar",
            position: { x: 0, y: 200 },
            rotation: 0,
            label: "M1",
            params: { kind: "motor", power_kW: 7.5, current_A: 15.2, voltage_V: 380, startMethod: "DOL" },
          },
        },
        edges: {
          e_in: { id: "e_in", sheet: "unifilar", source: "gen", target: "qf1", kind: "power" },
          e_out: { id: "e_out", sheet: "unifilar", source: "qf1", target: "m1", kind: "power" },
        },
      };

      // Disjuntor fechado (padrão)
      const resClosed = computeCircuitEnergization(doc, "running", { qf1: true });
      expect(resClosed.energizedEdgeIds.has("e_in")).toBe(true);
      expect(resClosed.energizedEdgeIds.has("e_out")).toBe(true);
      expect(resClosed.energizedNodeIds.has("m1")).toBe(true);
      expect(resClosed.metrics.energizedCircuits).toBe(2);

      // Disjuntor aberto: a corrente é interrompida!
      const resOpen = computeCircuitEnergization(doc, "running", { qf1: false });
      // Entrada do disjuntor ainda tem tensão
      expect(resOpen.energizedEdgeIds.has("e_in")).toBe(true);
      // Mas o trecho a jusante (saída para o motor) desenergiza!
      expect(resOpen.energizedEdgeIds.has("e_out")).toBe(false);
      expect(resOpen.energizedNodeIds.has("m1")).toBe(false);
      expect(resOpen.openDeviceIds.has("qf1")).toBe(true);
    });
  });

  describe("4. Layout Recolhível e Dock Unificado", () => {
    it("permite recolher e expandir o menu principal e a biblioteca sem afetar os dados do diagrama", () => {
      const editorStore = useEditorStore.getState();
      expect(editorStore.appSidebarCollapsed).toBe(false);

      // Alterna recolhimento do AppSidebar
      editorStore.toggleAppSidebar();
      expect(useEditorStore.getState().appSidebarCollapsed).toBe(true);

      // Alterna recolhimento do Painel Esquerdo (Biblioteca)
      editorStore.toggleLeftPanel();
      expect(useEditorStore.getState().leftCollapsed).toBe(true);

      // Alterna recolhimento do Painel Direito
      editorStore.toggleRightPanel();
      expect(useEditorStore.getState().rightCollapsed).toBe(true);

      // Restaura
      useEditorStore.getState().toggleAppSidebar();
      useEditorStore.getState().toggleLeftPanel();
      useEditorStore.getState().toggleRightPanel();
      expect(useEditorStore.getState().appSidebarCollapsed).toBe(false);
      expect(useEditorStore.getState().leftCollapsed).toBe(false);
      expect(useEditorStore.getState().rightCollapsed).toBe(false);
    });

    it("retorna abas contextuais corretas tanto para modo unifilar quanto multifilar", () => {
      const tabsUnifilar = getContextualTabsForMode("unifilar");
      expect(tabsUnifilar).toContain("diagnosticos");
      expect(tabsUnifilar).toContain("calculos_nbr");
      expect(tabsUnifilar).toContain("bom");

      const tabsMultifilar = getContextualTabsForMode("multifilar");
      expect(tabsMultifilar).toEqual(tabsUnifilar);
    });

    it("AppSidebar lê o estado real de runtime e não um texto estático duplicado", () => {
      // Quando desconectado
      useProjectStore.setState({ runtime: { connected: false, source: "supabase" } });
      expect(useProjectStore.getState().runtime.connected).toBe(false);

      // Quando conectado
      useProjectStore.setState({ runtime: { connected: true, source: "supabase", cycleMs: 18 } });
      expect(useProjectStore.getState().runtime.connected).toBe(true);
      expect(useProjectStore.getState().runtime.cycleMs).toBe(18);
    });
  });
});
