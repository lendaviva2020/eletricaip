import type { ParamSpec } from "@/lib/voltai/component-definitions";

export type LadderCategory =
  | "Contatos"
  | "Bobinas"
  | "Temporizadores"
  | "Contadores"
  | "Comparacao"
  | "Blocos Matematicos"
  | "Blocos Logicos"
  | "Movimentacao"
  | "Trilhos"
  | "Controle";

export interface LadderElement {
  id: string;
  type: string;
  category: LadderCategory;
  label: string;
  description: string;
  allenBradley?: string;
  params: Record<string, ParamSpec>;
  inputs: number;
  outputs: number;
  symbol: string;
}

const param = (
  key: string,
  label: string,
  defaultValue: number | boolean | string,
  unit?: string,
): ParamSpec => ({
  key,
  label,
  type: typeof defaultValue === "number" ? (unit === "ms" ? "time" : "number") : "select",
  defaultValue,
  unit,
  min: typeof defaultValue === "number" ? 0 : undefined,
});

const element = (
  id: string,
  category: LadderCategory,
  label: string,
  symbol: string,
  description: string,
  params: Record<string, ParamSpec> = {},
  allenBradley?: string,
): LadderElement => ({
  id,
  type: id,
  category,
  label,
  description,
  allenBradley,
  params,
  inputs: category === "Trilhos" && id === "RIGHT_RAIL" ? 1 : 1,
  outputs: category === "Trilhos" && id === "RIGHT_RAIL" ? 0 : 1,
  symbol,
});

export const LADDER_ELEMENTS: LadderElement[] = [
  element(
    "XIC",
    "Contatos",
    "Contato NA",
    "--| |--",
    "Passa energia quando bit = TRUE.",
    {},
    "XIC",
  ),
  element(
    "XIO",
    "Contatos",
    "Contato NF",
    "--|/|--",
    "Passa energia quando bit = FALSE.",
    {},
    "XIO",
  ),
  element(
    "R_TRIG",
    "Contatos",
    "Borda positiva",
    "--|P|--",
    "TRUE por 1 scan na transicao 0-1.",
    {},
    "ONS",
  ),
  element(
    "F_TRIG",
    "Contatos",
    "Borda negativa",
    "--|N|--",
    "TRUE por 1 scan na transicao 1-0.",
    {},
    "OSF",
  ),
  element("OTE", "Bobinas", "Bobina simples", "--( )", "Nao retentiva; segue o rung.", {}, "OTE"),
  element("OTL", "Bobinas", "Set Latch", "--(S)", "Retentiva; liga e mantem estado.", {}, "OTL"),
  element("OTU", "Bobinas", "Reset Unlatch", "--(R)", "Retentiva; desliga o bit.", {}, "OTU"),
  element("SR", "Bobinas", "Set/Reset", "--(SR)", "Flip-flop SR combinado."),
  element("NEG_COIL", "Bobinas", "Bobina negada", "--(/)", "Escreve o inverso do rung."),
  element("RET_COIL", "Bobinas", "Bobina retentiva", "--(M)", "Mantem valor apos desligamento."),
  element("TON", "Temporizadores", "TON On Delay", "[TON]", "Atraso na ligacao.", {
    PT: param("PT", "Preset time", 1000, "ms"),
  }),
  element("TOF", "Temporizadores", "TOF Off Delay", "[TOF]", "Atraso no desligamento.", {
    PT: param("PT", "Preset time", 1000, "ms"),
  }),
  element("TP", "Temporizadores", "TP Pulse", "[TP]", "Pulso de duracao fixa.", {
    PT: param("PT", "Preset time", 500, "ms"),
  }),
  element("TONR", "Temporizadores", "TONR Retentivo", "[TONR]", "Temporizador acumulativo.", {
    PT: param("PT", "Preset time", 1000, "ms"),
  }),
  element("CTU", "Contadores", "CTU Up Counter", "[CTU]", "Contagem crescente.", {
    PV: param("PV", "Preset value", 10),
  }),
  element("CTD", "Contadores", "CTD Down Counter", "[CTD]", "Contagem decrescente.", {
    PV: param("PV", "Preset value", 10),
  }),
  element("CTUD", "Contadores", "CTUD Up/Down", "[CTUD]", "Contagem bidirecional.", {
    PV: param("PV", "Preset value", 10),
  }),
  element("GT", "Comparacao", "Greater Than", "[ > ]", "TRUE se IN1 > IN2."),
  element("LT", "Comparacao", "Less Than", "[ < ]", "TRUE se IN1 < IN2."),
  element("GE", "Comparacao", "Greater Equal", "[ >= ]", "TRUE se IN1 >= IN2."),
  element("LE", "Comparacao", "Less Equal", "[ <= ]", "TRUE se IN1 <= IN2."),
  element("EQ", "Comparacao", "Equal", "[ == ]", "TRUE se IN1 = IN2."),
  element("NE", "Comparacao", "Not Equal", "[ != ]", "TRUE se IN1 != IN2."),
  element("ADD", "Blocos Matematicos", "ADD", "[ + ]", "OUT = IN1 + IN2."),
  element("SUB", "Blocos Matematicos", "SUB", "[ - ]", "OUT = IN1 - IN2."),
  element("MUL", "Blocos Matematicos", "MUL", "[ * ]", "OUT = IN1 * IN2."),
  element("DIV", "Blocos Matematicos", "DIV", "[ / ]", "OUT = IN1 / IN2."),
  element("MOD", "Blocos Matematicos", "MOD", "[MOD]", "OUT = resto de IN1 / IN2."),
  element("SQRT", "Blocos Matematicos", "SQRT", "[SQRT]", "OUT = raiz quadrada de IN."),
  element("ABS", "Blocos Matematicos", "ABS", "[ABS]", "OUT = valor absoluto de IN."),
  element("AND", "Blocos Logicos", "AND", "[ & ]", "OUT = IN1 AND IN2."),
  element("OR", "Blocos Logicos", "OR", "[ OR ]", "OUT = IN1 OR IN2."),
  element("XOR", "Blocos Logicos", "XOR", "[=1]", "OUT = IN1 XOR IN2."),
  element("NOT", "Blocos Logicos", "NOT", "[NOT]", "OUT = NOT IN."),
  element("MOVE", "Movimentacao", "MOVE", "[MOVE]", "Copia IN para OUT."),
  element("INT_TO_REAL", "Movimentacao", "INT_TO_REAL", "[IR]", "Converte INT para REAL."),
  element("REAL_TO_INT", "Movimentacao", "REAL_TO_INT", "[RI]", "Converte REAL para INT."),
  element("LEFT_RAIL", "Trilhos", "Trilho esquerdo", "|", "Fornece energia sempre ON."),
  element("RIGHT_RAIL", "Trilhos", "Trilho direito", "|", "Fecha o circuito neutro."),
  element("JMP", "Controle", "Jump", "(JMP)", "Salta para um label."),
  element("LBL", "Controle", "Label", "[LBL]", "Destino de um jump."),
  element("MCR", "Controle", "Master Control Relay", "(MCR)", "Habilita/desabilita uma zona."),
  element("RET", "Controle", "Return", "(RET)", "Retorna de uma subrotina."),
];

export const LADDER_ELEMENTS_BY_ID = Object.fromEntries(
  LADDER_ELEMENTS.map((item) => [item.id, item]),
) as Record<string, LadderElement>;
