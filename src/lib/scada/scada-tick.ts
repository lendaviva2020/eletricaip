// SCADA — Ciclo de simulação (1 s), extraído do store para um módulo próprio.
// Função PURA: recebe o snapshot do estado e devolve o patch a aplicar (ou
// null quando nada muda). Comportamento idêntico ao que era inline no store;
// o `get()` no momento do tique já é o estado mais recente (sem escrita
// concorrente no mesmo tique), então computar do snapshot equivale ao antigo
// `set((s) => …)`.

import type { ScadaState } from "./scada-store";
import type { HistoricalSample, ScadaTrendPoint } from "./types";
import {
  capHistoricalBuffer,
  mapEngineAlarms,
  mergeAlarmLists,
  scadaAlarmEngine,
} from "./scada-core";

export function computeScadaTick(state: ScadaState, now: number): Partial<ScadaState> | null {
  if (!state.isSimulationMode || state.estopActive) {
    return { systemTime: now };
  }

  // Projeto de cliente: métricas reais a partir dos equipamentos canônicos.
  if (!state.isDemoProject) {
    let activePower = 0;
    let activeFlow = 0;
    const updatedTags = { ...state.tags };
    const newSamples: HistoricalSample[] = [];

    for (const eq of Object.values(state.equipments)) {
      if (eq && eq.status === "RUNNING") {
        activePower += eq.powerKw || 0;
        activeFlow += eq.flowRateM3h || 0;
      }
    }

    // Valores de tag NÃO são inventados: um tag só muda quando uma fonte publica.
    for (const key of Object.keys(updatedTags)) {
      if (!updatedTags[key]) continue;
      scadaAlarmEngine.evaluateTag(updatedTags[key], now);
    }

    const mappedAlarms = mapEngineAlarms(scadaAlarmEngine.getActiveInstances());

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

    return {
      systemTime: now,
      totalFlowM3h: +activeFlow.toFixed(1),
      totalPowerKw: +activePower.toFixed(1),
      trendHistory: [...state.trendHistory.slice(-119), customerPoint],
      tags: updatedTags,
      alarms: mergeAlarmLists(mappedAlarms, state.alarms),
      bufferedHistoricalSamples: capHistoricalBuffer([
        ...state.bufferedHistoricalSamples,
        ...newSamples,
      ]),
    };
  }

  // Oscilações determinísticas só na demonstração ETE.
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

  const updatedTags = { ...state.tags };
  const bump = (name: string, value: number) => {
    if (updatedTags[name]) updatedTags[name] = { ...updatedTags[name], value, lastUpdated: now };
  };
  bump("ETE.P01.FLOW", +flowP1.toFixed(1));
  bump("ETE.P02.FLOW", +flowP2.toFixed(1));
  bump("ETE.FLOW.TOTAL", totalFlow);
  bump("ETE.QM01.PWR", powerTotal);

  return {
    systemTime: now,
    totalFlowM3h: totalFlow,
    totalPowerKw: powerTotal,
    trendHistory: [...state.trendHistory.slice(-119), newPoint],
    tags: updatedTags,
  };
}
