/**
 * Cross-Reference Indexer across all pages for Compact Studio symbols, I/O addresses,
 * timer/counter blocks, and inter-page connectors (PAGE_OUT -> PAGE_IN).
 */
import type { CompactProgramModel } from "../domain/types";

export interface CrossReferenceHit {
  readonly key: string;
  readonly kind: "io" | "block" | "connector";
  readonly pageId: string;
  readonly pageName: string;
  readonly nodeId: string;
  readonly instanceName: string;
  readonly blockType: string;
  readonly role: "read" | "write" | "instance" | "page_out" | "page_in";
}

export interface CrossReferenceSummary {
  readonly key: string;
  readonly kind: "io" | "block" | "connector";
  readonly totalHits: number;
  readonly hits: readonly CrossReferenceHit[];
}

export function buildCrossReferenceIndex(model: CompactProgramModel): readonly CrossReferenceSummary[] {
  const pageNameById = new Map(model.pages.map((p) => [p.id, p.name]));
  const symbolById = new Map(model.ioSymbols.map((s) => [s.id, s]));
  const grouped = new Map<string, { kind: CrossReferenceSummary["kind"]; hits: CrossReferenceHit[] }>();

  const pushHit = (hit: CrossReferenceHit) => {
    const existing = grouped.get(hit.key) ?? { kind: hit.kind, hits: [] };
    existing.hits.push(hit);
    grouped.set(hit.key, existing);
  };

  for (const node of model.nodes) {
    const pageName = pageNameById.get(node.pageId) ?? node.pageId;
    if (node.blockType === "PAGE_OUT" || node.blockType === "PAGE_IN") {
      const connectorKey = String(node.params.connectorKey ?? node.instanceName).trim();
      pushHit({
        key: connectorKey,
        kind: "connector",
        pageId: node.pageId,
        pageName,
        nodeId: node.id,
        instanceName: node.instanceName,
        blockType: node.blockType,
        role: node.blockType === "PAGE_OUT" ? "page_out" : "page_in",
      });
      continue;
    }

    if (
      node.blockType === "INPUT_DI" ||
      node.blockType === "INPUT_AI" ||
      node.blockType === "OUTPUT_QO" ||
      node.blockType === "OUTPUT_AO" ||
      node.blockType === "FLAG_M" ||
      node.blockType === "FLAG_AM"
    ) {
      const sym = node.ioSymbolId ? symbolById.get(node.ioSymbolId) : undefined;
      const addr = sym?.address ?? String(node.params.address ?? node.instanceName);
      const isWrite = node.blockType.startsWith("OUTPUT_");
      pushHit({
        key: addr,
        kind: "io",
        pageId: node.pageId,
        pageName,
        nodeId: node.id,
        instanceName: node.instanceName,
        blockType: node.blockType,
        role: isWrite ? "write" : "read",
      });
      continue;
    }

    pushHit({
      key: node.instanceName,
      kind: "block",
      pageId: node.pageId,
      pageName,
      nodeId: node.id,
      instanceName: node.instanceName,
      blockType: node.blockType,
      role: "instance",
    });
  }

  return Array.from(grouped.entries())
    .map(([key, entry]) => ({
      key,
      kind: entry.kind,
      totalHits: entry.hits.length,
      hits: entry.hits,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
