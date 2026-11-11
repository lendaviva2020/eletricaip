// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — IEC 61131-3 STRUCTURED TEXT (ST) PARSER
// Recursive descent parser producing typed AST and precise line/col diagnostics
// ============================================================================

import { StLexer, type Token } from "./st-lexer";
import type {
  POUDeclaration,
  VarBlock,
  VarDeclaration,
  Statement,
  Expression,
  BinaryExpression,
  UnaryExpression,
  IdentifierExpression,
  LiteralExpression,
  FunctionCallExpression,
  ArrayAccessExpression,
  MemberAccessExpression,
  AssignmentStatement,
  IfStatement,
  ElsifClause,
  CaseStatement,
  CaseBranch,
  ForStatement,
  WhileStatement,
  RepeatStatement,
  InvocationStatement,
  SourceLocation,
} from "./st-ast";

export interface ParserDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface ParseResult {
  ast: POUDeclaration | null;
  diagnostics: ParserDiagnostic[];
}

export class StParser {
  private tokens: Token[] = [];
  private current = 0;
  private diagnostics: ParserDiagnostic[] = [];

  constructor(source: string) {
    const lexer = new StLexer(source);
    this.tokens = lexer.tokenize();
  }

  public parse(): ParseResult {
    try {
      const ast = this.parsePOU();
      return {
        ast,
        diagnostics: this.diagnostics,
      };
    } catch (err: any) {
      this.diagnostics.push({
        line: this.peek().line,
        column: this.peek().column,
        message: err.message || "Erro sintático no código Structured Text",
        severity: "ERROR",
      });
      return {
        ast: null,
        diagnostics: this.diagnostics,
      };
    }
  }

  private parsePOU(): POUDeclaration {
    const startTok = this.peek();
    let pouType: "PROGRAM" | "FUNCTION_BLOCK" | "FUNCTION" = "PROGRAM";

    if (this.matchKeyword("PROGRAM")) {
      pouType = "PROGRAM";
    } else if (this.matchKeyword("FUNCTION_BLOCK")) {
      pouType = "FUNCTION_BLOCK";
    } else if (this.matchKeyword("FUNCTION")) {
      pouType = "FUNCTION";
    } else {
      // Se não começar explicitamente com PROGRAM/FUNCTION_BLOCK/FUNCTION, assume PROGRAM anônimo
      pouType = "PROGRAM";
    }

    let name = "POU_Main";
    if (this.peek().type === "IDENTIFIER") {
      name = this.advance().value;
    }

    let returnType: string | undefined;
    if (pouType === "FUNCTION") {
      if (this.matchPunctuation(":")) {
        returnType = this.consumeIdentifier("Tipo de retorno esperado para FUNCTION");
      }
    }

    const varBlocks: VarBlock[] = [];
    while (this.isVarBlockStart()) {
      varBlocks.push(this.parseVarBlock());
    }

    const body: Statement[] = [];
    while (!this.isAtEnd() && !this.isPOUEndKeyword(pouType)) {
      const stmt = this.parseStatement();
      if (stmt) {
        body.push(stmt);
      }
    }

    // Consome END_PROGRAM / END_FUNCTION_BLOCK / END_FUNCTION se existir
    if (!this.isAtEnd()) {
      this.advance();
    }

    return {
      type: "POU_DECLARATION",
      pouType,
      name,
      returnType,
      varBlocks,
      body,
      loc: { line: startTok.line, column: startTok.column },
    };
  }

  private isVarBlockStart(): boolean {
    const tok = this.peek();
    if (tok.type !== "KEYWORD") return false;
    return (
      tok.value === "VAR" ||
      tok.value === "VAR_INPUT" ||
      tok.value === "VAR_OUTPUT" ||
      tok.value === "VAR_IN_OUT" ||
      tok.value === "VAR_GLOBAL" ||
      tok.value === "VAR_TEMP" ||
      tok.value === "VAR_STAT"
    );
  }

