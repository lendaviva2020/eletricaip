// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-start", async (orig) => {
  const real = await orig<typeof import("@tanstack/react-start")>();
  return { ...real, useServerFn: () => vi.fn() };
});

import {
  ISA_TARGETS,
  PointKeySchema,
  alarmPointKey,
  computeAlarmKpis,
  emptySetting,
  firstOutIds,
  isShelved,
  partitionAlarms,
  type AlarmHistoryEvent,
} from "@/lib/scada/alarm-management";
import {
  UpdateAlarmPointSchema,
  checkAlarmPointChange,
} from "@/lib/scada/alarm-management.functions";
import { applyLocalChange, useAlarmMgmtStore } from "@/lib/scada/alarm-management-store";
import { csvCell, ScadaAlarmsView } from "@/components/scada/views/scada-alarms-view";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { ScadaAlarmItem } from "@/lib/scada/types";

function alarm(id: string, tag: string, extra: Partial<ScadaAlarmItem> = {}): ScadaAlarmItem {
  return {
    id,
    tag,
    description: `Alarme ${tag}`,
    priority: "HIGH",
    category: "PROCESS",
    currentValue: 0,
    setpointLimit: 0,
    state: "UNACK",
    timestamp: 1_000,
    ...extra,
  };
}

const PID = "11111111-1111-4111-8111-111111111111";

describe("ponto de alarme, prateleira e fora de serviço", () => {
  it("chave estável por categoria + tag (sem diferenciar caixa)", () => {
    expect(alarmPointKey({ category: "PROCESS", tag: " m1.corrente " })).toBe(
      "PROCESS|M1.CORRENTE",
    );
    expect(PointKeySchema.safeParse("PROCESS|M1").success).toBe(true);
    expect(PointKeySchema.safeParse("HACK|M1").success).toBe(false);
    expect(PointKeySchema.safeParse("PROCESS|a|b").success).toBe(false);
  });

  it("prateleira vence sozinha; fora de serviço só sai quando devolvido; segurança sempre visível", () => {
    const now = 10_000;
    const shelvedSet = applyLocalChange(
      undefined,
      "PROCESS|A",
      "A",
      { kind: "shelve", minutes: 15, reason: "calibração" },
      now,
    );
    const oos = applyLocalChange(
      undefined,
      "PROCESS|B",
      "B",
      { kind: "outOfService", reason: "sensor quebrado" },
      now,
    );
    const safety = {
      ...emptySetting("SAFETY|ESTOP", "ESTOP"),
      outOfService: true,
      oosReason: "x",
      oosAt: now,
    };
    const settings = new Map([
      [shelvedSet.pointKey, shelvedSet],
      [oos.pointKey, oos],
      [safety.pointKey, safety],
    ]);
    const list = [
      alarm("a", "A"),
      alarm("b", "B"),
      alarm("c", "C"),
      alarm("e", "ESTOP", { category: "SAFETY", priority: "CRITICAL" }),
    ];
    const p = partitionAlarms(list, settings, now + 60_000);
    expect(p.visible.map((a) => a.id)).toEqual(["c", "e"]);
    expect(p.shelved.map((a) => a.id)).toEqual(["a"]);
    expect(p.outOfService.map((a) => a.id)).toEqual(["b"]);
    const later = partitionAlarms(list, settings, now + 16 * 60_000);
    expect(later.visible.map((a) => a.id)).toEqual(["a", "c", "e"]);
    expect(isShelved(shelvedSet, now + 16 * 60_000)).toBe(false);
    const back = applyLocalChange(oos, oos.pointKey, "B", { kind: "returnToService" }, now);
    expect(back.outOfService).toBe(false);
    expect(back.oosReason).toBeNull();
  });
});

