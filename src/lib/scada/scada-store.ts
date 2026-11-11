// SCADA SUPERVISÓRIO — Industrial State Engine & Store
// Synchronized with Canonical Engineering Models & Simulation Core
// Standards: ISA-101, ISA-18.2, IEC 62443, NR-10, NR-12, ISO 13849-1

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ScadaViewId,
  ScadaSynopticSector,
  ScadaTagDefinition,
  ScadaAlarmItem,
  EquipmentTelemetry,
  ScadaAuditLog,
  CommunicationGatewayStatus,
  ScadaSystemSettings,
  ScadaTrendPoint,
  SafetyActionLevel,
  ExtendedAlarmDefinition,
  TagQuality,
  ProtocolDriver,
  HistoricalSample,
} from "./types";
import type { GatewayHealthTelemetry } from "../edge/types";
import {
  DEMO_ETE_PROJECT_ID,
  DEMO_ETE_PROJECT_NAME,
  DEMO_ETE_TENANT_ID,
  DEMO_ETE_EQUIPMENTS,
  DEMO_ETE_TAGS,
  DEMO_ETE_ALARMS,
  DEMO_ETE_LOGS,
  getDemoEteSeed,
} from "./demo-ete-seed";
import { IndustrialTagRuntime } from "./tag-runtime";
import { DeterministicAlarmEngine } from "./alarm-engine";

export const scadaTagRuntime = new IndustrialTagRuntime();
export const scadaAlarmEngine = new DeterministicAlarmEngine();

interface ScadaState {
  // Navigation & View
  activeView: ScadaViewId;
  selectedSector: ScadaSynopticSector;
  selectedEquipmentId: string | null;

  // Project Context & Multi-Tenancy (Gate 1A)
  currentProjectId: string | null;
  currentTenantId: string | null;
  currentProjectName: string | null;
  isDemoProject: boolean;

  // Safety Boundaries (NR-10, NR-12, ISO 13849-1, IEC 62061)
  safetyLevel: SafetyActionLevel;
  isPhysicalControlAllowed: boolean;
  safetyNotice: string;

  // System & Operation Status
  isSimulationMode: boolean;
  audioAlertMuted: boolean;
  estopActive: boolean;
  systemTime: number;

  // Telemetry & KPIs (ETE - Reference Image Match)
  totalFlowM3h: number;
  totalPowerKw: number;
  powerFactor: number;
  systemEfficiencyPct: number;
  criticalAlarmsCount: number;
  warningAlarmsCount: number;

  // Data Collections
  equipments: Record<string, EquipmentTelemetry>;
  tags: Record<string, ScadaTagDefinition>;
  alarms: ScadaAlarmItem[];
  trendHistory: ScadaTrendPoint[];
  auditLogs: ScadaAuditLog[];
  gatewayStatus: CommunicationGatewayStatus;
  settings: ScadaSystemSettings;

  // Actions
  setProjectContext: (params: {
    projectId: string;
    tenantId: string;
    projectName?: string;
    isDemo?: boolean;
    equipments?: Record<string, EquipmentTelemetry>;
    tags?: Record<string, ScadaTagDefinition>;
  }) => void;
  clearProjectContext: () => void;
  setActiveView: (view: ScadaViewId) => void;
  setSelectedSector: (sector: ScadaSynopticSector) => void;
  selectEquipment: (id: string | null) => void;
  toggleAudioMute: () => void;
  toggleSimulationMode: () => void;
  triggerEstop: () => void;
  triggerSimulationHalt: () => void;
  rearmEstop: () => void;
  commandEquipment: (
    equipmentId: string,
    action: "START" | "STOP" | "OPEN" | "CLOSE" | "AUTO" | "MANUAL",
    operator?: string,
  ) => void;
  acknowledgeAlarm: (alarmId: string, operator?: string) => void;
  acknowledgeAllAlarms: (operator?: string) => void;
  clearAlarm: (alarmId: string) => void;
  forceTagValue: (tagId: string, value: number | boolean | string, operator?: string) => void;
  unforceTag: (tagId: string, operator?: string) => void;
  updateSettings: (newSettings: Partial<ScadaSystemSettings>) => void;
  tickSimulation: () => void;
  resetToInitialState: () => void;

  // Gate 2 Master Data Engine Actions
  bufferedHistoricalSamples: HistoricalSample[];
  configureAlarm: (definition: ExtendedAlarmDefinition) => void;
  setTagQuality: (tagName: string, quality: TagQuality) => void;
  setTagValue: (tagName: string, value: number | boolean | string, source?: ProtocolDriver) => void;
  flushHistoricalSamples: () => Promise<number>;

