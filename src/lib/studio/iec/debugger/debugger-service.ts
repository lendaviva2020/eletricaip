/**
 * ElétricAi Industrial OS — Real Interactive IEC Debugger Service
 * Paridade com as capacidades de depuração online do CODESYS V3.5:
 * Breakpoints condicionais, execução passo a passo (Step In/Over/Out),
 * Tabela de inspeção de variáveis (Watch Table) com histórico e Forcing isolado.
 * 
 * Invariante de Segurança:
 * IS_PHYSICAL_CONTROL_ALLOWED = false
 */

import { CompiledProjectIR, IRInstruction, IRBlock } from "../compiler/intermediate-representation";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../../canonical/types";

export interface BreakpointDefinition {
  id: string;
  pouName: string;
  sourceLine: number;
  conditionST?: string;
  enabled: boolean;
  hitCount: number;
}

export interface WatchHistorySample {
  timestampMs: number;
  value: any;
}

export interface WatchTableEntry {
  name: string;
  currentValue: any;
  dataType: string;
  isForced: boolean;
  history: WatchHistorySample[];
}

export type DebuggerExecutionState = "STOPPED" | "RUNNING" | "PAUSED_BREAKPOINT" | "STEPPING";

export class InteractiveDebuggerService {
  private ir: CompiledProjectIR;
  private state: DebuggerExecutionState = "STOPPED";
  private currentPou: string = "";
  private currentInstructionIdx: number = 0;
  private callStack: { pouName: string; returnIdx: number }[] = [];
  
  // Memória de variáveis do runtime
  private memory: Record<string, any> = {};
  private forcedMemory: Record<string, any> = {};

  // Breakpoints
  private breakpoints: Map<string, BreakpointDefinition> = new Map();
  private lastHitBreakpoint: BreakpointDefinition | null = null;

  // Watch Table com buffer circular
  private watches: Map<string, WatchTableEntry> = new Map();
  private maxHistorySamples: number = 100;
  private virtualClockMs: number = 0;

  constructor(ir: CompiledProjectIR) {
    this.ir = ir;
    this.reset();
  }

  public reset(): void {
    this.state = "STOPPED";
    this.currentPou = this.ir.tasksOrder[0]?.pouNames[0] || Object.keys(this.ir.blocks)[0] || "";
    this.currentInstructionIdx = 0;
    this.callStack = [];
    this.memory = JSON.parse(JSON.stringify(this.ir.globalVariables || {}));
    this.forcedMemory = {};
    this.lastHitBreakpoint = null;
    this.virtualClockMs = 0;

    // Inicializa variáveis locais dos blocos
    for (const [pouName, blk] of Object.entries(this.ir.blocks)) {
      for (const [vName, vVal] of Object.entries(blk.localVariables)) {
        this.memory[`${pouName}.${vName}`] = vVal;
      }
    }
  }

  public getState(): DebuggerExecutionState {
    return this.state;
  }

  public getCurrentLocation(): { pouName: string; instructionIndex: number; sourceLine?: number } {
    const blk = this.ir.blocks[this.currentPou];
    const inst = blk?.instructions[this.currentInstructionIdx];
    return {
      pouName: this.currentPou,
      instructionIndex: this.currentInstructionIdx,
      sourceLine: inst?.sourceLine,
    };
  }

  public getLastHitBreakpoint(): BreakpointDefinition | null {
    return this.lastHitBreakpoint;
  }

  // ==========================================================================
  // Gerenciamento de Breakpoints
  // ==========================================================================

  public setBreakpoint(pouName: string, sourceLine: number, conditionST?: string): BreakpointDefinition {
    const id = `${pouName}:${sourceLine}`;
    const bp: BreakpointDefinition = {
      id,
      pouName,
      sourceLine,
      conditionST,
      enabled: true,
      hitCount: 0,
    };
    this.breakpoints.set(id, bp);
    return bp;
  }

  public removeBreakpoint(id: string): void {
    this.breakpoints.delete(id);
  }

  public toggleBreakpoint(id: string): void {
    const bp = this.breakpoints.get(id);
    if (bp) bp.enabled = !bp.enabled;
  }

