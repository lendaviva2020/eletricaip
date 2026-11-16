import { useMemo, useState } from "react";
import { SidebarSearch, SidebarShell, normalizeSearch } from "./sidebar-primitives";
import { useI18n } from "@/lib/i18n";

const WIDGET_GROUPS: { title: string; widgets: string[] }[] = [
  { title: "Indicadores", widgets: ["Gauge", "Numeric Display", "Level Indicator", "Trend"] },
  { title: "Controles", widgets: ["Button", "Switch", "Slider", "Input Field"] },
  { title: "Alarmes", widgets: ["Alarm Banner", "Alarm Table"] },
  { title: "Máquinas", widgets: ["Motor", "Bomba", "Válvula"] },
  { title: "Enfeites", widgets: ["Pipe", "Tanque", "Texto"] },
];

export function EditorScadaSidebar() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return WIDGET_GROUPS;
    return WIDGET_GROUPS.map((g) => ({
      ...g,
      widgets: normalizeSearch(g.title).includes(q)
        ? g.widgets
        : g.widgets.filter((w) => normalizeSearch(w).includes(q)),
    })).filter((g) => g.widgets.length > 0);
  }, [query]);

  return (
    <SidebarShell>
      <SidebarSearch
        title="Widgets HMI"
        placeholder="Gauge, Motor, Alarm..."
        value={query}
        onChange={setQuery}
      />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {groups.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            {t("sidebarSearch.noResults")}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.title}>
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {group.title}
            </div>
            <div className="grid gap-1">
              {group.widgets.map((widget) => (
                <button
                  key={widget}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/scada-widget", widget);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="w-full text-left px-2 py-2 rounded border border-border bg-card/60 text-[11px] hover:bg-accent cursor-grab active:cursor-grabbing"
                >
                  {widget}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SidebarShell>
  );
}
