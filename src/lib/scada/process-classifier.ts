// SCADA SUPERVISÓRIO — Classificador de equipamentos de processo (ISA-5.1 / ISA-101)
//
// Converte os equipamentos canônicos do projeto (mesma identidade do Unifilar —
// AGENTS.md §11.1 "Single Source of Truth") em tipos de equipamento de PROCESSO
// para o sinótico: rosca transportadora, elevador de canecas, exaustor,
// condensador, bomba, tanque, silo etc. A classificação é determinística e usa
// apenas dados do projeto (tipo de catálogo do Unifilar + nome/TAG dados pelo
// engenheiro). Nada é inventado: um motor sem indicação de aplicação continua
// sendo exibido como "motor" genérico.

export type ProcessEquipmentKind =
  | "screw_conveyor"
  | "bucket_elevator"
  | "belt_conveyor"
  | "chain_conveyor"
  | "exhaust_fan"
  | "condenser"
  | "cooling_tower"
  | "pump"
  | "compressor"
  | "boiler"
  | "tank"
  | "silo"
  | "hopper"
  | "mixer"
  | "mill"
  | "dryer"
  | "press"
  | "extractor"
  | "cyclone"
  | "filter"
  | "heat_exchanger"
  | "valve"
  | "motor"
  | "transformer"
  | "generator"
  | "instrument"
  /** Manobra/proteção/controle — pertence ao Unifilar, não ao sinótico de processo. */
  | "switchgear";

export type ProcessArea = "transport" | "processing" | "storage" | "utilities" | "energy";

export const PROCESS_AREA_ORDER: readonly ProcessArea[] = [
  "transport",
  "processing",
  "storage",
  "utilities",
  "energy",
];

export const PROCESS_AREA_LABEL: Record<ProcessArea, string> = {
  transport: "Recepção & Transporte",
  processing: "Processamento",
  storage: "Armazenagem",
  utilities: "Utilidades",
  energy: "Energia",
};

export const PROCESS_KIND_LABEL: Record<ProcessEquipmentKind, string> = {
  screw_conveyor: "Rosca transportadora",
  bucket_elevator: "Elevador de canecas",
  belt_conveyor: "Transportador de correia",
  chain_conveyor: "Transportador de corrente (redler)",
  exhaust_fan: "Exaustor / ventilador",
  condenser: "Condensador",
  cooling_tower: "Torre de resfriamento",
  pump: "Bomba",
  compressor: "Compressor",
  boiler: "Caldeira",
  tank: "Tanque",
  silo: "Silo",
  hopper: "Moega / tremonha",
  mixer: "Misturador / agitador",
  mill: "Moinho",
  dryer: "Secador",
  press: "Prensa",
  extractor: "Extrator",
  cyclone: "Ciclone",
  filter: "Filtro",
  heat_exchanger: "Trocador de calor",
  valve: "Válvula",
  motor: "Motor",
  transformer: "Transformador",
  generator: "Gerador",
  instrument: "Instrumento",
  switchgear: "Manobra / proteção",
};

export const PROCESS_KIND_AREA: Record<ProcessEquipmentKind, ProcessArea | null> = {
  screw_conveyor: "transport",
  bucket_elevator: "transport",
  belt_conveyor: "transport",
  chain_conveyor: "transport",
  hopper: "transport",
  mill: "processing",
  dryer: "processing",
  press: "processing",
  extractor: "processing",
  mixer: "processing",
  cyclone: "processing",
  filter: "processing",
  heat_exchanger: "processing",
  motor: "processing",
  tank: "storage",
  silo: "storage",
  exhaust_fan: "utilities",
  condenser: "utilities",
  cooling_tower: "utilities",
  pump: "utilities",
  compressor: "utilities",
  boiler: "utilities",
  valve: "utilities",
  transformer: "energy",
  generator: "energy",
  // Instrumentos são desenhados junto do equipamento/área, não como ativo de área.
  instrument: null,
  switchgear: null,
};

/** Equipamentos com partes móveis acionadas (animam quando em operação). */
export const ROTATING_KINDS: ReadonlySet<ProcessEquipmentKind> = new Set<ProcessEquipmentKind>([
  "screw_conveyor",
  "bucket_elevator",
  "belt_conveyor",
  "chain_conveyor",
  "exhaust_fan",
  "condenser",
  "cooling_tower",
  "pump",
  "compressor",
  "mixer",
  "mill",
  "dryer",
  "press",
  "extractor",
  "motor",
  "generator",
]);

