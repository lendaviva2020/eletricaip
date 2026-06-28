// @vitest-environment jsdom
// #TWIN-04 — Motor "E-se?" do Digital Twin
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const flushMock = vi.fn(async () => ({ inserted: 0 }));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => flushMock,
}));

vi.mock("@/lib/digital-twin.functions", () => ({
  flushTwinTelemetry: vi.fn(),
}));

vi.mock("@/lib/current-project", () => ({
  useCurrentProject: {
    getState: () => ({ project: { id: "00000000-0000-0000-0000-000000000001", name: "P" } }),
  },
}));

import { useDigitalTwinStore, getEffectiveTagValue } from "@/lib/digital-twin-store";
import { useTwinTelemetryPersistence } from "@/hooks/use-twin-telemetry-persistence";

function resetStore() {
  useDigitalTwinStore.setState({
    telemetryBuffers: {},
    lastRealtimeUpdate: null,
    whatIfEnabled: false,
    whatIfOverrides: {},
    whatIfScenarios: [],
  });
}

describe("What-If overrides (#TWIN-04)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("getEffectiveTagValue uses override when enabled, real value otherwise", () => {
    const { pushTelemetry, setWhatIfOverride, resetWhatIf } = useDigitalTwinStore.getState();
    pushTelemetry("MOTOR_T", 42);
    expect(getEffectiveTagValue("MOTOR_T")).toBe(42);

    setWhatIfOverride("MOTOR_T", 99);
    expect(useDigitalTwinStore.getState().whatIfEnabled).toBe(true);
    expect(getEffectiveTagValue("MOTOR_T")).toBe(99);

    resetWhatIf();
    expect(useDigitalTwinStore.getState().whatIfEnabled).toBe(false);
    expect(useDigitalTwinStore.getState().whatIfOverrides).toEqual({});
    expect(getEffectiveTagValue("MOTOR_T")).toBe(42);
  });

  it("clearWhatIfOverride removes only the specified tag", () => {
    const { setWhatIfOverride, clearWhatIfOverride } = useDigitalTwinStore.getState();
    setWhatIfOverride("A", 1);
    setWhatIfOverride("B", 2);
    clearWhatIfOverride("A");
    expect(useDigitalTwinStore.getState().whatIfOverrides).toEqual({ B: 2 });
  });

  it("scenarios round-trip via store (persisted to localStorage by zustand persist)", () => {
    const { setWhatIfOverride, saveWhatIfScenario, resetWhatIf, loadWhatIfScenario } =
      useDigitalTwinStore.getState();

    setWhatIfOverride("T1", 10);
    setWhatIfOverride("T2", 20);
    saveWhatIfScenario("baseline");

    const scenarios = useDigitalTwinStore.getState().whatIfScenarios;
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].name).toBe("baseline");
    expect(scenarios[0].overrides).toEqual({ T1: 10, T2: 20 });

    resetWhatIf();
    expect(useDigitalTwinStore.getState().whatIfOverrides).toEqual({});

    loadWhatIfScenario(scenarios[0].id);
    const s = useDigitalTwinStore.getState();
    expect(s.whatIfEnabled).toBe(true);
    expect(s.whatIfOverrides).toEqual({ T1: 10, T2: 20 });
  });
});

describe("Telemetry persistence is gated by What-If (#TWIN-04)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flushMock.mockClear();
    resetStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flush samples while whatIfEnabled is true", async () => {
    renderHook(() => useTwinTelemetryPersistence({ intervalMs: 1000 }));

    act(() => {
      useDigitalTwinStore.getState().setWhatIfEnabled(true);
      const push = useDigitalTwinStore.getState().pushTelemetry;
      for (let i = 0; i < 10; i++) push("TAG_X", i);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(flushMock).not.toHaveBeenCalled();
  });

  it("resumes flushing after disabling What-If", async () => {
    renderHook(() => useTwinTelemetryPersistence({ intervalMs: 1000 }));

    act(() => {
      useDigitalTwinStore.getState().setWhatIfEnabled(true);
      const push = useDigitalTwinStore.getState().pushTelemetry;
      for (let i = 0; i < 5; i++) push("TAG_Y", i);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(flushMock).not.toHaveBeenCalled();

    act(() => {
      useDigitalTwinStore.getState().setWhatIfEnabled(false);
      const push = useDigitalTwinStore.getState().pushTelemetry;
      for (let i = 0; i < 3; i++) push("TAG_Y", 100 + i);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(flushMock).toHaveBeenCalled();
  });
});
