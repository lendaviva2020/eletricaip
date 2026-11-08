// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — IEC 61131-3 STRUCTURED TEXT (ST) AST DEFINITION
// Strongly typed Abstract Syntax Tree for IEC Automation Engineering
// ============================================================================

export type ASTNodeType =
  | "POU_DECLARATION"
  | "VAR_BLOCK"
  | "VAR_DECLARATION"
  | "ASSIGNMENT_STMT"
  | "IF_STMT"
  | "CASE_STMT"
  | "CASE_BRANCH"
  | "FOR_STMT"
  | "WHILE_STMT"
  | "REPEAT_STMT"
  | "INVOCATION_STMT"
  | "RETURN_STMT"
  | "EXIT_STMT"
  | "BINARY_EXPR"
  | "UNARY_EXPR"
  | "IDENTIFIER_EXPR"
  | "LITERAL_EXPR"
  | "FUNCTION_CALL_EXPR"
  | "ARRAY_ACCESS_EXPR"
  | "MEMBER_ACCESS_EXPR";

export interface SourceLocation {
  line: number;
  column: number;
}

export interface ASTNode {
  type: ASTNodeType;
  loc: SourceLocation;
}

// ----------------------------------------------------------------------------
// Expressions
// ----------------------------------------------------------------------------
export type Expression =
  | BinaryExpression
  | UnaryExpression
  | IdentifierExpression
  | LiteralExpression
  | FunctionCallExpression
  | ArrayAccessExpression
  | MemberAccessExpression;

export interface BinaryExpression extends ASTNode {
  type: "BINARY_EXPR";
  operator: string; // +, -, *, /, MOD, AND, OR, XOR, =, <>, <, <=, >, >=
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends ASTNode {
  type: "UNARY_EXPR";
  operator: string; // -, NOT
  operand: Expression;
}

export interface IdentifierExpression extends ASTNode {
  type: "IDENTIFIER_EXPR";
  name: string;
}

export interface LiteralExpression extends ASTNode {
  type: "LITERAL_EXPR";
  literalType: "INT" | "REAL" | "BOOL" | "STRING" | "TIME";
  value: any;
  raw: string;
}

export interface FunctionCallExpression extends ASTNode {
  type: "FUNCTION_CALL_EXPR";
  callee: string;
  arguments: Expression[];
}

export interface ArrayAccessExpression extends ASTNode {
  type: "ARRAY_ACCESS_EXPR";
  array: Expression;
  index: Expression;
}

export interface MemberAccessExpression extends ASTNode {
  type: "MEMBER_ACCESS_EXPR";
  target: Expression;
  member: string;
}

// ----------------------------------------------------------------------------
// Statements
// ----------------------------------------------------------------------------
export type Statement =
  | AssignmentStatement
  | IfStatement
  | CaseStatement
  | ForStatement
  | WhileStatement
  | RepeatStatement
  | InvocationStatement
  | ReturnStatement
  | ExitStatement;

export interface AssignmentStatement extends ASTNode {
  type: "ASSIGNMENT_STMT";
  target: Expression;
  value: Expression;
}

export interface ElsifClause {
  condition: Expression;
  statements: Statement[];
  loc: SourceLocation;
}

export interface IfStatement extends ASTNode {
  type: "IF_STMT";
  condition: Expression;
  thenStatements: Statement[];
  elsifClauses: ElsifClause[];
  elseStatements: Statement[];
}

export interface CaseBranch {
  matchValues: Expression[];
  statements: Statement[];
  loc: SourceLocation;
}

export interface CaseStatement extends ASTNode {
  type: "CASE_STMT";
  selector: Expression;
  branches: CaseBranch[];
  elseStatements: Statement[];
}

export interface ForStatement extends ASTNode {
  type: "FOR_STMT";
  variable: string;
  start: Expression;
  end: Expression;
  by?: Expression;
  statements: Statement[];
}

export interface WhileStatement extends ASTNode {
  type: "WHILE_STMT";
  condition: Expression;
  statements: Statement[];
}

export interface RepeatStatement extends ASTNode {
  type: "REPEAT_STMT";
  statements: Statement[];
  untilCondition: Expression;
}

export interface InvocationStatement extends ASTNode {
  type: "INVOCATION_STMT";
  callee: string;
  arguments: { name?: string; value: Expression }[];
}

export interface ReturnStatement extends ASTNode {
  type: "RETURN_STMT";
}

export interface ExitStatement extends ASTNode {
  type: "EXIT_STMT";
}

// ----------------------------------------------------------------------------
// Declarations
// ----------------------------------------------------------------------------
export interface VarDeclaration extends ASTNode {
  type: "VAR_DECLARATION";
  name: string;
  dataType: string;
  address?: string; // ex: %IX0.0, %MW10
  initialValue?: Expression;
}

export interface VarBlock extends ASTNode {
  type: "VAR_BLOCK";
  scope: string; // VAR, VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR_GLOBAL, etc.
  isRetain: boolean;
  isConstant: boolean;
  declarations: VarDeclaration[];
}

export interface POUDeclaration extends ASTNode {
  type: "POU_DECLARATION";
  pouType: "PROGRAM" | "FUNCTION_BLOCK" | "FUNCTION";
  name: string;
  returnType?: string;
  varBlocks: VarBlock[];
  body: Statement[];
}
