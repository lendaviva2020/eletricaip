// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — IEC 61131-3 STRUCTURED TEXT (ST) SEMANTIC ANALYZER
// Symbol Table, Scope Resolution, Type Verification & Diagnostic Reporting
// ============================================================================

import type {
  POUDeclaration,
  Statement,
  Expression,
  BinaryExpression,
  UnaryExpression,
  IdentifierExpression,
  LiteralExpression,
  FunctionCallExpression,
  AssignmentStatement,
  IfStatement,
  CaseStatement,
  ForStatement,
  WhileStatement,
  RepeatStatement,
} from "./st-ast";
import type { CompilerDiagnostic } from "../../canonical/types";
import { generateUuid as uuidv4 } from "../../canonical/uuid";

export interface SymbolInfo {
  name: string;
  dataType: string;
  scope: string;
  isConstant: boolean;
  isRetain: boolean;
}

export class StSemanticAnalyzer {
  private symbols: Map<string, SymbolInfo> = new Map();
  private diagnostics: CompilerDiagnostic[] = [];

  constructor(
    private readonly ast: POUDeclaration,
    private readonly externalSymbols: Map<string, string> = new Map(), // Global Tags & GVL
  ) {
    this.populateSymbolTable();
  }

  public analyze(): CompilerDiagnostic[] {
    this.diagnostics = [];

    for (const stmt of this.ast.body) {
      this.checkStatement(stmt);
    }

    return this.diagnostics;
  }

  public getSymbolTable(): Map<string, SymbolInfo> {
    return this.symbols;
  }

  private populateSymbolTable(): void {
    // Carrega variáveis declaradas nos blocos VAR
    for (const block of this.ast.varBlocks) {
      for (const decl of block.declarations) {
        const lower = decl.name.toLowerCase();
        if (this.symbols.has(lower)) {
          this.diagnostics.push({
            id: uuidv4(),
            line: decl.loc.line,
            column: decl.loc.column,
            severity: "ERROR",
            code: "IEC_SYM_DUPLICATE",
            message: `Variável '${decl.name}' já foi declarada anteriormente neste POU.`,
          });
        } else {
          this.symbols.set(lower, {
            name: decl.name,
            dataType: decl.dataType.toUpperCase(),
            scope: block.scope,
            isConstant: block.isConstant,
            isRetain: block.isRetain,
          });
        }
      }
    }
  }

  private checkStatement(stmt: Statement): void {
    switch (stmt.type) {
      case "ASSIGNMENT_STMT":
        this.checkAssignment(stmt);
        break;
      case "IF_STMT":
        this.checkIf(stmt);
        break;
      case "CASE_STMT":
        this.checkCase(stmt);
        break;
      case "FOR_STMT":
        this.checkFor(stmt);
        break;
      case "WHILE_STMT":
        this.checkWhile(stmt);
        break;
      case "REPEAT_STMT":
        this.checkRepeat(stmt);
        break;
      case "INVOCATION_STMT":
        // Invocação de FB ou Função
        break;
      case "RETURN_STMT":
      case "EXIT_STMT":
        break;
    }
  }

  private checkAssignment(stmt: AssignmentStatement): void {
    const targetType = this.resolveExpressionType(stmt.target);
    const valueType = this.resolveExpressionType(stmt.value);

    if (stmt.target.type === "IDENTIFIER_EXPR") {
      const sym = this.symbols.get(stmt.target.name.toLowerCase());
      if (sym && sym.isConstant) {
        this.diagnostics.push({
          id: uuidv4(),
          line: stmt.loc.line,
          column: stmt.loc.column,
          severity: "ERROR",
          code: "IEC_ASSIGN_CONSTANT",
          message: `Não é permitido atribuir valor à constante '${sym.name}'.`,
        });
      }
    }

    if (targetType && valueType && !this.isTypeCompatible(targetType, valueType)) {
      this.diagnostics.push({
        id: uuidv4(),
        line: stmt.loc.line,
        column: stmt.loc.column,
        severity: "ERROR",
        code: "IEC_TYPE_MISMATCH",
        message: `Incompatibilidade de tipos na atribuição: '${targetType}' não pode receber '${valueType}'.`,
      });
    }
  }

  private checkIf(stmt: IfStatement): void {
    const condType = this.resolveExpressionType(stmt.condition);
    if (condType && condType !== "BOOL") {
      this.diagnostics.push({
        id: uuidv4(),
        line: stmt.condition.loc.line,
        column: stmt.condition.loc.column,
        severity: "ERROR",
        code: "IEC_COND_NOT_BOOL",
        message: `Condição de IF deve ser do tipo BOOL (encontrado '${condType}').`,
      });
    }

    for (const s of stmt.thenStatements) this.checkStatement(s);
    for (const clause of stmt.elsifClauses) {
      const elCond = this.resolveExpressionType(clause.condition);
      if (elCond && elCond !== "BOOL") {
        this.diagnostics.push({
          id: uuidv4(),
          line: clause.loc.line,
          column: clause.loc.column,
          severity: "ERROR",
          code: "IEC_COND_NOT_BOOL",
          message: `Condição de ELSIF deve ser do tipo BOOL (encontrado '${elCond}').`,
        });
      }
      for (const s of clause.statements) this.checkStatement(s);
    }
    for (const s of stmt.elseStatements) this.checkStatement(s);
  }

