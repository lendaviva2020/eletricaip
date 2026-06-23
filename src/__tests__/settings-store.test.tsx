import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the tenant-setting hook so we don't need Supabase / React Query.
// We back it with an in-memory store that mirrors the real persistence shape
// (defaults merged with patch), so we can assert that toggles propagate to
// the writer and that subsequent reads see the new value.
let store: Record<string, any> = {};
let updateCalls: any[] = [];

vi.mock("@/hooks/use-tenant-setting", () => ({
  useTenantSetting<T extends object>(key: string, defaults: T) {
    const current = (store[key] ?? defaults) as T;
    return {
      value: current,
      isLoading: false,
      isSaving: false,
      update: (patch: Partial<T> | ((prev: T) => T)) => {
        const prev = (store[key] ?? defaults) as T;
        const next =
          typeof patch === "function"
            ? (patch as (p: T) => T)(prev)
            : ({ ...prev, ...patch } as T);
        store[key] = next;
        updateCalls.push({ key, next });
        return next;
      },
    };
  },
}));

import { useSettingsStore } from "@/lib/settings-store";

beforeEach(() => {
  store = {};
  updateCalls = [];
});

describe("useSettingsStore (protocols & normas persistence)", () => {
  it("exposes defaults from tenant settings", () => {
    const { result } = renderHook(() => ({
      protocols: useSettingsStore((s) => s.protocols),
      normas: useSettingsStore((s) => s.normas),
    }));
    expect(result.current.protocols["Modbus TCP/RTU"]).toBe(true);
    expect(result.current.protocols["Profinet"]).toBe(false);
    expect(result.current.normas["NBR 5410"]).toBe(true);
  });

  it("toggleProtocol flips the value and persists via tenant settings", () => {
    const { result, rerender } = renderHook(() => ({
      protocols: useSettingsStore((s) => s.protocols),
      toggle: useSettingsStore((s) => s.toggleProtocol),
    }));

    expect(result.current.protocols["Modbus TCP/RTU"]).toBe(true);
    act(() => result.current.toggle("Modbus TCP/RTU"));
    rerender();
    expect(result.current.protocols["Modbus TCP/RTU"]).toBe(false);
    expect(store["protocols_normas"].protocols["Modbus TCP/RTU"]).toBe(false);

    act(() => result.current.toggle("Profinet"));
    rerender();
    expect(result.current.protocols["Profinet"]).toBe(true);
    expect(updateCalls).toHaveLength(2);
  });

  it("toggleNorma flips the value without touching protocols", () => {
    const { result, rerender } = renderHook(() => ({
      normas: useSettingsStore((s) => s.normas),
      protocols: useSettingsStore((s) => s.protocols),
      toggleNorma: useSettingsStore((s) => s.toggleNorma),
    }));

    const protocolsBefore = result.current.protocols;
    act(() => result.current.toggleNorma("NR-10"));
    rerender();

    expect(result.current.normas["NR-10"]).toBe(false);
    expect(result.current.protocols).toEqual(protocolsBefore);
    expect(store["protocols_normas"].normas["NR-10"]).toBe(false);
    expect(store["protocols_normas"].protocols).toEqual(protocolsBefore);
  });

  it("successive toggles round-trip back to the original value", () => {
    const { result, rerender } = renderHook(() => ({
      normas: useSettingsStore((s) => s.normas),
      toggle: useSettingsStore((s) => s.toggleNorma),
    }));
    act(() => result.current.toggle("NBR 5410"));
    rerender();
    act(() => result.current.toggle("NBR 5410"));
    rerender();
    expect(result.current.normas["NBR 5410"]).toBe(true);
  });
});
