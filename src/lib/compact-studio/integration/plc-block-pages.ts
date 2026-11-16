/**
 * Blocos FBD do editor de CLP ↔ páginas do FB Electric Studio.
 *
 * Cada bloco de programa em FBD (OB/FC/FB) passa a ser UMA página do Studio
 * (`plc-<id do bloco>`). Blocos que ainda guardam o formato antigo
 * (`block.fbd.nodes`) são importados para a página na primeira abertura.
 */
import { create } from "zustand";
import type { PlcProgramBlock } from "@/lib/plc/types";
import type { CompactProgramModel } from "../domain/types";
import { hasLegacyFbdContent, importLegacyFbdIntoStudio } from "../conversion/legacy-fbd-import";

export function plcBlockPageId(blockId: string): string {
  return `plc-${blockId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}`;
}

export function plcBlockPageName(block: Pick<PlcProgramBlock, "type" | "number" | "name">): string {
  return `${block.type}${block.number} · ${block.name}`.slice(0, 80);
}

export interface EnsurePageResult {
  readonly model: CompactProgramModel;
  readonly pageId: string;
  /** true quando o snapshot antigo do bloco foi trazido nesta chamada. */
  readonly importedLegacy: boolean;
  readonly changed: boolean;
}

/** Garante a página do bloco no modelo (pura; não grava em store). */
export function ensurePlcBlockPage(
  model: CompactProgramModel,
  block: Pick<PlcProgramBlock, "id" | "type" | "number" | "name" | "fbd">,
): EnsurePageResult {
  const pageId = plcBlockPageId(block.id);
  const exists = model.pages.some((p) => p.id === pageId);
  const legacyNodes = block.fbd?.nodes ?? [];

  if (!exists && hasLegacyFbdContent(legacyNodes)) {
    const { model: next } = importLegacyFbdIntoStudio(model, legacyNodes, block.fbd?.edges ?? [], {
      pageId,
      pageName: plcBlockPageName(block),
    });
    return { model: next, pageId, importedLegacy: true, changed: true };
  }
  if (exists) return { model, pageId, importedLegacy: false, changed: false };

  return {
    model: {
      ...model,
      pages: [
        ...model.pages,
        {
          id: pageId,
          name: plcBlockPageName(block),
          order: model.pages.reduce((m, p) => Math.max(m, p.order), -1) + 1,
          description: "Bloco FBD do programa de CLP",
          gridCols: 24,
          gridRows: 16,
        },
      ],
    },
    pageId,
    importedLegacy: false,
    changed: true,
  };
}

interface StudioNavigationState {
  /** Página que o Studio deve abrir na próxima renderização. */
  requestedPageId: string | null;
  requestPage: (pageId: string) => void;
  consumeRequest: () => void;
}

export const useStudioNavigation = create<StudioNavigationState>((set) => ({
  requestedPageId: null,
  requestPage: (pageId) => set({ requestedPageId: pageId }),
  consumeRequest: () => set({ requestedPageId: null }),
}));
