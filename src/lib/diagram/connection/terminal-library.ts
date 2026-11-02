// Comprehensive Industrial Terminal Library
// Standards: IEC 60947 (Switchgear), IEC 60617 (Symbols), IEC 60204-1 (Safety of Machinery), NBR 5410, NBR 14039

import type { NodeKind, NodeParams } from "../schema";
import type { CanonicalTerminal } from "@/lib/model/unified-schema";
import type {
  TerminalDefinition,
  EquipmentTerminalProfile,
  ElectricalNature,
  ElectricalPhase,
} from "./types";

function mkTerm(
  code: string,
  name: string,
  nature: ElectricalNature,
  direction: "in" | "out" | "bidirectional",
  portId: string,
  isRequired = true,
  phase?: ElectricalPhase,
  description?: string,
  maxConnections = 1,
): TerminalDefinition {
  return {
    code,
    name,
    nature,
    direction,
    portId,
    isRequired,
    phase,
    description: description ?? `${name} (${code})`,
    maxConnections,
  };
}

export const TERMINAL_LIBRARY: Record<NodeKind, (params?: NodeParams) => EquipmentTerminalProfile> =
  {
    breaker: (params) => {
      const poles = (params && "poles" in params && params.poles) || 3;
      const terms: TerminalDefinition[] = [];

      if (poles === 1) {
        terms.push(mkTerm("1", "Entrada Linha", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("2", "Saída Carga", "power", "out", "B", true, "L1"));
      } else if (poles === 2) {
        terms.push(mkTerm("1/L1", "Entrada L1", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("2/T1", "Saída T1", "power", "out", "B", true, "L1"));
        terms.push(mkTerm("3/N", "Entrada Neutro/L2", "power", "in", "L", true, "N"));
        terms.push(mkTerm("4/N", "Saída Neutro/L2", "power", "out", "R", true, "N"));
      } else if (poles === 4) {
        terms.push(mkTerm("1/L1", "Entrada Fase L1", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("2/T1", "Saída Fase T1", "power", "out", "B", true, "L1"));
        terms.push(mkTerm("3/L2", "Entrada Fase L2", "power", "in", "T", true, "L2"));
        terms.push(mkTerm("4/T2", "Saída Fase T2", "power", "out", "B", true, "L2"));
        terms.push(mkTerm("5/L3", "Entrada Fase L3", "power", "in", "T", true, "L3"));
        terms.push(mkTerm("6/T3", "Saída Fase T3", "power", "out", "B", true, "L3"));
        terms.push(mkTerm("N_IN", "Entrada Neutro", "power", "in", "L", true, "N"));
        terms.push(mkTerm("N_OUT", "Saída Neutro", "power", "out", "R", true, "N"));
      } else {
        // Default 3P
        terms.push(mkTerm("1/L1", "Entrada Fase L1", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("2/T1", "Saída Fase T1", "power", "out", "B", true, "L1"));
        terms.push(mkTerm("3/L2", "Entrada Fase L2", "power", "in", "T", true, "L2"));
        terms.push(mkTerm("4/T2", "Saída Fase T2", "power", "out", "B", true, "L2"));
        terms.push(mkTerm("5/L3", "Entrada Fase L3", "power", "in", "T", true, "L3"));
        terms.push(mkTerm("6/T3", "Saída Fase T3", "power", "out", "B", true, "L3"));
      }

      return {
        kind: "breaker",
        description: `Disjuntor Termomagnético ${poles}P`,
        terminals: terms,
        defaultInPort: "T",
        defaultOutPort: "B",
      };
    },

    rcd: (params) => {
      const poles = (params && "poles" in params && params.poles) || 2;
      const terms: TerminalDefinition[] = [];

      if (poles === 4) {
        terms.push(mkTerm("1/L1", "Entrada L1", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("2/T1", "Saída T1", "power", "out", "B", true, "L1"));
        terms.push(mkTerm("3/L2", "Entrada L2", "power", "in", "T", true, "L2"));
        terms.push(mkTerm("4/T2", "Saída T2", "power", "out", "B", true, "L2"));
        terms.push(mkTerm("5/L3", "Entrada L3", "power", "in", "T", true, "L3"));
        terms.push(mkTerm("6/T3", "Saída T3", "power", "out", "B", true, "L3"));
        terms.push(mkTerm("N_IN", "Entrada Neutro", "power", "in", "L", true, "N"));
        terms.push(mkTerm("N_OUT", "Saída Neutro", "power", "out", "R", true, "N"));
      } else {
        terms.push(mkTerm("1/L", "Entrada Linha", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("2/T", "Saída Carga", "power", "out", "B", true, "L1"));
        terms.push(mkTerm("N_IN", "Entrada Neutro", "power", "in", "L", true, "N"));
        terms.push(mkTerm("N_OUT", "Saída Neutro", "power", "out", "R", true, "N"));
      }

      return {
        kind: "rcd",
        description: `Interruptor Diferencial Residual (DR) ${poles}P`,
        terminals: terms,
        defaultInPort: "T",
        defaultOutPort: "B",
      };
    },

    contactor: () => ({
      kind: "contactor",
      description: "Contator de Potência Tripolar com Contatos Auxiliares",
      terminals: [
        mkTerm("1/L1", "Entrada Potência L1", "power", "in", "T", true, "L1"),
        mkTerm("2/T1", "Saída Potência T1", "power", "out", "B", true, "L1"),
        mkTerm("3/L2", "Entrada Potência L2", "power", "in", "T", true, "L2"),
        mkTerm("4/T2", "Saída Potência T2", "power", "out", "B", true, "L2"),
        mkTerm("5/L3", "Entrada Potência L3", "power", "in", "T", true, "L3"),
        mkTerm("6/T3", "Saída Potência T3", "power", "out", "B", true, "L3"),
        mkTerm("A1", "Bobina Comando (+/Fase)", "control", "in", "L", false, "any"),
        mkTerm("A2", "Bobina Comando (-/Neutro)", "control", "out", "R", false, "any"),
        mkTerm("13", "Contato Auxiliar NA 13", "control", "in", "L", false, "any"),
        mkTerm("14", "Contato Auxiliar NA 14", "control", "out", "R", false, "any"),
        mkTerm("21", "Contato Auxiliar NF 21", "control", "in", "L", false, "any"),
        mkTerm("22", "Contato Auxiliar NF 22", "control", "out", "R", false, "any"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    thermal_relay: () => ({
      kind: "thermal_relay",
      description: "Relé de Sobrecarga Térmico (Bimetálico)",
      terminals: [
        mkTerm("1/L1", "Entrada Potência L1", "power", "in", "T", true, "L1"),
        mkTerm("2/T1", "Saída Potência T1", "power", "out", "B", true, "L1"),
        mkTerm("3/L2", "Entrada Potência L2", "power", "in", "T", true, "L2"),
        mkTerm("4/T2", "Saída Potência T2", "power", "out", "B", true, "L2"),
        mkTerm("5/L3", "Entrada Potência L3", "power", "in", "T", true, "L3"),
        mkTerm("6/T3", "Saída Potência T3", "power", "out", "B", true, "L3"),
        mkTerm("95", "Contato Desarme NF 95", "control", "in", "L", false, "any"),
        mkTerm("96", "Contato Desarme NF 96", "control", "out", "R", false, "any"),
        mkTerm("97", "Contato Alarme NA 97", "control", "in", "L", false, "any"),
        mkTerm("98", "Contato Alarme NA 98", "control", "out", "R", false, "any"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    fuse: () => ({
      kind: "fuse",
      description: "Fusível de Proteção",
      terminals: [
        mkTerm("1", "Entrada Linha", "power", "in", "T", true, "L1"),
        mkTerm("2", "Saída Carga", "power", "out", "B", true, "L1"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    disconnector: () => ({
      kind: "disconnector",
      description: "Chave Seccionadora sob Carga",
      terminals: [
        mkTerm("1/L1", "Entrada L1", "power", "in", "T", true, "L1"),
        mkTerm("2/T1", "Saída T1", "power", "out", "B", true, "L1"),
        mkTerm("3/L2", "Entrada L2", "power", "in", "T", true, "L2"),
        mkTerm("4/T2", "Saída T2", "power", "out", "B", true, "L2"),
        mkTerm("5/L3", "Entrada L3", "power", "in", "T", true, "L3"),
        mkTerm("6/T3", "Saída T3", "power", "out", "B", true, "L3"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    busbar: () => ({
      kind: "busbar",
      description: "Barramento Principal de Distribuição (QGBT)",
      terminals: [
        mkTerm("IN_FEED", "Alimentação Geral", "power", "in", "T", true, "3F+N", undefined, 1),
        mkTerm("TAP_1", "Derivação 1", "power", "out", "B1", false, "3F+N", undefined, 1),
        mkTerm("TAP_2", "Derivação 2", "power", "out", "B2", false, "3F+N", undefined, 1),
        mkTerm("TAP_3", "Derivação 3", "power", "out", "B", false, "3F+N", undefined, 1),
        mkTerm("TAP_4", "Derivação 4", "power", "out", "B3", false, "3F+N", undefined, 1),
        mkTerm("TAP_5", "Derivação 5", "power", "out", "B4", false, "3F+N", undefined, 1),
        mkTerm(
          "TAP_LEFT",
          "Extensão Lateral Esquerda",
          "power",
          "bidirectional",
          "L",
          false,
          "3F+N",
          undefined,
          1,
        ),
        mkTerm(
          "TAP_RIGHT",
          "Extensão Lateral Direita",
          "power",
          "bidirectional",
          "R",
          false,
          "3F+N",
          undefined,
          1,
        ),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    transformer: () => ({
      kind: "transformer",
      description: "Transformador de Potência / Distribuição",
      terminals: [
        mkTerm("H1", "Primário Fase A/H1", "power", "in", "T", true, "L1"),
        mkTerm("H2", "Primário Fase B/H2", "power", "in", "T", true, "L2"),
        mkTerm("H3", "Primário Fase C/H3", "power", "in", "T", true, "L3"),
        mkTerm("X1", "Secundário Fase a/X1", "power", "out", "B", true, "L1"),
        mkTerm("X2", "Secundário Fase b/X2", "power", "out", "B", true, "L2"),
        mkTerm("X3", "Secundário Fase c/X3", "power", "out", "B", true, "L3"),
        mkTerm("X0", "Secundário Neutro/X0", "power", "out", "R", true, "N"),
        mkTerm("PE", "Carcaça Terra de Proteção", "protection", "in", "L", true, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    motor: (params) => {
      const isStarDelta =
        params &&
        "startMethod" in params &&
        (params as unknown as { startMethod?: string }).startMethod === "STAR_DELTA";
      const terms: TerminalDefinition[] = [
        mkTerm("U1", "Terminal U1 (Fase 1)", "power", "in", "T", true, "L1"),
        mkTerm("V1", "Terminal V1 (Fase 2)", "power", "in", "T", true, "L2"),
        mkTerm("W1", "Terminal W1 (Fase 3)", "power", "in", "T", true, "L3"),
        mkTerm("PE", "Aterramento de Carcaça", "protection", "in", "B", true, "PE"),
      ];

      if (isStarDelta) {
        terms.push(mkTerm("U2", "Terminal U2 (Estrela-Triângulo)", "power", "in", "T", true, "L1"));
        terms.push(mkTerm("V2", "Terminal V2 (Estrela-Triângulo)", "power", "in", "T", true, "L2"));
        terms.push(mkTerm("W2", "Terminal W2 (Estrela-Triângulo)", "power", "in", "T", true, "L3"));
      }

      return {
        kind: "motor",
        description: "Motor Trifásico de Indução Gaiola (MIT)",
        terminals: terms,
        defaultInPort: "T",
        defaultOutPort: "B",
      };
    },

    vfd: () => ({
      kind: "vfd",
      description: "Inversor de Frequência Vetorial (VFD)",
      terminals: [
        mkTerm("L1", "Alimentação Rede L1", "power", "in", "T", true, "L1"),
        mkTerm("L2", "Alimentação Rede L2", "power", "in", "T", true, "L2"),
        mkTerm("L3", "Alimentação Rede L3", "power", "in", "T", true, "L3"),
        mkTerm("PE_IN", "Aterramento Rede PE", "protection", "in", "L", true, "PE"),
        mkTerm("U", "Saída Motor U", "power", "out", "B", true, "L1"),
        mkTerm("V", "Saída Motor V", "power", "out", "B", true, "L2"),
        mkTerm("W", "Saída Motor W", "power", "out", "B", true, "L3"),
        mkTerm("PE_OUT", "Aterramento Motor PE", "protection", "out", "R", true, "PE"),
        mkTerm("DI1", "Entrada Digital DI1 (Start)", "control", "in", "L", false, "any"),
        mkTerm("DI2", "Entrada Digital DI2 (Reset)", "control", "in", "L", false, "any"),
        mkTerm("+24V", "Fonte Interna +24V", "control", "out", "R", false, "DC+"),
        mkTerm("COM", "Comum 0V", "control", "out", "R", false, "DC-"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    softstarter: () => ({
      kind: "softstarter",
      description: "Chave de Partida Suave (Soft-Starter)",
      terminals: [
        mkTerm("1/L1", "Alimentação Rede L1", "power", "in", "T", true, "L1"),
        mkTerm("3/L2", "Alimentação Rede L2", "power", "in", "T", true, "L2"),
        mkTerm("5/L3", "Alimentação Rede L3", "power", "in", "T", true, "L3"),
        mkTerm("2/T1", "Saída Carga T1", "power", "out", "B", true, "L1"),
        mkTerm("4/T2", "Saída Carga T2", "power", "out", "B", true, "L2"),
        mkTerm("6/T3", "Saída Carga T3", "power", "out", "B", true, "L3"),
        mkTerm("PE", "Aterramento PE", "protection", "in", "L", true, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    psu: () => ({
      kind: "psu",
      description: "Fonte Chaveada 24Vcc Industrial",
      terminals: [
        mkTerm("AC_L", "Alimentação AC Linha", "power", "in", "T", true, "L1"),
        mkTerm("AC_N", "Alimentação AC Neutro", "power", "in", "T", true, "N"),
        mkTerm("PE", "Aterramento Carcaça", "protection", "in", "L", true, "PE"),
        mkTerm("+24V", "Saída DC +24V", "control", "out", "B", true, "DC+"),
        mkTerm("0V", "Saída DC 0V / GND", "control", "out", "B", true, "DC-"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    load: () => ({
      kind: "load",
      description: "Carga Elétrica Genérica",
      terminals: [
        mkTerm("L", "Fase / Linha", "power", "in", "T", true, "L1"),
        mkTerm("N", "Neutro", "power", "in", "T", true, "N"),
        mkTerm("PE", "Condutor de Proteção (PE)", "protection", "in", "B", true, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    lamp: () => ({
      kind: "lamp",
      description: "Ponto de Iluminação",
      terminals: [
        mkTerm("L", "Fase / Retorno", "power", "in", "T", true, "L1"),
        mkTerm("N", "Neutro", "power", "in", "T", true, "N"),
        mkTerm("PE", "Proteção (PE)", "protection", "in", "B", false, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    socket: () => ({
      kind: "socket",
      description: "Tomada de Uso Geral (TUG) / Especial (TUE)",
      terminals: [
        mkTerm("L", "Fase Linha", "power", "in", "T", true, "L1"),
        mkTerm("N", "Neutro", "power", "in", "T", true, "N"),
        mkTerm("PE", "Condutor de Proteção (PE)", "protection", "in", "B", true, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    relay: () => ({
      kind: "relay",
      description: "Relé Auxiliar de Controle",
      terminals: [
        mkTerm("A1", "Bobina (+)", "control", "in", "L", true, "any"),
        mkTerm("A2", "Bobina (-)", "control", "out", "R", true, "any"),
        mkTerm("11", "Comum 1", "control", "in", "T", true, "any"),
        mkTerm("12", "NF 1", "control", "out", "B", false, "any"),
        mkTerm("14", "NA 1", "control", "out", "B", false, "any"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    estop: () => ({
      kind: "estop",
      description: "Botão Cogumelo de Parada de Emergência (E-STOP)",
      terminals: [
        mkTerm("11", "Contato NF 1 Canal A", "control", "in", "L", true, "any"),
        mkTerm("12", "Contato NF 1 Canal A", "control", "out", "R", true, "any"),
        mkTerm("21", "Contato NF 2 Canal B", "control", "in", "L", true, "any"),
        mkTerm("22", "Contato NF 2 Canal B", "control", "out", "R", true, "any"),
      ],
      defaultInPort: "L",
      defaultOutPort: "R",
    }),

    lightcurtain: () => ({
      kind: "lightcurtain",
      description: "Barreira de Luz de Segurança (Cortina Óptica)",
      terminals: [
        mkTerm("24V", "Alimentação 24Vcc", "control", "in", "L", true, "DC+"),
        mkTerm("0V", "Alimentação 0V", "control", "in", "L", true, "DC-"),
        mkTerm("OSSD1", "Saída de Segurança 1", "control", "out", "R", true, "signal"),
        mkTerm("OSSD2", "Saída de Segurança 2", "control", "out", "R", true, "signal"),
      ],
      defaultInPort: "L",
      defaultOutPort: "R",
    }),

    plc: () => ({
      kind: "plc",
      description: "Controlador Lógico Programável (CLP/PLC)",
      terminals: [
        mkTerm("24V", "Alimentação CPU 24Vcc", "control", "in", "T", true, "DC+"),
        mkTerm("0V", "Comum 0V", "control", "in", "T", true, "DC-"),
        mkTerm("PE", "Aterramento Funcional", "protection", "in", "L", true, "PE"),
        mkTerm("DI0", "Entrada Digital DI0", "control", "in", "L", false, "signal"),
        mkTerm("DQ0", "Saída Digital DQ0", "control", "out", "R", false, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    hmi: () => ({
      kind: "hmi",
      description: "Interface Homem-Máquina (IHM)",
      terminals: [
        mkTerm("24V", "Alimentação 24Vcc", "control", "in", "T", true, "DC+"),
        mkTerm("0V", "Alimentação 0V", "control", "in", "T", true, "DC-"),
        mkTerm("ETH", "Porta de Rede Ethernet", "signal", "bidirectional", "R", true, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    ground: () => ({
      kind: "ground",
      description: "Eletrodo / Barramento de Terra de Proteção (PE)",
      terminals: [
        mkTerm(
          "PE",
          "Ponto de Aterramento Principal",
          "protection",
          "bidirectional",
          "T",
          true,
          "PE",
          undefined,
          99,
        ),
      ],
      defaultInPort: "T",
      defaultOutPort: "T",
    }),

    neutral: () => ({
      kind: "neutral",
      description: "Barramento de Neutro (N)",
      terminals: [
        mkTerm(
          "N",
          "Barramento de Neutro",
          "power",
          "bidirectional",
          "T",
          true,
          "N",
          undefined,
          99,
        ),
      ],
      defaultInPort: "T",
      defaultOutPort: "T",
    }),

    terminal: () => ({
      kind: "terminal",
      description: "Borne de Passagem / Conexão em Régua",
      terminals: [
        mkTerm("1", "Entrada Borne", "power", "in", "T", true, "any"),
        mkTerm("2", "Saída Borne", "power", "out", "B", true, "any"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    ccm: () => ({
      kind: "ccm",
      description: "Centro de Controle de Motores (CCM)",
      terminals: [
        mkTerm("IN", "Entrada Força Principal", "power", "in", "T", true, "3F+N"),
        mkTerm("OUT1", "Gaveta 1", "power", "out", "B", false, "3F"),
        mkTerm("OUT2", "Gaveta 2", "power", "out", "B", false, "3F"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    capacitor_bank: () => ({
      kind: "capacitor_bank",
      description: "Banco de Capacitores para Correção de Fator de Potência",
      terminals: [
        mkTerm("1/L1", "Terminal Fase L1", "power", "in", "T", true, "L1"),
        mkTerm("2/L2", "Terminal Fase L2", "power", "in", "T", true, "L2"),
        mkTerm("3/L3", "Terminal Fase L3", "power", "in", "T", true, "L3"),
        mkTerm("PE", "Aterramento Carcaça", "protection", "in", "B", true, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    generator: () => ({
      kind: "generator",
      description: "Grupo Gerador Diesel (GMG)",
      terminals: [
        mkTerm("U", "Gerador Fase U", "power", "out", "B", true, "L1"),
        mkTerm("V", "Gerador Fase V", "power", "out", "B", true, "L2"),
        mkTerm("W", "Gerador Fase W", "power", "out", "B", true, "L3"),
        mkTerm("N", "Gerador Neutro", "power", "out", "B", true, "N"),
        mkTerm("PE", "Aterramento do Neutro e Carcaça", "protection", "out", "T", true, "PE"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    pt100: () => ({
      kind: "pt100",
      description: "Termorresistência PT100",
      terminals: [
        mkTerm("1", "Sinal +", "signal", "out", "T", true, "signal"),
        mkTerm("2", "Sinal -", "signal", "out", "B", true, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    pressure: () => ({
      kind: "pressure",
      description: "Transmissor de Pressão 4-20mA",
      terminals: [
        mkTerm("+", "Loop 24V", "signal", "in", "T", true, "signal"),
        mkTerm("-", "Sinal 4-20mA", "signal", "out", "B", true, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    flow: () => ({
      kind: "flow",
      description: "Medidor de Vazão Eletromagnético",
      terminals: [
        mkTerm("PWR", "Alimentação", "control", "in", "T", true, "any"),
        mkTerm("SIG", "Sinal Pulso/Analógico", "signal", "out", "B", true, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    level: () => ({
      kind: "level",
      description: "Transmissor de Nível Ultrassônico",
      terminals: [
        mkTerm("PWR", "Alimentação 24V", "control", "in", "T", true, "any"),
        mkTerm("OUT", "Saída 4-20mA", "signal", "out", "B", true, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),

    encoder: () => ({
      kind: "encoder",
      description: "Encoder Incremental",
      terminals: [
        mkTerm("VCC", "Alimentação VCC", "control", "in", "T", true, "any"),
        mkTerm("A", "Canal A", "signal", "out", "B", true, "signal"),
        mkTerm("B", "Canal B", "signal", "out", "B", true, "signal"),
        mkTerm("Z", "Canal Z (Zero)", "signal", "out", "B", false, "signal"),
      ],
      defaultInPort: "T",
      defaultOutPort: "B",
    }),
  };

export function getEquipmentTerminalProfile(
  kind: NodeKind,
  params?: NodeParams,
): EquipmentTerminalProfile {
  const factory = TERMINAL_LIBRARY[kind];
  if (factory) {
    return factory(params);
  }
  // Generic fallback
  return {
    kind,
    description: `Equipamento ${kind}`,
    terminals: [
      mkTerm("in", "Entrada", "power", "in", "T", true),
      mkTerm("out", "Saída", "power", "out", "B", true),
    ],
    defaultInPort: "T",
    defaultOutPort: "B",
  };
}

export function getCanonicalTerminalsForEquipment(
  equipmentId: string,
  kind: NodeKind,
  params?: NodeParams,
): CanonicalTerminal[] {
  const profile = getEquipmentTerminalProfile(kind, params);
  return profile.terminals.map((t) => ({
    id: `${equipmentId}:${t.code}`,
    code: t.code,
    kind: mapNatureAndPhaseToCanonicalTerminalKind(t.nature, t.phase),
    direction: t.direction,
  }));
}

function mapNatureAndPhaseToCanonicalTerminalKind(
  nature: ElectricalNature,
  phase?: ElectricalPhase,
): CanonicalTerminal["kind"] {
  if (nature === "protection" || phase === "PE") return "PE";
  if (phase === "N") return "N";
  if (phase === "L1") return "L1";
  if (phase === "L2") return "L2";
  if (phase === "L3") return "L3";
  if (nature === "control") return "control_supply";
  if (nature === "signal") return "analog";
  return "L1";
}
