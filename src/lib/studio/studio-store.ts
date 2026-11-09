// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — INDUSTRIAL ENGINEERING STUDIO STORE
// State Management for Canonical Project, IEC Compiler, Simulator & IDE Views
// Single Source of Truth (SSOT) Architecture with Real Persistence
// ============================================================================

import { create } from "zustand";
import type {
  IndustrialProject,
  CompilationResult,
  POU,
  Tag,
  SFCStep,
  SFCTransition,
  MotionAxis,
} from "./canonical/types";
import { CanonicalProjectService, type IntegrityCheckResult } from "./canonical/project-service";
import { IECCompilerPipeline } from "./iec/compiler/compiler-pipeline";
import { IECTaskScheduler } from "./iec/runtime/task-scheduler";
import { SFCEngine } from "./iec/sfc/sfc-engine";
import { MotionSimulator } from "./motion/motion-simulator";
import { useUnifiedProjectStore } from "../model/unified-store";

export type StudioEditorTab =
  | "PROJECT_EXPLORER"
  | "DEVICE_TREE"
  | "POU_EDITOR"
  | "HMI_EDITOR"
  | "SIMULATION_MONITOR"
  | "SAFETY_ANALYSIS"
  | "MOTION_CONTROL"
  | "ST_EDITOR"
  | "SFC_EDITOR"
  | "HMI_VIEW"
  | "SAFETY_ADVISOR"
  | "MOTION_CONTROLLER"
  | "POU_LIST";

/**
 * Avaliador seguro de expressões booleanas e de comparação IEC para transições SFC e Debugger.
 * Não utiliza eval() nem new Function().
 */
export function evaluateSafeCondition(
  exprStr: string,
  getVariable: (name: string) => any
): boolean {
  const trimmed = (exprStr || "").trim();
  if (!trimmed || trimmed === "TRUE" || trimmed === "1") return true;
  if (trimmed === "FALSE" || trimmed === "0") return false;

  // Prefixo NOT
  if (trimmed.startsWith("NOT ") || trimmed.startsWith("not ")) {
    return !evaluateSafeCondition(trimmed.slice(4), getVariable);
  }

  // Operador AND
  if (trimmed.includes(" AND ")) {
    const parts = trimmed.split(" AND ");
    return parts.every((p) => evaluateSafeCondition(p, getVariable));
  }

  // Operador OR
  if (trimmed.includes(" OR ")) {
    const parts = trimmed.split(" OR ");
    return parts.some((p) => evaluateSafeCondition(p, getVariable));
  }

  // Operadores de comparação: >=, <=, !=, <>, ==, =, >, <
  const compMatch = trimmed.match(
    /^([a-zA-Z0-9_\.]+)\s*(>=|<=|!=|<>|==|=|(?<!<|>)>|(?<!<|>)<)\s*([a-zA-Z0-9_\.]+)$/
  );
  if (compMatch) {
    const leftRaw = compMatch[1];
    const op = compMatch[2];
    const rightRaw = compMatch[3];

    const resolveSide = (side: string): any => {
      if (side === "TRUE") return true;
      if (side === "FALSE") return false;
      if (!isNaN(Number(side))) return Number(side);
      const val = getVariable(side);
      return val !== undefined ? val : 0;
    };

    const leftVal = resolveSide(leftRaw);
    const rightVal = resolveSide(rightRaw);

    switch (op) {
      case ">=":
        return Number(leftVal) >= Number(rightVal);
      case "<=":
        return Number(leftVal) <= Number(rightVal);
      case "!=":
      case "<>":
        return leftVal != rightVal;
      case "==":
      case "=":
        return leftVal == rightVal;
      case ">":
        return Number(leftVal) > Number(rightVal);
      case "<":
        return Number(leftVal) < Number(rightVal);
    }
  }

  // Identificador isolado ou tag booleana
  const val = getVariable(trimmed);
  return Boolean(val);
}

export interface StudioState {
  project: IndustrialProject;
  activeTab: StudioEditorTab;
  selectedPouId: string | null;
  activePouId: string | null;
  selectedDeviceId: string | null;
  selectedTagId: string | null;

  // Persistência SSOT
  projectId: string | null;
  isDirty: boolean;
  persistenceState: "idle" | "saving" | "saved" | "error";
  lastSavedTimestamp: string | null;

  // Compilador e Simulação
  isCompiling: boolean;
  compilationResult: CompilationResult | null;
  scheduler: IECTaskScheduler | null;
  sfcEngine: SFCEngine | null;
  motionSimulator: MotionSimulator | null;
  isSimulating: boolean;
  simulationCycle: number;
  simulationCycleMs: number;
  simulatedTimeMs: number;
  forcedVariables: Record<string, any>;

