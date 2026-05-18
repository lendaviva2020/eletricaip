import { Gauge } from "lucide-react";
import { PaletteGroup, SidebarSearch, SidebarShell } from "./sidebar-primitives";
import { BLOCK_DEFINITIONS } from "@/lib/fbd/types";

const GROUPS = [
  { category: "Lógica", icon: Gauge },
  { category: "Memória", icon: Gauge },
  { category: "Temporizador", icon: Gauge },
  { category: "Contador", icon: Gauge },
  { category: "Matemática", icon: Gauge },
  { category: "Comparação", icon: Gauge },
  { category: "Movimentação", icon: Gauge },
  { category: "Seleção", icon: Gauge },
] as const;

export function EditorFbdSidebar() {
  const blocksByCategory = new Map<string, typeof BLOCK_DEFINITIONS>();
  for (const def of BLOCK_DEFINITIONS) {
    const list = blocksByCategory.get(def.category) ?? [];
    list.push(def);
    blocksByCategory.set(def.category, list);
  }

  return (
    <SidebarShell>
      <SidebarSearch title="Blocos FBD" placeholder="AND, OR, TON..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {GROUPS.map((group) => {
          const items = blocksByCategory.get(group.category);
          if (!items || items.length === 0) return null;
          return (
            <PaletteGroup key={group.category} icon={group.icon} title={group.category}>
              {items.map((def) => (
                <button
                  key={def.kind}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/fbd-block", def.kind);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  title={def.description}
                  className="flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] hover:bg-accent border border-transparent hover:border-border cursor-grab active:cursor-grabbing"
                >
                  <span className="w-12 shrink-0 font-mono text-[10px] text-primary">
                    {def.kind}
                  </span>
                  <span className="truncate flex-1">{def.label}</span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">
                    {def.inputs.length}&rarr;{def.outputs.length}
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
