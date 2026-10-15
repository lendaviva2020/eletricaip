import type { ParamSpec } from "@/lib/palette/component-catalog";

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
  /** Se true, suportado nativamente no grid matricial de rungs e executado pelo scan-core. */
  supported?: boolean;
  /** Nota de status caso o elemento seja roadmap / planejado. */
  statusNote?: string;
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
  supported: boolean = false,
  statusNote?: string,
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
  supported,
  statusNote: supported ? undefined : (statusNote ?? "Em Breve (Q1)"),
});

export const LADDER_ELEMENTS: LadderElement[] = [
  // ── Contatos ─────────────────────────────────────────────────────────────
  element(
    "XIC",
    "Contatos",
    "Contato NA",
    "--| |--",
    "Passa energia quando bit = TRUE.",
    {},
    "XIC",
    true,
  ),
  element(
    "XIO",
    "Contatos",
    "Contato NF",
    "--|/|--",
    "Passa energia quando bit = FALSE.",
    {},
    "XIO",
    true,
  ),
  element(
    "R_TRIG",
    "Contatos",
    "Borda positiva",
    "--|P|--",
    "TRUE por 1 scan na transicao 0-1.",
    {},
    "ONS",
    false,
    "Em Breve (Q1)",
  ),
  element(
    "F_TRIG",
    "Contatos",
    "Borda negativa",
    "--|N|--",
    "TRUE por 1 scan na transicao 1-0.",
    {},
    "OSF",
    false,
    "Em Breve (Q1)",
  ),

  // ── Bobinas ──────────────────────────────────────────────────────────────
  element("OTE", "Bobinas", "Bobina simples", "--( )", "Nao retentiva; segue o rung.", {}, "OTE", true),
  element("OTL", "Bobinas", "Set Latch", "--(S)", "Retentiva; liga e mantem estado.", {}, "OTL", true),
  element("OTU", "Bobinas", "Reset Unlatch", "--(R)", "Retentiva; desliga o bit.", {}, "OTU", true),
  element("SR", "Bobinas", "Set/Reset", "--(SR)", "Flip-flop SR combinado.", {}, undefined, false, "Em Breve (Q1)"),
  element("NEG_COIL", "Bobinas", "Bobina negada", "--(/)", "Escreve o inverso do rung.", {}, undefined, false, "Em Breve (Q1)"),
  element("RET_COIL", "Bobinas", "Bobina retentiva", "--(M)", "Mantem valor apos desligamento.", {}, undefined, false, "Em Breve (Q1)"),

  // ── Temporizadores ───────────────────────────────────────────────────────
  element("TON", "Temporizadores", "TON On Delay", "[TON]", "Atraso na ligacao.", {
    PT: param("PT", "Preset time", 1000, "ms"),
  }, undefined, true),
  element("TOF", "Temporizadores", "TOF Off Delay", "[TOF]", "Atraso no desligamento.", {
    PT: param("PT", "Preset time", 1000, "ms"),
  }, undefined, true),
  element("TP", "Temporizadores", "TP Pulse", "[TP]", "Pulso de duracao fixa.", {
    PT: param("PT", "Preset time", 500, "ms"),
  }, undefined, true),
  element("TONR", "Temporizadores", "TONR Retentivo", "[TONR]", "Temporizador acumulativo.", {
    PT: param("PT", "Preset time", 1000, "ms"),
  }, undefined, false, "Em Breve (Q1)"),

  // ── Contadores ───────────────────────────────────────────────────────────
  element("CTU", "Contadores", "CTU Up Counter", "[CTU]", "Contagem crescente.", {
    PV: param("PV", "Preset value", 10),
  }, undefined, true),
  element("CTD", "Contadores", "CTD Down Counter", "[CTD]", "Contagem decrescente.", {
    PV: param("PV", "Preset value", 10),
  }, undefined, false, "Em Breve (Q1)"),
  element("CTUD", "Contadores", "CTUD Up/Down", "[CTUD]", "Contagem bidirecional.", {
    PV: param("PV", "Preset value", 10),
  }, undefined, false, "Em Breve (Q1)"),

  // ── Comparação (Planejado Q1 - Use FBD/ST) ─────────────────────────────────
  element("GT", "Comparacao", "Greater Than", "[ > ]", "TRUE se IN1 > IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("LT", "Comparacao", "Less Than", "[ < ]", "TRUE se IN1 < IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("GE", "Comparacao", "Greater Equal", "[ >= ]", "TRUE se IN1 >= IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("LE", "Comparacao", "Less Equal", "[ <= ]", "TRUE se IN1 <= IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("EQ", "Comparacao", "Equal", "[ == ]", "TRUE se IN1 = IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("NE", "Comparacao", "Not Equal", "[ != ]", "TRUE se IN1 != IN2.", {}, undefined, false, "Em Breve (Q1)"),

  // ── Blocos Matemáticos (Planejado Q1 - Use FBD/ST) ────────────────────────
  element("ADD", "Blocos Matematicos", "ADD", "[ + ]", "OUT = IN1 + IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("SUB", "Blocos Matematicos", "SUB", "[ - ]", "OUT = IN1 - IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("MUL", "Blocos Matematicos", "MUL", "[ * ]", "OUT = IN1 * IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("DIV", "Blocos Matematicos", "DIV", "[ / ]", "OUT = IN1 / IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("MOD", "Blocos Matematicos", "MOD", "[MOD]", "OUT = resto de IN1 / IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("SQRT", "Blocos Matematicos", "SQRT", "[SQRT]", "OUT = raiz quadrada de IN.", {}, undefined, false, "Em Breve (Q1)"),
  element("ABS", "Blocos Matematicos", "ABS", "[ABS]", "OUT = valor absoluto de IN.", {}, undefined, false, "Em Breve (Q1)"),

  // ── Blocos Lógicos (Planejado Q1 - Use FBD/ST) ────────────────────────────
  element("AND", "Blocos Logicos", "AND", "[ & ]", "OUT = IN1 AND IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("OR", "Blocos Logicos", "OR", "[ OR ]", "OUT = IN1 OR IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("XOR", "Blocos Logicos", "XOR", "[=1]", "OUT = IN1 XOR IN2.", {}, undefined, false, "Em Breve (Q1)"),
  element("NOT", "Blocos Logicos", "NOT", "[NOT]", "OUT = NOT IN.", {}, undefined, false, "Em Breve (Q1)"),

  // ── Movimentação ─────────────────────────────────────────────────────────
  element("MOVE", "Movimentacao", "MOVE", "[MOVE]", "Copia IN para OUT.", {}, undefined, false, "Em Breve (Q1)"),
  element("INT_TO_REAL", "Movimentacao", "INT_TO_REAL", "[IR]", "Converte INT para REAL.", {}, undefined, false, "Em Breve (Q1)"),
  element("REAL_TO_INT", "Movimentacao", "REAL_TO_INT", "[RI]", "Converte REAL para INT.", {}, undefined, false, "Em Breve (Q1)"),

  // ── Trilhos ──────────────────────────────────────────────────────────────
  element("LEFT_RAIL", "Trilhos", "Trilho esquerdo", "|", "Fornece energia sempre ON.", {}, undefined, false, "Em Breve (Q1)"),
  element("RIGHT_RAIL", "Trilhos", "Trilho direito", "|", "Fecha o circuito neutro.", {}, undefined, false, "Em Breve (Q1)"),

  // ── Controle ─────────────────────────────────────────────────────────────
  element("JMP", "Controle", "Jump", "(JMP)", "Salta para um label.", {}, undefined, false, "Em Breve (Q1)"),
  element("LBL", "Controle", "Label", "[LBL]", "Destino de um jump.", {}, undefined, false, "Em Breve (Q1)"),
  element("MCR", "Controle", "Master Control Relay", "(MCR)", "Habilita/desabilita uma zona.", {}, undefined, false, "Em Breve (Q1)"),
  element("RET", "Controle", "Return", "(RET)", "Retorna de uma subrotina.", {}, undefined, false, "Em Breve (Q1)"),
];

export const LADDER_ELEMENTS_BY_ID = Object.fromEntries(
  LADDER_ELEMENTS.map((item) => [item.id, item]),
) as Record<string, LadderElement>;

/** Retorna apenas os elementos com execução comprovada no scan-core atual. */
export const SUPPORTED_LADDER_ELEMENTS = LADDER_ELEMENTS.filter((e) => e.supported === true);
