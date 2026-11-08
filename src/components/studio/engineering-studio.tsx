import React, { useState } from "react";
import { useStudioStore } from "../../lib/studio/studio-store";
import { ProjectExplorer } from "./project-explorer";
import { StEditor } from "./st-editor";
import { SfcEditor } from "./sfc-editor";
import { DeviceTreeView } from "./device-tree-view";
import { HmiEditor } from "./hmi-editor";
import { SafetyPanel } from "./safety-panel";
import { MotionPanel } from "./motion-panel";
import { SimulationMonitor } from "./simulation-monitor";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../../lib/studio/canonical/types";
import {
  Code,
  TreeStructure,
  Sliders,
  ShieldCheck,
  Compass,
  Play,
  Hammer,
  Bug,
  FolderOpen,
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  X,
  FileCode,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";

export const EngineeringStudio: React.FC = () => {
  const {
    project,
    activePouId,
    activeTab,
    setActiveTab,
    compileProject,
    isCompiling,
    compilationResult,
    loadSampleProject,
    validateProjectIntegrity,
  } = useStudioStore();

  const [bottomDockTab, setBottomDockTab] = useState<"SIMULATION" | "BUILD" | "INTEGRITY">(
    "SIMULATION"
  );
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<any>(null);

  const handleBuild = () => {
    compileProject();
    setBottomDockTab("BUILD");
    setIsDockCollapsed(false);
  };

  const handleCheckIntegrity = () => {
    const report = validateProjectIntegrity();
    setIntegrityReport(report);
    setBottomDockTab("INTEGRITY");
    setIsDockCollapsed(false);
  };

  const currentPou = project.pous.find((p) => p.id === activePouId);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#101013] text-zinc-100 overflow-hidden font-sans select-none">
      {/* 1. BARRA SUPERIOR DE ENGENHARIA INDUSTRIAL */}
      <header className="h-12 border-b border-zinc-800 bg-[#141417] px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
            <Hammer className="w-4 h-4 text-white" weight="bold" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xs tracking-wide text-zinc-100 flex items-center gap-1.5">
              ELÉTRICAI INDUSTRIAL OS <span className="text-zinc-500 font-normal">|</span> CODESYS PARITY STUDIO
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              Projeto: {project.name} (v{project.activeVersion})
            </span>
          </div>
        </div>

        {/* Ações Centrais de Engenharia */}
        <div className="flex items-center gap-2">
          <button
            onClick={loadSampleProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700"
            title="Recarregar Estação Exemplo Completa (Tanque, Bomba, E-STOP, SFC, ST, IHM)"
          >
            <FolderOpen className="w-4 h-4 text-cyan-400" />
            Carregar Estação Exemplo
          </button>

          <button
            onClick={handleBuild}
            disabled={isCompiling}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm disabled:opacity-50"
          >
            {isCompiling ? (
              <ArrowClockwise className="w-4 h-4 animate-spin" />
            ) : (
              <Hammer className="w-4 h-4" />
            )}
            Build All (Compilar IEC)
          </button>

          <button
            onClick={handleCheckIntegrity}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700"
          >
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Validar Integridade
          </button>
        </div>

        {/* Trava Incondicional de Segurança */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/60 text-rose-300 border border-rose-800 text-[11px] font-mono font-semibold">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>PHYSICAL CONTROL LOCK: ACTIVE</span>
          </div>
        </div>
      </header>

      {/* 2. CORPO PRINCIPAL COM EXPLORADOR + ÁREA DE EDIÇÃO */}
      <div className="flex-1 flex overflow-hidden">
        {/* Painel Esquerdo: Explorador do Projeto Canônico */}
        <div className="w-72 border-r border-zinc-800 bg-[#121215] flex flex-col shrink-0">
          <ProjectExplorer />
        </div>

        {/* Área Central de Documentos / Editores */}
        <div className="flex-1 flex flex-col bg-[#18181b] overflow-hidden">
          {/* Barra de Abas de Navegação */}
          <div className="h-9 border-b border-zinc-800 bg-[#141417] flex items-center px-2 gap-1 overflow-x-auto">
            {activePouId && currentPou && (
              <button
                onClick={() => setActiveTab(currentPou.language === "SFC" ? "SFC_EDITOR" : "ST_EDITOR")}
                className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "ST_EDITOR" || activeTab === "SFC_EDITOR"
                    ? "bg-[#18181b] text-indigo-300 border-t-2 border-indigo-500"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Code className="w-4 h-4 text-indigo-400" />
                <span>{currentPou.name}</span>
                <span className="text-[10px] px-1 bg-zinc-800 rounded font-mono text-zinc-500">
                  {currentPou.language}
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveTab("DEVICE_TREE")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "DEVICE_TREE"
                  ? "bg-[#18181b] text-indigo-300 border-t-2 border-indigo-500"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <TreeStructure className="w-4 h-4 text-emerald-400" />
              <span>Rack & E/S</span>
            </button>

            <button
              onClick={() => setActiveTab("HMI_VIEW")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "HMI_VIEW"
                  ? "bg-[#18181b] text-indigo-300 border-t-2 border-indigo-500"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>IHM Estação</span>
            </button>

            <button
              onClick={() => setActiveTab("SAFETY_ADVISOR")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "SAFETY_ADVISOR"
                  ? "bg-[#18181b] text-indigo-300 border-t-2 border-indigo-500"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-rose-400" />
              <span>Segurança NR-12</span>
            </button>

            <button
              onClick={() => setActiveTab("MOTION_CONTROLLER")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "MOTION_CONTROLLER"
                  ? "bg-[#18181b] text-indigo-300 border-t-2 border-indigo-500"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Compass className="w-4 h-4 text-amber-400" />
              <span>PLCopen Motion</span>
            </button>
          </div>

          {/* Conteúdo da Aba Ativa */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === "ST_EDITOR" && activePouId && <StEditor pouId={activePouId} />}
            {activeTab === "SFC_EDITOR" && activePouId && <SfcEditor pouId={activePouId} />}
            {activeTab === "DEVICE_TREE" && <DeviceTreeView />}
            {activeTab === "HMI_VIEW" && <HmiEditor />}
            {activeTab === "SAFETY_ADVISOR" && <SafetyPanel />}
            {activeTab === "MOTION_CONTROLLER" && <MotionPanel />}
            {activeTab === "POU_LIST" && (
              <div className="flex-1 h-full flex items-center justify-center text-zinc-500 text-sm">
                Selecione uma POU no Navegador de Projeto à esquerda para editar.
              </div>
            )}
          </div>

          {/* 3. DOCK INFERIOR (Simulação, Diagnósticos, Integridade) */}
          <div
            className={`border-t border-zinc-800 bg-[#121215] flex flex-col transition-all duration-200 ${
              isDockCollapsed ? "h-8" : "h-64"
            }`}
          >
            {/* Barra de Abas do Dock */}
            <div className="h-8 border-b border-zinc-800 bg-[#0e0e11] px-3 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBottomDockTab("SIMULATION");
                    setIsDockCollapsed(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${
                    bottomDockTab === "SIMULATION"
                      ? "bg-zinc-800 text-indigo-300 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  Simulador & Forcing
                </button>

                <button
                  onClick={() => {
                    setBottomDockTab("BUILD");
                    setIsDockCollapsed(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${
                    bottomDockTab === "BUILD"
                      ? "bg-zinc-800 text-indigo-300 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Hammer className="w-3.5 h-3.5 text-indigo-400" />
                  Build & Diagnósticos (
                  {compilationResult?.diagnostics.filter((d) => d.severity === "ERROR").length || 0} erros)
                </button>

                <button
                  onClick={() => {
                    setBottomDockTab("INTEGRITY");
                    setIsDockCollapsed(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${
                    bottomDockTab === "INTEGRITY"
                      ? "bg-zinc-800 text-indigo-300 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                  Integridade Canônica
                </button>
              </div>

              <button
                onClick={() => setIsDockCollapsed(!isDockCollapsed)}
                className="p-1 text-zinc-400 hover:text-zinc-200"
                title={isDockCollapsed ? "Expandir Dock" : "Recolher Dock"}
              >
                {isDockCollapsed ? <CaretUp className="w-4 h-4" /> : <CaretDown className="w-4 h-4" />}
              </button>
            </div>

            {/* Conteúdo do Dock Inferior */}
            {!isDockCollapsed && (
              <div className="flex-1 overflow-auto">
                {bottomDockTab === "SIMULATION" && <SimulationMonitor />}

                {bottomDockTab === "BUILD" && (
                  <div className="p-4 font-mono text-xs space-y-2">
                    {compilationResult ? (
                      <div>
                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-800 font-bold">
                          {compilationResult.success ? (
                            <span className="text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4" /> COMPILAÇÃO IEC CONCLUÍDA COM SUCESSO
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1.5">
                              <WarningCircle className="w-4 h-4" /> FALHA NA COMPILAÇÃO IEC
                            </span>
                          )}
                          <span className="text-zinc-500 font-normal">
                            ({compilationResult.irBytecodeSize} bytes IR)
                          </span>
                        </div>

                        {compilationResult.diagnostics.length === 0 ? (
                          <div className="text-zinc-400 py-3">0 erros, 0 avisos. Bytecode IR pronto para execução.</div>
                        ) : (
                          <div className="space-y-1.5 pt-2">
                            {compilationResult.diagnostics.map((d, i) => (
                              <div
                                key={i}
                                className={`flex items-start gap-2 p-1.5 rounded ${
                                  d.severity === "ERROR"
                                    ? "bg-rose-950/40 text-rose-300 border border-rose-900"
                                    : "bg-amber-950/40 text-amber-300 border border-amber-900"
                                }`}
                              >
                                <span className="font-bold uppercase text-[10px] px-1 py-0.5 rounded bg-black/40">
                                  {d.severity}
                                </span>
                                <span>
                                  [L{d.line}:{d.column}] {d.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-zinc-500 py-4 text-center">
                        Nenhuma compilação executada recentemente. Clique em &quot;Build All&quot; para compilar.
                      </div>
                    )}
                  </div>
                )}

                {bottomDockTab === "INTEGRITY" && (
                  <div className="p-4 font-mono text-xs space-y-2">
                    {integrityReport ? (
                      <div>
                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-800 font-bold">
                          {integrityReport.isValid ? (
                            <span className="text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4" /> MODELO CANÔNICO 100% ÍNTEGRO (UUIDs VÁLIDOS)
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1.5">
                              <WarningCircle className="w-4 h-4" /> INCONSISTÊNCIA DETECTADA
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
                          <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
                            <div className="text-zinc-400 text-[11px]">Tags Órfãs:</div>
                            <div className="text-base font-bold text-zinc-100">
                              {integrityReport.brokenTagReferences.length}
                            </div>
                          </div>
                          <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
                            <div className="text-zinc-400 text-[11px]">POUs Órfãs:</div>
                            <div className="text-base font-bold text-zinc-100">
                              {integrityReport.brokenPouReferences.length}
                            </div>
                          </div>
                          <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
                            <div className="text-zinc-400 text-[11px]">Canais E/S Não Mapeados:</div>
                            <div className="text-base font-bold text-zinc-100">
                              {integrityReport.unmappedIOChannels.length}
                            </div>
                          </div>
                          <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
                            <div className="text-zinc-400 text-[11px]">Dependências Cíclicas:</div>
                            <div className="text-base font-bold text-zinc-100">
                              {integrityReport.cyclicDependencies.length}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-zinc-500 py-4 text-center">
                        Clique em &quot;Validar Integridade&quot; para analisar o grafo canônico.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
