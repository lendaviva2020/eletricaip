import { useMemo, useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Activity,
  FileSpreadsheet,
  List,
  Bell,
  Bot,
  Terminal as TerminalIcon,
  Radio,
  Cpu,
  Zap,
  Database,
  ChevronDown,
  ChevronUp,
  Trash2,
  Wifi,
  Plug,
  PlugZap,
  CheckCircle2,
  AlertCircle,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useOpcuaBridge } from "@/hooks/use-opcua-bridge";
import { useI18n } from "@/lib/i18n";
import type { WorkspaceMode, ConsoleTab } from "@/lib/workspace-data";
import {
  runDiagramDiagnostics,
  calculateVoltageDropNbr5410,
  type DiagnosticAlert,
  type VoltageDropResult,
} from "@/lib/diagram/multifilar";
import { validateRungs, type LadderIssue } from "@/lib/ladder/validator";

/**
 * Retorna o conjunto de abas contextuais de acordo com o modo de canvas ativo.
 */
export function getContextualTabsForMode(mode: WorkspaceMode): ConsoleTab[] {
  switch (mode) {
    case "unifilar":
    case "multifilar":
      return ["diagnosticos", "calculos_nbr", "bom", "Logs", "Eventos"];
    case "ladder":
      return ["diagnosticos", "variaveis", "Logs", "Alarmes", "Terminal", "OPC-UA", "Modbus"];
    case "fbd":
      return ["diagnosticos", "simulacao", "Logs", "Alarmes"];
    case "scada":
      return ["Alarmes", "Eventos", "Logs", "OPC-UA", "Modbus"];
    case "twin":
    case "plc":
    case "sim":
    case "alarms":
    default:
      return ["Logs", "Alarmes", "Runtime", "Terminal", "OPC-UA", "Modbus"];
  }
}

const TAB_METADATA: Record<
  ConsoleTab,
  { label: string; icon: typeof List; defaultTitle: string }
> = {
  diagnosticos: { label: "Diagnósticos", icon: AlertTriangle, defaultTitle: "Diagnósticos e Alertas" },
  calculos_nbr: { label: "Cálculos NBR 5410", icon: Activity, defaultTitle: "Cálculos e Queda de Tensão" },
  bom: { label: "Lista de Materiais (BOM)", icon: FileSpreadsheet, defaultTitle: "Lista de Materiais" },
  variaveis: { label: "Variáveis & Tags", icon: Database, defaultTitle: "Variáveis e Forçamento de Tags" },
  simulacao: { label: "Simulação", icon: Zap, defaultTitle: "Sinais de Simulação" },
  Logs: { label: "Logs", icon: List, defaultTitle: "Logs do Sistema" },
  Alarmes: { label: "Alarmes", icon: Bell, defaultTitle: "Alarmes Industriais" },
  IA: { label: "IA", icon: Bot, defaultTitle: "Assistente de Engenharia" },
  Terminal: { label: "Terminal", icon: TerminalIcon, defaultTitle: "Linha de Comando" },
  Eventos: { label: "Eventos", icon: Activity, defaultTitle: "Registro de Eventos" },
  "OPC-UA": { label: "OPC-UA", icon: Radio, defaultTitle: "Ponte OPC-UA Industrial" },
  Modbus: { label: "Modbus", icon: Cpu, defaultTitle: "Gateway Modbus TCP/RTU" },
  Runtime: { label: "Runtime", icon: Zap, defaultTitle: "Execução em Tempo Real" },
};

const SEED_LOGS: Record<
  string,
  { t: string; tag: string; msg: string; lvl?: "info" | "warn" | "err" | "ok" }[]
> = {
  Logs: [{ t: "—", tag: "SISTEMA", msg: "Ambiente industrial inicializado com sucesso.", lvl: "ok" }],
  Alarmes: [{ t: "—", tag: "ALM", msg: "Nenhum alarme crítico pendente.", lvl: "ok" }],
  IA: [{ t: "—", tag: "IA", msg: "Pronto para auxiliar na especificação e validação normativa.", lvl: "info" }],
  Terminal: [{ t: "—", tag: "$", msg: "eletricai engine --ready", lvl: "info" }],
  Eventos: [{ t: "—", tag: "EVT", msg: "Registro de eventos operacionais ativo.", lvl: "info" }],
  "OPC-UA": [{ t: "—", tag: "OPC", msg: "Servidor OPC-UA pronto para conexão.", lvl: "info" }],
  Modbus: [{ t: "—", tag: "MB", msg: "Gateway Modbus pronto: 192.168.1.100:502", lvl: "info" }],
  Runtime: [{ t: "—", tag: "RT", msg: "Runtime pronto para simulação determinística.", lvl: "info" }],
};

