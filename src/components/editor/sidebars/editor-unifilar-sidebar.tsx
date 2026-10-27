import { useState } from "react";
import {
  Boxes,
  Cable,
  Gauge,
  ChevronDown,
  ChevronRight,
  Search,
  Library,
  MousePointer,
  Pencil,
  Plus,
  Wrench,
  Layers,
  Settings,
} from "lucide-react";
import {
  isBreakerComponent,
  VOLTAI_COMPONENT_DEFINITIONS,
  type VoltaiComponentDefinition,
} from "@/lib/palette/component-catalog";
import { useEditorStore } from "@/lib/editor/store";
import { useI18n } from "@/lib/i18n";

export function EditorUnifilarSidebar() {
  const { t } = useI18n();
  const dragValidation = useEditorStore((s) => s.dragValidation);
  const [search, setSearch] = useState("");
  const [activeTool, setActiveTool] = useState<"library" | "select" | "wire" | "add" | "tools" | "layers" | "settings">("library");

  // Categorias alinhadas com a referência visual do ElétricAi
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    alimentacao: true,
    protecao: true,
    manobra: true,
    cargas: true,
    automacao: true,
    instrumentacao: false,
    iec60617: true,
  });

  const toggleSection = (sec: string) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const filterBySearch = (defs: VoltaiComponentDefinition[]) => {
    if (!search.trim()) return defs;
    const term = search.toLowerCase();
    return defs.filter(
      (c) => c.name.toLowerCase().includes(term) || c.type.toLowerCase().includes(term),
    );
  };

  const alimentacao = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.filter(
      (c) => c.category === "Fonte" || (c.type as string) === "TR" || (c.type as string) === "B" || (c.type as string) === "G",
    ),
  );
  const protecao = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.filter(
      (c) => c.category === "Protecao" || (c.type as string) === "FT" || (c.type as string) === "MPCB",
    ),
  );
  const manobra = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.filter(
      (c) => c.category === "Potencia" || (c.type as string) === "KM" || (c.type as string) === "QS" || (c.type as string) === "KA" || (c.type as string) === "CR",
    ),
  );
  const cargas = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.filter(
      (c) => c.category === "Carga" || (c.type as string) === "M" || (c.type as string) === "BC" || (c.type as string) === "PFC",
    ),
  );
  const automacao = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.filter(
      (c) => c.category === "Controle" || (c.type as string) === "PLC" || (c.type as string) === "VFD" || (c.type as string) === "SS",
    ),
  );
  const instrumentacao = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.filter((c) => c.category === "Medicao" || c.category === "Sinal"),
  );
  const iecComponents = filterBySearch(
    VOLTAI_COMPONENT_DEFINITIONS.slice(0, 16),
  );

  return (
    <div className="flex h-full w-[310px] bg-[#0c121e] border-r border-border/70 select-none overflow-hidden">
      {/* Mini barra de ferramentas vertical à esquerda (como na imagem de referência) */}
      <div className="w-10 shrink-0 flex flex-col items-center py-2.5 gap-2 border-r border-border/60 bg-[#080d17]">
        <ToolButton
          icon={Library}
          title="Biblioteca de Componentes"
          active={activeTool === "library"}
          onClick={() => setActiveTool("library")}
        />
        <ToolButton
          icon={MousePointer}
          title="Ferramenta Seleção"
          active={activeTool === "select"}
          onClick={() => setActiveTool("select")}
        />
        <ToolButton
          icon={Pencil}
          title="Desenhar Condutor / Linha"
          active={activeTool === "wire"}
          onClick={() => setActiveTool("wire")}
        />
        <ToolButton
          icon={Plus}
          title="Inserir Equipamento"
          active={activeTool === "add"}
          onClick={() => setActiveTool("add")}
        />
        <ToolButton
          icon={Wrench}
          title="Ferramentas e Utilidades"
          active={activeTool === "tools"}
          onClick={() => setActiveTool("tools")}
        />
        <ToolButton
          icon={Layers}
          title="Camadas do Projeto"
          active={activeTool === "layers"}
          onClick={() => setActiveTool("layers")}
        />
        <div className="mt-auto">
          <ToolButton
            icon={Settings}
            title="Configurações da Grade"
            active={activeTool === "settings"}
            onClick={() => setActiveTool("settings")}
          />
        </div>
      </div>

      {/* Painel da Biblioteca com busca e categorias */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Cabeçalho BIBLIOTECA */}
        <div className="px-3 pt-2.5 pb-2 border-b border-border/60">
          <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase mb-2">
            Biblioteca
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Contator, Motor, Disjuntor..."
              className="w-full h-7 pl-8 pr-2.5 rounded bg-[#131b2c] border border-border/60 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/80 transition-colors"
            />
          </div>
        </div>

        {/* Lista de Categorias com acordeom e grade de símbolos IEC */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
          <LibraryAccordion
            title="Alimentação"
            count={alimentacao.length}
            open={openSections.alimentacao}
            onToggle={() => toggleSection("alimentacao")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {alimentacao.map((c) => (
                <SymbolCard key={c.type} component={c} />
              ))}
            </div>
          </LibraryAccordion>

          <LibraryAccordion
            title="Dispositivos de Proteção"
            count={protecao.length}
            open={openSections.protecao}
            onToggle={() => toggleSection("protecao")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {protecao.map((c) => (
                <SymbolCard key={c.type} component={c} />
              ))}
            </div>
          </LibraryAccordion>

          <LibraryAccordion
            title="Manobra"
            count={manobra.length}
            open={openSections.manobra}
            onToggle={() => toggleSection("manobra")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {manobra.map((c) => (
                <SymbolCard key={c.type} component={c} />
              ))}
            </div>
          </LibraryAccordion>

          <LibraryAccordion
            title="Motores/Cargas"
            count={cargas.length}
            open={openSections.cargas}
            onToggle={() => toggleSection("cargas")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {cargas.map((c) => (
                <SymbolCard key={c.type} component={c} />
              ))}
            </div>
          </LibraryAccordion>

          <LibraryAccordion
            title="Automação"
            count={automacao.length}
            open={openSections.automacao}
            onToggle={() => toggleSection("automacao")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {automacao.map((c) => (
                <SymbolCard key={c.type} component={c} />
              ))}
            </div>
          </LibraryAccordion>

          <LibraryAccordion
            title="Instrumentação"
            count={instrumentacao.length}
            open={openSections.instrumentacao}
            onToggle={() => toggleSection("instrumentacao")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {instrumentacao.map((c) => (
                <SymbolCard key={c.type} component={c} />
              ))}
            </div>
          </LibraryAccordion>

          <LibraryAccordion
            title="IEC 60617"
            count={iecComponents.length}
            open={openSections.iec60617}
            onToggle={() => toggleSection("iec60617")}
          >
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {iecComponents.map((c) => (
                <SymbolCard key={`iec_${c.type}`} component={c} />
              ))}
            </div>
          </LibraryAccordion>
        </div>

        {/* Rodapé informativo de validação */}
        {dragValidation && (
          <div className="px-2.5 py-1.5 border-t border-border/50 bg-[#080d17] text-[10px] text-muted-foreground truncate font-mono">
            {dragValidation}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: typeof Library;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function LibraryAccordion({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border/40 rounded bg-[#0f1624] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-foreground/90 hover:bg-muted/30 transition-colors"
      >
        <span className="truncate">{title}</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="text-[10px] font-mono text-muted-foreground/60">{count}</span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>
      {open && <div className="px-1.5 pb-2">{children}</div>}
    </div>
  );
}

function SymbolCard({ component }: { component: VoltaiComponentDefinition }) {
  const validateComponent = useEditorStore((s) => s.validateComponent);

  return (
    <div
      draggable
      onDragStart={(event) => {
        validateComponent?.(component.type);
        event.dataTransfer.setData("application/voltai-component", component.type);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${component.name} (${component.type}) - Arraste para o canvas`}
      className="group relative flex flex-col items-center justify-center p-2 rounded border border-border/50 bg-[#141d2e] hover:bg-[#1a263d] hover:border-primary/60 transition-all cursor-grab active:cursor-grabbing shadow-xs"
    >
      <div className="w-8 h-8 flex items-center justify-center text-foreground group-hover:text-primary transition-colors">
        <SymbolThumbnail type={component.type} />
      </div>
      <span className="mt-1 text-[10px] font-mono text-muted-foreground group-hover:text-foreground truncate max-w-full">
        {component.type}
      </span>
    </div>
  );
}

function SymbolThumbnail({ type }: { type: string }) {
  switch (type) {
    case "QF":
    case "MPCB":
    case "breaker":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="7" r="2" />
          <circle cx="16" cy="25" r="2" />
          <line x1="16" y1="2" x2="16" y2="5" />
          <line x1="16" y1="27" x2="16" y2="30" />
          <line x1="16" y1="7" x2="22" y2="23" />
          <line x1="19" y1="13" x2="25" y2="10" />
        </svg>
      );
    case "KM":
    case "contactor":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="7" r="2" />
          <circle cx="16" cy="25" r="2" />
          <line x1="16" y1="2" x2="16" y2="5" />
          <line x1="16" y1="27" x2="16" y2="30" />
          <line x1="16" y1="7" x2="22" y2="23" />
          <path d="M 22 20 A 3 3 0 0 1 22 25" />
        </svg>
      );
    case "FT":
    case "thermal_relay":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <rect x="7" y="7" width="18" height="18" rx="1" />
          <line x1="16" y1="2" x2="16" y2="7" />
          <line x1="16" y1="25" x2="16" y2="30" />
          <path d="M 10 12 L 14 12 L 14 20 L 10 20" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <line x1="20" y1="12" x2="20" y2="20" />
        </svg>
      );
    case "M":
    case "motor":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="15" r="11" />
          <line x1="16" y1="2" x2="16" y2="4" />
          <line x1="9" y1="28" x2="23" y2="28" />
          <path d="M 11 18 L 11 12 L 16 16 L 21 12 L 21 18" strokeWidth="1.2" />
        </svg>
      );
    case "TR":
    case "transformer":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="11" r="7" />
          <circle cx="16" cy="21" r="7" />
          <line x1="16" y1="2" x2="16" y2="4" />
          <line x1="16" y1="28" x2="16" y2="30" />
        </svg>
      );
    case "VFD":
    case "vfd":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="6" width="22" height="20" rx="1" />
          <line x1="5" y1="26" x2="27" y2="6" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="16" y1="26" x2="16" y2="30" />
          <line x1="8" y1="12" x2="14" y2="12" />
          <line x1="8" y1="15" x2="14" y2="15" />
          <path d="M 18 20 Q 20 17 22 20 T 26 20" />
        </svg>
      );
    case "BC":
    case "PFC":
    case "capacitor_bank":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <line x1="5" y1="8" x2="27" y2="8" />
          <line x1="16" y1="2" x2="16" y2="8" />
          <line x1="9" y1="8" x2="9" y2="13" />
          <line x1="6" y1="13" x2="12" y2="13" />
          <line x1="6" y1="18" x2="12" y2="18" />
          <line x1="9" y1="18" x2="9" y2="24" />
          <line x1="16" y1="8" x2="16" y2="13" />
          <line x1="13" y1="13" x2="19" y2="13" />
          <line x1="13" y1="18" x2="19" y2="18" />
          <line x1="16" y1="18" x2="16" y2="24" />
          <line x1="23" y1="8" x2="23" y2="13" />
          <line x1="20" y1="13" x2="26" y2="13" />
          <line x1="20" y1="18" x2="26" y2="18" />
          <line x1="23" y1="18" x2="23" y2="24" />
          <line x1="5" y1="24" x2="27" y2="24" />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );
    case "B":
    case "busbar":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none">
          <line x1="3" y1="16" x2="29" y2="16" strokeWidth="4" />
          <circle cx="8" cy="16" r="2" fill="currentColor" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
          <circle cx="24" cy="16" r="2" fill="currentColor" />
        </svg>
      );
    case "PLC":
    case "plc":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <rect x="4" y="6" width="24" height="20" rx="1" />
          <line x1="12" y1="6" x2="12" y2="26" />
          <line x1="20" y1="6" x2="20" y2="26" />
          <circle cx="8" cy="11" r="1.5" fill="currentColor" />
          <circle cx="8" cy="16" r="1.5" fill="currentColor" />
          <circle cx="8" cy="21" r="1.5" fill="currentColor" />
        </svg>
      );
    case "HMI":
    case "IHM":
    case "hmi":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <rect x="4" y="7" width="24" height="18" rx="1.5" />
          <rect x="7" y="10" width="18" height="12" />
        </svg>
      );
    case "QS":
    case "disconnector":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="7" r="2" />
          <circle cx="16" cy="25" r="2" />
          <line x1="16" y1="2" x2="16" y2="5" />
          <line x1="16" y1="27" x2="16" y2="30" />
          <line x1="16" y1="7" x2="22" y2="22" />
        </svg>
      );
    case "FU":
    case "fuse":
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <rect x="10" y="8" width="12" height="16" />
          <line x1="16" y1="2" x2="16" y2="8" />
          <line x1="16" y1="24" x2="16" y2="30" />
          <line x1="16" y1="8" x2="16" y2="24" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-current fill-none stroke-[1.5]">
          <rect x="8" y="8" width="16" height="16" rx="2" />
          <line x1="16" y1="2" x2="16" y2="8" />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );
  }
}
