/**
 * Referência cruzada bobina ↔ contatos (estilo EPLAN "imagem de contatos").
 *
 * Para cada contator/relé/relé térmico do projeto lista onde está a bobina e
 * onde cada contato é usado, com a numeração de terminais da IEC 60947-5-1:
 * contato NA = x3-x4, NF = x1-x2 (x = dígito de sequência 1..9); contatos
 * principais de potência 1-2 / 3-4 / 5-6; relé térmico NF 95-96 / NA 97-98.
 *
 * Erros detectados (os mesmos que o EPLAN aponta na verificação):
 * - bobina dupla (duas saídas OTE na mesma bobina);
 * - contato de dispositivo sem bobina programada;
 * - mais contatos do que o dispositivo tem (relé / relé térmico);
 * - contator que precisa de bloco auxiliar (aviso).
 */
import type { CanonicalEquipment, CanonicalTag } from "@/lib/model/unified-schema";
import type { DeviceDesignation } from "./device-designation";
import { normalizeTag } from "./device-designation";

export type LogicRole = "coil" | "set" | "reset" | "no" | "nc";

export interface LogicUsage {
  operand: string;
  role: LogicRole;
  /** Onde aparece (ex.: "Rede 3"). */
  location: string;
}

export interface ContactRef {
  terminals: string;
  type: "NO" | "NC" | "POWER";
  location: string;
}

export interface CrossReferenceRow {
  equipmentId: string;
  designation: string;
  catalogType: string;
  coilLocations: string[];
  contacts: ContactRef[];
  /** Ex.: "3 NA de potência + 2 NA + 1 NF". */
  summary: string;
}

export interface CrossRefIssue {
  code: "DOUBLE_COIL" | "CONTACT_WITHOUT_COIL" | "CONTACTS_EXCEEDED" | "AUX_BLOCK_REQUIRED";
  severity: "error" | "warning" | "info";
  equipmentId: string;
  message: string;
}

const COIL_KINDS: Readonly<Record<string, LogicRole>> = {
  OTE: "coil",
  NEG_COIL: "coil",
  OTL: "set",
  OTU: "reset",
};
const CONTACT_KINDS: Readonly<Record<string, LogicRole>> = {
  XIC: "no",
  XIO: "nc",
  R_TRIG: "no",
  F_TRIG: "no",
};
/** Sufixos de símbolo que apontam para o mesmo dispositivo físico (K1_COIL, KM1_FB…). */
const SUFFIX_RE = /[_.-](COIL|CMD|CMDO|FB|FEEDBACK|AUX|ST|STATUS|RUN|ON|OUT|IN|NA|NF|NO|NC)$/i;
const DEVICES_WITH_CONTACTS = new Set(["contactor", "relay", "thermal_relay"]);
/** Contator: 1 NA (13-14) + 1 NF (21-22) integrados; além disso, bloco auxiliar. */
const CONTACTOR_BUILTIN = { no: 1, nc: 1 };
const MAX_DEPTH = 12;
const MAX_USAGES = 20_000;

/**
 * Extrai os usos de operandos das redes Ladder. Percorre a estrutura de forma
 * genérica (matriz de células, topologia estrutural ou formato legado), com
 * limites de profundidade/quantidade para não travar com dados hostis.
 */
export function extractLadderUsages(rungs: readonly unknown[]): LogicUsage[] {
  const out: LogicUsage[] = [];
  const visit = (node: unknown, location: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_USAGES || node === null) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, location, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const kind = typeof rec.kind === "string" ? rec.kind : undefined;
    const operand = typeof rec.operand === "string" ? rec.operand.trim() : "";
    if (kind && operand) {
      const role = COIL_KINDS[kind] ?? CONTACT_KINDS[kind];
      if (role) out.push({ operand: operand.slice(0, 64), role, location });
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") visit(value, location, depth + 1);
    }
  };
  rungs.forEach((rung, i) => visit(rung, `Rede ${i + 1}`, 0));
  return out;
}

function deviceKey(operand: string): string {
  return normalizeTag(operand.replace(/^%/, "")).replace(SUFFIX_RE, "");
}

