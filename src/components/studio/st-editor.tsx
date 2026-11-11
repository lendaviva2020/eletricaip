import React, { useState, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useStudioStore } from "../../lib/studio/studio-store";
import { StParser } from "../../lib/studio/iec/parser/st-parser";
import { StSemanticAnalyzer } from "../../lib/studio/iec/parser/st-semantic";
import type { CompilerDiagnostic } from "../../lib/studio/canonical/types";
import {
  Play,
  CheckCircle,
  WarningCircle,
  Code,
  BracketsCurly,
  ArrowClockwise,
} from "@phosphor-icons/react";

interface StEditorProps {
  pouId: string;
}

export const StEditor: React.FC<StEditorProps> = ({ pouId }) => {
  const { project, updatePouSourceST, compileProject, isCompiling, compilationResult } =
    useStudioStore();

  const currentPou = project.pous.find((p) => p.id === pouId);
  const [sourceCode, setSourceCode] = useState<string>(
    currentPou?.rawSourceST ||
      `PROGRAM ${currentPou?.name || "MainProgram"}
VAR
    rTankLevel : REAL := 50.0;
    bPumpCommand : BOOL := FALSE;
END_VAR

(* Lógica de Controle *)
IF rTankLevel < 30.0 THEN
    bPumpCommand := TRUE;
ELSIF rTankLevel >= 80.0 THEN
    bPumpCommand := FALSE;
END_IF;

END_PROGRAM`,
  );

  const [localDiagnostics, setLocalDiagnostics] = useState<CompilerDiagnostic[]>([]);
  const [monacoEditor, setMonacoEditor] = useState<any>(null);

  useEffect(() => {
    if (currentPou && currentPou.rawSourceST !== undefined) {
      setSourceCode(currentPou.rawSourceST);
    }
  }, [currentPou]);

  const handleEditorChange = (value?: string) => {
    const newCode = value || "";
    setSourceCode(newCode);
    updatePouSourceST(pouId, newCode);

    // Verificação semântica em tempo real no browser
    try {
      const parser = new StParser(newCode);
      const parseRes = parser.parse();
      if (parseRes.diagnostics.length > 0) {
        setLocalDiagnostics(
          parseRes.diagnostics.map((d) => ({
            id: `diag-${d.line}-${d.column}`,
            severity: d.severity,
            code: "SYNTAX_ERROR",
            message: d.message,
            line: d.line,
            column: d.column,
            pouId,
          })),
        );
      } else if (parseRes.ast) {
        const analyzer = new StSemanticAnalyzer(parseRes.ast);
        const diags = analyzer.analyze();
        setLocalDiagnostics(diags);
      } else {
        setLocalDiagnostics([]);
      }
    } catch (err: any) {
      setLocalDiagnostics([
        {
          id: "diag-err",
          severity: "ERROR",
          code: "PARSE_EXCEPTION",
          message: err?.message || "Erro de análise sintática",
          line: 1,
          column: 1,
          pouId,
        },
      ]);
    }
  };

  const handleCompile = () => {
    compileProject();
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setMonacoEditor(editor);

    // Registra suporte à sintaxe IEC Structured Text se não existir
    if (!monaco.languages.getLanguages().some((lang) => lang.id === "iecst")) {
      monaco.languages.register({ id: "iecst" });
      monaco.languages.setMonarchTokensProvider("iecst", {
        keywords: [
          "PROGRAM",
          "END_PROGRAM",
          "FUNCTION",
          "END_FUNCTION",
          "FUNCTION_BLOCK",
          "END_FUNCTION_BLOCK",
          "VAR",
          "VAR_INPUT",
          "VAR_OUTPUT",
          "VAR_IN_OUT",
          "VAR_GLOBAL",
          "VAR_TEMP",
          "VAR_CONSTANT",
          "CONSTANT",
          "RETAIN",
          "END_VAR",
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
          "RETURN",
          "EXIT",
          "TRUE",
          "FALSE",
          "AND",
          "OR",
          "XOR",
          "NOT",
          "MOD",
        ],
        typeKeywords: [
          "BOOL",
          "BYTE",
          "WORD",
          "DWORD",
          "LWORD",
          "SINT",
          "INT",
          "DINT",
          "LINT",
          "USINT",
          "UINT",
          "UDINT",
          "ULINT",
          "REAL",
          "LREAL",
          "TIME",
          "DATE",
          "TOD",
          "DT",
          "STRING",
          "WSTRING",
        ],
        tokenizer: {
          root: [
            [
              /[a-zA-Z_]\w*/,
              {
                cases: {
                  "@keywords": "keyword",
                  "@typeKeywords": "type",
                  "@default": "identifier",
                },
              },
            ],
            [/\(\*[\s\S]*?\*\)/, "comment"],
            [/\/\/.*$/, "comment"],
            [/[0-9]+(\.[0-9]+)?/, "number"],
            [/T#[0-9]+(ms|s|m|h)/i, "number.date"],
            [/"([^"\\]|\\.)*"/, "string"],
            [/'([^'\\]|\\.)*'/, "string"],
          ],
        },
      });
    }
  };

  const errorCount = localDiagnostics.filter((d) => d.severity === "ERROR").length;
  const warningCount = localDiagnostics.filter((d) => d.severity === "WARNING").length;

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-zinc-200">
      {/* Barra de Ferramentas do Editor ST */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#121215]">
        <div className="flex items-center gap-3">
          <Code className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm tracking-wide text-zinc-100">
            {currentPou?.name || "POU_ST"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            IEC 61131-3 ST
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            {errorCount === 0 && warningCount === 0 ? (
              <span className="flex items-center gap-1 text-emerald-400 font-mono">
                <CheckCircle className="w-4 h-4" /> Sintaxe Válida
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-mono">
                <WarningCircle className="w-4 h-4" />
                {errorCount} erros, {warningCount} avisos
              </span>
            )}
          </div>

          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
          >
            {isCompiling ? (
              <ArrowClockwise className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" weight="fill" />
            )}
            Compilar POU
          </button>
        </div>
      </div>

      {/* Editor Monaco */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language="iecst"
          theme="vs-dark"
          value={sourceCode}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            fontFamily: "JetBrains Mono, Menlo, monospace",
            fontSize: 13,
            lineNumbers: "on",
            minimap: { enabled: true, scale: 0.75 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* Painel Inferior de Diagnósticos Semânticos */}
      {localDiagnostics.length > 0 && (
        <div className="h-32 border-t border-zinc-800 bg-[#141417] p-2 flex flex-col font-mono text-xs overflow-y-auto">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-zinc-800 text-zinc-400 font-sans">
            <span>Diagnósticos de Compilação & Verificação de Tipos</span>
            <span>{localDiagnostics.length} mensagens</span>
          </div>
          <div className="space-y-1">
            {localDiagnostics.map((d, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 p-1 rounded ${
                  d.severity === "ERROR"
                    ? "bg-rose-950/40 text-rose-300 border border-rose-900/50"
                    : "bg-amber-950/40 text-amber-300 border border-amber-900/50"
                }`}
              >
                <span className="font-bold uppercase tracking-wider text-[10px] px-1 py-0.5 rounded bg-black/40">
                  {d.severity}
                </span>
                <span className="text-zinc-400">
                  [L{d.line}:{d.column}]
                </span>
                <span className="flex-1">{d.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
