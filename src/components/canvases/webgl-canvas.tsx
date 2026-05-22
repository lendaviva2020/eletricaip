// Canvas WebGL único, parametrizado por sheet. Lê o doc do useDiagramStore,
// sincroniza o scene graph Pixi de forma incremental, e despacha comandos
// de Move/Seleção de volta para o store.
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Redo2, Undo2 } from "lucide-react";
import { DiagramStage } from "@/lib/diagram/render/stage";
import { cmd } from "@/lib/diagram/commands";
import { useDiagramStore } from "@/lib/diagram/store";
import type { SheetKind } from "@/lib/diagram/schema";

interface Props {
  sheet?: SheetKind;
}

export function WebglCanvas({ sheet }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<DiagramStage | null>(null);

  const activeSheet = useDiagramStore((s) => s.activeSheet);
  const effectiveSheet = sheet ?? activeSheet;
  const doc = useDiagramStore((s) => s.doc);
  const selectedNodeIds = useDiagramStore((s) => s.selectedNodeIds);
  const dispatch = useDiagramStore((s) => s.dispatch);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);

  // mount / unmount stage
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const stage = new DiagramStage();
    stageRef.current = stage;
    stage
      .init(host, {
        onSelectNode: (id) => setSelection(id ? [id] : []),
        onMoveNode: (id, from, to) => dispatch(cmd.move(id, from, to)),
      })
      .then(() => {
        if (disposed) return;
        stage.fitView();
        stage.sync(useDiagramStore.getState().doc, effectiveSheet, useDiagramStore.getState().selectedNodeIds);
      });
    return () => {
      disposed = true;
      stage.destroy();
      stageRef.current = null;
    };
    // só monta uma vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync em qualquer mudança relevante
  useEffect(() => {
    stageRef.current?.sync(doc, effectiveSheet, selectedNodeIds);
  }, [doc, effectiveSheet, selectedNodeIds]);

  // atalhos undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="relative h-full w-full bg-[#0b0f17]">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-md border border-border/40 bg-background/80 p-1 backdrop-blur">
        <Button size="icon" variant="ghost" onClick={undo} title="Desfazer (⌘Z)">
          <Undo2 className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={redo} title="Refazer (⌘⇧Z)">
          <Redo2 className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => stageRef.current?.fitView()} title="Ajustar à tela">
          <Maximize2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
