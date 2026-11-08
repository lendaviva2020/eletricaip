/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * DOMPurify & HTML/Template Sanitization Hardening Guard
 *
 * Mitigates and enforces regression defenses for:
 * - GHSA-cg2g-xh64-v4q7 (CRITICAL): SAFE_FOR_TEMPLATES split expression bypass in attached shadow roots on DOM output modes
 * - GHSA-mrv2-3pqr-j5jr (HIGH): IN_PLACE hook removing parent/sibling leaves detached subtree event handlers armed
 * - GHSA-6688-9rhm-gjv2 (LOW): IN_PLACE returns force-removed rawtext root (<style>) whose text carries attacker markup
 * - GHSA-c6gr-qvv4-5v3f (LOW): SMIL attributeName=href guard skipped when PARSER_MEDIA_TYPE is application/xhtml+xml
 * - GHSA-p98j-92pf-mc4p (LOW): IN_PLACE node-removing afterSanitize hook leaves detached subtree event handlers armed
 */

import createDOMPurify, { type DOMPurify as DOMPurifyInstance } from "dompurify";

export const DOMPURIFY_HARDENING_VERSION = "3.8.2-DOMPURIFY-GUARD-v1.0";

let cachedPurifier: DOMPurifyInstance | null = null;

export function getDomPurifyInstance(customWindow?: unknown): DOMPurifyInstance | null {
  if (customWindow) {
    return createDOMPurify(customWindow as Parameters<typeof createDOMPurify>[0]);
  }
  if (cachedPurifier) {
    return cachedPurifier;
  }
  if (typeof (createDOMPurify as unknown as DOMPurifyInstance).sanitize === "function") {
    cachedPurifier = createDOMPurify as unknown as DOMPurifyInstance;
    return cachedPurifier;
  }
  if (typeof window !== "undefined") {
    cachedPurifier = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
    return cachedPurifier;
  }
  return null;
}

export interface IndustrialSanitizeOptions {
  allowBasicFormatting?: boolean;
  stripTemplateExpressions?: boolean;
  maxInputBytes?: number;
}

export interface DomPurifyConfigValidation {
  valid: boolean;
  violations: string[];
}

const TEMPLATE_EXPRESSION_PATTERNS: readonly RegExp[] = [
  /\{\{[^{}]*\}\}/g,
  /\$\{[^{}]*\}/g,
  /\{\{[\s\S]*?\}\}/g,
  /\$\{[\s\S]*?\}/g,
  /<%[\s\S]*?%>/g,
];

const DECLARATIVE_SHADOW_DOM_PATTERN =
  /<template\b[^>]*\bshadowroot(?:mode|delegatesfocus|clonable|serializable)\b[^>]*>/gi;

const FORBIDDEN_SMIL_TAGS = [
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "mpath",
  "foreignobject",
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "meta",
  "link",
  "base",
];

const FORBIDDEN_SMIL_ATTRIBUTES = [
  "attributename",
  "attributeName",
  "attributetype",
  "attributeType",
  "values",
  "from",
  "to",
  "by",
  "onbegin",
  "onend",
  "onrepeat",
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onfocus",
];

/**
 * Validates any raw DOMPurify configuration object against unsafe options
 * implicated in GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr, GHSA-6688-9rhm-gjv2,
 * GHSA-c6gr-qvv4-5v3f, and GHSA-p98j-92pf-mc4p.
 */
export function validateDomPurifyConfig(
  config: Record<string, unknown>,
): DomPurifyConfigValidation {
  const violations: string[] = [];

  if (config.IN_PLACE === true) {
    violations.push(
      "IN_PLACE=true is forbidden on untrusted content (GHSA-mrv2-3pqr-j5jr, GHSA-6688-9rhm-gjv2, GHSA-p98j-92pf-mc4p).",
    );
  }
  if (config.RETURN_DOM === true || config.RETURN_DOM_FRAGMENT === true) {
    violations.push(
      "DOM-returning modes (RETURN_DOM / RETURN_DOM_FRAGMENT) are forbidden; prefer string output (GHSA-cg2g-xh64-v4q7).",
    );
  }
  if (
    typeof config.PARSER_MEDIA_TYPE === "string" &&
    config.PARSER_MEDIA_TYPE.toLowerCase() !== "text/html"
  ) {
    violations.push(
      `PARSER_MEDIA_TYPE='${config.PARSER_MEDIA_TYPE}' is forbidden; only 'text/html' is permitted (GHSA-c6gr-qvv4-5v3f).`,
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Iteratively scrubs Mustache `{{...}}`, JS template literal `${...}`, and ERB `<%...%>`
 * expressions until reaching a fixed point so split expressions merged after element
 * removal cannot survive.
 */
export function scrubTemplateExpressionsRecursive(input: string): string {
  let current = input;
  for (let pass = 0; pass < 6; pass++) {
    let next = current;
    for (const pattern of TEMPLATE_EXPRESSION_PATTERNS) {
      next = next.replace(pattern, "");
    }
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

/**
 * Sanitizes untrusted HTML or SVG string input strictly in string-to-string mode
 * with text/html parser semantics, SMIL animation blocking, declarative Shadow DOM stripping,
 * and post-sanitization multi-pass template expression scrubbing.
 */
export function sanitizeIndustrialHtml(
  dirtyInput: unknown,
  options: IndustrialSanitizeOptions = {},
): string {
  if (typeof dirtyInput !== "string") {
    throw new TypeError(
      "sanitizeIndustrialHtml requires a string input; DOM Node and ShadowRoot inputs are forbidden (GHSA-cg2g-xh64-v4q7 / GHSA-6688-9rhm-gjv2).",
    );
  }

  const maxBytes = options.maxInputBytes ?? 262_144; // 256 KB default limit
  if (new TextEncoder().encode(dirtyInput).byteLength > maxBytes) {
    throw new RangeError(`HTML input exceeds maximum allowed byte length (${maxBytes} bytes).`);
  }

  const stripTemplates = options.stripTemplateExpressions ?? true;

  // Pre-strip declarative shadow DOM templates and raw template expressions
  let preCleaned = dirtyInput
    .replace(DECLARATIVE_SHADOW_DOM_PATTERN, "")
    .replace(
      /<(script|style|iframe|object|embed|animate|set|mpath|foreignobject)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(
      /<(script|style|iframe|object|embed|animate|set|mpath|foreignobject)\b[^>]*\/?>/gi,
      "",
    );
  if (stripTemplates) {
    preCleaned = scrubTemplateExpressionsRecursive(preCleaned);
  }

  const purifier = getDomPurifyInstance();
  const sanitized = purifier
    ? (purifier.sanitize(preCleaned, {
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        IN_PLACE: false,
        SAFE_FOR_TEMPLATES: stripTemplates,
        SAFE_FOR_XML: true,
        PARSER_MEDIA_TYPE: "text/html",
        FORBID_TAGS: FORBIDDEN_SMIL_TAGS,
        FORBID_ATTR: FORBIDDEN_SMIL_ATTRIBUTES,
      }) as string)
    : preCleaned.replace(
        /\s(?:on[a-z]+|attributename|values|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
        "",
      );

  const postCleaned = stripTemplates ? scrubTemplateExpressionsRecursive(sanitized) : sanitized;

  return postCleaned;
}
