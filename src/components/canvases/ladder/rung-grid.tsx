import { useEffect, useRef, useState } from "react";
import type { LadderRung, LadderCell } from "@/lib/ladder/types";
import { newRung, emptyCell, RUNG_COLS } from "@/lib/ladder/types";
import { compileProgram } from "@/lib/ladder/compiler";
import { scanRungs } from "@/lib/ladder/runtime";
import { useEditorStore } from "@/lib/editor/store";
import { LadderCellView } from "./ladder-cell";
import { Button } from "@/components/ui/button";
import { Plus, Play, Square, Code2, Rows3, X } from "lucide-react";

export function RungGrid() {
  const [rungs, setRungs] = useState<LadderRung[]>([newRung(0)]);
  const [running, setRunning] = useState(false);
  const [showIL, setShowIL] = useState(false);
  const [scanState, setScanState] = useState<Record<string, boolean[][]>>({});
  const intervalRef = useRef<number | null>(null);
  const selected = useEditorStore((s) => s.selectedNodeId);
  const select = useEditorStore((s) => s.setSelectedNode);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    const tick = () => {
      const results = scanRungs(rungs);
      setScanState(Object.fromEntries(results.map((r) => [r.rungId, r.perCell])));
      setRungs((rs) =>
        rs.map((r) => {
          const found = results.find((x) => x.rungId === r.id);
          return found ? { ...r, poweredOut: found.poweredOut } : r;
        }),
      );
    };
    tick();
    intervalRef.current = window.setInterval(tick, 100);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, rungs.length]);

  const updateCell = (rungId: string, row: number, col: number, next: LadderCell) => {
    setRungs((rs) =>
      rs.map((r) =>
        r.id === rungId
          ? {
              ...r,
              cells: r.cells.map((rw, i) =>
                i === row ? rw.map((c, j) => (j === col ? next : c)) : rw,
              ),
            }
          : r,
      ),
    );
  };

  const addBranch = (rungId: string) => {
    setRungs((rs) =>
      rs.map((r) =>
        r.id === rungId
          ? { ...r, cells: [...r.cells, Array.from({ length: RUNG_COLS }, emptyCell)] }
          : r,
      ),
    );
  };

  const removeRung = (rungId: string) => {
    setRungs((rs) => rs.filter((r) => r.id !== rungId));
  };

  const il = compileProgram(rungs);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
        <Button size="sm" variant="outline" onClick={() => setRungs((r) => [...r, newRung(r.length)])}>
          <Plus className="mr-1 h-3 w-3" /> Rung
        </Button>
        <Button
          size="sm"
          variant={running ? "destructive" : "default"}
          onClick={() => setRunning((v) => !v)}
        >
          {running ? <Square className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}
          {running ? "Parar scan" : "Simular"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowIL((v) => !v)}>
          <Code2 className="mr-1 h-3 w-3" /> {showIL ? "Ocultar IL" : "Compilar"}
        </Button>
        <div className="ml-auto text-[10px] font-mono text-muted-foreground">
          {rungs.length} rungs · scan 100ms · {running ? "RUN" : "STOP"}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto industrial-grid scan-overlay p-6">
          <div className="mx-auto max-w-5xl space-y-3">
            {rungs.map((rung, idx) => {
              const cellState = scanState[rung.id] ?? [];
              const isSel = selected === rung.id;
              return (
                <div
                  key={rung.id}
                  onClick={() => select(rung.id)}
                  className={`rounded-md border bg-card/60 backdrop-blur transition-colors ${
                    isSel ? "border-primary shadow-glow" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        R{String(idx + 1).padStart(3, "0")}
                      </span>
                      <span className="text-xs font-medium">{rung.label}</span>
                      {rung.poweredOut && (
                        <span className="rounded bg-success/20 px-1.5 py-0.5 font-mono text-[10px] text-success">
                          ENERGIZADO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addBranch(rung.id);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Adicionar branch (OR)"
                      >
                        <Rows3 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRung(rung.id);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-0 px-3 py-3">
                    <div className="w-1.5 self-stretch rounded-full bg-energized energized" />
                    <div className="flex-1 px-2">
                      {rung.cells.map((row, ri) => (
                        <div key={ri} className="flex items-center gap-1 py-1">
                          {row.map((cell, ci) => (
                            <div key={ci} className="flex items-center">
                              <span className="h-px w-2 bg-foreground/40" />
                              <LadderCellView
                                cell={cell}
                                isOutputCol={ci === row.length - 1}
                                energized={Boolean(cellState[ri]?.[ci])}
                                onChange={(n) => updateCell(rung.id, ri, ci, n)}
                              />
                              <span className="h-px w-2 bg-foreground/40" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="w-1.5 self-stretch rounded-full bg-energized energized" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showIL && (
          <aside className="w-80 shrink-0 border-l border-border bg-background/80 backdrop-blur">
            <div className="border-b border-border px-3 py-2 text-[11px] font-mono uppercase text-muted-foreground">
              IEC 61131-3 · IL
            </div>
            <pre className="overflow-auto p-3 text-[11px] font-mono leading-relaxed text-foreground">
{il}
            </pre>
          </aside>
        )}
      </div>
    </div>
  );
}
