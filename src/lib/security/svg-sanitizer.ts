// SVG sanitizer — defense-in-depth for any string passed to dangerouslySetInnerHTML.
// Uses DOMPurify in the browser; falls back to regex-based stripping in SSR/Worker
// runtime (no DOM available). Even though our SVG strings are generated server-side
// from a hardcoded whitelist (see src/lib/voltai/symbols.ts), this layer prevents
// any future regression where untrusted markup could reach the renderer.
import DOMPurify from "dompurify";

const SVG_CONFIG: DOMPurify.Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["script", "use", "foreignObject", "animate"],
  FORBID_ATTR: [
    "onload",
    "onerror",
    "onclick",
    "onmouseover",
    "onfocus",
    "onblur",
    "xlink:href",
    "href",
  ],
  FORCE_BODY: false,
};

function ssrStrip(raw: string): string {
  return raw
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:foreignObject|animate|use)[^>]*>/gi, "")
    .replace(/javascript:/gi, "");
}

export function sanitizeSvg(raw: string): string {
  if (!raw) return "";
  if (typeof window === "undefined" || typeof DOMPurify.sanitize !== "function") {
    return ssrStrip(raw);
  }
  return DOMPurify.sanitize(raw, SVG_CONFIG) as unknown as string;
}
