// Tipos e constantes para a planta padrão 8M+2EX
export const PLANT_MOTOR_IDS = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"] as const;

export const PLANT_EXHAUST_IDS = ["EX01", "EX02"] as const;

export const PLANT_TAG_PREFIX = "PLANT";

export type PlantMotorId = (typeof PLANT_MOTOR_IDS)[number];
export type PlantExhaustId = (typeof PLANT_EXHAUST_IDS)[number];

// Tags padrão da planta para integração SCADA/Ladder/Unifilar
export function getPlantTagNames() {
  const tags: string[] = [];

  // Sistema
  tags.push("PLANT_SYSTEM_ON");
  tags.push("PLANT_ESTOP");
  tags.push("PLANT_BUS_V");
  tags.push("PLANT_BUS_ENERGIZED");
  tags.push("PLANT_GENERAL_ALARM");

  // Motores
  for (const id of PLANT_MOTOR_IDS) {
    tags.push(`${id}_RUN`);
    tags.push(`${id}_CURRENT`);
    tags.push(`${id}_SPEED`);
    tags.push(`${id}_TEMP`);
    tags.push(`${id}_FAULT`);
    tags.push(`${id}_CMD`); // comando de partida/parada
    tags.push(`${id}_FAULT_INJECT`); // para testes
  }

  // Exaustores
  for (const id of PLANT_EXHAUST_IDS) {
    tags.push(`${id}_RUN`);
    tags.push(`${id}_FLOW`);
    tags.push(`${id}_FAULT`);
  }

  // Entradas do processo
  tags.push("PLANT_TEMP_C");
  tags.push("PLANT_SMOKE");
  tags.push("PLANT_EXHAUST_DEMAND");
  tags.push("PLANT_UNDERVOLTAGE");

  // Comandos do sistema
  tags.push("PLANT_CMD_START");
  tags.push("PLANT_CMD_STOP");
  tags.push("PLANT_CMD_ESTOP");
  tags.push("PLANT_CMD_RESET");

  return tags;
}

// Mapeamento de tags do plant-engine para tags do projeto/editor
export function mapPlantTagsToProjectTags(
  plantTags: Record<string, number | boolean>,
): Record<string, number | boolean> {
  const mapped: Record<string, number | boolean> = {};

  // Mapeamento direto
  for (const [key, value] of Object.entries(plantTags)) {
    mapped[`PLANT_${key}`] = value;
  }

  // Aliases para compatibilidade com regras SCADA existentes
  if (plantTags["M01_RUN"]) mapped["M01_RUN"] = plantTags["M01_RUN"];
  if (plantTags["M01_CURRENT"] !== undefined) mapped["M01_CURRENT"] = plantTags["M01_CURRENT"];
  if (plantTags["M01_SPEED"] !== undefined) mapped["M01_SPEED"] = plantTags["M01_SPEED"];
  if (plantTags["TEMP_M01"] !== undefined) mapped["TEMP_M01"] = plantTags["TEMP_M01"];
  if (plantTags["M01_FAULT"]) mapped["M01_FAULT"] = plantTags["M01_FAULT"];

  if (plantTags["M03_RUN"]) mapped["M03_RUN"] = plantTags["M03_RUN"];
  if (plantTags["M03_SPEED"] !== undefined) mapped["VIBRACAO_M03"] = plantTags["M03_SPEED"];

  if (plantTags["EX01_RUN"]) mapped["EX01_RUN"] = plantTags["EX01_RUN"];
  if (plantTags["EX02_RUN"]) mapped["EX02_RUN"] = plantTags["EX02_RUN"];

  return mapped;
}

