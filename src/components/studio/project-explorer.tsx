// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — PROJECT EXPLORER (PROFESSIONAL PLC IDE TREE)
// Hierarchical Device & POU Browser with Canonical Sync, Renaming & Search
// ============================================================================

import React, { useState } from "react";
import { useStudioStore } from "@/lib/studio/studio-store";
import {
  Folder,
  FolderOpen,
  Cpu,
  Circuitry,
  Code,
  TreeStructure,
  MonitorPlay,
  WarningCircle,
  Gear,
  PencilSimple,
  Plus,
  Compass,
  ShieldCheck,
  Graph,
  CaretRight,
  CaretDown,
} from "@phosphor-icons/react";

export function ProjectExplorer() {
  const {
    project,
    selectedPouId,
    selectedDeviceId,
    selectPou,
    selectDevice,
    renamePou,
    renameTag,
    setActiveTab,
  } = useStudioStore();

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    devices: true,
    pous: true,
    gvl: true,
    hmi: true,
    alarms: true,
    motion: true,
  });

  const [searchFilter, setSearchFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const toggle = (key: string) => {
    setExpandedNodes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(currentName);
  };

  const commitRename = (id: string, type: "POU" | "TAG") => {
    if (editingName.trim()) {
      if (type === "POU") renamePou(id, editingName.trim());
      else renameTag(id, editingName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#11141c] text-[#c9d1d9] text-xs border-r border-[#262c3d] select-none font-sans">
      {/* Header do Project Explorer */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b26] border-b border-[#262c3d]">
        <div className="flex items-center gap-1.5 font-semibold text-[#e6edf3]">
          <TreeStructure size={16} className="text-[#f59e0b]" />
          <span>Project Explorer</span>
        </div>
        <span className="text-[10px] bg-[#212638] text-[#94a3b8] px-1.5 py-0.5 rounded font-mono">
          v{project.activeVersion}.0
        </span>
      </div>

      {/* Busca rápida */}
      <div className="p-2 border-b border-[#212638]">
        <input
          type="text"
          placeholder="Buscar POUs, Tags, I/O..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full bg-[#0d1017] border border-[#262c3d] rounded px-2 py-1 text-xs text-[#e6edf3] placeholder-[#64748b] focus:outline-none focus:border-[#f59e0b]"
        />
      </div>

      {/* Árvore Hierárquica */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {/* Raiz do Projeto */}
        <div className="flex items-center gap-1 px-1.5 py-1 text-[#f59e0b] font-semibold">
          <FolderOpen size={15} />
          <span className="truncate">{project.name}</span>
        </div>

        {/* 1. Controladores & Dispositivos (Device Tree) */}
        <div className="pl-2">
          <div
            onClick={() => toggle("devices")}
            className="flex items-center gap-1.5 px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            {expandedNodes.devices ? <CaretDown size={12} /> : <CaretRight size={12} />}
            <Cpu size={14} className="text-[#38bdf8]" />
            <span className="font-medium text-[#e2e8f0]">Dispositivos & Controladores</span>
          </div>

          {expandedNodes.devices && (
            <div className="pl-4 space-y-0.5 mt-0.5">
              {project.controllers.map((ctrl) => (
                <div key={ctrl.id}>
                  <div
                    onClick={() => selectDevice(ctrl.id)}
                    className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer ${
                      selectedDeviceId === ctrl.id
                        ? "bg-[#f59e0b]/20 text-[#f59e0b] font-medium"
                        : "hover:bg-[#161b26]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Circuitry size={13} className="text-[#38bdf8]" />
                      <span className="truncate">{ctrl.name}</span>
                    </div>
                    <span className="text-[9px] text-[#64748b] font-mono">
                      {ctrl.rackModules.length} módulos
                    </span>
                  </div>

                  {/* Módulos do Rack */}
                  <div className="pl-3 border-l border-[#212638] ml-2 mt-0.5 space-y-0.5">
                    {ctrl.rackModules.map((mod) => (
                      <div
                        key={mod.id}
                        onClick={() => selectDevice(ctrl.id)}
                        className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer"
                      >
                        <span className="text-[9px] font-mono text-[#64748b]">
                          Slot {mod.slotNumber}:
                        </span>
                        <span className="truncate">{mod.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Program Organization Units (POUs IEC 61131-3) */}
        <div className="pl-2">
          <div
            onClick={() => toggle("pous")}
            className="flex items-center justify-between px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.pous ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <Code size={14} className="text-[#a855f7]" />
              <span className="font-medium text-[#e2e8f0]">POUs (Programas & FBs)</span>
            </div>
            <span className="text-[10px] bg-[#212638] text-[#94a3b8] px-1 rounded">
              {project.pous.length}
            </span>
          </div>

          {expandedNodes.pous && (
            <div className="pl-4 space-y-0.5 mt-0.5">
              {project.pous.map((pou) => {
                const isSelected = selectedPouId === pou.id;
                const langColor =
                  pou.language === "ST"
                    ? "text-[#38bdf8]"
                    : pou.language === "LD"
                      ? "text-[#22c55e]"
                      : pou.language === "FBD"
                        ? "text-[#f59e0b]"
                        : "text-[#ec4899]";

                return (
                  <div
                    key={pou.id}
                    onClick={() => selectPou(pou.id)}
                    className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer ${
                      isSelected
                        ? "bg-[#a855f7]/20 text-[#d8b4fe] font-medium"
                        : "hover:bg-[#161b26]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className={`text-[10px] font-mono font-bold ${langColor}`}>
                        [{pou.language}]
                      </span>
                      {editingId === pou.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => commitRename(pou.id, "POU")}
                          onKeyDown={(e) => e.key === "Enter" && commitRename(pou.id, "POU")}
                          autoFocus
                          className="bg-[#0d1017] border border-[#f59e0b] rounded px-1 text-xs text-[#f8fafc]"
                        />
                      ) : (
                        <span className="truncate">{pou.name}</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => startRename(pou.id, pou.name, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-[#f59e0b]"
                      title="Renomear POU (Sync Canônico)"
                    >
                      <PencilSimple size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Global Variable Lists (GVL) & Tags */}
        <div className="pl-2">
          <div
            onClick={() => toggle("gvl")}
            className="flex items-center justify-between px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.gvl ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <Graph size={14} className="text-[#22c55e]" />
              <span className="font-medium text-[#e2e8f0]">Tags & GVL Canônicas</span>
            </div>
            <span className="text-[10px] bg-[#212638] text-[#94a3b8] px-1 rounded">
              {project.tags.length}
            </span>
          </div>

          {expandedNodes.gvl && (
            <div className="pl-4 space-y-0.5 mt-0.5">
              {project.tags.map((tag) => (
                <div
                  key={tag.id}
                  className="group flex items-center justify-between px-2 py-0.5 rounded hover:bg-[#161b26] text-[11px]"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                    <span className="truncate text-[#e2e8f0]">{tag.name}</span>
                  </div>
                  <span className="text-[9px] font-mono text-[#64748b]">{tag.dataType}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Visualização & HMI */}
        <div className="pl-2">
          <div
            onClick={() => {
              toggle("hmi");
              setActiveTab("HMI_EDITOR");
            }}
            className="flex items-center justify-between px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.hmi ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <MonitorPlay size={14} className="text-[#ec4899]" />
              <span className="font-medium text-[#e2e8f0]">Visualização HMI / SCADA</span>
            </div>
          </div>
          {expandedNodes.hmi && (
            <div className="pl-4 space-y-0.5 mt-0.5">
              {project.hmiPages.map((page) => (
                <div
                  key={page.id}
                  onClick={() => setActiveTab("HMI_EDITOR")}
                  className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-[#161b26] text-[11px] text-[#cbd5e1]"
                >
                  <Folder size={12} className="text-[#ec4899]" />
                  <span className="truncate">{page.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Motion Control & CNC */}
        <div className="pl-2">
          <div
            onClick={() => {
              toggle("motion");
              setActiveTab("MOTION_CONTROL");
            }}
            className="flex items-center justify-between px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.motion ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <Compass size={14} className="text-[#f97316]" />
              <span className="font-medium text-[#e2e8f0]">Motion & Robótica</span>
            </div>
          </div>
          {expandedNodes.motion && (
            <div className="pl-4 space-y-0.5 mt-0.5">
              {project.motionAxes.map((axis) => (
                <div
                  key={axis.id}
                  onClick={() => setActiveTab("MOTION_CONTROL")}
                  className="flex items-center justify-between px-2 py-1 rounded cursor-pointer hover:bg-[#161b26] text-[11px] text-[#cbd5e1]"
                >
                  <span className="truncate">{axis.name}</span>
                  <span className="text-[9px] font-mono text-[#f97316]">{axis.state}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. Engenharia de Segurança (Safety) */}
        <div className="pl-2">
          <div
            onClick={() => setActiveTab("SAFETY_ANALYSIS")}
            className="flex items-center gap-1.5 px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            <ShieldCheck size={14} className="text-[#ef4444]" />
            <span className="font-medium text-[#e2e8f0]">Safety & E-STOP Loop</span>
          </div>
        </div>

        {/* 7. Simulação Determinística */}
        <div className="pl-2">
          <div
            onClick={() => setActiveTab("SIMULATION_MONITOR")}
            className="flex items-center gap-1.5 px-1.5 py-1 hover:bg-[#1a2030] rounded cursor-pointer text-[#94a3b8]"
          >
            <MonitorPlay size={14} className="text-[#22c55e]" />
            <span className="font-medium text-[#e2e8f0]">Monitor do Simulador</span>
          </div>
        </div>
      </div>
    </div>
  );
}
