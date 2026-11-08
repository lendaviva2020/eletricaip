// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — INDUSTRIAL ENGINEERING STUDIO STORE
// State Management for Canonical Project, IEC Compiler, Simulator & IDE Views
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

export interface StudioState {
  project: IndustrialProject;
  activeTab: StudioEditorTab;
  selectedPouId: string | null;
  activePouId: string | null;
  selectedDeviceId: string | null;
  selectedTagId: string | null;

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

    setActiveTab: (tab) => set({ activeTab: tab }),
    selectPou: (pouId) => {
      const p = get().project.pous.find((item) => item.id === pouId);
      const tab: StudioEditorTab = p?.language === "SFC" ? "SFC_EDITOR" : "ST_EDITOR";
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
      });
    },

    updatePouSource: (pouId, newSourceST) => {
      const proj = get().project;
      const pou = proj.pous.find((p) => p.id === pouId);
      if (pou) {
        pou.rawSourceST = newSourceST;
        set({ project: { ...proj, updatedAt: new Date().toISOString() } });
      }
    },

    updatePouSourceST: (pouId, newSourceST) => {
      get().updatePouSource(pouId, newSourceST);
    },

    renameTag: (tagId, newName) => {
      const updated = CanonicalProjectService.renameEntity(get().project, "TAG", tagId, newName);
      set({ project: updated });
    },

    renamePou: (pouId, newName) => {
      const updated = CanonicalProjectService.renameEntity(get().project, "POU", pouId, newName);
      set({ project: updated });
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
      set({ project: { ...proj, updatedAt: new Date().toISOString() } });
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

      // Avança SFC
      const sfc = get().sfcEngine;
      if (sfc) {
        sfc.executeCycle(
          interval,
          (cond) => {
            if (cond === "TRUE") return true;
            return false;
          },
          () => {}
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
