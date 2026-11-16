// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EditorPlcSidebar } from "@/components/editor/sidebars/editor-plc-sidebar";
import { EditorFbdSidebar } from "@/components/editor/sidebars/editor-fbd-sidebar";
import { EditorScadaSidebar } from "@/components/editor/sidebars/editor-scada-sidebar";
import { usePlcStore } from "@/lib/plc/store";
import type { PlcProject } from "@/lib/plc/types";
import { useI18nStore } from "@/lib/i18n";

const project: PlcProject = {
  vendor: "siemens",
  cycleTimeMs: 10,
  rack: {
    id: "r1",
    label: "Rack",
    modules: [
      {
        id: "m2",
        catalogKey: "DQ16",
        category: "do",
        label: "Saídas 24V",
        description: "",
        slot: 2,
        channels: 16,
        params: {},
      },
      {
        id: "m1",
        catalogKey: "CPU1214",
        category: "cpu",
        label: "CPU Bomba",
        description: "",
        slot: 1,
        channels: 0,
        params: {},
      },
    ],
  },
  variables: [
    {
      id: "v1",
      name: "BOMBA_RECALQUE_RUN",
      address: "%Q0.3",
      type: "BOOL",
      comment: "",
      retentive: false,
    },
    {
      id: "v2",
      name: "NIVEL_TQ01",
      address: "%IW64",
      type: "INT",
      comment: "Nível do tanque",
      retentive: false,
    },
  ],
  programBlocks: [
    {
      id: "b1",
      name: "Intertravamento",
      type: "FC",
      number: 10,
      language: "ladder",
      code: "",
      comment: "",
    },
    { id: "b0", name: "Main", type: "OB", number: 1, language: "st", code: "", comment: "" },
  ],
};

describe("barra lateral do PLC — dados do projeto aberto", () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: "pt-BR" });
    usePlcStore.setState({ project, activeTab: "dashboard", activeBlockId: null });
  });
  afterEach(() => cleanup());

  it("mostra módulos por slot, variáveis e blocos reais (nada da árvore fictícia)", () => {
    render(<EditorPlcSidebar />);
    const tree = screen.getByTestId("plc-tree");
    expect(within(tree).getByText("Slot 1 · CPU Bomba")).toBeTruthy();
    expect(within(tree).getByText("Slot 2 · Saídas 24V")).toBeTruthy();
    expect(within(tree).getByText("BOMBA_RECALQUE_RUN")).toBeTruthy();
    expect(within(tree).getByText("OB1 · Main")).toBeTruthy();
    expect(within(tree).getByText("FC10 · Intertravamento")).toBeTruthy();
    expect(tree.textContent).not.toMatch(/K1_CMD|SUB_MOTOR|%I0\.0 START/);
  });

  it("clicar em um bloco abre a aba de blocos com ele selecionado", () => {
    render(<EditorPlcSidebar />);
    fireEvent.click(screen.getByText("FC10 · Intertravamento"));
    expect(usePlcStore.getState().activeTab).toBe("blocks");
    expect(usePlcStore.getState().activeBlockId).toBe("b1");
  });

  it("busca filtra sem acento/caixa e mostra 'nenhum resultado'", () => {
    render(<EditorPlcSidebar />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "nível" } });
    expect(screen.getByText("NIVEL_TQ01")).toBeTruthy();
    expect(screen.queryByText("BOMBA_RECALQUE_RUN")).toBeNull();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getAllByText("Nenhum resultado para a busca.").length).toBe(3);
  });

  it("projeto vazio informa que não há nada cadastrado", () => {
    usePlcStore.setState({
      project: {
        ...project,
        rack: { ...project.rack, modules: [] },
        variables: [],
        programBlocks: [],
      },
    });
    render(<EditorPlcSidebar />);
    expect(screen.getAllByText("Nada cadastrado ainda.").length).toBe(3);
  });
});

describe("busca nas paletas FBD e SCADA", () => {
  beforeEach(() => useI18nStore.setState({ locale: "pt-BR" }));
  afterEach(() => cleanup());

  it("FBD: 'ton' encontra o temporizador e esconde blocos sem relação", () => {
    render(<EditorFbdSidebar />);
    const before = screen.getAllByRole("button").length;
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ton" } });
    const after = screen.getAllByRole("button").length;
    expect(after).toBeLessThan(before);
    expect(screen.getByText("TON")).toBeTruthy();
    expect(screen.queryByText("XOR")).toBeNull();
  });

  it("SCADA: filtra widgets pelo nome", () => {
    render(<EditorScadaSidebar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alarm" } });
    expect(screen.getByText("Alarm Banner")).toBeTruthy();
    expect(screen.queryByText("Gauge")).toBeNull();
  });
});