/**
 * Regras por palavra-chave (texto normalizado, sem acento, minúsculo).
 * Ordem importa: termos mais específicos primeiro ("elevador de canecas" antes
 * de "motor"; "torre de resfriamento" antes de "ventilador").
 */
const KEYWORD_RULES: ReadonlyArray<{ kind: ProcessEquipmentKind; patterns: RegExp[] }> = [
  { kind: "bucket_elevator", patterns: [/elevador/, /caneca/, /bucket/, /\bel-?\d/] },
  {
    kind: "screw_conveyor",
    patterns: [/rosca/, /helicoid/, /\bscrew\b/, /sem-?fim/, /\brt-?\d/, /\brosc/],
  },
  { kind: "chain_conveyor", patterns: [/redler/, /corrente/, /\bchain\b/, /arrastador/] },
  {
    kind: "belt_conveyor",
    patterns: [/correia/, /esteira/, /\bbelt\b/, /\bconveyor\b/, /transportador/, /\btc-?\d/],
  },
  { kind: "cooling_tower", patterns: [/torre de resfriamento/, /cooling tower/] },
  { kind: "condenser", patterns: [/condensador/, /condenser/, /\bcd-?\d/] },
  {
    kind: "exhaust_fan",
    patterns: [/exaustor/, /ventilador/, /soprador/, /\bfan\b/, /blower/, /insufl/, /\bex-?\d/],
  },
  { kind: "compressor", patterns: [/compressor/] },
  { kind: "boiler", patterns: [/caldeira/, /boiler/, /gerador de vapor/] },
  { kind: "heat_exchanger", patterns: [/trocador/, /heat exchanger/, /resfriador/, /aquecedor/] },
  { kind: "cyclone", patterns: [/ciclone/, /cyclone/] },
  { kind: "filter", patterns: [/filtro/, /\bfilter\b/, /mangas/] },
  { kind: "extractor", patterns: [/extrator/, /extractor/, /dessolventiz/] },
  { kind: "press", patterns: [/prensa/, /expeller/, /\bpress\b/, /laminador/, /extrusor/] },
  { kind: "mill", patterns: [/moinho/, /\bmill\b/, /triturador/, /quebrador/, /moagem/] },
  { kind: "dryer", patterns: [/secador/, /\bdryer\b/, /tostador/, /condicionador/] },
  { kind: "mixer", patterns: [/misturador/, /agitador/, /mixer/, /homogeneiz/, /batedor/] },
  { kind: "silo", patterns: [/\bsilo/, /\bsl-?\d/] },
  { kind: "hopper", patterns: [/moega/, /tremonha/, /hopper/, /\bmg-?\d/] },
  { kind: "tank", patterns: [/tanque/, /\btank\b/, /reservatorio/, /\btq-?\d/, /\btk-?\d/] },
  { kind: "pump", patterns: [/bomba/, /\bpump\b/, /recalque/] },
  { kind: "valve", patterns: [/valvula/, /\bvalve\b/, /registro/, /\bxv-?\d/] },
];

/** Tipo de catálogo do Unifilar (DiagramNode.params.kind) → tipo de processo. */
const CATALOG_KIND_MAP: Record<string, ProcessEquipmentKind> = {
  motor: "motor",
  transformer: "transformer",
  generator: "generator",
  pt100: "instrument",
  pressure: "instrument",
  flow: "instrument",
  level: "instrument",
  encoder: "instrument",
  breaker: "switchgear",
  rcd: "switchgear",
  contactor: "switchgear",
  relay: "switchgear",
  fuse: "switchgear",
  disconnector: "switchgear",
  thermal_relay: "switchgear",
  vfd: "switchgear",
  softstarter: "switchgear",
  busbar: "switchgear",
  ccm: "switchgear",
  psu: "switchgear",
  plc: "switchgear",
  hmi: "switchgear",
  estop: "switchgear",
  lightcurtain: "switchgear",
  capacitor_bank: "switchgear",
  ground: "switchgear",
  neutral: "switchgear",
  terminal: "switchgear",
  lamp: "switchgear",
  socket: "switchgear",
};

