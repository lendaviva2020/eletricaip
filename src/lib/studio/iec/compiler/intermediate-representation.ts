// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — IEC INTERMEDIATE REPRESENTATION (IR)
// Deterministic Bytecode / Quad Architecture for IEC Simulation & Execution
// ============================================================================

export type IROpCode =
  | "LOAD_CONST" // rDest, value
  | "LOAD_VAR" // rDest, varName
  | "STORE_VAR" // varName, rSrc
  | "LOAD_IO" // rDest, iecAddress (%IX, %IW)
  | "STORE_IO" // iecAddress (%QX, %QW), rSrc
  | "ADD"
  | "SUB"
  | "MUL"
  | "DIV"
  | "MOD"
  | "AND"
  | "OR"
  | "XOR"
  | "NOT"
  | "EQ"
  | "NEQ"
  | "LT"
  | "LE"
  | "GT"
  | "GE"
  | "JUMP" // targetLabel
  | "JUMP_IF_TRUE" // rCond, targetLabel
  | "JUMP_IF_FALSE" // rCond, targetLabel
  | "CALL_FB" // fbInstanceId, inArgs, outArgs
  | "RETURN"
  | "NOP";

export interface IRInstruction {
  op: IROpCode;
  arg1?: any;
  arg2?: any;
  arg3?: any;
  dest?: string;
  sourceLine?: number;
  label?: string;
}

export interface IRBlock {
  pouName: string;
  instructions: IRInstruction[];
  localVariables: Record<string, any>;
}

export interface CompiledProjectIR {
  blocks: Record<string, IRBlock>;
  globalVariables: Record<string, any>;
  tasksOrder: { taskName: string; pouNames: string[]; intervalMs: number }[];
}
