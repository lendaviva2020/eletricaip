// Textos de exibição da biblioteca elétrica (pt-BR / en) por tipo de componente.
//
// O catálogo (`component-catalog.ts`) e `COMPONENT_METADATA` continuam sendo os
// identificadores canônicos (busca, testes, persistência). Este módulo só fornece
// o texto mostrado ao usuário — com acentuação correta em pt-BR e tradução em en.
// Também corrige descrições que pertenciam a OUTRO equipamento (ex.: "B" é banco
// de baterias, não barramento; "SR" é retificador-carregador, não relé de segurança).
import type { SupportedLocale } from "@/lib/i18n/types";

type Pair = readonly [pt: string, en: string];

export const COMPONENT_NAMES: Readonly<Record<string, Pair>> = {
  QF: ["Disjuntor Termomagnético", "Thermal-Magnetic Circuit Breaker"],
  QS: ["Seccionadora", "Load-Break Switch"],
  DR: ["Dispositivo Diferencial Residual", "Residual Current Device"],
  FU: ["Fusível", "Fuse"],
  SPD: ["Protetor contra Surtos", "Surge Protective Device"],
  KM: ["Contator", "Contactor"],
  KA: ["Relé Auxiliar", "Auxiliary Relay"],
  FR: ["Relé Térmico de Sobrecarga", "Thermal Overload Relay"],
  M: ["Motor Elétrico", "Electric Motor"],
  SS: ["Soft-Starter", "Soft Starter"],
  VFD: ["Inversor de Frequência", "Variable Frequency Drive"],
  TR: ["Transformador de Potência", "Power Transformer"],
  PS: ["Fonte Chaveada CC", "DC Switching Power Supply"],
  PLC: ["Controlador Lógico Programável", "Programmable Logic Controller"],
  KT: ["Temporizador", "Timer Relay"],
  CT: ["Contador de Pulsos", "Pulse Counter"],
  BC: ["Banco de Capacitores", "Capacitor Bank"],
  G: ["Gerador Síncrono", "Synchronous Generator"],
  UPS: ["UPS Online", "Online UPS"],
  TC: ["Transformador de Corrente", "Current Transformer"],
  TP: ["Transformador de Potencial", "Voltage Transformer"],
  MPCB: ["Disjuntor-Motor", "Motor Protection Circuit Breaker"],
  CR: ["Relé de Controle", "Control Relay"],
  PFC: ["Controlador de Fator de Potência", "Power Factor Controller"],
  KWH: ["Medidor de Energia", "Energy Meter"],
  IED: ["Relé de Proteção Inteligente", "Intelligent Protection Relay"],
  SA: ["Chave de Transferência Automática", "Automatic Transfer Switch"],
  ES: ["Botão de Emergência", "Emergency Stop Button"],
  HL: ["Sinaleiro", "Pilot Light"],
  HZ: ["Campainha / Sirene", "Buzzer / Siren"],
  R: ["Resistor de Carga", "Load Resistor"],
  L: ["Reator Indutor", "Line Reactor"],
  TCTERRA: ["Transformador de Aterramento", "Grounding Transformer"],
  TVSS: ["Supressor de Surtos de Sinal", "Signal Surge Suppressor"],
  B: ["Banco de Baterias", "Battery Bank"],
  SR: ["Retificador Carregador", "Rectifier Charger"],
  PTZ: ["Termostato", "Thermostat"],
  FL: ["Fluxostato", "Flow Switch"],
  PSW: ["Pressostato", "Pressure Switch"],
  LS: ["Chave de Nível", "Level Switch"],
  V: ["Válvula Solenoide", "Solenoid Valve"],
  ESTOP_RELAY: ["Relé de Segurança", "Safety Relay"],
  MCB_AUX: ["Minidisjuntor Auxiliar", "Auxiliary Miniature Breaker"],
  SIN: ["Sirene com Voz", "Voice Siren"],
};

