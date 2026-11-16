import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProjectStore } from "@/lib/project-store";

import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { usePlcStore } from "@/lib/plc/store";
import { migrateLegacyFbdIntoStudio } from "@/lib/compact-studio/integration/legacy-fbd-migration";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { loadProject, saveProject } from "@/lib/projects.functions";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import type { DiagramDoc } from "@/lib/diagram/schema";
import type { PlcProject } from "@/lib/plc/types";
import type { IndustrialNode, IndustrialEdge } from "@/lib/project-store";
import {
  repairDiagramConnections,
  synthesizeDiagramDocFromProject,
} from "@/lib/diagram/connection/connection-repair-engine";
import { useAutosaveLog } from "@/lib/autosave-log";
import { toast } from "sonner";
import { buildMccDemoDiagram, MCC_DEMO_DOC_ID } from "@/lib/simulation/mcc-demo-plant";

/**
 * Projeto de DEMONSTRAÇÃO local: carrega a planta-modelo no navegador e NUNCA
 * lê nem grava no servidor (sem autosave). Serve para apresentar o produto e
 * testar os editores sem depender do banco.
 */
export const DEMO_PROJECT_ID = MCC_DEMO_DOC_ID;
export function isDemoProject(projectId: string | null | undefined): boolean {
  return projectId === DEMO_PROJECT_ID;
}

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

export interface PersistenceConflict {
  message: string;
  occurredAt: number;
}

const AUTOSAVE_DEBOUNCE_MS = 2000;

