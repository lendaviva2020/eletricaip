// Mantém o Ladder e o FB Electric Studio acompanhando o unifilar (mesmo projeto).
// Montado no workspace: qualquer equipamento criado/alterado/removido no
// unifilar reflete nas redes geradas em ~0,4 s, sem tocar nas redes do usuário
// nem nas geradas que ele editou.
import { useEffect } from "react";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { buildLadderFromUnifilar, mergeUnifilarRungs } from "@/lib/ladder/from-unifilar";
import { useLadderUnifilarSync } from "@/lib/ladder/unifilar-sync-store";
import { autoSyncStudioFromUnifilar } from "@/lib/compact-studio/integration/unifilar-motor-program";
import { currentStudioModel } from "@/lib/compact-studio/integration/legacy-fbd-migration";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";

const DEBOUNCE_MS = 400;

export function syncLadderWithUnifilarNow(): void {
  const doc = useDiagramStore.getState().doc;
  const { rungs, tags, warnings } = buildLadderFromUnifilar(doc);

  // FB Electric Studio: a página "Motores (unifilar)" acompanha o mesmo diagrama.
  try {
    const studio = autoSyncStudioFromUnifilar(currentStudioModel(), doc);
    if (studio.status === "updated") {
      useUnifiedProjectStore.getState().setCompactStudioProgram(studio.model);
    } else if (studio.status === "edited_by_user") {
      warnings.push(
        'FB Electric Studio: a página "Motores (unifilar)" foi editada por você e não é mais atualizada automaticamente — use "Gerar do unifilar" no Studio para regenerar.',
      );
    }
  } catch (err) {
    console.error("[studio] sincronização com o unifilar falhou:", err);
  }
  useLadderUnifilarSync.getState().setWarnings(warnings);
  const editor = useEditorStore.getState();
  for (const tag of tags) {
    // Só cria o que falta: valores e forçamentos do usuário ficam como estão.
    if (
      !editor.editorTags[tag.id] &&
      !Object.values(editor.editorTags).some((t) => t.name === tag.name)
    ) {
      editor.upsertTag(tag);
    }
  }
  const current = editor.rungs;
  const next = mergeUnifilarRungs(current, rungs);
  if (next !== current) editor.setRungs(next);
}

export function useUnifilarLadderSync(ready: boolean): void {
  const enabled = useLadderUnifilarSync((s) => s.enabled);
  useEffect(() => {
    if (!ready || !enabled) return;
    let handle: number | undefined;
    const schedule = () => {
      window.clearTimeout(handle);
      handle = window.setTimeout(() => {
        try {
          syncLadderWithUnifilarNow();
        } catch (err) {
          console.error("[ladder] sincronização com o unifilar falhou:", err);
        }
      }, DEBOUNCE_MS);
    };
    schedule();
    let prevDoc = useDiagramStore.getState().doc;
    const unsub = useDiagramStore.subscribe((s) => {
      if (s.doc === prevDoc) return;
      prevDoc = s.doc;
      schedule();
    });
    return () => {
      window.clearTimeout(handle);
      unsub();
    };
  }, [ready, enabled]);
}
