// Desenho dos símbolos da tela HMI no gateway (Node, react-dom/server).
//
// Usa o MESMO componente do editor HMI (`ProcessSymbol`), então a tela no
// WebVisu é a desenhada pelo engenheiro. O SVG vai para o navegador como
// IMAGEM (`<image href>`): SVG carregado como imagem não executa script nem
// carrega recursos externos, e a resposta ainda leva uma CSP própria.
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessSymbol } from "@/components/hmi/process-symbols";
import { equipmentDef } from "@/lib/hmi/process-library";
import type { TagBoundState } from "@/lib/hmi/hmi-tag-state";

/** Animações dos símbolos (as mesmas classes `hmi-*` do styles.css do app). */
export const HMI_SYMBOL_CSS = `
.hmi-spin{animation:hmi-spin 1.2s linear infinite;transform-box:fill-box;transform-origin:center}
.hmi-flow{stroke-dasharray:10 8;animation:hmi-flow .9s linear infinite}
.hmi-shake{animation:hmi-shake .12s ease-in-out infinite alternate}
.hmi-flame{animation:hmi-flame .35s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}
.hmi-rev{animation-direction:reverse}
@keyframes hmi-spin{to{transform:rotate(360deg)}}
@keyframes hmi-flow{to{stroke-dashoffset:-36}}
@keyframes hmi-shake{from{transform:translateX(-1.5px)}to{transform:translateX(1.5px)}}
@keyframes hmi-flame{from{transform:scaleY(.75);opacity:.7}to{transform:scaleY(1.1);opacity:1}}
@media (prefers-reduced-motion:reduce){.hmi-spin,.hmi-flow,.hmi-shake,.hmi-flame{animation:none}}
`.trim();

const MAX_CACHE = 400;
const cache = new Map<string, string>();

/**
 * SVG autônomo do símbolo. `type` precisa existir na biblioteca (senão null).
 * O resultado é guardado em cache por (tipo, estado).
 */
export function renderHmiSymbolSvg(
  type: string,
  state: TagBoundState,
  stateKey: string,
): string | null {
  const def = equipmentDef(type);
  if (!def) return null;
  const key = `${type}|${stateKey}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const fluid =
    def.ports.find((p) => p.dir !== "out" && p.media[0] !== "energia")?.media[0] ?? "agua";
  const inner = renderToStaticMarkup(
    <ProcessSymbol type={type} w={def.w} h={def.h} state={state} fluid={fluid} />,
  );
  // A raiz devolvida é um <svg>: vira documento autônomo com namespace e estilo.
  const svg = inner
    .replace(/^<svg /, `<svg xmlns="http://www.w3.org/2000/svg" `)
    .replace(/^(<svg[^>]*>)/, `$1<style>${HMI_SYMBOL_CSS}</style>`);
  cache.set(key, svg);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return svg;
}
