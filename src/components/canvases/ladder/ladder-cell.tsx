import { useState, useCallback, useMemo } from "react";
import {
  type LadderCell,
  type LadderCellKind,
  CONTACT_KINDS,
  OUTPUT_KINDS,
  BLOCK_KINDS,
  isOutputKind,
  isContactKind,
  isBlockKind,
} from "@/lib/ladder/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { LADDER_ELEMENTS_BY_ID } from "@/lib/ladder/definitions";
import { useEditorStore } from "@/lib/editor/store";

const KIND_GLYPH: Record<string, string> = {
  EMPTY: "—",
  XIC: "┤ ├",
  XIO: "┤/├",
  R_TRIG: "┤P├",
  F_TRIG: "┤N├",
  OTE: "( )",
  OTL: "(S)",
  OTU: "(R)",
  NEG_COIL: "(/)",
  SR: "(SR)",
  RS: "(RS)",
  TON: "[TON]",
  TOF: "[TOF]",
  TP: "[TP]",
  TONR: "[TONR]",
  CTU: "[CTU]",
  CTD: "[CTD]",
  CTUD: "[CTUD]",
  CMP_EQ: "[ == ]",
  CMP_NE: "[ != ]",
  CMP_GT: "[ > ]",
  CMP_LT: "[ < ]",
  CMP_GE: "[ >= ]",
  CMP_LE: "[ <= ]",
  ADD: "[ + ]",
  SUB: "[ - ]",
  MUL: "[ * ]",
  DIV: "[ / ]",
  MOD: "[MOD]",
  ABS: "[ABS]",
  SQRT: "[SQRT]",
  MOVE: "[MOVE]",
  INT_TO_REAL: "[IR]",
  REAL_TO_INT: "[RI]",
  AND: "[ & ]",
  OR: "[ OR ]",
  XOR: "[=1]",
  NOT: "[NOT]",
};

const ELEMENT_TO_KIND: Record<string, LadderCellKind> = {
  XIC: "XIC",
  XIO: "XIO",
  R_TRIG: "R_TRIG",
  F_TRIG: "F_TRIG",
  OTE: "OTE",
  OTL: "OTL",
  OTU: "OTU",
  NEG_COIL: "NEG_COIL",
  SR: "SR",
  RS: "RS",
  TON: "TON",
  TOF: "TOF",
  TP: "TP",
  TONR: "TONR",
  CTU: "CTU",
  CTD: "CTD",
  CTUD: "CTUD",
  CMP_EQ: "CMP_EQ",
  CMP_NE: "CMP_NE",
  CMP_GT: "CMP_GT",
  CMP_LT: "CMP_LT",
  CMP_GE: "CMP_GE",
  CMP_LE: "CMP_LE",
  ADD: "ADD",
  SUB: "SUB",
  MUL: "MUL",
  DIV: "DIV",
  MOD: "MOD",
  ABS: "ABS",
  SQRT: "SQRT",
  MOVE: "MOVE",
  INT_TO_REAL: "INT_TO_REAL",
  REAL_TO_INT: "REAL_TO_INT",
  AND: "AND",
  OR: "OR",
  XOR: "XOR",
  NOT: "NOT",
};

interface Props {
  cell: LadderCell;
  rungId: string;
  isOutputCol: boolean;
  energized: boolean;
  diagnostic?: { kind: string; value: number; preset: number; done: boolean; text?: string };
  onChange: (next: LadderCell) => void;
  onDelete?: () => void;
}

const IEC_OPERAND_RE = /^%(I|Q|M)(W|D)?(\d+)(\.(\d+))?$/i;
const TAG_NAME_RE = /^[A-Za-z_][\w_]*$/;

function validateOperand(operand: string, tags: Record<string, unknown>): string | null {
  if (!operand || operand === "&nbsp;") return null;
  if (IEC_OPERAND_RE.test(operand)) return null;
  if (TAG_NAME_RE.test(operand)) return null;
  if (operand in tags) return null;
  return "Formato inválido. Use %I0.0, %Q0.0, %MW0, ou nome de tag.";
}

