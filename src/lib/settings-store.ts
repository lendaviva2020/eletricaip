import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  protocols: Record<string, boolean>;
  normas: Record<string, boolean>;
  toggleProtocol: (name: string) => void;
  toggleNorma: (name: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
      toggleProtocol: (name) =>
        set((state) => ({
          protocols: { ...state.protocols, [name]: !state.protocols[name] },
        })),
      toggleNorma: (name) =>
        set((state) => ({
          normas: { ...state.normas, [name]: !state.normas[name] },
        })),
    }),
    { name: "eletricai-settings" },
  ),
);
