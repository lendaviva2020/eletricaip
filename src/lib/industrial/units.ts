// ELÉTRICAI — GATE 3.6 — Conversão de unidades de engenharia
// Conversão linear: target = source * factor + offset. Apenas entre unidades da mesma grandeza.

interface UnitDef {
  quantity: string;
  /** Conversão para a unidade base da grandeza: base = value * toBase + toBaseOffset */
  toBase: number;
  toBaseOffset?: number;
}

const UNITS: Record<string, UnitDef> = {
  // tensão (base V)
  V: { quantity: "voltage", toBase: 1 },
  kV: { quantity: "voltage", toBase: 1000 },
  mV: { quantity: "voltage", toBase: 0.001 },
  // corrente (base A)
  A: { quantity: "current", toBase: 1 },
  kA: { quantity: "current", toBase: 1000 },
  mA: { quantity: "current", toBase: 0.001 },
  // potência ativa (base W)
  W: { quantity: "power", toBase: 1 },
  kW: { quantity: "power", toBase: 1000 },
  MW: { quantity: "power", toBase: 1_000_000 },
  // energia (base Wh)
  Wh: { quantity: "energy", toBase: 1 },
  kWh: { quantity: "energy", toBase: 1000 },
  MWh: { quantity: "energy", toBase: 1_000_000 },
  // temperatura (base °C)
  "°C": { quantity: "temperature", toBase: 1 },
  degC: { quantity: "temperature", toBase: 1 },
  K: { quantity: "temperature", toBase: 1, toBaseOffset: -273.15 },
  "°F": { quantity: "temperature", toBase: 5 / 9, toBaseOffset: -32 * (5 / 9) },
  // pressão (base kPa)
  kPa: { quantity: "pressure", toBase: 1 },
  bar: { quantity: "pressure", toBase: 100 },
  mbar: { quantity: "pressure", toBase: 0.1 },
  Pa: { quantity: "pressure", toBase: 0.001 },
  psi: { quantity: "pressure", toBase: 6.894757 },
  // vazão (base m³/h)
  "m³/h": { quantity: "flow", toBase: 1 },
  "m3/h": { quantity: "flow", toBase: 1 },
  "L/s": { quantity: "flow", toBase: 3.6 },
  "L/min": { quantity: "flow", toBase: 0.06 },
  // frequência
  Hz: { quantity: "frequency", toBase: 1 },
  // adimensionais
  "%": { quantity: "ratio_percent", toBase: 1 },
  rpm: { quantity: "rotation", toBase: 1 },
};

export interface UnitConversion {
  factor: number;
  offset: number;
}

/**
 * Retorna o fator linear de conversão de `from` para `to`, ou null se incompatíveis.
 * Unidades vazias / iguais → identidade.
 */
export function getUnitConversion(from: string, to: string): UnitConversion | null {
  if (!from || !to || from === to) return { factor: 1, offset: 0 };
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.quantity !== b.quantity) return null;
  // base = v*a.toBase + a.off ; to = (base - b.off)/b.toBase
  const factor = a.toBase / b.toBase;
  const offset = ((a.toBaseOffset ?? 0) - (b.toBaseOffset ?? 0)) / b.toBase;
  return { factor, offset };
}

export function isKnownUnit(symbol: string): boolean {
  return symbol === "" || symbol in UNITS;
}
