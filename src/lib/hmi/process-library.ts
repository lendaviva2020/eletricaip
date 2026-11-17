/**
 * Biblioteca de equipamentos de processo para o editor HMI (2D, ISA-101/ISA-5.1
 * como referência de forma; desenho próprio).
 *
 * Cada equipamento declara: categoria, tamanho padrão, PORTAS (onde se liga
 * tubulação/transporte/cabo, com o meio aceito e o sentido) e as OPERAÇÕES que
 * aceita no modo Operar (liga/desliga, reversão, velocidade, abrir/fechar).
 * As portas usam frações (0..1) do tamanho para acompanhar redimensionamento.
 */
import { z } from "zod";

export const MEDIA = [
  "agua",
  "oleo",
  "vapor",
  "condensado",
  "esgoto",
  "ar",
  "gas",
  "produto",
  "farinha",
  "graos",
  "energia",
  "sinal",
] as const;
export type Medium = (typeof MEDIA)[number];

export const MEDIUM_LABEL: Record<Medium, string> = {
  agua: "Água",
  oleo: "Óleo",
  vapor: "Vapor",
  condensado: "Condensado",
  esgoto: "Esgoto",
  ar: "Ar",
  gas: "Gás",
  produto: "Produto",
  farinha: "Farinha",
  graos: "Grãos",
  energia: "Energia elétrica",
  sinal: "Sinal",
};

/** Cores de meio (convenção usual de identificação de tubulações). */
export const MEDIUM_COLOR: Record<Medium, string> = {
  agua: "#38bdf8",
  oleo: "#b45309",
  vapor: "#e5e7eb",
  condensado: "#a5b4fc",
  esgoto: "#78716c",
  ar: "#93c5fd",
  gas: "#facc15",
  produto: "#f97316",
  farinha: "#fde68a",
  graos: "#d97706",
  energia: "#22c55e",
  sinal: "#a78bfa",
};

export const OPERATIONS = ["run", "reverse", "speed", "open", "level"] as const;
export type Operation = (typeof OPERATIONS)[number];

export type PortSide = "left" | "right" | "top" | "bottom";

export interface PortDef {
  readonly id: string;
  readonly label: string;
  readonly side: PortSide;
  /** Posição ao longo do lado (0 = início, 1 = fim). */
  readonly at: number;
  readonly dir: "in" | "out" | "both";
  readonly media: readonly Medium[];
}

