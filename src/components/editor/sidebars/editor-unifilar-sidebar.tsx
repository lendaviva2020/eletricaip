import { useState, useMemo, useCallback } from "react";
import {
  Cube,
  CaretDown,
  CaretRight,
  MagnifyingGlass,
  X,
  Lightning,
  Shield,
  Pulse,
  Cpu,
  Power,
  ArrowCounterClockwise,
  SidebarSimple,
} from "@phosphor-icons/react";
import {
  VOLTAI_COMPONENT_DEFINITIONS,
  type VoltaiComponentDefinition,
} from "@/lib/palette/component-catalog";
import { useEditorStore } from "@/lib/editor/store";
import { useI18n } from "@/lib/i18n";

/**
 * Metadados técnicos enriquecidos para exibição profissional na biblioteca.
 * Inclui descrição de uso/aplicação prática e norma técnica de referência (IEC / NBR).
 */
export const COMPONENT_METADATA: Record<string, { desc: string; norm: string; tag: string }> = {
  QF: {
    desc: "Disjuntor termomagnético contra sobrecorrente e curto-circuito",
    norm: "IEC 60947-2 / NBR NM 60898",
    tag: "QF",
  },
  QS: {
    desc: "Seccionadora de carga com isolamento e abertura visível",
    norm: "IEC 60947-3 / NBR IEC 60947-3",
    tag: "QS",
  },
  DR: {
    desc: "Disjuntor/interruptor diferencial residual (proteção contra choque e fuga)",
    norm: "NBR NM 61008 / 61009",
    tag: "DR",
  },
  FU: {
    desc: "Fusível de proteção ultrarrápida / gG para limitação de curto",
    norm: "IEC 60269 / NBR IEC 60269",
    tag: "FU",
  },
  SPD: {
    desc: "Dispositivo de proteção contra surtos transitórios (DPS)",
    norm: "NBR 5410 / IEC 61643",
    tag: "DPS",
  },
  TVSS: {
    desc: "Supressor de transitórios de alta energia para painéis críticos",
    norm: "UL 1449 / IEC 61643",
    tag: "DPS",
  },
  KM: {
    desc: "Contator tripolar eletromagnético de potência para AC-3",
    norm: "IEC 60947-4-1",
    tag: "KM",
  },
  KA: {
    desc: "Relé auxiliar de comando para multiplicação de contatos",
    norm: "IEC 61810 / IEC 60947-5-1",
    tag: "KA",
  },
  FR: {
    desc: "Relé térmico bimetálico de sobrecarga com sensibilidade à falta de fase",
    norm: "IEC 60947-4-1",
    tag: "FR",
  },
  M: {
    desc: "Motor de indução trifásico com rotor em gaiola de esquilo",
    norm: "IEC 60034 / NBR 17094",
    tag: "M",
  },
  SS: {
    desc: "Chave de partida suave (soft-starter) com tiristores e rampa",
    norm: "IEC 60947-4-2",
    tag: "SS",
  },
  VFD: {
    desc: "Inversor de frequência variável para controle escalar/vetorial de velocidade",
    norm: "IEC 61800",
    tag: "VFD",
  },
  TR: {
    desc: "Transformador trifásico/monofásico para isolação e rebaixamento de tensão",
    norm: "IEC 60076 / NBR 5356",
    tag: "TR",
  },
  PS: {
    desc: "Fonte chaveada industrial AC/DC 24Vcc estabilizada para comando",
    norm: "IEC 61204 / NBR IEC 61204",
    tag: "PS",
  },
  PLC: {
    desc: "Controlador Lógico Programável (CPU + Módulos de E/S)",
    norm: "IEC 61131-2",
    tag: "PLC",
  },
  KT: {
    desc: "Relé temporizador eletrônico (on-delay / off-delay / cíclico)",
    norm: "IEC 61812-1",
    tag: "KT",
  },
  CT: {
    desc: "Contador eletromecânico/digital de pulsos industriais",
    norm: "IEC 61131",
    tag: "CT",
  },
  BC: {
    desc: "Banco automático de capacitores para correção do fator de potência",
    norm: "IEC 60831 / NBR IEC 60831",
    tag: "BC",
  },
  PFC: {
    desc: "Estágio de compensação de potência reativa (kVAR)",
    norm: "IEC 60831",
    tag: "PFC",
  },
  G: {
    desc: "Grupo gerador diesel síncrono para emergência e cogeração",
    norm: "IEC 60034 / ISO 8528",
    tag: "G",
  },
  UPS: {
    desc: "Sistema ininterrupto de energia (no-break) de dupla conversão",
    norm: "IEC 62040 / NBR 15014",
    tag: "UPS",
  },
  TC: {
    desc: "Transformador de corrente para medição e proteção de alimentadores",
    norm: "IEC 61869-2 / NBR 6856",
    tag: "TC",
  },
  TP: {
    desc: "Transformador de potencial para instrumentação de média/baixa tensão",
    norm: "IEC 61869-3 / NBR 6855",
    tag: "TP",
  },
  MPCB: {
    desc: "Disjuntor-motor coordenado com proteção térmica e magnética combinadas",
    norm: "IEC 60947-4-1",
    tag: "QM",
  },
  CR: {
    desc: "Relé de interface e isolamento galvânico para sinais discretos",
    norm: "IEC 60947-5-1",
    tag: "CR",
  },
  kWh: {
    desc: "Multimedidor digital para grandezas elétricas (V, A, kW, kWh, THD)",
    norm: "IEC 62053 / NBR 14519",
    tag: "ME",
  },
  IED: {
    desc: "Relé inteligente microprocessado de proteção e supervisão (50/51/87)",
    norm: "IEC 60255 / IEC 61850",
    tag: "IED",
  },
  SA: {
    desc: "Chave comutadora seletora rotativa manual (Auto/Manual/Desl)",
    norm: "IEC 60947-5-1",
    tag: "SA",
  },
  ES: {
    desc: "Botão cogumelo de parada de emergência com trava e rearme por giro",
    norm: "ISO 13850 / IEC 60947-5-5",
    tag: "SE",
  },
  HL: {
    desc: "Sinaleiro luminoso LED indicador de estado operacional",
    norm: "IEC 60947-5-1",
    tag: "HL",
  },
  HZ: {
    desc: "Sinalizador sonoro / sirene industrial de alarme e advertência",
    norm: "IEC 60947-5-1",
    tag: "HZ",
  },
  R: {
    desc: "Resistor de frenagem para absorção de energia regenerativa de motores",
    norm: "NBR 5410",
    tag: "R",
  },
  L: {
    desc: "Reator indutivo de linha para atenuação de picos e harmônicos",
    norm: "IEC 60076-6",
    tag: "L",
  },
  B: {
    desc: "Barramento blindado de distribuição principal de cobre eletrolítico",
    norm: "NBR 5410 / IEC 61439",
    tag: "BB",
  },
  SR: {
    desc: "Relé de segurança com duplo canal redundante e monitoramento de rearme",
    norm: "ISO 13849-1 / IEC 62061 (Cat 4 / PLe)",
    tag: "SR",
  },
  TCTERRA: {
    desc: "Sensor toroidal de núcleo envolvente para detecção de corrente residual à terra",
    norm: "NBR 5410 / IEC 60947-2",
    tag: "TT",
  },
};

