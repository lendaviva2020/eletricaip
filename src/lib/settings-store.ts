import { useCallback } from "react";
import { useTenantSetting } from "@/hooks/use-tenant-setting";

interface SettingsValue {
  protocols: Record<string, boolean>;
  normas: Record<string, boolean>;
}

const DEFAULTS: SettingsValue = {
  protocols: {
    "Modbus TCP/RTU": true,
    "OPC-UA": true,
    MQTT: true,
    Profinet: false,
    "EtherNet/IP": false,
    BACnet: false,
  },
  normas: {
    "NBR 5410": true,
    "NBR 14039": true,
    "NR-10": true,
    "NR-12": true,
    "IEC 61131": true,
    "IEC 60617": true,
    "ISA-18.2": true,
  },
};

/**
 * Tenant-scoped protocols + normas toggles. Backed by `tenant_settings`
 * under the `protocols_normas` key with a localStorage mirror.
 *
 * Mirrors the previous zustand selector shape so existing call sites keep
 * working: `(s) => s.protocols`, `(s) => s.toggleProtocol`, etc.
 */
export function useSettingsStore<T = unknown>(
  selector: (s: {
    protocols: Record<string, boolean>;
    normas: Record<string, boolean>;
    toggleProtocol: (name: string) => void;
    toggleNorma: (name: string) => void;
  }) => T,
): T {
  const { value, update } = useTenantSetting("protocols_normas", DEFAULTS);

  const toggleProtocol = useCallback(
    (name: string) =>
      update((prev) => ({
        ...prev,
        protocols: { ...prev.protocols, [name]: !prev.protocols[name] },
      })),
    [update],
  );

  const toggleNorma = useCallback(
    (name: string) =>
      update((prev) => ({
        ...prev,
        normas: { ...prev.normas, [name]: !prev.normas[name] },
      })),
    [update],
  );

  return selector({
    protocols: value.protocols,
    normas: value.normas,
    toggleProtocol,
    toggleNorma,
  });
}
