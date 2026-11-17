// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import {
  UNASSIGNED_AREA_KEY,
  areaKeyOf,
  buildAssetHierarchy,
  buildTagOwnerIndex,
  equipmentIdForAlarm,
  filterAssetTree,
} from "@/lib/scada/asset-hierarchy";
import { TREND_MAX_POINTS, appendTrendPoint, plotValue } from "@/lib/scada/tag-trend-buffer";
import { pickBannerAlarm, ScadaOsStatusBar } from "@/components/scada/scada-os-status-bar";
import { EquipmentInspectorDrawer } from "@/components/scada/equipment-inspector-drawer";
import { ScadaOverviewView } from "@/components/scada/views/scada-overview-view";
import { canonicalToScadaTelemetry } from "@/lib/scada/canonical-bridge";
import { CanonicalEquipmentSchema } from "@/lib/model/unified-schema";
import { DEMO_ETE_EQUIPMENTS } from "@/lib/scada/demo-ete-seed";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { EquipmentTelemetry, ScadaAlarmItem, ScadaTagDefinition } from "@/lib/scada/types";

function eq(id: string, extra: Partial<EquipmentTelemetry> = {}): EquipmentTelemetry {
  return {
    id,
    tag: id,
    name: `Equipamento ${id}`,
    category: "MOTOR",
    status: "STOPPED",
    mode: "AUTO",
    voltageV: 0,
    currentA: 0,
    powerKw: 0,
    powerFactor: 0,
    frequencyHz: 0,
    runningHours: 0,
    startsCount: 0,
    lastMaintenance: "—",
    alarmsCount: 0,
    linkedTags: [],
    ...extra,
  };
}

function tag(name: string, extra: Partial<ScadaTagDefinition> = {}): ScadaTagDefinition {
  return {
    id: `id-${name}`,
    name,
    description: name,
    dataType: "REAL",
    unit: "A",
    scaleMin: 0,
    scaleMax: 100,
    value: 0,
    quality: "GOOD",
    driver: "SIMULATION",
    scanRateMs: 100,
    lastUpdated: 1000,
    forced: false,
    sourceAddress: "",
    ...extra,
  };
}

function alarm(id: string, tagName: string, extra: Partial<ScadaAlarmItem> = {}): ScadaAlarmItem {
  return {
    id,
    tag: tagName,
    description: `Alarme ${tagName}`,
    priority: "HIGH",
    category: "PROCESS",
    currentValue: 0,
    setpointLimit: 0,
    state: "UNACK",
    timestamp: 1000,
    ...extra,
  };
}

const EQUIPMENTS = {
  M1: eq("M1", { plant: "FAB", location: "MOEGA", linkedTags: ["M1.CORRENTE"] }),
  M10: eq("M10", { plant: "FAB", location: "MOEGA" }),
  K1: eq("K1", { plant: "FAB", location: "PAINEL" }),
  X9: eq("X9"),
};

