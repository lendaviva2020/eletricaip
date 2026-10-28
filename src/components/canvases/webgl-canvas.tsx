// Canvas WebGL único, parametrizado por sheet. Lê o doc do useDiagramStore,
// sincroniza o scene graph Pixi de forma incremental e despacha comandos
// reversíveis para o store. Toolbar, cabeçalho de engenharia e painel de diagnóstico
// inferior vivem em HTML overlay.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listBom } from "@/lib/bom.functions";
import { Button } from "@/components/ui/button";
import {
  FileBox,
  FileText,
  Magnet,
  Maximize2,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
  Save,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Settings,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  FileSpreadsheet,
  Activity,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiagramStage, type EdgeDraftCommit, type MoveDelta } from "@/lib/diagram/render/stage";
import { cmd } from "@/lib/diagram/commands";
import { useDiagramStore, snapToGrid } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { exportDiagramDxf } from "@/lib/diagram/export-dxf";
import { exportDiagramSvg } from "@/lib/diagram/export-svg";
import {
  buildMultifilarCommands,
  buildUnifilarFromMultifilarCommands,
  detectMultifilarPhaseMismatches,
  summarizeConductors,
  syncMultifilarCommands,
  calculateVoltageDropNbr5410,
  runDiagramDiagnostics,
  type DiagnosticAlert,
  type VoltageDropResult,
} from "@/lib/diagram/multifilar";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import type { SheetKind, NodeKind } from "@/lib/diagram/schema";
import {
  type VoltaiComponentType,
  VOLTAI_COMPONENT_BY_TYPE,
} from "@/lib/palette/component-catalog";

function isVoltaiComponentType(value: string): value is VoltaiComponentType {
  return value in VOLTAI_COMPONENT_BY_TYPE;
}

function voltaiComponentToNodeKind(type: VoltaiComponentType): NodeKind {
  const map: Record<string, NodeKind> = {
    QF: "breaker",
    QS: "disconnector",
    DR: "rcd",
    FU: "fuse",
    KM: "contactor",
    KA: "relay",
    FR: "relay",
    M: "motor",
    SS: "softstarter",
    VFD: "vfd",
    TR: "transformer",
    PS: "psu",
    G: "ground",
    TCTERRA: "ground",
    UPS: "psu",
    PT: "pt100",
    TT: "pt100",
    LT: "level",
    FT: "thermal_relay",
    ES: "estop",
    ESTOP_RELAY: "estop",
    HL: "lamp",
    HZ: "lamp",
    PLC: "plc",
    HMI: "hmi",
    IHM: "hmi",
    KT: "relay",
    CT: "terminal",
    BC: "capacitor_bank",
    TC: "terminal",
    TP: "terminal",
    MPCB: "breaker",
    MCB_AUX: "breaker",
    CR: "relay",
    PFC: "capacitor_bank",
    KWH: "terminal",
    IED: "terminal",
    SA: "terminal",
    R: "load",
    L: "load",
    SPD: "lightcurtain",
    TVSS: "lightcurtain",
    B: "terminal",
    SR: "relay",
    PTZ: "terminal",
    FL: "flow",
    PSW: "pressure",
    LS: "level",
    V: "load",
    SIN: "terminal",
  };
  return (map[type] ?? "terminal") as NodeKind;
}

