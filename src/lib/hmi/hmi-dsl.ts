/**
 * Linguagem de código da tela HMI (português, uma instrução por linha).
 *
 *   tela "Fábrica de óleo e farinha"
 *   equipamento MG1 moega "Moega de recepção" em 80,60
 *   equipamento RT1 rosca "Rosca alimentadora" em 260,90 girar 90 tag RT1
 *   ligar MG1.saida -> RT1.entrada farinha
 *   # comentário
 *
 * Desenho → código e código → desenho dão o MESMO documento (ida e volta
 * exata). Erros trazem o número da linha. A IA escreve nesta linguagem.
 */
import { MEDIA, type Medium, equipmentDef } from "./process-library";
import {
  HMI_MAX_EQUIPMENT,
  HMI_MAX_LINKS,
  HmiDocSchema,
  emptyHmiDoc,
  validateHmiDoc,
  type HmiDoc,
  type HmiIssue,
} from "./hmi-model";

export const HMI_CODE_MAX_CHARS = 60_000;

const ID = "[A-Za-z][A-Za-z0-9_-]{0,31}";
const NUM = "-?\\d+(?:[.,]\\d+)?";
const RE_TITLE = /^tela\s+"([^"]{0,120})"$/i;
const RE_EQUIP = new RegExp(
  `^equipamento\\s+(${ID})\\s+([a-z_]+)(?:\\s+"([^"]{0,80})")?\\s+em\\s+(${NUM})\\s*,\\s*(${NUM})((?:\\s+(?:girar\\s+\\d+|tag\\s+[A-Za-z0-9_.-]{1,64}))*)$`,
  "i",
);
const RE_LINK = new RegExp(
  `^ligar\\s+(${ID})\\.([A-Za-z0-9_]+)\\s*->\\s*(${ID})\\.([A-Za-z0-9_]+)(?:\\s+([a-z]+))?$`,
  "i",
);

export interface ParseResult {
  readonly doc: HmiDoc | null;
  readonly issues: HmiIssue[];
}

const num = (s: string) => Number(s.replace(",", "."));

export function parseHmiCode(code: string): ParseResult {
  const issues: HmiIssue[] = [];
  if (code.length > HMI_CODE_MAX_CHARS) {
    return { doc: null, issues: [{ level: "error", message: "Código grande demais." }] };
  }
  const doc = emptyHmiDoc();
  let autoLink = 1;
  const lines = code.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const text = raw.replace(/\s+#.*$/, "").trim();
    if (!text || text.startsWith("#")) return;
    let m: RegExpExecArray | null;
    if ((m = RE_TITLE.exec(text))) {
      doc.title = m[1] || doc.title;
      return;
    }
    if ((m = RE_EQUIP.exec(text))) {
      const [, id, typeRaw, label, xs, ys, mods] = m;
      const type = typeRaw.toLowerCase();
      if (!equipmentDef(type)) {
        issues.push({ level: "error", line, message: `Tipo desconhecido: ${type}` });
        return;
      }
      let rotation: 0 | 90 | 180 | 270 = 0;
      let tag: string | undefined;
      const g = /girar\s+(\d+)/i.exec(mods ?? "");
      if (g) {
        const r = Number(g[1]);
        if (r === 0 || r === 90 || r === 180 || r === 270) rotation = r;
        else issues.push({ level: "error", line, message: "girar aceita 0, 90, 180 ou 270" });
      }
      const t = /tag\s+([A-Za-z0-9_.-]{1,64})/i.exec(mods ?? "");
      if (t) tag = t[1];
      if (doc.equipment.length >= HMI_MAX_EQUIPMENT) {
        issues.push({ level: "error", line, message: "Limite de equipamentos atingido" });
        return;
      }
      doc.equipment.push({
        id,
        type,
        label: label ?? "",
        x: Math.round(num(xs)),
        y: Math.round(num(ys)),
        rotation,
        ...(tag ? { tag } : {}),
      });
      return;
    }
    if ((m = RE_LINK.exec(text))) {
      const [, a, pa, b, pb, mediumRaw] = m;
      const medium = (mediumRaw ?? "").toLowerCase();
      if (medium && !(MEDIA as readonly string[]).includes(medium)) {
        issues.push({
          level: "error",
          line,
          message: `Meio desconhecido: ${medium} (use ${MEDIA.join(", ")})`,
        });
        return;
      }
      if (doc.links.length >= HMI_MAX_LINKS) {
        issues.push({ level: "error", line, message: "Limite de ligações atingido" });
        return;
      }
      doc.links.push({
        id: `L${autoLink++}`,
        from: { equipment: a, port: pa },
        to: { equipment: b, port: pb },
        // Sem meio: decidido abaixo pelo primeiro aceito nas duas portas.
        medium: (medium || "__auto__") as Medium,
      });
      return;
    }
    issues.push({
      level: "error",
      line,
      message: `Instrução não reconhecida: ${text.slice(0, 60)}`,
    });
  });

  // Meio automático pelas portas.
  const byId = new Map(doc.equipment.map((e) => [e.id, e]));
  for (const l of doc.links) {
    if ((l.medium as string) !== "__auto__") continue;
    const a = byId.get(l.from.equipment);
    const b = byId.get(l.to.equipment);
    const pa = a && equipmentDef(a.type)?.ports.find((p) => p.id === l.from.port);
    const pb = b && equipmentDef(b.type)?.ports.find((p) => p.id === l.to.port);
    const m = pa && pb ? pa.media.find((x) => pb.media.includes(x)) : undefined;
    l.medium = m ?? "produto";
  }

  const parsed = HmiDocSchema.safeParse(doc);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 10)) {
      issues.push({ level: "error", message: `${i.path.join(".")}: ${i.message}` });
    }
    return { doc: null, issues };
  }
  issues.push(...validateHmiDoc(parsed.data));
  const hasError = issues.some((i) => i.level === "error");
  return { doc: hasError ? null : parsed.data, issues };
}

const q = (s: string) => s.replace(/"/g, "'");

export function serializeHmiDoc(doc: HmiDoc): string {
  const out: string[] = [`tela "${q(doc.title)}"`, ""];
  for (const e of doc.equipment) {
    let line = `equipamento ${e.id} ${e.type}`;
    if (e.label) line += ` "${q(e.label)}"`;
    line += ` em ${Math.round(e.x)},${Math.round(e.y)}`;
    if (e.rotation) line += ` girar ${e.rotation}`;
    if (e.tag) line += ` tag ${e.tag}`;
    out.push(line);
  }
  if (doc.links.length) out.push("");
  for (const l of doc.links) {
    out.push(
      `ligar ${l.from.equipment}.${l.from.port} -> ${l.to.equipment}.${l.to.port} ${l.medium}`,
    );
  }
  return out.join("\n") + "\n";
}

/** Referência da linguagem para a IA e para a ajuda da tela. */
export function hmiLanguageReference(): string {
  return [
    'tela "<título>"',
    'equipamento <ID> <tipo> ["<nome>"] em <x>,<y> [girar 0|90|180|270] [tag <TAG>]',
    "ligar <ID>.<porta> -> <ID>.<porta> [meio]",
    "# comentário",
    `Meios: ${MEDIA.join(", ")}`,
  ].join("\n");
}