export function useProjectPersistence(projectId: string | null) {
  const load = useServerFn(loadProject);
  const save = useServerFn(saveProject);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<PersistenceConflict | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const isHydratingRef = useRef(false);
  const currentVersionRef = useRef<number>(1);

  // Track mount lifecycle to prevent setState after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const performLoad = useCallback(async () => {
    if (!projectId) {
      useAutosaveLog.getState().log({
        kind: "skip:no-project",
        projectId: null,
        message: "Sem projectId — autosave desativado",
      });
      return;
    }

    if (isDemoProject(projectId)) {
      const ds = useDiagramStore.getState();
      // Só recarrega se o diagrama atual não for a demo (preserva edições na sessão).
      if (ds.doc.id !== MCC_DEMO_DOC_ID) ds.loadDoc(buildMccDemoDiagram());
      useProjectStore.getState().setProjectId(projectId);
      useAutosaveLog.getState().log({
        kind: "skip:no-project",
        projectId,
        message: "Projeto de demonstração local — autosave desativado",
      });
      return;
    }

    setLoading(true);
    isHydratingRef.current = true;
    useAutosaveLog.getState().log({
      kind: "load:start",
      projectId,
      message: "Carregando snapshot do servidor…",
    });

    try {
      const res: LoadProjectResponse = await load({ data: { projectId } });
      if (!mountedRef.current) return;
      const snap = res.snapshot;
      currentVersionRef.current = res.version ?? 1;
      setConflict(null);

      useProjectStore
        .getState()
        .hydrateSnapshot(
          snap.project.nodes as IndustrialNode[],
          snap.project.edges as IndustrialEdge[],
          snap.project.tags,
        );
      useProjectStore.getState().setProjectId(projectId);

      const ds = useDiagramStore.getState();
      let loadedDiagramDoc = snap.diagram as DiagramDoc | undefined;
      if (loadedDiagramDoc && Object.keys(loadedDiagramDoc.nodes ?? {}).length > 0) {
        // Se houver nós mas as conexões estiverem vazias ou desconectadas, repara
        if (
          Object.keys(loadedDiagramDoc.nodes).length > 1 &&
          (!loadedDiagramDoc.edges || Object.keys(loadedDiagramDoc.edges).length === 0)
        ) {
          const repaired = repairDiagramConnections(loadedDiagramDoc);
          loadedDiagramDoc = repaired.repairedDoc;
        }
        ds.loadDoc(loadedDiagramDoc);
      } else if (snap.project?.nodes && snap.project.nodes.length > 0) {
        // Fallback: Sintetiza DiagramDoc completo a partir do grafo do projeto
        const synthDoc = synthesizeDiagramDocFromProject(
          snap.project.nodes as IndustrialNode[],
          snap.project.edges as IndustrialEdge[],
        );
        ds.loadDoc(synthDoc);
      } else {
        ds.resetDoc();
      }

      useEditorStore.getState().hydrateSnapshot({
        editorTags: snap.editor.tags,
        rungs: snap.editor.rungs,
        fbdNodes: snap.editor.fbdNodes,
        fbdEdges: snap.editor.fbdEdges,
        fbdSim: snap.editor.fbdSim ?? null,
      });

      const scadaLayout = snap.project.scadaLayout;
      if (scadaLayout?.nodes?.length || scadaLayout?.edges?.length) {
        useProjectStore
          .getState()
          .hydrateScadaLayout(
            scadaLayout.nodes as IndustrialNode[],
            scadaLayout.edges as IndustrialEdge[],
          );
      }

      if (snap.plc) {
        usePlcStore.getState().setProject(snap.plc as PlcProject);
      }

      useUnifiedProjectStore.getState().hydrateFromV2Snapshot(
        snap,
        {
          id: res.project.id,
          name: res.project.name,
          description: res.project.description,
          client: res.project.client,
        },
        { syncLegacy: false },
      );

      // Clean dirty flags across stores
      useProjectStore.getState().markSaved();
      useEditorStore.getState().markSaved();
      useUnifiedProjectStore.getState().markSaved();

      // FBD e Studio são um só editor: lógica salva no formato antigo do FBD
      // passa para uma página do FB Electric Studio. Fica "sujo" de propósito,
      // para o autosave gravar a migração uma única vez.
      const fbdMigration = migrateLegacyFbdIntoStudio();
      if (fbdMigration) {
        useAutosaveLog.getState().log({
          kind: "load:success",
          projectId,
          message: `FBD antigo migrado para o FB Electric Studio (${fbdMigration.importedNodes} blocos, ${fbdMigration.importedConnections} ligações)`,
          meta: { skipped: fbdMigration.skipped.length },
        });
      }

      const diagramDoc = snap.diagram as DiagramDoc | undefined;
      useAutosaveLog.getState().log({
        kind: "load:success",
        projectId,
        message: "Snapshot carregado e canvas sincronizado",
        meta: {
          projectNodes: (snap.project.nodes ?? []).length,
          projectEdges: (snap.project.edges ?? []).length,
          diagramNodes: diagramDoc ? Object.keys(diagramDoc.nodes ?? {}).length : 0,
          diagramEdges: diagramDoc ? Object.keys(diagramDoc.edges ?? {}).length : 0,
          voltaiComponents: 0,
        },
      });
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const message = e instanceof Error ? e.message : String(e);
      useAutosaveLog.getState().log({
        kind: "load:error",
        projectId,
        message: `Falha ao carregar: ${message}`,
      });
      toast.error(`Falha ao carregar projeto: ${message}`);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      // Limpa flag de hidratação no próximo tick para que nenhum evento
      // disparado durante a montagem inicie um autosave fantasma
      queueMicrotask(() => {
        isHydratingRef.current = false;
      });
    }
  }, [projectId, load]);

  // Load on mount / id change
  useEffect(() => {
    performLoad();
  }, [performLoad]);

  // Debounced auto-save when dirty
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;

    const schedule = (reason: string) => {
      if (isHydratingRef.current) return;
      if (timer.current) clearTimeout(timer.current);
      useAutosaveLog.getState().log({
        kind: "schedule",
        projectId,
        message: `Mudança detectada (${reason}) — autosave em ${AUTOSAVE_DEBOUNCE_MS}ms`,
      });
      timer.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    };

    const flush = async () => {
      // Coalesce: if a save is in flight, mark pending and let it re-trigger after.
      if (savingRef.current) {
        pendingRef.current = true;
        return;
      }
      const ps = useProjectStore.getState();
      const es = useEditorStore.getState();
      const us = useUnifiedProjectStore.getState();

      const snapshot = buildProjectSnapshot();
      savingRef.current = true;
      if (mountedRef.current) setSaveState("saving");
      const diagramNodes = Object.keys(snapshot.diagram?.nodes ?? {}).length;
      const diagramEdges = Object.keys(snapshot.diagram?.edges ?? {}).length;
      useAutosaveLog.getState().log({
        kind: "save:start",
        projectId,
        message: "Salvando snapshot…",
        meta: {
          projectNodes: snapshot.project.nodes.length,
          projectEdges: snapshot.project.edges.length,
          diagramNodes,
          diagramEdges,
        },
      });
      const startedAt = performance.now();
      try {
        const res = await save({
          data: {
            projectId,
            snapshot,
            expectedVersion: currentVersionRef.current,
          },
        });
        currentVersionRef.current = res.version;
        ps.markSaved();
        es.markSaved();
        us.markSaved();
        if (mountedRef.current) {
          setSaveState("saved");
          setConflict(null);
        }
        useAutosaveLog.getState().log({
          kind: "save:success",
          projectId,
          message: `Salvo v${res.version} em ${Math.round(performance.now() - startedAt)}ms`,
          meta: { diagramNodes, diagramEdges },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (mountedRef.current) {
          setSaveState("error");
          if (message.includes("VERSION_CONFLICT")) {
            setConflict({
              message,
              occurredAt: Date.now(),
            });
            toast.error("Conflito de versão: o projeto foi alterado externamente.");
          } else {
            toast.error(`Falha ao salvar: ${message}`);
          }
        }
        useAutosaveLog.getState().log({
          kind: "save:error",
          projectId,
          message,
        });
      } finally {
        savingRef.current = false;
        if (pendingRef.current && !conflict) {
          pendingRef.current = false;
          schedule("retry-coalesced");
        }
      }
    };

    const unsub = useProjectStore.subscribe((s, prev) => {
      if (isHydratingRef.current) return;
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule("project-store");
    });

    const unsub3 = useEditorStore.subscribe((s, prev) => {
      if (isHydratingRef.current) return;
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule("editor-store");
    });

    const unsub4 = useDiagramStore.subscribe((s, prev) => {
      if (isHydratingRef.current) return;
      if (s.doc === prev.doc) return;
      schedule("diagram-store");
    });

    const unsub5 = usePlcStore.subscribe((s, prev) => {
      if (isHydratingRef.current) return;
      if (s.project === prev.project) return;
      schedule("plc-store");
    });

    const unsub6 = useUnifiedProjectStore.subscribe((s, prev) => {
      if (isHydratingRef.current) return;
      if (!s.dirty || s.dirty === prev.dirty) return;
      schedule("unified-store");
    });

    return () => {
      unsub();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      pendingRef.current = false;
    };
  }, [projectId, save, conflict]);

  const resolveConflict = useCallback(
    async (resolution: "reload" | "overwrite") => {
      if (!projectId) return;
      if (resolution === "reload") {
        setConflict(null);
        await performLoad();
        toast.info("Projeto recarregado a partir do servidor.");
      } else if (resolution === "overwrite") {
        try {
          setSaveState("saving");
          const snapshot = buildProjectSnapshot();
          const res = await save({
            data: {
              projectId,
              snapshot,
              force: true,
            },
          });
          currentVersionRef.current = res.version;
          useProjectStore.getState().markSaved();
          useEditorStore.getState().markSaved();
          useUnifiedProjectStore.getState().markSaved();
          setSaveState("saved");
          setConflict(null);
          toast.success("Projeto salvo sobrescrevendo a versão do servidor.");
        } catch (e: unknown) {
          setSaveState("error");
          toast.error(`Falha ao sobrescrever: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    },
    [projectId, performLoad, save],
  );

  return {
    loading,
    saveState,
    conflict,
    resolveConflict,
    reloadProject: performLoad,
    currentVersion: currentVersionRef.current,
  };
}

export async function snapshotVersion(
  projectId: string,
  save: ReturnType<typeof useServerFn<typeof saveProject>>,
) {
  const snapshot = buildProjectSnapshot();
  return save({ data: { projectId, snapshot, createVersion: true, force: true } });
}

export function buildProjectSnapshot(): ProjectSnapshot {
  const ps = useProjectStore.getState();
  const es = useEditorStore.getState();
  const ds = useDiagramStore.getState();
  const pls = usePlcStore.getState();
  const us = useUnifiedProjectStore.getState();

  return {
    schemaVersion: 3,
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
    // Slot legado mantido por retrocompatibilidade
    voltai: { components: [], edges: [] },
    editor: {
      tags: es.editorTags,
      rungs: es.rungs,
      fbdNodes: es.fbdNodes,
      fbdEdges: es.fbdEdges,
      fbdSim: es.fbdSim,
    },
    diagram: ds.doc as DiagramDoc,
    plc: pls.project as PlcProject,
    studies: us.doc.studies,
    controlBindings: us.doc.engineering.controlBindings,
    diagnostics: us.doc.diagnostics,
    unifiedDoc: us.doc,
    compactStudio: us.doc.compactStudio,
  };
}
