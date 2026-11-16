/**
 * Texto exibido sob o símbolo: a TAG (designação IEC 81346) vem primeiro.
 *
 * Antes o canvas mostrava só `label || kind`: um componente arrastado da
 * biblioteca recebe o código da paleta ("QF", "KM") como rótulo, e a tag
 * aplicada por "Numerar dispositivos" nunca aparecia no desenho.
 */
import type { DiagramNode } from "../schema";

/** Código curto de paleta (ex.: "QF", "KM", "VFD") — não descreve o equipamento. */
const PALETTE_CODE = /^[A-Z_]{1,12}$/;

export function nodeDisplayLabel(n: Pick<DiagramNode, "label" | "params">): string {
  const tag = typeof n.params.tag === "string" ? n.params.tag.trim() : "";
  const label = (n.label ?? "").trim();
  if (!tag) return label || n.params.kind;
  if (!label || label === tag || PALETTE_CODE.test(label)) return tag;
  if (label.startsWith(`${tag} `) || label.startsWith(`${tag}-`)) return label;
  return `${tag} ${label}`;
}
