/**
 * Configuração da bancada Arduino Uno R3 (5 V, ADC 10 bits) e conversão das
 * leituras em grandezas de engenharia.
 *
 * O firmware manda CONTAGENS do ADC (média e valor eficaz CA); a conversão em
 * volts/ampères acontece aqui, com os parâmetros do sensor escolhido. Canal sem
 * sensor configurado é mostrado em contagens — nunca com unidade inventada.
 */
import { z } from "zod";

export const ADC_MAX = 1023;
export const ADC_VREF = 5.0;
/** Pinos de E/S do Uno disponíveis para a bancada (D0/D1 = serial USB). */
export const UNO_DIGITAL_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export type SensorPreset =
  | "acs712_5a"
  | "acs712_20a"
  | "acs712_30a"
  | "sct013_030"
  | "sct013_100_burden"
  | "zmpt101b"
  | "voltage_divider";

export interface SensorModel {
  readonly label: string;
  readonly quantity: "current" | "voltage";
  readonly unit: "A" | "V";
  /** "dc": usa a média (com offset). "ac": usa o valor eficaz CA. */
  readonly mode: "dc" | "ac";
  /** Unidades por volt no pino do Arduino. */
  readonly unitsPerVolt: number;
  /** Tensão de repouso (sensor de efeito Hall em 2,5 V). */
  readonly offsetV: number;
  /** Fundo de escala do sensor (para avisos). */
  readonly fullScale: number;
}

/**
 * Presets com valores de datasheet. ACS712: sensibilidade 185/100/66 mV/A;
 * SCT-013-030: saída 1 V para 30 A; SCT-013-000 (100 A:50 mA) com resistor de
 * carga de 33 Ω → 2000 espiras / 33 Ω ≈ 60,6 A/V; ZMPT101B e divisor exigem
 * calibração (fator informado pelo usuário substitui o padrão).
 */
export const SENSOR_PRESETS: Readonly<Record<SensorPreset, SensorModel>> = {
  acs712_5a: {
    label: "ACS712 5 A",
    quantity: "current",
    unit: "A",
    mode: "dc",
    unitsPerVolt: 1 / 0.185,
    offsetV: 2.5,
    fullScale: 5,
  },
  acs712_20a: {
    label: "ACS712 20 A",
    quantity: "current",
    unit: "A",
    mode: "dc",
    unitsPerVolt: 1 / 0.1,
    offsetV: 2.5,
    fullScale: 20,
  },
  acs712_30a: {
    label: "ACS712 30 A",
    quantity: "current",
    unit: "A",
    mode: "dc",
    unitsPerVolt: 1 / 0.066,
    offsetV: 2.5,
    fullScale: 30,
  },
  sct013_030: {
    label: "SCT-013-030 (1 V/30 A)",
    quantity: "current",
    unit: "A",
    mode: "ac",
    unitsPerVolt: 30,
    offsetV: 0,
    fullScale: 30,
  },
  sct013_100_burden: {
    label: "SCT-013-000 + 33 Ω",
    quantity: "current",
    unit: "A",
    mode: "ac",
    unitsPerVolt: 2000 / 33,
    offsetV: 0,
    fullScale: 100,
  },
  zmpt101b: {
    label: "ZMPT101B (calibrar)",
    quantity: "voltage",
    unit: "V",
    mode: "ac",
    unitsPerVolt: 1,
    offsetV: 0,
    fullScale: 250,
  },
  voltage_divider: {
    label: "Divisor resistivo CC (calibrar)",
    quantity: "voltage",
    unit: "V",
    mode: "dc",
    unitsPerVolt: 1,
    offsetV: 0,
    fullScale: 25,
  },
};

const pin = z.number().int().min(2).max(13);

export const OutputSchema = z.object({
  pin,
  label: z.string().trim().min(1).max(24),
  /** Módulos relé optoacoplados comuns acionam com nível BAIXO. */
  activeLow: z.boolean().default(true),
  /** Pino que nunca pode ligar junto (ex.: reversão de motor). */
  interlockPin: pin.optional(),
  /** Nó do unifilar que este relé comanda (contator). */
  unifilarNodeId: z.string().max(80).optional(),
  /** Corrente da carga comandada (A) — para a verificação NBR 5410. */
  loadCurrentA: z.number().positive().max(10_000).optional(),
  /** Seção do condutor do circuito (mm²). */
  conductorMm2: z.number().positive().max(1000).optional(),
  /** Corrente nominal do disjuntor do circuito (A). */
  breakerA: z.number().positive().max(10_000).optional(),
  /** Capacidade do contato do relé/contator (A). */
  contactRatingA: z.number().positive().max(10_000).optional(),
  /** Entrada que sinaliza o disjuntor do circuito fechado (contato auxiliar). */
  breakerAuxPin: pin.optional(),
});

export const InputSchema = z.object({
  pin,
  label: z.string().trim().min(1).max(24),
  /** Contato NA ao GND com INPUT_PULLUP: fechado = LOW = ativo. */
  role: z.enum(["breaker_aux", "generic"]).default("generic"),
  unifilarNodeId: z.string().max(80).optional(),
});

