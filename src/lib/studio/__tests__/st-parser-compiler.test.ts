import { describe, it, expect } from "vitest";
import { StLexer } from "../iec/parser/st-lexer";
import { StParser } from "../iec/parser/st-parser";
import { StSemanticAnalyzer } from "../iec/parser/st-semantic";
import { IECCompilerPipeline } from "../iec/compiler/compiler-pipeline";
import { IndustrialProjectService } from "../canonical/project-service";

describe("IEC 61131-3 Structured Text (ST) Lexer & Parser", () => {
  it("should correctly tokenize Structured Text code including comments and keywords", () => {
    const code = `
      (* Tank Level Control Algorithm *)
      PROGRAM LevelControl
      VAR
          rTankLevel : REAL := 50.0; // Level in percentage
          bPumpRun : BOOL := FALSE;
      END_VAR
      IF rTankLevel < 20.0 THEN
          bPumpRun := TRUE;
      ELSE
          bPumpRun := FALSE;
      END_IF;
      END_PROGRAM
    `;

    const lexer = new StLexer(code);
    const tokens = lexer.tokenize();

    expect(tokens.length).toBeGreaterThan(15);
    const identifiers = tokens.filter((t) => t.type === "IDENTIFIER").map((t) => t.value);
    expect(identifiers).toContain("LevelControl");
    expect(identifiers).toContain("rTankLevel");
    expect(identifiers).toContain("bPumpRun");

    const keywords = tokens.filter((t) => t.type === "KEYWORD").map((t) => t.value);
    expect(keywords).toContain("PROGRAM");
    expect(keywords).toContain("VAR");
    expect(keywords).toContain("END_VAR");
    expect(keywords).toContain("IF");
    expect(keywords).toContain("THEN");
    expect(keywords).toContain("ELSE");
    expect(keywords).toContain("END_IF");
    expect(keywords).toContain("END_PROGRAM");
  });

  it("should parse AST with variable blocks and conditional statements", () => {
    const code = `
      PROGRAM PrgTest
      VAR
          x : INT := 10;
          y : INT;
      END_VAR
      IF x > 5 THEN
          y := x * 2;
      ELSIF x = 5 THEN
          y := 5;
      ELSE
          y := 0;
      END_IF;
      END_PROGRAM
    `;

    const parser = new StParser(code);
    const { ast, diagnostics } = parser.parse();

    expect(diagnostics).toHaveLength(0);
    expect(ast).toBeDefined();
    if (!ast) return;

    expect(ast.name).toBe("PrgTest");
    expect(ast.pouType).toBe("PROGRAM");
    expect(ast.varBlocks.length).toBe(1);
    expect(ast.varBlocks[0].declarations.length).toBe(2);
    expect(ast.varBlocks[0].declarations[0].name).toBe("x");
    expect(ast.varBlocks[0].declarations[1].name).toBe("y");

    expect(ast.body.length).toBe(1);
    const ifStmt = ast.body[0];
    expect(ifStmt.type).toBe("IF_STMT");
    if (ifStmt.type === "IF_STMT") {
      expect(ifStmt.thenStatements.length).toBe(1);
      expect(ifStmt.elsifClauses.length).toBe(1);
      expect(ifStmt.elseStatements?.length).toBe(1);
    }
  });

  it("should parse iteration loops: FOR, WHILE, and REPEAT", () => {
    const code = `
      PROGRAM LoopTest
      VAR
          i : INT;
          total : INT := 0;
      END_VAR
      FOR i := 1 TO 10 BY 1 DO
          total := total + i;
      END_FOR;
      WHILE total > 0 DO
          total := total - 1;
      END_WHILE;
      REPEAT
          total := total + 2;
      UNTIL total >= 10
      END_REPEAT;
      END_PROGRAM
    `;

    const parser = new StParser(code);
    const { ast, diagnostics } = parser.parse();
    expect(diagnostics).toHaveLength(0);
    expect(ast).toBeDefined();
    if (!ast) return;

    expect(ast.body.length).toBe(3);
    expect(ast.body[0].type).toBe("FOR_STMT");
    expect(ast.body[1].type).toBe("WHILE_STMT");
    expect(ast.body[2].type).toBe("REPEAT_STMT");
  });
});

describe("IEC 61131-3 Semantic Analyzer & Type Safety", () => {
  it("should detect undeclared variables and report compiler diagnostics", () => {
    const code = `
      PROGRAM BadScope
      VAR
          a : INT := 1;
      END_VAR
      a := undeclaredVar + 10;
      END_PROGRAM
    `;

    const parser = new StParser(code);
    const { ast } = parser.parse();
    expect(ast).toBeDefined();
    if (!ast) return;

    const analyzer = new StSemanticAnalyzer(ast);
    const diagnostics = analyzer.analyze();

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe("ERROR");
    expect(diagnostics[0].message).toContain("undeclaredVar");
  });

  it("should prevent assignment to CONSTANT variables", () => {
    const code = `
      PROGRAM ConstTest
      VAR CONSTANT
          MAX_PRESSURE : REAL := 150.0;
      END_VAR
      MAX_PRESSURE := 200.0;
      END_PROGRAM
    `;

    const parser = new StParser(code);
    const { ast } = parser.parse();
    expect(ast).toBeDefined();
    if (!ast) return;

    const analyzer = new StSemanticAnalyzer(ast);
    const diagnostics = analyzer.analyze();

    const constDiag = diagnostics.find((d) => d.message.includes("constant"));
    expect(constDiag).toBeDefined();
  });
});

describe("IEC Compiler Pipeline & IR Bytecode Generation", () => {
  it("should compile a canonical project into executable intermediate representation (IR)", () => {
    const project = IndustrialProjectService.createSampleIndustrialProject(
      "tenant-test",
      "Test Project",
    );
    const result = IECCompilerPipeline.compile(project);

    expect(result.success).toBe(true);
    expect(result.compiledIR).toBeDefined();
    if (result.compiledIR) {
      expect(Object.keys(result.compiledIR.blocks).length).toBeGreaterThan(0);

      // Verify PRG_LevelControl produced IR instructions
      const stPou = project.pous.find((p) => p.name === "PRG_LevelControl");
      expect(stPou).toBeDefined();
      if (stPou) {
        const block = result.compiledIR.blocks[stPou.name];
        expect(block).toBeDefined();
        expect(block.instructions.length).toBeGreaterThan(0);

        // Should have LOAD_VAR, STORE_VAR, JUMP instructions
        const opcodes = block.instructions.map((i) => i.op);
        expect(opcodes).toContain("LOAD_VAR");
        expect(opcodes).toContain("STORE_VAR");
      }
    }
  });
});