  private parseVarBlock(): VarBlock {
    const startTok = this.advance();
    const scope = startTok.value;
    let isRetain = false;
    let isConstant = false;

    while (
      this.peek().type === "KEYWORD" &&
      (this.peek().value === "RETAIN" || this.peek().value === "CONSTANT")
    ) {
      const kw = this.advance().value;
      if (kw === "RETAIN") isRetain = true;
      if (kw === "CONSTANT") isConstant = true;
    }

    const declarations: VarDeclaration[] = [];
    while (!this.isAtEnd() && !this.checkKeyword("END_VAR")) {
      const decl = this.parseVarDeclaration();
      if (decl) {
        declarations.push(decl);
      }
    }

    this.consumeKeyword("END_VAR", "Esperado 'END_VAR'");

    return {
      type: "VAR_BLOCK",
      scope,
      isRetain,
      isConstant,
      declarations,
      loc: { line: startTok.line, column: startTok.column },
    };
  }

  private parseVarDeclaration(): VarDeclaration | null {
    if (this.peek().type !== "IDENTIFIER") {
      this.advance();
      return null;
    }

    const nameTok = this.advance();
    const name = nameTok.value;
    let address: string | undefined;

    if (this.checkKeyword("AT")) {
      this.advance();
      if (this.peek().type === "IDENTIFIER" && this.peek().value.startsWith("%")) {
        address = this.advance().value;
      }
    }

    this.consumePunctuation(":", "Esperado ':' após nome da variável");
    const dataType = this.consumeIdentifier("Esperado tipo de dados para variável");

    let initialValue: Expression | undefined;
    if (this.matchOperator(":=")) {
      initialValue = this.parseExpression();
    }

    this.consumePunctuation(";", "Esperado ';' após declaração de variável");

    return {
      type: "VAR_DECLARATION",
      name,
      dataType,
      address,
      initialValue,
      loc: { line: nameTok.line, column: nameTok.column },
    };
  }

  private parseStatement(): Statement | null {
    if (this.isAtEnd()) return null;

    if (this.matchKeyword("IF")) return this.parseIfStatement();
    if (this.matchKeyword("CASE")) return this.parseCaseStatement();
    if (this.matchKeyword("FOR")) return this.parseForStatement();
    if (this.matchKeyword("WHILE")) return this.parseWhileStatement();
    if (this.matchKeyword("REPEAT")) return this.parseRepeatStatement();
    if (this.matchKeyword("RETURN")) {
      const loc = this.previousLoc();
      this.consumePunctuation(";", "Esperado ';' após RETURN");
      return { type: "RETURN_STMT", loc };
    }
    if (this.matchKeyword("EXIT")) {
      const loc = this.previousLoc();
      this.consumePunctuation(";", "Esperado ';' após EXIT");
      return { type: "EXIT_STMT", loc };
    }

    // Atribuição ou Invocação
    const expr = this.parsePrimary();
    if (this.matchOperator(":=")) {
      const val = this.parseExpression();
      this.consumePunctuation(";", "Esperado ';' ao final da atribuição");
      return {
        type: "ASSIGNMENT_STMT",
        target: expr,
        value: val,
        loc: expr.loc,
      };
    }

    // Chamada de função ou bloco solta
    if (expr.type === "FUNCTION_CALL_EXPR") {
      this.consumePunctuation(";", "Esperado ';' ao final da chamada");
      return {
        type: "INVOCATION_STMT",
        callee: expr.callee,
        arguments: expr.arguments.map((a) => ({ value: a })),
        loc: expr.loc,
      };
    }

    // Pula token para evitar loop infinito
    this.advance();
    return null;
  }

  private parseIfStatement(): IfStatement {
    const loc = this.previousLoc();
    const condition = this.parseExpression();
    this.consumeKeyword("THEN", "Esperado 'THEN' após condição IF");

    const thenStatements: Statement[] = [];
    const elsifClauses: ElsifClause[] = [];
    const elseStatements: Statement[] = [];

    while (
      !this.isAtEnd() &&
      !this.checkKeyword("ELSIF") &&
      !this.checkKeyword("ELSE") &&
      !this.checkKeyword("END_IF")
    ) {
      const s = this.parseStatement();
      if (s) thenStatements.push(s);
    }

    while (this.matchKeyword("ELSIF")) {
      const elsifLoc = this.previousLoc();
      const elsifCond = this.parseExpression();
      this.consumeKeyword("THEN", "Esperado 'THEN' após condição ELSIF");
      const stmts: Statement[] = [];
      while (
        !this.isAtEnd() &&
        !this.checkKeyword("ELSIF") &&
        !this.checkKeyword("ELSE") &&
        !this.checkKeyword("END_IF")
      ) {
        const s = this.parseStatement();
        if (s) stmts.push(s);
      }
      elsifClauses.push({ condition: elsifCond, statements: stmts, loc: elsifLoc });
    }

    if (this.matchKeyword("ELSE")) {
      while (!this.isAtEnd() && !this.checkKeyword("END_IF")) {
        const s = this.parseStatement();
        if (s) elseStatements.push(s);
      }
    }

    this.consumeKeyword("END_IF", "Esperado 'END_IF'");
    this.consumePunctuation(";", "Esperado ';' após 'END_IF'");

    return {
      type: "IF_STMT",
      condition,
      thenStatements,
      elsifClauses,
      elseStatements,
      loc,
    };
  }

