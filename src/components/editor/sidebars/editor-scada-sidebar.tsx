import { SidebarSearch, SidebarShell } from "./sidebar-primitives";

const WIDGET_GROUPS: { title: string; widgets: string[] }[] = [
  { title: "Indicadores", widgets: ["Gauge", "Numeric Display", "Level Indicator", "Trend"] },
  { title: "Controles", widgets: ["Button", "Switch", "Slider", "Input Field"] },
  { title: "Alarmes", widgets: ["Alarm Banner", "Alarm Table"] },
  { title: "Máquinas", widgets: ["Motor", "Bomba", "Válvula"] },
  { title: "Enfeites", widgets: ["Pipe", "Tanque", "Texto"] },
];

export function EditorScadaSidebar() {
  return (
    <SidebarShell>
      <SidebarSearch title="Widgets HMI" placeholder="SCADA..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {WIDGET_GROUPS.map((group) => (
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
