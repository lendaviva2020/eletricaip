// Mantém o Ladder acompanhando o unifilar (mesmo projeto, dois editores).
// Montado no workspace: qualquer equipamento criado/alterado/removido no
// unifilar reflete nas redes geradas em ~0,4 s, sem tocar nas redes do usuário
// nem nas geradas que ele editou.
import { useEffect } from "react";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { buildLadderFromUnifilar, mergeUnifilarRungs } from "@/lib/ladder/from-unifilar";
import { useLadderUnifilarSync } from "@/lib/ladder/unifilar-sync-store";

const DEBOUNCE_MS = 400;

export function syncLadderWithUnifilarNow(): void {
  const doc = useDiagramStore.getState().doc;
  const { rungs, tags, warnings } = buildLadderFromUnifilar(doc);
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
