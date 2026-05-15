import { Gauge } from "lucide-react";
import { PaletteGroup, SidebarSearch, SidebarShell } from "./sidebar-primitives";

const FBD_BLOCKS: { category: string; items: { id: string; label: string }[] }[] = [
  {
    category: "Lógica",
    items: [
      { id: "AND", label: "AND" },
      { id: "OR", label: "OR" },
      { id: "NOT", label: "NOT" },
      { id: "XOR", label: "XOR" },
    ],
  },
  {
    category: "Memória",
    items: [
      { id: "SR", label: "SR" },
      { id: "RS", label: "RS" },
    ],
  },
  {
    category: "Temporizadores",
    items: [
      { id: "TON", label: "TON" },
      { id: "TOF", label: "TOF" },
    ],
  },
  {
    category: "Contadores",
    items: [
      { id: "CTU", label: "CTU" },
      { id: "CTD", label: "CTD" },
    ],
  },
];

export function EditorFbdSidebar() {
  return (
    <SidebarShell>
      <SidebarSearch title="Blocos FBD" placeholder="AND, OR, TON..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {FBD_BLOCKS.map((group) => (
          <PaletteGroup key={group.category} icon={Gauge} title={group.category}>
            {group.items.map((item) => (
              <button
                key={item.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/fbd-block", item.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className="flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] hover:bg-accent border border-transparent hover:border-border cursor-grab active:cursor-grabbing"
              >
                <span className="w-12 shrink-0 font-mono text-[10px] text-primary">{item.id}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </PaletteGroup>
        ))}
      </div>
    </SidebarShell>
  );
}
