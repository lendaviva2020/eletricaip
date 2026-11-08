// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — DETERMINISTIC IEC TASK SCHEDULER & SIMULATOR
// Deterministic Execution Cycle, Process Images, Timed Tasks & Simulated Forcing
// ============================================================================

import type { CompiledProjectIR, IRInstruction } from "../compiler/intermediate-representation";
import { TonBlock, TofBlock, TpBlock, CtuBlock, RTrigBlock, FTrigBlock, SrBlock, RsBlock, PidBlock } from "./standard-blocks";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../../canonical/types";

export type SimulationState = "STOPPED" | "RUNNING" | "PAUSED";

export interface WatchEntry {
  name: string;
  value: any;
  type: string;
  isForced: boolean;
}

export interface Breakpoint {
  pouName: string;
  sourceLine: number;
  condition?: string;
  enabled: boolean;
}

export class IECTaskScheduler {
  public state: SimulationState = "STOPPED";
  public cycleCount = 0;
  public totalSimulatedTimeMs = 0;
  public lastCycleDurationMs = 0;

  // Process Images (Memória de I/O IEC)
  public inputProcessImage: Record<string, any> = {}; // %I
  public outputProcessImage: Record<string, any> = {}; // %Q
  public memoryProcessImage: Record<string, any> = {}; // %M

  // Variáveis ativas de execução
  public globalVariables: Record<string, any> = {};
  public localVariables: Record<string, Record<string, any>> = {};

  // Forcing (estritamente em memória do simulador)
  public forcedVariables: Record<string, any> = {};

  // Blocos padrão instanciados
  private tonBlocks: Map<string, TonBlock> = new Map();
  private pidBlocks: Map<string, PidBlock> = new Map();

  // Depuração
  public breakpoints: Breakpoint[] = [];
  public hitBreakpoint: Breakpoint | null = null;

  constructor(private compiledIR: CompiledProjectIR) {
    this.reset();
  }

  public reset(): void {
    this.state = "STOPPED";
    this.cycleCount = 0;
    this.totalSimulatedTimeMs = 0;
    this.lastCycleDurationMs = 0;
    this.hitBreakpoint = null;

    this.inputProcessImage = {};
    this.outputProcessImage = {};
    this.memoryProcessImage = {};
    this.forcedVariables = {};

    this.globalVariables = JSON.parse(JSON.stringify(this.compiledIR.globalVariables || {}));
    this.localVariables = {};
    for (const [pouName, block] of Object.entries(this.compiledIR.blocks)) {
      this.localVariables[pouName] = JSON.parse(JSON.stringify(block.localVariables || {}));
    }

    this.tonBlocks.clear();
    this.pidBlocks.clear();
  }

  public start(): void {
    this.state = "RUNNING";
  }

  public pause(): void {
    this.state = "PAUSED";
  }

  public setSimulatedInput(name: string, value: any): void {
    this.inputProcessImage[name] = value;
    this.globalVariables[name] = value;
  }

  /**
   * Forcing isolado no simulador (Garante que nunca afete hardware físico).
   */
  public forceVariable(name: string, value: any): void {
    // Verificação incondicional de barreira física
    if (IS_PHYSICAL_CONTROL_ALLOWED) {
      throw new Error("VIOLAÇÃO DE SEGURANÇA: Controle físico é proibido.");
    }
    this.forcedVariables[name] = value;
    if (name in this.globalVariables) {
      this.globalVariables[name] = value;
    }
  }

  public unforceVariable(name: string): void {
    delete this.forcedVariables[name];
  }

  /**
   * Executa exatamente um ciclo de varredura (Scan Cycle) determinístico.
   */
  public singleCycle(cycleIntervalMs = 10): boolean {
    const tStart = performance.now();

    // 1. Aplica Forcing sobre variáveis de entrada
    for (const [k, v] of Object.entries(this.forcedVariables)) {
      this.globalVariables[k] = v;
      if (k in this.inputProcessImage) {
        this.inputProcessImage[k] = v;
      }
    }

    // 2. Executa tarefas agendadas neste ciclo
    for (const task of this.compiledIR.tasksOrder) {
      for (const pouName of task.pouNames) {
        const block = this.compiledIR.blocks[pouName];
        if (block) {
          this.executeIRBlock(pouName, block.instructions, cycleIntervalMs);
        }
      }
    }

    // 3. Aplica Forcing sobre variáveis de saída
    for (const [k, v] of Object.entries(this.forcedVariables)) {
      if (k in this.outputProcessImage) {
        this.outputProcessImage[k] = v;
      }
      this.globalVariables[k] = v;
    }

    this.cycleCount++;
    this.totalSimulatedTimeMs += cycleIntervalMs;
    this.lastCycleDurationMs = Math.round(performance.now() - tStart);

    return true;
  }

  public getCycleMetrics(): { cycleCount: number; accumulatedTimeMs: number; lastDurationMs: number } {
    return {
      cycleCount: this.cycleCount,
      accumulatedTimeMs: this.totalSimulatedTimeMs,
      lastDurationMs: this.lastCycleDurationMs,
    };
  }

