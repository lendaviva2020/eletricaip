// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — DETERMINISTIC IEC TASK SCHEDULER & SIMULATOR
// Deterministic Execution Cycle, Process Images, Timed Tasks & Simulated Forcing
// ============================================================================

import type { CompiledProjectIR, IRInstruction } from "../compiler/intermediate-representation";
import {
  TonBlock,
  TofBlock,
  TpBlock,
  CtuBlock,
  RTrigBlock,
  FTrigBlock,
  SrBlock,
  RsBlock,
  PidBlock,
} from "./standard-blocks";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../../canonical/types";
import { MultiTypeTaskManager } from "../task/task-manager";

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

  // Unificação de Runtime com MultiTypeTaskManager
  public taskManager!: MultiTypeTaskManager;

  // Blocos padrão instanciados com memória independente por instância
  private tonBlocks: Map<string, TonBlock> = new Map();
  private tofBlocks: Map<string, TofBlock> = new Map();
  private tpBlocks: Map<string, TpBlock> = new Map();
  private ctuBlocks: Map<string, CtuBlock> = new Map();
  private rtrigBlocks: Map<string, RTrigBlock> = new Map();
  private ftrigBlocks: Map<string, FTrigBlock> = new Map();
  private srBlocks: Map<string, SrBlock> = new Map();
  private rsBlocks: Map<string, RsBlock> = new Map();
  private pidBlocks: Map<string, PidBlock> = new Map();
  public fbInstancesMemory: Map<string, Record<string, any>> = new Map();

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
    this.tofBlocks.clear();
    this.tpBlocks.clear();
    this.ctuBlocks.clear();
    this.rtrigBlocks.clear();
    this.ftrigBlocks.clear();
    this.srBlocks.clear();
    this.rsBlocks.clear();
    this.pidBlocks.clear();
    this.fbInstancesMemory.clear();

    // Inicializa o gerenciador unificado de tarefas determinísticas
    const taskConfigs = (this.compiledIR.tasks || []).map((t) => ({
      id: t.id,
      controllerId: "ctrl-sim",
      name: t.name,
      type: t.type,
      priority: t.priority,
      intervalMs: t.intervalMs,
      watchdogMs: t.watchdogMs,
      watchdogSensitivity: t.watchdogSensitivity,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: t.pouNames,
      enabled: true,
      eventTriggerTagId: t.triggerEventVariable,
    }));

    if (taskConfigs.length === 0 && this.compiledIR.tasksOrder) {
      this.compiledIR.tasksOrder.forEach((t, i) => {
        taskConfigs.push({
          id: `task_${i}`,
          controllerId: "ctrl-sim",
          name: t.taskName,
          type: "CYCLIC",
          priority: i,
          intervalMs: t.intervalMs,
          watchdogMs: 100,
          watchdogSensitivity: 1,
          cycleTimeActualMs: 0,
          jitterMs: 0,
          isOverrun: false,
          pouIds: t.pouNames,
          enabled: true,
          eventTriggerTagId: undefined,
        });
      });
    }

    this.taskManager = new MultiTypeTaskManager(taskConfigs);
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
    // 1. Aplica Forcing sobre variáveis de entrada
    for (const [k, v] of Object.entries(this.forcedVariables)) {
      this.globalVariables[k] = v;
      if (k in this.inputProcessImage) {
        this.inputProcessImage[k] = v;
      }
    }

    // 2. Executa tarefas agendadas via MultiTypeTaskManager determinístico
    this.taskManager.evaluateAndExecute(
      this.totalSimulatedTimeMs,
      (varName) => this.globalVariables[varName] ?? this.inputProcessImage[varName],
      (pouName) => {
        const block = this.compiledIR.blocks[pouName];
        if (block) {
          this.executeIRBlock(pouName, block.instructions, cycleIntervalMs);
        }
      }
    );

    // 3. Aplica Forcing sobre variáveis de saída
    for (const [k, v] of Object.entries(this.forcedVariables)) {
      if (k in this.outputProcessImage) {
        this.outputProcessImage[k] = v;
      }
      this.globalVariables[k] = v;
    }

    this.cycleCount++;
    this.totalSimulatedTimeMs += cycleIntervalMs;
    this.lastCycleDurationMs = cycleIntervalMs;

    return true;
  }

  public getCycleMetrics(): { cycleCount: number; accumulatedTimeMs: number; lastDurationMs: number } {
    return {
      cycleCount: this.cycleCount,
      accumulatedTimeMs: this.totalSimulatedTimeMs,
      lastDurationMs: this.lastCycleDurationMs,
    };
  }

  private executeIRBlock(
    pouName: string,
    instructions: IRInstruction[],
    deltaMs: number,
    customLocals?: Record<string, any>
  ): void {
    const registers: Record<string, any> = {};
    const locals = customLocals || this.localVariables[pouName] || {};

    const resolveVal = (valOrReg: any): any => {
      if (typeof valOrReg === "string" && valOrReg.startsWith("_t")) {
        return registers[valOrReg];
      }
      if (typeof valOrReg === "string" && valOrReg.startsWith("_in_")) {
        return registers[valOrReg];
      }
      if (typeof valOrReg === "string" && valOrReg.startsWith("_fbd_")) {
        return registers[valOrReg] !== undefined ? registers[valOrReg] : this.globalVariables[valOrReg];
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
          if (val === undefined && inst.arg1?.startsWith("_fbd_")) {
            val = registers[inst.arg1];
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
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) + Number(resolveVal(inst.arg2));
          break;

        case "SUB":
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) - Number(resolveVal(inst.arg2));
          break;

        case "MUL":
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) * Number(resolveVal(inst.arg2));
          break;

        case "DIV": {
          const denom = Number(resolveVal(inst.arg2));
          if (inst.dest) registers[inst.dest] = denom !== 0 ? Number(resolveVal(inst.arg1)) / denom : 0;
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
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) < Number(resolveVal(inst.arg2));
          break;

        case "LE":
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) <= Number(resolveVal(inst.arg2));
          break;

        case "GT":
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) > Number(resolveVal(inst.arg2));
          break;

        case "GE":
          if (inst.dest) registers[inst.dest] = Number(resolveVal(inst.arg1)) >= Number(resolveVal(inst.arg2));
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
          const fbInstanceName = inst.dest || inst.arg3 || `${pouName}_${fbType}`;

          if (fbType === "TON") {
            let ton = this.tonBlocks.get(fbInstanceName);
            if (!ton) {
              ton = new TonBlock();
              this.tonBlocks.set(fbInstanceName, ton);
            }
            const inVal = Boolean(resolveVal(inst.arg2?.IN ?? false));
            const ptMs = typeof inst.arg2?.PT === "number" ? inst.arg2.PT : 5000;
            ton.execute(inVal, ptMs, deltaMs);
            locals[`${fbInstanceName}.Q`] = ton.Q;
            locals[`${fbInstanceName}.ET`] = ton.ET;
            if (inst.dest) registers[inst.dest] = ton.Q;
          } else if (fbType === "TOF") {
            let tof = this.tofBlocks.get(fbInstanceName);
            if (!tof) {
              tof = new TofBlock();
              this.tofBlocks.set(fbInstanceName, tof);
            }
            const inVal = Boolean(resolveVal(inst.arg2?.IN ?? false));
            const ptMs = typeof inst.arg2?.PT === "number" ? inst.arg2.PT : 5000;
            tof.execute(inVal, ptMs, deltaMs);
            locals[`${fbInstanceName}.Q`] = tof.Q;
            locals[`${fbInstanceName}.ET`] = tof.ET;
            if (inst.dest) registers[inst.dest] = tof.Q;
          } else if (fbType === "TP") {
            let tp = this.tpBlocks.get(fbInstanceName);
            if (!tp) {
              tp = new TpBlock();
              this.tpBlocks.set(fbInstanceName, tp);
            }
            const inVal = Boolean(resolveVal(inst.arg2?.IN ?? false));
            const ptMs = typeof inst.arg2?.PT === "number" ? inst.arg2.PT : 5000;
            tp.execute(inVal, ptMs, deltaMs);
            locals[`${fbInstanceName}.Q`] = tp.Q;
            locals[`${fbInstanceName}.ET`] = tp.ET;
            if (inst.dest) registers[inst.dest] = tp.Q;
          } else if (fbType === "CTU") {
            let ctu = this.ctuBlocks.get(fbInstanceName);
            if (!ctu) {
              ctu = new CtuBlock();
              this.ctuBlocks.set(fbInstanceName, ctu);
            }
            const cuVal = Boolean(resolveVal(inst.arg2?.CU ?? false));
            const resetVal = Boolean(resolveVal(inst.arg2?.RESET ?? false));
            const pvVal = Number(resolveVal(inst.arg2?.PV ?? 10));
            ctu.execute(cuVal, resetVal, pvVal);
            locals[`${fbInstanceName}.Q`] = ctu.Q;
            locals[`${fbInstanceName}.CV`] = ctu.CV;
            if (inst.dest) registers[inst.dest] = ctu.Q;
          } else if (fbType === "R_TRIG") {
            let rtrig = this.rtrigBlocks.get(fbInstanceName);
            if (!rtrig) {
              rtrig = new RTrigBlock();
              this.rtrigBlocks.set(fbInstanceName, rtrig);
            }
            const clkVal = Boolean(resolveVal(inst.arg2?.CLK ?? false));
            rtrig.execute(clkVal);
            locals[`${fbInstanceName}.Q`] = rtrig.Q;
            if (inst.dest) registers[inst.dest] = rtrig.Q;
          } else if (fbType === "F_TRIG") {
            let ftrig = this.ftrigBlocks.get(fbInstanceName);
            if (!ftrig) {
              ftrig = new FTrigBlock();
              this.ftrigBlocks.set(fbInstanceName, ftrig);
            }
            const clkVal = Boolean(resolveVal(inst.arg2?.CLK ?? false));
            ftrig.execute(clkVal);
            locals[`${fbInstanceName}.Q`] = ftrig.Q;
            if (inst.dest) registers[inst.dest] = ftrig.Q;
          } else if (fbType === "SR") {
            let sr = this.srBlocks.get(fbInstanceName);
            if (!sr) {
              sr = new SrBlock();
              this.srBlocks.set(fbInstanceName, sr);
            }
            const sVal = Boolean(resolveVal(inst.arg2?.S1 ?? false));
            const rVal = Boolean(resolveVal(inst.arg2?.R ?? false));
            sr.execute(sVal, rVal);
            locals[`${fbInstanceName}.Q1`] = sr.Q1;
            if (inst.dest) registers[inst.dest] = sr.Q1;
          } else if (fbType === "RS") {
            let rs = this.rsBlocks.get(fbInstanceName);
            if (!rs) {
              rs = new RsBlock();
              this.rsBlocks.set(fbInstanceName, rs);
            }
            const sVal = Boolean(resolveVal(inst.arg2?.S ?? false));
            const rVal = Boolean(resolveVal(inst.arg2?.R1 ?? false));
            rs.execute(sVal, rVal);
            locals[`${fbInstanceName}.Q1`] = rs.Q1;
            if (inst.dest) registers[inst.dest] = rs.Q1;
          } else if (fbType === "PID") {
            let pid = this.pidBlocks.get(fbInstanceName);
            if (!pid) {
              pid = new PidBlock();
              this.pidBlocks.set(fbInstanceName, pid);
            }
            const spVal = Number(resolveVal(inst.arg2?.SP ?? 50));
            const pvVal = Number(resolveVal(inst.arg2?.PV ?? 50));
            const kpVal = Number(resolveVal(inst.arg2?.KP ?? 1));
            const tnVal = Number(resolveVal(inst.arg2?.TN ?? 2));
            const tvVal = Number(resolveVal(inst.arg2?.TV ?? 0));
            const out = pid.execute(spVal, pvVal, kpVal, tnVal, tvVal, deltaMs / 1000);
            locals[`${fbInstanceName}.OUT`] = out;
            if (inst.dest) registers[inst.dest] = out;
          } else if (this.compiledIR.blocks[fbType]) {
            // Function Block definido pelo usuário com instância isolada
            let instMemory = this.fbInstancesMemory.get(fbInstanceName);
            if (!instMemory) {
              instMemory = { ...this.compiledIR.blocks[fbType].localVariables };
              this.fbInstancesMemory.set(fbInstanceName, instMemory);
            }
            if (inst.arg2 && typeof inst.arg2 === "object") {
              for (const [k, v] of Object.entries(inst.arg2)) {
                instMemory[k] = resolveVal(v);
              }
            }
            this.executeIRBlock(fbType, this.compiledIR.blocks[fbType].instructions, deltaMs, instMemory);
            for (const [k, v] of Object.entries(instMemory)) {
              locals[`${fbInstanceName}.${k}`] = v;
            }
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