// Configuração padrão dos 8 motores
export const DEFAULT_MOTOR_CONFIG = [
  { id: "M01", name: "Motor 1", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M02", name: "Motor 2", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M03", name: "Motor 3", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M04", name: "Motor 4", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M05", name: "Motor 5", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M06", name: "Motor 6", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M07", name: "Motor 7", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
  { id: "M08", name: "Motor 8", power_kW: 5.5, voltage_V: 380, ratedRpm: 1750, tripTemp_C: 90 },
];

// Configuração padrão dos exaustores
export const DEFAULT_EXHAUST_CONFIG = [
  { id: "EX01", name: "Exaustor 1", onTemp_C: 27, offTemp_C: 24 },
  { id: "EX02", name: "Exaustor 2", onTemp_C: 27, offTemp_C: 24 },
];

// Rung SISTEMA padrão (START sela, STOP quebra, E-STOP trava)
export const SYSTEM_RUNG_DEFINITION = {
  label: "SISTEMA - Partida/Parada/E-Stop",
  cells: [
    // Branch 1: START (NA) + STOP (NF) + E-STOP (NF) -> SISTEMA (OTE)
    [
      { kind: "XIC", operand: "PLANT_CMD_START" },
      { kind: "XIO", operand: "PLANT_CMD_STOP" },
      { kind: "XIO", operand: "PLANT_ESTOP" },
      { kind: "OTE", operand: "PLANT_SYSTEM_ON" },
    ],
    // Branch 2: SISTEMA (NA) + E-STOP (NF) -> SISTEMA (OTL) - selamento
    [
      { kind: "XIC", operand: "PLANT_SYSTEM_ON" },
      { kind: "XIO", operand: "PLANT_ESTOP" },
      { kind: "OTL", operand: "PLANT_SYSTEM_ON" },
    ],
    // Branch 3: RESET (NA) + E-STOP liberado (NF) -> E-STOP (OTU)
    [
      { kind: "XIC", operand: "PLANT_CMD_RESET" },
      { kind: "XIO", operand: "PLANT_ESTOP" },
      { kind: "OTU", operand: "PLANT_ESTOP" },
    ],
  ],
};

// Rung MOTOR padrão (para cada M01-M08)
export function createMotorRungDefinition(motorId: string) {
  const tagBase = `PLANT_${motorId}`;
  return {
    label: `${motorId} - Partida/Proteção`,
    cells: [
      // Branch 1: SISTEMA + CMD + permissivos -> MOTOR_RUN
      [
        { kind: "XIC", operand: "PLANT_SYSTEM_ON" },
        { kind: "XIC", operand: `${tagBase}_CMD` },
        { kind: "XIO", operand: `${tagBase}_FAULT` },
        { kind: "OTE", operand: `${tagBase}_RUN` },
      ],
      // Branch 2: Proteção térmica (falha desliga)
      [
        { kind: "XIO", operand: `${tagBase}_FAULT` },
        { kind: "OTE", operand: `${tagBase}_RUN` },
      ],
    ],
  };
}

// Rung EXAUSTOR padrão (para EX01, EX02)
export function createExhaustorRungDefinition(exhaustId: string) {
  const tagBase = `PLANT_${exhaustId}`;
  return {
    label: `${exhaustId} - Ventilação (Histerese)`,
    cells: [
      // Branch 1: SISTEMA + (Temp > ON ou Fumaça) -> EX_RUN (OTL)
      [
        { kind: "XIC", operand: "PLANT_SYSTEM_ON" },
        { kind: "XIC", operand: "PLANT_TEMP_ABOVE_ON" }, // tag derivada: temp > 27
        { kind: "OTL", operand: `${tagBase}_RUN` },
      ],
      // Branch 2: SISTEMA + (Temp < OFF e sem fumaça) -> EX_RUN (OTU)
      [
        { kind: "XIC", operand: "PLANT_SYSTEM_ON" },
        { kind: "XIO", operand: "PLANT_TEMP_ABOVE_OFF" }, // tag derivada: temp < 24
        { kind: "XIO", operand: "PLANT_SMOKE" },
        { kind: "OTU", operand: `${tagBase}_RUN` },
      ],
      // Branch 3: Fumaça força ligado (OTL)
      [
        { kind: "XIC", operand: "PLANT_SYSTEM_ON" },
        { kind: "XIC", operand: "PLANT_SMOKE" },
        { kind: "OTL", operand: `${tagBase}_RUN` },
      ],
    ],
  };
}

// Definição completa do programa Ladder para a planta 8M+2EX
export const PLANT_LADDER_PROGRAM = {
  name: "Planta Industrial 8M+2EX",
  description:
    "Programa Ladder de referência para 8 motores + 2 exaustores com proteções, E-STOP e exaustores com histerese",
  rungs: [
    SYSTEM_RUNG_DEFINITION,
    ...PLANT_MOTOR_IDS.map(createMotorRungDefinition),
    ...PLANT_EXHAUST_IDS.map(createExhaustorRungDefinition),
  ],
};
