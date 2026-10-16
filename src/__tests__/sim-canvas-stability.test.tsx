// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SimCanvas } from "@/components/canvases/sim-canvas";
import { PlantSimPanel } from "@/components/plant-sim-panel";
import { usePlantStore } from "@/lib/simulation/plant-store";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { useNotificationStore } from "@/lib/notification-store";

// Mock ResponsiveContainer to avoid ResizeObserver / layout issues in jsdom
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-responsive-container" style={{ width: 400, height: 200 }}>
        {children}
      </div>
    ),
  };
});

vi.mock("@tanstack/react-start", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-start")>("@tanstack/react-start");
  return {
    ...actual,
    useServerFn: (fn: unknown) => fn,
  };
});

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SimCanvas & PlantSimPanel — estabilidade contra React #185", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlantStore.getState().resetAll();
    useProjectStore.setState({
      projectId: null,
      tags: {},
      runtime: { connected: true, source: "local" },
    });
    useEditorStore.setState({ editorTags: {} });
    useNotificationStore.setState({ notifications: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("monta SimCanvas e PlantSimPanel sem loop infinito de renderização (React #185)", () => {
    expect(() => {
      renderWithQuery(<SimCanvas />);
    }).not.toThrow();

    expect(screen.getByText(/Planta simulada — 8 motores \+ 2 exaustores/i)).toBeTruthy();
    expect(screen.getByText(/Pausar Plot/i)).toBeTruthy();
  });

  it("permanece estável após múltiplas atualizações de estado na usePlantStore", () => {
    render(<PlantSimPanel />);

    expect(() => {
      act(() => {
        usePlantStore.getState().setPlantTemp(30);
        usePlantStore.getState().setSmoke(true);
        usePlantStore.getState().setMotorCmd("M01", false);
        usePlantStore.getState().setFaultInject("M02", "overload");
      });
    }).not.toThrow();

    expect(screen.getByText("30.0 °C")).toBeTruthy();
  });

  it("inicia, avança ticks, parte motores, aciona E-STOP e pausa a simulação da planta", () => {
    render(<PlantSimPanel />);

    const rodarBtn = screen.getByRole("button", { name: /^Rodar$/i });
    act(() => {
      fireEvent.click(rodarBtn);
    });
    expect(usePlantStore.getState().ticking).toBe(true);
    expect(screen.getByRole("button", { name: /^Pausar$/i })).toBeTruthy();

    const ligarBtn = screen.getByRole("button", { name: /Ligar sistema/i });
    act(() => {
      fireEvent.click(ligarBtn);
    });
    expect(usePlantStore.getState().plant.systemOn).toBe(true);

    // Avança 500ms (5 ticks de 100ms)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(usePlantStore.getState().plant.t_s).toBeGreaterThan(0.4);
    expect(usePlantStore.getState().plant.motors["M01"].running).toBe(true);

    // Aciona E-STOP
    const estopBtn = screen.getByRole("button", { name: /^E-Stop$/i });
    act(() => {
      fireEvent.click(estopBtn);
    });
    expect(usePlantStore.getState().plant.estopLatched).toBe(true);
    expect(usePlantStore.getState().plant.systemOn).toBe(false);
    expect(screen.getByText(/E-STOP ATUADO/i)).toBeTruthy();

    // Pausa simulação
    const pausarBtn = screen.getByRole("button", { name: /^Pausar$/i });
    act(() => {
      fireEvent.click(pausarBtn);
    });
    expect(usePlantStore.getState().ticking).toBe(false);
  });

  it("alimenta os gráficos do SimCanvas com amostras periódicas e permite pausar/iniciar plot", () => {
    renderWithQuery(<SimCanvas />);

    expect(screen.getByText("0 pts")).toBeTruthy();

    // Avança 450ms (3 ciclos de 150ms do osciloscópio)
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("3 pts")).toBeTruthy();

    // Pausa o plot
    const pausePlotBtn = screen.getByRole("button", { name: /Pausar Plot/i });
    act(() => {
      fireEvent.click(pausePlotBtn);
    });
    expect(screen.getByRole("button", { name: /Iniciar Plot/i })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(450);
    });
    // Contagem de amostras não deve aumentar enquanto pausado
    expect(screen.getByText("3 pts")).toBeTruthy();

    // Retoma o plot
    const startPlotBtn = screen.getByRole("button", { name: /Iniciar Plot/i });
    act(() => {
      fireEvent.click(startPlotBtn);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("5 pts")).toBeTruthy();
  });

  it("dispara, exibe e reconhece alarmes no SimCanvas sem causar loop de renderização", () => {
    renderWithQuery(<SimCanvas />);

    // Ativa condição de alarme via tag no editorStore (TEMP_M01 > 90) e ESTOP na planta
    act(() => {
      useEditorStore.getState().upsertTag({
        id: "t1",
        name: "TEMP_M01",
        type: "REAL",
        value: 98,
        forced: false,
      });
      usePlantStore.getState().pulseEstop();
    });

    // Avança 1 tick do SimCanvas (150ms) para avaliar regras de alarme
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Abre painel de alarmes
    const alarmsBtn = screen.getByRole("button", { name: /Alarmes/i });
    act(() => {
      fireEvent.click(alarmsBtn);
    });

    expect(screen.getByText(/Temperatura do motor M-01 acima do limite/i)).toBeTruthy();

    // Reconhece todos os alarmes
    const ackAllBtn = screen.getByRole("button", { name: /Acknowledger Todos/i });
    act(() => {
      fireEvent.click(ackAllBtn);
    });

    expect(screen.getByText("✓ Ack")).toBeTruthy();
  });
});