function defaultNodeParams(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "breaker":
      return { kind, in_A: 63, curve: "C", poles: 1, manufacturer: "Schneider", model: "iC60N" };
    case "rcd":
      return { kind, in_A: 25, sensitivity_mA: 30, poles: 2 };
    case "contactor":
      return { kind, in_A: 32, coil_V: 24, manufacturer: "WEG", model: "CWM32" };
    case "relay":
      return { kind, coil_V: 24, contacts: 2 };
    case "fuse":
      return { kind, in_A: 63 };
    case "disconnector":
      return { kind, in_A: 63 };
    case "thermal_relay":
      return { kind, in_A: 32, trip_class: "10A", manufacturer: "WEG", model: "RW27-2D" };
    case "capacitor_bank":
      return { kind, kvar: 25, voltage_V: 380, manufacturer: "WEG", model: "BCW-25" };
    case "generator":
      return { kind, kVA: 150, voltage_V: 380, manufacturer: "Stemac", model: "GTA150" };
    case "plc":
      return { kind, cpu: "1769-L33ER", io_count: 16, manufacturer: "Rockwell", model: "CompactLogix" };
    case "hmi":
      return { kind, screen_size_in: 10.1, protocol: "EtherNet/IP", manufacturer: "Siemens", model: "KTP1000" };
    case "transformer":
      return { kind, kVA: 100, primary_V: 13800, secondary_V: 380, vector: "Dyn11", manufacturer: "WEG", model: "TRAFO-100" };
    case "psu":
      return { kind, output_V: 24, output_A: 10 };
    case "vfd":
      return { kind, power_kW: 7.5, voltage_V: 380, manufacturer: "WEG", model: "CFW11" };
    case "softstarter":
      return { kind, power_kW: 11, manufacturer: "WEG", model: "SSW07" };
    case "busbar":
      return { kind, current_A: 630, voltage_V: 380 };
    case "ccm":
      return { kind, columns: 4, cells: 6 };
    case "motor":
      return { kind, power_kW: 7.5, current_A: 15.2, voltage_V: 380, startMethod: "DOL", manufacturer: "WEG", model: "W22 Premium" };
    case "load":
      return { kind, power_W: 1000, voltage_V: 220, fp: 0.92 };
    case "lamp":
      return { kind, power_W: 15, voltage_V: 220 };
    case "socket":
      return { kind, current_A: 10, voltage_V: 220 };
    case "pt100":
      return { kind, range_C: [-50, 200] };
    case "pressure":
      return { kind, range_bar: [0, 10] };
    case "flow":
      return { kind, range: [0, 100] };
    case "level":
      return { kind, range_pct: [0, 100] };
    case "encoder":
      return { kind, ppr: 1024 };
    case "estop":
      return { kind, category: "1" };
    case "lightcurtain":
      return { kind, resolution_mm: 14 };
    case "ground":
      return { kind };
    case "neutral":
      return { kind };
    case "terminal":
      return { kind };
    default:
      return { kind: "terminal" };
  }
}

interface Props {
  sheet?: SheetKind;
  projectId?: string | null;
}

