/**
 * Visual DIN-Rail Hardware Configurator for Compact Studio.
 * Authorial Clean-Room SVGs + interactive slot assembly, auto-addressing, and BOM view.
 */
import React, { useMemo } from "react";
import { Plus, Trash, WarningCircle, CheckCircle, Cpu } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import {
  addExpansionModule,
  evaluateRackEngineering,
  getCompactHardwareCatalog,
  removeHardwareSlot,
  selectBaseController,
} from "@/lib/compact-studio/hardware";

export interface HardwareConfiguratorProps {
  readonly model: CompactProgramModel;
  readonly onChangeModel: (next: CompactProgramModel, label: string) => void;
}

export function HardwareConfigurator({ model, onChangeModel }: HardwareConfiguratorProps) {
  const catalog = useMemo(() => getCompactHardwareCatalog(), []);
  const report = useMemo(() => evaluateRackEngineering(model), [model]);

  const baseModels = useMemo(
    () => catalog.items.filter((i) => i.family === "BASE_COMPACT"),
    [catalog],
  );
  const expansions = useMemo(
    () => catalog.items.filter((i) => i.family !== "BASE_COMPACT"),
    [catalog],
  );

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-auto p-4 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            Engenharia de Hardware &amp; Trilho DIN
          </h2>
          <p className="text-xs text-muted-foreground">
            Endereçamento automático: DI={report.totalDi}/{model.hardware.maxDigitalInputs} · DO=
            {report.totalDo}/{model.hardware.maxDigitalOutputs} · AI={report.totalAi}/
            {model.hardware.maxAnalogInputs} · AQ={report.totalAq}/{model.hardware.maxAnalogOutputs}
            {" · "}
            Blocos={model.nodes.length}/{model.hardware.maxBlocks}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="compact-base-cpu-select">
            Unidade Básica:
          </label>
          <select
            id="compact-base-cpu-select"
            value={model.hardware.baseCatalogId}
            onChange={(e) =>
              onChangeModel(
                selectBaseController(model, e.target.value),
                "Alterar CPU Compacta Base",
              )
            }
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            {baseModels.map((cpu) => (
              <option key={cpu.id} value={cpu.id}>
                {cpu.partCode} — {cpu.supplyVoltage}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Authorial Clean-Room DIN-Rail Rack SVG Diagram */}
      <div className="rounded-lg border border-border bg-card/60 p-4 overflow-x-auto">
        <div className="flex items-stretch gap-2 min-w-max">
          {model.hardware.slots.map((slot) => {
            const alloc = report.allocations.find((a) => a.slotIndex === slot.slotIndex);
            const isBase = slot.slotIndex === 0;
            return (
              <div
                key={`${slot.slotIndex}_${slot.catalogId}`}
                className={`rounded-md border p-2.5 flex flex-col justify-between min-w-[148px] ${
                  isBase ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      SLOT {slot.slotIndex}
                    </span>
                    <div className="text-xs font-semibold font-mono">{slot.partCode}</div>
                  </div>
                  {!isBase && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() =>
                        onChangeModel(
                          removeHardwareSlot(model, slot.slotIndex),
                          `Remover módulo slot ${slot.slotIndex}`,
                        )
                      }
                      title="Remover módulo"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Authorial SVG schematic module face */}
                <svg
                  viewBox="0 0 120 72"
                  className="w-full h-16 my-2 text-foreground"
                  aria-label={`Representação esquemática ${slot.partCode}`}
                >
                  <rect
                    x="2"
                    y="4"
                    width="116"
                    height="64"
                    rx="4"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                    strokeWidth="1.5"
                  />
                  {/* Upper terminal strip */}
                  {[16, 36, 56, 76, 96].map((cx) => (
                    <circle
                      key={`top_${cx}`}
                      cx={cx}
                      cy="13"
                      r="3"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.65"
                    />
                  ))}
                  {/* Status LCD/LED area */}
                  <rect
                    x="14"
                    y="24"
                    width="92"
                    height="24"
                    rx="2"
                    fill="currentColor"
                    fillOpacity="0.08"
                    stroke="currentColor"
                    strokeOpacity="0.2"
                  />
                  <text
                    x="60"
                    y="39"
                    textAnchor="middle"
                    fontSize="9"
                    fontFamily="monospace"
                    fill="currentColor"
                  >
                    {isBase ? "RUN · ETH" : slot.family.replace("EXPANSION_", "")}
                  </text>
                  {/* Lower terminal strip */}
                  {[16, 36, 56, 76, 96].map((cx) => (
                    <circle
                      key={`bot_${cx}`}
                      cx={cx}
                      cy="59"
                      r="3"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.65"
                    />
                  ))}
                </svg>

                <div className="text-[10px] font-mono text-muted-foreground space-y-0.5">
                  {alloc?.diRange && <div>DI: {alloc.diRange}</div>}
                  {alloc?.doRange && <div>DO: {alloc.doRange}</div>}
                  {alloc?.aiRange && <div>AI: {alloc.aiRange}</div>}
                  {alloc?.aqRange && <div>AQ: {alloc.aqRange}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Module Palette */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Adicionar Expansão / Fonte / Acessório
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {expansions.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant="outline"
                onClick={() =>
                  onChangeModel(addExpansionModule(model, item.id), `Adicionar ${item.partCode}`)
                }
                className="justify-between h-auto py-2 px-2.5 text-left"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-mono font-semibold truncate">{item.partCode}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{item.name}</div>
                </div>
                <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
              </Button>
            ))}
          </div>
        </div>

        {/* Diagnostics & BOM */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Validação Elétrica &amp; Compatibilidade
            </h3>
            {report.diagnostics.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>
                  Arquitetura de hardware compatível e sem conflitos de tensão/endereçamento.
                </span>
              </div>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {report.diagnostics.map((d) => (
                  <li
                    key={d.id}
                    className={`flex items-start gap-2 rounded p-2 border ${
                      d.severity === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    <WarningCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-mono font-semibold">[{d.code}] </span>
                      {d.message}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lista de Materiais (BOM — Largura total {report.widthModulesTotal} TE)
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1">Código</th>
                  <th className="py-1">Descrição</th>
                  <th className="py-1 text-right">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {report.bom.map((row) => (
                  <tr key={row.catalogId} className="border-b border-border/40">
                    <td className="py-1 font-mono">{row.partCode}</td>
                    <td className="py-1 text-muted-foreground">{row.description}</td>
                    <td className="py-1 text-right font-mono">{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
