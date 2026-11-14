import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODES, type WorkspaceMode } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import {
  Pulse,
  CaretLeft,
  CaretRight,
  SquaresFour,
  MagnifyingGlass,
  CornersOut,
  CornersIn,
  X,
} from "@phosphor-icons/react";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useI18n } from "@/lib/i18n";
import { useCompactStudioFeatureFlags } from "@/lib/compact-studio/feature-flags";

type ModeCategoryId = "electrical" | "control" | "supervision";

const MODE_CATEGORIES: { id: ModeCategoryId; title: string; modes: WorkspaceMode[] }[] = [
  { id: "electrical", title: "Elétrica", modes: ["unifilar", "multifilar"] },
  {
    id: "control",
    title: "Controle & CLP",
    modes: ["ladder", "fbd", "plc", "studio", "compactStudio"],
  },
  { id: "supervision", title: "Supervisão & Operação", modes: ["scada", "sim", "alarms"] },
];

export function ModeTabs() {
  const mode = useEditorStore((s) => s.activeMode);
  const setMode = useEditorStore((s) => s.setActiveMode);
  const focusMode = useEditorStore((s) => s.focusMode);
  const toggleFocusMode = useEditorStore((s) => s.toggleFocusMode);
  const { isStudioEnabled } = useCompactStudioFeatureFlags();
  const { t } = useI18n();

  const visibleModes = useMemo(
    () => MODES.filter((m) => m.id !== "compactStudio" || isStudioEnabled),
    [isStudioEnabled],
  );

  const selectMode = useCallback(
    (nextMode: WorkspaceMode) => {
      setMode(nextMode);
      if (nextMode === "unifilar" || nextMode === "multifilar") {
        useDiagramStore.getState().setActiveSheet(nextMode);
      }
    },
    [setMode],
  );

  // Horizontal overflow detection & navigation
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(maxScroll - el.scrollLeft > 2);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateScrollState()) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateScrollState);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, visibleModes.length]);

  // Auto-scroll active tab into view cleanly
  useEffect(() => {
    const btn = tabRefs.current[mode];
    if (btn && typeof btn.scrollIntoView === "function") {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
    const timer = setTimeout(updateScrollState, 160);
    return () => clearTimeout(timer);
  }, [mode, updateScrollState]);

  const scrollByAmount = useCallback((dx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollBy === "function") {
      el.scrollBy({ left: dx, behavior: "smooth" });
    } else {
      el.scrollLeft += dx;
    }
  }, []);

  // Mouse wheel horizontal translation
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY;
        updateScrollState();
      }
    },
    [updateScrollState],
  );

  // Pointer drag scroll without hijacking normal clicks
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({ active: false, startX: 0, startScrollLeft: 0, moved: false });
  const suppressClickRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active) return;
      const el = scrollRef.current;
      if (!el) return;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 6) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        el.scrollLeft = dragRef.current.startScrollLeft - dx;
        updateScrollState();
      }
    },
    [updateScrollState],
  );

  const handlePointerEnd = useCallback(() => {
    if (dragRef.current.moved) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current.active = false;
    dragRef.current.moved = false;
  }, []);

  // Keyboard arrow navigation across tabs
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      let nextIdx = -1;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % visibleModes.length;
      else if (e.key === "ArrowLeft")
        nextIdx = (idx - 1 + visibleModes.length) % visibleModes.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = visibleModes.length - 1;

      if (nextIdx >= 0) {
        e.preventDefault();
        const target = visibleModes[nextIdx];
        if (target) {
          selectMode(target.id);
          tabRefs.current[target.id]?.focus();
        }
      }
    },
    [visibleModes, selectMode],
  );

  // Categorized searchable menu: AMBIENTES DE ENGENHARIA
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const tId = setTimeout(() => searchInputRef.current?.focus(), 20);
    const handleOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      clearTimeout(tId);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuOpen]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MODE_CATEGORIES.map((cat) => {
      const items = cat.modes
        .map((id) => visibleModes.find((m) => m.id === id))
        .filter((m): m is (typeof visibleModes)[number] => Boolean(m))
        .filter((m) => {
          if (!q) return true;
          const label = (t(`workspace.modes.${m.id}`) || m.label).toLowerCase();
          const hint = (t(`workspace.modes.${m.id}Hint`) || m.hint).toLowerCase();
          return (
            label.includes(q) ||
            hint.includes(q) ||
            m.id.toLowerCase().includes(q) ||
            cat.title.toLowerCase().includes(q)
          );
        });
      return { ...cat, items };
    }).filter((cat) => cat.items.length > 0);
  }, [search, visibleModes, t]);

  const showOverflowControls = canScrollLeft || canScrollRight;

  return (
    <div className="h-9 shrink-0 flex items-center border-b border-border bg-panel relative z-20 select-none">
      {/* Menu categorizado pesquisável */}
      <div
        className="relative shrink-0 h-full flex items-center pl-2 pr-1 border-r border-border"
        ref={menuContainerRef}
      >
        <button
          type="button"
          data-testid="environments-menu-btn"
          aria-label="AMBIENTES DE ENGENHARIA"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((prev) => !prev)}
          className={cn(
            "h-7 px-2 rounded flex items-center gap-1.5 text-[11px] font-semibold tracking-wide transition-colors cursor-pointer whitespace-nowrap",
            menuOpen
              ? "bg-primary text-primary-foreground"
              : "bg-accent/50 text-foreground hover:bg-accent border border-border/70",
          )}
          title="AMBIENTES DE ENGENHARIA — navegação rápida por categoria"
        >
          <SquaresFour className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden xl:inline">AMBIENTES DE ENGENHARIA</span>
          <span className="xl:hidden">Ambientes</span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            data-testid="environments-menu-popover"
            className="absolute left-2 top-9 w-80 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-popover text-popover-foreground shadow-xl z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border bg-muted/40">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
                AMBIENTES DE ENGENHARIA
              </div>
              <div className="relative flex items-center">
                <MagnifyingGlass className="h-3.5 w-3.5 absolute left-2 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  data-testid="environments-search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar módulo (ex.: Unifilar, Ladder, SCADA...)"
                  aria-label="Filtrar ambiente de engenharia"
                  className="w-full h-7 pl-7 pr-7 rounded bg-background border border-input text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    onClick={() => setSearch("")}
                    className="absolute right-1.5 p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-2.5">
              {filteredCategories.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Nenhum ambiente encontrado para "{search}".
                </div>
              ) : (
                filteredCategories.map((cat) => (
                  <div key={cat.id}>
                    <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat.title}
                    </div>
                    <div className="space-y-0.5">
                      {cat.items.map((m) => {
                        const active = m.id === mode;
                        const label = t(`workspace.modes.${m.id}`) || m.label;
                        const hint = t(`workspace.modes.${m.id}Hint`) || m.hint;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="menuitem"
                            data-testid={`env-menu-item-${m.id}`}
                            onClick={() => {
                              selectMode(m.id);
                              setMenuOpen(false);
                              setSearch("");
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors cursor-pointer",
                              active
                                ? "bg-primary/15 text-primary font-semibold"
                                : "hover:bg-accent text-foreground",
                            )}
                          >
                            <span>{label}</span>
                            <span className="text-[10px] font-mono uppercase text-muted-foreground">
                              {hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seta esquerda de rolagem quando há overflow */}
      {showOverflowControls && (
        <button
          type="button"
          data-testid="mode-tabs-left"
          aria-label="Rolar módulos para a esquerda"
          disabled={!canScrollLeft}
          onClick={() => scrollByAmount(-220)}
          className={cn(
            "h-full px-1.5 shrink-0 flex items-center justify-center border-r border-border transition-colors",
            canScrollLeft
              ? "text-foreground hover:bg-accent cursor-pointer"
              : "text-muted-foreground/40 cursor-default",
          )}
        >
          <CaretLeft className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Faixa de abas horizontais rolável (wheel + drag + teclado) */}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Módulos de engenharia"
        data-testid="mode-tabs-scroll"
        onScroll={updateScrollState}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="flex-1 min-w-0 h-full flex items-end gap-0.5 px-2 overflow-x-auto scrollbar-none scroll-smooth"
      >
        {visibleModes.map((m, idx) => {
          const active = m.id === mode;
          const label = t(`workspace.modes.${m.id}`);
          const hint = t(`workspace.modes.${m.id}Hint`);
          return (
            <button
              key={m.id}
              ref={(el) => {
                tabRefs.current[m.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-tour={`mode-${m.id}`}
              data-mode={m.id}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              onClick={() => {
                if (suppressClickRef.current) return;
                selectMode(m.id);
              }}
              className={cn(
                "relative h-8 px-2.5 text-xs font-medium rounded-t-sm flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap cursor-pointer",
                "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                active && "text-foreground bg-background border border-b-0 border-border",
              )}
            >
              <span>{label || m.label}</span>
              <span className="hidden lg:inline text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {hint || m.hint}
              </span>
              {active && <span className="absolute -bottom-px left-2 right-2 h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {/* Seta direita de rolagem quando há overflow */}
      {showOverflowControls && (
        <button
          type="button"
          data-testid="mode-tabs-right"
          aria-label="Rolar módulos para a direita"
          disabled={!canScrollRight}
          onClick={() => scrollByAmount(220)}
          className={cn(
            "h-full px-1.5 shrink-0 flex items-center justify-center border-l border-border transition-colors",
            canScrollRight
              ? "text-foreground hover:bg-accent cursor-pointer"
              : "text-muted-foreground/40 cursor-default",
          )}
        >
          <CaretRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Ações direitas: Modo Foco + Sync 60Hz */}
      <div className="flex items-center gap-2 px-2 shrink-0 border-l border-border h-full">
        <button
          type="button"
          data-testid="focus-mode-toggle"
          onClick={toggleFocusMode}
          aria-pressed={focusMode}
          title="Modo Foco de Engenharia (Ctrl+Shift+F)"
          className={cn(
            "h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap",
            focusMode
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
        >
          {focusMode ? (
            <>
              <CornersIn className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Sair do Foco</span>
            </>
          ) : (
            <>
              <CornersOut className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">Foco</span>
            </>
          )}
        </button>

        <div className="hidden sm:flex items-center gap-1.5 pl-2 text-[11px] text-muted-foreground shrink-0 border-l border-border">
          <Pulse className="h-3 w-3 text-success" />
          <span className="font-mono whitespace-nowrap">{t("workspace.sync60Hz")}</span>
        </div>
      </div>
    </div>
  );
}
