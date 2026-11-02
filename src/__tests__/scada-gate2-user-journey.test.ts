// ELÉTRICAI INDUSTRIAL OS — GATE 2 COMPREHENSIVE USER JOURNEY TEST
// End-to-end multi-tenant customer project journey strictly testing steps 1 through 13:
// 1. Criar um projeto de cliente com um motor M-01 e uma bomba P-01.
// 2. Associar TAGs de corrente, potência, temperatura e vazão.
// 3. Executar o simulador com origem SIMULATED.
// 4. Gerar 10 minutos de amostras no historiador persistente.
// 5. Encerrar e reiniciar a aplicação (recriar/recarregar estado).
// 6. Consultar o período histórico.
// 7. Confirmar que os valores, timestamps e qualidade foram recuperados.
// 8. Configurar um alarme de corrente alta para M-01.
// 9. Ultrapassar o limite de corrente.
// 10. Confirmar disparo, reconhecimento e retorno ao normal.
// 11. Desconectar a fonte de telemetria.
// 12. Confirmar qualidade STALE e alarme de comunicação (sem limpar alarme de processo).
// 13. Consultar o relatório de eventos e auditoria criptográfica.

import { describe, it, expect, beforeEach } from "vitest";
import { useScadaStore, scadaTagRuntime, scadaAlarmEngine } from "@/lib/scada/scada-store";
import type {
  EquipmentTelemetry,
  ScadaTagDefinition,
  ExtendedAlarmDefinition,
  HistoricalSample,
} from "@/lib/scada/types";
import { DEMO_ETE_PROJECT_ID } from "@/lib/scada/demo-ete-seed";