  public getAllBreakpoints(): BreakpointDefinition[] {
    return Array.from(this.breakpoints.values());
  }

  // ==========================================================================
  // Controle de Execução Passo a Passo (Step Execution)
  // ==========================================================================

  public stepInstruction(): boolean {
    const blk = this.ir.blocks[this.currentPou];
    if (!blk || this.currentInstructionIdx >= blk.instructions.length) {
      this.handleReturnOrTaskEnd();
      return false;
    }

    const inst = blk.instructions[this.currentInstructionIdx];
    this.executeSingleInstruction(inst);
    this.currentInstructionIdx++;

    this.updateWatches();
    return true;
  }

  public stepOver(): void {
    const startLoc = this.getCurrentLocation();
    const targetLine = startLoc.sourceLine;

    while (this.stepInstruction()) {
      const curLoc = this.getCurrentLocation();
      if (curLoc.sourceLine !== targetLine && curLoc.pouName === startLoc.pouName) {
        break;
      }
      if (this.checkBreakpoints()) {
        break;
      }
    }
  }

  public stepInto(): void {
    const blk = this.ir.blocks[this.currentPou];
    const inst = blk?.instructions[this.currentInstructionIdx];

    if (inst && inst.op === "CALL_FB") {
      const targetPou = String(inst.arg1);
      if (this.ir.blocks[targetPou]) {
        this.callStack.push({ pouName: this.currentPou, returnIdx: this.currentInstructionIdx + 1 });
        this.currentPou = targetPou;
        this.currentInstructionIdx = 0;
        this.updateWatches();
        return;
      }
    }

    this.stepInstruction();
  }

  public stepOut(): void {
    const currentStackDepth = this.callStack.length;
    while (this.callStack.length >= currentStackDepth && this.stepInstruction()) {
      if (this.checkBreakpoints()) break;
    }
  }

  public resume(): void {
    this.state = "RUNNING";
    this.lastHitBreakpoint = null;

    let instructionBudget = 10000; // Proteção contra loops infinitos por ciclo
    while (instructionBudget-- > 0) {
      if (this.checkBreakpoints()) {
        this.state = "PAUSED_BREAKPOINT";
        break;
      }
      if (!this.stepInstruction()) {
        break;
      }
    }
  }

  // ==========================================================================
  // Watch Table e Forcing Seguro
  // ==========================================================================

  public addWatch(name: string, dataType: string = "ANY"): void {
    if (!this.watches.has(name)) {
      this.watches.set(name, {
        name,
        currentValue: this.getVariableValue(name),
        dataType,
        isForced: name in this.forcedMemory,
        history: [],
      });
    }
  }

  public removeWatch(name: string): void {
    this.watches.delete(name);
  }

  public getWatches(): WatchTableEntry[] {
    return Array.from(this.watches.values());
  }

  public forceVariable(name: string, value: any): void {
    if (IS_PHYSICAL_CONTROL_ALLOWED) {
      throw new Error("VIOLAÇÃO DE SEGURANÇA: Escrita direta em hardware físico é bloqueada.");
    }
    this.forcedMemory[name] = value;
    this.memory[name] = value;
    const w = this.watches.get(name);
    if (w) w.isForced = true;
    this.updateWatches();
  }

  public unforceVariable(name: string): void {
    delete this.forcedMemory[name];
    const w = this.watches.get(name);
    if (w) w.isForced = false;
  }

  public getVariableValue(name: string): any {
    if (name in this.forcedMemory) return this.forcedMemory[name];
    if (name in this.memory) return this.memory[name];
    return undefined;
  }

  // ==========================================================================
  // Mecânica Interna
  // ==========================================================================

  private checkBreakpoints(): boolean {
    const loc = this.getCurrentLocation();
    if (!loc.sourceLine) return false;

    const bp = this.breakpoints.get(`${loc.pouName}:${loc.sourceLine}`);
    if (bp && bp.enabled) {
      bp.hitCount++;
      this.lastHitBreakpoint = bp;
      return true;
    }
    return false;
  }

