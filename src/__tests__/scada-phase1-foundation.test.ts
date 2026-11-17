/**
 * SCADA Fase 1 — fonte única de tags e persistência de alarmes/auditoria.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mergeAlarmLists, useScadaStore } from "@/lib/scada/scada-store";
import { publishTags, sourceLabel, tagOrigin } from "@/lib/scada/tag-hub";
import { useProjectStore } from "@/lib/project-store";
import { ScadaPersistenceTracker } from "@/lib/scada/scada-persistence-sync";
import {
  alarmOccurrenceId,
  alarmToOccurrence,
  rowToAlarm,
  shouldRestore,
} from "@/lib/scada/scada-persistence-model";
import { benchSnapshotToPublished, mccTagsToPublished } from "@/lib/scada/source-bridges";
import { parseForcedValue } from "@/components/scada/force-tag-dialog";
import { verifyAuditChainIntegrity, computeAuditChainHash } from "@/lib/scada/audit-verifier";
import { AUDIT_TRAIL_GENESIS_HASH } from "@/lib/scada/audit-verifier";
import { FORCE_ROLES } from "@/lib/scada/scada-operations.functions";
import { DEFAULT_BENCH_CONFIG } from "@/lib/hardware/bench-config";
import type { ScadaAlarmItem, ScadaAuditLog } from "@/lib/scada/types";

const PROJECT = "22222222-2222-4222-8222-222222222222";

function openCustomerProject() {
  useScadaStore.getState().clearProjectContext();
  useScadaStore.getState().setProjectContext({
    projectId: PROJECT,
    tenantId: "tenant-a",
    projectName: "Cliente",
    isDemo: false,
  });
}

function alarm(partial: Partial<ScadaAlarmItem> = {}): ScadaAlarmItem {
  return {
    id: "ext:hmi-script",
    tag: "ALARM_ACTIVE",
    description: "Nível alto",
    priority: "HIGH",
    category: "PROCESS",
    currentValue: true,
    setpointLimit: "—",
    state: "UNACK",
    timestamp: 1_700_000_000_000,
    acknowledgedAt: null,
    acknowledgedBy: null,
    clearedAt: null,
    origin: "EXTERNAL",
    source: "SIMULATION",
    ...partial,
  };
}

describe("Fase 1 — base única de tags", () => {
  beforeEach(() => {
    openCustomerProject();
    useProjectStore.setState({ tags: {} });
  });

  it("um tag tem o mesmo valor e origem no SCADA e no editor HMI", () => {
    publishTags("IOT", [{ name: "BANCADA.A0", value: 4.2, unit: "A" }]);
    const scada = useScadaStore.getState().tags["BANCADA.A0"];
    expect(scada.value).toBe(4.2);
    expect(scada.driver).toBe("IOT");
    expect(scada.isSimulated).toBe(false);
    expect(scada.unit).toBe("A");
    expect(useProjectStore.getState().tags["BANCADA.A0"]).toBe(4.2);
    expect(tagOrigin("BANCADA.A0")).toMatchObject({ source: "IOT", isSimulated: false });
    expect(sourceLabel("IOT")).toBe("Dispositivo físico");
  });

  it("o editor HMI publica na base única com a origem informada", () => {
    useProjectStore.getState().applyTick({ tags: { NIVEL: 37 }, source: "SIMULATION" });
    useProjectStore.getState().applyTick({ tags: { BOMBA: true } });
    const tags = useScadaStore.getState().tags;
    expect(tags.NIVEL).toMatchObject({ value: 37, driver: "SIMULATION", isSimulated: true });
    // Sem origem informada = runtime interno (simulado), nunca leitura de campo.
    expect(tags.BOMBA).toMatchObject({ driver: "INTERNAL_RUNTIME", isSimulated: true });
  });

  it("sem projeto aberto nada é publicado; NaN/Infinity são descartados", () => {
    publishTags("IOT", { X: Number.NaN, Y: Number.POSITIVE_INFINITY });
    expect(useScadaStore.getState().tags.X).toBeUndefined();
    useScadaStore.getState().clearProjectContext();
    publishTags("IOT", { Z: 1 });
    expect(useScadaStore.getState().tags.Z).toBeUndefined();
  });

  it("tags salvos no projeto antigo entram como importados e sem conexão", () => {
    useScadaStore.getState().registerSavedTags({ TEMP_OLEO: 81.5 });
    expect(useScadaStore.getState().tags.TEMP_OLEO).toMatchObject({
      quality: "NOT_CONNECTED",
      driver: "IMPORTED",
    });
  });

  it("CCM: temperatura sem sensor (-999) não é publicada; unidades corretas", () => {
    const out = mccTagsToPublished({
      M1_RUN: true,
      M1_CURRENT_A: 11.6,
      M1_TEMP_C: -999,
      M1_SPEED_RPM: 1750,
    });
    expect(out.find((v) => v.name === "M1_TEMP_C")).toBeUndefined();
    expect(out.find((v) => v.name === "M1_CURRENT_A")?.unit).toBe("A");
    expect(out.find((v) => v.name === "M1_SPEED_RPM")?.unit).toBe("rpm");
  });

  it("bancada: nomes estáveis com prefixo e digitais como booleano", () => {
    const out = benchSnapshotToPublished(DEFAULT_BENCH_CONFIG, {
      readings: [],
      inputsMask: 0,
      outputsMask: 0,
      estop: true,
    });
    const estop = out.find((v) => v.name === "BANCADA.estop");
    expect(estop?.value).toBe(true);
    expect(out.every((v) => v.name.startsWith("BANCADA."))).toBe(true);
  });
});

describe("Fase 1 — lista única de alarmes", () => {
  beforeEach(openCustomerProject);

  it("saída do motor não apaga alarmes de outras fontes nem restaurados", () => {
    const merged = mergeAlarmLists(
      [alarm({ id: "comm_t1", origin: "ENGINE" })],
      [
        alarm({ id: "comm_old", origin: "ENGINE" }),
        alarm({ id: "ext:estop", origin: "EXTERNAL" }),
        alarm({ id: "x", origin: "RESTORED" }),
      ],
    );
    expect(merged.map((a) => a.id).sort()).toEqual(["comm_t1", "ext:estop", "x"]);
    // Motor sem alarmes: os do motor somem (antes o último ficava para sempre).
    expect(mergeAlarmLists([], [alarm({ id: "comm_t1", origin: "ENGINE" })])).toHaveLength(0);
  });

  it("alarme externo: normalizar sem reconhecer mantém na lista; reconhecido sai", () => {
    const st = useScadaStore.getState();
    st.raiseExternalAlarm({
      key: "k1",
      tag: "T",
      description: "Alto",
      priority: "HIGH",
      source: "SIMULATION",
    });
    st.clearExternalAlarm("k1");
    let a = useScadaStore.getState().alarms.find((x) => x.id === "ext:k1");
    expect(a?.state).toBe("UNACK");
    expect(a?.clearedAt).not.toBeNull();

    st.raiseExternalAlarm({
      key: "k2",
      tag: "T2",
      description: "Alto 2",
      priority: "HIGH",
      source: "SIMULATION",
    });
    useScadaStore.getState().acknowledgeAlarm("ext:k2", "OP");
    useScadaStore.getState().clearExternalAlarm("k2");
    // Fica até ser gravado (o banco precisa receber o reconhecimento)…
    a = useScadaStore.getState().alarms.find((x) => x.id === "ext:k2");
    expect(a).toMatchObject({ state: "ACK" });
    const occ = `${a?.id}@${a?.timestamp}`;
    useScadaStore.getState().pruneSettledAlarms(new Set(["outra@1"]));
    expect(useScadaStore.getState().alarms.find((x) => x.id === "ext:k2")).toBeDefined();
    // …e sai depois de gravado.
    useScadaStore.getState().pruneSettledAlarms(new Set([occ]));
    expect(useScadaStore.getState().alarms.find((x) => x.id === "ext:k2")).toBeUndefined();
  });

  it("alarmes restaurados do banco voltam à lista sem duplicar", () => {
    const restored = [alarm({ id: "comm_t9", origin: "RESTORED" })];
    useScadaStore
      .getState()
      .hydratePersisted({ projectId: PROJECT, alarms: restored, auditLogs: [] });
    useScadaStore
      .getState()
      .hydratePersisted({ projectId: PROJECT, alarms: restored, auditLogs: [] });
    expect(useScadaStore.getState().alarms.filter((a) => a.id === "comm_t9")).toHaveLength(1);
    // Projeto diferente: ignorado (isolamento).
    useScadaStore
      .getState()
      .hydratePersisted({ projectId: "outro", alarms: [alarm({ id: "zzz" })], auditLogs: [] });
    expect(useScadaStore.getState().alarms.find((a) => a.id === "zzz")).toBeUndefined();
  });
});

describe("Fase 1 — forçar tag", () => {
  beforeEach(openCustomerProject);

  it("exige motivo; guarda o valor real e devolve-o como INCERTO ao liberar", () => {
    publishTags("IOT", [{ name: "PT_01", value: 5.5, unit: "bar" }]);
    const st = useScadaStore.getState();
    expect(() => st.forceTagValue("PT_01", 9, { operator: "Ana", reason: "ok" })).toThrow(
      /FORCE_REASON_REQUIRED/,
    );
    st.forceTagValue("PT_01", 9, { operator: "Ana", reason: "Transmissor em manutenção" });
    expect(useScadaStore.getState().tags.PT_01).toMatchObject({ value: 9, quality: "FORCED" });

    // Fonte continua publicando por baixo; o valor forçado não é sobrescrito.
    publishTags("IOT", [{ name: "PT_01", value: 5.7 }]);
    expect(useScadaStore.getState().tags.PT_01.value).toBe(9);

    useScadaStore.getState().unforceTag("PT_01", "Ana");
    expect(useScadaStore.getState().tags.PT_01).toMatchObject({
      value: 5.7,
      quality: "UNCERTAIN",
      forced: false,
    });
    const log = useScadaStore.getState().auditLogs.find((l) => l.action === "TAG_FORCE");
    expect(log?.details).toContain("Transmissor em manutenção");
  });

  it("só engenharia/administração podem forçar (servidor)", () => {
    expect(FORCE_ROLES.has("engineer")).toBe(true);
    expect(FORCE_ROLES.has("operator")).toBe(false);
    expect(FORCE_ROLES.has("viewer")).toBe(false);
    const src = readFileSync("src/lib/scada/scada-operations.functions.ts", "utf8");
    expect(src).toMatch(/authorizeProjectAccess\(ctx, data\.projectId, \{\s*requireWrite: true/);
  });

  it("valor digitado é convertido no tipo do tag", () => {
    expect(parseForcedValue("1", "BOOL")).toBe(true);
    expect(parseForcedValue("desligado", "BOOL")).toBe(false);
    expect(parseForcedValue("talvez", "BOOL")).toBeNull();
    expect(parseForcedValue("12,5", "REAL")).toBe(12.5);
    expect(parseForcedValue("", "REAL")).toBeNull();
  });
});

describe("Fase 1 — persistência", () => {
  it("ocorrência estável; reconhecer e normalizar atualizam a mesma linha", () => {
    const t = new ScadaPersistenceTracker();
    const a1 = alarm();
    let batch = t.diff([a1], []);
    expect(batch.alarms).toHaveLength(1);
    expect(batch.alarms[0].occurrenceId).toBe(alarmOccurrenceId(a1));
    t.commit(batch, [a1]);
    expect(t.diff([a1], []).alarms).toHaveLength(0);

    const acked = { ...a1, state: "ACK" as const, acknowledgedAt: a1.timestamp + 10 };
    batch = t.diff([acked], []);
    expect(batch.alarms[0]).toMatchObject({ state: "acknowledged" });
    t.commit(batch, [acked]);

    // Saiu da lista → normalizado, mesma ocorrência.
    batch = t.diff([], []);
    expect(batch.alarms[0]).toMatchObject({
      occurrenceId: alarmOccurrenceId(a1),
      state: "cleared",
    });
  });

  it("falha no envio: nada se perde, a próxima rodada reenvia", () => {
    const t = new ScadaPersistenceTracker();
    const a1 = alarm();
    expect(t.diff([a1], []).alarms).toHaveLength(1);
    // sem commit (servidor falhou)
    expect(t.diff([a1], []).alarms).toHaveLength(1);
  });

  it("o que veio do banco não é reenviado ao abrir", () => {
    const t = new ScadaPersistenceTracker();
    const a1 = alarm({ origin: "RESTORED" });
    t.seed([a1]);
    expect(t.diff([a1], []).alarms).toHaveLength(0);
  });

  it("auditoria: ignora abertura de projeto, forçamento (gravado no servidor) e o já gravado", () => {
    const t = new ScadaPersistenceTracker();
    const log = (p: Partial<ScadaAuditLog>): ScadaAuditLog => ({
      id: Math.random().toString(36),
      timestamp: 1_700_000_000_000,
      category: "OPERATOR",
      operator: "Ana",
      action: "EQUIPMENT_START",
      details: "Partida",
      severity: "INFO",
      ...p,
    });
    const batch = t.diff(
      [],
      [
        log({}),
        log({ action: "PROJECT_CONTEXT_SET", category: "SYSTEM" }),
        log({ action: "TAG_FORCE", category: "SECURITY" }),
        log({ persisted: true }),
      ],
    );
    expect(batch.audit.map((e) => e.action)).toEqual(["EQUIPMENT_START"]);
  });

  it("linha do banco volta como alarme restaurado; reconhecido+normalizado não volta", () => {
    const row = {
      occurrence_id: "comm_t1@1700000000000",
      tag_name: "T1",
      description: "Falha de comunicação",
      severity: "high",
      state: "cleared",
      category: "communication",
      value: null,
      setpoint: null,
      triggered_at: "2023-11-14T22:13:20.000+00:00",
      acknowledged_at: null,
      acknowledged_by: null,
      cleared_at: "2023-11-14T22:14:00.000+00:00",
      source: "MQTT",
    };
    const a = rowToAlarm(row);
    expect(a).toMatchObject({
      id: "comm_t1",
      priority: "HIGH",
      category: "COMMUNICATION",
      origin: "RESTORED",
      source: "MQTT",
    });
    expect(a && shouldRestore(a)).toBe(true);
    const back = alarmToOccurrence(a as ScadaAlarmItem, true, Date.now());
    expect(back.occurrenceId).toBe("comm_t1@1700000000000");
    expect(shouldRestore({ ...(a as ScadaAlarmItem), state: "ACK" })).toBe(false);
  });

  it("verificação da cadeia aceita a data no formato devolvido pelo banco", () => {
    const createdAt = "2026-11-17T10:00:00.123Z";
    const hash = computeAuditChainHash({
      previousHash: AUDIT_TRAIL_GENESIS_HASH,
      tenantId: "t",
      userId: "u",
      action: "ALARM_ACK",
      details: { b: 1, a: 2 },
      createdAt,
    });
    const res = verifyAuditChainIntegrity([
      {
        tenant_id: "t",
        user_id: "u",
        action: "ALARM_ACK",
        details: { a: 2, b: 1 },
        previous_hash: AUDIT_TRAIL_GENESIS_HASH,
        chain_hash: hash,
        created_at: "2026-11-17T10:00:00.123+00:00",
      },
    ]);
    expect(res.status).toBe("VALID");
  });

  it("a lista paralela de alarmes do modo Alarmes foi removida", () => {
    expect(existsSync("src/lib/alarm-store.ts")).toBe(false);
    const canvas = readFileSync("src/components/canvases/alarms-canvas.tsx", "utf8");
    expect(canvas).toMatch(/useScadaStore/);
  });
});