describe("áreas pela designação =planta+local", () => {
  it("agrupa por planta+local e põe quem não tem local em 'Área não definida'", () => {
    expect(areaKeyOf({ plant: "FAB", location: "MOEGA" })).toBe("=FAB+MOEGA");
    expect(areaKeyOf({})).toBe(UNASSIGNED_AREA_KEY);
    const h = buildAssetHierarchy({ equipments: EQUIPMENTS, tags: {}, alarms: [] });
    const keys = h.areas.map((a) => a.key);
    expect(keys).toContain("=FAB+MOEGA");
    expect(keys).toContain("=FAB+PAINEL");
    expect(keys[keys.length - 1]).toBe(UNASSIGNED_AREA_KEY);
    expect(h.areas.find((a) => a.key === "=FAB+MOEGA")?.equipmentIds).toEqual(["M1", "M10"]);
    // sem tags = sem dados (não "normal" inventado)
    expect(h.areas.every((a) => a.health === "NO_DATA")).toBe(true);
  });

  it("árvore planta → local → equipamento, com busca sem acento", () => {
    const h = buildAssetHierarchy({ equipments: EQUIPMENTS, tags: {}, alarms: [] });
    const fab = h.tree.find((n) => n.key === "=FAB")!;
    expect(fab.children.map((c) => c.label)).toEqual(["+MOEGA", "+PAINEL"]);
    expect(h.tree[h.tree.length - 1].key).toBe(UNASSIGNED_AREA_KEY);
    const found = filterAssetTree(h.tree, "painél");
    expect(found).toHaveLength(1);
    expect(found[0].children[0].label).toBe("+PAINEL");
  });

  it("projeto do unifilar recebe planta/local e designação do equipamento canônico", () => {
    const ce = CanonicalEquipmentSchema.parse({
      id: "e1",
      tagCode: "M1",
      catalogType: "motor",
      category: "load",
      specs: { custom: { plant: "FAB", location: "MOEGA<script>" } },
    });
    const t = canonicalToScadaTelemetry(ce);
    expect(t.location).toBe("MOEGAscript");
    expect(t.designation).toBe("=FAB+MOEGAscript-M1");
  });

  it("toda a planta de demonstração tem área definida", () => {
    for (const e of Object.values(DEMO_ETE_EQUIPMENTS)) {
      expect(e.location, e.id).toBeTruthy();
      expect(e.plant).toBe("ETE");
    }
  });
});

describe("dono do alarme e desvios", () => {
  it("acha o equipamento pelo tag vinculado ou prefixo com separador — M1 não casa M10", () => {
    const idx = buildTagOwnerIndex(EQUIPMENTS, {});
    expect(equipmentIdForAlarm({ tag: "M1.CORRENTE" }, EQUIPMENTS, idx)).toBe("M1");
    expect(equipmentIdForAlarm({ tag: "M10.TEMP" }, EQUIPMENTS, idx)).toBe("M10");
    expect(equipmentIdForAlarm({ tag: "M10" }, EQUIPMENTS, idx)).toBe("M10");
    expect(equipmentIdForAlarm({ tag: "M100.X" }, EQUIPMENTS, idx)).toBeNull();
    expect(equipmentIdForAlarm({ tag: "ETE.SAFETY.ESTOP" }, EQUIPMENTS, idx)).toBeNull();
  });

  it("alarme não reconhecido, falha, forçado e sem atualização viram desvios; tag duplicado conta 1 vez", () => {
    const tA = tag("M1.CORRENTE", { linkedEquipmentId: "M1", forced: true, forceReason: "teste" });
    const tB = tag("K1.ESTADO", { linkedEquipmentId: "K1", quality: "STALE" });
    const tC = tag("M10.TEMP", { linkedEquipmentId: "M10", quality: "NOT_CONNECTED" });
    const tags = { [tA.name]: tA, [tA.id]: tA, [tB.name]: tB, [tC.name]: tC };
    const h = buildAssetHierarchy({
      equipments: { ...EQUIPMENTS, K1: { ...EQUIPMENTS.K1, status: "TRIPPED" } },
      tags,
      alarms: [
        alarm("a1", "M1.CORRENTE"),
        alarm("a2", "SEM.DONO"),
        alarm("a3", "K1", { state: "CLEARED" }),
      ],
    });
    expect(h.alarmOwner.get("a1")).toBe("M1");
    expect(h.orphanAlarms.map((a) => a.id)).toEqual(["a2"]);
    expect(h.byEquipment.get("M1")?.map((d) => d.kind)).toEqual(["ALARM_UNACK", "FORCED"]);
    expect(h.byEquipment.get("K1")?.map((d) => d.kind)).toEqual(["TRIPPED", "STALE"]);
    const moega = h.areas.find((a) => a.key === "=FAB+MOEGA")!;
    expect(moega.totalTags).toBe(2);
    expect(moega.connectedTags).toBe(1);
    expect(moega.health).toBe("ALARM");
    expect(h.areas[0].health).toBe("ALARM");
    expect(h.byEquipment.get("M10")).toBeUndefined();
  });
});

