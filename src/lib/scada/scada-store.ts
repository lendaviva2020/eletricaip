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
  ExtendedAlarmInstance,
} from "./types";
import { NO_FIELD_DRIVERS, isRotatingEquipment, isSimulatedSource } from "./types";
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
import {
  FORCE_REASON_MAX,
  FORCE_REASON_MIN,
  MAX_AUDIT_IN_MEMORY,
  MAX_FLUSH_BATCH,
  capHistoricalBuffer,
  inferDataType,
  mapEngineAlarms,
  mergeAlarmLists,
  mergeTagDefinitions,
  scadaAlarmEngine,
  scadaTagRuntime,
} from "./scada-core";
import { computeScadaTick } from "./scada-tick";
import type { ForceRequest, PublishedTagValue } from "./scada-core";

// Re-export do núcleo: quem importa estes nomes de "@/lib/scada/scada-store"
// (force-tag-dialog, source-bridges, tag-hub, testes) não muda.
export {
  scadaTagRuntime,
  scadaAlarmEngine,
  capHistoricalBuffer,
  mapEngineAlarms,
  mergeAlarmLists,
  mergeTagDefinitions,
  MAX_BUFFERED_SAMPLES,
  MAX_FLUSH_BATCH,
  MAX_AUDIT_IN_MEMORY,
  FORCE_REASON_MIN,
  FORCE_REASON_MAX,
} from "./scada-core";
export type { ForceRequest, PublishedTagValue } from "./scada-core";