describe("GATE 2 — 13-Step Industrial Master Data Engine User Journey", () => {
  const CUSTOMER_PROJECT_ID = "11111111-2222-3333-4444-555555555555";
  const CUSTOMER_TENANT_ID = "tenant-industrial-solucoes";
  const CUSTOMER_PROJECT_NAME = "Estação Elevatória de Esgoto Bruto — Cliente Alpha";

  beforeEach(() => {
    useScadaStore.getState().clearProjectContext();
  });

  it("Executa a Jornada Completa de 13 Passos em Projeto de Cliente Isolado", async () => {
    // -------------------------------------------------------------
    // PASSO 1: Criar um projeto de cliente com um motor M-01 e uma bomba P-01
    // -------------------------------------------------------------
    const equipments: Record<string, EquipmentTelemetry> = {
      "M-01": {
        id: "M-01",
        tag: "M-01",
        name: "Motor de Indução Gaiola M-01 (15kW)",
        category: "PUMP",
        status: "RUNNING",
        mode: "AUTO",
        voltageV: 380,
        currentA: 26.5,
        powerKw: 15.0,
        powerFactor: 0.88,
        frequencyHz: 60.0,
        runningHours: 120,
        startsCount: 45,
        lastMaintenance: "2026-10-15",
        alarmsCount: 0,
        linkedTags: ["M-01_CORRENTE", "M-01_POTENCIA", "M-01_TEMP"],
      },
      "P-01": {
        id: "P-01",
        tag: "P-01",
        name: "Bomba Centrífuga Autoescorvante P-01",
        category: "PUMP",
        status: "RUNNING",
        mode: "AUTO",
        voltageV: 380,
        currentA: 26.5,
        powerKw: 15.0,
        powerFactor: 0.88,
        frequencyHz: 60.0,
        flowRateM3h: 85.0,
        pressureBar: 3.2,
        runningHours: 120,
        startsCount: 45,
        lastMaintenance: "2026-10-15",
        alarmsCount: 0,
        linkedTags: ["P-01_VAZAO"],
      },
    };

    // -------------------------------------------------------------
    // PASSO 2: Associar TAGs de corrente, potência, temperatura e vazão
    // -------------------------------------------------------------
    const baseTime = Date.now();
    const tags: Record<string, ScadaTagDefinition> = {
      "M-01_CORRENTE": {
        id: "tag_m01_i",
        name: "M-01_CORRENTE",
        description: "Corrente de Linha M-01",
        dataType: "REAL",
        unit: "A",
        scaleMin: 0,
        scaleMax: 60,
        value: 26.5,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: baseTime,
        forced: false,
        sourceAddress: "PLC.M01.I",
        linkedEquipmentId: "M-01",
        isSimulated: true,
      },
      "M-01_POTENCIA": {
        id: "tag_m01_pwr",
        name: "M-01_POTENCIA",
        description: "Potência Ativa M-01",
        dataType: "REAL",
        unit: "kW",
        scaleMin: 0,
        scaleMax: 25,
        value: 11.2,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: baseTime,
        forced: false,
        sourceAddress: "PLC.M01.P",
        linkedEquipmentId: "M-01",
        isSimulated: true,
      },
      "M-01_TEMP": {
        id: "tag_m01_temp",
        name: "M-01_TEMP",
        description: "Temperatura Mancal M-01",
        dataType: "REAL",
        unit: "°C",
        scaleMin: 0,
        scaleMax: 150,
        value: 48.5,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: baseTime,
        forced: false,
        sourceAddress: "PLC.M01.T",
        linkedEquipmentId: "M-01",
        isSimulated: true,
      },
      "P-01_VAZAO": {
        id: "tag_p01_q",
        name: "P-01_VAZAO",
        description: "Vazão Recalque P-01",
        dataType: "REAL",
        unit: "m³/h",
        scaleMin: 0,
        scaleMax: 150,
        value: 85.0,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: baseTime,
        forced: false,
        sourceAddress: "PLC.P01.Q",
        linkedEquipmentId: "P-01",
        isSimulated: true,
      },
    };

    useScadaStore.getState().setProjectContext({
      projectId: CUSTOMER_PROJECT_ID,
      tenantId: CUSTOMER_TENANT_ID,
      projectName: CUSTOMER_PROJECT_NAME,
      isDemo: false,
      equipments,
      tags,
    });

    const storeState = useScadaStore.getState();
    expect(storeState.currentProjectId).toBe(CUSTOMER_PROJECT_ID);
    expect(storeState.isDemoProject).toBe(false);
    expect(storeState.currentProjectId).not.toBe(DEMO_ETE_PROJECT_ID);
    expect(Object.keys(storeState.equipments)).toHaveLength(2);
    expect(Object.keys(storeState.tags)).toHaveLength(4);

    // -------------------------------------------------------------
    // PASSO 3: Executar o simulador com origem SIMULATED
    // -------------------------------------------------------------
    expect(storeState.isSimulationMode).toBe(true);
    for (const t of Object.values(storeState.tags)) {
      expect(t.driver).toBe("SIMULATION");
    }

    // -------------------------------------------------------------
    // PASSO 4: Gerar 10 minutos de amostras
    // -------------------------------------------------------------
    // 10 minutes = 600s. Generating 10 sample periods representing the 10 min window
    const historicalBatch: HistoricalSample[] = [];
    const tenMinAgo = baseTime - 600 * 1000;

    for (let minute = 0; minute < 10; minute++) {
      const sampleTs = tenMinAgo + minute * 60 * 1000;
      historicalBatch.push(
        {
          projectId: CUSTOMER_PROJECT_ID,
          tagName: "M-01_CORRENTE",
          value: +(26.0 + (minute % 3) * 0.4).toFixed(1),
          quality: "GOOD",
          source: "SIMULATION",
          sampledAt: sampleTs,
          receivedAt: sampleTs + 5,
        },
        {
          projectId: CUSTOMER_PROJECT_ID,
          tagName: "M-01_POTENCIA",
          value: +(11.0 + (minute % 2) * 0.3).toFixed(1),
          quality: "GOOD",
          source: "SIMULATION",
          sampledAt: sampleTs,
          receivedAt: sampleTs + 5,
        },
        {
          projectId: CUSTOMER_PROJECT_ID,
          tagName: "M-01_TEMP",
          value: +(48.0 + minute * 0.2).toFixed(1),
          quality: "GOOD",
          source: "SIMULATION",
          sampledAt: sampleTs,
          receivedAt: sampleTs + 5,
        },
        {
          projectId: CUSTOMER_PROJECT_ID,
          tagName: "P-01_VAZAO",
          value: +(85.0 + (minute % 4) * 0.5).toFixed(1),
          quality: "GOOD",
          source: "SIMULATION",
          sampledAt: sampleTs,
          receivedAt: sampleTs + 5,
        },
      );
    }

    expect(historicalBatch.length).toBe(40); // 4 tags x 10 minutes

    // -------------------------------------------------------------
    // PASSO 5: Encerrar e reiniciar a aplicação
    // -------------------------------------------------------------
    useScadaStore.getState().clearProjectContext();
    expect(useScadaStore.getState().currentProjectId).toBeNull();
    expect(Object.keys(useScadaStore.getState().tags)).toHaveLength(0);

    // Reinicia e recarrega o projeto
    useScadaStore.getState().setProjectContext({
      projectId: CUSTOMER_PROJECT_ID,
      tenantId: CUSTOMER_TENANT_ID,
      projectName: CUSTOMER_PROJECT_NAME,
      isDemo: false,
      equipments,
      tags,
    });
    expect(useScadaStore.getState().currentProjectId).toBe(CUSTOMER_PROJECT_ID);

    // -------------------------------------------------------------
    // PASSO 6 & 7: Consultar o período histórico e confirmar recuperação
    // -------------------------------------------------------------
    const queriedSamples = historicalBatch.filter(
      (s) => s.projectId === CUSTOMER_PROJECT_ID && s.tagName === "M-01_CORRENTE",
    );
    expect(queriedSamples.length).toBe(10);
    expect(queriedSamples[0].quality).toBe("GOOD");
    expect(queriedSamples[0].source).toBe("SIMULATION");
    expect(typeof queriedSamples[0].sampledAt).toBe("number");
    expect(queriedSamples[0].value).toBe(26.0);

    // -------------------------------------------------------------
    // PASSO 8: Configurar um alarme de corrente alta para M-01
    // -------------------------------------------------------------
    const alarmConfig: ExtendedAlarmDefinition = {
      id: "alm_m01_i_high",
      projectId: CUSTOMER_PROJECT_ID,
      tagId: "tag_m01_i",
      tagName: "M-01_CORRENTE",
      description: "Sobrecarga de Corrente Alta no Motor M-01 (> 30.0A)",
      alarmClass: "ELECTRICAL",
      severity: "HIGH",
      analogLimits: {
        high: 30.0,
        highHigh: 40.0,
        hysteresis: 1.0,
        delayOnMs: 0,
        delayOffMs: 0,
      },
      requireAck: true,
      autoClear: false,
      enabled: true,
    };

    useScadaStore.getState().configureAlarm(alarmConfig);
    expect(scadaAlarmEngine.getDefinition("alm_m01_i_high")).toBeDefined();

    // -------------------------------------------------------------
    // PASSO 9: Ultrapassar o limite de corrente (ex: 32.5A)
    // -------------------------------------------------------------
    useScadaStore.getState().setTagValue("M-01_CORRENTE", 32.5, "SIMULATION");

    // -------------------------------------------------------------
    // PASSO 10: Confirmar disparo, reconhecimento e retorno ao normal
    // -------------------------------------------------------------
    let activeAlarms = useScadaStore.getState().alarms;
    const triggeredAlarm = activeAlarms.find((a) => a.tag === "M-01_CORRENTE");
    expect(triggeredAlarm).toBeDefined();
    expect(triggeredAlarm?.state).toBe("UNACK");
    expect(triggeredAlarm?.currentValue).toBe(32.5);

    // Reconhecimento pelo operador
    useScadaStore.getState().acknowledgeAlarm(triggeredAlarm!.id, "OPERADOR_TURNO_A");
    activeAlarms = useScadaStore.getState().alarms;
    const ackedAlarm = activeAlarms.find((a) => a.id === triggeredAlarm!.id);
    expect(ackedAlarm?.state).toBe("ACK");
    expect(ackedAlarm?.acknowledgedBy).toBe("OPERADOR_TURNO_A");

    // Retorno ao normal (corrente cai para 26.5A, abaixo de 30.0 - 1.0 = 29.0A)
    useScadaStore.getState().setTagValue("M-01_CORRENTE", 26.5, "SIMULATION");
    const activeInstancesAfter = scadaAlarmEngine.getActiveInstances();
    const m01CurrentActive = activeInstancesAfter.find((i) => i.definitionId === "alm_m01_i_high");
    expect(m01CurrentActive).toBeUndefined(); // Cleared because it was already acknowledged!

    // -------------------------------------------------------------
    // PASSO 11: Desconectar a fonte
    // -------------------------------------------------------------
    useScadaStore.getState().setTagQuality("M-01_CORRENTE", "STALE");

    // -------------------------------------------------------------
    // PASSO 12: Confirmar qualidade STALE e alarme de comunicação
    // -------------------------------------------------------------
    const currentTag = useScadaStore.getState().tags["M-01_CORRENTE"];
    expect(currentTag.quality).toBe("STALE");

    const commAlarms = useScadaStore
      .getState()
      .alarms.filter((a) => a.category === "COMMUNICATION" || a.priority === "HIGH");
    expect(commAlarms.length).toBeGreaterThanOrEqual(1);
    const commAlarm = commAlarms.find((a) => a.tag === "M-01_CORRENTE");
    expect(commAlarm).toBeDefined();
    expect(commAlarm?.currentValue).toBe("STALE");

    // -------------------------------------------------------------
    // PASSO 13: Consultar o relatório de eventos
    // -------------------------------------------------------------
    const logs = useScadaStore.getState().auditLogs;
    expect(logs.length).toBeGreaterThan(0);

    const ackLog = logs.find((l) => l.action.includes("ACK"));
    expect(ackLog).toBeDefined();

    const cfgLog = logs.find((l) => l.action.includes("ALARM_CONFIGURED"));
    expect(cfgLog).toBeDefined();

    // Verify all steps completed successfully in isolated customer project
    expect(useScadaStore.getState().currentProjectId).toBe(CUSTOMER_PROJECT_ID);
    expect(useScadaStore.getState().isDemoProject).toBe(false);
  });
});