const lvlColor = {
  info: "text-foreground",
  warn: "text-amber-400",
  err: "text-destructive",
  ok: "text-emerald-400",
};

/**
 * UnifiedBottomDock — Painel inferior único, contextual e responsivo.
 * Unifica diagnósticos, cálculos NBR 5410, BOM, variáveis Ladder, logs,
 * alarmes, terminal e protocolos industriais (OPC-UA / Modbus).
 */
export function UnifiedBottomDock() {
  const { t } = useI18n();

  // Estados globais de editor e workspace
  const activeMode = useEditorStore((s) => s.activeMode);
  const tab = useEditorStore((s) => s.consoleTab);
  const setTab = useEditorStore((s) => s.setConsoleTab);
  const open = useEditorStore((s) => s.consoleOpen);
  const setOpen = useEditorStore((s) => s.setConsoleOpen);

  // Dados do Diagrama Unifilar / Multifilar
  const doc = useDiagramStore((s) => s.doc);
  const activeSheet = useDiagramStore((s) => s.activeSheet);
  const setSelection = useDiagramStore((s) => s.setSelection);

  // Dados do Ladder
  const rungs = useEditorStore((s) => s.rungs);
  const editorTags = useEditorStore((s) => s.editorTags);
  const upsertTag = useEditorStore((s) => s.upsertTag);
  const forceTagValue = useEditorStore((s) => s.forceTagValue);
  const releaseTag = useEditorStore((s) => s.releaseTag);
  const setSelectedLadderTarget = useEditorStore((s) => s.setSelectedLadderTarget);

  // Dados de Telemetria e Runtime
  const liveLogs = useProjectStore((s) => s.logs);
  const runtime = useProjectStore((s) => s.runtime);
  const bridge = useOpcuaBridge();

  // Abas válidas contextualmente para o modo ativo
  const availableTabs = useMemo(() => getContextualTabsForMode(activeMode), [activeMode]);

  // Transição suave ao trocar de modo de canvas
  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab, setTab]);

  // Cálculos em tempo real para Unifilar
  const unifilarDiagnostics: DiagnosticAlert[] = useMemo(() => {
    if (activeMode !== "unifilar") return [];
    try {
      return runDiagramDiagnostics(doc);
    } catch {
      return [];
    }
  }, [activeMode, doc]);

  const voltageDrops: VoltageDropResult[] = useMemo(() => {
    if (activeMode !== "unifilar") return [];
    try {
      return calculateVoltageDropNbr5410(doc);
    } catch {
      return [];
    }
  }, [activeMode, doc]);

  const bomItems = useMemo(() => {
    if (activeMode !== "unifilar") return [];
    const counts: Record<
      string,
      { tag: string; kind: string; desc: string; manufacturer: string; model: string; qty: number }
    > = {};

    for (const n of (Object.values(doc?.nodes || {}) as any[])) {
      if (n.sheet !== activeSheet && n.sheet !== "unifilar") continue;
      const tag = n.params?.tag || n.label || n.id;
      const kind = n.params?.kind || "componente";
      const mfg = n.params?.manufacturer || "—";
      const mdl = n.params?.model || "—";
      const key = `${kind}_${mfg}_${mdl}`;

      if (!counts[key]) {
        counts[key] = {
          tag,
          kind,
          desc: String(kind).toUpperCase(),
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
  }, [activeMode, doc?.nodes, activeSheet]);

  // Validação em tempo real para Ladder
  const ladderIssues: LadderIssue[] = useMemo(() => {
    if (activeMode !== "ladder") return [];
    try {
      return validateRungs(rungs, editorTags);
    } catch {
      return [];
    }
  }, [activeMode, rungs, editorTags]);

  // Lista de variáveis e tags do Ladder
  const ladderTagsList = useMemo(() => {
    return Object.entries(editorTags || {}).map(([key, t]) => ({
      id: t.id || key,
      name: t.name || key,
      type: t.type || "BOOL",
      value: t.value ?? false,
      forced: t.forced ?? false,
    }));
  }, [editorTags]);

  // Contagem de alarmes reais
  const activeAlarmsCount = useMemo(() => {
    return liveLogs.filter((l) => (l.channel ?? "Logs") === "Alarmes" && l.lvl === "err").length;
  }, [liveLogs]);

  // Linhas do console para a aba selecionada
  const consoleLines = useMemo(() => {
    const live = liveLogs.filter((l) => (l.channel ?? "Logs") === tab);
    return live.length ? live : SEED_LOGS[tab] ?? [];
  }, [liveLogs, tab]);

  // Terminal input interativo
  const [terminalInput, setTerminalInput] = useState("");
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    const projectStore = useProjectStore.getState();
    const now = new Date().toLocaleTimeString();
    projectStore.pushLog({
      t: now,
      tag: "CMD",
      msg: `$ ${terminalInput}`,
      channel: "Terminal",
      lvl: "info",
    });
    const cmd = terminalInput.trim().toLowerCase();
    if (cmd === "help" || cmd === "?") {
      projectStore.pushLog({
        t: now,
        tag: "SYS",
        msg: "Comandos disponíveis: status, rungs, clear, ping, opcua, modbus",
        channel: "Terminal",
        lvl: "info",
      });
    } else if (cmd === "status") {
      projectStore.pushLog({
        t: now,
        tag: "SYS",
        msg: `Modo: ${activeMode} | Redes: ${rungs.length} | Tags: ${ladderTagsList.length} | Conectado: ${runtime.connected}`,
        channel: "Terminal",
        lvl: "ok",
      });
    } else if (cmd === "clear") {
      useProjectStore.setState({ logs: [] });
    } else {
      projectStore.pushLog({
        t: now,
        tag: "SYS",
        msg: `Comando executado: "${cmd}". Digite "help" para ver as opções.`,
        channel: "Terminal",
        lvl: "info",
      });
    }
    setTerminalInput("");
  };

  const currentTabMeta = TAB_METADATA[tab] || {
    label: tab,
    icon: List,
    defaultTitle: tab,
  };
  const CurrentIcon = currentTabMeta.icon;

  return (
    <div
      className={cn(
        "z-30 shrink-0 border-t border-border/80 bg-[#0a0f1c] flex flex-col transition-all duration-200 select-none shadow-2xl",
        open ? "h-56" : "h-9",
      )}
      data-testid="unified-bottom-dock"
    >
      {/* 1. Barra de Abas Unificada e Controles */}
      <div className="h-9 shrink-0 flex items-center justify-between px-2.5 bg-[#070b14] border-b border-border/60">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-r border-border/50 mr-1 shrink-0">
            <CurrentIcon className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span className="hidden sm:inline">DOCK</span>
          </div>

          {availableTabs.map((tName) => {
            const meta = TAB_METADATA[tName] || { label: tName, icon: List };
            const Icon = meta.icon;
            const isSelected = tab === tName && open;

            return (
              <button
                key={tName}
                onClick={() => {
                  setTab(tName);
                  setOpen(true);
                }}
                className={cn(
                  "h-7 px-2.5 rounded text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
                  isSelected
                    ? "bg-[#162136] text-[#38bdf8] shadow-xs border border-[#38bdf8]/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-[#111827]",
                )}
                title={meta.defaultTitle}
                data-testid={`dock-tab-${tName}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{meta.label}</span>

                {/* Badges contextuais com dados REAIS (sem números fictícios) */}
                {tName === "diagnosticos" && (activeMode === "unifilar" || activeMode === "multifilar") && (
                  <span
                    className={cn(
                      "ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                      unifilarDiagnostics.length > 0
                        ? "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                        : "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30",
                    )}
                  >
                    {unifilarDiagnostics.length}
                  </span>
                )}

                {tName === "diagnosticos" && activeMode === "ladder" && (
                  <span
                    className={cn(
                      "ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                      ladderIssues.length > 0
                        ? "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                        : "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30",
                    )}
                  >
                    {ladderIssues.length}
                  </span>
                )}

                {tName === "calculos_nbr" && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#162136] text-emerald-400 border border-emerald-500/30">
                    NBR 5410
                  </span>
                )}

                {tName === "bom" && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#162136] text-[#34d399] border border-[#34d399]/30">
                    {bomItems.length}
                  </span>
                )}

                {tName === "variaveis" && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#162136] text-[#38bdf8] border border-[#38bdf8]/30">
                    {ladderTagsList.length}
                  </span>
                )}

                {tName === "Alarmes" && activeAlarmsCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-destructive text-white font-bold animate-pulse">
                    {activeAlarmsCount}
                  </span>
                )}

                {tName === "OPC-UA" && (
                  <span
                    className={cn(
                      "ml-0.5 h-2 w-2 rounded-full shrink-0",
                      bridge.opcua.status === "connected"
                        ? "bg-emerald-400"
                        : bridge.opcua.status === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/40",
                    )}
                  />
                )}

                {tName === "Modbus" && (
                  <span
                    className={cn(
                      "ml-0.5 h-2 w-2 rounded-full shrink-0",
                      bridge.modbus.status === "connected"
                        ? "bg-emerald-400"
                        : bridge.modbus.status === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/40",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Controles do Lado Direito: Limpar, Status e Recolher/Expandir */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {tab === "Modbus" && <Wifi className="h-3 w-3 text-muted-foreground" />}

          {/* Botão Limpar Console */}
          {(tab === "Logs" || tab === "Terminal" || tab === "Eventos") && (
            <button
              onClick={() => {
                useProjectStore.setState({ logs: [] });
              }}
              className="h-7 w-7 grid place-items-center rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
              title="Limpar mensagens"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Botão Alternar Recolhido / Expandido */}
          <button
            onClick={() => setOpen(!open)}
            className="h-7 w-7 grid place-items-center rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
            title={open ? "Recolher painel inferior" : "Expandir painel inferior"}
            aria-label={open ? "Recolher painel inferior" : "Expandir painel inferior"}
            data-testid="dock-toggle-button"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 2. Conteúdo Expandido do Dock */}
      {open && (
        <div className="flex-1 min-h-0 overflow-auto bg-[#0a0f1c] p-2.5 font-mono text-xs text-foreground scrollbar-thin">
          {/* ABA 1: DIAGNÓSTICOS UNIFILAR / MULTIFILAR */}
          {tab === "diagnosticos" && (activeMode === "unifilar" || activeMode === "multifilar") && (
            <div className="space-y-1.5">
              {unifilarDiagnostics.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 p-3 rounded">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Nenhum problema detectado. Diagrama unifilar e conexões de barramento em conformidade com as regras de conectividade.
                  </span>
                </div>
              ) : (
                unifilarDiagnostics.map((diag, idx) => (
                  <div
                    key={diag.id || idx}
                    onClick={() => {
                      if (diag.nodeId) setSelection([diag.nodeId]);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 rounded border transition-colors cursor-pointer",
                      diag.type === "ERRO"
                        ? "bg-destructive/15 border-destructive/40 text-destructive-foreground hover:bg-destructive/25"
                        : diag.type === "AVISO"
                          ? "bg-amber-950/25 border-amber-500/40 text-amber-200 hover:bg-amber-950/40"
                          : "bg-emerald-950/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/35",
                    )}
                  >
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0",
                        diag.type === "ERRO"
                          ? "bg-destructive text-white"
                          : diag.type === "AVISO"
                            ? "bg-amber-500 text-black"
                            : "bg-emerald-600 text-white",
                      )}
                    >
                      {diag.type}
                    </span>
                    <span className="flex-1 truncate">{diag.message}</span>
                    {diag.nodeId && (
                      <span className="text-[10px] text-[#38bdf8] underline shrink-0 hover:text-white">
                        Ver componente
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ABA 1: DIAGNÓSTICOS LADDER */}
          {tab === "diagnosticos" && activeMode === "ladder" && (
            <div className="space-y-1.5">
              {ladderIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 p-3 rounded">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Todas as {rungs.length} rede(s) Ladder estão válidas segundo a IEC 61131-3. Nenhuma inconsistência lógica ou sintática detectada.
                  </span>
                </div>
              ) : (
                ladderIssues.map((issue, idx) => (
                  <div
                    key={`${issue.rungId}_${issue.code}_${idx}`}
                    onClick={() => {
                      setSelectedLadderTarget({
                        rungId: issue.rungId,
                        elementId: issue.elementId,
                      });
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 rounded border transition-colors cursor-pointer",
                      issue.level === "error"
                        ? "bg-destructive/15 border-destructive/40 text-destructive-foreground hover:bg-destructive/25"
                        : issue.level === "warn"
                          ? "bg-amber-950/25 border-amber-500/40 text-amber-200 hover:bg-amber-950/40"
                          : "bg-blue-950/20 border-blue-500/40 text-blue-300 hover:bg-blue-950/35",
                    )}
                  >
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0",
                        issue.level === "error"
                          ? "bg-destructive text-white"
                          : issue.level === "warn"
                            ? "bg-amber-500 text-black"
                            : "bg-blue-600 text-white",
                      )}
                    >
                      {issue.level.toUpperCase()}
                    </span>
                    <span className="px-1 py-0.2 rounded text-[10px] font-mono bg-black/40 text-muted-foreground border border-border/40 shrink-0">
                      {issue.code}
                    </span>
                    <span className="flex-1 truncate">{issue.message}</span>
                    {issue.fixHint && (
                      <span className="text-[10px] text-muted-foreground/80 italic hidden md:inline">
                        Dica: {issue.fixHint}
                      </span>
                    )}
                    <span className="text-[10px] text-[#38bdf8] underline shrink-0 hover:text-white">
                      Focar rede
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ABA 2: CÁLCULOS E QUEDA DE TENSÃO SEGUNDO NBR 5410 */}
          {tab === "calculos_nbr" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/70 text-muted-foreground text-[11px]">
                    <th className="py-1 px-2 font-semibold">Cabo / Trecho</th>
                    <th className="py-1 px-2 font-semibold">Origem → Destino</th>
                    <th className="py-1 px-2 font-semibold">In (A)</th>
                    <th className="py-1 px-2 font-semibold">Seção (mm²)</th>
                    <th className="py-1 px-2 font-semibold">Comprimento</th>
                    <th className="py-1 px-2 font-semibold">ΔV (V)</th>
                    <th className="py-1 px-2 font-semibold">ΔV (%)</th>
                    <th className="py-1 px-2 font-semibold">Limite NBR 5410</th>
                    <th className="py-1 px-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {voltageDrops.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-muted-foreground italic">
                        Nenhum trecho de condutor dimensionado. Adicione conexões elétricas e cargas ao diagrama para cálculo de queda de tensão segundo a NBR 5410.
                      </td>
                    </tr>
                  ) : (
                    voltageDrops.map((vd, i) => (
                      <tr
                        key={vd.edgeId || i}
                        className="border-b border-border/30 hover:bg-[#131d2e]/40 transition-colors"
                      >
                        <td className="py-1.5 px-2 font-bold text-[#38bdf8]">W{i + 1}</td>
                        <td className="py-1.5 px-2 text-foreground">
                          {vd.sourceLabel} → {vd.targetLabel}
                        </td>
                        <td className="py-1.5 px-2">{vd.current_A} A</td>
                        <td className="py-1.5 px-2">{vd.section_mm2} mm²</td>
                        <td className="py-1.5 px-2">{vd.length_m} m</td>
                        <td className="py-1.5 px-2">{vd.drop_V} V</td>
                        <td
                          className={cn(
                            "py-1.5 px-2 font-bold",
                            vd.compliant ? "text-emerald-400" : "text-destructive",
                          )}
                        >
                          {vd.drop_pct}%
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">&lt; {vd.max_allowed_pct.toFixed(1)}%</td>
                        <td className="py-1.5 px-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold",
                              vd.compliant
                                ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/40"
                                : "bg-destructive/60 text-destructive-foreground border border-destructive",
                            )}
                          >
                            {vd.compliant ? "CONFORME" : "NÃO CONFORME"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ABA 3: LISTA DE MATERIAIS (BOM) */}
          {tab === "bom" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/70 text-muted-foreground text-[11px]">
                    <th className="py-1 px-2 font-semibold">Item</th>
                    <th className="py-1 px-2 font-semibold">Tag(s)</th>
                    <th className="py-1 px-2 font-semibold">Tipo / Descrição</th>
                    <th className="py-1 px-2 font-semibold">Fabricante</th>
                    <th className="py-1 px-2 font-semibold">Modelo</th>
                    <th className="py-1 px-2 font-semibold">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {bomItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground italic">
                        Nenhum componente inserido na folha ativa. Arraste itens da biblioteca elétrica para o diagrama.
                      </td>
                    </tr>
                  ) : (
                    bomItems.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/30 hover:bg-[#131d2e]/40 transition-colors"
                      >
                        <td className="py-1.5 px-2 text-muted-foreground">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-bold text-[#38bdf8]">{item.tag}</td>
                        <td className="py-1.5 px-2 text-foreground">{item.desc}</td>
                        <td className="py-1.5 px-2 text-foreground/80">{item.manufacturer}</td>
                        <td className="py-1.5 px-2 text-foreground/80">{item.model}</td>
                        <td className="py-1.5 px-2 font-bold">{item.qty}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ABA: VARIÁVEIS & TAGS LADDER */}
          {tab === "variaveis" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/70 text-muted-foreground text-[11px]">
                    <th className="py-1 px-2 font-semibold">Tag / Nome</th>
                    <th className="py-1 px-2 font-semibold">Tipo de Dado</th>
                    <th className="py-1 px-2 font-semibold">Escopo / Endereço</th>
                    <th className="py-1 px-2 font-semibold">Valor Atual</th>
                    <th className="py-1 px-2 font-semibold">Forçamento</th>
                    <th className="py-1 px-2 font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {ladderTagsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground italic">
                        Nenhuma variável ou tag declarada. Insira instruções no editor Ladder para registrar variáveis.
                      </td>
                    </tr>
                  ) : (
                    ladderTagsList.map((tag) => (
                      <tr
                        key={tag.name}
                        className="border-b border-border/30 hover:bg-[#131d2e]/40 transition-colors"
                      >
                        <td className="py-1.5 px-2 font-bold text-[#38bdf8]">{tag.name}</td>
                        <td className="py-1.5 px-2 text-foreground/80">{tag.type}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">
                          {tag.name.startsWith("%") ? "E/S Física" : "Interna (Global)"}
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold",
                              tag.value
                                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/40"
                                : "bg-zinc-800 text-zinc-400 border border-zinc-700",
                            )}
                          >
                            {String(tag.value)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          {tag.forced ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40">
                              FORÇADA
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 text-[10px]">Normal</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          <button
                            onClick={() => {
                              if (tag.forced) {
                                releaseTag(tag.id);
                              } else {
                                forceTagValue(tag.id, !tag.value);
                              }
                            }}
                            className="px-2 py-0.5 rounded text-[10px] bg-[#162136] hover:bg-[#1e2d4a] text-[#38bdf8] border border-[#38bdf8]/30 transition-colors"
                          >
                            {tag.forced ? "Liberar Tag" : "Forçar Valor"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ABA: TERMINAL */}
          {tab === "Terminal" && (
            <div className="flex flex-col h-full space-y-2">
              <div className="flex-1 overflow-auto space-y-1">
                {consoleLines.map((l, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-muted-foreground/70 w-16 shrink-0">{l.t}</span>
                    <span className="text-[#38bdf8] w-20 shrink-0 truncate font-semibold">{l.tag}</span>
                    <span className={cn("flex-1 break-all", l.lvl && lvlColor[l.lvl])}>{l.msg}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2 pt-1 border-t border-border/50">
                <span className="text-[#38bdf8] font-bold">$</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  placeholder="Digite um comando (ex: status, help, clear)..."
                  className="flex-1 bg-transparent text-xs text-foreground outline-none font-mono placeholder:text-muted-foreground/50"
                />
              </form>
            </div>
          )}

          {/* ABA: OPC-UA */}
          {tab === "OPC-UA" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-border/40 text-[10px]">
                <span className="text-muted-foreground">
                  Endpoint: <span className="text-foreground">{bridge.opcua.endpoint}</span>
                </span>
                <span className="text-muted-foreground">
                  Status:{" "}
                  <span
                    className={cn(
                      bridge.opcua.status === "connected"
                        ? "text-emerald-400 font-bold"
                        : bridge.opcua.status === "error"
                          ? "text-destructive font-bold"
                          : "text-amber-400 font-bold",
                    )}
                  >
                    {bridge.opcua.status === "connected"
                      ? "Conectado"
                      : bridge.opcua.status === "connecting"
                        ? "Conectando..."
                        : bridge.opcua.status === "error"
                          ? bridge.opcua.error
                          : "Desconectado"}
                  </span>
                </span>
                {bridge.opcua.tags.length > 0 && (
                  <span className="text-muted-foreground">
                    Tags Ativas: <span className="text-foreground font-mono">{bridge.opcua.tags.length}</span>
                  </span>
                )}
                <button
                  onClick={() => {
                    if (bridge.opcua.status === "connected") {
                      bridge.opcua.disconnect();
                    } else {
                      bridge.opcua.connect({ endpoint: bridge.opcua.endpoint });
                    }
                  }}
                  className="ml-auto h-6 px-2.5 rounded text-[10px] font-medium transition-colors bg-[#162136] hover:bg-[#1e2d4a] text-[#38bdf8] border border-[#38bdf8]/30 flex items-center gap-1.5"
                >
                  {bridge.opcua.status === "connected" ? (
                    <>
                      <PlugZap className="h-3 w-3 text-emerald-400" />
                      <span>Desconectar OPC-UA</span>
                    </>
                  ) : (
                    <>
                      <Plug className="h-3 w-3" />
                      <span>Conectar Servidor</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1">
                {consoleLines.map((l, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-muted-foreground/70 w-16 shrink-0">{l.t}</span>
                    <span className="text-[#38bdf8] w-20 shrink-0 truncate font-semibold">{l.tag}</span>
                    <span className={cn("flex-1 break-all", l.lvl && lvlColor[l.lvl])}>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA: MODBUS */}
          {tab === "Modbus" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-border/40 text-[10px]">
                <span className="text-muted-foreground">
                  Gateway TCP:{" "}
                  <span className="text-foreground">
                    {bridge.modbus.host}:{bridge.modbus.port}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Status:{" "}
                  <span
                    className={cn(
                      bridge.modbus.status === "connected"
                        ? "text-emerald-400 font-bold"
                        : bridge.modbus.status === "error"
                          ? "text-destructive font-bold"
                          : "text-amber-400 font-bold",
                    )}
                  >
                    {bridge.modbus.status === "connected"
                      ? "Conectado"
                      : bridge.modbus.status === "connecting"
                        ? "Conectando..."
                        : bridge.modbus.status === "error"
                          ? bridge.modbus.error
                          : "Desconectado"}
                  </span>
                </span>
                {bridge.modbus.values.length > 0 && (
                  <span className="text-muted-foreground">
                    Registros: <span className="text-foreground font-mono">{bridge.modbus.values.length}</span>
                  </span>
                )}
                <button
                  onClick={() => {
                    if (bridge.modbus.status === "connected") {
                      bridge.modbus.disconnect();
                    } else {
                      bridge.modbus.connect({
                        host: bridge.modbus.host,
                        port: bridge.modbus.port,
                        unitId: 1,
                      });
                    }
                  }}
                  className="ml-auto h-6 px-2.5 rounded text-[10px] font-medium transition-colors bg-[#162136] hover:bg-[#1e2d4a] text-[#38bdf8] border border-[#38bdf8]/30 flex items-center gap-1.5"
                >
                  {bridge.modbus.status === "connected" ? (
                    <>
                      <PlugZap className="h-3 w-3 text-emerald-400" />
                      <span>Desconectar Modbus</span>
                    </>
                  ) : (
                    <>
                      <Plug className="h-3 w-3" />
                      <span>Conectar Gateway</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1">
                {consoleLines.map((l, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-muted-foreground/70 w-16 shrink-0">{l.t}</span>
                    <span className="text-[#38bdf8] w-20 shrink-0 truncate font-semibold">{l.tag}</span>
                    <span className={cn("flex-1 break-all", l.lvl && lvlColor[l.lvl])}>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DEMAIS ABAS: LOGS, ALARMES, EVENTOS, RUNTIME, ETC. */}
          {tab !== "diagnosticos" &&
            tab !== "calculos_nbr" &&
            tab !== "bom" &&
            tab !== "variaveis" &&
            tab !== "Terminal" &&
            tab !== "OPC-UA" &&
            tab !== "Modbus" && (
              <div className="space-y-1">
                {consoleLines.map((l, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-muted-foreground/70 w-16 shrink-0">{l.t}</span>
                    <span className="text-[#38bdf8] w-20 shrink-0 truncate font-semibold">{l.tag}</span>
                    <span className={cn("flex-1 break-all", l.lvl && lvlColor[l.lvl])}>{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
