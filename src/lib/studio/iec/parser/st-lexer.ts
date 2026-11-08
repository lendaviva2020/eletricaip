// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — IEC 61131-3 STRUCTURED TEXT (ST) LEXER
// Deterministic tokenization with full line and column source tracking
// ============================================================================

export type TokenType =
  | "KEYWORD"
  | "IDENTIFIER"
  | "INT_LITERAL"
  | "REAL_LITERAL"
  | "TIME_LITERAL"
  | "STRING_LITERAL"
  | "BOOL_LITERAL"
  | "OPERATOR"
  | "PUNCTUATION"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  raw: string;
}

const ST_KEYWORDS = new Set([
  "PROGRAM",
  "END_PROGRAM",
  "FUNCTION_BLOCK",
  "END_FUNCTION_BLOCK",
  "FUNCTION",
  "END_FUNCTION",
  "VAR",
  "VAR_INPUT",
  "VAR_OUTPUT",
  "VAR_IN_OUT",
  "VAR_GLOBAL",
  "VAR_TEMP",
  "VAR_STAT",
  "VAR_EXTERNAL",
  "END_VAR",
  "CONSTANT",
  "RETAIN",
  "IF",
  "THEN",
  "ELSIF",
  "ELSE",
  "END_IF",
  "CASE",
  "OF",
  "END_CASE",
  "FOR",
  "TO",
  "BY",
  "DO",
  "END_FOR",
  "WHILE",
  "END_WHILE",
  "REPEAT",
  "UNTIL",
  "END_REPEAT",
  "EXIT",
  "RETURN",
  "AND",
  "OR",
  "XOR",
  "NOT",
  "MOD",
  "TRUE",
  "FALSE",
  "TYPE",
  "END_TYPE",
  "STRUCT",
  "END_STRUCT",
  "ARRAY",
]);

export class StLexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private length = 0;

  constructor(private readonly source: string) {
    this.length = source.length;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.length) {
      const char = this.source[this.pos];

      // Ignora espaços e controla linha/coluna
      if (char === " " || char === "\t" || char === "\r") {
        this.advance();
        continue;
      }

      if (char === "\n") {
        this.line++;
        this.col = 1;
        this.pos++;
        continue;
      }

      // Comentário de bloco (* ... *)
      if (char === "(" && this.peek() === "*") {
        this.skipBlockComment();
        continue;
      }

      // Comentário de linha // ...
      if (char === "/" && this.peek() === "/") {
        this.skipLineComment();
        continue;
      }

      // Strings literais '...'
      if (char === "'") {
        tokens.push(this.readStringLiteral());
        continue;
      }

      // Time literal T#500ms, TIME#1s
      if ((char === "T" || char === "t") && (this.peek() === "#" || this.source.slice(this.pos, this.pos + 5).toUpperCase() === "TIME#")) {
        tokens.push(this.readTimeLiteral());
        continue;
      }

      // Números (Inteiros ou Reais)
      if (this.isDigit(char)) {
        tokens.push(this.readNumber());
        continue;
      }

      // Identificadores e Palavras-chave
      if (this.isAlpha(char) || char === "_") {
        tokens.push(this.readIdentifierOrKeyword());
        continue;
      }

      // Operadores de múltiplos caracteres
      const twoChar = this.source.slice(this.pos, this.pos + 2);
      if (twoChar === ":=" || twoChar === "<=" || twoChar === ">=" || twoChar === "<>" || twoChar === "..") {
        const token: Token = {
          type: twoChar === ":=" ? "OPERATOR" : twoChar === ".." ? "PUNCTUATION" : "OPERATOR",
          value: twoChar,
          line: this.line,
          column: this.col,
          raw: twoChar,
        };
        this.advance();
        this.advance();
        tokens.push(token);
        continue;
      }

      // Pontuações e Operadores de caractere único
      if ("=<>+-*/".includes(char)) {
        tokens.push({
          type: "OPERATOR",
          value: char,
          line: this.line,
          column: this.col,
          raw: char,
        });
        this.advance();
        continue;
      }

      if ("();,:[].^".includes(char)) {
        tokens.push({
          type: "PUNCTUATION",
          value: char,
          line: this.line,
          column: this.col,
          raw: char,
        });
        this.advance();
        continue;
      }

      // Caractere inesperado
      this.advance();
    }

    tokens.push({
      type: "EOF",
      value: "",
      line: this.line,
      column: this.col,
      raw: "",
    });

    return tokens;
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.col++;
    return char;
  }

  private peek(offset = 1): string {
    return this.pos + offset < this.length ? this.source[this.pos + offset] : "";
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
  }

  private skipBlockComment(): void {
    this.advance(); // (
    this.advance(); // *
    while (this.pos < this.length) {
      if (this.source[this.pos] === "*" && this.peek() === ")") {
        this.advance();
        this.advance();
        return;
      }
      if (this.source[this.pos] === "\n") {
        this.line++;
        this.col = 1;
        this.pos++;
      } else {
        this.advance();
      }
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.length && this.source[this.pos] !== "\n") {
      this.advance();
    }
  }

  private readStringLiteral(): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // ' inicial
    let val = "";
    while (this.pos < this.length && this.source[this.pos] !== "'") {
      val += this.advance();
    }
    if (this.pos < this.length) {
      this.advance(); // ' final
    }
    return {
      type: "STRING_LITERAL",
      value: val,
      line: startLine,
      column: startCol,
      raw: `'${val}'`,
    };
  }

  private readTimeLiteral(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let val = "";
    while (this.pos < this.length && !";,\n\r\t ()".includes(this.source[this.pos])) {
      val += this.advance();
    }
    return {
      type: "TIME_LITERAL",
      value: val,
      line: startLine,
      column: startCol,
      raw: val,
    };
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let val = "";
    let isReal = false;
    while (this.pos < this.length && (this.isDigit(this.source[this.pos]) || this.source[this.pos] === ".")) {
      if (this.source[this.pos] === ".") {
        if (this.peek() === ".") {
          // caso de subrange '..'
          break;
        }
        isReal = true;
      }
      val += this.advance();
    }
    return {
      type: isReal ? "REAL_LITERAL" : "INT_LITERAL",
      value: val,
      line: startLine,
      column: startCol,
      raw: val,
    };
  }

  private readIdentifierOrKeyword(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let val = "";
    while (this.pos < this.length && (this.isAlpha(this.source[this.pos]) || this.isDigit(this.source[this.pos]) || this.source[this.pos] === "_" || this.source[this.pos] === "%")) {
      val += this.advance();
    }
    const upper = val.toUpperCase();
    if (upper === "TRUE" || upper === "FALSE") {
      return {
        type: "BOOL_LITERAL",
        value: upper,
        line: startLine,
        column: startCol,
        raw: val,
      };
    }
    if (ST_KEYWORDS.has(upper)) {
      return {
        type: "KEYWORD",
        value: upper,
        line: startLine,
        column: startCol,
        raw: val,
      };
    }
    return {
      type: "IDENTIFIER",
      value: val,
      line: startLine,
      column: startCol,
      raw: val,
    };
  }
}
