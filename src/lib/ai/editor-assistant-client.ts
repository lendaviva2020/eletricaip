// Lado do navegador do assistente por editor: monta o contexto real do editor
// aberto e executa as ações validadas nos stores, guardando um ponto de
// restauração para "Desfazer".
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore, type EditorTag } from "@/lib/editor/store";
import type { LadderRung } from "@/lib/ladder/types";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { useScadaStore } from "@/lib/scada/scada-store";
import { useLadderUnifilarSync } from "@/lib/ladder/unifilar-sync-store";
import { syncLadderWithUnifilarNow } from "@/hooks/use-unifilar-ladder-sync";
import { syncMotorLogicFromUnifilar } from "@/lib/compact-studio/integration/unifilar-motor-program";
import { currentStudioModel } from "@/lib/compact-studio/integration/legacy-fbd-migration";
import { applyCableSizing } from "@/components/editor/cable-table";
import type { WorkspaceMode } from "@/lib/workspace-data";
import {
  buildAlarmsContext,
  buildDiagramContext,
  buildGenericContext,
  buildLadderContext,
  buildStudioContext,
  type AssistantEditor,
  type EditorContext,
} from "./editor-context";
import { applyLadderActions, buildDiagramValueCommand, type EditorAction } from "./editor-actions";

/** Contexto REAL do editor, lido dos stores no momento do envio. */
export function readEditorContext(editor: AssistantEditor): EditorContext {
  switch (editor) {
    case "unifilar":
    case "multifilar":
      return buildDiagramContext(useDiagramStore.getState().doc, editor);
    case "ladder": {
      const s = useEditorStore.getState();
      return buildLadderContext(s.rungs, s.editorTags, useLadderUnifilarSync.getState().warnings);
    }
    case "studio":
      return buildStudioContext(useUnifiedProjectStore.getState().doc.compactStudio);
    case "scada":
    case "alarms":
    case "sim": {
      const alarms = useScadaStore
        .getState()
        .alarms.filter((a) => a.state !== "CLEARED" && a.state !== "SHELVED")
        .map((a) => ({
          id: a.tag || a.id,
          message: a.description,
          state: a.state,
          priority: a.priority,
        }));
      return buildAlarmsContext(editor, alarms);
    }
    default:
      return buildGenericContext(editor, []);
  }
}

export interface UndoPoint {
  editor: AssistantEditor;
  restore: () => void;
}

export interface RunResult {
  notes: string[];
  /** Instruções de mudança estrutural no diagrama (executadas pelo motor de patch). */
  diagramChanges: string[];
  undo: UndoPoint | null;
}

let rungSeq = 0;
const newRungId = () => `ai-${Date.now().toString(36)}-${++rungSeq}`;

/**
 * Executa as ações do assistente no editor. Diagram changes voltam para quem
 * chamou (passam pelo motor de patch com reparo e créditos).
 */
export function runEditorActions(
  editor: AssistantEditor,
  actions: readonly EditorAction[],
): RunResult {
  const notes: string[] = [];
  const diagramChanges: string[] = [];
  let undo: UndoPoint | null = null;

  const ladderActions = actions.filter(
    (a) =>
      a.type === "ladder_set_tag" ||
      a.type === "ladder_upsert_rung" ||
      a.type === "ladder_remove_rung",
  );
  if (ladderActions.length > 0) {
    const s = useEditorStore.getState();
    const beforeRungs: LadderRung[] = s.rungs;
    const beforeTags: Record<string, EditorTag> = s.editorTags;
    const r = applyLadderActions(s.rungs, ladderActions, newRungId);
    s.setRungs(r.rungs);
    for (const tv of r.tagValues) {
      const existing =
        s.editorTags[tv.name] ??
        Object.values(useEditorStore.getState().editorTags).find((t) => t.name === tv.name);
      if (existing) {
        useEditorStore.getState().setTagValue(existing.id, tv.value);
      } else {
        useEditorStore.getState().upsertTag({
          id: tv.name,
          name: tv.name,
          type: typeof tv.value === "number" ? "INT" : "BOOL",
          value: tv.value,
          forced: false,
        });
      }
    }
    notes.push(...r.notes);
    undo = {
      editor,
      restore: () => {
        useEditorStore.getState().setRungs(beforeRungs);
        useEditorStore.setState({ editorTags: beforeTags });
      },
    };
  }

  const values = buildDiagramValueCommand(useDiagramStore.getState().doc, actions);
  if (values.command) {
    useDiagramStore.getState().dispatch(values.command);
    undo = { editor, restore: () => useDiagramStore.getState().undo() };
  }
  notes.push(...values.notes, ...values.errors.map((e) => `⚠️ ${e}`));

  for (const a of actions) {
    switch (a.type) {
      case "diagram_change":
        diagramChanges.push(a.instruction);
        break;
      case "diagram_dimension_cables": {
        const r = applyCableSizing();
        notes.push(
          r.changed > 0
            ? `${r.changed} cabo(s) dimensionado(s) pela NBR 5410${r.pending ? ` · ${r.pending} sem comprimento (informe na tabela)` : ""}`
            : "Cabos já atendem a NBR 5410",
        );
        undo = { editor, restore: () => useDiagramStore.getState().undo() };
        break;
      }
      case "ladder_resync_unifilar":
        syncLadderWithUnifilarNow();
        notes.push("Redes regeneradas a partir do unifilar");
        break;
      case "studio_regenerate_from_unifilar": {
        const before = currentStudioModel();
        const r = syncMotorLogicFromUnifilar(before, useDiagramStore.getState().doc);
        useUnifiedProjectStore.getState().setCompactStudioProgram(r.model);
        notes.push(`Página "Motores (unifilar)" regenerada (${r.motorsGenerated} motor(es))`);
        undo = {
          editor,
          restore: () => useUnifiedProjectStore.getState().setCompactStudioProgram(before),
        };
        break;
      }
      case "open_editor":
        useEditorStore.getState().setActiveMode(a.mode as WorkspaceMode);
        notes.push(`Abrindo o editor ${a.mode}`);
        break;
      default:
        break;
    }
  }
  return { notes, diagramChanges, undo };
}
