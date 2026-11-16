import { useMemo, useState } from "react";
import { Gauge } from "@phosphor-icons/react";
import { PaletteGroup, SidebarSearch, SidebarShell, normalizeSearch } from "./sidebar-primitives";
import { paletteDefinitions } from "@/lib/fbd/editor-bridge";
import { effectiveInputs, effectiveOutputs } from "@/lib/fbd/engine";
import { blockCategoryLabel, blockDescriptionLabel } from "@/lib/fbd/engine/block-i18n";
import { useI18n } from "@/lib/i18n";

export function EditorFbdSidebar() {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const blocksByCategory = useMemo(() => {
    const q = normalizeSearch(query);
    const groups = new Map<string, ReturnType<typeof paletteDefinitions>>();
    for (const def of paletteDefinitions()) {
      if (q) {
        const haystack = normalizeSearch(
          `${def.type} ${blockDescriptionLabel(def.type, def.description, locale)} ${def.description} ${blockCategoryLabel(def.category, locale)}`,
        );
        if (!haystack.includes(q)) continue;
      }
      const list = groups.get(def.category) ?? [];
      list.push(def);
      groups.set(def.category, list);
    }
    return groups;
  }, [query, locale]);

  return (
    <SidebarShell>
      <SidebarSearch
        title={t("fbdPalette.title")}
        placeholder="AND, OR, TON..."
        value={query}
        onChange={setQuery}
      />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {blocksByCategory.size === 0 && (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            {t("sidebarSearch.noResults")}
          </p>
        )}
        {[...blocksByCategory].map(([category, items]) => {
          return (
            <PaletteGroup key={category} icon={Gauge} title={blockCategoryLabel(category, locale)}>
              {items.map((def) => (
                <button
                  key={def.type}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/fbd-block", def.type);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  title={blockDescriptionLabel(def.type, def.description, locale)}
                  className="flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] hover:bg-accent border border-transparent hover:border-border cursor-grab active:cursor-grabbing"
                >
                  <span className="w-12 shrink-0 font-mono text-[10px] text-primary">
                    {def.type}
                  </span>
                  <span className="truncate flex-1">
                    {blockDescriptionLabel(def.type, def.description, locale)}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">
                    {effectiveInputs(def).length}&rarr;{effectiveOutputs(def).length}
                  </span>
                </button>
              ))}
            </PaletteGroup>
          );
        })}
      </div>
    </SidebarShell>
  );
}