/** Tipos de catálogo que podem acionar um equipamento de processo (palavra-chave vale). */
const DRIVEN_CATALOG_KINDS = new Set(["motor", "load", "generator"]);

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface ClassifiableEquipment {
  readonly id: string;
  readonly tag?: string;
  readonly name?: string;
  /** Tipo de catálogo do Unifilar (ex.: "motor", "breaker", "level"). */
  readonly catalogType?: string;
}

export interface ProcessClassification {
  readonly kind: ProcessEquipmentKind;
  readonly area: ProcessArea | null;
  /** Como a classificação foi obtida — exibido na UI para rastreabilidade. */
  readonly source: "keyword" | "catalog" | "fallback";
}

export function classifyProcessEquipment(eq: ClassifiableEquipment): ProcessClassification {
  const catalog = (eq.catalogType ?? "").toLowerCase();
  const text = normalizeText(`${eq.name ?? ""} ${eq.tag ?? ""}`);

  // Dispositivos de manobra/proteção/instrumento não viram equipamento de processo
  // mesmo que o nome cite a carga ("Disjuntor da rosca RT-01" continua disjuntor).
  const catalogKind = CATALOG_KIND_MAP[catalog];
  const keywordAllowed = !catalog || DRIVEN_CATALOG_KINDS.has(catalog) || !catalogKind;

  if (keywordAllowed) {
    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return { kind: rule.kind, area: PROCESS_KIND_AREA[rule.kind], source: "keyword" };
      }
    }
  }

  if (catalogKind) {
    return { kind: catalogKind, area: PROCESS_KIND_AREA[catalogKind], source: "catalog" };
  }
  if (catalog === "load") {
    return { kind: "motor", area: PROCESS_KIND_AREA.motor, source: "fallback" };
  }
  return { kind: "switchgear", area: null, source: "fallback" };
}

/** Letras ISA-5.1 do instrumento a partir do tipo de catálogo. */
export function isaInstrumentLetters(catalogType: string | undefined): string {
  switch ((catalogType ?? "").toLowerCase()) {
    case "pt100":
      return "TT";
    case "pressure":
      return "PT";
    case "flow":
      return "FT";
    case "level":
      return "LT";
    case "encoder":
      return "ST";
    default:
      return "XT";
  }
}

export interface ProcessPlantItem<T extends ClassifiableEquipment = ClassifiableEquipment> {
  readonly equipment: T;
  readonly classification: ProcessClassification;
}

export interface ProcessPlantLayout<T extends ClassifiableEquipment = ClassifiableEquipment> {
  readonly areas: ReadonlyArray<{
    readonly area: ProcessArea;
    readonly items: ReadonlyArray<ProcessPlantItem<T>>;
  }>;
  readonly instruments: ReadonlyArray<ProcessPlantItem<T>>;
  /** Quantidade de dispositivos de manobra/proteção (ficam no Unifilar). */
  readonly switchgearCount: number;
}

/**
 * Agrupa os equipamentos por área de processo, na ordem do fluxo típico de uma
 * planta (recepção → processamento → armazenagem → utilidades → energia).
 * Dentro da área a ordem é pela TAG (natural), estável entre renders.
 */
export function buildProcessPlantLayout<T extends ClassifiableEquipment>(
  equipments: readonly T[],
): ProcessPlantLayout<T> {
  const byArea = new Map<ProcessArea, ProcessPlantItem<T>[]>();
  const instruments: ProcessPlantItem<T>[] = [];
  let switchgearCount = 0;

  for (const equipment of equipments) {
    const classification = classifyProcessEquipment(equipment);
    if (classification.kind === "switchgear") {
      switchgearCount += 1;
      continue;
    }
    if (classification.kind === "instrument") {
      instruments.push({ equipment, classification });
      continue;
    }
    const area = classification.area ?? "processing";
    const list = byArea.get(area) ?? [];
    list.push({ equipment, classification });
    byArea.set(area, list);
  }

  const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
  const byTag = (a: ProcessPlantItem<T>, b: ProcessPlantItem<T>) =>
    collator.compare(a.equipment.tag ?? a.equipment.id, b.equipment.tag ?? b.equipment.id);

  const areas = PROCESS_AREA_ORDER.filter((a) => (byArea.get(a)?.length ?? 0) > 0).map((area) => ({
    area,
    items: [...(byArea.get(area) ?? [])].sort(byTag),
  }));

  return { areas, instruments: instruments.sort(byTag), switchgearCount };
}