export const CATEGORIES = [
  "Transporte de sólidos",
  "Bombas e ventilação",
  "Tanques e silos",
  "Tubulações e válvulas",
  "Térmico e vapor",
  "Processo (óleo e farinha)",
  "Saneamento",
  "Elétrico",
  "Instrumentos",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface EquipmentDef {
  readonly type: string;
  readonly label: string;
  readonly category: Category;
  /** Prefixo da tag sugerida (ISA/IEC 81346 simplificado). */
  readonly tagPrefix: string;
  readonly w: number;
  readonly h: number;
  readonly ports: readonly PortDef[];
  readonly ops: readonly Operation[];
  readonly keywords?: readonly string[];
}

const solids: readonly Medium[] = ["produto", "farinha", "graos"];
const liquids: readonly Medium[] = ["agua", "oleo", "condensado", "esgoto", "produto"];
const pin = (
  side: PortSide,
  at: number,
  dir: PortDef["dir"],
  media: readonly Medium[],
  id?: string,
  label?: string,
): PortDef => ({
  id: id ?? (dir === "in" ? "entrada" : dir === "out" ? "saida" : `${side}`),
  label: label ?? (dir === "in" ? "Entrada" : dir === "out" ? "Saída" : "Conexão"),
  side,
  at,
  dir,
  media,
});
const power = pin("top", 0.5, "in", ["energia"], "energia", "Alimentação");

const E = (d: EquipmentDef) => d;

export const EQUIPMENT_LIBRARY: readonly EquipmentDef[] = [
  // ── Transporte de sólidos ────────────────────────────────────────────
  E({
    type: "rosca",
    label: "Rosca transportadora",
    category: "Transporte de sólidos",
    tagPrefix: "RT",
    w: 220,
    h: 60,
    ports: [pin("top", 0.12, "in", solids), pin("bottom", 0.9, "out", solids), power],
    ops: ["run", "reverse", "speed"],
    keywords: ["helicoide", "parafuso"],
  }),
  E({
    type: "esteira",
    label: "Esteira transportadora",
    category: "Transporte de sólidos",
    tagPrefix: "TC",
    w: 240,
    h: 50,
    ports: [pin("left", 0.4, "in", solids), pin("right", 0.4, "out", solids), power],
    ops: ["run", "reverse", "speed"],
    keywords: ["correia", "transportador"],
  }),
  E({
    type: "elevador_canecas",
    label: "Elevador de canecas",
    category: "Transporte de sólidos",
    tagPrefix: "EC",
    w: 70,
    h: 220,
    ports: [
      pin("bottom", 0.3, "in", solids),
      pin("top", 0.8, "out", solids),
      pin("left", 0.1, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "redler",
    label: "Transportador de corrente (redler)",
    category: "Transporte de sólidos",
    tagPrefix: "TR",
    w: 240,
    h: 50,
    ports: [pin("top", 0.1, "in", solids), pin("bottom", 0.9, "out", solids), power],
    ops: ["run", "reverse", "speed"],
  }),
  E({
    type: "moega",
    label: "Moega",
    category: "Transporte de sólidos",
    tagPrefix: "MG",
    w: 140,
    h: 130,
    ports: [pin("top", 0.5, "in", solids), pin("bottom", 0.5, "out", solids)],
    ops: ["level"],
    keywords: ["tremonha", "funil"],
  }),
  E({
    type: "dosador",
    label: "Balança/dosador",
    category: "Transporte de sólidos",
    tagPrefix: "BD",
    w: 120,
    h: 80,
    ports: [
      pin("top", 0.5, "in", solids),
      pin("bottom", 0.5, "out", solids),
      pin("left", 0.2, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "valvula_rotativa",
    label: "Válvula rotativa (eclusa)",
    category: "Transporte de sólidos",
    tagPrefix: "VR",
    w: 70,
    h: 70,
    ports: [
      pin("top", 0.5, "in", solids),
      pin("bottom", 0.5, "out", solids),
      pin("left", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  // ── Bombas e ventilação ──────────────────────────────────────────────
  E({
    type: "bomba",
    label: "Bomba centrífuga",
    category: "Bombas e ventilação",
    tagPrefix: "B",
    w: 80,
    h: 80,
    ports: [
      pin("left", 0.65, "in", liquids),
      pin("top", 0.2, "out", liquids),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "bomba_engrenagem",
    label: "Bomba de engrenagens (óleo)",
    category: "Bombas e ventilação",
    tagPrefix: "BE",
    w: 90,
    h: 70,
    ports: [
      pin("left", 0.5, "in", ["oleo", "produto"]),
      pin("right", 0.5, "out", ["oleo", "produto"]),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "reverse", "speed"],
  }),
  E({
    type: "bomba_dosadora",
    label: "Bomba dosadora",
    category: "Bombas e ventilação",
    tagPrefix: "BD",
    w: 70,
    h: 70,
    ports: [
      pin("left", 0.5, "in", liquids),
      pin("right", 0.5, "out", liquids),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "exaustor",
    label: "Exaustor",
    category: "Bombas e ventilação",
    tagPrefix: "EX",
    w: 100,
    h: 100,
    ports: [
      pin("left", 0.5, "in", ["ar", "gas", "vapor"]),
      pin("top", 0.5, "out", ["ar", "gas", "vapor"]),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "reverse", "speed"],
    keywords: ["ventilador", "fan"],
  }),
  E({
    type: "ventilador",
    label: "Ventilador",
    category: "Bombas e ventilação",
    tagPrefix: "VT",
    w: 100,
    h: 100,
    ports: [
      pin("left", 0.5, "in", ["ar"]),
      pin("right", 0.5, "out", ["ar"]),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "reverse", "speed"],
  }),
  E({
    type: "soprador",
    label: "Soprador",
    category: "Bombas e ventilação",
    tagPrefix: "SP",
    w: 110,
    h: 80,
    ports: [
      pin("left", 0.5, "in", ["ar"]),
      pin("right", 0.5, "out", ["ar", "produto", "farinha"]),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "compressor",
    label: "Compressor de ar",
    category: "Bombas e ventilação",
    tagPrefix: "CP",
    w: 130,
    h: 90,
    ports: [
      pin("right", 0.4, "out", ["ar"]),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run"],
  }),
  // ── Tanques e silos ──────────────────────────────────────────────────
  E({
    type: "tanque",
    label: "Tanque vertical",
    category: "Tanques e silos",
    tagPrefix: "TQ",
    w: 110,
    h: 160,
    ports: [
      pin("top", 0.5, "in", liquids),
      pin("bottom", 0.5, "out", liquids),
      pin("right", 0.2, "both", liquids, "lateral", "Lateral"),
    ],
    ops: ["level"],
  }),
  E({
    type: "tanque_horizontal",
    label: "Tanque horizontal",
    category: "Tanques e silos",
    tagPrefix: "TH",
    w: 200,
    h: 100,
    ports: [pin("top", 0.2, "in", liquids), pin("bottom", 0.8, "out", liquids)],
    ops: ["level"],
  }),
  E({
    type: "tanque_oleo",
    label: "Tanque de óleo",
    category: "Tanques e silos",
    tagPrefix: "TO",
    w: 120,
    h: 160,
    ports: [pin("top", 0.5, "in", ["oleo"]), pin("bottom", 0.5, "out", ["oleo"])],
    ops: ["level"],
  }),
  E({
    type: "tanque_condensado",
    label: "Tanque de condensado",
    category: "Tanques e silos",
    tagPrefix: "TCD",
    w: 160,
    h: 100,
    ports: [
      pin("top", 0.3, "in", ["condensado", "vapor"]),
      pin("bottom", 0.7, "out", ["condensado", "agua"]),
    ],
    ops: ["level"],
  }),
  E({
    type: "reservatorio",
    label: "Reservatório de água",
    category: "Tanques e silos",
    tagPrefix: "RA",
    w: 180,
    h: 120,
    ports: [pin("top", 0.5, "in", ["agua"]), pin("bottom", 0.5, "out", ["agua"])],
    ops: ["level"],
  }),
  E({
    type: "silo",
    label: "Silo",
    category: "Tanques e silos",
    tagPrefix: "SL",
    w: 120,
    h: 200,
    ports: [pin("top", 0.5, "in", solids), pin("bottom", 0.5, "out", solids)],
    ops: ["level"],
  }),
  // ── Tubulações e válvulas ────────────────────────────────────────────
  E({
    type: "valvula_manual",
    label: "Válvula manual",
    category: "Tubulações e válvulas",
    tagPrefix: "VM",
    w: 60,
    h: 40,
    ports: [
      pin("left", 0.5, "in", liquids.concat(["vapor", "ar", "gas"])),
      pin("right", 0.5, "out", liquids.concat(["vapor", "ar", "gas"])),
    ],
    ops: ["open"],
  }),
  E({
    type: "valvula_motorizada",
    label: "Válvula motorizada",
    category: "Tubulações e válvulas",
    tagPrefix: "XV",
    w: 60,
    h: 70,
    ports: [
      pin("left", 0.75, "in", liquids.concat(["vapor", "ar", "gas"])),
      pin("right", 0.75, "out", liquids.concat(["vapor", "ar", "gas"])),
      pin("top", 0.5, "in", ["energia", "sinal"], "atuador", "Atuador"),
    ],
    ops: ["open"],
  }),
  E({
    type: "valvula_controle",
    label: "Válvula de controle",
    category: "Tubulações e válvulas",
    tagPrefix: "FV",
    w: 60,
    h: 70,
    ports: [
      pin("left", 0.75, "in", liquids.concat(["vapor", "gas"])),
      pin("right", 0.75, "out", liquids.concat(["vapor", "gas"])),
      pin("top", 0.5, "in", ["sinal"], "atuador", "Atuador"),
    ],
    ops: ["open", "speed"],
  }),
  E({
    type: "valvula_retencao",
    label: "Válvula de retenção",
    category: "Tubulações e válvulas",
    tagPrefix: "VRT",
    w: 60,
    h: 40,
    ports: [pin("left", 0.5, "in", liquids), pin("right", 0.5, "out", liquids)],
    ops: [],
  }),
  E({
    type: "filtro_linha",
    label: "Filtro de linha (Y)",
    category: "Tubulações e válvulas",
    tagPrefix: "FL",
    w: 70,
    h: 50,
    ports: [
      pin("left", 0.4, "in", liquids.concat(["vapor"])),
      pin("right", 0.4, "out", liquids.concat(["vapor"])),
    ],
    ops: [],
  }),
  E({
    type: "juncao",
    label: "Junção/derivação",
    category: "Tubulações e válvulas",
    tagPrefix: "JN",
    w: 30,
    h: 30,
    ports: [
      pin("left", 0.5, "both", MEDIA, "a", "A"),
      pin("right", 0.5, "both", MEDIA, "b", "B"),
      pin("top", 0.5, "both", MEDIA, "c", "C"),
      pin("bottom", 0.5, "both", MEDIA, "d", "D"),
    ],
    ops: [],
  }),
  // ── Térmico e vapor ──────────────────────────────────────────────────
  E({
    type: "caldeira",
    label: "Caldeira",
    category: "Térmico e vapor",
    tagPrefix: "CA",
    w: 200,
    h: 140,
    ports: [
      pin("left", 0.7, "in", ["agua", "condensado"], "agua", "Água de alimentação"),
      pin("top", 0.8, "out", ["vapor"], "vapor", "Vapor"),
      pin("left", 0.2, "in", ["gas", "oleo"], "combustivel", "Combustível"),
      pin("right", 0.8, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run"],
  }),
  E({
    type: "trocador_calor",
    label: "Trocador de calor",
    category: "Térmico e vapor",
    tagPrefix: "TC",
    w: 180,
    h: 70,
    ports: [
      pin("left", 0.5, "in", liquids, "entrada", "Entrada produto"),
      pin("right", 0.5, "out", liquids, "saida", "Saída produto"),
      pin("top", 0.2, "in", ["vapor", "agua"], "quente", "Entrada fluido térmico"),
      pin("bottom", 0.8, "out", ["condensado", "agua"], "retorno", "Retorno"),
    ],
    ops: [],
  }),
  E({
    type: "purgador",
    label: "Purgador de vapor",
    category: "Térmico e vapor",
    tagPrefix: "PG",
    w: 50,
    h: 50,
    ports: [
      pin("left", 0.5, "in", ["vapor", "condensado"]),
      pin("right", 0.5, "out", ["condensado"]),
    ],
    ops: [],
  }),
  E({
    type: "condensador",
    label: "Condensador",
    category: "Térmico e vapor",
    tagPrefix: "CD",
    w: 160,
    h: 90,
    ports: [
      pin("top", 0.3, "in", ["vapor"]),
      pin("bottom", 0.7, "out", ["condensado"]),
      pin("left", 0.7, "in", ["agua"], "agua", "Água de resfriamento"),
    ],
    ops: [],
  }),
  E({
    type: "torre_resfriamento",
    label: "Torre de resfriamento",
    category: "Térmico e vapor",
    tagPrefix: "TRF",
    w: 140,
    h: 170,
    ports: [
      pin("top", 0.2, "in", ["agua"]),
      pin("bottom", 0.5, "out", ["agua"]),
      pin("top", 0.8, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "secador",
    label: "Secador rotativo",
    category: "Térmico e vapor",
    tagPrefix: "SC",
    w: 240,
    h: 90,
    ports: [
      pin("left", 0.3, "in", solids),
      pin("right", 0.7, "out", solids),
      pin("top", 0.5, "in", ["vapor", "ar", "gas"], "calor", "Calor"),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "reverse", "speed"],
  }),
  // ── Processo (óleo e farinha) ────────────────────────────────────────
  E({
    type: "cozinhador",
    label: "Cozinhador/digestor",
    category: "Processo (óleo e farinha)",
    tagPrefix: "CZ",
    w: 220,
    h: 100,
    ports: [
      pin("left", 0.4, "in", ["produto"]),
      pin("right", 0.6, "out", ["produto"]),
      pin("top", 0.6, "in", ["vapor"], "vapor", "Vapor"),
      pin("bottom", 0.3, "out", ["condensado"], "condensado", "Condensado"),
      pin("bottom", 0.8, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "reverse", "speed"],
  }),
  E({
    type: "prensa",
    label: "Prensa de rosca",
    category: "Processo (óleo e farinha)",
    tagPrefix: "PR",
    w: 230,
    h: 90,
    ports: [
      pin("left", 0.4, "in", ["produto"]),
      pin("right", 0.5, "out", ["produto", "farinha"], "torta", "Torta"),
      pin("bottom", 0.4, "out", ["oleo"], "oleo", "Licor/óleo"),
      pin("top", 0.8, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
    keywords: ["extrusora", "expeller"],
  }),
  E({
    type: "decanter",
    label: "Decanter (centrífuga)",
    category: "Processo (óleo e farinha)",
    tagPrefix: "DC",
    w: 200,
    h: 80,
    ports: [
      pin("left", 0.5, "in", ["oleo", "produto"]),
      pin("right", 0.3, "out", ["oleo"], "oleo", "Óleo"),
      pin("bottom", 0.7, "out", ["produto"], "solidos", "Sólidos"),
      pin("top", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "speed"],
  }),
  E({
    type: "separador",
    label: "Separador centrífugo (polidor)",
    category: "Processo (óleo e farinha)",
    tagPrefix: "SE",
    w: 100,
    h: 130,
    ports: [
      pin("top", 0.5, "in", ["oleo"]),
      pin("right", 0.6, "out", ["oleo"], "oleo", "Óleo"),
      pin("left", 0.6, "out", ["agua", "esgoto"], "agua", "Água"),
      pin("bottom", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run"],
  }),
  E({
    type: "moinho",
    label: "Moinho de martelos",
    category: "Processo (óleo e farinha)",
    tagPrefix: "MO",
    w: 120,
    h: 110,
    ports: [
      pin("top", 0.5, "in", solids),
      pin("bottom", 0.5, "out", ["farinha", "produto"]),
      pin("left", 0.5, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run"],
  }),
  E({
    type: "peneira",
    label: "Peneira vibratória",
    category: "Processo (óleo e farinha)",
    tagPrefix: "PN",
    w: 180,
    h: 70,
    ports: [
      pin("left", 0.3, "in", solids),
      pin("right", 0.6, "out", solids, "fino", "Finos"),
      pin("bottom", 0.8, "out", solids, "grosso", "Grossos"),
      pin("top", 0.8, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run"],
  }),
  E({
    type: "misturador",
    label: "Misturador/agitador",
    category: "Processo (óleo e farinha)",
    tagPrefix: "AG",
    w: 130,
    h: 150,
    ports: [
      pin("top", 0.3, "in", liquids.concat(solids)),
      pin("bottom", 0.5, "out", liquids.concat(solids)),
      pin("top", 0.75, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "reverse", "speed", "level"],
  }),
  E({
    type: "filtro_prensa",
    label: "Filtro prensa",
    category: "Processo (óleo e farinha)",
    tagPrefix: "FP",
    w: 200,
    h: 90,
    ports: [
      pin("left", 0.5, "in", ["oleo", "produto"]),
      pin("right", 0.3, "out", ["oleo"]),
      pin("bottom", 0.7, "out", ["produto"], "torta", "Torta"),
    ],
    ops: [],
  }),
  E({
    type: "ciclone",
    label: "Ciclone",
    category: "Processo (óleo e farinha)",
    tagPrefix: "CI",
    w: 90,
    h: 160,
    ports: [
      pin("left", 0.15, "in", ["ar", "farinha", "produto"]),
      pin("top", 0.5, "out", ["ar"], "ar", "Saída de ar"),
      pin("bottom", 0.5, "out", ["farinha", "produto"], "solidos", "Sólidos"),
    ],
    ops: [],
  }),
  // ── Saneamento ───────────────────────────────────────────────────────
  E({
    type: "rede_esgoto",
    label: "Rede de esgoto (caixa de passagem)",
    category: "Saneamento",
    tagPrefix: "CX",
    w: 90,
    h: 70,
    ports: [pin("left", 0.5, "in", ["esgoto", "agua"]), pin("right", 0.5, "out", ["esgoto"])],
    ops: [],
    keywords: ["poço de visita", "PV"],
  }),
  E({
    type: "elevatoria",
    label: "Estação elevatória",
    category: "Saneamento",
    tagPrefix: "EE",
    w: 130,
    h: 140,
    ports: [
      pin("left", 0.3, "in", ["esgoto"]),
      pin("right", 0.2, "out", ["esgoto"]),
      pin("top", 0.8, "in", ["energia"], "energia", "Alimentação"),
    ],
    ops: ["run", "level"],
  }),
  E({
    type: "gradeamento",
    label: "Gradeamento",
    category: "Saneamento",
    tagPrefix: "GR",
    w: 110,
    h: 70,
    ports: [pin("left", 0.5, "in", ["esgoto"]), pin("right", 0.5, "out", ["esgoto"])],
    ops: ["run"],
  }),
  E({
    type: "decantador",
    label: "Decantador",
    category: "Saneamento",
    tagPrefix: "DE",
    w: 180,
    h: 110,
    ports: [
      pin("left", 0.3, "in", ["esgoto", "agua"]),
      pin("right", 0.3, "out", ["agua"]),
      pin("bottom", 0.5, "out", ["esgoto"], "lodo", "Lodo"),
    ],
    ops: ["level"],
  }),
  // ── Elétrico ─────────────────────────────────────────────────────────
  E({
    type: "motor",
    label: "Motor elétrico",
    category: "Elétrico",
    tagPrefix: "M",
    w: 90,
    h: 70,
    ports: [
      pin("left", 0.5, "in", ["energia"], "energia", "Alimentação"),
      pin("right", 0.5, "out", ["sinal"], "eixo", "Eixo/acoplamento"),
    ],
    ops: ["run", "reverse", "speed"],
  }),
  E({
    type: "painel",
    label: "Painel elétrico (CCM)",
    category: "Elétrico",
    tagPrefix: "QD",
    w: 120,
    h: 140,
    ports: [
      pin("top", 0.5, "in", ["energia"], "entrada", "Entrada"),
      pin("bottom", 0.25, "out", ["energia"], "saida1", "Saída 1"),
      pin("bottom", 0.5, "out", ["energia"], "saida2", "Saída 2"),
      pin("bottom", 0.75, "out", ["energia"], "saida3", "Saída 3"),
    ],
    ops: [],
  }),
  E({
    type: "inversor",
    label: "Inversor de frequência",
    category: "Elétrico",
    tagPrefix: "U",
    w: 70,
    h: 100,
    ports: [
      pin("top", 0.5, "in", ["energia"], "entrada", "Entrada"),
      pin("bottom", 0.5, "out", ["energia"], "saida", "Saída ao motor"),
    ],
    ops: ["run", "reverse", "speed"],
  }),
  E({
    type: "gerador",
    label: "Gerador",
    category: "Elétrico",
    tagPrefix: "G",
    w: 110,
    h: 90,
    ports: [pin("right", 0.5, "out", ["energia"], "saida", "Saída")],
    ops: ["run"],
  }),
  // ── Instrumentos ─────────────────────────────────────────────────────
  E({
    type: "sensor_nivel",
    label: "Transmissor de nível",
    category: "Instrumentos",
    tagPrefix: "LT",
    w: 50,
    h: 50,
    ports: [pin("bottom", 0.5, "both", ["sinal"], "processo", "Processo")],
    ops: [],
  }),
  E({
    type: "sensor_pressao",
    label: "Transmissor de pressão",
    category: "Instrumentos",
    tagPrefix: "PT",
    w: 50,
    h: 50,
    ports: [pin("bottom", 0.5, "both", ["sinal"], "processo", "Processo")],
    ops: [],
  }),
  E({
    type: "sensor_temperatura",
    label: "Transmissor de temperatura",
    category: "Instrumentos",
    tagPrefix: "TT",
    w: 50,
    h: 50,
    ports: [pin("bottom", 0.5, "both", ["sinal"], "processo", "Processo")],
    ops: [],
  }),
  E({
    type: "sensor_vazao",
    label: "Medidor de vazão",
    category: "Instrumentos",
    tagPrefix: "FT",
    w: 70,
    h: 45,
    ports: [
      pin("left", 0.5, "in", liquids.concat(["vapor", "gas"])),
      pin("right", 0.5, "out", liquids.concat(["vapor", "gas"])),
    ],
    ops: [],
  }),
];

const BY_TYPE = new Map(EQUIPMENT_LIBRARY.map((d) => [d.type, d]));
export const EQUIPMENT_TYPES = EQUIPMENT_LIBRARY.map((d) => d.type);
export const EquipmentTypeSchema = z.string().refine((t) => BY_TYPE.has(t), "tipo desconhecido");

export function equipmentDef(type: string): EquipmentDef | undefined {
  return BY_TYPE.get(type);
}

export function findPort(type: string, portId: string): PortDef | undefined {
  return BY_TYPE.get(type)?.ports.find((p) => p.id === portId);
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Busca sem acento por nome, tipo, categoria ou palavra-chave. */
export function searchLibrary(query: string): EquipmentDef[] {
  const q = norm(query.trim());
  if (!q) return [...EQUIPMENT_LIBRARY];
  return EQUIPMENT_LIBRARY.filter((d) =>
    [d.label, d.type, d.category, ...(d.keywords ?? [])].some((s) => norm(s).includes(q)),
  );
}
