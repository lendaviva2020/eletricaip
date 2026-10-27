import { useState, useMemo } from "react";
import { Edit3, Search, Tag as TagIcon, Plus, Check } from "lucide-react";
import { useEditorStore, type EditorTagType } from "@/lib/editor/store";
import { ensureRungTopology, type LadderRung } from "@/lib/ladder/types";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function LadderPropertyPanel() {
  const selectedTarget = useEditorStore((s) => s.selectedLadderTarget);
  const setSelectedTarget = useEditorStore((s) => s.setSelectedLadderTarget);
  const rungs = useEditorStore((s) => s.rungs);
  const setRungs = useEditorStore((s) => s.setRungs);
  const editorTags = useEditorStore((s) => s.editorTags);
  const upsertTag = useEditorStore((s) => s.upsertTag);

  const [searchTag, setSearchTag] = useState("");

  const selectedRung = useMemo(() => {
    if (!selectedTarget) return null;
    return rungs.find((r) => r.id === selectedTarget.rungId) ?? null;
  }, [selectedTarget, rungs]);

  const tagList = useMemo(() => {
    const list = Object.values(editorTags);
    if (!searchTag.trim()) return list;
    const term = searchTag.toLowerCase();
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        (t.type && t.type.toLowerCase().includes(term)),
    );
  }, [editorTags, searchTag]);

  if (!selectedTarget || !selectedRung) {
    return (
      <div className="p-4 space-y-3 text-[12px] text-muted-foreground">
        <div className="font-semibold text-foreground flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-primary" />
          <span>PROPRIEDADES & TAGS</span>
        </div>
        <p className="text-xs">
          Selecione um contato, bobina, temporizador ou comparador no diagrama Ladder para editar seus parâmetros e vincular tags.
        </p>

        <div className="pt-4 border-t border-border/40">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80 block mb-2">
            Tags Rápidas do Projeto ({Object.keys(editorTags).length})
          </span>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {Object.values(editorTags).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-2 py-1 rounded bg-muted/30 border border-border/40 text-[11px] font-mono"
              >
                <span className="text-foreground">{t.name}</span>
                <span className="text-[10px] text-primary">{t.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const kind = selectedTarget.kind || "XIC";
  const op = selectedTarget.operand || "";
  const isTimer = ["TON", "TOF", "TP", "TONR"].includes(kind);
  const isCounter = ["CTU", "CTD", "CTUD"].includes(kind);
  const isCmp = kind.startsWith("CMP_") || ["GT", "LT", "GE", "LE", "EQ", "NE"].includes(kind);
  const isMath = ["ADD", "SUB", "MUL", "DIV", "MOD", "ABS", "SQRT"].includes(kind);

  const updateOperand = (newOp: string) => {
    setSelectedTarget({ ...selectedTarget, operand: newOp });

    setRungs((prevRungs) =>
      prevRungs.map((r) => {
        if (r.id !== selectedTarget.rungId) return r;
        const topology = ensureRungTopology(r);

        // Atualiza na saída se for saída
        if (selectedTarget.isOutput) {
          topology.outputs = topology.outputs.map((out) =>
            out.id === selectedTarget.elementId || out.operand === op
              ? { ...out, operand: newOp }
              : out,
          );
        } else {
          // Atualiza na raiz
          const updateBranch = (br: typeof topology.rootBranch) => {
            br.items.forEach((item) => {
              if (item.type === "instruction" && item.instruction) {
                if (
                  item.instruction.id === selectedTarget.elementId ||
                  item.instruction.operand === op
                ) {
                  item.instruction.operand = newOp;
                }
              } else if (item.type === "parallel" && item.branches) {
                item.branches.forEach(updateBranch);
              }
            });
          };
          updateBranch(topology.rootBranch);
        }

        // Também atualiza matriz de células para sincronia total
        const updatedCells = r.cells.map((row) =>
          row.map((c) =>
            c.operand === op || c.id === selectedTarget.elementId
              ? { ...c, operand: newOp }
              : c,
          ),
        );

        return { ...r, cells: updatedCells, topology };
      }),
    );
  };

  const updateParam = (key: string, val: string | number) => {
    const nextParams = { ...(selectedTarget.params ?? {}), [key]: val };
    setSelectedTarget({
      ...selectedTarget,
      params: nextParams,
      preset: key === "PT" || key === "PV" ? Number(val) : selectedTarget.preset,
    });

    setRungs((prevRungs) =>
      prevRungs.map((r) => {
        if (r.id !== selectedTarget.rungId) return r;
        const topology = ensureRungTopology(r);

        if (selectedTarget.isOutput) {
          topology.outputs = topology.outputs.map((out) =>
            out.id === selectedTarget.elementId
              ? {
                  ...out,
                  preset: key === "PT" || key === "PV" ? Number(val) : out.preset,
                  params: { ...(out.params ?? {}), [key]: val },
                }
              : out,
          );
        } else {
          const updateBranch = (br: typeof topology.rootBranch) => {
            br.items.forEach((item) => {
              if (item.type === "instruction" && item.instruction) {
                if (item.instruction.id === selectedTarget.elementId) {
                  item.instruction.params = { ...(item.instruction.params ?? {}), [key]: val };
                  if (key === "PT" || key === "PV") item.instruction.preset = Number(val);
                }
              } else if (item.type === "parallel" && item.branches) {
                item.branches.forEach(updateBranch);
              }
            });
          };
          updateBranch(topology.rootBranch);
        }

        const updatedCells = r.cells.map((row) =>
          row.map((c) =>
            c.id === selectedTarget.elementId || c.operand === op
              ? {
                  ...c,
                  preset: key === "PT" || key === "PV" ? Number(val) : c.preset,
                  params: { ...(c.params ?? {}), [key]: val },
                }
              : c,
          ),
        );

        return { ...r, cells: updatedCells, topology };
      }),
    );
  };

  return (
    <div className="p-4 space-y-4 text-[12px]">
      {/* Header com Nome e Tipo */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm text-foreground">
            {op || selectedTarget.elementId || "Instrução"}
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            [{kind}]
          </span>
        </div>
        <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Formulário Contextual */}
      <div className="space-y-3 bg-muted/20 p-2.5 rounded-md border border-border/40">
        <div>
          <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
            Tag / Operando:
          </label>
          <Input
            value={op}
            onChange={(e) => updateOperand(e.target.value)}
            placeholder="Nome da Tag (ex.: B_PARTIDA)"
            className="h-7 text-xs font-mono bg-background"
          />
        </div>

        {isTimer && (
          <div>
            <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
              PT (Preset Time - ms):
            </label>
            <Input
              type="number"
              value={Number(selectedTarget.params?.PT ?? selectedTarget.preset ?? 1000)}
              onChange={(e) => updateParam("PT", Number(e.target.value))}
              placeholder="1000"
              className="h-7 text-xs font-mono bg-background"
            />
          </div>
        )}

        {isCounter && (
          <div>
            <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
              PV (Preset Value):
            </label>
            <Input
              type="number"
              value={Number(selectedTarget.params?.PV ?? selectedTarget.preset ?? 10)}
              onChange={(e) => updateParam("PV", Number(e.target.value))}
              placeholder="10"
              className="h-7 text-xs font-mono bg-background"
            />
          </div>
        )}

        {isCmp && (
          <>
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Entrada A (IN1):
              </label>
              <Input
                value={String(selectedTarget.params?.IN1 ?? selectedTarget.operand ?? "")}
                onChange={(e) => updateParam("IN1", e.target.value)}
                placeholder="Ex.: NIVEL_AGUA"
                className="h-7 text-xs font-mono bg-background"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Entrada B (IN2):
              </label>
              <Input
                value={String(selectedTarget.params?.IN2 ?? "")}
                onChange={(e) => updateParam("IN2", e.target.value)}
                placeholder="Ex.: NIVEL_CRITICO ou 1450"
                className="h-7 text-xs font-mono bg-background"
              />
            </div>
          </>
        )}

        {isMath && (
          <>
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Operando 1 (IN1):
              </label>
              <Input
                value={String(selectedTarget.params?.IN1 ?? "")}
                onChange={(e) => updateParam("IN1", e.target.value)}
                placeholder="Ex.: VALOR_1"
                className="h-7 text-xs font-mono bg-background"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Operando 2 (IN2):
              </label>
              <Input
                value={String(selectedTarget.params?.IN2 ?? "")}
                onChange={(e) => updateParam("IN2", e.target.value)}
                placeholder="Ex.: VALOR_2"
                className="h-7 text-xs font-mono bg-background"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Destino (OUT):
              </label>
              <Input
                value={String(selectedTarget.params?.OUT ?? selectedTarget.operand ?? "")}
                onChange={(e) => updateParam("OUT", e.target.value)}
                placeholder="Ex.: RESULTADO"
                className="h-7 text-xs font-mono bg-background"
              />
            </div>
          </>
        )}
      </div>

      {/* Pesquisa e Seleção Rápida de Tags */}
      <div className="space-y-2 pt-2 border-t border-border/40">
        <label className="text-[10px] uppercase font-semibold text-muted-foreground block">
          Pesquisa de Tags
        </label>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTag}
            onChange={(e) => setSearchTag(e.target.value)}
            placeholder="Filtrar tags do projeto..."
            className="h-7 pl-7 text-xs font-mono bg-background"
          />
        </div>

        <div className="max-h-56 overflow-y-auto space-y-1 scrollbar-thin pt-1">
          {tagList.map((t) => {
            const isBound = op === t.name;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => updateOperand(t.name)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors border ${
                  isBound
                    ? "bg-primary/10 border-primary text-primary font-medium"
                    : "bg-muted/30 border-transparent hover:border-border text-foreground hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px] truncate">
                  {isBound && <Check className="h-3 w-3 text-primary shrink-0" />}
                  <span className="truncate">{t.name}</span>
                </div>
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                  {t.type}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