  // Ações
  initProject: (projectId?: string | null) => Promise<void>;
  saveProject: () => Promise<boolean>;
  markDirty: () => void;
  setActiveTab: (tab: StudioEditorTab) => void;
  selectPou: (pouId: string | null) => void;
  selectDevice: (deviceId: string | null) => void;
  selectTag: (tagId: string | null) => void;
  setCycleInterval: (ms: number) => void;

  loadSampleProject: () => void;
  updatePouSource: (pouId: string, newSourceST: string) => void;
  updatePouSourceST: (pouId: string, newSourceST: string) => void;
  renameTag: (tagId: string, newName: string) => void;
  renamePou: (pouId: string, newName: string) => void;
  mapIOChannelToTag: (channelId: string, tagId?: string) => void;
  validateProjectIntegrity: () => IntegrityCheckResult;

  // Compilação e Simulação
  compileProject: () => boolean;
  startSimulation: () => void;
  pauseSimulation: () => void;
  stepSimulation: (stepMs?: number) => void;
  resetSimulation: () => void;
  setSimulatedInput: (name: string, value: any) => void;
  forceVariable: (name: string, value: any) => void;
  unforceVariable: (name: string) => void;
}

export const useStudioStore = create<StudioState>((set, get) => {
  const initialProject = CanonicalProjectService.createSampleIndustrialProject();
  const compileInit = IECCompilerPipeline.compile(initialProject);
  const initialScheduler = compileInit.compiledIR ? new IECTaskScheduler(compileInit.compiledIR) : null;

  const sfcPou = initialProject.pous.find((p) => p.language === "SFC");
  const sfcSteps: SFCStep[] = sfcPou?.networks[0]?.sfcSteps || [];
  const sfcTransitions: SFCTransition[] = sfcPou?.networks[0]?.sfcTransitions || [];
  const initialSfcEngine = new SFCEngine(sfcSteps, sfcTransitions);

  const initialMotion = initialProject.motionAxes[0]
    ? new MotionSimulator(initialProject.motionAxes[0])
    : null;

  return {
    project: initialProject,
    activeTab: "ST_EDITOR",
    selectedPouId: initialProject.pous[0]?.id || null,
    activePouId: initialProject.pous[0]?.id || null,
    selectedDeviceId: initialProject.controllers[0]?.id || null,
    selectedTagId: initialProject.tags[0]?.id || null,

    projectId: null,
    isDirty: false,
    persistenceState: "idle",
    lastSavedTimestamp: null,

    isCompiling: false,
    compilationResult: compileInit.compilationResult,
    scheduler: initialScheduler,
    sfcEngine: initialSfcEngine,
    motionSimulator: initialMotion,
    isSimulating: false,
    simulationCycle: 0,
    simulationCycleMs: 20,
    simulatedTimeMs: 0,
    forcedVariables: {},

    initProject: async (projectId?: string | null) => {
      if (!projectId) return;
      const currentProj = get().project;
      if (currentProj.id === projectId && get().projectId === projectId) {
        return;
      }

      let loadedProject: IndustrialProject | null = null;

      // 1. Tenta carregar do localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(`eletricai:studio:project:${projectId}`);
        if (stored) {
          try {
            loadedProject = JSON.parse(stored);
          } catch {}
        }
      }

      // 2. Se não estiver no localStorage, adapta a partir do UnifiedProjectStore (SSOT)
      if (!loadedProject) {
        const unifiedDoc = useUnifiedProjectStore.getState().doc;
        if (unifiedDoc && unifiedDoc.metadata?.id === projectId) {
          loadedProject = CanonicalProjectService.fromUnifiedDoc(unifiedDoc);
        }
      }

      // 3. Fallback: cria projeto limpo correspondente ao projectId
      if (!loadedProject) {
        const unifiedDoc = useUnifiedProjectStore.getState().doc;
        const name = (unifiedDoc?.metadata?.id === projectId && unifiedDoc.metadata.name) || "Projeto Industrial";
        loadedProject = CanonicalProjectService.createEmptyProject(name, undefined, projectId);
      }

      const comp = IECCompilerPipeline.compile(loadedProject);
      const sched = comp.compiledIR ? new IECTaskScheduler(comp.compiledIR) : null;
      const sfc = loadedProject.pous.find((p) => p.language === "SFC");
      const steps = sfc?.networks[0]?.sfcSteps || [];
      const trans = sfc?.networks[0]?.sfcTransitions || [];
      const sfcEng = new SFCEngine(steps, trans);
      const motion = loadedProject.motionAxes[0] ? new MotionSimulator(loadedProject.motionAxes[0]) : null;

      set({
        projectId,
        project: loadedProject,
        selectedPouId: loadedProject.pous[0]?.id || null,
        activePouId: loadedProject.pous[0]?.id || null,
        selectedDeviceId: loadedProject.controllers[0]?.id || null,
        selectedTagId: loadedProject.tags[0]?.id || null,
        compilationResult: comp.compilationResult,
        scheduler: sched,
        sfcEngine: sfcEng,
        motionSimulator: motion,
        isSimulating: false,
        simulationCycle: 0,
        simulatedTimeMs: 0,
        forcedVariables: {},
        isDirty: false,
        persistenceState: "saved",
        lastSavedTimestamp: new Date().toLocaleTimeString(),
      });
    },

    saveProject: async () => {
      set({ persistenceState: "saving" });
      try {
        const proj = get().project;
        proj.updatedAt = new Date().toISOString();
        proj.activeVersion += 1;
        const checksum = CanonicalProjectService.computeDeterministicChecksum(proj);
        proj.versionsHistory.push({
          versionNumber: proj.activeVersion,
          commitMessage: `Versão ${proj.activeVersion} salva pelo Studio`,
          author: "Lead Automation Engineer",
          timestamp: proj.updatedAt,
          checksumSha256: checksum,
        });

        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(`eletricai:studio:project:${proj.id}`, JSON.stringify(proj));
        }

        // Sincroniza tags com o UnifiedProjectStore (SSOT)
        const unifiedStore = useUnifiedProjectStore.getState();
        for (const t of proj.tags) {
          unifiedStore.upsertTag({
            id: t.id,
            name: t.name,
            dataType: (t.dataType as any) || "BOOL",
            area: t.protocolAddress?.startsWith("%I")
              ? "I"
              : t.protocolAddress?.startsWith("%Q")
              ? "Q"
              : "M",
            address: t.protocolAddress || (t.dataType === "BOOL" ? `%MX_${t.name}` : `%MD_${t.name}`),
            unit: t.engineeringUnit,
            initialValue: (t.initialValue as any) ?? false,
            forced: t.isForced,
            retentive: false,
            description: t.description,
            linkedEquipmentId: t.equipmentId,
          });
        }
        unifiedStore.markSaved();

        set({
          project: { ...proj },
          isDirty: false,
          persistenceState: "saved",
          lastSavedTimestamp: new Date().toLocaleTimeString(),
        });
        return true;
      } catch {
        set({ persistenceState: "error" });
        return false;
      }
    },

    markDirty: () => set({ isDirty: true, persistenceState: "idle" }),

    setActiveTab: (tab) => set({ activeTab: tab }),

    selectPou: (pouId) => {
      const p = get().project.pous.find((item) => item.id === pouId);
      let tab: StudioEditorTab = "ST_EDITOR";
      if (p?.language === "SFC") tab = "SFC_EDITOR";
      else if (p?.language === "LD" || p?.language === "FBD") tab = "POU_EDITOR";
      set({ selectedPouId: pouId, activePouId: pouId, activeTab: tab });
    },

    selectDevice: (deviceId) => set({ selectedDeviceId: deviceId, activeTab: "DEVICE_TREE" }),
    selectTag: (tagId) => set({ selectedTagId: tagId }),
    setCycleInterval: (ms) => set({ simulationCycleMs: ms }),

    loadSampleProject: () => {
      const proj = CanonicalProjectService.createSampleIndustrialProject();
      const comp = IECCompilerPipeline.compile(proj);
      const sched = comp.compiledIR ? new IECTaskScheduler(comp.compiledIR) : null;
      const sfc = proj.pous.find((p) => p.language === "SFC");
      const steps = sfc?.networks[0]?.sfcSteps || [];
      const trans = sfc?.networks[0]?.sfcTransitions || [];
      const sfcEng = new SFCEngine(steps, trans);
      const motion = proj.motionAxes[0] ? new MotionSimulator(proj.motionAxes[0]) : null;

      set({
        project: proj,
        selectedPouId: proj.pous[0]?.id || null,
        activePouId: proj.pous[0]?.id || null,
        selectedDeviceId: proj.controllers[0]?.id || null,
        selectedTagId: proj.tags[0]?.id || null,
        compilationResult: comp.compilationResult,
        scheduler: sched,
        sfcEngine: sfcEng,
        motionSimulator: motion,
        isSimulating: false,
        simulationCycle: 0,
        simulatedTimeMs: 0,
        forcedVariables: {},
        isDirty: true,
        persistenceState: "idle",
      });
    },

    updatePouSource: (pouId, newSourceST) => {
      const proj = get().project;
      const pou = proj.pous.find((p) => p.id === pouId);
      if (pou) {
        pou.rawSourceST = newSourceST;
        set({
          project: { ...proj, updatedAt: new Date().toISOString() },
          isDirty: true,
          persistenceState: "idle",
        });
      }
    },

    updatePouSourceST: (pouId, newSourceST) => {
      get().updatePouSource(pouId, newSourceST);
    },

    renameTag: (tagId, newName) => {
      const updated = CanonicalProjectService.renameEntity(get().project, "TAG", tagId, newName);
      set({ project: updated, isDirty: true, persistenceState: "idle" });
    },

    renamePou: (pouId, newName) => {
      const updated = CanonicalProjectService.renameEntity(get().project, "POU", pouId, newName);
      set({ project: updated, isDirty: true, persistenceState: "idle" });
    },

    mapIOChannelToTag: (channelId, tagId) => {
      const proj = get().project;
      for (const ctrl of proj.controllers) {
        for (const mod of ctrl.rackModules) {
          for (const ch of mod.channels) {
            if (ch.id === channelId) {
              ch.mappedTagId = tagId;
            }
          }
        }
      }
      set({
        project: { ...proj, updatedAt: new Date().toISOString() },
        isDirty: true,
        persistenceState: "idle",
      });
    },

    validateProjectIntegrity: () => {
      return CanonicalProjectService.validateReferentialIntegrity(get().project);
    },

    compileProject: () => {
      set({ isCompiling: true });
      const proj = get().project;
      const res = IECCompilerPipeline.compile(proj);
      const sched = res.compiledIR ? new IECTaskScheduler(res.compiledIR) : get().scheduler;
      set({
        isCompiling: false,
        compilationResult: res.compilationResult,
        scheduler: sched,
        project: { ...proj, lastCompilationResult: res.compilationResult },
      });
      return res.success;
    },

    startSimulation: () => {
      let sched = get().scheduler;
      if (!sched) {
        get().compileProject();
        sched = get().scheduler;
      }
      if (sched) {
        sched.start();
        set({ isSimulating: true });
      }
    },

    pauseSimulation: () => {
      const sched = get().scheduler;
      if (sched) {
        sched.pause();
        set({ isSimulating: false });
      }
    },

    stepSimulation: (stepMs?: number) => {
      const interval = stepMs || get().simulationCycleMs || 20;
      const sched = get().scheduler;
      if (sched) {
        sched.singleCycle(interval);
      }

      // Avança SFC com avaliação real de condições e despacho de ações
      const sfc = get().sfcEngine;
      if (sfc && sched) {
        sfc.executeCycle(
          interval,
          (cond) =>
            evaluateSafeCondition(
              cond,
              (name) => sched.globalVariables[name] ?? sched.inputProcessImage[name]
            ),
          (action, isActive) => {
            if (!isActive) return;
            const actBody = action.actionName || (action as any).body || "";
            if (actBody.includes(":=")) {
              const [varName, valStr] = actBody.split(":=").map((s: string) => s.trim());
              let parsedVal: any = valStr;
              if (valStr === "TRUE") parsedVal = true;
              else if (valStr === "FALSE") parsedVal = false;
              else if (!isNaN(Number(valStr))) parsedVal = Number(valStr);

              sched.globalVariables[varName] = parsedVal;
              sched.outputProcessImage[varName] = parsedVal;
              const proj = get().project;
              const tag = proj.tags.find((t) => t.name === varName);
              if (tag) tag.currentValue = parsedVal;
            }
          }
        );
      }

      // Avança Motion
      const motion = get().motionSimulator;
      if (motion) {
        motion.update(interval / 1000);
      }

      set({
        simulationCycle: sched ? sched.cycleCount : get().simulationCycle + 1,
        simulatedTimeMs: sched ? sched.totalSimulatedTimeMs : get().simulatedTimeMs + interval,
      });
    },

    resetSimulation: () => {
      const sched = get().scheduler;
      if (sched) {
        sched.reset();
      }
      set({
        isSimulating: false,
        simulationCycle: 0,
        simulatedTimeMs: 0,
        forcedVariables: {},
      });
    },

    setSimulatedInput: (name, value) => {
      const sched = get().scheduler;
      if (sched) {
        sched.setSimulatedInput(name, value);
        const proj = get().project;
        const tag = proj.tags.find((t) => t.name === name);
        if (tag) tag.currentValue = value;
      }
    },

    forceVariable: (name, value) => {
      const sched = get().scheduler;
      if (sched) {
        sched.forceVariable(name, value);
        const proj = get().project;
        const tag = proj.tags.find((t) => t.name === name);
        if (tag) {
          tag.isForced = true;
          tag.forcedValue = value;
        }
        set({ forcedVariables: { ...get().forcedVariables, [name]: value } });
      }
    },

    unforceVariable: (name) => {
      const sched = get().scheduler;
      if (sched) {
        sched.unforceVariable(name);
        const proj = get().project;
        const tag = proj.tags.find((t) => t.name === name);
        if (tag) {
          tag.isForced = false;
          tag.forcedValue = undefined;
        }
        const updated = { ...get().forcedVariables };
        delete updated[name];
        set({ forcedVariables: updated });
      }
    },
  };
});
