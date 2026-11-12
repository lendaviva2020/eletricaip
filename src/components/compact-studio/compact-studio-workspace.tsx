/**
 * Unified eletric Studio IDE Shell — Clean-Room Compact PLC Engineering Environment.
 * Operates exclusively over the single canonical CompactProgramModel in UnifiedProjectStore.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circuitry,
  Cpu,
  Cube,
  FileText,
  PlayCircle,
  ShareNetwork,
  WarningCircle,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/compact-studio/branding";
import { useCompactStudioFeatureFlags } from "@/lib/compact-studio/feature-flags";
import { createEmptyCompactProgramModel } from "@/lib/compact-studio/domain/migrations";
import { validateCompactProgram } from "@/lib/compact-studio/domain/validation";
import type {
  CompactDiagnostic,
  CompactNotation,
  CompactProgramModel,
} from "@/lib/compact-studio/domain/types";
import {
  alignCompactNodes,
  copySelectionToClipboard,
  createCompactBlockNode,
  createEmptyCompactHistory,
  pasteClipboardIntoPage,
  pushCompactHistory,
  redoCompactHistory,
  undoCompactHistory,
  type CompactClipboardPayload,
} from "@/lib/compact-studio/editor";
import { evaluateRackEngineering } from "@/lib/compact-studio/hardware";
import { detectUdfCycles } from "@/lib/compact-studio/udf";
import { publishCompactFrameToRuntimeStore } from "@/lib/compact-studio/integration";
import { CompactRuntimeClient, type CompactRuntimeFrame } from "@/lib/compact-studio/runtime";
import {
  replayCompactSession,
  type CompactInputEvent,
  type CompactRecordedSession,
} from "@/lib/compact-studio/sim";
import { VirtualNetworkCoordinator } from "@/lib/compact-studio/network";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "@/lib/studio/canonical/types";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { CompactFbdCanvas } from "./compact-fbd-canvas";
import { CompactLadCanvas } from "./compact-lad-canvas";
import { HardwareConfigurator } from "./hardware-configurator";
import { UdfLibraryPanel } from "./udf-library-panel";
import { DocumentationPanel } from "./documentation-panel";
import { CompactSimulatorPanel } from "./compact-simulator-panel";

type StudioSubTab = "logic" | "hardware" | "udfs" | "docs" | "simulator" | "network";

export interface CompactStudioWorkspaceProps {
  readonly projectId?: string;
}

export function CompactStudioWorkspace({ projectId: _projectId }: CompactStudioWorkspaceProps) {
  const flags = useCompactStudioFeatureFlags();
  const storedCompact = useUnifiedProjectStore((s) => s.doc.compactStudio);
  const setCompactStudioProgram = useUnifiedProjectStore((s) => s.setCompactStudioProgram);

  const model = useMemo<CompactProgramModel>(() => {
    if (storedCompact) return storedCompact;
    return createEmptyCompactProgramModel({
      id: "compact-prog-main",
      name: `${PRODUCT_NAME} Projeto`,
    });
  }, [storedCompact]);

  const [activeTab, setActiveTab] = useState<StudioSubTab>("logic");
  const [activePageId, setActivePageId] = useState<string>(() => model.pages[0]?.id ?? "page-1");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [history, setHistory] = useState(createEmptyCompactHistory);
  const [clipboard, setClipboard] = useState<CompactClipboardPayload | null>(null);
  const [baselineModel, setBaselineModel] = useState<CompactProgramModel>(() => model);

  // Simulation state (ephemeral, decoupled from UnifiedProjectDoc)
  const runtimeClientRef = useRef<CompactRuntimeClient | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [liveFrame, setLiveFrame] = useState<CompactRuntimeFrame | null>(null);
  const [historyFrames, setHistoryFrames] = useState<CompactRuntimeFrame[]>([]);
  const [forcedNodes, setForcedNodes] = useState<Record<string, boolean | number>>({});
  const [recording, setRecording] = useState(false);
  const recordedEventsRef = useRef<CompactInputEvent[]>([]);
  const [lastSession, setLastSession] = useState<CompactRecordedSession | null>(null);
  const [networkTickOutput, setNetworkTickOutput] = useState<string>(
    "Rede Virtual pronta (até 8 nós).",
  );

  const validPageId = useMemo(
    () =>
      model.pages.some((p) => p.id === activePageId)
        ? activePageId
        : (model.pages[0]?.id ?? "page-1"),
    [model.pages, activePageId],
  );

  const commitModel = useCallback(
    (next: CompactProgramModel, label: string, kind: "move" | "structural" = "structural") => {
      setHistory((prev) =>
        pushCompactHistory(prev, {
          label,
          kind,
          notation: next.preferredNotation,
          before: model,
          after: next,
          timestamp: Date.now(),
        }),
      );
      setCompactStudioProgram(next);
    },
    [model, setCompactStudioProgram],
  );

  // Aggregate unified diagnostics (Domain + Hardware + UDF cycles)
  const diagnostics = useMemo<readonly CompactDiagnostic[]>(() => {
    const domainRep = validateCompactProgram(model);
    const rackRep = evaluateRackEngineering(model);
    const udfDiags = detectUdfCycles(model.udfs);
    return [...domainRep.diagnostics, ...rackRep.diagnostics, ...udfDiags];
  }, [model]);

  // Reload runtime client whenever program structure changes
  useEffect(() => {
    if (!runtimeClientRef.current) {
      runtimeClientRef.current = new CompactRuntimeClient();
    }
    let cancelled = false;
    void runtimeClientRef.current
      .load(model)
      .then(() => {
        if (!cancelled) {
          return runtimeClientRef.current?.step(model.cycleTimeMs);
        }
        return undefined;
      })
      .then((frame) => {
        if (!cancelled && frame) {
          setLiveFrame(frame);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  // Dispose worker cleanly on unmount
  useEffect(() => {
    return () => {
      runtimeClientRef.current?.dispose();
      runtimeClientRef.current = null;
    };
  }, []);

  // Deterministic scan loop when running
  useEffect(() => {
    if (!simRunning) return;
    const interval = setInterval(
      () => {
        const client = runtimeClientRef.current;
        if (!client) return;
        void client.step(model.cycleTimeMs).then((frame) => {
          if (!frame) return;
          setLiveFrame(frame);
          setHistoryFrames((prev) => [...prev.slice(-119), frame]);
          publishCompactFrameToRuntimeStore(model, frame);
        });
      },
      Math.max(20, model.cycleTimeMs),
    );
    return () => clearInterval(interval);
  }, [simRunning, model]);

  const handleNotationChange = (notation: CompactNotation) => {
    if (model.preferredNotation === notation) return;
    commitModel({ ...model, preferredNotation: notation }, `Alternar notação para ${notation}`);
  };

  const handleAddBlock = (blockType: string) => {
    const count = model.nodes.filter((n) => n.blockType === blockType).length + 1;
    const prefix =
      blockType === "INPUT_DI"
        ? "I"
        : blockType === "OUTPUT_QO"
          ? "Q"
          : blockType === "INPUT_AI"
            ? "AI"
            : blockType === "OUTPUT_AO"
              ? "AQ"
              : "B";
    const id = `n_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const node = createCompactBlockNode({
      id,
      pageId: validPageId,
      blockType,
      instanceName: `${prefix}${count}`,
    });
    commitModel(
      {
        ...model,
        nodes: [...model.nodes, node],
        layout: {
          ...model.layout,
          fbd: {
            ...model.layout.fbd,
            [id]: {
              x: 80 + (count % 5) * 190,
              y: 80 + Math.floor(count / 5) * 130,
              width: 176,
              height: 108,
            },
          },
        },
      },
      `Inserir bloco ${blockType}`,
    );
  };

  const handleMoveNodes = (positions: Record<string, { x: number; y: number }>) => {
    const fbd = { ...model.layout.fbd };
    for (const [id, pos] of Object.entries(positions)) {
      fbd[id] = { ...(fbd[id] ?? { x: 0, y: 0 }), x: pos.x, y: pos.y };
    }
    commitModel({ ...model, layout: { ...model.layout, fbd } }, "Mover blocos", "move");
  };

  const handleConnectPorts = (conn: {
    fromNodeId: string;
    fromPortId: string;
    toNodeId: string;
    toPortId: string;
  }) => {
    const srcNode = model.nodes.find((n) => n.id === conn.fromNodeId);
    const sig = srcNode?.outputs.find((o) => o.id === conn.fromPortId)?.signalType ?? "BOOL";
    const id = `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    commitModel(
      {
        ...model,
        connections: [
          ...model.connections,
          {
            id,
            pageId: validPageId,
            fromNodeId: conn.fromNodeId,
            fromPortId: conn.fromPortId,
            toNodeId: conn.toNodeId,
            toPortId: conn.toPortId,
            signalType: sig,
          },
        ],
      },
      "Conectar portas",
    );
  };

  const handleDeleteSelected = () => {
    if (selectedNodeIds.length === 0) return;
    const delSet = new Set(selectedNodeIds);
    commitModel(
      {
        ...model,
        nodes: model.nodes.filter((n) => !delSet.has(n.id)),
        connections: model.connections.filter(
          (c) => !delSet.has(c.fromNodeId) && !delSet.has(c.toNodeId),
        ),
      },
      `Excluir ${selectedNodeIds.length} bloco(s)`,
    );
    setSelectedNodeIds([]);
  };

  const handleRunVirtualNetworkTest = () => {
    const bus = new VirtualNetworkCoordinator([
      { stationId: "st1", name: "Painel Local", ipAddress: "10.0.0.10", model },
      {
        stationId: "st2",
        name: "Painel Remoto",
        ipAddress: "10.0.0.11",
        model: createEmptyCompactProgramModel({ id: "remote_st2", name: "Remoto 2" }),
      },
    ]);
    const res = bus.stepAll(model.cycleTimeMs);
    setNetworkTickOutput(`Ciclo ${res.cycleCount} OK · 2 estações sincronizadas (NI/NQ/NAI/NAQ).`);
  };

  return (
    <div
      className="flex flex-col h-full w-full min-h-0 bg-background text-foreground overflow-hidden"
      data-testid="compact-studio-workspace"
    >
      {/* Top IDE Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-tight text-primary">{PRODUCT_NAME}</span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {model.hardware.basePartCode}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={PRODUCT_NAME}>
          {[
            { id: "logic" as const, label: "Lógica FBD/LAD", icon: Circuitry },
            { id: "hardware" as const, label: "Hardware & E/S", icon: Cpu },
            { id: "udfs" as const, label: "UDFs", icon: Cube },
            { id: "docs" as const, label: "Documentação & CSV/PDF", icon: FileText },
            { id: "simulator" as const, label: "Simulador & Diff", icon: PlayCircle },
            { id: "network" as const, label: "Rede Multi-CLP", icon: ShareNetwork },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                role="tab"
                aria-selected={active}
                size="sm"
                variant={active ? "default" : "ghost"}
                onClick={() => setActiveTab(tab.id)}
                className="h-7 text-xs gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {activeTab === "logic" && (
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-background">
            <Button
              size="sm"
              variant={model.preferredNotation === "FBD" ? "secondary" : "ghost"}
              onClick={() => handleNotationChange("FBD")}
              className="h-6 px-2.5 text-[11px]"
            >
              FBD
            </Button>
            <Button
              size="sm"
              variant={model.preferredNotation === "LAD" ? "secondary" : "ghost"}
              onClick={() => handleNotationChange("LAD")}
              className="h-6 px-2.5 text-[11px]"
            >
              LAD
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "logic" && model.preferredNotation === "FBD" && (
          <CompactFbdCanvas
            model={model}
            activePageId={validPageId}
            selectedNodeIds={selectedNodeIds}
            liveFrame={liveFrame}
            diagnostics={diagnostics}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onSelectPage={setActivePageId}
            onAddPage={() => {
              const pNum = model.pages.length + 1;
              const newId = `page-${Date.now()}`;
              commitModel(
                {
                  ...model,
                  pages: [
                    ...model.pages,
                    {
                      id: newId,
                      name: `Página ${pNum}`,
                      order: pNum - 1,
                      gridCols: 24,
                      gridRows: 20,
                    },
                  ],
                },
                `Criar Página ${pNum}`,
              );
              setActivePageId(newId);
            }}
            onSelectNodes={setSelectedNodeIds}
            onMoveNodes={handleMoveNodes}
            onConnectPorts={handleConnectPorts}
            onDeleteSelected={handleDeleteSelected}
            onCopy={() => setClipboard(copySelectionToClipboard(model, selectedNodeIds, "FBD"))}
            onPaste={() => {
              if (!clipboard) return;
              const res = pasteClipboardIntoPage(
                model,
                clipboard,
                validPageId,
                "FBD",
                `p_${Date.now()}`,
              );
              commitModel(res.model, "Colar blocos");
              setSelectedNodeIds([...res.pastedNodeIds]);
            }}
            onUndo={() => {
              const u = undoCompactHistory(history);
              if (u.model) {
                setHistory(u.next);
                setCompactStudioProgram(u.model);
              }
            }}
            onRedo={() => {
              const r = redoCompactHistory(history);
              if (r.model) {
                setHistory(r.next);
                setCompactStudioProgram(r.model);
              }
            }}
            onAlign={(mode) => {
              if (selectedNodeIds.length === 0) return;
              commitModel(
                alignCompactNodes(model, "FBD", selectedNodeIds, mode),
                `Alinhar (${mode})`,
                "move",
              );
            }}
            onAddBlock={handleAddBlock}
          />
        )}

        {activeTab === "logic" && model.preferredNotation === "LAD" && (
          <CompactLadCanvas
            model={model}
            activePageId={validPageId}
            liveFrame={liveFrame}
            onChangeModel={(next, label) => commitModel(next, label)}
            onSelectNode={(nodeId) => setSelectedNodeIds(nodeId ? [nodeId] : [])}
          />
        )}

        {activeTab === "hardware" && (
          <HardwareConfigurator
            model={model}
            onChangeModel={(next, label) => commitModel(next, label)}
          />
        )}

        {activeTab === "udfs" && (
          <UdfLibraryPanel
            model={model}
            activePageId={validPageId}
            selectedNodeIds={selectedNodeIds}
            onChangeModel={(next, label) => commitModel(next, label)}
          />
        )}

        {activeTab === "docs" && (
          <DocumentationPanel
            model={model}
            onChangeModel={(next, label) => commitModel(next, label)}
            onNavigateToNode={(pageId, nodeId) => {
              setActivePageId(pageId);
              setSelectedNodeIds([nodeId]);
              setActiveTab("logic");
            }}
          />
        )}

        {activeTab === "simulator" && (
          <CompactSimulatorPanel
            model={model}
            baselineRevisionModel={baselineModel}
            running={simRunning}
            frame={liveFrame}
            historyFrames={historyFrames}
            forcedNodes={forcedNodes}
            recording={recording}
            onStart={() => setSimRunning(true)}
            onPause={() => setSimRunning(false)}
            onStop={() => {
              setSimRunning(false);
              void runtimeClientRef.current
                ?.reset()
                .then(() => runtimeClientRef.current?.step(model.cycleTimeMs))
                .then((f) => {
                  setLiveFrame(f ?? null);
                  setHistoryFrames([]);
                });
            }}
            onStep={(dtMs) => {
              void runtimeClientRef.current?.step(dtMs ?? model.cycleTimeMs).then((f) => {
                if (!f) return;
                setLiveFrame(f);
                setHistoryFrames((prev) => [...prev.slice(-119), f]);
                publishCompactFrameToRuntimeStore(model, f);
              });
            }}
            onJumpClockMs={(targetEpoch) => {
              void runtimeClientRef.current
                ?.jumpClock(targetEpoch)
                .then(() => runtimeClientRef.current?.step(0))
                .then((f) => {
                  if (f) setLiveFrame(f);
                });
            }}
            onSetInput={(addr, val) => {
              if (recording) {
                recordedEventsRef.current.push({
                  atElapsedMs: liveFrame?.elapsedMs ?? 0,
                  nameOrAddress: addr,
                  value: val,
                });
              }
              void runtimeClientRef.current?.step(model.cycleTimeMs, { [addr]: val }).then((f) => {
                if (f) {
                  setLiveFrame(f);
                  publishCompactFrameToRuntimeStore(model, f);
                }
              });
            }}
            onToggleForce={(nodeId, val) => {
              if (val === null) {
                setForcedNodes((prev) => {
                  const next = { ...prev };
                  delete next[nodeId];
                  return next;
                });
                void runtimeClientRef.current?.unforce(nodeId, "OUT");
              } else {
                setForcedNodes((prev) => ({ ...prev, [nodeId]: val }));
                void runtimeClientRef.current?.force(nodeId, "OUT", val);
              }
            }}
            onToggleRecord={() => {
              if (!recording) {
                recordedEventsRef.current = [];
                setRecording(true);
              } else {
                setRecording(false);
                setLastSession({
                  version: 1,
                  baseEpochMs: liveFrame?.clockEpochMs ?? Date.UTC(2026, 10, 12, 8, 0, 0),
                  cycleTimeMs: model.cycleTimeMs,
                  totalDurationMs: Math.max(200, (liveFrame?.elapsedMs ?? 200) + 100),
                  inputEvents: [...recordedEventsRef.current],
                  clockJumps: [],
                });
              }
            }}
            onReplayLastSession={() => {
              if (!lastSession) return;
              const outcome = replayCompactSession(model, lastSession);
              if (outcome.finalFrame) {
                setLiveFrame(outcome.finalFrame);
                setHistoryFrames([...outcome.frames]);
              }
            }}
          />
        )}

        {activeTab === "network" && (
          <div className="p-4 space-y-4 overflow-auto h-full">
            <div className="rounded-lg border border-border bg-card/60 p-4 space-y-2">
              <h2 className="text-sm font-semibold">
                Rede Virtual Multi-CLP (NI / NQ / NAI / NAQ)
              </h2>
              <p className="text-xs text-muted-foreground">
                Simule troca de sinais entre até 8 controladores em ciclo sincronizado.
              </p>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleRunVirtualNetworkTest}>
                  Executar Ciclo em Rede Virtual
                </Button>
                <span className="text-xs font-mono text-emerald-400">{networkTickOutput}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Ponte Opcional de Protocolos Abertos (Modbus TCP / OPC-UA / MQTT)
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted">
                  fieldDeviceComms={flags.isFieldCommsEnabled ? "ON (Somente Leitura)" : "OFF"} ·
                  IS_PHYSICAL_CONTROL_ALLOWED={String(IS_PHYSICAL_CONTROL_ALLOWED)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                A leitura observacional em campo requer habilitação explícita da flag{" "}
                <code>fieldDeviceComms</code> em Configurações → Integrações. Comandos remotos de
                escrita física permanecem incondicionalmente bloqueados no Cloud por arquitetura de
                segurança.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBaselineModel(model)}
                  className="h-7 text-xs"
                >
                  Fixar Revisão Atual como Baseline de Diff
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Diagnostics Dock */}
      <div className="border-t border-border bg-card/80 px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
          <WarningCircle
            className={`h-4 w-4 shrink-0 ${diagnostics.some((d) => d.severity === "error") ? "text-destructive" : "text-emerald-400"}`}
          />
          {diagnostics.length === 0 ? (
            <span className="text-emerald-400 font-mono text-[11px]">
              0 erros · Topologia, E/S e Hardware validados.
            </span>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto">
              {diagnostics.slice(0, 4).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    if (d.pageId) setActivePageId(d.pageId);
                    if (d.nodeId) {
                      setSelectedNodeIds([d.nodeId]);
                      setActiveTab("logic");
                    }
                  }}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 whitespace-nowrap"
                >
                  [{d.code}] {d.message}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {model.nodes.length} blocos · {model.connections.length} conexões
        </span>
      </div>
    </div>
  );
}
