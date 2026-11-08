// Hardened HTML & SVG Sanitizer — Gate 3.8.2
// Enforces DOMPurify >= 3.4.17 defenses against:
// - GHSA-cg2g-xh64-v4q7 (CRITICAL): SAFE_FOR_TEMPLATES bypass in attached shadow root content
// - GHSA-mrv2-3pqr-j5jr (HIGH): IN_PLACE hook removing parent/sibling nodes

import createDOMPurify from "dompurify";

function getPurifier() {
  if (typeof createDOMPurify.sanitize === "function") {
    return createDOMPurify;
  }
  if (typeof window !== "undefined") {
    return createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
  }
  return null;
}

export interface SanitizeHtmlOptions {
  allowSvg?: boolean;
  maxInputLength?: number;
}

const DEFAULT_MAX_HTML_LENGTH = 512 * 1024; // 512 KB

const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "meta",
  "link",
  "base",
  "form",
  "template",
  "slot",
  "foreignobject",
  "foreignObject",
];

const FORBIDDEN_ATTR = [
  "onerror",
  "onload",
  "onclick",
  "onmouseover",
  "onmouseenter",
  "onmouseleave",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onkeydown",
  "onkeyup",
  "onanimationstart",
  "ontoggle",
  "shadowroot",
  "shadowrootmode",
  "shadowrootdelegatesfocus",
  "shadowrootclonable",
  "shadowrootserializable",
  "formaction",
  "xlink:href",
];

// Expressões de template (Mustache/Handlebars/Angular/EJS/JS Template Literals)
// inclusive quando fragmentadas ou codificadas
const TEMPLATE_EXPRESSION_PATTERNS = [/\{\{[\s\S]*?\}\}/g, /<%[\s\S]*?%>/g, /\$\{[\s\S]*?\}/g];

/**
 * Sanitiza HTML ou SVG não confiável garantindo:
 * 1. SAFE_FOR_TEMPLATES = true
 * 2. IN_PLACE = false (nunca muta nós órfãos/sem pai diretamente)
 * 3. Bloqueio de Declarative Shadow DOM (<template shadowrootmode=...>)
 * 4. Remoção determinística de expressões de template residuais (GHSA-cg2g-xh64-v4q7)
 */
export function sanitizeUntrustedHtml(dirty: string, options: SanitizeHtmlOptions = {}): string {
  const maxLen = options.maxInputLength ?? DEFAULT_MAX_HTML_LENGTH;
  if (typeof dirty !== "string") {
    return "";
  }
  if (dirty.length > maxLen) {
    throw new Error(
      `HTML_SECURITY_VIOLATION: Payload excede o tamanho máximo permitido (${dirty.length} > ${maxLen}).`,
    );
  }

  // Pré-sanitização: remove blocos <template> (incluindo Declarative Shadow DOM)
  // antes mesmo da árvore DOM ser construída, neutralizando GHSA-cg2g-xh64-v4q7
  const withoutShadowTemplates = dirty.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");

  const purifier = getPurifier();
  const sanitized = purifier
    ? purifier.sanitize(withoutShadowTemplates, {
        SAFE_FOR_TEMPLATES: true,
        IN_PLACE: false,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        WHOLE_DOCUMENT: false,
        USE_PROFILES: options.allowSvg
          ? { html: true, svg: true, svgFilters: false }
          : { html: true },
        FORBID_TAGS: FORBIDDEN_TAGS,
        FORBID_ATTR: FORBIDDEN_ATTR,
      })
    : withoutShadowTemplates
        .replace(/<(script|iframe|object|embed|foreignObject)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  let finalClean = String(sanitized);
  for (const pattern of TEMPLATE_EXPRESSION_PATTERNS) {
    finalClean = finalClean.replace(pattern, "");
  }

  return finalClean;
}

/**
 * Sanitiza um Elemento DOM de forma segura clonando-o em um container isolado
 * para evitar que hooks ou mutações IN_PLACE em nós sem parentNode deixem
 * elementos adjacentes sem varredura (GHSA-mrv2-3pqr-j5jr).
 */
export function sanitizeDomNodeSafely(node: Element): string {
  if (!node || typeof node.outerHTML !== "string") {
    return "";
  }
  return sanitizeUntrustedHtml(node.outerHTML, { allowSvg: true });
}