  // Gate 3.4 Cloud-Edge Telemetry & Gateway Status
  gatewayTelemetry: GatewayHealthTelemetry | null;
  updateGatewayTelemetry: (telemetry: GatewayHealthTelemetry) => void;
}

export const useScadaStore = create<ScadaState>()(
  persist(
    (set, get) => ({
      activeView: "overview",
      selectedSector: "ete_geral",
      selectedEquipmentId: null,

      // Project Context & Multi-Tenancy (Gate 1A)
      currentProjectId: DEMO_ETE_PROJECT_ID,
      currentTenantId: DEMO_ETE_TENANT_ID,
      currentProjectName: DEMO_ETE_PROJECT_NAME,
      isDemoProject: true,

      // Safety Boundaries (NR-10, NR-12, ISO 13849-1, IEC 62061)
      safetyLevel: "SIMULATION_HALT" as SafetyActionLevel,
      isPhysicalControlAllowed: false,
      safetyNotice:
        "AVISO DE SEGURANÇA OPERACIONAL (NR-10 / NR-12): Este supervisório opera em modo de simulação/engenharia. Comandos virtuais de parada não substituem o botão físico de parada de emergência e relés de segurança certificados cabeados em campo.",

      isSimulationMode: true,
      audioAlertMuted: false,
      estopActive: false,
      systemTime: Date.now(),

      totalFlowM3h: 182.7,
      totalPowerKw: 248.5,
      powerFactor: 0.94,
      systemEfficiencyPct: 96.4,
      criticalAlarmsCount: 0,
      warningAlarmsCount: 2,

      equipments: DEMO_ETE_EQUIPMENTS,
      tags: DEMO_ETE_TAGS,
      alarms: DEMO_ETE_ALARMS,
      trendHistory: [],
      auditLogs: DEMO_ETE_LOGS,
      bufferedHistoricalSamples: [],
      gatewayTelemetry: null,
      gatewayStatus: {
        opcua: {
          status: "CONNECTED",
          endpoint: "opc.tcp://127.0.0.1:4840",
          sessions: 2,
          subscriptions: 8,
          samplingIntervalMs: 100,
          rxBytes: 148200,
          txBytes: 295400,
        },
        modbus: {
          status: "CONNECTED",
          host: "192.168.1.10",
          port: 502,
          unitId: 1,
          holdingRegisters: 128,
          pollIntervalMs: 100,
          requestsCount: 4210,
          crcErrors: 0,
        },
        mqtt: {
          status: "CONNECTED",
          broker: "mqtt://broker.eletricai.internal:1883",
          clientId: "SCADA_SUPERVISORY_01",
          subscribedTopics: ["ete/telemetry/#", "ete/commands/#"],
          messagesRx: 8900,
          messagesTx: 1420,
        },
      },
      settings: {
        scanCycleMs: 100,
        audioAlarmsEnabled: true,
        audioVolume: 80,
        historianRetentionDays: 30,
        simulationInflowMultiplier: 1.0,
        rbacRole: "OPERATOR",
        twoPersonRuleEnabled: false,
        estopInterlockActive: false,
      },

      setProjectContext: ({
        projectId,
        tenantId,
        projectName,
        isDemo = false,
        equipments,
        tags,
      }) => {
        const state = get();
        // If same project already active and matching, avoid wiping active simulation
        if (state.currentProjectId === projectId && state.currentTenantId === tenantId && !isDemo) {
          if (equipments || tags) {
            set((s) => ({
              equipments: equipments ?? s.equipments,
              tags: tags ?? s.tags,
            }));
          }
          return;
        }

        // Clean isolation: Wipe previous project telemetry, alarms, logs, and trend history
        scadaTagRuntime.clear();
        scadaAlarmEngine.clear();

        if (isDemo || projectId === DEMO_ETE_PROJECT_ID) {
          const demoSeed = getDemoEteSeed();
          scadaTagRuntime.registerTags(Object.values(demoSeed.tags));
          set({
            currentProjectId: DEMO_ETE_PROJECT_ID,
            currentTenantId: DEMO_ETE_TENANT_ID,
            currentProjectName: DEMO_ETE_PROJECT_NAME,
            isDemoProject: true,
            isSimulationMode: true,
            estopActive: false,
            safetyLevel: "SIMULATION_HALT",
            totalFlowM3h: demoSeed.totalFlowM3h,
            totalPowerKw: demoSeed.totalPowerKw,
            powerFactor: demoSeed.powerFactor,
            systemEfficiencyPct: demoSeed.systemEfficiencyPct,
            criticalAlarmsCount: demoSeed.criticalAlarmsCount,
            warningAlarmsCount: demoSeed.warningAlarmsCount,
            equipments: demoSeed.equipments,
            tags: demoSeed.tags,
            alarms: demoSeed.alarms,
            trendHistory: [],
            auditLogs: demoSeed.auditLogs,
            bufferedHistoricalSamples: [],
          });
        } else {
          // Customer project: Load strictly authorized canonical equipment and tags
          const timestamp = Date.now();
          if (tags) {
            scadaTagRuntime.registerTags(Object.values(tags));
          }

          // Automatically configure analog alarm limits for customer canonical tags
          if (tags) {
            for (const tag of Object.values(tags)) {
              if (
                tag.name.toUpperCase().includes("CORRENTE") ||
                tag.name.toUpperCase().includes("CURRENT")
              ) {
                scadaAlarmEngine.registerDefinition({
                  id: `alm_def_${tag.id}`,
                  projectId,
                  tagId: tag.id,
                  tagName: tag.name,
                  description: `Sobrecarga de Corrente Alta ${tag.name}`,
                  equipmentId: tag.linkedEquipmentId,
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
                });
              }
            }
          }

          const cleanLogs: ScadaAuditLog[] = [
            {
              id: `log-ctx-${timestamp}`,
              timestamp,
              category: "SYSTEM",
              operator: "SISTEMA",
              action: "PROJECT_CONTEXT_SET",
              details: `Contexto do projeto ${projectName || projectId} carregado sob isolamento multi-tenant (Tenant: ${tenantId}).`,
              severity: "INFO",
            },
          ];

          set({
            currentProjectId: projectId,
            currentTenantId: tenantId,
            currentProjectName: projectName || "Projeto Autorizado",
            isDemoProject: false,
            isSimulationMode: true, // Simulation engine active for design verification
            estopActive: false,
            safetyLevel: "SIMULATION_HALT",
            totalFlowM3h: 0,
            totalPowerKw: 0,
            powerFactor: 0.92,
            systemEfficiencyPct: 100,
            criticalAlarmsCount: 0,
            warningAlarmsCount: 0,
            equipments: equipments || {},
            tags: tags || {},
            alarms: [],
            trendHistory: [],
            auditLogs: cleanLogs,
            bufferedHistoricalSamples: [],
          });
        }
      },

      clearProjectContext: () => {
        scadaTagRuntime.clear();
        scadaAlarmEngine.clear();
        set({
          currentProjectId: null,
          currentTenantId: null,
          currentProjectName: null,
          isDemoProject: false,
          equipments: {},
          tags: {},
          alarms: [],
          trendHistory: [],
          auditLogs: [],
          bufferedHistoricalSamples: [],
        });
      },

      setActiveView: (view) => set({ activeView: view }),
      setSelectedSector: (sector) => set({ selectedSector: sector }),
      selectEquipment: (id) => set({ selectedEquipmentId: id }),
      toggleAudioMute: () => set((s) => ({ audioAlertMuted: !s.audioAlertMuted })),
      toggleSimulationMode: () => set((s) => ({ isSimulationMode: !s.isSimulationMode })),

      triggerEstop: () => {
        get().triggerSimulationHalt();
      },

      triggerSimulationHalt: () => {
        const timestamp = Date.now();
        const haltAlarm: ScadaAlarmItem = {
          id: `alm-halt-${timestamp}`,
          tag: "ETE.SAFETY.ESTOP",
          description:
            "PARADA DA SIMULAÇÃO (VIRTUAL) — Sem atuação em circuito físico de emergência (NR-10/NR-12)",
          priority: "CRITICAL",
          category: "SAFETY",
          currentValue: "SIMULATION_HALTED",
          setpointLimit: "NORMAL",
          state: "UNACK",
          timestamp,
        };

        const auditEntry: ScadaAuditLog = {
          id: `log-halt-${timestamp}`,
          timestamp,
          category: "SECURITY",
          operator: "OPERADOR",
          action: "ESTOP_TRIGGER",
          details:
            "PARADA DA SIMULAÇÃO — AÇÃO VIRTUAL, SEM ATUAÇÃO FÍSICA. Interrupção apenas do modelo de simulação em memória. Não houve desenergização elétrica física nem atuação de relés de segurança certificados cabeados em campo (NR-10 / NR-12).",
          severity: "CRITICAL",
        };

        set((state) => {
          // Trip motor/pump equipments in simulation memory
          const updatedEquipments = { ...state.equipments };
          for (const key of Object.keys(updatedEquipments)) {
            const eq = updatedEquipments[key];
            if (eq.category === "PUMP") {
              updatedEquipments[key] = {
                ...eq,
                status: "TRIPPED",
                flowRateM3h: 0,
                currentA: 0,
              };
            }
          }

          // Update tags
          const updatedTags = { ...state.tags };
          if (updatedTags["ETE.P01.FLOW"]) {
            updatedTags["ETE.P01.FLOW"].value = 0;
            updatedTags["ETE.P01.FLOW"].quality = "UNCERTAIN";
          }
          if (updatedTags["ETE.P02.FLOW"]) {
            updatedTags["ETE.P02.FLOW"].value = 0;
            updatedTags["ETE.P02.FLOW"].quality = "UNCERTAIN";
          }
          if (updatedTags["ETE.FLOW.TOTAL"]) {
            updatedTags["ETE.FLOW.TOTAL"].value = 0;
          }
          if (updatedTags["ETE.QM01.PWR"]) {
            updatedTags["ETE.QM01.PWR"].value = 14.2; // standby power
          }

          return {
            estopActive: true,
            safetyLevel: "SIMULATION_HALT",
            totalFlowM3h: 0,
            totalPowerKw: 14.2,
            criticalAlarmsCount: state.criticalAlarmsCount + 1,
            alarms: [haltAlarm, ...state.alarms],
            auditLogs: [auditEntry, ...state.auditLogs],
            equipments: updatedEquipments,
            tags: updatedTags,
          };
        });
      },

      rearmEstop: () => {
        const timestamp = Date.now();
        const auditEntry: ScadaAuditLog = {
          id: `log-rearm-${timestamp}`,
          timestamp,
          category: "SECURITY",
          operator: "OPERADOR",
          action: "ESTOP_REARM",
          details:
            "Comando de Rearme de Simulação efetuado. Sistema virtual em estado STANDBY aguardando partida virtual.",
          severity: "INFO",
        };

        set((state) => {
          const updatedEquipments = { ...state.equipments };
          for (const key of Object.keys(updatedEquipments)) {
            const eq = updatedEquipments[key];
            if (eq.status === "TRIPPED") {
              updatedEquipments[key] = {
                ...eq,
                status: "STANDBY",
              };
            }
          }

          return {
            estopActive: false,
            criticalAlarmsCount: Math.max(0, state.criticalAlarmsCount - 1),
            alarms: state.alarms.map((a) =>
              a.tag === "ETE.SAFETY.SIM_HALT" || a.tag === "ETE.SAFETY.ESTOP"
                ? { ...a, state: "CLEARED" as const, clearedAt: timestamp }
                : a,
            ),
            auditLogs: [auditEntry, ...state.auditLogs],
            equipments: updatedEquipments,
          };
        });
      },

      commandEquipment: (equipmentId, action, operator = "OPERADOR") => {
        const timestamp = Date.now();
        const state = get();
        const eq = state.equipments[equipmentId];
        if (!eq) return;

        // Gate 1A: Strictly verify physical control lock
        if (state.isPhysicalControlAllowed) {
          // Reserved for future physical gates with certified SIS
        }

        // Safety Interlock: Block START or OPEN while E-STOP is active
        if (state.estopActive && (action === "START" || action === "OPEN")) {
          const blockedLog: ScadaAuditLog = {
            id: `log-cmd-blocked-${timestamp}`,
            timestamp,
            category: "SECURITY",
            operator,
            action: `CMD_${action}_BLOCKED`,
            equipment: equipmentId,
            details: `Comando ${action} bloqueado pelo intertravamento de segurança: E-STOP ativo.`,
            severity: "WARNING",
          };
          set((s) => ({ auditLogs: [blockedLog, ...s.auditLogs] }));
          return;
        }

        let newStatus = eq.status;
        let newMode = eq.mode;

        if (action === "START") newStatus = "RUNNING";
        if (action === "STOP") newStatus = "STOPPED";
        if (action === "OPEN") newStatus = "OPEN";
        if (action === "CLOSE") newStatus = "CLOSED";
        if (action === "AUTO") newMode = "AUTO";
        if (action === "MANUAL") newMode = "MANUAL";

        const logEntry: ScadaAuditLog = {
          id: `log-cmd-${timestamp}`,
          timestamp,
          category: "OPERATOR",
          operator,
          action: `CMD_${action}`,
          equipment: equipmentId,
          details: `Comando ${action} executado no modelo virtual para ${eq.name} (Simulação virtual — Sem atuação em CLP físico)`,
          severity: "INFO",
        };

        set((s) => ({
          equipments: {
            ...s.equipments,
            [equipmentId]: {
              ...eq,
              status: newStatus,
              mode: newMode,
              flowRateM3h:
                newStatus === "RUNNING" && eq.category === "PUMP"
                  ? equipmentId === "P-01"
                    ? 92.4
                    : 90.3
                  : eq.flowRateM3h,
            },
          },
          auditLogs: [logEntry, ...s.auditLogs],
        }));
      },

      acknowledgeAlarm: (alarmId, operator = "OPERADOR") => {
        const timestamp = Date.now();
        scadaAlarmEngine.acknowledgeAlarm(
          alarmId,
          operator,
          "Reconhecido na tela de alarmes",
          timestamp,
        );
        set((state) => {
          let wasWarning = false;
          let wasCritical = false;

          const updatedAlarms = state.alarms.map((a) => {
            if (a.id === alarmId && a.state === "UNACK") {
              if (a.priority === "CRITICAL") wasCritical = true;
              else wasWarning = true;
              return {
                ...a,
                state: "ACK" as const,
                acknowledgedAt: timestamp,
                acknowledgedBy: operator,
              };
            }
            return a;
          });

          return {
            alarms: updatedAlarms,
            warningAlarmsCount: wasWarning
              ? Math.max(0, state.warningAlarmsCount - 1)
              : state.warningAlarmsCount,
            criticalAlarmsCount: wasCritical
              ? Math.max(0, state.criticalAlarmsCount - 1)
              : state.criticalAlarmsCount,
            auditLogs: [
              {
                id: `log-ack-${timestamp}`,
                timestamp,
                category: "ALARM",
                operator,
                action: "ALARM_ACK",
                details: `Alarme [${alarmId}] reconhecido pelo operador.`,
                severity: "INFO",
              },
              ...state.auditLogs,
            ],
          };
        });
      },

      acknowledgeAllAlarms: (operator = "OPERADOR") => {
        const timestamp = Date.now();
        set((state) => ({
          alarms: state.alarms.map((a) =>
            a.state === "UNACK"
              ? {
                  ...a,
                  state: "ACK" as const,
                  acknowledgedAt: timestamp,
                  acknowledgedBy: operator,
                }
              : a,
          ),
          criticalAlarmsCount: 0,
          warningAlarmsCount: 0,
          auditLogs: [
            {
              id: `log-ack-all-${timestamp}`,
              timestamp,
              category: "ALARM",
              operator,
              action: "ALARM_ACK_ALL",
              details: "Todos os alarmes ativos foram reconhecidos.",
              severity: "INFO",
            },
            ...state.auditLogs,
          ],
        }));
      },

      clearAlarm: (alarmId) => {
        set((state) => ({
          alarms: state.alarms.filter((a) => a.id !== alarmId),
        }));
      },

      forceTagValue: (tagId, value, operator = "OPERADOR") => {
        const timestamp = Date.now();
        set((state) => {
          const tag = state.tags[tagId];
          if (!tag) return state;

          return {
            tags: {
              ...state.tags,
              [tagId]: {
                ...tag,
                value,
                forced: true,
                quality: "FORCED",
                lastUpdated: timestamp,
              },
            },
            auditLogs: [
              {
                id: `log-force-${timestamp}`,
                timestamp,
                category: "SECURITY",
                operator,
                action: "TAG_FORCE",
                tag: tagId,
                details: `Tag ${tag.name} forçada para o valor ${String(value)}`,
                severity: "WARNING",
              },
              ...state.auditLogs,
            ],
          };
        });
      },

      unforceTag: (tagId, operator = "OPERADOR") => {
        const timestamp = Date.now();
        set((state) => {
          const tag = state.tags[tagId];
          if (!tag) return state;

          return {
            tags: {
              ...state.tags,
              [tagId]: {
                ...tag,
                forced: false,
                quality: "GOOD",
                lastUpdated: timestamp,
              },
            },
            auditLogs: [
              {
                id: `log-unforce-${timestamp}`,
                timestamp,
                category: "SECURITY",
                operator,
                action: "TAG_UNFORCE",
                tag: tagId,
                details: `Forçamento da tag ${tag.name} removido.`,
                severity: "INFO",
              },
              ...state.auditLogs,
            ],
          };
        });
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      tickSimulation: () => {
        const now = Date.now();
        const state = get();
        if (!state.isSimulationMode) {
          set({ systemTime: now });
          return;
        }

        if (state.estopActive) {
          set({ systemTime: now });
          return;
        }

        // In customer projects: calculate real metrics based on customer canonical equipments
        if (!state.isDemoProject) {
          let activePower = 0;
          let activeFlow = 0;
          const updatedTags = { ...state.tags };
          const newSamples: HistoricalSample[] = [];
          const jitter = Math.sin(now / 3000) * 0.2;

          for (const eq of Object.values(state.equipments)) {
            if (eq && eq.status === "RUNNING") {
              activePower += eq.powerKw || 0;
              activeFlow += eq.flowRateM3h || 0;
            }
          }

          for (const [key, tag] of Object.entries(updatedTags)) {
            if (!tag) continue;
            const eq = tag.linkedEquipmentId ? state.equipments[tag.linkedEquipmentId] : undefined;
            const isRunning = eq ? eq.status === "RUNNING" : true;

            let newValue = tag.value;
            if (
              typeof tag.value === "number" &&
              !tag.forced &&
              tag.quality !== "STALE" &&
              tag.quality !== "NOT_CONNECTED"
            ) {
              const nameUpper = tag.name.toUpperCase();
              if (nameUpper.includes("CORRENTE") || nameUpper.includes("CURRENT")) {
                newValue = isRunning ? +(26.5 + jitter).toFixed(1) : 0;
              } else if (nameUpper.includes("POTENCIA") || nameUpper.includes("POWER")) {
                newValue = isRunning ? +(11.2 + jitter * 0.5).toFixed(1) : 0;
              } else if (nameUpper.includes("TEMP")) {
                newValue = isRunning ? +(48.5 + jitter * 0.3).toFixed(1) : 25.0;
              } else if (nameUpper.includes("VAZAO") || nameUpper.includes("FLOW")) {
                newValue = isRunning ? +(85.0 + jitter * 0.8).toFixed(1) : 0;
              }

              const res = scadaTagRuntime.processUpdate({
                tagId: tag.id,
                tagName: tag.name,
                projectId: state.currentProjectId || "default",
                equipmentId: tag.linkedEquipmentId,
                rawValue: newValue,
                dataType: tag.dataType,
                unit: tag.unit,
                source: "SIMULATION",
                sourceTimestamp: now,
                receivedAt: now,
                quality: tag.quality,
              });

              updatedTags[key] = res.tag;
              if (res.historicalSample) {
                newSamples.push(res.historicalSample);
              }
            }

            scadaAlarmEngine.evaluateTag(updatedTags[key], now);
          }

          const activeInstances = scadaAlarmEngine.getActiveInstances();
          const mappedAlarms: ScadaAlarmItem[] = activeInstances.map((inst) => ({
            id: inst.id,
            tag: inst.tagName,
            description: inst.description,
            priority: inst.severity,
            category:
              inst.alarmClass === "COMMUNICATION"
                ? "COMMUNICATION"
                : inst.alarmClass === "ELECTRICAL"
                  ? "ELECTRICAL"
                  : inst.alarmClass === "SAFETY_INDICATION"
                    ? "SAFETY"
                    : "PROCESS",
            currentValue: inst.triggerValue,
            setpointLimit: inst.setpointLimit,
            state: inst.ackState === "ACKNOWLEDGED" ? "ACK" : "UNACK",
            timestamp: inst.triggeredAt,
            acknowledgedAt: inst.acknowledgedAt,
            acknowledgedBy: inst.acknowledgedBy,
            clearedAt: inst.clearedAt,
          }));

          const customerPoint: ScadaTrendPoint = {
            timestamp: now,
            totalFlow: +activeFlow.toFixed(1),
            flowP1: 0,
            flowP2: 0,
            levelT101: 0,
            levelT102: 0,
            levelT105: 0,
            pressureFiltro: 0,
            powerKw: +activePower.toFixed(1),
          };

          set((s) => ({
            systemTime: now,
            totalFlowM3h: +activeFlow.toFixed(1),
            totalPowerKw: +activePower.toFixed(1),
            trendHistory: [...s.trendHistory.slice(-119), customerPoint],
            tags: updatedTags,
            alarms: mappedAlarms.length > 0 ? mappedAlarms : s.alarms,
            bufferedHistoricalSamples: [...s.bufferedHistoricalSamples, ...newSamples],
          }));
          return;
        }

        // Small deterministic oscillations for realism (Demo ETE Project only)
        const jitter = Math.sin(now / 3000) * 0.4;
        const flowP1 = state.equipments["P-01"]?.status === "RUNNING" ? 92.4 + jitter : 0;
        const flowP2 = state.equipments["P-02"]?.status === "RUNNING" ? 90.3 + jitter * 0.8 : 0;
        const totalFlow = +(flowP1 + flowP2).toFixed(1);
        const powerTotal = +(
          245 +
          (flowP1 > 0 ? 37 : 0) * 0.8 +
          (flowP2 > 0 ? 37 : 0) * 0.8 +
          jitter * 2
        ).toFixed(1);

        const newPoint: ScadaTrendPoint = {
          timestamp: now,
          totalFlow,
          flowP1: +flowP1.toFixed(1),
          flowP2: +flowP2.toFixed(1),
          levelT101: 75.2 + Math.sin(now / 5000) * 0.3,
          levelT102: 62.0 + Math.sin(now / 6000) * 0.2,
          levelT105: 81.0 + Math.sin(now / 4000) * 0.2,
          pressureFiltro: +(2.4 + jitter * 0.05).toFixed(2),
          powerKw: powerTotal,
        };

        const updatedHistory = [...state.trendHistory.slice(-119), newPoint];

        set((s) => {
          const updatedTags = { ...s.tags };
          if (updatedTags["ETE.P01.FLOW"]) {
            updatedTags["ETE.P01.FLOW"] = {
              ...updatedTags["ETE.P01.FLOW"],
              value: +flowP1.toFixed(1),
              lastUpdated: now,
            };
          }
          if (updatedTags["ETE.P02.FLOW"]) {
            updatedTags["ETE.P02.FLOW"] = {
              ...updatedTags["ETE.P02.FLOW"],
              value: +flowP2.toFixed(1),
              lastUpdated: now,
            };
          }
          if (updatedTags["ETE.FLOW.TOTAL"]) {
            updatedTags["ETE.FLOW.TOTAL"] = {
              ...updatedTags["ETE.FLOW.TOTAL"],
              value: totalFlow,
              lastUpdated: now,
            };
          }
          if (updatedTags["ETE.QM01.PWR"]) {
            updatedTags["ETE.QM01.PWR"] = {
              ...updatedTags["ETE.QM01.PWR"],
              value: powerTotal,
              lastUpdated: now,
            };
          }

          return {
            systemTime: now,
            totalFlowM3h: totalFlow,
            totalPowerKw: powerTotal,
            trendHistory: updatedHistory,
            tags: updatedTags,
          };
        });
      },

      configureAlarm: (definition: ExtendedAlarmDefinition) => {
        const timestamp = Date.now();
        scadaAlarmEngine.registerDefinition(definition);
        set((s) => ({
          auditLogs: [
            {
              id: `log-alm-cfg-${timestamp}`,
              timestamp,
              category: "SYSTEM",
              operator: "ENGENHARIA",
              action: "ALARM_CONFIGURED",
              details: `Alarme ISA-18.2 configurado para TAG [${definition.tagName}] (Severidade: ${definition.severity}, High: ${definition.analogLimits?.high ?? "N/A"})`,
              severity: "INFO",
            },
            ...s.auditLogs,
          ],
        }));
      },

      setTagQuality: (tagName: string, quality: TagQuality) => {
        const now = Date.now();
        const state = get();
        const tag =
          state.tags[tagName] ||
          Object.values(state.tags).find((t) => t.name === tagName || t.id === tagName);
        if (!tag) return;

        const updatedTag: ScadaTagDefinition = {
          ...tag,
          quality,
          lastUpdated: now,
        };

        scadaTagRuntime.registerTag(updatedTag);

        const events = scadaAlarmEngine.evaluateTag(updatedTag, now);
        const activeInstances = scadaAlarmEngine.getActiveInstances();
        const activeMapped: ScadaAlarmItem[] = activeInstances.map((inst) => ({
          id: inst.id,
          tag: inst.tagName,
          description: inst.description,
          priority: inst.severity,
          category:
            inst.alarmClass === "COMMUNICATION"
              ? "COMMUNICATION"
              : inst.alarmClass === "ELECTRICAL"
                ? "ELECTRICAL"
                : inst.alarmClass === "SAFETY_INDICATION"
                  ? "SAFETY"
                  : "PROCESS",
          currentValue: inst.triggerValue,
          setpointLimit: inst.setpointLimit,
          state: inst.ackState === "ACKNOWLEDGED" ? "ACK" : "UNACK",
          timestamp: inst.triggeredAt,
          acknowledgedAt: inst.acknowledgedAt,
          acknowledgedBy: inst.acknowledgedBy,
          clearedAt: inst.clearedAt,
        }));

        const newLogs: ScadaAuditLog[] = events.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          category: e.transition === "TRIGGER" ? "ALARM" : "COMMUNICATION",
          operator: "SISTEMA",
          action: `ALARM_${e.transition}`,
          tag: e.tagName,
          details: `Transição ISA-18.2 [${e.transition}]: ${e.tagName} (${quality}) - ${e.previousCondition} -> ${e.newCondition}`,
          severity: e.transition === "TRIGGER" ? "CRITICAL" : "INFO",
        }));

        set((s) => ({
          tags: {
            ...s.tags,
            [updatedTag.name]: updatedTag,
            [updatedTag.id]: updatedTag,
          },
          alarms: activeMapped.length > 0 ? activeMapped : s.alarms,
          auditLogs: [...newLogs, ...s.auditLogs],
        }));
      },

      setTagValue: (tagName: string, value: number | boolean | string, source?: ProtocolDriver) => {
        const now = Date.now();
        const state = get();
        const tag =
          state.tags[tagName] ||
          Object.values(state.tags).find((t) => t.name === tagName || t.id === tagName);
        if (!tag) return;

        const res = scadaTagRuntime.processUpdate({
          tagId: tag.id,
          tagName: tag.name,
          projectId: state.currentProjectId || "default",
          equipmentId: tag.linkedEquipmentId,
          rawValue: value,
          dataType: tag.dataType,
          unit: tag.unit,
          source: source || tag.driver || "SIMULATION",
          sourceTimestamp: now,
          receivedAt: now,
          quality: tag.quality,
        });

        const events = scadaAlarmEngine.evaluateTag(res.tag, now);
        const activeInstances = scadaAlarmEngine.getActiveInstances();
        const activeMapped: ScadaAlarmItem[] = activeInstances.map((inst) => ({
          id: inst.id,
          tag: inst.tagName,
          description: inst.description,
          priority: inst.severity,
          category:
            inst.alarmClass === "COMMUNICATION"
              ? "COMMUNICATION"
              : inst.alarmClass === "ELECTRICAL"
                ? "ELECTRICAL"
                : inst.alarmClass === "SAFETY_INDICATION"
                  ? "SAFETY"
                  : "PROCESS",
          currentValue: inst.triggerValue,
          setpointLimit: inst.setpointLimit,
          state: inst.ackState === "ACKNOWLEDGED" ? "ACK" : "UNACK",
          timestamp: inst.triggeredAt,
          acknowledgedAt: inst.acknowledgedAt,
          acknowledgedBy: inst.acknowledgedBy,
          clearedAt: inst.clearedAt,
        }));

        const newLogs: ScadaAuditLog[] = events.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          category: e.transition === "TRIGGER" ? "ALARM" : "SYSTEM",
          operator: "SISTEMA",
          action: `ALARM_${e.transition}`,
          tag: e.tagName,
          details: `Transição ISA-18.2 [${e.transition}]: ${e.tagName} valor ${value} - ${e.previousCondition} -> ${e.newCondition}`,
          severity: e.transition === "TRIGGER" ? "WARNING" : "INFO",
        }));

        const newSamples = res.historicalSample
          ? [...state.bufferedHistoricalSamples, res.historicalSample]
          : state.bufferedHistoricalSamples;

        set((s) => ({
          tags: {
            ...s.tags,
            [res.tag.name]: res.tag,
            [res.tag.id]: res.tag,
          },
          alarms: activeMapped.length > 0 ? activeMapped : s.alarms,
          auditLogs: [...newLogs, ...s.auditLogs],
          bufferedHistoricalSamples: newSamples,
        }));
      },

      flushHistoricalSamples: async () => {
        const state = get();
        if (state.bufferedHistoricalSamples.length === 0 || !state.currentProjectId) {
          return 0;
        }
        const batch = [...state.bufferedHistoricalSamples];
        set({ bufferedHistoricalSamples: [] });
        try {
          const { ingestTagSamplesBatch } = await import("./scada.functions");
          const res = await ingestTagSamplesBatch({
            data: {
              projectId: state.currentProjectId,
              samples: batch.map((s) => ({
                tagName: s.tagName,
                value: s.value,
                quality: s.quality,
                source: s.source,
                sampledAt: s.sampledAt,
                receivedAt: s.receivedAt,
                sequenceNumber: s.sequenceNumber,
              })),
            },
          });
          return res.inserted;
        } catch (err) {
          console.error("Flush historical samples error:", err);
          return 0;
        }
      },

      resetToInitialState: () => {
        const demoSeed = getDemoEteSeed();
        set({
          activeView: "overview",
          selectedSector: "ete_geral",
          selectedEquipmentId: null,
          currentProjectId: DEMO_ETE_PROJECT_ID,
          currentTenantId: DEMO_ETE_TENANT_ID,
          currentProjectName: DEMO_ETE_PROJECT_NAME,
          isDemoProject: true,
          safetyLevel: "SIMULATION_HALT",
          isPhysicalControlAllowed: false,
          isSimulationMode: true,
          audioAlertMuted: false,
          estopActive: false,
          systemTime: Date.now(),
          totalFlowM3h: demoSeed.totalFlowM3h,
          totalPowerKw: demoSeed.totalPowerKw,
          powerFactor: demoSeed.powerFactor,
          systemEfficiencyPct: demoSeed.systemEfficiencyPct,
          criticalAlarmsCount: demoSeed.criticalAlarmsCount,
          warningAlarmsCount: demoSeed.warningAlarmsCount,
          equipments: demoSeed.equipments,
          tags: demoSeed.tags,
          alarms: demoSeed.alarms,
          trendHistory: [],
          auditLogs: demoSeed.auditLogs,
        });
      },

      updateGatewayTelemetry: (telemetry) => {
        set({
          gatewayTelemetry: telemetry,
        });
      },
    }),
    {
      name: "eletricai_scada_store_v4",
      partialize: (state) => ({
        activeView: state.activeView,
        selectedSector: state.selectedSector,
        audioAlertMuted: state.audioAlertMuted,
        settings: state.settings,
      }),
    },
  ),
);
