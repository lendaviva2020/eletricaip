// @vitest-environment jsdom
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

import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import { useTwinTelemetryPersistence } from "@/hooks/use-twin-telemetry-persistence";

describe("useTwinTelemetryPersistence (#TWIN-02)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flushMock.mockClear();
    useDigitalTwinStore.setState({ telemetryBuffers: {}, lastRealtimeUpdate: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes pending samples in batches of up to 200 every 5s", async () => {
    const { result } = renderHook(() => useTwinTelemetryPersistence({ intervalMs: 5000 }));
    void result;

    act(() => {
      const push = useDigitalTwinStore.getState().pushTelemetry;
      for (let i = 0; i < 250; i++) push(`TAG_${i % 5}`, i);
    });

    // eslint-disable-next-line no-console
    console.log("buffers:", Object.keys(useDigitalTwinStore.getState().telemetryBuffers).length);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    expect(flushMock).toHaveBeenCalledTimes(1);
    const call = flushMock.mock.calls[0]?.[0] as { data: { samples: unknown[]; projectId: string } };
    expect(call.data.projectId).toBe("00000000-0000-0000-0000-000000000001");
    expect(call.data.samples.length).toBeLessThanOrEqual(200);
    expect(call.data.samples.length).toBeGreaterThan(0);
  });
    expect(call.data.projectId).toBe("00000000-0000-0000-0000-000000000001");
    expect(call.data.samples.length).toBeLessThanOrEqual(200);
    expect(call.data.samples.length).toBeGreaterThan(0);
  });

  it("does not flush when there is no pending data", async () => {
    renderHook(() => useTwinTelemetryPersistence({ intervalMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(flushMock).not.toHaveBeenCalled();
  });
});
