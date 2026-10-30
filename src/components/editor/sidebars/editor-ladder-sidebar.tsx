import { useState, useMemo } from "react";
import {
  MagnifyingGlass,
  Star,
  CaretDown,
  CaretRight,
  Gauge,
  Cpu,
  Calculator,
  Timer,
  Hash,
  ArrowsLeftRight,
  Binary,
  Stack,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { LADDER_ELEMENTS, type LadderElement, type LadderCategory } from "@/lib/ladder/definitions";
import { SidebarShell } from "./sidebar-primitives";
import { useI18n } from "@/lib/i18n";
import { useEditorStore } from "@/lib/editor/store";

const CATEGORY_ICONS: Record<LadderCategory, typeof Gauge> = {
  "Contatos e Bordas": Stack,
  "Bobinas e Retenções": Cpu,
  Temporizadores: Timer,
  Contadores: Hash,
  Comparadores: Binary,
  Matemática: Calculator,
  "Lógica Booleana": Binary,
  "Transferência e Dados": ArrowsLeftRight,
  "Blocos de Fabricantes": Gauge,
};

export function EditorLadderSidebar() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(["XIC", "XIO", "OTE", "OTL", "TON", "CTU", "CMP_GE", "ADD"]),
  );
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    "Contatos e Bordas": true,
    "Bobinas e Retenções": true,
    Temporizadores: true,
    Contadores: true,
    Comparadores: false,
    Matemática: false,
    "Lógica Booleana": false,
    "Transferência e Dados": false,
    "Blocos de Fabricantes": false,
  });

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredElements = useMemo(() => {
    if (!search.trim()) return LADDER_ELEMENTS;
    const term = search.toLowerCase();
    return LADDER_ELEMENTS.filter(
      (e) =>
        e.id.toLowerCase().includes(term) ||
        e.mnemonic.toLowerCase().includes(term) ||
        e.label.toLowerCase().includes(term) ||
        e.symbol.toLowerCase().includes(term) ||
        e.category.toLowerCase().includes(term) ||
        (e.allenBradley && e.allenBradley.toLowerCase().includes(term)) ||
        (e.siemens && e.siemens.toLowerCase().includes(term)),
    );
  }, [search]);

  const categories = useMemo(() => {
    const list: LadderCategory[] = [
      "Contatos e Bordas",
      "Bobinas e Retenções",
      "Temporizadores",
      "Contadores",
      "Comparadores",
      "Matemática",
      "Lógica Booleana",
      "Transferência e Dados",
      "Blocos de Fabricantes",
    ];
    return list.filter((cat) => filteredElements.some((e) => e.category === cat));
  }, [filteredElements]);

  return (
    <SidebarShell width={240}>
      <div className="h-9 flex items-center justify-between px-3 border-b border-border text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground bg-muted/20">
        <span>BIBLIOTECA DE INSTRUÇÕES</span>
        <span className="font-mono text-[9px] text-primary">{filteredElements.length} itens</span>
      </div>

      <div className="p-2 border-b border-border/60">
        <div className="relative">
          <MagnifyingGlass className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar mnemônico ou nome..."
            placeholder="Buscar mnemônico ou nome..."
            className="w-full h-7 pl-8 pr-2 rounded bg-input/40 border border-border text-[11px] outline-none focus:ring-1 focus:ring-primary/60 text-foreground placeholder:text-muted-foreground/60 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-1 scrollbar-thin">
        {categories.map((cat) => {
          const items = filteredElements.filter((e) => e.category === cat);
          const isOpen = openCategories[cat] !== false || search.trim().length > 0;
          const IconComponent = CATEGORY_ICONS[cat] || Gauge;

          return (
            <div
              key={cat}
              className="rounded border border-border/40 bg-card/20 overflow-hidden mb-1"
            >
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-foreground/90 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <IconComponent className="h-3.5 w-3.5 text-primary/80" />
                  <span>
                    {cat}{" "}
                    <span className="text-[10px] text-muted-foreground/80 font-mono">
                      ({items.length})
                    </span>
                  </span>
                </div>
                {isOpen ? (
                  <CaretDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <CaretRight className="h-3 w-3 text-muted-foreground" />
                )}
              </button>

              {isOpen && (
                <div className="px-1 py-1 space-y-0.5 border-t border-border/20 bg-background/30">
                  {items.map((element) => {
                    const isFav = favorites.has(element.id);
                    return (
                      <LadderPaletteItem
                        key={element.id}
                        element={element}
                        isFavorite={isFav}
                        onToggleFavorite={(e) => toggleFavorite(element.id, e)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SidebarShell>
  );
}

function LadderPaletteItem({
  element,
  isFavorite,
  onToggleFavorite,
}: {
  element: LadderElement;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const isSupported = element.supported === true;

  const handleDragStart = (e: React.DragEvent) => {
    if (!isSupported) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("application/ladder-element", element.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleClick = () => {
    if (!isSupported) {
      toast.info(
        `"${element.label}" está planejado para o módulo com suporte a ${element.category}.`,
      );
      return;
    }
    // Dispara evento para o canvas inserir no ponto atualmente selecionado
    window.dispatchEvent(
      new CustomEvent("eletricai:ladder-insert-element", {
        detail: { elementId: element.id },
      }),
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={isSupported}
      onDragStart={handleDragStart}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      title={`${element.label} (${element.mnemonic}): ${element.description}`}
      className={`group flex items-center justify-between w-full px-2 py-1.5 rounded text-[11px] transition-all cursor-pointer select-none ${
        isSupported
          ? "text-foreground hover:bg-accent/60 hover:text-foreground active:scale-[0.98]"
          : "text-muted-foreground/60 opacity-60 hover:opacity-90"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] font-semibold text-primary/90 w-11 shrink-0 text-left">
          {element.symbol}
        </span>
        <span className="truncate font-sans text-xs">{element.mnemonic}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {element.dataType && (
          <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-muted/60 text-muted-foreground border border-border/40 lowercase">
            {element.dataType.toLowerCase()}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleFavorite}
          className="opacity-0 group-hover:opacity-100 hover:text-amber-400 p-0.5 transition-opacity"
          title="Favoritar instrução"
        >
          <Star
            className={`h-3 w-3 ${
              isFavorite ? "fill-amber-400 text-amber-400 opacity-100" : "text-muted-foreground"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