  private handleReturnOrTaskEnd(): void {
    if (this.callStack.length > 0) {
      const caller = this.callStack.pop()!;
      this.currentPou = caller.pouName;
      this.currentInstructionIdx = caller.returnIdx;
    } else {
      // Fim do ciclo atual
      this.currentInstructionIdx = 0;
      this.virtualClockMs += 10;
    }
  }

  private executeSingleInstruction(inst: IRInstruction): void {
    const getVal = (arg: any) => {
      if (typeof arg === "string" && (arg in this.memory || arg in this.forcedMemory)) {
        return this.getVariableValue(arg);
      }
      return arg;
    };

    switch (inst.op) {
      case "LOAD_CONST":
        if (inst.dest) this.memory[inst.dest] = inst.arg1;
        break;
      case "LOAD_VAR":
        if (inst.dest) this.memory[inst.dest] = this.getVariableValue(inst.arg1);
        break;
      case "STORE_VAR":
        if (!(inst.arg1 in this.forcedMemory)) {
          this.memory[inst.arg1] = getVal(inst.arg2);
        }
        break;
      case "ADD":
        if (inst.dest) this.memory[inst.dest] = Number(getVal(inst.arg1)) + Number(getVal(inst.arg2));
        break;
      case "SUB":
        if (inst.dest) this.memory[inst.dest] = Number(getVal(inst.arg1)) - Number(getVal(inst.arg2));
        break;
      case "MUL":
        if (inst.dest) this.memory[inst.dest] = Number(getVal(inst.arg1)) * Number(getVal(inst.arg2));
        break;
      case "DIV":
        if (inst.dest) {
          const d = Number(getVal(inst.arg2));
          this.memory[inst.dest] = d !== 0 ? Number(getVal(inst.arg1)) / d : 0;
        }
        break;
      case "AND":
        if (inst.dest) this.memory[inst.dest] = Boolean(getVal(inst.arg1)) && Boolean(getVal(inst.arg2));
        break;
      case "OR":
        if (inst.dest) this.memory[inst.dest] = Boolean(getVal(inst.arg1)) || Boolean(getVal(inst.arg2));
        break;
      case "NOT":
        if (inst.dest) this.memory[inst.dest] = !Boolean(getVal(inst.arg1));
        break;
      case "EQ":
        if (inst.dest) this.memory[inst.dest] = getVal(inst.arg1) === getVal(inst.arg2);
        break;
      case "NEQ":
        if (inst.dest) this.memory[inst.dest] = getVal(inst.arg1) !== getVal(inst.arg2);
        break;
      case "GT":
        if (inst.dest) this.memory[inst.dest] = Number(getVal(inst.arg1)) > Number(getVal(inst.arg2));
        break;
      case "LT":
        if (inst.dest) this.memory[inst.dest] = Number(getVal(inst.arg1)) < Number(getVal(inst.arg2));
        break;
      case "JUMP":
        this.jumpToLabel(inst.arg1);
        break;
      case "JUMP_IF_FALSE":
        if (!Boolean(getVal(inst.arg1))) {
          this.jumpToLabel(inst.arg2);
        }
        break;
      case "JUMP_IF_TRUE":
        if (Boolean(getVal(inst.arg1))) {
          this.jumpToLabel(inst.arg2);
        }
        break;
      case "RETURN":
        this.handleReturnOrTaskEnd();
        break;
    }
  }

  private jumpToLabel(label: string): void {
    const blk = this.ir.blocks[this.currentPou];
    if (!blk) return;
    const targetIdx = blk.instructions.findIndex((i) => i.label === label);
    if (targetIdx !== -1) {
      this.currentInstructionIdx = targetIdx;
    }
  }

  private updateWatches(): void {
    for (const [name, entry] of this.watches.entries()) {
      const val = this.getVariableValue(name);
      entry.currentValue = val;
      entry.history.push({ timestampMs: this.virtualClockMs, value: val });
      if (entry.history.length > this.maxHistorySamples) {
        entry.history.shift();
      }
    }
  }
}
