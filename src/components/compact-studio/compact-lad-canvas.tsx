/**
 * Multipage Ladder (LAD) Projection Editor over the single canonical CompactProgramModel.
 * Clean-Room IEC 61131-3 rungs: left rail, NO/NC/edge contacts, parallel branches,
 * boxed Function Blocks (EN/ENO), coils, explicit NON_REPRESENTABLE warnings,
 * and keyboard accessibility.
 */
import React, { useMemo, useState } from "react";
import { Plus, Warning, Cube, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import type { CompactRuntimeFrame } from "@/lib/compact-studio/runtime";
import {
  convertLadRungsToCanonical,
  projectModelToLadNetworks,
  type LadElement,
  type LadRung,
} from "@/lib/compact-studio/conversion";

export interface CompactLadCanvasProps {
  readonly model: CompactProgramModel;
  readonly activePageId: string;
  readonly liveFrame?: CompactRuntimeFrame | null;
  readonly onChangeModel: (next: CompactProgramModel, label: string) => void;
  readonly onSelectNode?: (nodeId: string | null) => void;
}

export function CompactLadCanvas({
  model,
  activePageId,
  liveFrame,
  onChangeModel,
  onSelectNode,
}: CompactLadCanvasProps) {
  const [wrapNonRep, setWrapNonRep] = useState(true);
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null);

  const projection = useMemo(
    () => projectModelToLadNetworks(model, { wrapNonRepresentableAsBox: wrapNonRep }),
    [model, wrapNonRep],
  );

  const pageRungs = useMemo(
    () => projection.rungs.filter((r) => r.pageId === activePageId),
    [projection.rungs, activePageId],
  );

  const isEnergized = (el: LadElement): boolean => {
    if (!liveFrame) return false;
    const raw =
      liveFrame.variables[el.label] ??
      liveFrame.outputs[el.nodeId]?.OUT ??
      liveFrame.outputs[el.nodeId]?.Q ??
      liveFrame.outputs[el.nodeId]?.out;
    const b = Boolean(raw);
    return el.kind === "contact_nc" ? !b : b;
  };

  const handleAddRung = () => {
    const idx = pageRungs.length + 1;
    const newRung: LadRung = {
      id: `rung_new_${Date.now()}`,
      pageId: activePageId,
      rungIndex: idx,
      title: `Linha ${idx}`,
      branches: [
        {
          id: `br_${Date.now()}`,
          elements: [
            {
              id: `el_i_${Date.now()}`,
              nodeId: "",
              kind: "contact_no",
              label: `I${idx}`,
              blockType: "INPUT_DI",
              negated: false,
              params: { address: `I${idx}` },
            },
          ],
        },
      ],
      coils: [
        {
          id: `el_q_${Date.now()}`,
          nodeId: "",
          kind: "coil",
          label: `Q${idx}`,
          blockType: "OUTPUT_QO",
          negated: false,
          params: { address: `Q${idx}` },
        },
      ],
    };
    const nextModel = convertLadRungsToCanonical(model, activePageId, [...pageRungs, newRung]);
    onChangeModel(nextModel, "Adicionar Rung Ladder");
  };

  const handleToggleContactNegation = (rungId: string, branchId: string, elId: string) => {
    const nextRungs = pageRungs.map((r) => {
      if (r.id !== rungId) return r;
      return {
        ...r,
        branches: r.branches.map((br) => {
          if (br.id !== branchId) return br;
          return {
            ...br,
            elements: br.elements.map((el) => {
              if (el.id !== elId || (el.kind !== "contact_no" && el.kind !== "contact_nc")) {
                return el;
              }
              return {
                ...el,
                kind: (el.kind === "contact_no"
                  ? "contact_nc"
                  : "contact_no") as LadElement["kind"],
                negated: !el.negated,
              };
            }),
          };
        }),
      };
    });
    const nextModel = convertLadRungsToCanonical(model, activePageId, nextRungs);
    onChangeModel(nextModel, "Alternar contato NA/NF no Ladder");
  };

  const handleDeleteRung = (rungId: string) => {
    const remaining = pageRungs.filter((r) => r.id !== rungId);
    const nextModel = convertLadRungsToCanonical(model, activePageId, remaining);
    onChangeModel(nextModel, "Remover Rung Ladder");
    if (selectedRungId === rungId) setSelectedRungId(null);
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden"
      data-testid="compact-lad-canvas"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/80">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" onClick={handleAddRung} className="h-7 text-xs gap-1">
            <Plus className="h-3.5 w-3.5" />
            Nova Linha (Rung)
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {pageRungs.length} {pageRungs.length === 1 ? "linha" : "linhas"} · Projeção canônica FBD
            ↔ LAD
          </span>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={wrapNonRep}
            onChange={(e) => setWrapNonRep(e.target.checked)}
            className="rounded border-border"
          />
          <Cube className="h-3.5 w-3.5 text-primary" />
          Encapsular blocos não representáveis como Box EN/ENO
        </label>
      </div>

      {projection.issues.length > 0 && (
        <div
          className="px-3 py-2 border-b border-amber-500/30 bg-amber-500/10 text-xs flex flex-col gap-1"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-1.5 font-medium text-amber-400">
            <Warning className="h-4 w-4 shrink-0" />
            <span>
              {projection.issues.length} ocorrência(s) de projeção Ladder (nenhuma lógica foi
              removida silenciosamente)
            </span>
          </div>
          <ul className="pl-5 list-disc text-[11px] text-amber-200/90 space-y-0.5 max-h-20 overflow-auto">
            {projection.issues.slice(0, 5).map((issue, idx) => (
              <li key={`${issue.nodeId}_${idx}`}>
                <span className="font-mono font-semibold">[{issue.code}]</span> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-3" role="list" aria-label="Redes Ladder">
        {pageRungs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-2 border border-dashed border-border rounded-lg p-8">
            <p>Nenhuma linha Ladder nesta página ainda.</p>
            <Button size="sm" variant="outline" onClick={handleAddRung}>
              Criar primeira linha Ladder
            </Button>
          </div>
        ) : (
          pageRungs.map((rung) => {
            const isSelected = selectedRungId === rung.id;
            return (
              <div
                key={rung.id}
                role="listitem"
                tabIndex={0}
                onClick={() => setSelectedRungId(rung.id)}
                onKeyDown={(e) => {
                  if (e.key === "Delete" && isSelected) handleDeleteRung(rung.id);
                }}
                className={`rounded-md border p-3 transition-colors outline-none focus:ring-2 focus:ring-primary/60 ${
                  isSelected ? "border-primary bg-card" : "border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="font-mono font-semibold text-muted-foreground">
                    NW {String(rung.rungIndex).padStart(3, "0")} — {rung.title}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRung(rung.id);
                    }}
                    title="Excluir linha"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-0 overflow-x-auto py-1 font-mono text-xs">
                  {/* Left power rail */}
                  <div className="w-1 self-stretch bg-emerald-500/80 rounded-full mr-2 shrink-0" />

                  <div className="flex flex-col gap-2 flex-1">
                    {rung.branches.map((br) => (
                      <div key={br.id} className="flex items-center">
                        <div className="h-0.5 w-4 bg-border" />
                        {br.elements.length === 0 ? (
                          <div className="h-0.5 flex-1 bg-emerald-500/50 min-w-[60px]" />
                        ) : (
                          br.elements.map((el) => {
                            const active = isEnergized(el);
                            return (
                              <React.Fragment key={el.id}>
                                {el.kind === "box_fb" ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (el.nodeId) onSelectNode?.(el.nodeId);
                                    }}
                                    className={`px-2.5 py-1.5 rounded border text-left transition-colors ${
                                      active
                                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                                        : "border-primary/50 bg-primary/10 text-foreground"
                                    }`}
                                    title={el.nonRepresentableReason ?? el.blockType}
                                  >
                                    <div className="text-[10px] text-muted-foreground">
                                      {el.blockType}
                                    </div>
                                    <div className="font-semibold">{el.label}</div>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (el.nodeId) onSelectNode?.(el.nodeId);
                                      handleToggleContactNegation(rung.id, br.id, el.id);
                                    }}
                                    className={`px-2 py-1 rounded border flex flex-col items-center min-w-[74px] transition-colors ${
                                      active
                                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                                        : "border-border bg-background hover:border-primary/60"
                                    }`}
                                    title="Clique para alternar NA/NF"
                                  >
                                    <span className="text-[10px] text-muted-foreground">
                                      {el.label}
                                    </span>
                                    <span className="font-bold tracking-wider">
                                      {el.kind === "contact_nc"
                                        ? "—|/|—"
                                        : el.kind === "rising_contact"
                                          ? "—|P|—"
                                          : "—| |—"}
                                    </span>
                                  </button>
                                )}
                                <div
                                  className={`h-0.5 w-6 ${active ? "bg-emerald-500" : "bg-border"}`}
                                />
                              </React.Fragment>
                            );
                          })
                        )}
                        <div className="h-0.5 flex-1 bg-border min-w-[20px]" />
                      </div>
                    ))}
                  </div>

                  {/* Coils on right power rail */}
                  <div className="flex flex-col gap-1.5 ml-2 shrink-0">
                    {rung.coils.map((coil) => {
                      const active = isEnergized(coil);
                      return (
                        <button
                          key={coil.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (coil.nodeId) onSelectNode?.(coil.nodeId);
                          }}
                          className={`px-2.5 py-1 rounded border flex flex-col items-center min-w-[82px] ${
                            active
                              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                              : "border-border bg-background hover:border-primary/60"
                          }`}
                        >
                          <span className="text-[10px] text-muted-foreground">{coil.label}</span>
                          <span className="font-bold">
                            {coil.kind === "set_coil"
                              ? "—(S)—"
                              : coil.kind === "reset_coil"
                                ? "—(R)—"
                                : coil.kind === "box_fb"
                                  ? `[${coil.blockType}]`
                                  : "—( )—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
