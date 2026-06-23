// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { Switch } from "@/components/ui/switch";

// In-memory backing store shared across renders (simulates Supabase persistence).
let store: Record<string, any> = {};

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

    expect(sw).toHaveAttribute("data-state", "checked");
    expect(sw).toHaveAttribute("aria-checked", "true");

    act(() => sw.click());

    // sem qualquer await/timer — deve refletir já no próximo paint síncrono
    expect(sw).toHaveAttribute("data-state", "unchecked");
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("Norma: alterna o estado visual instantaneamente", () => {
    render(<NormaRow name="NR-10" />);
    const sw = screen.getByRole("switch", { name: "NR-10" });

    expect(sw).toHaveAttribute("data-state", "checked");
    act(() => sw.click());
    expect(sw).toHaveAttribute("data-state", "unchecked");
    act(() => sw.click());
    expect(sw).toHaveAttribute("data-state", "checked");
  });

  it("permanece consistente após re-render (mesma instância)", () => {
    const { rerender } = render(<ProtocolRow name="Profinet" />);
    const sw = screen.getByRole("switch", { name: "Profinet" });

    expect(sw).toHaveAttribute("data-state", "unchecked"); // default = false
    act(() => sw.click());
    expect(sw).toHaveAttribute("data-state", "checked");

    rerender(<ProtocolRow name="Profinet" />);
    const swAfter = screen.getByRole("switch", { name: "Profinet" });
    expect(swAfter).toHaveAttribute("data-state", "checked");
  });

  it("permanece consistente após refresh (unmount + remount lê do store)", () => {
    const { unmount } = render(<NormaRow name="IEC 61131" />);
    const sw = screen.getByRole("switch", { name: "IEC 61131" });
    expect(sw).toHaveAttribute("data-state", "checked");

    act(() => sw.click());
    expect(sw).toHaveAttribute("data-state", "unchecked");
    expect(store["protocols_normas"].normas["IEC 61131"]).toBe(false);

    unmount();
    // simula refresh — nova montagem da página deve ler o estado persistido
    render(<NormaRow name="IEC 61131" />);
    const swReloaded = screen.getByRole("switch", { name: "IEC 61131" });
    expect(swReloaded).toHaveAttribute("data-state", "unchecked");
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

    expect(mqtt).toHaveAttribute("data-state", "checked");
    expect(opc).toHaveAttribute("data-state", "checked");
    expect(norma).toHaveAttribute("data-state", "checked");

    act(() => mqtt.click());

    expect(mqtt).toHaveAttribute("data-state", "unchecked");
    expect(opc).toHaveAttribute("data-state", "checked");
    expect(norma).toHaveAttribute("data-state", "checked");
  });
});
