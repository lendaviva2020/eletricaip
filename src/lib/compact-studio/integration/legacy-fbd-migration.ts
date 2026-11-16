/**
 * Migração única, no carregamento do projeto, do antigo editor FBD para o
 * FB Electric Studio. Só apaga o formato antigo DEPOIS que o modelo do Studio
 * aceitou a conversão — se a validação falhar, nada é perdido e a migração é
 * tentada de novo no próximo carregamento.
 */
import { useEditorStore } from "@/lib/editor/store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { createEmptyCompactProgramModel } from "../domain/migrations";
import { PRODUCT_NAME } from "../branding";
import {
  LEGACY_FBD_PAGE_ID,
  hasLegacyFbdContent,
  importLegacyFbdIntoStudio,
  type LegacyFbdImportReport,
} from "../conversion/legacy-fbd-import";

export function currentStudioModel() {
  return (
    useUnifiedProjectStore.getState().doc.compactStudio ??
    createEmptyCompactProgramModel({ id: "compact-prog-main", name: `${PRODUCT_NAME} Projeto` })
  );
}

export function migrateLegacyFbdIntoStudio(): LegacyFbdImportReport | null {
  const editor = useEditorStore.getState();
  if (!hasLegacyFbdContent(editor.fbdNodes)) return null;
  try {
    const current = currentStudioModel();
    // Já migrado: a página é do usuário agora. Nunca sobrescrever o que ele
    // editou com uma cópia antiga que reapareceu — só descarta o formato antigo.
    if (current.pages.some((p) => p.id === LEGACY_FBD_PAGE_ID)) {
      editor.setFbdAll([], []);
      return null;
    }
    const { model, report } = importLegacyFbdIntoStudio(current, editor.fbdNodes, editor.fbdEdges);
    useUnifiedProjectStore.getState().setCompactStudioProgram(model);
    editor.setFbdAll([], []);
    return report;
  } catch (err) {
    console.warn("[FB Electric Studio] migração do FBD antigo adiada:", err);
    return null;
  }
}
