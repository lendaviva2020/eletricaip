import { useState } from "react";
import {
  type LadderCell,
  type LadderCellKind,
  CONTACT_KINDS,
  OUTPUT_KINDS,
  isOutputKind,
} from "@/lib/ladder/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

const KIND_GLYPH: Record<LadderCellKind, string> = {
  EMPTY: "—",
  XIC: "┤ ├",
  XIO: "┤/├",
  OTE: "( )",
  OTL: "(S)",
  OTU: "(R)",
  TON: "[TON]",
  CTU: "[CTU]",
};

interface Props {
  cell: LadderCell;
  isOutputCol: boolean;
  energized: boolean;
  onChange: (next: LadderCell) => void;
}

export function LadderCellView({ cell, isOutputCol, energized, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const allowed = isOutputCol ? OUTPUT_KINDS : CONTACT_KINDS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex h-16 w-24 flex-col items-center justify-center gap-1 rounded border text-[11px] font-mono transition-colors ${
            energized
              ? "border-success bg-success/10 text-success"
              : cell.kind === "EMPTY"
                ? "border-dashed border-border/50 text-muted-foreground hover:border-primary/50"
                : "border-border bg-card text-foreground hover:border-primary"
          }`}
        >
          <span className="text-sm">{KIND_GLYPH[cell.kind]}</span>
          {cell.operand && <span className="truncate max-w-[88px]">{cell.operand}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3" align="center">
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">Tipo</div>
          <div className="grid grid-cols-3 gap-1">
            <button
              className={`rounded border px-2 py-1 text-[11px] ${
                cell.kind === "EMPTY" ? "border-primary text-primary" : "border-border"
              }`}
              onClick={() => onChange({ ...cell, kind: "EMPTY", operand: "" })}
            >
              vazio
            </button>
            {allowed.map((k) => (
              <button
                key={k}
                className={`rounded border px-2 py-1 text-[11px] font-mono ${
                  cell.kind === k ? "border-primary text-primary" : "border-border"
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
            <div className="text-[10px] uppercase text-muted-foreground">Operando</div>
            <Input
              autoFocus
              value={cell.operand}
              placeholder={isOutputCol ? "%Q0.0" : "%I0.0"}
              onChange={(e) => onChange({ ...cell, operand: e.target.value })}
              className="h-8 font-mono text-xs"
            />
          </div>
        )}

        {cell.kind === "TON" || cell.kind === "CTU" ? (
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground">
              {cell.kind === "TON" ? "Preset (ms)" : "Preset (count)"}
            </div>
            <Input
              type="number"
              value={cell.preset ?? ""}
              onChange={(e) => onChange({ ...cell, preset: Number(e.target.value) })}
              className="h-8 font-mono text-xs"
            />
          </div>
        ) : null}

        {isOutputCol && cell.kind !== "EMPTY" && !isOutputKind(cell.kind) && (
          <div className="text-[10px] text-destructive">
            A coluna de saída exige uma bobina/timer.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
