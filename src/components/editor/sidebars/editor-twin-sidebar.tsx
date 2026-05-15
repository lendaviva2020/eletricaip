import { Upload } from "lucide-react";
import { SidebarSearch, SidebarShell } from "./sidebar-primitives";

export function EditorTwinSidebar() {
  return (
    <SidebarShell>
      <SidebarSearch title="Digital Twin" placeholder="Buscar tag..." />
      <div className="px-3 pb-3 space-y-3 overflow-auto scrollbar-thin">
        <button className="w-full h-9 rounded border border-border bg-card/60 hover:bg-accent flex items-center justify-center gap-2 text-[11px]">
          <Upload className="h-3.5 w-3.5" /> Importar GLB / GLTF
        </button>
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Tags vinculadas
        </div>
        <div className="text-[11px] text-muted-foreground italic">
          Nenhum sensor vinculado ainda.
        </div>
      </div>
    </SidebarShell>
  );
}
