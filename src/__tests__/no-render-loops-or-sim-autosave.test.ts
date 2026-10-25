import { beforeEach, describe, expect, it } from "vitest";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { useRuntimeStore } from "@/lib/model/runtime-store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { useAutosaveLog } from "@/lib/autosave-log";
import type { ProjectSnapshot } from "@/lib/projects.functions";

const SAMPLE_SNAPSHOT: ProjectSnapshot = {
  schemaVersion: 3,
  project: {
    nodes: [
      {
        id: "motor_1",
        kind: "motor",
        category: "power",
        label: "Bomba Principal",
        position: { x: 100, y: 100 },
        params: { P: 15, V: 380 },
      },
    ],
    edges: [],
    tags: { M1_SPEED: 1750, M1_RUN: true },
    scadaLayout: { nodes: [], edges: [] },
  },
  voltai: { components: [], edges: [] },
  editor: {
    tags: {
      t_run: { id: "t_run", name: "M1_RUN", type: "BOOL", value: true },
      t_speed: { id: "t_speed", name: "M1_SPEED", type: "REAL", value: 1750 },
    },
    rungs: [],
    fbdNodes: [],
    fbdEdges: [],
  },
  plc: {
    vendor: "siemens",
    rack: { id: "rack-1", label: "Rack Principal", modules: [] },
    variables: [
      { id: "v_run", name: "M1_RUN", type: "BOOL", address: "%Q0.0" },
      { id: "v_speed", name: "M1_SPEED", type: "REAL", address: "%MD10" },
    ],
    programBlocks: [],
    cycleTimeMs: 10,
  },
  twin: { mappings: [], nameplates: {} },
  studies: {},
  controlBindings: {},
  diagnostics: [],
};

describe("Fase D — Ausência de Loops de Renderização e Zero Autosave em Carga e Simulação (T7)", () => {
  beforeEach(() => {
    useAutosaveLog.getState().clear();
    useUnifiedProjectStore.getState().resetUnifiedDoc();
    useProjectStore.getState().reset();
    useEditorStore.getState().hydrateSnapshot({ editorTags: {}, rungs: [], fbdNodes: [], fbdEdges: [] });
    useDiagramStore.getState().resetDoc();
  });

  it("não marca dirty e não dispara autosave ao carregar snapshot inicial", () => {
    // Carrega o snapshot na store unificada
    useUnifiedProjectStore.getState().hydrateFromV2Snapshot(SAMPLE_SNAPSHOT);

    // Verifica que o estado de dirty de todas as stores é estritamente false
    expect(useUnifiedProjectStore.getState().dirty).toBe(false);
    expect(useProjectStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(false);

    // O log não deve conter agendamento de autosave (kind: "schedule")
    const events = useAutosaveLog.getState().events;
    const scheduleEvents = events.filter((e) => e.kind === "schedule");
    expect(scheduleEvents).toHaveLength(0);
  });

  it("executa 120 ciclos de simulação a 60 Hz sem alterar flags dirty das stores de projeto", () => {
    // Hidrata projeto
    useUnifiedProjectStore.getState().hydrateFromV2Snapshot(SAMPLE_SNAPSHOT);

    const runtime = useRuntimeStore.getState();
    runtime.resetRuntime();
    runtime.seedFromCanonicalTags([
      { id: "t_speed", name: "M1_SPEED", initialValue: 0, forced: false },
      { id: "t_run", name: "M1_RUN", initialValue: true, forced: false },
    ]);

    const initialDiagramDoc = useDiagramStore.getState().doc;

    // Simula 120 ticks de execução contínua de simulação e scan
    for (let tick = 0; tick < 120; tick++) {
      runtime.applyRuntimeFrame({
        cycleMs: 16.6,
        tagValuesById: { t_speed: 1750 + (tick % 10), t_run: true },
        tagValuesByName: { M1_SPEED: 1750 + (tick % 10), M1_RUN: true },
      });
      runtime.setTagRuntimeValue("t_speed", 1750 + (tick % 10), "M1_SPEED");
    }

    // Stores documentais permanecem intactas e limpas
    expect(useUnifiedProjectStore.getState().dirty).toBe(false);
    expect(useProjectStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(false);

    // A identidade do documento canônico e do diagrama não é clonada durante o tick
    expect(useDiagramStore.getState().doc).toBe(initialDiagramDoc);

    // Nenhuma gravação/autosave agendada por conta da simulação
    const scheduleEvents = useAutosaveLog.getState().events.filter((e) => e.kind === "schedule");
    expect(scheduleEvents).toHaveLength(0);
  });

  it("marca dirty apenas quando uma mutação de engenharia explícita for realizada", () => {
    useUnifiedProjectStore.getState().hydrateFromV2Snapshot(SAMPLE_SNAPSHOT);
    expect(useUnifiedProjectStore.getState().dirty).toBe(false);

    // Realiza alteração canônica explícita
    useUnifiedProjectStore.getState().updateEquipmentSpecs("motor_1", { powerKw: 30 });

    // dirty é ativado para permitir autosave de alterações reais
    expect(useUnifiedProjectStore.getState().dirty).toBe(true);
  });
});
