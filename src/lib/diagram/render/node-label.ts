/**
 * Texto exibido sob o símbolo: a TAG (designação IEC 81346) vem primeiro.
 *
 * Antes o canvas mostrava só `label || kind`: um componente arrastado da
 * biblioteca recebe o código da paleta ("QF", "KM") como rótulo, e a tag
 * aplicada por "Numerar dispositivos" nunca aparecia no desenho.
 */
import type { DiagramNode } from "../schema";
import { isValidDeviceTag, normalizeTag } from "@/lib/documentation/device-designation";

/** Código curto de paleta (ex.: "QF", "KM", "VFD") — não descreve o equipamento. */
const PALETTE_CODE = /^[A-Z_]{1,12}$/;

/**
 * Remove do início do rótulo uma designação ANTIGA (ex.: "KM-01 32A" com tag K1
 * → "32A"). A numeração IEC 81346 troca a tag, mas o rótulo guardava a
 * designação anterior e o desenho mostrava "K1 KM-01 32A".
 */
export function stripStaleDesignation(label: string, tag: string): string {
  const trimmed = label.trim();
  if (!tag) return trimmed;
  const [first, ...rest] = trimmed.split(/\s+/);
  if (!first || !isValidDeviceTag(first)) return trimmed;
  if (normalizeTag(first) === normalizeTag(tag)) return trimmed;
  return rest.join(" ");
}

export function nodeDisplayLabel(n: Pick<DiagramNode, "label" | "params">): string {
  const tag = typeof n.params.tag === "string" ? n.params.tag.trim() : "";
  const label = stripStaleDesignation(n.label ?? "", tag);
  if (!tag) return label || n.params.kind;
  if (!label || label === tag || PALETTE_CODE.test(label)) return tag;
  if (label.startsWith(`${tag} `) || label.startsWith(`${tag}-`)) return label;
  return `${tag} ${label}`;
}