export const AnalogSchema = z.object({
  channel: z.number().int().min(0).max(5),
  label: z.string().trim().min(1).max(24),
  sensor: z.enum([
    "acs712_5a",
    "acs712_20a",
    "acs712_30a",
    "sct013_030",
    "sct013_100_burden",
    "zmpt101b",
    "voltage_divider",
  ]),
  /** Fator de calibração medido (substitui unitsPerVolt do preset). */
  calibrationUnitsPerVolt: z.number().positive().max(100_000).optional(),
  unifilarNodeId: z.string().max(80).optional(),
});

export const BenchConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(40).default("Bancada EletricAI"),
    /** E-STOP físico: contato NF ao GND com INPUT_PULLUP — aberto/rompido = parado. */
    estopPin: pin.default(2),
    /** Sem mensagem do host neste tempo, o firmware desliga todas as saídas. */
    hostTimeoutMs: z.number().int().min(500).max(10_000).default(1500),
    /** Intervalo de envio de telemetria (ms). */
    telemetryMs: z.number().int().min(100).max(5000).default(250),
    outputs: z.array(OutputSchema).max(10).default([]),
    inputs: z.array(InputSchema).max(10).default([]),
    analog: z.array(AnalogSchema).max(6).default([]),
  })
  .superRefine((cfg, ctx) => {
    const used = new Map<number, string>();
    const claim = (p: number, what: string, path: (string | number)[]) => {
      const prev = used.get(p);
      if (prev) ctx.addIssue({ code: "custom", path, message: `D${p} já usado por ${prev}` });
      else used.set(p, what);
    };
    claim(cfg.estopPin, "E-STOP", ["estopPin"]);
    cfg.outputs.forEach((o, i) => claim(o.pin, `saída ${o.label}`, ["outputs", i, "pin"]));
    cfg.inputs.forEach((o, i) => claim(o.pin, `entrada ${o.label}`, ["inputs", i, "pin"]));
    const channels = new Set<number>();
    cfg.analog.forEach((a, i) => {
      if (channels.has(a.channel)) {
        ctx.addIssue({
          code: "custom",
          path: ["analog", i, "channel"],
          message: `A${a.channel} repetido`,
        });
      }
      channels.add(a.channel);
    });
    const outPins = new Set(cfg.outputs.map((o) => o.pin));
    cfg.outputs.forEach((o, i) => {
      if (o.interlockPin !== undefined && !outPins.has(o.interlockPin)) {
        ctx.addIssue({
          code: "custom",
          path: ["outputs", i, "interlockPin"],
          message: `Intertravamento com D${o.interlockPin}, que não é saída`,
        });
      }
    });
  });

export type BenchConfig = z.output<typeof BenchConfigSchema>;
export type BenchOutput = z.output<typeof OutputSchema>;
export type BenchAnalog = z.output<typeof AnalogSchema>;

export interface EngineeringReading {
  readonly channel: number;
  readonly label: string;
  /** null quando o canal não tem sensor configurado. */
  readonly value: number | null;
  readonly unit: "A" | "V" | "contagens";
  readonly raw: number;
  /** Leitura perto do limite do ADC (0 ou 1023): saturação, valor não confiável. */
  readonly saturated: boolean;
}

export function countsToVolts(counts: number): number {
  return (counts * ADC_VREF) / ADC_MAX;
}

/** Converte a leitura de um canal (média e RMS CA em contagens) para a grandeza. */
export function toEngineering(
  channelCfg: BenchAnalog | undefined,
  channel: number,
  meanCounts: number,
  acRmsCounts: number,
): EngineeringReading {
  const saturated = meanCounts <= 2 || meanCounts >= ADC_MAX - 2;
  if (!channelCfg) {
    return {
      channel,
      label: `A${channel}`,
      value: null,
      unit: "contagens",
      raw: meanCounts,
      saturated,
    };
  }
  const model = SENSOR_PRESETS[channelCfg.sensor];
  const k = channelCfg.calibrationUnitsPerVolt ?? model.unitsPerVolt;
  const value =
    model.mode === "dc"
      ? (countsToVolts(meanCounts) - model.offsetV) * k
      : countsToVolts(acRmsCounts) * k;
  return {
    channel,
    label: channelCfg.label,
    value: Math.round(value * 1000) / 1000,
    unit: model.unit,
    raw: meanCounts,
    saturated,
  };
}

/**
 * Bancada de exemplo (firmware base do repositório): partida de bomba com
 * reserva + motor reversível intertravado, auxiliares dos disjuntores e
 * medição de corrente/tensão. Sem dados de circuito presumidos: a verificação
 * NBR 5410 pede que o usuário informe carga, condutor e disjuntor.
 */
export const DEFAULT_BENCH_CONFIG: BenchConfig = BenchConfigSchema.parse({
  name: "Bancada EletricAI",
  estopPin: 2,
  outputs: [
    { pin: 4, label: "K1 Bomba principal", breakerAuxPin: 8 },
    { pin: 5, label: "K2 Bomba reserva", breakerAuxPin: 9 },
    { pin: 6, label: "KM1 Motor avante", interlockPin: 7 },
    { pin: 7, label: "KM2 Motor reverso", interlockPin: 6 },
  ],
  inputs: [
    { pin: 8, label: "Q1 aux", role: "breaker_aux" },
    { pin: 9, label: "Q2 aux", role: "breaker_aux" },
  ],
  analog: [
    { channel: 0, label: "Corrente K1", sensor: "acs712_5a" },
    { channel: 1, label: "Tensao rede", sensor: "zmpt101b" },
  ],
});