describe("regras do servidor", () => {
  const base = { projectId: PID, pointKey: "PROCESS|M1", tagName: "M1" };

  it("prateleira exige prazo ≤ 8 h e motivo; racionalização exige causa, consequência e ação", () => {
    expect(
      UpdateAlarmPointSchema.safeParse({
        ...base,
        change: { kind: "shelve", minutes: 481, reason: "ok ok" },
      }).success,
    ).toBe(false);
    expect(
      UpdateAlarmPointSchema.safeParse({
        ...base,
        change: { kind: "shelve", minutes: 60, reason: "x" },
      }).success,
    ).toBe(false);
    expect(
      UpdateAlarmPointSchema.safeParse({
        ...base,
        change: {
          kind: "rationalize",
          cause: "a",
          consequence: "bbb",
          correctiveAction: "ccc",
          responseTimeMin: null,
        },
      }).success,
    ).toBe(false);
  });

  it("papéis e alarme de segurança", () => {
    const shelve = UpdateAlarmPointSchema.parse({
      ...base,
      change: { kind: "shelve", minutes: 60, reason: "calibração" },
    });
    const oos = UpdateAlarmPointSchema.parse({
      ...base,
      change: { kind: "outOfService", reason: "manutenção" },
    });
    expect(checkAlarmPointChange(shelve, "operator").ok).toBe(true);
    expect(checkAlarmPointChange(shelve, "viewer").ok).toBe(false);
    expect(checkAlarmPointChange(oos, "operator").ok).toBe(false);
    expect(checkAlarmPointChange(oos, "engineer").ok).toBe(true);
    expect(checkAlarmPointChange(oos, null).ok).toBe(false);

    const safety = UpdateAlarmPointSchema.parse({
      ...base,
      pointKey: "SAFETY|ESTOP",
      tagName: "ESTOP",
      change: { kind: "shelve", minutes: 15, reason: "atrapalha" },
    });
    expect(checkAlarmPointChange(safety, "owner")).toMatchObject({ ok: false, status: 403 });
    const rat = UpdateAlarmPointSchema.parse({
      ...base,
      pointKey: "SAFETY|ESTOP",
      tagName: "ESTOP",
      change: {
        kind: "rationalize",
        cause: "botão",
        consequence: "parada",
        correctiveAction: "verificar",
        responseTimeMin: 5,
      },
    });
    expect(checkAlarmPointChange(rat, "engineer").ok).toBe(true);

    const mismatch = UpdateAlarmPointSchema.parse({
      ...base,
      tagName: "M2",
      change: { kind: "unshelve" },
    });
    expect(checkAlarmPointChange(mismatch, "owner")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("primeiro alarme e indicadores", () => {
  it("marca só o primeiro de uma rajada do mesmo equipamento", () => {
    const list = [
      alarm("x2", "M1.T", { timestamp: 5_000 }),
      alarm("x1", "M1.I", { timestamp: 1_000 }),
      alarm("x3", "M1.V", { timestamp: 30_000 }),
      alarm("y1", "M2.I", { timestamp: 2_000 }),
    ];
    const ids = firstOutIds(list, (a) => a.tag.split(".")[0]);
    expect([...ids]).toEqual(["x1"]);
  });

  it("calcula alarmes/hora, inundação, oscilação, parados e os mais frequentes", () => {
    const H = 3_600_000;
    const from = 0;
    const to = 24 * H;
    const ev: AlarmHistoryEvent[] = [];
    // inundação: 12 alarmes no mesmo intervalo de 10 min, 3 em menos de 60 s no mesmo ponto
    for (let i = 0; i < 12; i++)
      ev.push({
        pointKey: i < 3 ? "PROCESS|LT1" : `PROCESS|P${i}`,
        tag: i < 3 ? "LT1" : `P${i}`,
        priority: "MEDIUM",
        triggeredAt: H + i * 10_000,
        acknowledgedAt: H + i * 10_000 + 30_000,
        clearedAt: H + i * 10_000 + 60_000,
      });
    // parado há mais de 24 h
    ev.push({
      pointKey: "PROCESS|OLD",
      tag: "OLD",
      priority: "LOW",
      triggeredAt: -2 * H,
      acknowledgedAt: null,
      clearedAt: null,
    });
    const k = computeAlarmKpis(ev, { from, to, now: to });
    expect(k.total).toBe(12);
    expect(k.perHour).toBeCloseTo(0.5);
    expect(k.peak10Min).toBe(12);
    expect(k.floodIntervals).toBe(1);
    expect(k.floodTimePct).toBeCloseTo(100 / 144);
    expect(k.chatteringPoints.map((c) => c.tag)).toEqual(["LT1"]);
    expect(k.standing.map((s) => s.tag)).toEqual(["OLD"]);
    expect(k.topBadActors[0]).toMatchObject({ tag: "LT1", count: 3 });
    expect(k.medianAckMs).toBe(30_000);
    expect(ISA_TARGETS.floodPer10Min).toBe(10);
    const empty = computeAlarmKpis([], { from, to, now: to });
    expect(empty.total).toBe(0);
    expect(empty.medianAckMs).toBeNull();
  });

  it("CSV não executa fórmula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell('a"b')).toBe(`"a""b"`);
  });
});

describe("aceite: listas de prateleira e de fora de serviço (demonstração, local)", () => {
  beforeEach(() => {
    useScadaStore.setState({
      currentProjectId: PID,
      isDemoProject: true,
      equipments: {},
      tags: {},
      alarms: [alarm("a1", "LT1", { description: "Nível alto" }), alarm("a2", "PT1")],
    });
    useAlarmMgmtStore
      .getState()
      .load({ projectId: PID, available: true, role: "owner", settings: [] });
  });
  afterEach(() => cleanup());

  it("pôr na prateleira tira da lista ativa e aparece na lista de prateleira", async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScadaAlarmsView />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("alarm-row-a1")).toBeTruthy();
    act(() => {
      useAlarmMgmtStore
        .getState()
        .upsert(
          applyLocalChange(
            undefined,
            "PROCESS|LT1",
            "LT1",
            { kind: "shelve", minutes: 60, reason: "calibração" },
            Date.now(),
          ),
        );
      useAlarmMgmtStore
        .getState()
        .upsert(
          applyLocalChange(
            undefined,
            "PROCESS|PT1",
            "PT1",
            { kind: "outOfService", reason: "manutenção" },
            Date.now(),
          ),
        );
    });
    expect(screen.queryByTestId("alarm-row-a1")).toBeNull();
    expect(screen.getByTestId("alarms-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("alarm-tab-shelved"));
    expect(screen.getByTestId("alarms-shelved-list").textContent).toContain("LT1");
    expect(screen.getByTestId("alarms-shelved-list").textContent).toContain("calibração");
    fireEvent.click(screen.getByTestId("alarm-tab-oos"));
    expect(screen.getByTestId("alarms-oos-list").textContent).toContain("PT1");
    fireEvent.click(screen.getByText("Devolver ao serviço"));
    await act(async () => {});
    expect(screen.queryByTestId("alarms-oos-list")).toBeNull();
    fireEvent.click(screen.getByTestId("alarm-tab-kpis"));
    expect(screen.getByTestId("alarm-kpi-cards")).toBeTruthy();
  });
});