describe("tendência do faceplate", () => {
  it("só pontos publicados, sem sem-fonte, sem repetir e com limite", () => {
    expect(plotValue(true)).toBe(1);
    expect(plotValue("RUN")).toBeNull();
    expect(plotValue(Number.NaN)).toBeNull();
    const base = { value: 5, quality: "GOOD" as const, driver: "IOT" as const, lastUpdated: 10 };
    expect(appendTrendPoint(undefined, { ...base, quality: "NOT_CONNECTED" })).toBeUndefined();
    const s1 = appendTrendPoint(undefined, base)!;
    expect(s1).toHaveLength(1);
    expect(appendTrendPoint(s1, base)).toBe(s1);
    const s2 = appendTrendPoint(s1, { ...base, quality: "STALE" })!;
    expect(s2).toHaveLength(2);
    let s: ReturnType<typeof appendTrendPoint> = undefined;
    for (let i = 0; i < TREND_MAX_POINTS + 50; i++)
      s = appendTrendPoint(s, { ...base, lastUpdated: i + 1 });
    expect(s).toHaveLength(TREND_MAX_POINTS);
    expect(s![0].t).toBe(51);
  });
});

describe("banner de alarmes", () => {
  it("não reconhecido vence; depois prioridade; depois o mais recente; encerrado não aparece", () => {
    const list = [
      alarm("a", "X", { state: "ACK", priority: "CRITICAL" }),
      alarm("b", "X", { priority: "LOW", timestamp: 5 }),
      alarm("c", "X", { priority: "HIGH", timestamp: 1 }),
      alarm("d", "X", { priority: "HIGH", timestamp: 3 }),
      alarm("e", "X", { priority: "CRITICAL", state: "CLEARED" }),
    ];
    expect(pickBannerAlarm(list)?.id).toBe("d");
    expect(pickBannerAlarm([list[4]])).toBeNull();
  });
});

describe("aceite: de um alarme ao faceplate e à tendência em até 2 cliques", () => {
  beforeEach(() => {
    const t = tag("M1.CORRENTE", { linkedEquipmentId: "M1", quality: "GOOD", value: 12 });
    useScadaStore.setState({
      currentProjectId: "p-1",
      isDemoProject: false,
      equipments: EQUIPMENTS,
      tags: { [t.name]: t },
      alarms: [alarm("a1", "M1.CORRENTE", { description: "Sobrecorrente M1" })],
      selectedEquipmentId: null,
    });
  });
  afterEach(() => cleanup());

  it("banner → faceplate (1 clique) já com alarme e tendência abertos", () => {
    render(
      <>
        <ScadaOsStatusBar />
        <EquipmentInspectorDrawer />
      </>,
    );
    expect(screen.queryByTestId("scada-equipment-drawer")).toBeNull();
    expect(screen.getByTestId("scada-alarm-counter").textContent).toContain("1/1");
    fireEvent.click(screen.getByTestId("scada-alarm-banner"));
    const drawer = screen.getByTestId("scada-equipment-drawer");
    expect(drawer.textContent).toContain("Sobrecorrente M1");
    expect(screen.getByTestId("faceplate-area").textContent).toContain("=FAB+MOEGA");
    // tendência visível sem outro clique (com o ponto publicado ou o aviso honesto)
    expect(
      screen.queryByTestId("faceplate-trend") ?? screen.queryByTestId("faceplate-trend-empty"),
    ).toBeTruthy();
  });

  it("visão geral mostra só desvios e leva ao faceplate em 1 clique", () => {
    render(
      <>
        <ScadaOverviewView />
        <EquipmentInspectorDrawer />
      </>,
    );
    const list = screen.getByTestId("overview-deviations");
    expect(list.textContent).toContain("Sobrecorrente M1");
    expect(screen.queryByTestId("scada-demo-kpis")).toBeNull();
    act(() => {
      fireEvent.click(list.querySelector("button")!);
    });
    expect(screen.getByTestId("scada-equipment-drawer")).toBeTruthy();
  });
});