  private executeIRBlock(pouName: string, instructions: IRInstruction[], deltaMs: number): void {
    const registers: Record<string, any> = {};
    const locals = this.localVariables[pouName] || {};

    const resolveVal = (valOrReg: any): any => {
      if (typeof valOrReg === "string" && valOrReg.startsWith("_t")) {
        return registers[valOrReg];
      }
      return valOrReg;
    };

    let pc = 0;
    while (pc < instructions.length) {
      const inst = instructions[pc];

      // Verificação de Breakpoint
      if (inst.sourceLine) {
        const bp = this.breakpoints.find((b) => b.enabled && b.pouName === pouName && b.sourceLine === inst.sourceLine);
        if (bp) {
          this.hitBreakpoint = bp;
          this.state = "PAUSED";
          return;
        }
      }

      switch (inst.op) {
        case "LOAD_CONST":
          if (inst.dest) registers[inst.dest] = inst.arg1;
          break;

        case "LOAD_VAR": {
          const varName = inst.arg1;
          let val = locals[varName];
          if (val === undefined) {
            val = this.globalVariables[varName];
          }
          if (inst.dest) registers[inst.dest] = val !== undefined ? val : 0;
          break;
        }

        case "STORE_VAR": {
          const varName = inst.arg1;
          const val = resolveVal(inst.arg2);
          if (varName in locals) {
            locals[varName] = val;
          } else {
            this.globalVariables[varName] = val;
            this.outputProcessImage[varName] = val;
          }
          break;
        }

        case "ADD":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) + resolveVal(inst.arg2);
          break;

        case "SUB":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) - resolveVal(inst.arg2);
          break;

        case "MUL":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) * resolveVal(inst.arg2);
          break;

        case "DIV": {
          const denom = resolveVal(inst.arg2);
          if (inst.dest) registers[inst.dest] = denom !== 0 ? resolveVal(inst.arg1) / denom : 0;
          break;
        }

        case "AND":
          if (inst.dest) registers[inst.dest] = Boolean(resolveVal(inst.arg1)) && Boolean(resolveVal(inst.arg2));
          break;

        case "OR":
          if (inst.dest) registers[inst.dest] = Boolean(resolveVal(inst.arg1)) || Boolean(resolveVal(inst.arg2));
          break;

        case "XOR":
          if (inst.dest) registers[inst.dest] = Boolean(resolveVal(inst.arg1)) !== Boolean(resolveVal(inst.arg2));
          break;

        case "NOT":
          if (inst.dest) registers[inst.dest] = !Boolean(resolveVal(inst.arg1));
          break;

        case "EQ":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) === resolveVal(inst.arg2);
          break;

        case "NEQ":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) !== resolveVal(inst.arg2);
          break;

        case "LT":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) < resolveVal(inst.arg2);
          break;

        case "LE":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) <= resolveVal(inst.arg2);
          break;

        case "GT":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) > resolveVal(inst.arg2);
          break;

        case "GE":
          if (inst.dest) registers[inst.dest] = resolveVal(inst.arg1) >= resolveVal(inst.arg2);
          break;

        case "JUMP": {
          const targetLabel = inst.arg1;
          const targetIndex = instructions.findIndex((i) => i.label === targetLabel);
          if (targetIndex !== -1) {
            pc = targetIndex;
            continue;
          }
          break;
        }

        case "JUMP_IF_FALSE": {
          const cond = Boolean(resolveVal(inst.arg1));
          if (!cond) {
            const targetLabel = inst.arg2;
            const targetIndex = instructions.findIndex((i) => i.label === targetLabel);
            if (targetIndex !== -1) {
              pc = targetIndex;
              continue;
            }
          }
          break;
        }

        case "CALL_FB": {
          const fbType = inst.arg1;
          const fbInstanceName = inst.dest || "FB_Inst";
          if (fbType === "TON") {
            let ton = this.tonBlocks.get(fbInstanceName);
            if (!ton) {
              ton = new TonBlock();
              this.tonBlocks.set(fbInstanceName, ton);
            }
            const inVal = resolveVal(inst.arg2?.IN ?? false);
            const ptMs = typeof inst.arg2?.PT === "number" ? inst.arg2.PT : 5000;
            ton.execute(inVal, ptMs, deltaMs);
            locals[`${fbInstanceName}.Q`] = ton.Q;
            locals[`${fbInstanceName}.ET`] = ton.ET;
          }
          break;
        }

        case "RETURN":
          return;

        case "NOP":
          break;
      }

      pc++;
    }
  }

  public getWatchList(): WatchEntry[] {
    const list: WatchEntry[] = [];
    for (const [k, v] of Object.entries(this.globalVariables)) {
      list.push({
        name: k,
        value: v,
        type: typeof v === "boolean" ? "BOOL" : typeof v === "number" ? "REAL" : "STRING",
        isForced: Boolean(this.forcedVariables[k]),
      });
    }
    return list;
  }
}