export interface ScadaState {
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
  /**
   * Força o valor (operador + motivo obrigatórios; o servidor já conferiu o
   * papel). Lança se o motivo for curto ou o tag for crítico de segurança.
   */
  forceTagValue: (tagId: string, value: number | boolean | string, request: ForceRequest) => void;
  unforceTag: (tagId: string, operator?: string) => void;
  /** Base única de tags: qualquer fonte publica aqui (cria o tag se faltar). */
  publishTags: (source: ProtocolDriver, values: PublishedTagValue[]) => void;
  /** Alarme levantado por uma fonte externa ao motor (ex.: script HMI). */
  raiseExternalAlarm: (alarm: {
    key: string;
    tag: string;
    description: string;
    priority: ScadaAlarmItem["priority"];
    category?: ScadaAlarmItem["category"];
    source: ProtocolDriver;
    value?: number | boolean | string;
  }) => void;
  clearExternalAlarm: (key: string) => void;
  /** Alarmes e auditoria lidos do banco ao abrir o projeto. */
  hydratePersisted: (params: {
    projectId: string;
    alarms: ScadaAlarmItem[];
    auditLogs: ScadaAuditLog[];
  }) => void;
  markAuditPersisted: (ids: string[]) => void;
  /** Remove da lista alarmes reconhecidos e normalizados (já gravados, se houver banco). */
  pruneSettledAlarms: (persistedOccurrenceIds?: ReadonlySet<string>) => void;
  /**
   * Tags salvos no projeto (formato antigo do editor HMI) entram na base única
   * como "Importado / sem conexão" — o valor é o último salvo, não leitura atual.
   */
  registerSavedTags: (values: Record<string, number | boolean | string>) => void;
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
            if (tags) scadaTagRuntime.registerTags(Object.values(tags));
            set((s) => ({
              equipments: equipments ?? s.equipments,
              // Reabrir/salvar o projeto não pode apagar o que as fontes já
              // publicaram: preserva valor, qualidade e origem do runtime.
              tags: tags ? mergeTagDefinitions(tags, s.tags) : s.tags,
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

          // Alarmes NÃO são criados automaticamente: limites fixos (30/40 A para
          // todo tag "CORRENTE") não têm relação com o equipamento. Alarme só com
          // configuração do usuário (ISA-18.2: racionalização).

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
            gatewayStatus: NO_FIELD_DRIVERS,
            isSimulationMode: true, // Simulation engine active for design verification
            estopActive: false,
            safetyLevel: "SIMULATION_HALT",
            totalFlowM3h: 0,
            totalPowerKw: 0,
            // Sem medição: nada de FP 0,92 / eficiência 100 % presumidos.
            powerFactor: 0,
            systemEfficiencyPct: 0,
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
            if (isRotatingEquipment(eq.category)) {
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
              // Vazão nominal só existe na planta de demonstração; em projeto de
              // cliente nenhuma vazão é inventada ao dar partida.
              flowRateM3h:
                s.isDemoProject && newStatus === "RUNNING" && eq.category === "PUMP"
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
        scadaAlarmEngine.acknowledgeAll("all", operator, timestamp);
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

      forceTagValue: (tagId, value, request) => {
        const reason = request.reason.trim();
        if (reason.length < FORCE_REASON_MIN || reason.length > FORCE_REASON_MAX) {
          throw new Error("FORCE_REASON_REQUIRED: informe o motivo do forçamento.");
        }
        const state = get();
        const tag =
          state.tags[tagId] ||
          Object.values(state.tags).find((t) => t.name === tagId || t.id === tagId);
        if (!tag) return;
        if (!scadaTagRuntime.getTag(tag.id)) scadaTagRuntime.registerTag(tag);
        // O runtime guarda o valor real por baixo e recusa tag crítico de segurança.
        const forced = scadaTagRuntime.forceTagValue(tag.id, value, {
          operator: request.operator,
          reason,
          ttlMs: request.ttlMs,
        });
        if (!forced) return;
        const timestamp = Date.now();
        const next = { ...forced };
        set((s) => ({
          tags: { ...s.tags, [next.name]: next, [next.id]: next },
          auditLogs: [
            {
              id: `log-force-${timestamp}-${next.id}`,
              timestamp,
              category: "SECURITY",
              operator: request.operator,
              action: "TAG_FORCE",
              tag: next.name,
              details: `Tag ${next.name} forçado para ${String(value)}. Motivo: ${reason}`,
              severity: "WARNING",
            },
            ...s.auditLogs,
          ],
        }));
      },

      unforceTag: (tagId, operator = "OPERADOR") => {
        const state = get();
        const tag =
          state.tags[tagId] ||
          Object.values(state.tags).find((t) => t.name === tagId || t.id === tagId);
        if (!tag) return;
        if (!scadaTagRuntime.getTag(tag.id)) scadaTagRuntime.registerTag(tag);
        // Volta ao último valor real com qualidade INCERTA até a próxima leitura
        // (antes o valor forçado ficava na tela como "GOOD").
        const released = scadaTagRuntime.unforceTag(tag.id);
        if (!released) return;
        const timestamp = Date.now();
        const next = { ...released };
        set((s) => ({
          tags: { ...s.tags, [next.name]: next, [next.id]: next },
          auditLogs: [
            {
              id: `log-unforce-${timestamp}-${next.id}`,
              timestamp,
              category: "SECURITY",
              operator,
              action: "TAG_UNFORCE",
              tag: next.name,
              details: `Forçamento do tag ${next.name} removido.`,
              severity: "INFO",
            },
            ...s.auditLogs,
          ],
        }));
      },

      publishTags: (source, values) => {
        const state = get();
        if (!state.currentProjectId || values.length === 0) return;
        const now = Date.now();
        const projectId = state.currentProjectId;
        const updated: Record<string, ScadaTagDefinition> = {};
        const samples: HistoricalSample[] = [];
        const logs: ScadaAuditLog[] = [];
        for (const v of values) {
          if (!v.name || typeof v.name !== "string" || v.name.length > 128) continue;
          if (typeof v.value === "number" && !Number.isFinite(v.value)) continue;
          const existing =
            updated[v.name] ??
            state.tags[v.name] ??
            Object.values(state.tags).find((t) => t.name === v.name);
          if (existing && !scadaTagRuntime.getTag(existing.id)) {
            scadaTagRuntime.registerTag(existing);
          }
          const res = scadaTagRuntime.processUpdate({
            tagId: existing?.id ?? v.name,
            tagName: existing?.name ?? v.name,
            projectId,
            equipmentId: v.equipmentId ?? existing?.linkedEquipmentId,
            rawValue: v.value,
            dataType: existing?.dataType ?? inferDataType(v.value),
            unit: v.unit ?? existing?.unit,
            source,
            sourceTimestamp: now,
            receivedAt: now,
            quality: v.quality ?? "GOOD",
          });
          const tag: ScadaTagDefinition = {
            ...res.tag,
            driver: source,
            isSimulated: isSimulatedSource(source),
            unit: v.unit ?? res.tag.unit,
          };
          updated[tag.name] = tag;
          if (tag.id !== tag.name) updated[tag.id] = tag;
          if (res.historicalSample) samples.push(res.historicalSample);
          for (const e of scadaAlarmEngine.evaluateTag(tag, now)) {
            logs.push({
              id: e.id,
              timestamp: e.timestamp,
              category: e.transition === "TRIGGER" ? "ALARM" : "SYSTEM",
              operator: "SISTEMA",
              action: `ALARM_${e.transition}`,
              tag: e.tagName,
              details: `Transição ISA-18.2 [${e.transition}]: ${e.tagName} = ${String(e.value)}`,
              severity: e.transition === "TRIGGER" ? "WARNING" : "INFO",
            });
          }
        }
        if (Object.keys(updated).length === 0) return;
        const engineAlarms = mapEngineAlarms(scadaAlarmEngine.getActiveInstances());
        set((s) =>
          s.currentProjectId !== projectId
            ? {}
            : {
                tags: { ...s.tags, ...updated },
                alarms: mergeAlarmLists(engineAlarms, s.alarms),
                auditLogs: logs.length ? [...logs, ...s.auditLogs] : s.auditLogs,
                bufferedHistoricalSamples: samples.length
                  ? capHistoricalBuffer([...s.bufferedHistoricalSamples, ...samples])
                  : s.bufferedHistoricalSamples,
              },
        );
      },

      raiseExternalAlarm: (alarm) => {
        const now = Date.now();
        const id = `ext:${alarm.key}`;
        set((s) => {
          const current = s.alarms.find((a) => a.id === id && a.clearedAt == null);
          if (current) {
            if (current.description === alarm.description) return {};
            return {
              alarms: s.alarms.map((a) =>
                a === current ? { ...a, description: alarm.description } : a,
              ),
            };
          }
          const item: ScadaAlarmItem = {
            id,
            tag: alarm.tag,
            description: alarm.description,
            priority: alarm.priority,
            category: alarm.category ?? "PROCESS",
            currentValue: alarm.value ?? true,
            setpointLimit: "—",
            state: "UNACK",
            timestamp: now,
            acknowledgedAt: null,
            acknowledgedBy: null,
            clearedAt: null,
            origin: "EXTERNAL",
            source: alarm.source,
          };
          return {
            alarms: [item, ...s.alarms],
            auditLogs: [
              {
                id: `log-ext-alarm-${now}-${alarm.key}`,
                timestamp: now,
                category: "ALARM",
                operator: "SISTEMA",
                action: "ALARM_TRIGGER",
                tag: alarm.tag,
                details: `Alarme (${alarm.source}): ${alarm.description}`,
                severity: "WARNING",
              },
              ...s.auditLogs,
            ],
          };
        });
      },

      clearExternalAlarm: (key) => {
        const id = `ext:${key}`;
        const now = Date.now();
        set((s) => {
          if (!s.alarms.some((a) => a.id === id && a.clearedAt == null)) return {};
          // ISA-18.2: alarme reconhecido sai da lista ao normalizar; não
          // reconhecido fica (retornou ao normal, aguardando reconhecimento).
          return {
            alarms: s.alarms.flatMap((a) => {
              if (a.id !== id || a.clearedAt != null) return [a];
              // Normalizado: fica na lista com clearedAt. Reconhecido + normalizado
              // só sai depois de gravado (`pruneSettledAlarms`), para o banco
              // receber o reconhecimento.
              return [{ ...a, clearedAt: now }];
            }),
          };
        });
      },

      hydratePersisted: ({ projectId, alarms, auditLogs }) => {
        set((s) => {
          if (s.currentProjectId !== projectId) return {};
          const known = new Set(s.alarms.map((a) => a.id));
          const restored = alarms
            .filter((a) => !known.has(a.id))
            .map((a) => ({ ...a, origin: "RESTORED" as const }));
          const knownLogs = new Set(s.auditLogs.map((l) => l.id));
          const logs = auditLogs
            .filter((l) => !knownLogs.has(l.id))
            .map((l) => ({ ...l, persisted: true }));
          return {
            alarms: [...s.alarms, ...restored],
            auditLogs: [...s.auditLogs, ...logs].sort((x, y) => y.timestamp - x.timestamp),
          };
        });
      },

      registerSavedTags: (values) => {
        const now = Date.now();
        set((s) => {
          if (!s.currentProjectId) return {};
          const next = { ...s.tags };
          let added = 0;
          for (const [name, value] of Object.entries(values)) {
            if (!name || name.length > 128 || next[name]) continue;
            if (typeof value === "number" && !Number.isFinite(value)) continue;
            const def: ScadaTagDefinition = {
              id: name,
              name,
              description: `Tag salvo no projeto: ${name}`,
              dataType: inferDataType(value),
              unit: "",
              scaleMin: 0,
              scaleMax: 100,
              value,
              quality: "NOT_CONNECTED",
              driver: "IMPORTED",
              scanRateMs: 1000,
              lastUpdated: now,
              forced: false,
              sourceAddress: "projeto",
              isSimulated: false,
            };
            scadaTagRuntime.registerTag(def);
            next[name] = def;
            added++;
          }
          return added ? { tags: next } : {};
        });
      },

      pruneSettledAlarms: (persisted) => {
        set((s) => {
          const keep = s.alarms.filter((a) => {
            if (!(a.state === "ACK" && a.clearedAt != null)) return true;
            return persisted ? !persisted.has(`${a.id}@${a.timestamp}`) : false;
          });
          return keep.length === s.alarms.length ? {} : { alarms: keep };
        });
      },

      markAuditPersisted: (ids) => {
        if (ids.length === 0) return;
        const set_ = new Set(ids);
        set((s) => {
          const marked = s.auditLogs.map((l) => (set_.has(l.id) ? { ...l, persisted: true } : l));
          // Memória da aba limitada: o que já está no banco pode sair da lista.
          if (marked.length <= MAX_AUDIT_IN_MEMORY) return { auditLogs: marked };
          let keepPersisted = MAX_AUDIT_IN_MEMORY;
          return {
            auditLogs: marked.filter((l) => !l.persisted || keepPersisted-- > 0),
          };
        });
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      tickSimulation: () => {
        const patch = computeScadaTick(get(), Date.now());
        if (patch) set(patch);
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
        const activeMapped = mapEngineAlarms(activeInstances);

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
          alarms: mergeAlarmLists(activeMapped, s.alarms),
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
        const activeMapped = mapEngineAlarms(activeInstances);

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
          alarms: mergeAlarmLists(activeMapped, s.alarms),
          auditLogs: [...newLogs, ...s.auditLogs],
          bufferedHistoricalSamples: newSamples,
        }));
      },

      flushHistoricalSamples: async () => {
        const state = get();
        // Demonstração não grava no banco do cliente.
        if (
          state.bufferedHistoricalSamples.length === 0 ||
          !state.currentProjectId ||
          state.isDemoProject
        ) {
          return 0;
        }
        const projectId = state.currentProjectId;
        // O servidor recusa lotes acima do teto: envia em fatias, o resto fica.
        const batch = state.bufferedHistoricalSamples.slice(0, MAX_FLUSH_BATCH);
        set((s) => ({
          bufferedHistoricalSamples: s.bufferedHistoricalSamples.slice(batch.length),
        }));
        try {
          const { ingestTagSamplesBatch } = await import("./scada.functions");
          const res = await ingestTagSamplesBatch({
            data: {
              projectId,
              samples: batch.map((s) => ({
                tagName: s.tagName,
                value: s.value,
                quality: s.quality,
                source: s.source,
                unit: s.unit,
                equipmentId: s.equipmentId,
                sampledAt: s.sampledAt,
                receivedAt: s.receivedAt,
                sequenceNumber: s.sequenceNumber,
              })),
            },
          });
          return res.inserted;
        } catch (err) {
          console.error("Flush historical samples error:", err);
          // Devolve à fila (se ainda for o mesmo projeto) para nova tentativa,
          // respeitando o teto do buffer — nada é descartado em silêncio além dele.
          set((s) =>
            s.currentProjectId === projectId
              ? {
                  bufferedHistoricalSamples: capHistoricalBuffer([
                    ...batch,
                    ...s.bufferedHistoricalSamples,
                  ]),
                }
              : {},
          );
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