export const COMPONENT_DESCRIPTIONS: Readonly<Record<string, Pair>> = {
  QF: [
    "Disjuntor termomagnético contra sobrecorrente e curto-circuito",
    "Thermal-magnetic breaker against overcurrent and short circuit",
  ],
  QS: [
    "Seccionadora de carga com isolamento e abertura visível",
    "Load-break switch with isolation and visible break",
  ],
  DR: [
    "Disjuntor/interruptor diferencial residual (proteção contra choque e fuga)",
    "Residual current breaker/switch (protection against shock and leakage)",
  ],
  FU: [
    "Fusível de proteção ultrarrápida / gG para limitação de curto",
    "Ultra-fast / gG protection fuse for short-circuit limiting",
  ],
  SPD: [
    "Dispositivo de proteção contra surtos transitórios (DPS)",
    "Transient surge protective device (SPD)",
  ],
  TVSS: [
    "Supressor de transitórios de alta energia para painéis críticos",
    "High-energy transient suppressor for critical panels",
  ],
  KM: [
    "Contator tripolar eletromagnético de potência para AC-3",
    "Three-pole electromagnetic power contactor for AC-3",
  ],
  KA: [
    "Relé auxiliar de comando para multiplicação de contatos",
    "Auxiliary control relay for contact multiplication",
  ],
  FR: [
    "Relé térmico bimetálico de sobrecarga com sensibilidade à falta de fase",
    "Bimetallic thermal overload relay with phase-loss sensitivity",
  ],
  M: [
    "Motor de indução trifásico com rotor em gaiola de esquilo",
    "Three-phase squirrel-cage induction motor",
  ],
  SS: [
    "Chave de partida suave (soft-starter) com tiristores e rampa",
    "Thyristor soft starter with ramp",
  ],
  VFD: [
    "Inversor de frequência variável para controle escalar/vetorial de velocidade",
    "Variable frequency drive for scalar/vector speed control",
  ],
  TR: [
    "Transformador trifásico/monofásico para isolação e rebaixamento de tensão",
    "Three/single-phase transformer for isolation and step-down",
  ],
  PS: [
    "Fonte chaveada industrial CA/CC 24 Vcc estabilizada para comando",
    "Industrial AC/DC 24 Vdc regulated control power supply",
  ],
  PLC: [
    "Controlador Lógico Programável (CPU + Módulos de E/S)",
    "Programmable Logic Controller (CPU + I/O modules)",
  ],
  KT: [
    "Relé temporizador eletrônico (on-delay / off-delay / cíclico)",
    "Electronic timer relay (on-delay / off-delay / cyclic)",
  ],
  CT: [
    "Contador eletromecânico/digital de pulsos industriais",
    "Electromechanical/digital industrial pulse counter",
  ],
  BC: [
    "Banco automático de capacitores para correção do fator de potência",
    "Automatic capacitor bank for power factor correction",
  ],
  PFC: [
    "Controlador automático de fator de potência (estágios em kVAr)",
    "Automatic power factor controller (kVAr steps)",
  ],
  G: [
    "Grupo gerador diesel síncrono para emergência e cogeração",
    "Synchronous diesel generator set for emergency and cogeneration",
  ],
  UPS: [
    "Sistema ininterrupto de energia (no-break) de dupla conversão",
    "Double-conversion uninterruptible power supply",
  ],
  TC: [
    "Transformador de corrente para medição e proteção de alimentadores",
    "Current transformer for feeder metering and protection",
  ],
  TP: [
    "Transformador de potencial para instrumentação de média/baixa tensão",
    "Voltage transformer for medium/low-voltage instrumentation",
  ],
  MPCB: [
    "Disjuntor-motor coordenado com proteção térmica e magnética combinadas",
    "Coordinated motor breaker with combined thermal and magnetic protection",
  ],
  CR: [
    "Relé de interface e isolamento galvânico para sinais discretos",
    "Interface relay with galvanic isolation for discrete signals",
  ],
  KWH: [
    "Multimedidor digital de grandezas elétricas (V, A, kW, kWh, THD)",
    "Digital multimeter for electrical quantities (V, A, kW, kWh, THD)",
  ],
  IED: [
    "Relé inteligente microprocessado de proteção e supervisão (50/51/87)",
    "Microprocessor protection and supervision relay (50/51/87)",
  ],
  SA: [
    "Chave de transferência automática entre rede e gerador (ATS)",
    "Automatic transfer switch between utility and generator (ATS)",
  ],
  ES: [
    "Botão cogumelo de parada de emergência com trava e rearme por giro",
    "Mushroom emergency stop button with latch and twist reset",
  ],
  HL: [
    "Sinaleiro luminoso LED indicador de estado operacional",
    "LED pilot light for operating status",
  ],
  HZ: [
    "Sinalizador sonoro / sirene industrial de alarme e advertência",
    "Industrial buzzer / siren for alarm and warning",
  ],
  R: [
    "Resistor de frenagem para absorção de energia regenerativa de motores",
    "Braking resistor absorbing regenerative motor energy",
  ],
  L: [
    "Reator indutivo de linha para atenuação de picos e harmônicos",
    "Line reactor for peak and harmonic attenuation",
  ],
  B: [
    "Banco de baterias estacionárias para alimentação de emergência em CC",
    "Stationary battery bank for DC emergency supply",
  ],
  SR: [
    "Retificador-carregador de baterias para sistemas de corrente contínua",
    "Battery rectifier-charger for DC systems",
  ],
  TCTERRA: [
    "Transformador de aterramento (zig-zag) para criação de neutro e limitação de falta à terra",
    "Grounding (zig-zag) transformer for neutral derivation and earth-fault limiting",
  ],
  ESTOP_RELAY: [
    "Relé de segurança com duplo canal redundante e monitoramento de rearme",
    "Dual-channel redundant safety relay with reset monitoring",
  ],
};

const idx = (locale: SupportedLocale) => (locale === "en" ? 1 : 0);

/** Nome de exibição; cai no nome do catálogo quando o tipo não tem tradução. */
export function componentDisplayName(
  type: string,
  fallback: string,
  locale: SupportedLocale,
): string {
  return COMPONENT_NAMES[type]?.[idx(locale)] ?? fallback;
}

/** Descrição de exibição; cai na descrição canônica quando o tipo não tem tradução. */
export function componentDisplayDescription(
  type: string,
  fallback: string,
  locale: SupportedLocale,
): string {
  return COMPONENT_DESCRIPTIONS[type]?.[idx(locale)] ?? fallback;
}
