// Núcleo Central de Segurança Funcional e Parada de Emergência (E-STOP) do ElétricAi.
//
// AVISO DE ENGENHARIA / SEGURANÇA INDUSTRIAL:
// Esta implementação opera como função de supervisão e parada lógica de simulação em software.
// Ela NÃO substitui relés de segurança físicos certificados (ex.: Categoria 4 / PL e - ISO 13849-1),
// CLPs de segurança homologados (IEC 61508 / IEC 62061), botoeiras de emergência mecânicas com
// contatos positivos de ruptura (NR-12 / IEC 60947-5-5) nem intertravamentos físicos de instalações reais.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface EmergencyEvent {
  id: string;
  kind: "trigger" | "rearm" | "blocked_start" | "safe_state_forced";
  timestamp: string; // ISO 8601
  source: string; // ex: "ui_emergency_button" | "canvas_estop_node" | "plant_panel" | "scada"
  reason: string;
}

export interface CentralSafetyState {
  /** Se a parada de emergência está travada (latched). Enquanto true, nenhuma engine pode rodar. */
  emergencyLatched: boolean;
  emergencyTriggerTime: string | null;
  emergencySource: string | null;
  emergencyReason: string | null;
  /** Indica se o rearme foi executado após o desarme. */
  rearmed: boolean;
  /** Histórico auditável de acionamentos, motivos e rearmes. */
  history: EmergencyEvent[];

  /** Dispara a parada de emergência com travamento e corte imediato de atuadores. */
  triggerEmergency: (sourceOrOpts: string | { source: string; reason?: string }, reason?: string) => void;
  /** Procedimento explícito de rearme (NÃO inicia a simulação automaticamente). */
  rearmEmergency: (operator?: string) => { success: boolean; message: string };
  /** Validador de segurança que deve ser consultado antes de qualquer comando START / RUN. */
  canStartSimulation: () => { allowed: boolean; reason?: string };
  /** Limpa o histórico de eventos de segurança. */
  clearHistory: () => void;
}

type SafeStateCallback = () => void;
const safeStateCallbacks = new Set<SafeStateCallback>();
const rearmCallbacks = new Set<SafeStateCallback>();

export function registerSafeStateCallback(cb: SafeStateCallback): () => void {
  safeStateCallbacks.add(cb);
  return () => safeStateCallbacks.delete(cb);
}

export function registerRearmCallback(cb: SafeStateCallback): () => void {
  rearmCallbacks.add(cb);
  return () => rearmCallbacks.delete(cb);
}

export const useSafetyStore = create<CentralSafetyState>()(
  subscribeWithSelector((set, get) => ({
    emergencyLatched: false,
    emergencyTriggerTime: null,
    emergencySource: null,
    emergencyReason: null,
    rearmed: true,
    history: [],

    triggerEmergency: (sourceOrOpts, reasonParam) => {
      const source = typeof sourceOrOpts === "object" ? sourceOrOpts.source : sourceOrOpts;
      const reason = (typeof sourceOrOpts === "object" ? sourceOrOpts.reason : reasonParam) || "Parada de Emergência acionada pelo operador";
      const timestamp = new Date().toISOString();
      const event: EmergencyEvent = {
        id: `estop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "trigger",
        timestamp,
        source,
        reason,
      };

      set((s) => ({
        emergencyLatched: true,
        emergencyTriggerTime: timestamp,
        emergencySource: source,
        emergencyReason: reason,
        rearmed: false,
        history: [event, ...s.history].slice(0, 100),
      }));

      // Executa todos os callbacks registrados de corte seguro de atuadores
      for (const cb of safeStateCallbacks) {
        try {
          cb();
        } catch (e) {
          console.error("[SafetyCore] Erro ao executar callback de corte seguro:", e);
        }
      }
    },

    rearmEmergency: (operator = "Operador") => {
      const { emergencyLatched } = get();
      if (!emergencyLatched) {
        return { success: true, message: "Circuito já se encontra desarmado." };
      }

      const timestamp = new Date().toISOString();
      const event: EmergencyEvent = {
        id: `rearm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "rearm",
        timestamp,
        source: operator,
        reason: "Rearme manual efetuado. Sistema em estado seguro aguardando comando explícito de partida.",
      };

      set((s) => ({
        emergencyLatched: false,
        emergencyTriggerTime: null,
        emergencySource: null,
        emergencyReason: null,
        rearmed: true,
        history: [event, ...s.history].slice(0, 100),
      }));

      // Executa callbacks registrados de rearme
      for (const cb of rearmCallbacks) {
        try {
          cb();
        } catch (e) {
          console.error("[SafetyCore] Erro ao executar callback de rearme:", e);
        }
      }

      return {
        success: true,
        message: "Circuito rearmado com sucesso. Pressione 'Simular' para reiniciar a operação.",
      };
    },

    canStartSimulation: () => {
      const { emergencyLatched, emergencyReason } = get();
      if (emergencyLatched) {
        const timestamp = new Date().toISOString();
        const event: EmergencyEvent = {
          id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          kind: "blocked_start",
          timestamp,
          source: "interlock",
          reason: "Tentativa de partida bloqueada: parada de emergência está travada.",
        };
        set((s) => ({ history: [event, ...s.history].slice(0, 100) }));

        return {
          allowed: false,
          reason: emergencyReason || "Parada de emergência atuada. Efetue o rearme do circuito antes de iniciar.",
        };
      }
      return { allowed: true };
    },

    clearHistory: () => set({ history: [] }),
  })),
);
