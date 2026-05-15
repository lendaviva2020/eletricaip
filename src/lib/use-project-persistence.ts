import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProjectStore } from "@/lib/project-store";
import { useVoltaiStore } from "@/lib/voltai/store";
import { loadProject, saveProject } from "@/lib/projects.functions";
import { toast } from "sonner";

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
      .then((res: any) => {
        if (cancelled) return;
        const snap = res.snapshot;
        useProjectStore.getState().setAll(snap.project.nodes ?? [], snap.project.edges ?? []);
        useProjectStore.getState().setProjectId(projectId);
        useVoltaiStore
          .getState()
          .setAll(snap.voltai.components ?? [], snap.voltai.edges ?? []);
      })
      .catch((e: any) => {
        toast.error(`Falha ao carregar projeto: ${e.message ?? e}`);
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

    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 2000);
    }

    async function flush() {
      const ps = useProjectStore.getState();
      const vs = useVoltaiStore.getState();
      const snapshot = {
        project: { nodes: ps.nodes, edges: ps.edges },
        voltai: { components: vs.components, edges: vs.edges },
      };
      try {
        setSaveState("saving");
        await save({ data: { projectId: projectId!, snapshot } });
        ps.markSaved();
        vs.markSaved();
        setSaveState("saved");
      } catch (e: any) {
        setSaveState("error");
        toast.error(`Falha ao salvar: ${e.message ?? e}`);
      }
    }

    return () => {
      unsub();
      unsub2();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [projectId, save]);

  return { loading, saveState };
}

export async function snapshotVersion(projectId: string, save: any) {
  const ps = useProjectStore.getState();
  const vs = useVoltaiStore.getState();
  const snapshot = {
    project: { nodes: ps.nodes, edges: ps.edges },
    voltai: { components: vs.components, edges: vs.edges },
  };
  return save({ data: { projectId, snapshot, createVersion: true } });
}
