/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EditorUnifilarSidebar,
  COMPONENT_METADATA,
  SymbolThumbnail,
} from "@/components/editor/sidebars/editor-unifilar-sidebar";
import {
  UnifiedBottomDock,
  getContextualTabsForMode,
} from "@/components/editor/unified-bottom-dock";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { createEmptyDoc } from "@/lib/diagram/model";
import { useProjectStore } from "@/lib/project-store";
import { VOLTAI_COMPONENT_DEFINITIONS } from "@/lib/palette/component-catalog";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ELÉTRICAI — Reorganização Profissional do Workspace Industrial", () => {
  beforeEach(() => {
    cleanup();
    // Reset stores
    useEditorStore.setState({
      activeMode: "unifilar",
      consoleTab: "diagnosticos",
      consoleOpen: true,
      rungs: [],
      editorTags: {},
      dragValidation: "Arraste componentes para o canvas.",
    });

    useDiagramStore.setState({
      doc: createEmptyDoc(),
      activeSheet: "unifilar",
      selectedNodeIds: [],
    });

    useProjectStore.setState({
      logs: [],
      runtime: { connected: false, source: "off" },
    });
  });

  describe("1. Remoção da Barra Lateral Redundante e Reorganização da Biblioteca", () => {
    it("elimina a coluna vertical redundante de 40px e renderiza o container limpo da biblioteca", () => {
      const { container } = renderWithClient(<EditorUnifilarSidebar />);

      // Verifica que a barra redundante de 40px (w-10) foi removida
      const redundantBar = container.querySelector(".w-10.shrink-0.flex.flex-col");
      expect(redundantBar).toBeNull();

      // Verifica o container limpo da sidebar com 300px
      const sidebar = screen.getByTestId("editor-unifilar-sidebar");
      expect(sidebar).toBeDefined();
      expect(sidebar.className).toContain("w-[300px]");

      // Cabeçalho da Biblioteca com total de itens
      expect(screen.getByText("Biblioteca Elétrica")).toBeDefined();
      expect(screen.getByText(`${VOLTAI_COMPONENT_DEFINITIONS.length} itens`)).toBeDefined();
    });

    it("renderiza todas as categorias de engenharia elétrica em acordions", () => {
      renderWithClient(<EditorUnifilarSidebar />);

      const alimentacaoHeaders = screen.getAllByText("Alimentação & Fontes");
      expect(alimentacaoHeaders.length).toBeGreaterThan(0);

      const protecaoHeaders = screen.getAllByText("Dispositivos de Proteção");
      expect(protecaoHeaders.length).toBeGreaterThan(0);

      const manobraHeaders = screen.getAllByText("Manobra & Potência");
      expect(manobraHeaders.length).toBeGreaterThan(0);

      const cargasHeaders = screen.getAllByText("Motores & Cargas");
      expect(cargasHeaders.length).toBeGreaterThan(0);

      const automacaoHeaders = screen.getAllByText("Automação & Acionamentos");
      expect(automacaoHeaders.length).toBeGreaterThan(0);

      const instHeaders = screen.getAllByText("Medição & Instrumentação");
      expect(instHeaders.length).toBeGreaterThan(0);

      const geralHeaders = screen.getAllByText("Catálogo Geral IEC 60617");
      expect(geralHeaders.length).toBeGreaterThan(0);
    });

    it("exibe cards técnicos profissionais com símbolo SVG, nome completo, badge e norma", () => {
      renderWithClient(<EditorUnifilarSidebar />);

      // Disjuntor Termomagnético (QF)
      const qfCards = screen.getAllByTestId("library-item-QF");
      expect(qfCards.length).toBeGreaterThan(0);
      expect(qfCards[0].textContent).toContain("Disjuntor Termomagnetico");
      expect(qfCards[0].textContent).toContain("QF");
      expect(qfCards[0].textContent).toContain("IEC 60947-2");

      // Contator de Potência (KM)
      const kmCards = screen.getAllByTestId("library-item-KM");
      expect(kmCards.length).toBeGreaterThan(0);
      expect(kmCards[0].textContent).toContain("Contator");
      expect(kmCards[0].textContent).toContain("KM");
      expect(kmCards[0].textContent).toContain("IEC 60947-4-1");

      // Disjuntor Diferencial Residual (DR)
      const drCards = screen.getAllByTestId("library-item-DR");
      expect(drCards.length).toBeGreaterThan(0);
      expect(drCards[0].textContent).toContain("Dispositivo Diferencial Residual");
      expect(drCards[0].textContent).toContain("DR");
      expect(drCards[0].textContent).toContain("NBR NM 61008");
    });

    it("filtra componentes instantaneamente por busca textual (nome, tipo, badge ou norma)", () => {
      renderWithClient(<EditorUnifilarSidebar />);

      const searchInput = screen.getByPlaceholderText(
        "Disjuntor, motor, QF, KM, NBR...",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "transformador" } });

      // O Transformador deve permanecer visível
      const trCards = screen.getAllByTestId("library-item-TR");
      expect(trCards.length).toBeGreaterThan(0);

      // Botão de limpar busca restaura catálogo
      const clearBtn = screen.getByTitle("Limpar busca");
      fireEvent.click(clearBtn);
      expect(searchInput.value).toBe("");
    });

    it("preserva drag-and-drop atribuindo o tipo de componente elétrico ao dataTransfer", () => {
      renderWithClient(<EditorUnifilarSidebar />);

      const qfCard = screen.getAllByTestId("library-item-QF")[0];
      const setDataMock = vi.fn();

      fireEvent.dragStart(qfCard, {
        dataTransfer: {
          setData: setDataMock,
          effectAllowed: "none",
        },
      });

      expect(setDataMock).toHaveBeenCalledWith("application/voltai-component", "QF");
    });

    it("possui símbolos SVG técnicos específicos para todos os tipos principais (IEC 60617)", () => {
      const types = [
        "QF",
        "QS",
        "DR",
        "FU",
        "SPD",
        "KM",
        "KA",
        "FR",
        "M",
        "SS",
        "VFD",
        "TR",
        "PS",
        "PLC",
        "BC",
        "G",
        "UPS",
        "TC",
        "TP",
        "B",
        "SR",
      ];

      types.forEach((type) => {
        const { container } = renderWithClient(<SymbolThumbnail type={type} />);
        const svg = container.querySelector("svg");
        expect(svg).toBeDefined();
        expect(svg?.getAttribute("viewBox")).toBe("0 0 32 32");
      });
    });
  });

  describe("2. UnifiedBottomDock — Painel Inferior Único e Contextual", () => {
    it("fornece abas contextuais distintas dependendo do modo de canvas ativo", () => {
      expect(getContextualTabsForMode("unifilar")).toEqual([
        "diagnosticos",
        "calculos_nbr",
        "bom",
        "Logs",
        "Eventos",
      ]);

      expect(getContextualTabsForMode("ladder")).toEqual([
        "diagnosticos",
        "variaveis",
        "Logs",
        "Alarmes",
        "Terminal",
        "OPC-UA",
        "Modbus",
      ]);

      expect(getContextualTabsForMode("fbd")).toEqual([
        "diagnosticos",
        "simulacao",
        "Logs",
        "Alarmes",
      ]);

      expect(getContextualTabsForMode("scada")).toEqual([
        "Alarmes",
        "Eventos",
        "Logs",
        "OPC-UA",
        "Modbus",
      ]);
    });

    it("renderiza a barra unificada e alterna entre recolhido (h-9) e expandido (h-56)", () => {
      useEditorStore.setState({ consoleOpen: true });
      const { rerender } = renderWithClient(<UnifiedBottomDock />);

      const dock = screen.getByTestId("unified-bottom-dock");
      expect(dock.className).toContain("h-56");

      // Clicar no botão de toggle recolhe o dock
      const toggleBtn = screen.getByTestId("dock-toggle-button");
      fireEvent.click(toggleBtn);

      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <UnifiedBottomDock />
        </QueryClientProvider>,
      );
      expect(dock.className).toContain("h-9");
    });

    it("no modo Unifilar, exibe abas de diagnósticos, cálculos e BOM", () => {
      const setSelectionMock = vi.fn();
      useDiagramStore.setState({
        doc: {
          version: 1,
          id: "doc-test-1",
          metadata: { title: "Projeto Teste", author: "Engenharia", norms: ["NBR 5410"] },
          sheets: ["unifilar"],
          nodes: {
            node1: {
              id: "node1",
              sheet: "unifilar",
              position: { x: 100, y: 100 },
              rotation: 0,
              label: "QF1",
              params: { kind: "breaker", poles: 3, curve: "C", in_A: 32 },
            },
          },
          edges: {},
        } as any,
        setSelection: setSelectionMock,
      });

      renderWithClient(<UnifiedBottomDock />);

      // As abas unificadas contextuais existem
      expect(screen.getByTestId("dock-tab-diagnosticos")).toBeDefined();
      expect(screen.getByTestId("dock-tab-calculos_nbr")).toBeDefined();
      expect(screen.getByTestId("dock-tab-bom")).toBeDefined();
    });

    it("no modo Unifilar, exibe a tabela da Lista de Materiais (BOM) consolidada", () => {
      useDiagramStore.setState({
        doc: {
          version: 1,
          id: "doc-test-2",
          metadata: { title: "Quadro Geral", author: "Eng", norms: ["NBR 5410"] },
          sheets: ["unifilar"],
          nodes: {
            qf1: {
              id: "qf1",
              sheet: "unifilar",
              position: { x: 50, y: 50 },
              rotation: 0,
              label: "QF1",
              params: { kind: "breaker", poles: 3, curve: "C", in_A: 32, manufacturer: "Schneider", model: "iC60N", tag: "QF1" },
            },
            qf2: {
              id: "qf2",
              sheet: "unifilar",
              position: { x: 150, y: 50 },
              rotation: 0,
              label: "QF2",
              params: { kind: "breaker", poles: 3, curve: "C", in_A: 32, manufacturer: "Schneider", model: "iC60N", tag: "QF2" },
            },
          },
          edges: {},
        } as any,
      });

      useEditorStore.setState({ consoleTab: "bom" });
      renderWithClient(<UnifiedBottomDock />);

      expect(screen.getByText("QF1, QF2")).toBeDefined();
      expect(screen.getByText("Schneider")).toBeDefined();
      expect(screen.getByText("iC60N")).toBeDefined();
      // Quantidade consolidada = 2
      expect(screen.getByText("2")).toBeDefined();
    });

    it("no modo Ladder, exibe diagnósticos reais da validação de redes IEC 61131-3", () => {
      useEditorStore.setState({
        activeMode: "ladder",
        consoleTab: "diagnosticos",
        rungs: [
          {
            id: "rung_01",
            label: "Rede 1",
            comment: "Rede sem saída",
            cells: [[{ kind: "XIC", operand: "BOTAO_LIGA" }]],
            topology: {
              id: "topo1",
              rootBranch: { id: "b1", items: [{ id: "item1", type: "instruction", instruction: { id: "c1", kind: "XIC", operand: "BOTAO_LIGA" } }] },
              outputs: [],
            },
          },
        ],
      });

      renderWithClient(<UnifiedBottomDock />);

      // Deve alertar sobre a falta de saída
      expect(screen.getByText("NO_OUTPUT")).toBeDefined();
    });

    it("no modo Ladder, exibe a tabela de variáveis e permite alternar forçamento de tags", () => {
      useEditorStore.setState({
        activeMode: "ladder",
        consoleTab: "variaveis",
        editorTags: {
          tag_1: {
            id: "tag_1",
            name: "MOTOR_LIGADO",
            type: "BOOL",
            value: true,
            forced: false,
          },
        },
      });

      renderWithClient(<UnifiedBottomDock />);

      expect(screen.getByText("MOTOR_LIGADO")).toBeDefined();
      expect(screen.getByText("true")).toBeDefined();
      expect(screen.getByText("Normal")).toBeDefined();

      const forceBtn = screen.getByText("Forçar Valor");
      fireEvent.click(forceBtn);

      const updatedTag = useEditorStore.getState().editorTags["tag_1"];
      expect(updatedTag?.forced).toBe(true);
    });

    it("não exibe contadores falsos/mockados (como números fixos 69 ou 7)", () => {
      useEditorStore.setState({
        activeMode: "scada",
        consoleTab: "Alarmes",
      });

      useProjectStore.setState({ logs: [] });
      renderWithClient(<UnifiedBottomDock />);

      // Com zero alarmes, não deve haver badge vermelho com contagens falsas
      const alarmsTab = screen.getByTestId("dock-tab-Alarmes");
      expect(alarmsTab.textContent).not.toContain("69");
      expect(alarmsTab.textContent).not.toContain("7");
    });
  });
});
