// SCADA SUPERVISÓRIO — View 2: Sinóticos Industriais (Process Sectors)
// Multi-sector synoptic views with dedicated process schematics and equipment status

import { useState } from "react";
import {
  TreeStructure,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsOut,
  Drop,
  Lightning,
  Funnel,
  Cylinder,
} from "@phosphor-icons/react";
import { EteSynopticPAndId } from "../synoptic/ete-synoptic-p-and-id";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { ScadaSynopticSector } from "@/lib/scada/types";
import { cn } from "@/lib/utils";

interface SectorTab {
  id: ScadaSynopticSector;
  label: string;
  icon: typeof Drop;
  description: string;
  tagPrefix: string;
}

export function ScadaSynopticsView() {
  const selectedSector = useScadaStore((s) => s.selectedSector);
  const setSelectedSector = useScadaStore((s) => s.setSelectedSector);
  const equipments = useScadaStore((s) => s.equipments);

  const sectors: SectorTab[] = [
    {
      id: "ete_geral",
      label: "ETE Geral",
      icon: TreeStructure,
      description:
        "Visão global de processo: captação, sedimentação, aeração, filtração e descarte",
      tagPrefix: "ETE.*",
    },
    {
      id: "pumping",
      label: "Bombagem & Recalque",
      icon: Drop,
      description: "Conjuntos moto-bomba P-01 e P-02, inversores de frequência e curvas de vazão",
      tagPrefix: "ETE.P*",
    },
    {
      id: "filtration",
      label: "Filtros & Decantadores",
      icon: Funnel,
      description:
        "Filtros multimídia F-01, monitoramento de pressão diferencial e ciclos de retrolavagem",
      tagPrefix: "ETE.FILTRO.*",
    },
    {
      id: "tanks",
      label: "Reservatórios & Dosagem",
      icon: Cylinder,
      description:
        "Tanques T-101, T-102, T-105 e sistemas de dosagem química de coagulante e cloro",
      tagPrefix: "ETE.TK*",
    },
    {
      id: "electrical",
      label: "Distribuição Elétrica",
      icon: Lightning,
      description: "Subestação TR-01 (750 kVA), QGBT QM-01 (380V), CCM-01 e barramentos protegidos",
      tagPrefix: "ETE.QM01.*",
    },
  ];

  const currentSector = sectors.find((s) => s.id === selectedSector) || sectors[0];

  return (
    <div className="flex-1 flex flex-col p-3 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-3">
      {/* Sector Selection Toolbar */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {sectors.map((sec) => {
            const Icon = sec.icon;
            const isActive = selectedSector === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setSelectedSector(sec.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors shrink-0",
                  isActive
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
            Filtro TAGs: {currentSector.tagPrefix}
          </span>
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded p-0.5">
            <button
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
              title="Zoom +"
            >
              <MagnifyingGlassPlus className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
              title="Zoom -"
            >
              <MagnifyingGlassMinus className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
              title="Ajustar à tela"
            >
              <ArrowsOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sector Description Banner */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-md px-3.5 py-2 text-xs font-mono flex items-center justify-between text-zinc-300">
        <div>
          <span className="font-bold text-white uppercase">{currentSector.label}:</span>{" "}
          <span className="text-zinc-400">{currentSector.description}</span>
        </div>
        <span className="text-[10px] text-blue-400 uppercase font-semibold shrink-0">
          ISA-101 HMI
        </span>
      </div>

      {/* Synoptic Graphic Canvas */}
      <EteSynopticPAndId />

      {/* Sector Equipments Quick Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.values(equipments)
          .filter((eq): eq is any => Boolean(eq && eq.id && eq.tag))
          .slice(0, 4)
          .map((eq) => (
            <div
              key={eq.id}
              className="bg-zinc-950/80 border border-zinc-800 p-3 rounded-lg flex flex-col justify-between text-xs font-mono"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-blue-400 font-bold block">{eq.tag}</span>
                  <span className="text-white font-medium text-[11px] truncate block max-w-[170px]">
                    {eq.name}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.2 rounded font-bold uppercase",
                    eq.status === "RUNNING" || eq.status === "OPEN"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400",
                  )}
                >
                  {eq.status}
                </span>
              </div>

              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex justify-between text-[10px] text-zinc-400">
                <span>{eq.voltageV > 0 ? `${eq.voltageV}V` : "Sinal 24V"}</span>
                <span>{eq.powerKw > 0 ? `${eq.powerKw} kW` : "N/A"}</span>
                <span className="text-emerald-400">Modo: {eq.mode}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