export function EditorUnifilarSidebar() {
  const { t } = useI18n();
  const dragValidation = useEditorStore((s) => s.dragValidation);
  const [search, setSearch] = useState("");

  // Categorias de engenharia elétrica
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    alimentacao: true,
    protecao: true,
    manobra: true,
    cargas: true,
    automacao: true,
    instrumentacao: false,
    todos: false,
  });

  const toggleSection = (sec: string) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const filterBySearch = useCallback(
    (defs: readonly VoltaiComponentDefinition[]) => {
      if (!search.trim()) return defs;
      const term = search.toLowerCase();
      return defs.filter((c) => {
        const meta = COMPONENT_METADATA[c.type];
        return (
          c.name.toLowerCase().includes(term) ||
          c.type.toLowerCase().includes(term) ||
          (c.tagPrefix && c.tagPrefix.toLowerCase().includes(term)) ||
          (meta && meta.desc.toLowerCase().includes(term)) ||
          (meta && meta.norm.toLowerCase().includes(term)) ||
          (meta && meta.tag.toLowerCase().includes(term)) ||
          c.category.toLowerCase().includes(term)
        );
      });
    },
    [search],
  );

  const alimentacao = useMemo(
    () =>
      filterBySearch(
        VOLTAI_COMPONENT_DEFINITIONS.filter((c) => {
          const t = c.type as string;
          return (
            c.category === "Fonte" ||
            t === "TR" ||
            t === "B" ||
            t === "G" ||
            t === "UPS" ||
            t === "PS"
          );
        }),
      ),
    [filterBySearch],
  );

  const protecao = useMemo(
    () =>
      filterBySearch(
        VOLTAI_COMPONENT_DEFINITIONS.filter((c) => {
          const t = c.type as string;
          return (
            c.category === "Protecao" ||
            t === "QF" ||
            t === "MPCB" ||
            t === "DR" ||
            t === "FU" ||
            t === "SPD" ||
            t === "TVSS" ||
            t === "FR" ||
            t === "SR"
          );
        }),
      ),
    [filterBySearch],
  );

  const manobra = useMemo(
    () =>
      filterBySearch(
        VOLTAI_COMPONENT_DEFINITIONS.filter((c) => {
          const t = c.type as string;
          return (
            c.category === "Potencia" ||
            t === "KM" ||
            t === "QS" ||
            t === "KA" ||
            t === "CR" ||
            t === "SA" ||
            t === "ES"
          );
        }),
      ),
    [filterBySearch],
  );

  const cargas = useMemo(
    () =>
      filterBySearch(
        VOLTAI_COMPONENT_DEFINITIONS.filter((c) => {
          const t = c.type as string;
          return (
            c.category === "Carga" ||
            t === "M" ||
            t === "BC" ||
            t === "PFC" ||
            t === "R" ||
            t === "L"
          );
        }),
      ),
    [filterBySearch],
  );

  const automacao = useMemo(
    () =>
      filterBySearch(
        VOLTAI_COMPONENT_DEFINITIONS.filter((c) => {
          const t = c.type as string;
          return (
            c.category === "Controle" ||
            t === "PLC" ||
            t === "VFD" ||
            t === "SS" ||
            t === "KT" ||
            t === "CT"
          );
        }),
      ),
    [filterBySearch],
  );

  const instrumentacao = useMemo(
    () =>
      filterBySearch(
        VOLTAI_COMPONENT_DEFINITIONS.filter((c) => {
          const t = c.type as string;
          return (
            c.category === "Medicao" ||
            c.category === "Sinal" ||
            t === "TC" ||
            t === "TP" ||
            t === "kWh" ||
            t === "IED" ||
            t === "HL" ||
            t === "HZ" ||
            t === "TCTERRA"
          );
        }),
      ),
    [filterBySearch],
  );

  const todos = useMemo(() => filterBySearch(VOLTAI_COMPONENT_DEFINITIONS), [filterBySearch]);

  const totalResults =
    alimentacao.length +
    protecao.length +
    manobra.length +
    cargas.length +
    automacao.length +
    instrumentacao.length;

  return (
    <div
      className="flex flex-col h-full w-[300px] lg:w-full bg-panel border-r border-border select-none overflow-hidden"
      data-testid="editor-unifilar-sidebar"
    >
      {/* Cabeçalho da Biblioteca Elétrica (sem a coluna vertical redundante de 40px) */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border bg-panel shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Cube className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold tracking-wider text-foreground uppercase">
              Biblioteca Elétrica
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20">
              {VOLTAI_COMPONENT_DEFINITIONS.length} itens
            </span>
            <button
              onClick={() => useEditorStore.getState().toggleLeftPanel()}
              className="h-6 w-6 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground grid place-items-center transition-colors"
              title="Recolher biblioteca elétrica"
              aria-label="Recolher biblioteca elétrica"
            >
              <SidebarSimple className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Campo de Busca Inteligente com botão para limpar */}
        <div className="relative">
          <MagnifyingGlass className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            id="unifilar-library-search"
            name="unifilarLibrarySearch"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Disjuntor, motor, QF, KM, NBR..."
            className="w-full h-7 pl-8 pr-7 rounded bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Limpar busca"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mt-1 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Arraste o componente para o diagrama</span>
          {search && <span className="font-mono text-primary">{totalResults} encontrado(s)</span>}
        </div>
      </div>

      {/* Lista de Categorias com acordeom e cards profissionais */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {/* Categoria 1: Alimentação & Fontes */}
        <LibraryAccordion
          icon={Power}
          title="Alimentação & Fontes"
          count={alimentacao.length}
          open={openSections.alimentacao}
          onToggle={() => toggleSection("alimentacao")}
        >
          <div className="space-y-1.5 pt-1">
            {alimentacao.map((c) => (
              <SymbolCard key={c.type} component={c} />
            ))}
          </div>
        </LibraryAccordion>

        {/* Categoria 2: Dispositivos de Proteção */}
        <LibraryAccordion
          icon={Shield}
          title="Dispositivos de Proteção"
          count={protecao.length}
          open={openSections.protecao}
          onToggle={() => toggleSection("protecao")}
        >
          <div className="space-y-1.5 pt-1">
            {protecao.map((c) => (
              <SymbolCard key={c.type} component={c} />
            ))}
          </div>
        </LibraryAccordion>

        {/* Categoria 3: Manobra & Potência */}
        <LibraryAccordion
          icon={Lightning}
          title="Manobra & Potência"
          count={manobra.length}
          open={openSections.manobra}
          onToggle={() => toggleSection("manobra")}
        >
          <div className="space-y-1.5 pt-1">
            {manobra.map((c) => (
              <SymbolCard key={c.type} component={c} />
            ))}
          </div>
        </LibraryAccordion>

        {/* Categoria 4: Motores & Cargas */}
        <LibraryAccordion
          icon={Pulse}
          title="Motores & Cargas"
          count={cargas.length}
          open={openSections.cargas}
          onToggle={() => toggleSection("cargas")}
        >
          <div className="space-y-1.5 pt-1">
            {cargas.map((c) => (
              <SymbolCard key={c.type} component={c} />
            ))}
          </div>
        </LibraryAccordion>

        {/* Categoria 5: Automação & Acionamentos */}
        <LibraryAccordion
          icon={Cpu}
          title="Automação & Acionamentos"
          count={automacao.length}
          open={openSections.automacao}
          onToggle={() => toggleSection("automacao")}
        >
          <div className="space-y-1.5 pt-1">
            {automacao.map((c) => (
              <SymbolCard key={c.type} component={c} />
            ))}
          </div>
        </LibraryAccordion>

        {/* Categoria 6: Medição & Instrumentação */}
        <LibraryAccordion
          icon={ArrowCounterClockwise}
          title="Medição & Instrumentação"
          count={instrumentacao.length}
          open={openSections.instrumentacao}
          onToggle={() => toggleSection("instrumentacao")}
        >
          <div className="space-y-1.5 pt-1">
            {instrumentacao.map((c) => (
              <SymbolCard key={c.type} component={c} />
            ))}
          </div>
        </LibraryAccordion>

        {/* Categoria 7: Todos os Símbolos IEC 60617 / NBR 5410 */}
        <LibraryAccordion
          icon={Cube}
          title="Catálogo Geral IEC 60617"
          count={todos.length}
          open={openSections.todos}
          onToggle={() => toggleSection("todos")}
        >
          <div className="space-y-1.5 pt-1">
            {todos.map((c) => (
              <SymbolCard key={`todos_${c.type}`} component={c} />
            ))}
          </div>
        </LibraryAccordion>
      </div>

      {/* Rodapé informativo de validação e atalhos úteis */}
      <div className="px-2.5 py-1.5 border-t border-border bg-panel text-[10px] text-muted-foreground font-mono flex items-center justify-between">
        <span className="truncate">{dragValidation || "Arraste componentes para o canvas."}</span>
      </div>
    </div>
  );
}

