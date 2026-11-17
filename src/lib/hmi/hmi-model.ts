/**
 * Documento da tela HMI de processo (salvo no projeto em `hmiProcess`).
 */
import { z } from "zod";
import { MEDIA, equipmentDef, findPort, type Medium } from "./process-library";

export const HMI_DOC_VERSION = 1 as const;
export const HMI_MAX_EQUIPMENT = 400;
export const HMI_MAX_LINKS = 800;

const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/, "id inválido");

export const HmiEquipmentSchema = z.object({
  id: Id,
  type: z.string().refine((t) => Boolean(equipmentDef(t)), "tipo de equipamento desconhecido"),
  label: z.string().max(80).default(""),
  x: z.number().finite().min(-50000).max(50000),
  y: z.number().finite().min(-50000).max(50000),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  /** Tag do CLP/SCADA que o equipamento publica/lê (opcional). */
  tag: z
    .string()
    .regex(/^[A-Za-z0-9_.-]{1,64}$/)
    .optional(),
});
export type HmiEquipment = z.infer<typeof HmiEquipmentSchema>;

export const HmiLinkSchema = z.object({
  id: Id,
  from: z.object({ equipment: Id, port: z.string().min(1).max(32) }),
  to: z.object({ equipment: Id, port: z.string().min(1).max(32) }),
  medium: z.enum(MEDIA),
});
export type HmiLink = z.infer<typeof HmiLinkSchema>;

export const HmiDocSchema = z.object({
  version: z.literal(HMI_DOC_VERSION).default(HMI_DOC_VERSION),
  title: z.string().max(120).default("Tela de processo"),
  equipment: z.array(HmiEquipmentSchema).max(HMI_MAX_EQUIPMENT).default([]),
  links: z.array(HmiLinkSchema).max(HMI_MAX_LINKS).default([]),
});
export type HmiDoc = z.infer<typeof HmiDocSchema>;

export function emptyHmiDoc(title = "Tela de processo"): HmiDoc {
  return { version: HMI_DOC_VERSION, title, equipment: [], links: [] };
}

export interface HmiIssue {
  readonly level: "error" | "warning";
  readonly message: string;
  readonly line?: number;
}

/**
 * Verificação de engenharia da tela: ids únicos, portas existentes, meio
 * compatível com as duas portas, sentido (saída → entrada) e duplicatas.
 */
export function validateHmiDoc(doc: HmiDoc): HmiIssue[] {
  const issues: HmiIssue[] = [];
  const byId = new Map<string, HmiEquipment>();
  for (const e of doc.equipment) {
    if (byId.has(e.id)) issues.push({ level: "error", message: `Equipamento repetido: ${e.id}` });
    byId.set(e.id, e);
  }
  const linkIds = new Set<string>();
  const pairs = new Set<string>();
  for (const l of doc.links) {
    if (linkIds.has(l.id)) issues.push({ level: "error", message: `Ligação repetida: ${l.id}` });
    linkIds.add(l.id);
    const a = byId.get(l.from.equipment);
    const b = byId.get(l.to.equipment);
    if (!a || !b) {
      issues.push({
        level: "error",
        message: `Ligação ${l.id}: equipamento inexistente (${!a ? l.from.equipment : l.to.equipment})`,
      });
      continue;
    }
    if (a.id === b.id) {
      issues.push({ level: "error", message: `Ligação ${l.id}: liga o equipamento a ele mesmo` });
      continue;
    }
    const pa = findPort(a.type, l.from.port);
    const pb = findPort(b.type, l.to.port);
    if (!pa || !pb) {
      issues.push({
        level: "error",
        message: `Ligação ${l.id}: porta inexistente (${!pa ? `${a.id}.${l.from.port}` : `${b.id}.${l.to.port}`})`,
      });
      continue;
    }
    if (!pa.media.includes(l.medium) || !pb.media.includes(l.medium)) {
      issues.push({
        level: "error",
        message: `Ligação ${l.id}: ${l.medium} não é aceito em ${!pa.media.includes(l.medium) ? `${a.id}.${pa.id}` : `${b.id}.${pb.id}`}`,
      });
    }
    if (pa.dir === "in" || pb.dir === "out") {
      issues.push({
        level: "warning",
        message: `Ligação ${l.id}: sentido invertido (${a.id}.${pa.id} → ${b.id}.${pb.id})`,
      });
    }
    const key = [`${a.id}.${pa.id}`, `${b.id}.${pb.id}`].sort().join("|");
    if (pairs.has(key)) issues.push({ level: "warning", message: `Ligação duplicada: ${l.id}` });
    pairs.add(key);
  }
  return issues;
}

/** Primeiro meio aceito pelas duas portas (ligação feita no desenho). */
export function commonMedium(
  fromType: string,
  fromPort: string,
  toType: string,
  toPort: string,
): Medium | null {
  const a = findPort(fromType, fromPort);
  const b = findPort(toType, toPort);
  if (!a || !b) return null;
  return a.media.find((m) => b.media.includes(m)) ?? null;
}

/** Próximo id livre com o prefixo (ex.: RT1, RT2…). */
export function nextId(prefix: string, used: ReadonlySet<string>): string {
  const base = prefix.replace(/[^A-Za-z0-9_]/g, "") || "EQ";
  for (let i = 1; i < 10000; i++) {
    const id = `${base}${i}`;
    if (!used.has(id)) return id;
  }
  return `${base}${Date.now()}`;
}
