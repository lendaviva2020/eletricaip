export type WorkspaceMode =
  | "unifilar"
  | "ladder"
  | "fbd"
  | "scada"
  | "twin"
  | "plc"
  | "sim"
  | "alarms";

export const MODES: { id: WorkspaceMode; label: string; hint: string }[] = [
  { id: "unifilar", label: "Unifilar", hint: "IEC 60617" },
  { id: "ladder", label: "Ladder", hint: "IEC 61131-3" },
  { id: "fbd", label: "FBD", hint: "Function Block" },
  { id: "scada", label: "SCADA", hint: "HMI Runtime" },
  { id: "twin", label: "Digital Twin", hint: "2D / 3D" },
  { id: "plc", label: "PLC", hint: "Runtime" },
  { id: "sim", label: "Simulação", hint: "Real-time" },
  { id: "alarms", label: "Alarmes", hint: "ISA-18.2" },
];

export const CONSOLE_TABS = [
  "Logs",
  "Alarmes",
  "IA",
  "Terminal",
  "Eventos",
  "OPC-UA",
  "Modbus",
  "Runtime",
] as const;

export type ConsoleTab = (typeof CONSOLE_TABS)[number];
