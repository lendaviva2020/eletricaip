/**
 * Identificação de equipamentos — IEC 81346 (Documentação EletricAI).
 *
 * Designação completa: `=PLANTA+LOCAL-TAG` (ex.: `=ETE+QGBT-K3`):
 * - `=` aspecto funcional (planta/instalação);
 * - `+` aspecto de localização (painel/sala);
 * - `-` aspecto de produto (o equipamento).
 *
 * Letras de classe conforme IEC 81346-2:2009 (a convenção de letra única
 * usual no mercado brasileiro). As tags que o
 * usuário digitou NUNCA são renomeadas: só sugerimos tag para quem não tem
 * uma tag válida e apontamos duplicidades.
 */
import type { CanonicalEquipment } from "@/lib/model/unified-schema";

export const IEC_81346_CLASS: Readonly<Record<string, string>> = {
  breaker: "Q",
  disconnector: "Q",
  rcd: "F",
  spd: "F",
  fuse: "F",
  thermal_relay: "F",
  contactor: "K",
  relay: "K",
  transformer: "T",
  psu: "T",
  vfd: "T",
  softstarter: "T",
  generator: "G",
  capacitor_bank: "C",
  busbar: "W",
  ccm: "A",
  plc: "A",
  hmi: "P",
  motor: "M",
  load: "E",
  lamp: "E",
  socket: "X",
  terminal: "X",
  pt100: "B",
  pressure: "B",
  flow: "B",
  level: "B",
  encoder: "B",
  lightcurtain: "B",
  estop: "S",
};

/** Equipamentos que não recebem designação de produto (referências do desenho). */
const NOT_A_PRODUCT = new Set(["ground", "neutral"]);

/** Tag válida: letras de classe + número, com separador opcional (Q1, KM-12, M_101, TB3). */
const VALID_TAG_RE = /^-?[A-Z]{1,4}[-_.]?\d{1,4}[A-Z]?$/i;

export interface DesignationParts {
  plant?: string;
  location?: string;
  tag: string;
}

const SEGMENT_RE = /[^A-Za-z0-9_.]/g;

function cleanSegment(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(SEGMENT_RE, "").slice(0, 24);
  return s.length ? s : undefined;
}

/** Remove o prefixo de aspecto e normaliza para comparação (sem distinção de caixa). */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^[-=+]+/, "")
    .toUpperCase();
}

export function isValidDeviceTag(tag: string | undefined | null): boolean {
  return typeof tag === "string" && VALID_TAG_RE.test(tag.trim());
}

/** `=PLANTA+LOCAL-TAG`, omitindo aspectos vazios. */
export function formatDesignation(parts: DesignationParts): string {
  const plant = cleanSegment(parts.plant);
  const location = cleanSegment(parts.location);
  const tag = normalizeTag(parts.tag);
  return `${plant ? `=${plant}` : ""}${location ? `+${location}` : ""}-${tag}`;
}

/** Lê `=A+B-C` (aspectos em qualquer ordem). Retorna null se não houver aspecto de produto. */
export function parseDesignation(text: string): DesignationParts | null {
  const re = /([=+-])([^=+-]+)/g;
  const out: Partial<DesignationParts> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(text.trim())) !== null) {
    const value = m[2].trim();
    if (m[1] === "=") out.plant = value;
    else if (m[1] === "+") out.location = value;
    else out.tag = value;
  }
  return out.tag ? (out as DesignationParts) : null;
}

export interface DeviceDesignation {
  equipmentId: string;
  catalogType: string;
  displayName: string;
  /** Tag efetiva (a do usuário, ou a sugerida quando a do usuário é inválida/ausente). */
  tag: string;
  designation: string;
  plant?: string;
  location?: string;
  /** true quando a tag foi sugerida pelo motor (o usuário deve aplicá-la no desenho). */
  suggested: boolean;
  originalTag: string;
}

export interface DesignationOptions {
  plant?: string;
  location?: string;
}

export interface DesignationIssue {
  code: "DUPLICATE_TAG" | "INVALID_TAG";
  severity: "error" | "warning";
  equipmentIds: string[];
  message: string;
}

function readCustom(eq: CanonicalEquipment, key: "plant" | "location"): string | undefined {
  const v = eq.specs.custom?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Designa todos os equipamentos. Determinístico: sugestões seguem a ordem de
 * tag original/id, e nunca colidem com tags já usadas.
 */
export function designateDevices(
  equipments: readonly CanonicalEquipment[],
  options: DesignationOptions = {},
): { devices: DeviceDesignation[]; issues: DesignationIssue[] } {
  const products = equipments
    .filter((e) => !NOT_A_PRODUCT.has(e.catalogType))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const used = new Set<string>();
  for (const e of products) if (isValidDeviceTag(e.tagCode)) used.add(normalizeTag(e.tagCode));

  const counters = new Map<string, number>();
  const nextTag = (letter: string): string => {
    let n = counters.get(letter) ?? 0;
    let candidate: string;
    do {
      n += 1;
      candidate = `${letter}${n}`;
    } while (used.has(candidate));
    counters.set(letter, n);
    used.add(candidate);
    return candidate;
  };

  const issues: DesignationIssue[] = [];
  const devices: DeviceDesignation[] = products.map((e) => {
    const valid = isValidDeviceTag(e.tagCode);
    const tag = valid ? normalizeTag(e.tagCode) : nextTag(IEC_81346_CLASS[e.catalogType] ?? "A");
    if (!valid) {
      issues.push({
        code: "INVALID_TAG",
        severity: "warning",
        equipmentIds: [e.id],
        message: `"${e.displayName || e.id}" sem tag válida: sugerida -${tag}.`,
      });
    }
    const plant = cleanSegment(readCustom(e, "plant") ?? options.plant);
    const location = cleanSegment(readCustom(e, "location") ?? options.location);
    return {
      equipmentId: e.id,
      catalogType: e.catalogType,
      displayName: e.displayName,
      tag,
      designation: formatDesignation({ plant, location, tag }),
      plant,
      location,
      suggested: !valid,
      originalTag: e.tagCode,
    };
  });

  // Duplicidade é por designação completa: K1 em painéis diferentes é legítimo.
  const byDesignation = new Map<string, string[]>();
  for (const d of devices) {
    const key = d.designation.toUpperCase();
    byDesignation.set(key, [...(byDesignation.get(key) ?? []), d.equipmentId]);
  }
  for (const [key, ids] of byDesignation) {
    if (ids.length > 1) {
      issues.push({
        code: "DUPLICATE_TAG",
        severity: "error",
        equipmentIds: ids,
        message: `Designação ${key} usada por ${ids.length} equipamentos.`,
      });
    }
  }

  devices.sort((a, b) => a.designation.localeCompare(b.designation, "en", { numeric: true }));
  return { devices, issues };
}
