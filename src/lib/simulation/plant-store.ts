// Store da planta simulada — zustand efêmero (SEM persist: simulação não
// polui snapshot do projeto nem localStorage operacional).
// Tick em passo fixo (100 ms) via start()/stop() chamados pelo painel.
import { create } from "zustand";
import {
  createPlant,
  stepPlant,
  defaultPlantInputs,
  type PlantState,
  type PlantInputs,
  type InjectedFault,
} from "@/lib/simulation/plant-engine";

export const PLANT_TICK_MS = 100;
const PLANT_DT_S = PLANT_TICK_MS / 1000;

interface PlantStore {
  plant: PlantState;
  inputs: PlantInputs;
  ticking: boolean;
  setMotorCmd: (id: string, on: boolean) => void;
  setFaultInject: (id: string, f: InjectedFault) => void;
  setPlantTemp: (c: number) => void;
  setSmoke: (on: boolean) => void;
  pulseStart: () => void;
  pulseStop: () => void;
  pulseEstop: () => void;
  pulseReset: () => void;
  setTicking: (on: boolean) => void;
  tick: () => void;
  resetAll: () => void;
}

const pulse = (inputs: PlantInputs, key: "start" | "stop" | "estop" | "reset"): PlantInputs => ({
  ...inputs,
  start: false,
  stop: false,
  estop: key === "estop" ? true : inputs.estop,
  reset: false,
  [key]: true,
});

export const usePlantStore = create<PlantStore>((set, get) => ({
  plant: createPlant(),
  inputs: defaultPlantInputs(),
  ticking: false,

  setMotorCmd: (id, on) =>
    set((s) => ({ inputs: { ...s.inputs, motorCmd: { ...s.inputs.motorCmd, [id]: on } } })),
  setFaultInject: (id, f) =>
    set((s) => ({ inputs: { ...s.inputs, faultInject: { ...s.inputs.faultInject, [id]: f } } })),
  setPlantTemp: (c) => set((s) => ({ inputs: { ...s.inputs, plantTemp_C: c } })),
  setSmoke: (on) => set((s) => ({ inputs: { ...s.inputs, smoke: on } })),

  pulseStart: () => {
    const { plant, inputs } = get();
    const next = stepPlant(plant, pulse(inputs, "start"), PLANT_DT_S);
    set({ plant: next, inputs: { ...inputs, start: false } });
  },
  pulseStop: () => {
    const { plant, inputs } = get();
    const next = stepPlant(plant, pulse(inputs, "stop"), PLANT_DT_S);
    set({ plant: next, inputs: { ...inputs, stop: false } });
  },
  pulseEstop: () => {
    const { plant, inputs } = get();
    set({ plant: stepPlant(plant, pulse(inputs, "estop"), PLANT_DT_S) });
  },
  pulseReset: () => {
    const { plant, inputs } = get();
    const next = stepPlant(plant, { ...inputs, reset: true, estop: false }, PLANT_DT_S);
    set({ plant: next, inputs: { ...inputs, reset: false, estop: false } });
  },
  setTicking: (on) => set({ ticking: on }),
  tick: () => {
    const { plant, inputs, ticking } = get();
    if (!ticking) return;
    set({ plant: stepPlant(plant, inputs, PLANT_DT_S) });
  },
  resetAll: () => set({ plant: createPlant(), inputs: defaultPlantInputs(), ticking: false }),
}));