  private parseCaseStatement(): CaseStatement {
    const loc = this.previousLoc();
    const selector = this.parseExpression();
    this.consumeKeyword("OF", "Esperado 'OF' após seletor CASE");

    const branches: CaseBranch[] = [];
    const elseStatements: Statement[] = [];

    while (!this.isAtEnd() && !this.checkKeyword("ELSE") && !this.checkKeyword("END_CASE")) {
      const branchLoc = this.peekLoc();
      const matchValues: Expression[] = [this.parseExpression()];
      while (this.matchPunctuation(",")) {
        matchValues.push(this.parseExpression());
      }
      this.consumePunctuation(":", "Esperado ':' após valores de CASE");
      const stmts: Statement[] = [];
      while (
        !this.isAtEnd() &&
        !this.checkKeyword("ELSE") &&
        !this.checkKeyword("END_CASE") &&
        this.peek().type !== "INT_LITERAL" &&
        this.peek().type !== "IDENTIFIER"
      ) {
        const s = this.parseStatement();
        if (s) stmts.push(s);
      }
      branches.push({ matchValues, statements: stmts, loc: branchLoc });
    }

    if (this.matchKeyword("ELSE")) {
      while (!this.isAtEnd() && !this.checkKeyword("END_CASE")) {
        const s = this.parseStatement();
        if (s) elseStatements.push(s);
      }
    }

    this.consumeKeyword("END_CASE", "Esperado 'END_CASE'");
    this.consumePunctuation(";", "Esperado ';' após 'END_CASE'");

    return {
      type: "CASE_STMT",
      selector,
      branches,
      elseStatements,
      loc,
    };
  }

  private parseForStatement(): ForStatement {
    const loc = this.previousLoc();
    const variable = this.consumeIdentifier("Esperado identificador de variável no loop FOR");
    this.consumeOperator(":=", "Esperado ':=' no loop FOR");
    const start = this.parseExpression();
    this.consumeKeyword("TO", "Esperado 'TO' no loop FOR");
    const end = this.parseExpression();

    let by: Expression | undefined;
    if (this.matchKeyword("BY")) {
      by = this.parseExpression();
    }

    this.consumeKeyword("DO", "Esperado 'DO' no loop FOR");
    const statements: Statement[] = [];
    while (!this.isAtEnd() && !this.checkKeyword("END_FOR")) {
      const s = this.parseStatement();
      if (s) statements.push(s);
    }
    this.consumeKeyword("END_FOR", "Esperado 'END_FOR'");
    this.consumePunctuation(";", "Esperado ';' após 'END_FOR'");

    return {
      type: "FOR_STMT",
      variable,
      start,
      end,
      by,
      statements,
      loc,
    };
  }

  private parseWhileStatement(): WhileStatement {
    const loc = this.previousLoc();
    const condition = this.parseExpression();
    this.consumeKeyword("DO", "Esperado 'DO' no loop WHILE");
    const statements: Statement[] = [];
    while (!this.isAtEnd() && !this.checkKeyword("END_WHILE")) {
      const s = this.parseStatement();
      if (s) statements.push(s);
    }
    this.consumeKeyword("END_WHILE", "Esperado 'END_WHILE'");
    this.consumePunctuation(";", "Esperado ';' após 'END_WHILE'");

    return {
      type: "WHILE_STMT",
      condition,
      statements,
      loc,
    };
  }

