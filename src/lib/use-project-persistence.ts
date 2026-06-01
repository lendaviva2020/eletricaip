import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProjectStore } from "@/lib/project-store";
import { useVoltaiStore } from "@/lib/voltai/store";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { usePlcStore } from "@/lib/plc/store";
import { loadProject, saveProject } from "@/lib/projects.functions";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import type { DiagramDoc } from "@/lib/diagram/schema";
import type { PlcProject } from "@/lib/plc/types";
import type { IndustrialNode, IndustrialEdge } from "@/lib/project-store";
import { toast } from "sonner";

interface LoadProjectResponse {
  snapshot: ProjectSnapshot;
  diagramId: string | null;
  version: number;
  project: {
    id: string;
    name: string;
    description: string | null;
    client: string | null;
  };
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useProjectPersistence(projectId: string | null) {
  const load = useServerFn(loadProject);
  const save = useServerFn(saveProject);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount / id change
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    load({ data: { projectId } })
      .then((res: LoadProjectResponse) => {
        if (cancelled) return;
        const snap = res.snapshot;

        // ProjectStore: nodes, edges, tags, runtime
        useProjectStore
          .getState()
          .hydrateSnapshot(
            snap.project.nodes as IndustrialNode[],
            snap.project.edges as IndustrialEdge[],
            snap.project.tags,
          );
        useProjectStore.getState().setProjectId(projectId);

        // DiagramStore: WebGL unifilar doc
        if (snap.diagram) {
          useDiagramStore.getState().loadDoc(snap.diagram as DiagramDoc);
        } else {
          useDiagramStore.getState().resetDoc();
        }

        // VoltaiStore: LEGACY unifilar (ReactFlow)
        useVoltaiStore.getState().setAll(snap.voltai.components ?? [], snap.voltai.edges ?? []);

        // EditorStore: tags, ladder rungs, FBD
        useEditorStore.getState().hydrateSnapshot(snap.editor);

        // Restore SCADA layout
        const scadaLayout = snap.project.scadaLayout;
        if (scadaLayout?.nodes?.length || scadaLayout?.edges?.length) {
          useProjectStore
            .getState()
            .hydrateScadaLayout(
              scadaLayout.nodes as IndustrialNode[],
              scadaLayout.edges as IndustrialEdge[],
            );
        }

        // Restore PLC project
        if (snap.plc) {
          usePlcStore.getState().setProject(snap.plc as PlcProject);
        }
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        toast.error(`Falha ao carregar projeto: ${message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, load]);

  // Debounced auto-save when dirty
  useEffect(() => {
    if (!projectId) return;
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule();
    });
    const unsub2 = useVoltaiStore.subscribe((s, prev) => {
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule();
    });
    const unsub3 = useEditorStore.subscribe((s, prev) => {
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule();
    });
    const unsub4 = useDiagramStore.subscribe((s, prev) => {
      if (!s.doc.version || s.doc.version === prev.doc.version) return;
      schedule();
    });
    const unsub5 = usePlcStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      schedule();
    });

    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 2000);
    }

    async function flush() {
      const ps = useProjectStore.getState();
      const vs = useVoltaiStore.getState();
      const es = useEditorStore.getState();
      const ds = useDiagramStore.getState();

      const snapshot = buildProjectSnapshot();
      try {
        setSaveState("saving");
        await save({ data: { projectId: projectId!, snapshot } });
        ps.markSaved();
        vs.markSaved();
        es.markSaved();
        setSaveState("saved");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setSaveState("error");
        toast.error(`Falha ao salvar: ${message}`);
      }
    }

    return () => {
      unsub();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [projectId, save]);

  return { loading, saveState };
}

export async function snapshotVersion(projectId: string, save: ReturnType<typeof useServerFn<typeof saveProject>>) {
  const snapshot = buildProjectSnapshot();
  return save({ data: { projectId, snapshot, createVersion: true } });
}

export function buildProjectSnapshot(): ProjectSnapshot {
  const ps = useProjectStore.getState();
  const vs = useVoltaiStore.getState();
  const es = useEditorStore.getState();
  const ds = useDiagramStore.getState();
  const pls = usePlcStore.getState();

  return {
    schemaVersion: 2,
    project: {
      nodes: ps.nodes,
      edges: ps.edges,
      tags: ps.tags,
      scadaLayout: {
        nodes: ps.nodes.filter(
          (n) => n.category === "inst" || n.category === "logic" || n.category === "mech",
        ),
        edges: ps.edges,
      },
    },
    voltai: { components: vs.components, edges: vs.edges },
    editor: {
      tags: es.editorTags,
      rungs: es.rungs,
      fbdNodes: es.fbdNodes,
      fbdEdges: es.fbdEdges,
    },
    diagram: ds.doc as DiagramDoc,
    plc: pls.project as PlcProject,
  };
}