export function buildCrossReference(input: {
  equipmentsById: Readonly<Record<string, CanonicalEquipment>>;
  devices: readonly DeviceDesignation[];
  usages: readonly LogicUsage[];
  tags?: readonly CanonicalTag[];
  /** Equipamentos com ligações de potência (contatos principais usados no unifilar). */
  poweredEquipmentIds?: ReadonlySet<string>;
}): { rows: CrossReferenceRow[]; issues: CrossRefIssue[] } {
  const { equipmentsById, devices, usages } = input;
  const byKey = new Map<string, DeviceDesignation>();
  for (const d of devices) {
    if (!DEVICES_WITH_CONTACTS.has(d.catalogType)) continue;
    byKey.set(normalizeTag(d.tag), d);
    if (d.originalTag) byKey.set(deviceKey(d.originalTag), d);
  }
  // Símbolos do CLP vinculados ao equipamento (CanonicalTag.linkedEquipmentId).
  for (const t of input.tags ?? []) {
    if (!t.linkedEquipmentId) continue;
    const d = devices.find((x) => x.equipmentId === t.linkedEquipmentId);
    if (d && DEVICES_WITH_CONTACTS.has(d.catalogType)) byKey.set(deviceKey(t.name), d);
  }

  interface Acc {
    coils: string[];
    sets: string[];
    no: string[];
    nc: string[];
  }
  const acc = new Map<string, Acc>();
  for (const u of usages) {
    const d = byKey.get(deviceKey(u.operand));
    if (!d) continue;
    const a = acc.get(d.equipmentId) ?? { coils: [], sets: [], no: [], nc: [] };
    if (u.role === "coil") a.coils.push(u.location);
    else if (u.role === "set" || u.role === "reset") a.sets.push(u.location);
    else if (u.role === "no") a.no.push(u.location);
    else a.nc.push(u.location);
    acc.set(d.equipmentId, a);
  }

  const rows: CrossReferenceRow[] = [];
  const issues: CrossRefIssue[] = [];

  for (const d of devices) {
    if (!DEVICES_WITH_CONTACTS.has(d.catalogType)) continue;
    const a = acc.get(d.equipmentId) ?? { coils: [], sets: [], no: [], nc: [] };
    const eq = equipmentsById[d.equipmentId];
    const contacts: ContactRef[] = [];

    if (d.catalogType === "contactor" && input.poweredEquipmentIds?.has(d.equipmentId)) {
      for (const pair of ["1-2", "3-4", "5-6"]) {
        contacts.push({ terminals: pair, type: "POWER", location: "Unifilar" });
      }
    }

    if (d.catalogType === "thermal_relay") {
      if (a.nc.length > 1 || a.no.length > 1) {
        issues.push({
          code: "CONTACTS_EXCEEDED",
          severity: "error",
          equipmentId: d.equipmentId,
          message: `${d.designation}: relé térmico tem 1 NF (95-96) e 1 NA (97-98); a lógica usa ${a.nc.length} NF e ${a.no.length} NA.`,
        });
      }
      a.nc.forEach((loc) => contacts.push({ terminals: "95-96", type: "NC", location: loc }));
      a.no.forEach((loc) => contacts.push({ terminals: "97-98", type: "NO", location: loc }));
    } else {
      // Dígito de sequência compartilhado entre NA e NF, na ordem de uso (IEC 60947-5-1).
      let seq = 0;
      const ordered = [
        ...a.no.map((loc) => ({ loc, type: "NO" as const })),
        ...a.nc.map((loc) => ({ loc, type: "NC" as const })),
      ];
      for (const c of ordered) {
        seq += 1;
        const s = seq <= 9 ? seq : 9;
        contacts.push({
          terminals: c.type === "NO" ? `${s}3-${s}4` : `${s}1-${s}2`,
          type: c.type,
          location: c.loc,
        });
      }

      if (d.catalogType === "relay") {
        const params = eq?.diagramParams;
        const available =
          params && params.kind === "relay" && typeof params.contacts === "number"
            ? params.contacts
            : 2;
        if (ordered.length > available) {
          issues.push({
            code: "CONTACTS_EXCEEDED",
            severity: "error",
            equipmentId: d.equipmentId,
            message: `${d.designation}: ${ordered.length} contatos usados, o relé tem ${available}.`,
          });
        }
      } else if (
        d.catalogType === "contactor" &&
        (a.no.length > CONTACTOR_BUILTIN.no || a.nc.length > CONTACTOR_BUILTIN.nc)
      ) {
        issues.push({
          code: "AUX_BLOCK_REQUIRED",
          severity: "info",
          equipmentId: d.equipmentId,
          message: `${d.designation}: ${a.no.length} NA + ${a.nc.length} NF excedem os contatos integrados (1 NA + 1 NF) — prever bloco auxiliar.`,
        });
      }
    }

    if (a.coils.length > 1) {
      issues.push({
        code: "DOUBLE_COIL",
        severity: "error",
        equipmentId: d.equipmentId,
        message: `${d.designation}: bobina acionada em ${a.coils.length} redes (${a.coils.join(", ")}) — a última sobrescreve as outras.`,
      });
    }
    const hasCoil = a.coils.length > 0 || a.sets.length > 0;
    if (!hasCoil && (a.no.length || a.nc.length) && d.catalogType !== "thermal_relay") {
      issues.push({
        code: "CONTACT_WITHOUT_COIL",
        severity: "warning",
        equipmentId: d.equipmentId,
        message: `${d.designation}: contatos usados na lógica, mas a bobina não é acionada em nenhuma rede.`,
      });
    }

    const nNo = contacts.filter((c) => c.type === "NO").length;
    const nNc = contacts.filter((c) => c.type === "NC").length;
    const nPw = contacts.filter((c) => c.type === "POWER").length;
    const parts = [
      nPw ? `${nPw} NA de potência` : "",
      nNo ? `${nNo} NA` : "",
      nNc ? `${nNc} NF` : "",
    ].filter(Boolean);
    rows.push({
      equipmentId: d.equipmentId,
      designation: d.designation,
      catalogType: d.catalogType,
      coilLocations: [...a.coils, ...a.sets],
      contacts,
      summary: parts.length ? parts.join(" + ") : "—",
    });
  }

  return { rows, issues };
}
