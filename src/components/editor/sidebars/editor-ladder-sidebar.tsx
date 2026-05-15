import { Gauge } from "lucide-react";
import { LADDER_ELEMENTS, type LadderElement } from "@/lib/ladder/definitions";
import { PaletteGroup, SidebarSearch, SidebarShell } from "./sidebar-primitives";

export function EditorLadderSidebar() {
  const categories = Array.from(new Set(LADDER_ELEMENTS.map((e) => e.category)));
  return (
    <SidebarShell width={240}>
      <SidebarSearch title="Elementos Ladder (IEC 61131-3)" placeholder="XIC, OTE, TON..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {categories.map((category) => (
          <PaletteGroup key={category} icon={Gauge} title={category}>
            {LADDER_ELEMENTS.filter((e) => e.category === category).map((element) => (
              <LadderPaletteItem key={element.id} element={element} />
            ))}
          </PaletteGroup>
        ))}
      </div>
    </SidebarShell>
  );
}

function LadderPaletteItem({ element }: { element: LadderElement }) {
  return (
    <button
      draggable
      title={element.description}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/ladder-element", element.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] text-foreground/85 hover:bg-accent hover:text-foreground border border-transparent hover:border-border transition-all cursor-grab active:cursor-grabbing"
    >
      <span className="w-14 shrink-0 font-mono text-[10px] text-primary">{element.symbol}</span>
      <span className="truncate">{element.label}</span>
    </button>
  );
}