  private parseRepeatStatement(): RepeatStatement {
    const loc = this.previousLoc();
    const statements: Statement[] = [];
    while (!this.isAtEnd() && !this.checkKeyword("UNTIL")) {
      const s = this.parseStatement();
      if (s) statements.push(s);
    }
    this.consumeKeyword("UNTIL", "Esperado 'UNTIL' no loop REPEAT");
    const untilCondition = this.parseExpression();
    this.consumeKeyword("END_REPEAT", "Esperado 'END_REPEAT'");
    this.consumePunctuation(";", "Esperado ';' após 'END_REPEAT'");

    return {
      type: "REPEAT_STMT",
      statements,
      untilCondition,
      loc,
    };
  }

  // --------------------------------------------------------------------------
  // Expressões com precedência de operadores
  // --------------------------------------------------------------------------
  public parseExpression(): Expression {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): Expression {
    let expr = this.parseLogicalXor();
    while (this.matchKeyword("OR")) {
      const loc = this.previousLoc();
      const right = this.parseLogicalXor();
      expr = { type: "BINARY_EXPR", operator: "OR", left: expr, right, loc };
    }
    return expr;
  }

  private parseLogicalXor(): Expression {
    let expr = this.parseLogicalAnd();
    while (this.matchKeyword("XOR")) {
      const loc = this.previousLoc();
      const right = this.parseLogicalAnd();
      expr = { type: "BINARY_EXPR", operator: "XOR", left: expr, right, loc };
    }
    return expr;
  }

  private parseLogicalAnd(): Expression {
    let expr = this.parseComparison();
    while (this.matchKeyword("AND") || this.matchOperator("&")) {
      const loc = this.previousLoc();
      const right = this.parseComparison();
      expr = { type: "BINARY_EXPR", operator: "AND", left: expr, right, loc };
    }
    return expr;
  }

  private parseComparison(): Expression {
    let expr = this.parseAdditive();
    while (
      this.matchOperator("=") ||
      this.matchOperator("<>") ||
      this.matchOperator("<") ||
      this.matchOperator("<=") ||
      this.matchOperator(">") ||
      this.matchOperator(">=")
    ) {
      const op = this.previous().value;
      const loc = this.previousLoc();
      const right = this.parseAdditive();
      expr = { type: "BINARY_EXPR", operator: op, left: expr, right, loc };
    }
    return expr;
  }