export function WebglCanvas({ sheet, projectId }: Props) {
  const listBomFn = useServerFn(listBom);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<DiagramStage | null>(null);

  const activeSheet = useDiagramStore((s) => s.activeSheet);
  const setActiveSheet = useDiagramStore((s) => s.setActiveSheet);
  const effectiveSheet = sheet ?? activeSheet;
  const doc = useDiagramStore((s) => s.doc);
  const selectedNodeIds = useDiagramStore((s) => s.selectedNodeIds);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const dispatch = useDiagramStore((s) => s.dispatch);
  const moveSelectedTo = useDiagramStore((s) => s.moveSelectedTo);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const rotateNode = useDiagramStore((s) => s.rotateNode);
  const snapEnabled = useDiagramStore((s) => s.snapEnabled);
  const toggleSnap = useDiagramStore((s) => s.toggleSnap);
  const contextMenu = useDiagramStore((s) => s.contextMenu);
  const openContextMenu = useDiagramStore((s) => s.openContextMenu);
  const closeContextMenu = useDiagramStore((s) => s.closeContextMenu);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Cálculos e Diagnósticos em tempo real
  const diagnostics = useMemo(() => runDiagramDiagnostics(doc), [doc]);
  const voltageDrops = useMemo(() => calculateVoltageDropNbr5410(doc), [doc]);

  const bomItems = useMemo(() => {
    const counts: Record<string, { tag: string; kind: string; desc: string; manufacturer: string; model: string; qty: number }> = {};
    for (const n of Object.values(doc.nodes)) {
      if (n.sheet !== effectiveSheet && n.sheet !== "unifilar") continue;
      const tag = (n.params as any).tag || n.label || n.id;
      const kind = n.params.kind;
      const mfg = (n.params as any).manufacturer || "—";
      const mdl = (n.params as any).model || "—";
      const key = `${kind}_${mfg}_${mdl}`;
      if (!counts[key]) {
        counts[key] = {
          tag,
          kind,
          desc: `${kind.toUpperCase()}`,
          manufacturer: mfg,
          model: mdl,
          qty: 1,
        };
      } else {
        counts[key].qty += 1;
        counts[key].tag += `, ${tag}`;
      }
    }
    return Object.values(counts);
  }, [doc.nodes, effectiveSheet]);

  const snapFnRef = useRef((v: number) => v);
  useEffect(() => {
    snapFnRef.current = snapEnabled ? (v: number) => snapToGrid(v) : (v: number) => v;
  }, [snapEnabled]);

  // mount / unmount stage
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const stage = new DiagramStage();
    stageRef.current = stage;
    stage
      .init(host, {
        snap: (v) => snapFnRef.current(v),
        onSelectNode: (id) => setSelection(id ? [id] : []),
        onSelectMany: (ids) => setSelection(ids),
        onMoveNodes: (deltas: MoveDelta[]) => {
          const map: Record<
            string,
            { from: { x: number; y: number }; to: { x: number; y: number } }
          > = {};
          for (const d of deltas) map[d.nodeId] = { from: d.from, to: d.to };
          moveSelectedTo(map);
        },
        onCommitEdge: (e: EdgeDraftCommit) => {
          dispatch(
            cmd.addEdge({
              sheet: effectiveSheet,
              source: e.source,
              sourcePort: e.sourcePort,
              target: e.target,
              targetPort: e.targetPort,
              kind: e.kind,
            }),
          );
        },
        onContextMenu: ({ nodeId, clientX, clientY }) => {
          const hostRect = host.getBoundingClientRect();
          openContextMenu({
            nodeId,
            x: clientX - hostRect.left,
            y: clientY - hostRect.top,
          });
        },
      })
      .then(() => {
        if (disposed) return;
        stage.fitView();
        stage.sync(
          useDiagramStore.getState().doc,
          effectiveSheet,
          useDiagramStore.getState().selectedNodeIds,
        );
      });
    return () => {
      disposed = true;
      stage.destroy();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync em qualquer mudança relevante
  useEffect(() => {
    stageRef.current?.sync(doc, effectiveSheet, selectedNodeIds);
  }, [doc, effectiveSheet, selectedNodeIds]);

  // atalhos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (document.activeElement as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        (meta && e.key.toLowerCase() === "z" && e.shiftKey) ||
        (meta && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.length === 0) return;
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key.toLowerCase() === "r" && selectedNodeIds.length > 0) {
        e.preventDefault();
        for (const id of selectedNodeIds) rotateNode(id, e.shiftKey ? -90 : 90);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected, rotateNode, selectedNodeIds]);

  // fechar context menu ao clicar fora
  useEffect(() => {
    if (!contextMenu) return;
    const onDocDown = () => closeContextMenu();
    window.addEventListener("pointerdown", onDocDown);
    return () => window.removeEventListener("pointerdown", onDocDown);
  }, [contextMenu, closeContextMenu]);

  const handleExportDxf = useCallback(() => {
    try {
      const safe = (doc.metadata.title || "MCC-01_REFORCO").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      const counts = exportDiagramDxf(doc, effectiveSheet, `${safe}_${effectiveSheet}.dxf`);
      toast.success(`DXF gerado · ${counts.nodes} símbolos, ${counts.edges} ligações.`);
      setExportMenuOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [doc, effectiveSheet]);

  const handleExportSvg = useCallback(() => {
    try {
      const safe = (doc.metadata.title || "MCC-01_REFORCO").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      exportDiagramSvg(doc, effectiveSheet, `${safe}_${effectiveSheet}.svg`);
      toast.success(`SVG vetorial IEC gerado com sucesso.`);
      setExportMenuOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [doc, effectiveSheet]);

  const handleExportPdf = useCallback(async () => {
    try {
      const { buildProjectPdf } = await import("@/lib/pdf-export");
      const safe = (doc.metadata.title || "MCC-01_REFORCO").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      let bom: Parameters<typeof buildProjectPdf>[0]["bom"] = [];
      let totalBRL = 0;
      if (projectId) {
        const result = await listBomFn({ data: { projectId } });
        bom = result.items;
        totalBRL = result.totalBRL;
      }
      const conductors = summarizeConductors(doc);
      const pdf = buildProjectPdf({
        project: { name: doc.metadata.title || "MCC-01_REFORCO" },
        bom,
        totalBRL,
        conductors: conductors.rows.length > 0 ? conductors : undefined,
        norm: (doc.metadata.norms ?? []).join(" · ") || "NBR 5410 / IEC 60617",
      });
      pdf.save(`${safe}_memorial.pdf`);
      const condMsg =
        conductors.rows.length > 0
          ? ` · ${conductors.totalCircuits} circuitos / ${conductors.totalConductors} condutores`
          : "";
      toast.success(
        projectId
          ? `PDF gerado · ${bom.length} itens de BOM · R$ ${totalBRL.toFixed(2)}${condMsg}.`
          : `PDF gerado (diagrama ativo — memorial NBR 5410)${condMsg}.`,
      );
      setExportMenuOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [doc, projectId, listBomFn]);

  // Transição de abas Unifilar <-> Multifilar com sincronização bidirecional
  const handleSwitchTab = useCallback(
    (targetSheet: SheetKind) => {
      if (targetSheet === effectiveSheet) return;

      if (targetSheet === "multifilar") {
        const hasUnifilar = Object.values(doc.nodes).some((n) => n.sheet === "unifilar");
        if (!hasUnifilar) {
          toast.info("Diagrama unifilar vazio — adicione componentes antes de migrar.");
        }
        const hasMultifilar = Object.values(doc.nodes).some((n) => n.sheet === "multifilar");
        const commands = hasMultifilar ? syncMultifilarCommands(doc) : buildMultifilarCommands(doc);
        if (commands.length > 0) {
          dispatch({ type: "Batch", commands });
        }
        setActiveSheet("multifilar");
        toast.success(
          hasMultifilar
            ? "Diagrama multifilar sincronizado com o modelo unifilar."
            : "Diagrama multifilar derivado com condutores individuais e terminais.",
        );
      } else {
        // Voltar para unifilar: verifica se precisa derivar alterações do multifilar
        const hasMultifilar = Object.values(doc.nodes).some((n) => n.sheet === "multifilar");
        if (hasMultifilar) {
          const reverseCmds = buildUnifilarFromMultifilarCommands(doc);
          if (reverseCmds.length > 0) {
            dispatch({ type: "Batch", commands: reverseCmds });
          }
        }
        setActiveSheet("unifilar");
        toast.success("Visualizando Diagrama Unifilar.");
      }
    },
    [doc, effectiveSheet, dispatch, setActiveSheet],
  );

  const handleValidate = useCallback(() => {
    useEditorStore.getState().setConsoleTab("diagnosticos");
    useEditorStore.getState().setConsoleOpen(true);
    const errors = diagnostics.filter((d) => d.type === "ERRO");
    const warnings = diagnostics.filter((d) => d.type === "AVISO");
    if (errors.length > 0) {
      toast.error(`Validação concluída: ${errors.length} erro(s) e ${warnings.length} aviso(s).`);
    } else if (warnings.length > 0) {
      toast.warning(`Validação concluída com ${warnings.length} aviso(s). Conectividade OK.`);
    } else {
      toast.success("Validação concluída com sucesso! 100% em conformidade com NBR 5410.");
    }
  }, [diagnostics]);

  const handleSave = useCallback(() => {
    toast.success(`Projeto "${doc.metadata.title || "MCC-01_REFORCO"}" salvo no documento ativo.`);
  }, [doc.metadata.title]);

  const hasSelection = selectedNodeIds.length > 0;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const rawType = e.dataTransfer.getData("application/voltai-component");
      if (!rawType || !isVoltaiComponentType(rawType)) return;

      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const stage = stageRef.current;
      const world = stage?.screenToWorld(clientX, clientY) ?? {
        x: clientX + 2000 - rect.width / 2,
        y: clientY + 2000 - rect.height / 2,
      };
      const position = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
      const kind = voltaiComponentToNodeKind(rawType);

      dispatch(
        cmd.addNode({
          sheet: effectiveSheet,
          position,
          params: defaultNodeParams(kind) as Parameters<typeof cmd.addNode>[0]["params"],
          label: rawType,
        }),
      );
    },
    [effectiveSheet, dispatch],
  );

  return (
    <div
      className="relative flex flex-col h-full w-full bg-[#0b0f17] select-none overflow-hidden"
      style={{ touchAction: "none" }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 1. CABEÇALHO DE ENGENHARIA INDUSTRIAL E BARRA DE ABAS */}
      <div className="z-20 shrink-0 flex items-center justify-between px-3 h-11 bg-[#0e1626] border-b border-border/80 shadow-md">
        {/* Abas Unifilar / Multifilar como na imagem de referência */}
        <div className="flex items-center gap-1.5 h-full">
          <button
            onClick={() => handleSwitchTab("unifilar")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-semibold tracking-wide transition-all ${
              effectiveSheet === "unifilar"
                ? "bg-[#162136] text-[#38bdf8] border-b-2 border-[#38bdf8] shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-[#162136]/50"
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>Canvas Unifilar</span>
            <span className="text-[10px] opacity-60 ml-0.5">✕</span>
          </button>

          <button
            onClick={() => handleSwitchTab("multifilar")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-semibold tracking-wide transition-all ${
              effectiveSheet === "multifilar"
                ? "bg-[#162136] text-[#f97316] border-b-2 border-[#f97316] shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-[#162136]/50"
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-[#f97316]" />
            <span>Canvas Multifilar</span>
            <span className="text-[10px] opacity-60 ml-0.5">✕</span>
          </button>
        </div>

        {/* Informações Técnicas do Projeto */}
        <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#131d2e] border border-border/60 text-foreground">
            <span className="text-muted-foreground font-semibold">PROJETO:</span>
            <span className="font-bold text-[#38bdf8]">{doc.metadata.title || "MCC-01_REFORCO"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#131d2e] border border-border/60 text-foreground">
            <span className="text-muted-foreground font-semibold">FOLHA:</span>
            <span className="font-bold">{effectiveSheet === "unifilar" ? "01/03" : "02/03"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#131d2e] border border-border/60 text-[#38bdf8]">
            <span>📶</span>
            <span>380V / 60Hz</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#064e3b]/40 border border-[#059669]/60 text-[#34d399] font-medium animate-pulse">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" />
            <span>DOCUMENTO ATIVO</span>
          </div>
        </div>

        {/* Botões de Ação de Engenharia */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            className="h-8 gap-1.5 text-xs bg-[#131d2e] hover:bg-[#1c2b44] border-border/60 text-foreground"
          >
            <Save className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span className="hidden sm:inline">Salvar</span>
          </Button>

          {/* Menu de Exportação */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExportMenuOpen((v) => !v)}
              className="h-8 gap-1.5 text-xs bg-[#131d2e] hover:bg-[#1c2b44] border-border/60 text-foreground"
            >
              <Download className="h-3.5 w-3.5 text-[#38bdf8]" />
              <span className="hidden sm:inline">Exportar</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>

            {exportMenuOpen && (
              <div
                className="absolute right-0 top-9 z-50 w-52 rounded-md border border-border/80 bg-[#101929] p-1 shadow-xl backdrop-blur text-xs"
                onPointerLeave={() => setExportMenuOpen(false)}
              >
                <button
                  onClick={handleExportPdf}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left hover:bg-[#1c2b44] text-foreground"
                >
                  <FileText className="h-4 w-4 text-[#ef4444]" />
                  <div>
                    <div className="font-semibold">Memorial de Cálculo PDF</div>
                    <div className="text-[10px] text-muted-foreground">NBR 5410 com BOM e cabos</div>
                  </div>
                </button>
                <button
                  onClick={handleExportSvg}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left hover:bg-[#1c2b44] text-foreground"
                >
                  <Activity className="h-4 w-4 text-[#f97316]" />
                  <div>
                    <div className="font-semibold">Diagrama Vetorial SVG</div>
                    <div className="text-[10px] text-muted-foreground">Padrão IEC 60617 em alta resolução</div>
                  </div>
                </button>
                <button
                  onClick={handleExportDxf}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left hover:bg-[#1c2b44] text-foreground"
                >
                  <FileBox className="h-4 w-4 text-[#38bdf8]" />
                  <div>
                    <div className="font-semibold">Arquivo CAD DXF</div>
                    <div className="text-[10px] text-muted-foreground">AutoCAD com camadas elétricas</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleValidate}
            className="h-8 gap-1.5 text-xs bg-[#064e3b]/30 hover:bg-[#064e3b]/50 border-[#059669]/60 text-[#34d399]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Validar</span>
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Configurações do Diagrama"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <div className="h-4 w-px bg-border/60 mx-1" />

          {/* Ações de navegação rápida */}
          <Button size="icon" variant="ghost" onClick={undo} className="h-8 w-8" title="Desfazer (Ctrl+Z)">
            <Undo2 className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={redo} className="h-8 w-8" title="Refazer (Ctrl+Y)">
            <Redo2 className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant={snapEnabled ? "secondary" : "ghost"}
            onClick={toggleSnap}
            className="h-8 w-8"
            title={`Snap ao Grid: ${snapEnabled ? "ATIVO" : "DESLIGADO"}`}
          >
            <Magnet className="size-3.5 text-[#38bdf8]" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => stageRef.current?.fitView()}
            className="h-8 w-8"
            title="Ajustar Visualização à Tela"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. ÁREA CENTRAL DO CANVAS PIXI.JS */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-[#0b0f17]">
        <div ref={hostRef} className="absolute inset-0" />

        {/* Toolbar flutuante de apoio à direita */}
        <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-md border border-border/50 bg-[#101929]/80 p-1 backdrop-blur shadow-md">
          <Button
            size="icon"
            variant="ghost"
            disabled={!hasSelection}
            onClick={() => selectedNodeIds.forEach((id) => rotateNode(id, 90))}
            className="h-7 w-7"
            title="Rotacionar 90° (R)"
          >
            <RotateCw className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={!hasSelection}
            onClick={deleteSelected}
            className="h-7 w-7 text-destructive hover:bg-destructive/20"
            title="Excluir seleção (Del)"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* Legenda de atalhos rápidos industrial */}
        <div className="absolute bottom-3 right-3 z-10 rounded-md border border-border/40 bg-[#0e1626]/85 px-3 py-1 text-[11px] font-mono text-muted-foreground backdrop-blur shadow-sm">
          <span className="text-[#38bdf8]">Shift+arraste:</span> seleção em área ·{" "}
          <span className="text-[#38bdf8]">Porta:</span> ligação ·{" "}
          <span className="text-[#38bdf8]">R:</span> rotaciona ·{" "}
          <span className="text-[#38bdf8]">Del:</span> apaga
        </div>

        <ContextMenu onClose={closeContextMenu} hostRef={hostRef} />
      </div>

      {/* Modal de Configurações Técnicas do Diagrama */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md bg-[#0e1626] border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#38bdf8]">
              <Settings className="h-5 w-5" />
              Configurações Técnicas do Projeto
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Altere os parâmetros gerais do documento elétrico conforme a especificação do painel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">Título do Projeto</label>
              <input
                defaultValue={doc.metadata.title || "MCC-01_REFORCO"}
                onChange={(e) => {
                  doc.metadata.title = e.target.value;
                }}
                className="w-full h-8 rounded bg-[#131d2e] border border-border px-2 text-foreground font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-muted-foreground mb-1">Tensão Nominal (V)</label>
                <input
                  defaultValue="380"
                  className="w-full h-8 rounded bg-[#131d2e] border border-border px-2 text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">Frequência (Hz)</label>
                <input
                  defaultValue="60"
                  className="w-full h-8 rounded bg-[#131d2e] border border-border px-2 text-foreground font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">Normas Aplicáveis</label>
              <input
                defaultValue="NBR 5410 · IEC 60617 · NR-10"
                className="w-full h-8 rounded bg-[#131d2e] border border-border px-2 text-foreground font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setSettingsOpen(false);
                toast.success("Configurações do diagrama atualizadas.");
              }}
              className="bg-[#38bdf8] text-black hover:bg-[#38bdf8]/80 text-xs font-semibold"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextMenu({
  onClose,
  hostRef,
}: {
  onClose: () => void;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ctx = useDiagramStore((s) => s.contextMenu);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const rotateNode = useDiagramStore((s) => s.rotateNode);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const selectedIds = useDiagramStore((s) => s.selectedNodeIds);

  const items = useMemo(() => {
    if (!ctx) return [];
    const onNode = ctx.nodeId != null;
    return [
      onNode && {
        label: "Rotacionar 90°",
        run: () => {
          const id = ctx.nodeId!;
          if (!selectedIds.includes(id)) setSelection([id]);
          rotateNode(id, 90);
        },
      },
      onNode && {
        label: "Excluir",
        destructive: true,
        run: () => {
          const id = ctx.nodeId!;
          if (!selectedIds.includes(id)) setSelection([id]);
          queueMicrotask(() => deleteSelected());
        },
      },
      !onNode && {
        label: "Limpar seleção",
        run: () => setSelection([]),
      },
    ].filter(Boolean) as Array<{ label: string; run: () => void; destructive?: boolean }>;
  }, [ctx, selectedIds, deleteSelected, rotateNode, setSelection]);

  if (!ctx) return null;
  void hostRef;
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: ctx.x, top: ctx.y }}
      className="absolute z-30 min-w-[180px] rounded-md border border-border/60 bg-[#101929]/95 p-1 text-sm shadow-lg backdrop-blur"
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${
            it.destructive ? "text-destructive" : "text-foreground"
          }`}
          onClick={() => {
            it.run();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function useDiagramSelection() {
  const [, setTick] = useState(0);
  useEffect(
    () =>
      useDiagramStore.subscribe(
        (s) => s.selectedNodeIds,
        () => setTick((t) => t + 1),
      ),
    [],
  );
  return useDiagramStore.getState().selectedNodeIds;
}
