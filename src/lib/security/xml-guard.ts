/**
 * ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
 * Safe XML Parsing & XXE / Resource Exhaustion Guard (@xmldom/xmldom >= 0.8.15)
 *
 * Mitigates and enforces regression defenses for:
 * - CVE-2026-83605, CVE-2026-83607, CVE-2026-83608, CVE-2026-83610,
 *   CVE-2026-83611, CVE-2026-83613, CVE-2026-83614, CVE-2026-83615,
 *   CVE-2026-83616, CVE-2026-83619
 */

import { DOMParser } from "@xmldom/xmldom";

export const XML_GUARD_VERSION = "3.8.2-XML-GUARD-v1.0";

export interface SafeXmlLimits {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxAttributesPerElement?: number;
  maxProcessingTimeMs?: number;
  allowProcessingInstructions?: boolean;
}

export interface SafeXmlParseResult {
  rootTagName: string;
  nodeCount: number;
  maxDepthObserved: number;
  elapsedMs: number;
}

const VALID_XML_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9._:-]{0,127}$/;

/**
 * Parses untrusted XML safely with @xmldom/xmldom >= 0.8.15 while enforcing:
 * - Strict byte-size limit (default 128 KB)
 * - Prohibition of DOCTYPE, ENTITY, SYSTEM, PUBLIC (XXE / Billion Laughs prevention)
 * - Prohibition of Processing Instructions by default (`<?...?>` other than `<?xml ...?>` prolog)
 * - Strict validation of element & attribute names
 * - Bounds on element nesting depth, total node count, and parse duration
 */
export function parseSafeIndustrialXml(
  xmlInput: string,
  limits: SafeXmlLimits = {},
): SafeXmlParseResult {
  if (typeof xmlInput !== "string") {
    throw new TypeError("XML input must be a string.");
  }

  const startMs = performance.now();
  const maxBytes = limits.maxBytes ?? 131_072; // 128 KB
  const maxDepth = limits.maxDepth ?? 32;
  const maxNodes = limits.maxNodes ?? 2_000;
  const maxAttributesPerElement = limits.maxAttributesPerElement ?? 64;
  const maxProcessingTimeMs = limits.maxProcessingTimeMs ?? 500;

  const byteLen = new TextEncoder().encode(xmlInput).byteLength;
  if (byteLen === 0) {
    throw new Error("XML input cannot be empty.");
  }
  if (byteLen > maxBytes) {
    throw new RangeError(`XML input size (${byteLen} bytes) exceeds maximum (${maxBytes} bytes).`);
  }

  // Block DOCTYPE, ENTITY, NOTATION, SYSTEM, PUBLIC declarations (XXE & entity expansion)
  if (/<!\s*(DOCTYPE|ENTITY|NOTATION)\b/i.test(xmlInput)) {
    throw new Error(
      "XML DOCTYPE, ENTITY, and NOTATION declarations are forbidden (XXE/DTD protection).",
    );
  }

  // Block external entity references (&ext; outside standard 5 XML entities)
  const strippedStandardEntities = xmlInput.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,
    "",
  );
  if (/&[A-Za-z_][A-Za-z0-9._:-]*;/.test(strippedStandardEntities)) {
    throw new Error("Custom or external XML entity references are forbidden.");
  }

  // Block processing instructions other than the leading <?xml ...?> declaration
  if (!limits.allowProcessingInstructions) {
    const withoutXmlDecl = xmlInput.replace(/^\s*<\?xml\b[^?]*\?>/i, "");
    if (/<\?/.test(withoutXmlDecl)) {
      throw new Error("XML processing instructions (<?...?>) are forbidden.");
    }
  }

  const parseErrors: string[] = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: (msg: string) => {
        parseErrors.push(`[warning] ${msg}`);
      },
      error: (msg: string) => {
        parseErrors.push(`[error] ${msg}`);
      },
      fatalError: (msg: string) => {
        parseErrors.push(`[fatalError] ${msg}`);
      },
    },
  });

  const doc = parser.parseFromString(xmlInput, "application/xml");
  if (parseErrors.length > 0) {
    throw new Error(`Malformed XML rejected: ${parseErrors[0]}`);
  }

  const root = doc.documentElement;
  if (!root || !root.tagName) {
    throw new Error("XML document lacks a valid root element.");
  }

  let nodeCount = 0;
  let maxDepthObserved = 0;

  const stack: Array<{ node: Node; depth: number }> = [{ node: root, depth: 1 }];

  while (stack.length > 0) {
    if (performance.now() - startMs > maxProcessingTimeMs) {
      throw new Error(`XML traversal exceeded time budget (${maxProcessingTimeMs} ms).`);
    }

    const current = stack.pop()!;
    nodeCount++;
    if (nodeCount > maxNodes) {
      throw new RangeError(`XML node count (${nodeCount}) exceeds maximum (${maxNodes}).`);
    }

    if (current.depth > maxDepthObserved) {
      maxDepthObserved = current.depth;
    }
    if (current.depth > maxDepth) {
      throw new RangeError(`XML nesting depth (${current.depth}) exceeds maximum (${maxDepth}).`);
    }

    const node = current.node;
    // NodeType 7 = PROCESSING_INSTRUCTION_NODE, NodeType 10 = DOCUMENT_TYPE_NODE
    if (node.nodeType === 10) {
      throw new Error("XML DocumentType node detected and rejected.");
    }
    if (node.nodeType === 7 && !limits.allowProcessingInstructions) {
      throw new Error("XML ProcessingInstruction node detected and rejected.");
    }

    if (node.nodeType === 1) {
      const el = node as Element;
      if (!VALID_XML_NAME_REGEX.test(el.tagName)) {
        throw new Error(`Invalid XML element name rejected: '${el.tagName}'`);
      }

      const attrs = el.attributes;
      if (attrs) {
        if (attrs.length > maxAttributesPerElement) {
          throw new RangeError(
            `Element '${el.tagName}' has ${attrs.length} attributes, exceeding limit (${maxAttributesPerElement}).`,
          );
        }
        const seenAttrNames = new Set<string>();
        for (let i = 0; i < attrs.length; i++) {
          const attr = attrs.item(i);
          if (!attr) continue;
          if (!VALID_XML_NAME_REGEX.test(attr.name)) {
            throw new Error(`Invalid XML attribute name rejected: '${attr.name}'`);
          }
          if (seenAttrNames.has(attr.name)) {
            throw new Error(`Duplicate XML attribute rejected: '${attr.name}'`);
          }
          seenAttrNames.add(attr.name);
        }
      }
    }

    const children = node.childNodes;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children.item(i);
        if (child) {
          stack.push({ node: child, depth: current.depth + 1 });
        }
      }
    }
  }

  return {
    rootTagName: root.tagName,
    nodeCount,
    maxDepthObserved,
    elapsedMs: Math.round((performance.now() - startMs) * 100) / 100,
  };
}