  private parseAdditive(): Expression {
    let expr = this.parseMultiplicative();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const op = this.previous().value;
      const loc = this.previousLoc();
      const right = this.parseMultiplicative();
      expr = { type: "BINARY_EXPR", operator: op, left: expr, right, loc };
    }
    return expr;
  }

  private parseMultiplicative(): Expression {
    let expr = this.parseUnary();
    while (this.matchOperator("*") || this.matchOperator("/") || this.matchKeyword("MOD")) {
      const op = this.previous().value;
      const loc = this.previousLoc();
      const right = this.parseUnary();
      expr = { type: "BINARY_EXPR", operator: op, left: expr, right, loc };
    }
    return expr;
  }

  private parseUnary(): Expression {
    if (this.matchKeyword("NOT") || this.matchOperator("-")) {
      const op = this.previous().value;
      const loc = this.previousLoc();
      const operand = this.parseUnary();
      return { type: "UNARY_EXPR", operator: op, operand, loc };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    const tok = this.peek();
    const loc: SourceLocation = { line: tok.line, column: tok.column };

    // Literais
    if (tok.type === "INT_LITERAL") {
      this.advance();
      return {
        type: "LITERAL_EXPR",
        literalType: "INT",
        value: parseInt(tok.value, 10),
        raw: tok.raw,
        loc,
      };
    }
    if (tok.type === "REAL_LITERAL") {
      this.advance();
      return {
        type: "LITERAL_EXPR",
        literalType: "REAL",
        value: parseFloat(tok.value),
        raw: tok.raw,
        loc,
      };
    }
    if (tok.type === "BOOL_LITERAL") {
      this.advance();
      return {
        type: "LITERAL_EXPR",
        literalType: "BOOL",
        value: tok.value === "TRUE",
        raw: tok.raw,
        loc,
      };
    }
    if (tok.type === "STRING_LITERAL") {
      this.advance();
      return { type: "LITERAL_EXPR", literalType: "STRING", value: tok.value, raw: tok.raw, loc };
    }
    if (tok.type === "TIME_LITERAL") {
      this.advance();
      return { type: "LITERAL_EXPR", literalType: "TIME", value: tok.value, raw: tok.raw, loc };
    }

    // Parênteses
    if (this.matchPunctuation("(")) {
      const expr = this.parseExpression();
      this.consumePunctuation(")", "Esperado ')'");
      return expr;
    }

    // Identificador ou Chamada
    if (tok.type === "IDENTIFIER") {
      this.advance();
      let expr: Expression = { type: "IDENTIFIER_EXPR", name: tok.value, loc };

      // Pode ser chamada de função: IDENT(...)
      if (this.matchPunctuation("(")) {
        const args: Expression[] = [];
        if (!this.checkPunctuation(")")) {
          args.push(this.parseExpression());
          while (this.matchPunctuation(",")) {
            args.push(this.parseExpression());
          }
        }
        this.consumePunctuation(")", "Esperado ')' ao final dos argumentos");
        expr = { type: "FUNCTION_CALL_EXPR", callee: tok.value, arguments: args, loc };
      }

      // Membro (.field) ou Array ([index])
      while (this.checkPunctuation(".") || this.checkPunctuation("[")) {
        if (this.matchPunctuation(".")) {
          const member = this.consumeIdentifier("Esperado nome de campo após '.'");
          expr = { type: "MEMBER_ACCESS_EXPR", target: expr, member, loc };
        } else if (this.matchPunctuation("[")) {
          const index = this.parseExpression();
          this.consumePunctuation("]", "Esperado ']'");
          expr = { type: "ARRAY_ACCESS_EXPR", array: expr, index, loc };
        }
      }

      return expr;
    }

    throw new Error(`Token inesperado: '${tok.value}' na linha ${tok.line}, col ${tok.column}`);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  private matchKeyword(kw: string): boolean {
    if (this.checkKeyword(kw)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkKeyword(kw: string): boolean {
    if (this.isAtEnd()) return false;
    const tok = this.peek();
    return tok.type === "KEYWORD" && tok.value === kw;
  }

  private consumeKeyword(kw: string, errorMsg: string): Token {
    if (this.checkKeyword(kw)) return this.advance();
    throw new Error(`${errorMsg} (encontrado '${this.peek().value}' na linha ${this.peek().line})`);
  }

  private matchOperator(op: string): boolean {
    if (this.isAtEnd()) return false;
    const tok = this.peek();
    if (tok.type === "OPERATOR" && tok.value === op) {
      this.advance();
      return true;
    }
    return false;
  }

  private consumeOperator(op: string, errorMsg: string): Token {
    if (this.matchOperator(op)) return this.previous();
    throw new Error(`${errorMsg} (encontrado '${this.peek().value}' na linha ${this.peek().line})`);
  }

  private matchPunctuation(p: string): boolean {
    if (this.isAtEnd()) return false;
    const tok = this.peek();
    if (tok.type === "PUNCTUATION" && tok.value === p) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkPunctuation(p: string): boolean {
    if (this.isAtEnd()) return false;
    const tok = this.peek();
    return tok.type === "PUNCTUATION" && tok.value === p;
  }

  private consumePunctuation(p: string, errorMsg: string): Token {
    if (this.matchPunctuation(p)) return this.previous();
    throw new Error(`${errorMsg} (encontrado '${this.peek().value}' na linha ${this.peek().line})`);
  }

  private consumeIdentifier(errorMsg: string): string {
    const tok = this.peek();
    if (tok.type === "IDENTIFIER") {
      this.advance();
      return tok.value;
    }
    throw new Error(`${errorMsg} (encontrado '${tok.value}' na linha ${tok.line})`);
  }

  private isPOUEndKeyword(pouType: string): boolean {
    const tok = this.peek();
    if (tok.type !== "KEYWORD") return false;
    if (pouType === "PROGRAM") return tok.value === "END_PROGRAM";
    if (pouType === "FUNCTION_BLOCK") return tok.value === "END_FUNCTION_BLOCK";
    if (pouType === "FUNCTION") return tok.value === "END_FUNCTION";
    return false;
  }

  private peek(): Token {
    return this.tokens[this.current] || { type: "EOF", value: "", line: 1, column: 1, raw: "" };
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length || this.peek().type === "EOF";
  }

  private peekLoc(): SourceLocation {
    const tok = this.peek();
    return { line: tok.line, column: tok.column };
  }

  private previousLoc(): SourceLocation {
    const tok = this.previous();
    return { line: tok ? tok.line : 1, column: tok ? tok.column : 1 };
  }
}
