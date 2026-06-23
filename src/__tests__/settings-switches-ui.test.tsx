// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";

// In-memory backing store + pub/sub so the mocked hook re-renders on update.
let store: Record<string, any> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

vi.mock("@/hooks/use-tenant-setting", () => ({
  useTenantSetting<T extends object>(key: string, defaults: T) {
    const value = useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => (store[key] ?? defaults) as T,
      () => (store[key] ?? defaults) as T,
    );
    return {
      value,
      isLoading: false,
      isSaving: false,
      update: (patch: Partial<T> | ((prev: T) => T)) => {
        const prev = (store[key] ?? defaults) as T;
        const next =
          typeof patch === "function"
            ? (patch as (p: T) => T)(prev)
            : ({ ...prev, ...patch } as T);
        store[key] = next;
        notify();
        return next;
      },
    };
  },
}));


import { useSettingsStore } from "@/lib/settings-store";

function ProtocolRow({ name }: { name: string }) {
  const on = useSettingsStore((s) => s.protocols[name]);
  const toggle = useSettingsStore((s) => s.toggleProtocol);
  return (
    <Switch
      aria-label={name}
      checked={!!on}
      onCheckedChange={() => toggle(name)}
    />
  );
}

function NormaRow({ name }: { name: string }) {
  const on = useSettingsStore((s) => s.normas[name]);
  const toggle = useSettingsStore((s) => s.toggleNorma);
  return (
    <Switch
      aria-label={name}
      checked={!!on}
      onCheckedChange={() => toggle(name)}
    />
  );
}

beforeEach(() => {
  store = {};
  cleanup();
});

describe("Settings switches — visual state", () => {
  it("Protocolo: alterna o estado visual instantaneamente (mesmo tick)", () => {
    render(<ProtocolRow name="Modbus TCP/RTU" />);
    const sw = screen.getByRole("switch", { name: "Modbus TCP/RTU" });

    expect(sw.getAttribute("data-state")).toBe("checked");
    expect(sw.getAttribute("aria-checked")).toBe("true");

    act(() => sw.click());

    // sem qualquer await/timer — deve refletir já no próximo paint síncrono
    expect(sw.getAttribute("data-state")).toBe("unchecked");
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("Norma: alterna o estado visual instantaneamente", () => {
    render(<NormaRow name="NR-10" />);
    const sw = screen.getByRole("switch", { name: "NR-10" });

    expect(sw.getAttribute("data-state")).toBe("checked");
    act(() => sw.click());
    expect(sw.getAttribute("data-state")).toBe("unchecked");
    act(() => sw.click());
    expect(sw.getAttribute("data-state")).toBe("checked");
  });

  it("permanece consistente após re-render (mesma instância)", () => {
    const { rerender } = render(<ProtocolRow name="Profinet" />);
    const sw = screen.getByRole("switch", { name: "Profinet" });

    expect(sw.getAttribute("data-state")).toBe("unchecked"); // default = false
    act(() => sw.click());
    expect(sw.getAttribute("data-state")).toBe("checked");

    rerender(<ProtocolRow name="Profinet" />);
    const swAfter = screen.getByRole("switch", { name: "Profinet" });
    expect(swAfter.getAttribute("data-state")).toBe("checked");
  });

  it("permanece consistente após refresh (unmount + remount lê do store)", () => {
    const { unmount } = render(<NormaRow name="IEC 61131" />);
    const sw = screen.getByRole("switch", { name: "IEC 61131" });
    expect(sw.getAttribute("data-state")).toBe("checked");

    act(() => sw.click());
    expect(sw.getAttribute("data-state")).toBe("unchecked");
    expect(store["protocols_normas"].normas["IEC 61131"]).toBe(false);

    unmount();
    // simula refresh — nova montagem da página deve ler o estado persistido
    render(<NormaRow name="IEC 61131" />);
    const swReloaded = screen.getByRole("switch", { name: "IEC 61131" });
    expect(swReloaded.getAttribute("data-state")).toBe("unchecked");
  });

  it("toggles independentes não interferem visualmente entre si", () => {
    render(
      <>
        <ProtocolRow name="MQTT" />
        <ProtocolRow name="OPC-UA" />
        <NormaRow name="NBR 5410" />
      </>,
    );
    const mqtt = screen.getByRole("switch", { name: "MQTT" });
    const opc = screen.getByRole("switch", { name: "OPC-UA" });
    const norma = screen.getByRole("switch", { name: "NBR 5410" });

    expect(mqtt.getAttribute("data-state")).toBe("checked");
    expect(opc.getAttribute("data-state")).toBe("checked");
    expect(norma.getAttribute("data-state")).toBe("checked");

    act(() => mqtt.click());

    expect(mqtt.getAttribute("data-state")).toBe("unchecked");
    expect(opc.getAttribute("data-state")).toBe("checked");
    expect(norma.getAttribute("data-state")).toBe("checked");
  });
});
