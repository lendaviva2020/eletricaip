/**
 * ElétricAi Industrial OS — Trace Oscilloscope Engine
 * Paridade com o Trace Manager do CODESYS V3.5:
 * Aquisição multicanal com amostragem em tempo real, disparo por gatilhos (Triggers)
 * e buffer circular para diagnóstico de transitórios rápidos.
 */

import { TraceConfiguration, TraceChannel } from "../../canonical/types";

export interface TraceSample {
  timestampMs: number;
  values: Record<string, number | boolean>;
  isTriggerSample?: boolean;
}

export class TraceOscilloscopeEngine {
  private config: TraceConfiguration;
  private buffer: TraceSample[] = [];
  private isArmed: boolean = false;
  private isTriggered: boolean = false;
  private preTriggerBuffer: TraceSample[] = [];
  private lastTriggerVariableValue?: number | boolean;

  constructor(config: TraceConfiguration) {
    this.config = config;
  }

  public arm(): void {
    this.isArmed = true;
    this.isTriggered = this.config.triggerCondition === "CONTINUOUS";
    this.buffer = [];
    this.preTriggerBuffer = [];
  }

  public disarm(): void {
    this.isArmed = false;
    this.isTriggered = false;
  }

  public isRecording(): boolean {
    return this.isArmed;
  }

  public getSamples(): TraceSample[] {
    return [...this.buffer];
  }

  /**
   * Chamado em cada ciclo de tarefa do PLC virtual
   */
  public recordSample(timestampMs: number, getVarValue: (varIdOrName: string) => any): void {
    if (!this.isArmed) return;

    const currentValues: Record<string, number | boolean> = {};
    for (const ch of this.config.channels) {
      const raw = getVarValue(ch.name) ?? getVarValue(ch.tagId);
      currentValues[ch.name] = typeof raw === "boolean" ? raw : Number(raw) || 0;
    }

    const sample: TraceSample = { timestampMs, values: currentValues };

    // Se ainda não disparou o gatilho, verifica condição
    if (!this.isTriggered) {
      this.preTriggerBuffer.push(sample);
      const preLimit = this.config.preTriggerSamples || Math.floor(this.config.bufferDepthSamples * 0.2);
      if (this.preTriggerBuffer.length > preLimit) {
        this.preTriggerBuffer.shift();
      }

      if (this.evaluateTriggerCondition(getVarValue)) {
        this.isTriggered = true;
        sample.isTriggerSample = true;
        // Transfere o buffer de pré-disparo para o buffer principal
        this.buffer.push(...this.preTriggerBuffer);
        this.preTriggerBuffer = [];
      }
    } else {
      if (this.config.triggerCondition === "CONTINUOUS" && this.buffer.length === 0) {
        sample.isTriggerSample = true;
      }
      this.buffer.push(sample);
      if (this.buffer.length >= this.config.bufferDepthSamples) {
        // Buffer cheio -> encerra aquisição
        this.isArmed = false;
      }
    }
  }

  private evaluateTriggerCondition(getVarValue: (varIdOrName: string) => any): boolean {
    if (this.config.triggerCondition === "CONTINUOUS") return true;

    const triggerVar = this.config.triggerTagId;
    if (!triggerVar) return true;

    const current = getVarValue(triggerVar);
    const prev = this.lastTriggerVariableValue;
    this.lastTriggerVariableValue = current;

    if (prev === undefined) return false;

    switch (this.config.triggerCondition) {
      case "RISING_EDGE":
        return !Boolean(prev) && Boolean(current);
      case "FALLING_EDGE":
        return Boolean(prev) && !Boolean(current);
      case "THRESHOLD":
        return Number(current) >= (this.config.triggerThreshold || 0) && Number(prev) < (this.config.triggerThreshold || 0);
      default:
        return false;
    }
  }

  /**
   * Exporta os dados capturados para CSV para análise em ferramentas como Excel ou MATLAB
   */
  public exportToCSV(): string {
    const channelNames = this.config.channels.map((c) => c.name);
    const header = ["Timestamp_ms", ...channelNames].join(",");
    const lines = [header];

    for (const sample of this.buffer) {
      const row = [sample.timestampMs, ...channelNames.map((name) => sample.values[name] ?? "")];
      lines.push(row.join(","));
    }

    return lines.join("\n");
  }
}
