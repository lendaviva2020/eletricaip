// Workspace data — shared types for the industrial workspace

export type WorkspaceMode =
  | "unifilar"
  | "ladder"
  | "fbd"
  | "scada"
  | "twin"
  | "plc"
  | "sim"
  | "alarms";

export type ConsoleTab =
  | "Logs"
  | "Alarmes"
  | "IA"
  | "Terminal"
  | "Eventos"
  | "OPC-UA"
  | "Modbus"
  | "Runtime";

export const MODES: { id: WorkspaceMode; label: string; hint: string }[] = [
  { id: "unifilar", label: "Unifilar", hint: "IEC 60617" },
  { id: "ladder", label: "Ladder", hint: "IEC 61131-3" },
  { id: "fbd", label: "FBD", hint: "IEC 61131-3" },
  { id: "scada", label: "SCADA", hint: "ISA-101" },
  { id: "twin", label: "Digital Twin", hint: "3D" },
  { id: "plc", label: "PLC", hint: "Config" },
  { id: "sim", label: "Simulação", hint: "Runtime" },
  { id: "alarms", label: "Alarmes", hint: "ISA-18.2" },
];

export const CONSOLE_TABS: ConsoleTab[] = [
  "Logs",
  "Alarmes",
  "IA",
  "Terminal",
  "Eventos",
  "OPC-UA",
  "Modbus",
  "Runtime",
];
