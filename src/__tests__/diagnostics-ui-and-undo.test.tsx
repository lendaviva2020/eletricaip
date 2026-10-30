/** @vitest-environment jsdom */
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AiFixDialog } from "@/components/editor/ai-fix-dialog";
import type { FixProposal } from "@/lib/diagnostics/contract";
import { cmd } from "@/lib/diagram/commands";
import { useDiagramStore } from "@/lib/diagram/store";
import type { DiagramDoc } from "@/lib/diagram/schema";

const mockProposal: FixProposal = {
  id: "fix:NBR5410:w1:10mm2",
  resolvesDiagnosticIds: ["NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:w1"],
  operations: [{ op: "set-conductor-section", conductorId: "w1", sectionMm2: 10 }],
  metrics: [
    {
      elementId: "w1",
      metric: "voltage_drop_pct",
      before: 5.2,
      after: 2.1,
      unit: "%",
      limit: 4.0,
      marginRatioBefore: 1.3,
      marginRatioAfter: 0.525,
    },
  ],
  sideEffects: [
    "Verificar taxa de ocupação dos eletrodutos (NBR 5410 §6.2.11).",
    "Verificar compatibilidade dos bornes de conexão.",
  ],
  verifiedChecks: [
    "queda_de_tensao (NBR 5410 §6.2.7)",
    "capacidade_conducao_corrente_iz (NBR 5410 §6.2.5)",
  ],
  unavailableChecks: [
    "suportabilidade_curto_circuito (NBR 5410 §5.3.5 / I²t <= k²S²)",
  ],
  rationalePt: "Aumento da bitola de 4 mm² para 10 mm² para reduzir queda de tensão de 5.2% para 2.1%.",
  isApplicable: true,
};

describe("Interface de Correção com IA, Diálogo de Homologação e Undo (Fase 8)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza o diálogo com diff antes/depois, efeitos colaterais e matriz de verificações", () => {
    const onApprove = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <AiFixDialog
        open={true}
        onOpenChange={onOpenChange}
        proposal={mockProposal}
        rationalePt={mockProposal.rationalePt}
        onApprove={onApprove}
      />,
    );

    // Título e identificação normativa
    expect(screen.getByText(/Diagnósticos Corretivos — ABNT NBR 5410/i)).toBeDefined();

    // Tabela de Diff
    expect(screen.getByText("w1")).toBeDefined();
    expect(screen.getByText("10 mm²")).toBeDefined();
    expect(screen.getByText("5.2%")).toBeDefined();
    expect(screen.getByText("2.1%")).toBeDefined();

    // Verificações executadas vs indisponíveis
    expect(screen.getByText(/queda_de_tensao/i)).toBeDefined();
    expect(screen.getByText(/suportabilidade_curto_circuito/i)).toBeDefined();

    // Efeitos colaterais
    expect(screen.getByText(/taxa de ocupação dos eletrodutos/i)).toBeDefined();

    // Justificativa em português
    expect(
      screen.getByText(/Aumento da bitola de 4 mm² para 10 mm²/i),
    ).toBeDefined();

    // Botão de aprovação explícita
    expect(screen.getByTestId("ai-fix-approve-button")).toBeDefined();
  });

  it("não executa nenhuma ação no modelo antes da aprovação explícita do usuário", () => {
    const onApprove = vi.fn();
    render(
      <AiFixDialog
        open={true}
        onOpenChange={vi.fn()}
        proposal={mockProposal}
        onApprove={onApprove}
      />,
    );

    // Sem clique, onApprove não é chamado
    expect(onApprove).not.toHaveBeenCalled();

    // Clica em Aprovar e aplicar
    const approveBtn = screen.getByTestId("ai-fix-approve-button");
    fireEvent.click(approveBtn);

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(mockProposal);
  });

  it("aplica comando Batch atômico no diagramStore e permite desfazer em 1 clique (Undo)", () => {
    // Configura o doc inicial no store com cabo de 4 mm²
    const initialDoc: DiagramDoc = {
      id: "doc-undo-test",
      version: 1,
      sheets: ["unifilar"],
      metadata: { title: "Teste", norms: ["NBR 5410"] },
      nodes: {
        bus1: {
          id: "bus1",
          sheet: "unifilar",
          label: "Barramento",
          position: { x: 0, y: 0 },
          rotation: 0,
          params: { kind: "busbar", voltage_V: 380, current_A: 100 },
        },
      },
      edges: {
        w1: {
          id: "w1",
          sheet: "unifilar",
          source: "bus1",
          target: "motor1",
          kind: "power",
          cable: { section_mm2: 4, length_m: 50, insulation: "PVC" },
        },
      },
    };

    useDiagramStore.setState({
      doc: initialDoc,
      history: { past: [], future: [] },
    });

    const store = useDiagramStore.getState();
    expect(store.doc.edges.w1.cable?.section_mm2).toBe(4);

    // Aplica o patch corretivo como uma única transação atômica (Batch)
    const updateCmd = cmd.updateEdgeCable("w1", store.doc.edges.w1.cable, {
      ...(store.doc.edges.w1.cable ?? { insulation: "PVC" }),
      section_mm2: 10,
    });
    const batchCmd = cmd.batch([updateCmd]);

    store.dispatch(batchCmd);

    // Estado após aplicação
    expect(useDiagramStore.getState().doc.edges.w1.cable?.section_mm2).toBe(10);

    // Desfazer em 1 clique (Undo)
    useDiagramStore.getState().undo();

    // O condutor retornou imediatamente à bitola de 4 mm² original
    expect(useDiagramStore.getState().doc.edges.w1.cable?.section_mm2).toBe(4);
  });
});