  private checkCase(stmt: CaseStatement): void {
    const selType = this.resolveExpressionType(stmt.selector);
    for (const b of stmt.branches) {
      for (const valExpr of b.matchValues) {
        const valType = this.resolveExpressionType(valExpr);
        if (selType && valType && !this.isTypeCompatible(selType, valType)) {
          this.diagnostics.push({
            id: uuidv4(),
            line: b.loc.line,
            column: b.loc.column,
            severity: "ERROR",
            code: "IEC_CASE_MISMATCH",
            message: `Valor de CASE '${valType}' incompatível com seletor '${selType}'.`,
          });
        }
      }
      for (const s of b.statements) this.checkStatement(s);
    }
    for (const s of stmt.elseStatements) this.checkStatement(s);
  }

  private checkFor(stmt: ForStatement): void {
    const varSym = this.symbols.get(stmt.variable.toLowerCase());
    if (!varSym) {
      this.diagnostics.push({
        id: uuidv4(),
        line: stmt.loc.line,
        column: stmt.loc.column,
        severity: "ERROR",
        code: "IEC_SYM_UNDECLARED",
        message: `Variável de controle do loop FOR '${stmt.variable}' não foi declarada.`,
      });
    } else if (!this.isIntegerType(varSym.dataType)) {
      this.diagnostics.push({
        id: uuidv4(),
        line: stmt.loc.line,
        column: stmt.loc.column,
        severity: "ERROR",
        code: "IEC_FOR_NOT_INT",
        message: `Variável do loop FOR '${stmt.variable}' deve ser de tipo inteiro (encontrado '${varSym.dataType}').`,
      });
    }

    for (const s of stmt.statements) this.checkStatement(s);
  }

  private checkWhile(stmt: WhileStatement): void {
    const condType = this.resolveExpressionType(stmt.condition);
    if (condType && condType !== "BOOL") {
      this.diagnostics.push({
        id: uuidv4(),
        line: stmt.loc.line,
        column: stmt.loc.column,
        severity: "ERROR",
        code: "IEC_COND_NOT_BOOL",
        message: `Condição de WHILE deve ser do tipo BOOL (encontrado '${condType}').`,
      });
    }
    for (const s of stmt.statements) this.checkStatement(s);
  }

  private checkRepeat(stmt: RepeatStatement): void {
    const condType = this.resolveExpressionType(stmt.untilCondition);
    if (condType && condType !== "BOOL") {
      this.diagnostics.push({
        id: uuidv4(),
        line: stmt.loc.line,
        column: stmt.loc.column,
        severity: "ERROR",
        code: "IEC_COND_NOT_BOOL",
        message: `Condição UNTIL no loop REPEAT deve ser do tipo BOOL (encontrado '${condType}').`,
      });
    }
    for (const s of stmt.statements) this.checkStatement(s);
  }

  // --------------------------------------------------------------------------
  // Resolução de Tipos de Expressões
  // --------------------------------------------------------------------------
  public resolveExpressionType(expr: Expression): string | null {
    switch (expr.type) {
      case "LITERAL_EXPR":
        return expr.literalType;

      case "IDENTIFIER_EXPR": {
        const lower = expr.name.toLowerCase();
        const local = this.symbols.get(lower);
        if (local) return local.dataType;
        const ext = this.externalSymbols.get(lower);
        if (ext) return ext.toUpperCase();

        // Se for constante literal booleana em maiúsculo
        if (lower === "true" || lower === "false") return "BOOL";

        this.diagnostics.push({
          id: uuidv4(),
          line: expr.loc.line,
          column: expr.loc.column,
          severity: "ERROR",
          code: "IEC_SYM_UNDECLARED",
          message: `Identificador não declarado: '${expr.name}'.`,
        });
        return null;
      }

      case "BINARY_EXPR": {
        const leftType = this.resolveExpressionType(expr.left);
        const rightType = this.resolveExpressionType(expr.right);
        if (!leftType || !rightType) return null;

        // Comparações retornam BOOL
        if (["=", "<>", "<", "<=", ">", ">="].includes(expr.operator)) {
          return "BOOL";
        }

        // Operadores Lógicos
        if (["AND", "OR", "XOR"].includes(expr.operator)) {
          return "BOOL";
        }

        // Operações Matemáticas
        if (["+", "-", "*", "/", "MOD"].includes(expr.operator)) {
          if (leftType === "REAL" || rightType === "REAL") return "REAL";
          return leftType;
        }

        return leftType;
      }

      case "UNARY_EXPR": {
        const opType = this.resolveExpressionType(expr.operand);
        if (expr.operator === "NOT") return "BOOL";
        return opType;
      }

      case "FUNCTION_CALL_EXPR": {
        // Funções padrão IEC
        const func = expr.callee.toUpperCase();
        if (["ABS", "SQRT", "LN", "LOG", "EXP", "SIN", "COS", "TAN"].includes(func)) {
          return "REAL";
        }
        if (["LEN"].includes(func)) {
          return "INT";
        }
        return "ANY";
      }

      case "ARRAY_ACCESS_EXPR":
        return "ANY";

      case "MEMBER_ACCESS_EXPR":
        return "ANY";

      default:
        return null;
    }
  }

  private isTypeCompatible(target: string, value: string): boolean {
    if (target === value) return true;
    if (target === "REAL" && this.isIntegerType(value)) return true; // Promoção implícita int -> real
    if (target === "DINT" && (value === "INT" || value === "SINT")) return true;
    if (target === "ANY" || value === "ANY") return true;
    return false;
  }

  private isIntegerType(type: string): boolean {
    return ["SINT", "INT", "DINT", "LINT", "USINT", "UINT", "UDINT", "ULINT", "BYTE", "WORD", "DWORD"].includes(type);
  }
}