export function LadderCellView({
  cell,
  rungId,
  isOutputCol,
  energized,
  diagnostic,
  onChange,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const editorTags = useEditorStore((s) => s.editorTags);
  const setSelectedTarget = useEditorStore((s) => s.setSelectedLadderTarget);
  const selectedTarget = useEditorStore((s) => s.selectedLadderTarget);

  const isSelected =
    selectedTarget?.rungId === rungId && Boolean(cell.id) && selectedTarget?.elementId === cell.id;

  const tagNames = useMemo(
    () =>
      Object.values(editorTags)
        .map((t) => t.name)
        .filter(Boolean),
    [editorTags],
  );

  const datalistId = useMemo(
    () => `ladder-tags-${rungId}-${isOutputCol ? "out" : "in"}`,
    [rungId, isOutputCol],
  );

  const operandError = useMemo(() => {
    if (cell.kind === "EMPTY" || !cell.operand) return null;
    const tagMap = Object.fromEntries(Object.entries(editorTags).map(([, t]) => [t.name, true]));
    return validateOperand(cell.operand, tagMap);
  }, [cell.operand, cell.kind, editorTags]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/ladder-element")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/ladder-element");
      if (!raw) return;
      const el = LADDER_ELEMENTS_BY_ID[raw];
      if (!el) return;
      const kind = ELEMENT_TO_KIND[el.id] || (el.id as LadderCellKind);

      const isOut = isOutputKind(kind);
      if (isOutputCol && !isOut) {
        toast.warning(
          `Posição inválida: A coluna de terminação aceita apenas bobinas e instruções de saída (ex.: OTE, OTL, OUT). O elemento "${el.label}" (${kind}) deve ser posicionado na zona de contatos.`,
        );
        return;
      }
      if (!isOutputCol && isOut) {
        toast.warning(
          `Posição inválida: Bobinas e instruções de saída ("${el.label}" - ${kind}) devem ser posicionadas na coluna de saída da rede.`,
        );
        return;
      }

      const preset =
        kind === "TON" || kind === "TOF" || kind === "TP" || kind === "TONR"
          ? 1000
          : kind === "CTU" || kind === "CTD" || kind === "CTUD"
            ? 10
            : undefined;

      const nextCell: LadderCell = {
        kind,
        operand: cell.operand || (isOutputCol ? "%Q0.0" : "%I0.0"),
        preset,
        params: el.params
          ? Object.fromEntries(Object.entries(el.params).map(([k, p]) => [k, p.defaultValue]))
          : {},
      };

      onChange(nextCell);
      setSelectedTarget({
        rungId,
        elementId: nextCell.id,
        kind: nextCell.kind,
        operand: nextCell.operand,
        preset: nextCell.preset,
        params: nextCell.params,
        isOutput: isOutputCol,
      });
      setOpen(false);
      toast.success(`Instrução ${kind} inserida com sucesso.`);
    },
    [cell.operand, isOutputCol, onChange, rungId, setSelectedTarget],
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTarget({
      rungId,
      elementId: cell.id,
      kind: cell.kind,
      operand: cell.operand,
      preset: cell.preset,
      params: cell.params,
      isOutput: isOutputCol,
    });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClick(e);
    setOpen(true);
  };

  const handlePopoverOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setOpen(false);
  };

  const isTimerBlock = ["TON", "TOF", "TP", "TONR"].includes(cell.kind);
  const isCmpBlock =
    cell.kind.startsWith("CMP_") || ["GT", "LT", "GE", "LE", "EQ", "NE"].includes(cell.kind);
  const isMathBlock = ["ADD", "SUB", "MUL", "DIV", "MOD", "ABS", "SQRT"].includes(cell.kind);

  // RENDERIZAÇÃO DE BLOCO FUNCIONAL (TON, TOF, TP, TONR) - IDÊNTICO À IMAGEM 1
  if (isTimerBlock && cell.kind !== "EMPTY") {
    const elapsedText = diagnostic?.text || "00:00:00 / 10s";
    return (
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          <div
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            title="Clique para selecionar · Duplo clique para editar"
            className={`flex flex-col min-w-[200px] rounded border transition-all cursor-pointer select-none bg-card/95 shadow-md ${
              isSelected
                ? "border-primary ring-1 ring-primary shadow-glow"
                : energized
                  ? "border-emerald-500/80 bg-emerald-950/20"
                  : "border-border/80 hover:border-primary/60"
            }`}
          >
            {/* Cabeçalho do Bloco Funcional */}
            <div className="bg-primary/10 border-b border-primary/20 px-2.5 py-1 flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-primary">
                {cell.operand || "TON_01"} ({cell.kind})
              </span>
              <span className="text-[9px] font-mono text-muted-foreground">FB</span>
            </div>

            {/* Pinos e Conexões */}
            <div className="p-2 space-y-1.5 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">IN</span>
                <span
                  className={`font-bold ${energized ? "text-emerald-400" : "text-muted-foreground"}`}
                >
                  Q
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">PT: T#{cell.preset ?? 1000}ms</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold border border-emerald-500/30">
                  {elapsedText}
                </span>
              </div>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2 p-3" align="center">
          <div className="text-xs font-semibold text-foreground">Configurar {cell.kind}</div>
          <div>
            <label className="text-[10px] text-muted-foreground">Tag do Temporizador</label>
            <Input
              value={cell.operand}
              onChange={(e) => onChange({ ...cell, operand: e.target.value })}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Preset Time (PT - ms)</label>
            <Input
              type="number"
              value={cell.preset ?? 1000}
              onChange={(e) => onChange({ ...cell, preset: Number(e.target.value) })}
              className="h-7 text-xs font-mono"
            />
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20"
            >
              Excluir instrução
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // RENDERIZAÇÃO DE BLOCO COMPARADOR (>=, ==, etc.) - IDÊNTICO À IMAGEM 1
  if (isCmpBlock && cell.kind !== "EMPTY") {
    const in1 = String(cell.params?.IN1 ?? cell.operand ?? "VALOR");
    const in2 = String(cell.params?.IN2 ?? "LIMITE");
    const opSym =
      cell.kind === "CMP_GE"
        ? ">="
        : cell.kind === "CMP_LE"
          ? "<="
          : cell.kind === "CMP_GT"
            ? ">"
            : cell.kind === "CMP_LT"
              ? "<"
              : cell.kind === "CMP_NE"
                ? "<>"
                : "==";

    return (
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          <div
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            title="Clique para selecionar · Duplo clique para editar"
            className={`flex flex-col min-w-[150px] rounded border transition-all cursor-pointer select-none bg-card/95 shadow-md ${
              isSelected
                ? "border-primary ring-1 ring-primary shadow-glow"
                : energized
                  ? "border-emerald-500/80 bg-emerald-950/20"
                  : "border-border/80 hover:border-primary/60"
            }`}
          >
            <div className="bg-primary/10 border-b border-primary/20 px-2 py-0.5 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-primary">
                {cell.operand || "COMP_01"} ({opSym})
              </span>
            </div>
            <div className="p-2 text-[10px] font-mono space-y-1">
              <div className="text-muted-foreground truncate">{in1}</div>
              <div className="text-muted-foreground truncate">{in2}</div>
              <div className="text-right font-bold text-primary">{opSym}</div>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2 p-3" align="center">
          <div className="text-xs font-semibold">Configurar Comparador</div>
          <div>
            <label className="text-[10px] text-muted-foreground">Entrada A</label>
            <Input
              value={in1}
              onChange={(e) =>
                onChange({
                  ...cell,
                  operand: e.target.value,
                  params: { ...(cell.params ?? {}), IN1: e.target.value },
                })
              }
              className="h-7 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Entrada B</label>
            <Input
              value={in2}
              onChange={(e) =>
                onChange({
                  ...cell,
                  params: { ...(cell.params ?? {}), IN2: e.target.value },
                })
              }
              className="h-7 text-xs font-mono"
            />
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20"
            >
              Excluir instrução
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // RENDERIZAÇÃO PADRÃO DE CONTATO OU BOBINA INDUSTRIAL (COM TAG ACIMA DO GLIFO)
  return (
    <Popover open={open} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <div
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          title="Clique para selecionar · Duplo clique para editar"
          className={`group relative flex flex-col items-center justify-center min-w-[76px] h-14 px-2 rounded border transition-all cursor-pointer select-none ${
            isSelected
              ? "border-primary bg-primary/10 ring-1 ring-primary shadow-glow"
              : energized
                ? "border-emerald-500/80 bg-emerald-950/20 text-emerald-400"
                : cell.kind === "EMPTY"
                  ? "border-dashed border-border/40 text-muted-foreground/40 hover:border-primary/50 hover:bg-muted/10"
                  : "border-border/80 bg-card/60 text-foreground hover:border-primary/70 hover:bg-card"
          }`}
        >
          {/* Nome da Tag / Operando no topo */}
          {cell.kind !== "EMPTY" && (
            <span
              className={`font-mono text-[10px] font-semibold truncate max-w-[80px] mb-0.5 ${
                energized ? "text-emerald-400" : "text-foreground/90"
              }`}
            >
              {cell.operand || "—"}
            </span>
          )}

          {/* Glifo Simbólico Industrial (ex.: -[ ]-, -[/]-, -( )-) */}
          <span
            className={`font-mono text-sm tracking-wider font-bold ${
              energized
                ? "text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                : "text-primary/90"
            }`}
          >
            {KIND_GLYPH[cell.kind] ?? cell.kind}
          </span>
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-60 space-y-3 p-3" align="center">
        <div className="space-y-1">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Instrução</div>
          <div className="grid grid-cols-3 gap-1">
            <button
              className={`rounded border px-2 py-1 text-[11px] ${
                cell.kind === "EMPTY"
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground"
              }`}
              onClick={() => onChange({ ...cell, kind: "EMPTY", operand: "" })}
            >
              Vazio
            </button>
            {(isOutputCol ? OUTPUT_KINDS : CONTACT_KINDS).slice(0, 5).map((k) => (
              <button
                key={k}
                className={`rounded border px-2 py-1 text-[11px] font-mono ${
                  cell.kind === k ? "border-primary text-primary font-bold" : "border-border"
                }`}
                onClick={() => onChange({ ...cell, kind: k })}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {cell.kind !== "EMPTY" && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">
              Tag / Operando
            </div>
            <Input
              autoFocus
              value={cell.operand}
              placeholder={isOutputCol ? "%Q0.0" : "%I0.0"}
              onChange={(e) => onChange({ ...cell, operand: e.target.value })}
              className={`h-8 font-mono text-xs ${
                operandError ? "border-destructive focus-visible:ring-destructive" : ""
              }`}
              list={datalistId}
            />
            {operandError && <p className="text-[10px] text-destructive mt-1">{operandError}</p>}
            <datalist id={datalistId}>
              {tagNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="w-full mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20"
              >
                Excluir instrução
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