function LibraryAccordion({
  icon: Icon,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  icon?: typeof Cube;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 truncate">
          {Icon && <Icon className="h-3.5 w-3.5 text-primary shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <span className="text-[10px] font-mono px-1 rounded bg-secondary text-muted-foreground">
            {count}
          </span>
          {open ? <CaretDown className="h-3.5 w-3.5" /> : <CaretRight className="h-3.5 w-3.5" />}
        </div>
      </button>
      {open && <div className="px-1.5 pb-2">{children}</div>}
    </div>
  );
}

/**
 * Card técnico profissional para cada componente da biblioteca.
 * Exibe símbolo gráfico SVG distintivo, nome técnico completo, badge de prefixo,
 * descrição de aplicação e norma técnica de referência.
 */
function SymbolCard({ component }: { component: VoltaiComponentDefinition }) {
  const validateComponent = useEditorStore((s) => s.validateComponent);
  const meta = COMPONENT_METADATA[component.type] || {
    desc: component.name,
    norm: component.standard?.[0] || "IEC 60617",
    tag: component.tagPrefix || component.type,
  };

  const tagLabel = meta.tag || component.tagPrefix || component.type;

  return (
    <div
      draggable
      onDragStart={(event) => {
        validateComponent?.(component.type);
        event.dataTransfer.setData("application/voltai-component", component.type);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${component.name} [${tagLabel}] — ${meta.desc} (${meta.norm})`}
      className="group relative flex items-center gap-2.5 p-2 rounded-md border border-border bg-card hover:bg-accent/40 hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing select-none"
      data-testid={`library-item-${component.type}`}
    >
      {/* Símbolo elétrico SVG distintivo em contêiner de alto contraste */}
      <div className="w-10 h-10 shrink-0 rounded-sm bg-secondary/50 border border-border flex items-center justify-center text-foreground group-hover:text-primary transition-colors">
        <SymbolThumbnail type={component.type} />
      </div>

      {/* Informações técnicas: Nome completo, descrição e badge de identificação */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-foreground group-hover:text-foreground truncate">
            {component.name}
          </span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
            {tagLabel}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={meta.desc}>
          {meta.desc}
        </p>
        <span className="text-[9px] font-mono text-muted-foreground/50">{meta.norm}</span>
      </div>
    </div>
  );
}

/**
 * Renderizador de símbolos elétricos SVG normatizados (IEC 60617 / NBR 5410).
 * Cada tipo possui uma representação geométrica própria, eliminando ícones genéricos repetidos.
 */
export function SymbolThumbnail({ type }: { type: string }) {
  switch (type) {
    case "QF":
    case "breaker":
      // Disjuntor termomagnético: contato aberto com gatilho magnético e elemento térmico
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="7" />
          <circle cx="16" cy="7" r="1.5" />
          <line x1="16" y1="7" x2="22" y2="23" />
          {/* Elemento térmico (semicírculo / bimetálico) */}
          <path d="M 18 13 L 24 10" />
          {/* Gatilho magnético (gancho) */}
          <path d="M 21 17 L 25 15 L 25 18" />
          <circle cx="16" cy="25" r="1.5" />
          <line x1="16" y1="25" x2="16" y2="30" />
        </svg>
      );

    case "QS":
    case "disconnector":
      // Seccionadora: chave de corte visível com barra transversal
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="7" />
          <circle cx="16" cy="7" r="1.5" />
          <line x1="16" y1="7" x2="23" y2="22" />
          {/* Barra transversal de abertura visível */}
          <line x1="20" y1="22" x2="26" y2="22" strokeWidth="2" />
          <circle cx="16" cy="25" r="1.5" />
          <line x1="16" y1="25" x2="16" y2="30" />
        </svg>
      );

    case "DR":
    case "residual_current":
      // Disjuntor diferencial residual: núcleo toroidal envolvendo condutores e bobina de fuga
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="12" y1="2" x2="12" y2="30" />
          <line x1="20" y1="2" x2="20" y2="30" />
          {/* Toroide sensor de corrente diferencial */}
          <ellipse cx="16" cy="16" rx="9" ry="5" strokeWidth="1.8" />
          <path d="M 25 16 L 28 16 L 28 22 L 25 22" strokeDasharray="1 1" />
          <rect x="23" y="22" width="6" height="5" rx="1" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );

    case "FU":
    case "fuse":
      // Fusível IEC: retângulo atravessado pela linha axial de conexão
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="30" />
          <rect x="9" y="8" width="14" height="16" fill="#131b2c" strokeWidth="1.8" />
        </svg>
      );

    case "SPD":
    case "TVSS":
      // Dispositivo protetor contra surtos: varistor com linha de não-linearidade e terra PE
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="7" />
          <rect x="8" y="7" width="16" height="14" rx="1" strokeWidth="1.5" />
          {/* Linha diagonal não linear com degrau */}
          <path d="M 10 18 L 15 14 L 17 14 L 22 10" />
          <line x1="16" y1="21" x2="16" y2="25" />
          {/* Linhas de aterramento PE */}
          <line x1="10" y1="25" x2="22" y2="25" strokeWidth="1.8" />
          <line x1="12" y1="28" x2="20" y2="28" />
          <line x1="14" y1="30" x2="18" y2="30" />
        </svg>
      );

    case "KM":
    case "contactor":
      // Contator de potência tripolar: contato móvel com arco de supressão
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="6" />
          <circle cx="16" cy="7" r="1.5" />
          <line x1="16" y1="7" x2="22" y2="23" />
          {/* Arco de proteção de contato de força */}
          <path d="M 22 20 A 3 3 0 0 1 22 25" strokeWidth="1.8" />
          <circle cx="16" cy="25" r="1.5" />
          <line x1="16" y1="25" x2="16" y2="30" />
        </svg>
      );

    case "KA":
    case "relay":
      // Relé auxiliar de comando: bobina retangular e contato NA/NF
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="7" y="9" width="18" height="14" rx="1" strokeWidth="1.6" />
          <line x1="7" y1="9" x2="25" y2="23" />
          <line x1="16" y1="2" x2="16" y2="9" />
          <line x1="16" y1="23" x2="16" y2="30" />
        </svg>
      );

    case "FR":
    case "thermal_relay":
      // Relé térmico de sobrecarga: elementos bimetálicos em série
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="7" />
          <rect x="7" y="7" width="18" height="18" rx="1" strokeWidth="1.5" />
          {/* Símbolo bimetálico térmico em U */}
          <path d="M 11 13 L 15 13 L 15 19 L 11 19" strokeWidth="1.8" />
          <line x1="18" y1="13" x2="21" y2="13" strokeWidth="1.8" />
          <line x1="19.5" y1="13" x2="19.5" y2="19" strokeWidth="1.8" />
          <line x1="16" y1="25" x2="16" y2="30" />
        </svg>
      );

    case "M":
    case "motor":
      // Motor elétrico de indução trifásico: círculo com 'M' e '3~'
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="16" r="11" strokeWidth="1.8" />
          <line x1="16" y1="2" x2="16" y2="5" />
          {/* Letra M estilizada */}
          <path d="M 11 20 L 11 12 L 16 17 L 21 12 L 21 20" strokeWidth="1.6" />
        </svg>
      );

    case "SS":
    case "soft_starter":
      // Soft-Starter: tiristores antiparalelos e rampa de aceleração
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="6" width="22" height="20" rx="1" strokeWidth="1.6" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="16" y1="26" x2="16" y2="30" />
          {/* Rampa suave ascendente */}
          <path d="M 9 20 L 14 20 L 19 12 L 23 12" strokeWidth="1.8" />
        </svg>
      );

    case "VFD":
    case "vfd":
      // Inversor de frequência: conversor AC/DC + DC/AC com onda senoidal
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="6" width="22" height="20" rx="1" strokeWidth="1.6" />
          <line x1="5" y1="26" x2="27" y2="6" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="16" y1="26" x2="16" y2="30" />
          {/* Entrada = / saída ~ */}
          <line x1="9" y1="12" x2="13" y2="12" />
          <line x1="9" y1="15" x2="13" y2="15" />
          <path d="M 18 20 Q 20 17 22 20 T 26 20" strokeWidth="1.4" />
        </svg>
      );

    case "TR":
    case "transformer":
      // Transformador: dois círculos entrelaçados (primário e secundário)
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="11" r="6.5" strokeWidth="1.6" />
          <circle cx="16" cy="21" r="6.5" strokeWidth="1.6" />
          <line x1="16" y1="2" x2="16" y2="4.5" />
          <line x1="16" y1="27.5" x2="16" y2="30" />
        </svg>
      );

    case "PS":
    case "power_supply":
      // Fonte de alimentação AC/DC: bloco com entrada AC e saída DC 24V
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="7" width="22" height="18" rx="1.5" strokeWidth="1.6" />
          <line x1="16" y1="7" x2="16" y2="25" strokeDasharray="1.5 1.5" />
          <path d="M 8 16 Q 10 13 12 16 T 14 16" strokeWidth="1.3" />
          <line x1="18" y1="14" x2="24" y2="14" strokeWidth="1.5" />
          <line x1="18" y1="18" x2="24" y2="18" strokeDasharray="1.5 1.5" strokeWidth="1.5" />
          <line x1="11" y1="2" x2="11" y2="7" />
          <line x1="21" y1="25" x2="21" y2="30" />
        </svg>
      );

    case "PLC":
    case "plc":
      // CLP / PLC: bloco com I/O e barramento
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="4" y="6" width="24" height="20" rx="1" strokeWidth="1.6" />
          <line x1="11" y1="6" x2="11" y2="26" />
          <line x1="21" y1="6" x2="21" y2="26" />
          <circle cx="7.5" cy="11" r="1.5" fill="currentColor" />
          <circle cx="7.5" cy="16" r="1.5" fill="currentColor" />
          <circle cx="7.5" cy="21" r="1.5" fill="currentColor" />
        </svg>
      );

    case "KT":
    case "timer":
      // Temporizador: contato com atraso / paraquedas
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="6" />
          <circle cx="16" cy="7" r="1.5" />
          <line x1="16" y1="7" x2="22" y2="23" />
          {/* Paraquedas de retardo de tempo */}
          <path d="M 18 12 C 18 9 24 9 24 12 Z" fill="currentColor" fillOpacity="0.2" />
          <circle cx="16" cy="25" r="1.5" />
          <line x1="16" y1="25" x2="16" y2="30" />
        </svg>
      );

    case "CT":
    case "counter":
      // Contador digital: display numérico de pulsos
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="7" width="22" height="18" rx="1" strokeWidth="1.6" />
          <line x1="16" y1="2" x2="16" y2="7" />
          <line x1="16" y1="25" x2="16" y2="30" />
          {/* Display 123 */}
          <path
            d="M 9 13 L 11 11 L 11 17 M 15 11 H 19 L 15 15 H 19 M 22 11 H 25 L 23 14 L 25 17 H 22"
            strokeWidth="1.2"
          />
        </svg>
      );

    case "BC":
    case "PFC":
    case "capacitor_bank":
      // Banco de capacitores: capacitores em paralelo
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="6" y1="8" x2="26" y2="8" strokeWidth="1.8" />
          <line x1="16" y1="2" x2="16" y2="8" />
          {/* Placas paralelas de capacitor */}
          <line x1="10" y1="12" x2="22" y2="12" strokeWidth="1.8" />
          <line x1="10" y1="16" x2="22" y2="16" strokeWidth="1.8" />
          <line x1="6" y1="24" x2="26" y2="24" strokeWidth="1.8" />
          <line x1="16" y1="16" x2="16" y2="24" />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );

    case "G":
    case "generator":
      // Grupo gerador síncrono: círculo com 'G' e '3~'
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="16" r="11" strokeWidth="1.8" />
          <line x1="16" y1="2" x2="16" y2="5" />
          <path
            d="M 20 13 C 19 11 14 11 13 15 C 12 19 17 20 19 18 L 19 16 L 16 16"
            strokeWidth="1.6"
          />
        </svg>
      );

    case "UPS":
    case "ups":
      // No-break: retificador + bateria + inversor
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="7" width="22" height="18" rx="1.5" strokeWidth="1.6" />
          <line x1="16" y1="2" x2="16" y2="7" />
          <line x1="16" y1="25" x2="16" y2="30" />
          {/* Símbolo de bateria central */}
          <line x1="12" y1="13" x2="20" y2="13" strokeWidth="2" />
          <line x1="14" y1="16" x2="18" y2="16" strokeWidth="1.5" />
          <line x1="12" y1="19" x2="20" y2="19" strokeWidth="2" />
        </svg>
      );

    case "TC":
    case "current_transformer":
      // Transformador de corrente: linha primária através de toroide secundário
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="30" strokeWidth="2" />
          <circle cx="16" cy="16" r="6" strokeWidth="1.8" fill="#131b2c" />
          <line x1="22" y1="16" x2="28" y2="16" strokeWidth="1.5" />
        </svg>
      );

    case "TP":
    case "potential_transformer":
      // Transformador de potencial: dois enrolamentos paralelos
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="12" cy="16" r="6" strokeWidth="1.6" />
          <circle cx="20" cy="16" r="6" strokeWidth="1.6" />
          <line x1="12" y1="2" x2="12" y2="10" />
          <line x1="20" y1="22" x2="20" y2="30" />
        </svg>
      );

    case "MPCB":
    case "motor_breaker":
      // Disjuntor motor: corte magnético e ajuste térmico
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="6" />
          <circle cx="16" cy="6" r="1.5" />
          <line x1="16" y1="6" x2="22" y2="22" />
          <path d="M 20 11 L 25 9" />
          <rect x="18" y="14" width="6" height="4" strokeWidth="1.2" />
          <circle cx="16" cy="24" r="1.5" />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );

    case "CR":
    case "interface_relay":
      // Relé de interface
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="7" y="8" width="18" height="16" rx="1" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="3" />
          <line x1="16" y1="2" x2="16" y2="8" />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );

    case "kWh":
    case "energy_meter":
      // Multimedidor de grandezas elétricas
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="16" r="11" strokeWidth="1.6" />
          <rect x="10" y="12" width="12" height="7" strokeWidth="1.2" fill="#131b2c" />
          <text
            x="16"
            y="17"
            fontSize="5"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontWeight="bold"
          >
            kWh
          </text>
        </svg>
      );

    case "IED":
    case "protection_relay":
      // Relé inteligente de proteção
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="6" width="22" height="20" rx="1.5" strokeWidth="1.6" />
          <text
            x="16"
            y="15"
            fontSize="6"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontWeight="bold"
          >
            50/51
          </text>
          <line x1="8" y1="20" x2="24" y2="20" strokeWidth="1" />
        </svg>
      );

    case "SA":
    case "selector_switch":
      // Chave seletora rotativa
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="16" r="10" strokeWidth="1.5" />
          <line x1="16" y1="16" x2="22" y2="10" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="2.5" fill="currentColor" />
        </svg>
      );

    case "ES":
    case "emergency_stop":
      // Botão de emergência tipo cogumelo
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          {/* Cabeça do cogumelo */}
          <path
            d="M 8 13 C 8 7 24 7 24 13 Z"
            fill="currentColor"
            fillOpacity="0.3"
            strokeWidth="1.8"
          />
          <rect x="14" y="13" width="4" height="6" fill="currentColor" />
          <rect x="10" y="19" width="12" height="6" strokeWidth="1.4" />
          {/* Setas de destravamento */}
          <path d="M 6 11 Q 8 6 13 6" strokeWidth="1" />
          <path d="M 26 11 Q 24 6 19 6" strokeWidth="1" />
        </svg>
      );

    case "HL":
    case "pilot_light":
      // Sinaleiro luminoso com 'X'
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <circle cx="16" cy="16" r="10" strokeWidth="1.8" />
          <line x1="9" y1="9" x2="23" y2="23" strokeWidth="1.5" />
          <line x1="23" y1="9" x2="9" y2="23" strokeWidth="1.5" />
        </svg>
      );

    case "HZ":
    case "buzzer":
      // Sinalizador sonoro / buzina
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <path
            d="M 12 11 L 18 7 L 18 25 L 12 21 H 8 V 11 Z"
            fill="currentColor"
            fillOpacity="0.2"
            strokeWidth="1.6"
          />
          <path d="M 21 12 C 23 14 23 18 21 20" strokeWidth="1.5" />
          <path d="M 24 9 C 27 13 27 19 24 23" strokeWidth="1.5" />
        </svg>
      );

    case "R":
    case "resistor":
      // Resistor de frenagem
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="8" />
          <path d="M 16 8 L 22 10 L 10 14 L 22 18 L 10 22 L 16 24" strokeWidth="1.8" />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );

    case "L":
    case "inductor":
      // Indutor / reator
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <line x1="16" y1="2" x2="16" y2="6" />
          <path
            d="M 16 6 C 22 6 22 12 16 12 C 22 12 22 18 16 18 C 22 18 22 24 16 24"
            strokeWidth="1.8"
          />
          <line x1="16" y1="24" x2="16" y2="30" />
        </svg>
      );

    case "B":
    case "busbar":
      // Barramento de cobre com derivações
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none">
          <line x1="3" y1="16" x2="29" y2="16" strokeWidth="4.5" />
          <circle cx="8" cy="16" r="2.2" fill="currentColor" />
          <circle cx="16" cy="16" r="2.2" fill="currentColor" />
          <circle cx="24" cy="16" r="2.2" fill="currentColor" />
        </svg>
      );

    case "SR":
    case "safety_relay":
      // Relé de segurança Cat 4
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="5" y="6" width="22" height="20" rx="1.5" strokeWidth="1.6" />
          <text
            x="16"
            y="14"
            fontSize="5"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontWeight="bold"
          >
            SAFETY
          </text>
          <line x1="9" y1="18" x2="13" y2="18" strokeWidth="2" />
          <line x1="19" y1="18" x2="23" y2="18" strokeWidth="2" />
          <circle cx="16" cy="21" r="1.5" fill="currentColor" />
        </svg>
      );

    default:
      // Símbolo padrão com identificação central
      return (
        <svg viewBox="0 0 32 32" className="w-7 h-7 stroke-current fill-none stroke-[1.5]">
          <rect x="7" y="7" width="18" height="18" rx="2" strokeWidth="1.5" />
          <line x1="16" y1="2" x2="16" y2="7" />
          <line x1="16" y1="25" x2="16" y2="30" />
          <circle cx="16" cy="16" r="3" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );
  }
}
